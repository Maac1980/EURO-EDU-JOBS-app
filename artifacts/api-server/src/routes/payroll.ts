import { Router } from "express";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import PDFDocument from "pdfkit";
import { fetchAllRecords, updateRecord, fetchRecord } from "../lib/airtable.js";
import { mapRecordToWorker } from "../lib/compliance.js";
import { appendAuditEntry } from "./audit.js";
import { authenticateToken, requireAdmin, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { sendPayslipEmail } from "../lib/alerter.js";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PAYROLL_FILE = join(__dirname, "../../data/payroll-records.json");

export interface PayrollRecord {
  id: string;
  workerId: string;
  workerName: string;
  monthYear: string;
  totalHours: number;
  hourlyRate: number;
  advancesDeducted: number;
  penaltiesDeducted: number;
  grossPay: number;
  finalNettoPayout: number;
  zusBaseSalary: number;
  siteLocation: string;
  createdAt: string;
}

function readPayrollRecords(): PayrollRecord[] {
  if (!existsSync(PAYROLL_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(PAYROLL_FILE, "utf-8"));
    return Array.isArray(raw.records) ? raw.records : [];
  } catch { return []; }
}

function writePayrollRecords(records: PayrollRecord[]): void {
  mkdirSync(join(__dirname, "../../data"), { recursive: true });
  writeFileSync(PAYROLL_FILE, JSON.stringify({ records }, null, 2), "utf-8");
}

// ── GET /api/payroll/workers ─────────────────────────────────────────────────
// Returns all workers with their payroll-relevant fields
router.get("/payroll/workers", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker).map((w) => ({
      id: w.id,
      name: w.name,
      specialization: (w as any).specialization ?? null,
      siteLocation: (w as any).siteLocation ?? null,
      hourlyNettoRate: (w as any).hourlyNettoRate ?? 0,
      totalHours: (w as any).totalHours ?? 0,
      advancePayment: (w as any).advancePayment ?? 0,
      penalties: (w as any).penalties ?? 0,
      iban: (w as any).iban ?? null,
    }));
    return res.json({ workers });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load workers" });
  }
});

// ── PATCH /api/payroll/workers/:id/iban ──────────────────────────────────────
// Update the IBAN bank account number for a single worker
router.patch("/payroll/workers/:id/iban", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { iban } = req.body as { iban?: string };
    if (iban === undefined) return res.status(400).json({ error: "iban field required" });
    await updateRecord(id, { IBAN: iban.trim() });
    return res.json({ success: true, iban: iban.trim() });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "IBAN update failed" });
  }
});

// ── PATCH /api/payroll/workers/batch ─────────────────────────────────────────
// Batch-update totalHours / advancePayment / penalties for multiple workers
const ZUS_RATE = 0.1126; // Emerytalne 9.76% + Rentowe 1.5%

router.patch("/payroll/workers/batch", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const updates = req.body.updates as Array<{
      workerId: string;
      totalHours?: number;
      advancePayment?: number;
      penalties?: number;
    }>;
    if (!Array.isArray(updates)) return res.status(400).json({ error: "updates must be an array" });

    await Promise.all(updates.map(async (u) => {
      const fields: Record<string, unknown> = {};
      if (u.totalHours !== undefined) fields["TOTAL HOURS"] = u.totalHours;
      if (u.advancePayment !== undefined) fields["ADVANCE PAYMENT"] = u.advancePayment;
      if (u.penalties !== undefined) fields["PENALTIES"] = u.penalties;
      if ((u as any).hourlyNettoRate !== undefined) fields["HOURLY NETTO RATE"] = (u as any).hourlyNettoRate;
      if ((u as any).siteLocation !== undefined) fields["Assigned Site"] = (u as any).siteLocation;
      if (Object.keys(fields).length > 0) await updateRecord(u.workerId, fields);
    }));

    return res.json({ success: true, updated: updates.length });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Batch update failed" });
  }
});

