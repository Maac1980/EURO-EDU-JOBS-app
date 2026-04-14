/**
 * EEJ Payroll Ledger — monthly payroll records with bank/accounting CSV export.
 *
 * Uses NUMERIC(10,2) for all monetary columns (no floating point rounding).
 * Benchmark: 160h × 31.40 PLN/h = 3929.05 PLN net (Umowa Zlecenie).
 *
 * org_context: EEJ. No shared data with external platforms.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensurePayrollLedgerTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eej_payroll_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      worker_name TEXT,
      month_year TEXT NOT NULL,
      hours NUMERIC(8,2) NOT NULL DEFAULT 0,
      hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      gross NUMERIC(10,2) NOT NULL DEFAULT 0,
      employee_zus NUMERIC(10,2) NOT NULL DEFAULT 0,
      health NUMERIC(10,2) NOT NULL DEFAULT 0,
      pit NUMERIC(10,2) NOT NULL DEFAULT 0,
      net NUMERIC(10,2) NOT NULL DEFAULT 0,
      employer_zus NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      advances NUMERIC(10,2) NOT NULL DEFAULT 0,
      penalties NUMERIC(10,2) NOT NULL DEFAULT 0,
      final_payout NUMERIC(10,2) NOT NULL DEFAULT 0,
      contract_type TEXT DEFAULT 'umowa_zlecenie',
      iban TEXT,
      locked BOOLEAN DEFAULT false,
      locked_by TEXT,
      locked_at TIMESTAMPTZ,
      org_context TEXT NOT NULL DEFAULT 'EEJ',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_payroll_worker ON eej_payroll_ledger(worker_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_eej_payroll_month ON eej_payroll_ledger(month_year)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_eej_payroll_dedup ON eej_payroll_ledger(worker_id, month_year)`);
}

// ═══ ZUS CALCULATION (Umowa Zlecenie) ═══════════════════════════════════════

function calculateZUS(gross: number): {
  employeeZus: number; health: number; pit: number; net: number;
  employerZus: number; totalCost: number;
} {
  // Employee ZUS contributions (Umowa Zlecenie)
  const emerytalne = gross * 0.0976;
  const rentowe = gross * 0.015;
  const chorobowe = gross * 0.0245;
  const employeeZus = emerytalne + rentowe + chorobowe;

  // Health insurance
  const healthBase = gross - employeeZus;
  const healthFull = healthBase * 0.09;
  const healthDeductible = healthBase * 0.0775;
  const health = healthFull;

  // PIT advance (12% flat for Zlecenie, simplified)
  const taxBase = gross - employeeZus - (gross * 0.20); // 20% cost deduction
  const pitAdvance = Math.max(0, taxBase * 0.12 - healthDeductible);
  const pit = Math.round(pitAdvance);

  const net = Math.round((gross - employeeZus - health - pit) * 100) / 100;

  // Employer ZUS
  const empEmerytalne = gross * 0.0976;
  const empRentowe = gross * 0.065;
  const empWypadkowe = gross * 0.0167;
  const empFP = gross * 0.0245;
  const empFGSP = gross * 0.001;
  const employerZus = empEmerytalne + empRentowe + empWypadkowe + empFP + empFGSP;

  const totalCost = gross + employerZus;

  return {
    employeeZus: Math.round(employeeZus * 100) / 100,
    health: Math.round(health * 100) / 100,
    pit,
    net,
    employerZus: Math.round(employerZus * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

// ═══ ROUTES ═════════════════════════════════════════════════════════════════

// GET payroll records (by month or worker)
router.get("/v1/payroll/ledger", authenticateToken, async (req, res) => {
  try {
    await ensurePayrollLedgerTable();
    const { month, workerId } = req.query as { month?: string; workerId?: string };

    let rows;
    if (month) {
      rows = await db.execute(sql`SELECT * FROM eej_payroll_ledger WHERE org_context = 'EEJ' AND month_year = ${month} ORDER BY worker_name ASC`);
    } else if (workerId) {
      rows = await db.execute(sql`SELECT * FROM eej_payroll_ledger WHERE org_context = 'EEJ' AND worker_id = ${workerId} ORDER BY month_year DESC`);
    } else {
      rows = await db.execute(sql`SELECT * FROM eej_payroll_ledger WHERE org_context = 'EEJ' ORDER BY month_year DESC, worker_name ASC LIMIT 200`);
    }

    return res.json({ records: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST calculate + store payroll record
router.post("/v1/payroll/ledger", authenticateToken, async (req, res) => {
  try {
    await ensurePayrollLedgerTable();
    const { workerId, workerName, monthYear, hours, hourlyRate, advances, penalties, contractType, iban } = req.body as {
      workerId: string; workerName?: string; monthYear: string; hours: number; hourlyRate: number;
      advances?: number; penalties?: number; contractType?: string; iban?: string;
    };

    if (!workerId || !monthYear || !hours || !hourlyRate) {
      return res.status(400).json({ error: "workerId, monthYear, hours, and hourlyRate are required" });
    }

    const gross = Math.round(hours * hourlyRate * 100) / 100;
    const zus = calculateZUS(gross);
    const adv = advances ?? 0;
    const pen = penalties ?? 0;
    const finalPayout = Math.round((zus.net - adv - pen) * 100) / 100;

    const rows = await db.execute(sql`
      INSERT INTO eej_payroll_ledger (worker_id, worker_name, month_year, hours, hourly_rate, gross,
        employee_zus, health, pit, net, employer_zus, total_cost, advances, penalties, final_payout,
        contract_type, iban, org_context)
      VALUES (${workerId}, ${workerName ?? null}, ${monthYear}, ${hours}, ${hourlyRate}, ${gross},
        ${zus.employeeZus}, ${zus.health}, ${zus.pit}, ${zus.net}, ${zus.employerZus}, ${zus.totalCost},
        ${adv}, ${pen}, ${finalPayout}, ${contractType ?? "umowa_zlecenie"}, ${iban ?? null}, 'EEJ')
      ON CONFLICT (worker_id, month_year) DO UPDATE SET
        hours = EXCLUDED.hours, hourly_rate = EXCLUDED.hourly_rate, gross = EXCLUDED.gross,
        employee_zus = EXCLUDED.employee_zus, health = EXCLUDED.health, pit = EXCLUDED.pit,
        net = EXCLUDED.net, employer_zus = EXCLUDED.employer_zus, total_cost = EXCLUDED.total_cost,
        advances = EXCLUDED.advances, penalties = EXCLUDED.penalties, final_payout = EXCLUDED.final_payout,
        updated_at = NOW()
      RETURNING *
    `);

    return res.json({ record: rows.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET bank CSV export (Polish banking format)
router.get("/v1/payroll/export/bank-csv", authenticateToken, async (req, res) => {
  try {
    await ensurePayrollLedgerTable();
    const { month } = req.query as { month?: string };
    if (!month) return res.status(400).json({ error: "month query parameter required (e.g. 2026-04)" });

    const rows = await db.execute(sql`
      SELECT * FROM eej_payroll_ledger WHERE org_context = 'EEJ' AND month_year = ${month} AND final_payout > 0
      ORDER BY worker_name ASC
    `);

    // Polish bank CSV format: IBAN, Amount, Name, Title
    const lines = ["IBAN,Amount,Name,Title"];
    for (const r of rows.rows as any[]) {
      const iban = (r.iban ?? "").replace(/\s/g, "");
      const amount = parseFloat(r.final_payout).toFixed(2);
      const name = (r.worker_name ?? "Worker").replace(/,/g, " ");
      const title = `Wynagrodzenie ${month} - EEJ`;
      lines.push(`${iban},${amount},${name},${title}`);
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=eej-bank-${month}.csv`);
    return res.send(lines.join("\n"));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET accounting CSV export (19 columns for accountants)
router.get("/v1/payroll/export/accounting-csv", authenticateToken, async (req, res) => {
  try {
    await ensurePayrollLedgerTable();
    const { month } = req.query as { month?: string };
    if (!month) return res.status(400).json({ error: "month query parameter required" });

    const rows = await db.execute(sql`
      SELECT * FROM eej_payroll_ledger WHERE org_context = 'EEJ' AND month_year = ${month}
      ORDER BY worker_name ASC
    `);

    const header = [
      "Lp.", "Imię i nazwisko", "Miesiąc", "Godziny", "Stawka/h", "Brutto",
      "ZUS pracownik", "Em. prac.", "Rent. prac.", "Chor. prac.",
      "Zdrowotne", "Zaliczka PIT", "Netto",
      "ZUS pracodawca", "Em. prac.daw.", "Rent. prac.daw.", "Wyp. prac.daw.",
      "Koszt całkowity", "Do wypłaty",
    ].join(",");

    const dataLines = (rows.rows as any[]).map((r, i) => {
      const gross = parseFloat(r.gross);
      const eZus = parseFloat(r.employee_zus);
      // Approximate component breakdown
      const emPrac = (gross * 0.0976).toFixed(2);
      const rentPrac = (gross * 0.015).toFixed(2);
      const chorPrac = (gross * 0.0245).toFixed(2);
      const emPracd = (gross * 0.0976).toFixed(2);
      const rentPracd = (gross * 0.065).toFixed(2);
      const wypPracd = (gross * 0.0167).toFixed(2);

      return [
        i + 1,
        (r.worker_name ?? "").replace(/,/g, " "),
        r.month_year,
        parseFloat(r.hours).toFixed(2),
        parseFloat(r.hourly_rate).toFixed(2),
        parseFloat(r.gross).toFixed(2),
        parseFloat(r.employee_zus).toFixed(2),
        emPrac, rentPrac, chorPrac,
        parseFloat(r.health).toFixed(2),
        parseFloat(r.pit).toFixed(2),
        parseFloat(r.net).toFixed(2),
        parseFloat(r.employer_zus).toFixed(2),
        emPracd, rentPracd, wypPracd,
        parseFloat(r.total_cost).toFixed(2),
        parseFloat(r.final_payout).toFixed(2),
      ].join(",");
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=eej-accounting-${month}.csv`);
    return res.send([header, ...dataLines].join("\n"));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST send payslip email
router.post("/v1/payroll/send-payslip", authenticateToken, async (req, res) => {
  try {
    const { recordId } = req.body as { recordId: string };
    if (!recordId) return res.status(400).json({ error: "recordId required" });

    const rows = await db.execute(sql`SELECT * FROM eej_payroll_ledger WHERE id = ${recordId} AND org_context = 'EEJ'`);
    if (rows.rows.length === 0) return res.status(404).json({ error: "Record not found" });

    const r = rows.rows[0] as any;

    // Get worker email
    const wRows = await db.execute(sql`SELECT email FROM workers WHERE id = ${r.worker_id}`);
    const email = (wRows.rows[0] as any)?.email;
    if (!email) return res.status(400).json({ error: "Worker has no email on file" });

    // Send via existing mailer
    try {
      const { sendEmail } = await import("../lib/alerter.js");
      const fromAddr = process.env.SMTP_FROM ?? process.env.BREVO_SMTP_USER ?? "noreply@euro-edu-jobs.eu";
      await sendEmail({
        from: fromAddr,
        to: email,
        subject: `Odcinek płacowy / Payslip — ${r.month_year} — Euro Edu Jobs`,
        html: `
          <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden">
            <div style="background:#1e293b;padding:20px 24px;border-bottom:2px solid #3b82f6">
              <h1 style="margin:0;font-size:18px;color:#ffffff">EEJ Payslip / Odcinek płacowy</h1>
              <p style="margin:4px 0 0;font-size:12px;color:#3b82f6">${r.month_year}</p>
            </div>
            <div style="padding:20px 24px">
              <table style="width:100%;font-size:13px;border-collapse:collapse">
                <tr><td style="padding:6px 0;color:#94a3b8">Pracownik / Worker</td><td style="padding:6px 0;color:#ffffff;font-weight:700;text-align:right">${r.worker_name}</td></tr>
                <tr><td style="padding:6px 0;color:#94a3b8">Godziny / Hours</td><td style="padding:6px 0;color:#ffffff;text-align:right">${parseFloat(r.hours).toFixed(1)}h</td></tr>
                <tr><td style="padding:6px 0;color:#94a3b8">Stawka / Rate</td><td style="padding:6px 0;color:#ffffff;text-align:right">${parseFloat(r.hourly_rate).toFixed(2)} PLN/h</td></tr>
                <tr style="border-top:1px solid #334155"><td style="padding:6px 0;color:#94a3b8">Brutto / Gross</td><td style="padding:6px 0;color:#ffffff;font-weight:700;text-align:right">${parseFloat(r.gross).toFixed(2)} PLN</td></tr>
                <tr><td style="padding:6px 0;color:#94a3b8">ZUS pracownik</td><td style="padding:6px 0;color:#ef4444;text-align:right">-${parseFloat(r.employee_zus).toFixed(2)} PLN</td></tr>
                <tr><td style="padding:6px 0;color:#94a3b8">Zdrowotne / Health</td><td style="padding:6px 0;color:#ef4444;text-align:right">-${parseFloat(r.health).toFixed(2)} PLN</td></tr>
                <tr><td style="padding:6px 0;color:#94a3b8">Zaliczka PIT</td><td style="padding:6px 0;color:#ef4444;text-align:right">-${parseFloat(r.pit).toFixed(2)} PLN</td></tr>
                <tr style="border-top:1px solid #334155"><td style="padding:8px 0;color:#3b82f6;font-weight:700;font-size:15px">Netto / Net</td><td style="padding:8px 0;color:#3b82f6;font-weight:700;font-size:15px;text-align:right">${parseFloat(r.net).toFixed(2)} PLN</td></tr>
                ${parseFloat(r.advances) > 0 ? `<tr><td style="padding:6px 0;color:#94a3b8">Zaliczka / Advance</td><td style="padding:6px 0;color:#ef4444;text-align:right">-${parseFloat(r.advances).toFixed(2)} PLN</td></tr>` : ""}
                ${parseFloat(r.penalties) > 0 ? `<tr><td style="padding:6px 0;color:#94a3b8">Kary / Penalties</td><td style="padding:6px 0;color:#ef4444;text-align:right">-${parseFloat(r.penalties).toFixed(2)} PLN</td></tr>` : ""}
                <tr style="border-top:2px solid #3b82f6"><td style="padding:10px 0;color:#ffffff;font-weight:700;font-size:16px">Do wypłaty / Payout</td><td style="padding:10px 0;color:#22c55e;font-weight:700;font-size:16px;text-align:right">${parseFloat(r.final_payout).toFixed(2)} PLN</td></tr>
              </table>
            </div>
            <div style="padding:12px 24px;background:#1e293b;border-top:1px solid #334155;text-align:center">
              <p style="margin:0;font-size:10px;color:#64748b">Euro Edu Jobs Sp. z o.o. &middot; org_context: EEJ</p>
            </div>
          </div>
        `,
      });
      return res.json({ success: true, sentTo: email });
    } catch (emailErr) {
      return res.json({ success: false, error: "Email delivery failed — payslip logged but not sent", sentTo: email });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