// ── POST /api/payroll/close-month ─────────────────────────────────────────────
// Commits the payroll snapshot to the ledger and resets worker fields to 0
router.post("/payroll/close-month", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { monthYear } = req.body as { monthYear?: string };
    if (!monthYear) return res.status(400).json({ error: "monthYear is required (e.g. 2026-03)" });

    // Check for duplicate month close
    const existing = readPayrollRecords();
    if (existing.some((r) => r.monthYear === monthYear)) {
      return res.status(409).json({ error: `Month ${monthYear} has already been closed. Use a different month or delete existing records first.` });
    }

    // Read all workers fresh from Airtable
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker);

    const newRecords: PayrollRecord[] = [];

    await Promise.all(workers.map(async (w) => {
      const totalHours = (w as any).totalHours ?? 0;
      const hourlyRate = (w as any).hourlyNettoRate ?? 0;
      const advancesDeducted = (w as any).advancePayment ?? 0;
      const penaltiesDeducted = (w as any).penalties ?? 0;
      const grossPay = totalHours * hourlyRate;
      const finalNettoPayout = grossPay - advancesDeducted - penaltiesDeducted;
      // ZUS base: gross pay (before deductions) as the social security contribution base
      const zusBaseSalary = grossPay;

      const record: PayrollRecord = {
        id: randomUUID(),
        workerId: w.id,
        workerName: w.name,
        monthYear,
        totalHours,
        hourlyRate,
        advancesDeducted,
        penaltiesDeducted,
        grossPay,
        finalNettoPayout,
        zusBaseSalary,
        siteLocation: (w as any).siteLocation ?? "",
        createdAt: new Date().toISOString(),
      };
      newRecords.push(record);
      // Store email alongside record for payslip delivery (not persisted)
      (record as any).__email = w.email ?? null;

      // Reset worker fields to 0 in Airtable
      await updateRecord(w.id, {
        "TOTAL HOURS": 0,
        "ADVANCE PAYMENT": 0,
        "PENALTIES": 0,
      });
    }));

    // Save all new records (strip temporary __email before persisting)
    writePayrollRecords([...existing, ...newRecords.map((r) => { const clean = { ...r }; delete (clean as any).__email; return clean; })]);

    // Fire payslip emails in the background — do not block the HTTP response
    Promise.allSettled(
      newRecords
        .filter((r) => (r as any).__email)
        .map(async (r) => {
          try {
            const pdf = await buildPayslipBuffer(r);
            await sendPayslipEmail((r as any).__email as string, r.workerName, monthYear, pdf, {
              totalHours: r.totalHours, hourlyRate: r.hourlyRate, grossPay: r.grossPay,
              advancesDeducted: r.advancesDeducted, penaltiesDeducted: r.penaltiesDeducted,
              zusDeducted: (r as any).zusDeducted ?? 0, finalNettoPayout: r.finalNettoPayout,
              siteLocation: r.siteLocation,
            });
            console.log(`[payroll] payslip emailed → ${(r as any).__email}`);
          } catch (mailErr) {
            console.warn(`[payroll] payslip email failed for ${r.workerName}:`, mailErr instanceof Error ? mailErr.message : mailErr);
          }
        })
    );

    appendAuditEntry({
      workerId: "ALL",
      actor: "admin",
      field: "PAYROLL",
      newValue: { monthYear, recordsCreated: newRecords.length, totalPayout: newRecords.reduce((s, r) => s + r.finalNettoPayout, 0) },
      action: "PAYROLL_COMMIT",
    });

    return res.json({
      success: true,
      monthYear,
      recordsCreated: newRecords.length,
      totalPayout: newRecords.reduce((s, r) => s + r.finalNettoPayout, 0),
    });
  } catch (err) {
    console.error("[payroll] close-month error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Close month failed" });
  }
});

// ── GET /api/payroll/history/:workerId ────────────────────────────────────────
// Returns all ledger records for a specific worker
router.get("/payroll/history/:workerId", authenticateToken, async (req, res) => {
  try {
    const { workerId } = req.params;
    const all = readPayrollRecords();
    const history = all
      .filter((r) => r.workerId === workerId)
      .sort((a, b) => b.monthYear.localeCompare(a.monthYear));
    return res.json({ history });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load history" });
  }
});

// ── GET /api/payroll/summary ──────────────────────────────────────────────────
// Returns all records (for admin overview / cross-worker analytics)
router.get("/payroll/summary", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const all = readPayrollRecords();
    return res.json({ records: all });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load summary" });
  }
});

// ── PATCH /api/payroll/records/:id ────────────────────────────────────────────
// Edit a closed payroll record (hours, hourlyRate, advancesDeducted, siteLocation)
router.patch("/payroll/records/:id", authenticateToken, requireCoordinatorOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { totalHours, hourlyRate, advancesDeducted, siteLocation } = req.body as Partial<PayrollRecord>;
    const all = readPayrollRecords();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return res.status(404).json({ error: "Record not found" });

    const rec = { ...all[idx] };
    if (totalHours !== undefined) rec.totalHours = totalHours;
    if (hourlyRate !== undefined) rec.hourlyRate = hourlyRate;
    if (advancesDeducted !== undefined) rec.advancesDeducted = advancesDeducted;
    if (siteLocation !== undefined) rec.siteLocation = siteLocation;

    // Recalculate derived fields
    rec.grossPay = rec.totalHours * rec.hourlyRate;
    rec.zusBaseSalary = rec.grossPay * ZUS_RATE;
    rec.finalNettoPayout = rec.grossPay - rec.zusBaseSalary - rec.advancesDeducted - (rec.penaltiesDeducted ?? 0);

    all[idx] = rec;
    writePayrollRecords(all);
    return res.json({ success: true, record: rec });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Record update failed" });
  }
});

// ── Shared helper: build a payslip PDF and return it as a Buffer ──────────────
function buildPayslipBuffer(record: PayrollRecord): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const LIME = "#E9FF70";
    const DARK = "#333333";
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 40;
    const doc = new PDFDocument({ margin: 0, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header bar
    doc.rect(0, 0, PAGE_W, 70).fill(DARK);
    doc.rect(0, 68, PAGE_W, 3).fill(LIME);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(LIME).text("EURO EDU JOBS", MARGIN, 20);
    doc.font("Helvetica").fontSize(9).fillColor("#aaaaaa").text("Odcinek Wypłaty / Payslip", MARGIN, 46);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(LIME).text(record.monthYear, PAGE_W - 130, 28, { width: 90, align: "right" });

    // Worker name section
    doc.rect(MARGIN, 90, PAGE_W - MARGIN * 2, 52).fill("#f8f8f8").stroke("#e0e0e0");
    doc.font("Helvetica-Bold").fontSize(16).fillColor(DARK).text(record.workerName, MARGIN + 14, 100);
    doc.font("Helvetica").fontSize(10).fillColor("#666").text(`Lokacja: ${record.siteLocation || "—"}`, MARGIN + 14, 120);

    // Table rows
    const rows: [string, string][] = [
      ["Godziny przepracowane", `${record.totalHours.toFixed(1)} h`],
      ["Stawka godzinowa (netto)", `${record.hourlyRate.toFixed(2)} zł`],
      ["Wynagrodzenie brutto", `${record.grossPay.toFixed(2)} zł`],
      ["Zaliczki potrącone", `- ${record.advancesDeducted.toFixed(2)} zł`],
      ["Kary potrącone", `- ${record.penaltiesDeducted.toFixed(2)} zł`],
    ];

    let y = 164;
    rows.forEach(([label, value], i) => {
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 30).fill(i % 2 === 0 ? "#ffffff" : "#f9f9f9").stroke("#eeeeee");
      doc.font("Helvetica").fontSize(11).fillColor(DARK).text(label, MARGIN + 14, y + 9);
      doc.font("Helvetica").fontSize(11).fillColor(DARK).text(value, PAGE_W - MARGIN - 100, y + 9, { width: 90, align: "right" });
      y += 30;
    });

    // Final payout row
    y += 6;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 40).fill(DARK);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(LIME).text("DO WYPŁATY NETTO", MARGIN + 14, y + 12);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(LIME)
      .text(`${record.finalNettoPayout.toFixed(2)} zł`, PAGE_W - MARGIN - 110, y + 10, { width: 100, align: "right" });

    // Footer
    const footerY = PAGE_H - 40;
    doc.rect(0, footerY, PAGE_W, 40).fill(DARK);
    doc.rect(0, footerY, PAGE_W, 2).fill(LIME);
    doc.font("Helvetica").fontSize(8).fillColor("#aaaaaa")
      .text(`EURO EDU JOBS — Wygenerowano: ${new Date().toLocaleDateString("pl-PL")}`, MARGIN, footerY + 14);
    doc.font("Helvetica").fontSize(8).fillColor("#aaaaaa")
      .text("edu-jobs.eu", PAGE_W - MARGIN - 60, footerY + 14, { width: 60, align: "right" });

    doc.end();
  });
}

// ── GET /api/payroll/payslip/:workerId/:monthYear ─────────────────────────────
// Generates and streams a PDF payslip for a given worker and month
router.get("/payroll/payslip/:workerId/:monthYear", authenticateToken, async (req, res) => {
  try {
    const { workerId, monthYear } = req.params;
    const all = readPayrollRecords();
    const record = all.find((r) => r.workerId === workerId && r.monthYear === monthYear);
    if (!record) return res.status(404).json({ error: "Payroll record not found for that worker and month." });

    const pdfBuffer = await buildPayslipBuffer(record);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Payslip_${record.workerName.replace(/\s+/g, "_")}_${monthYear}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate payslip." });
    return;
  }
});

// ── GET /api/payroll/bank-export?monthYear=YYYY-MM ────────────────────────────
// CSV for Polish bank bulk transfer upload (IBAN, name, amount, title)
router.get("/payroll/bank-export", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { monthYear } = req.query as { monthYear?: string };
    if (!monthYear) return res.status(400).json({ error: "monthYear query param required (e.g. 2026-03)" });

    const all = readPayrollRecords();
    const records = all.filter((r) => r.monthYear === monthYear);
    if (records.length === 0) return res.status(404).json({ error: `No payroll records found for ${monthYear}` });

    // Fetch IBANs from Airtable for the workers
    const workerRecords = await fetchAllRecords();
    const workerMap = new Map(workerRecords.map(mapRecordToWorker).map((w) => [w.id, (w as any).iban ?? ""]));

    const BOM = "\uFEFF";
    const header = "Numer konta (IBAN);Nazwa odbiorcy;Kwota (PLN);Tytuł przelewu";
    const lines = records.map((r) => {
      const iban = (workerMap.get(r.workerId) ?? "").replace(/\s/g, "");
      const amount = r.finalNettoPayout.toFixed(2).replace(".", ",");
      const title = `Wynagrodzenie ${r.monthYear} - ${r.workerName}`;
      return `${iban};${r.workerName};${amount};${title}`;
    });

    const csv = BOM + [header, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="EEJ_Przelewy_${monthYear}.csv"`);
    return res.end(csv);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Export failed" });
  }
});

// ── GET /api/payroll/trend ───────────────────────────────────────────────────
// Returns monthly totals for the last N months (default 6) for trend chart
router.get("/payroll/trend", authenticateToken, requireCoordinatorOrAdmin, (req, res) => {
  try {
    const months = Math.min(parseInt(String(req.query.months ?? "6"), 10), 24);
    const all = readPayrollRecords();
    const grouped: Record<string, { totalGross: number; totalNetto: number; count: number }> = {};
    for (const r of all) {
      if (!grouped[r.monthYear]) grouped[r.monthYear] = { totalGross: 0, totalNetto: 0, count: 0 };
      grouped[r.monthYear].totalGross += r.grossPay;
      grouped[r.monthYear].totalNetto += r.finalNettoPayout;
      grouped[r.monthYear].count += 1;
    }
    const sorted = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-months)
      .map(([monthYear, v]) => ({ monthYear, ...v }));
    res.json({ trend: sorted });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Trend failed" });
  }
});

export default router;
