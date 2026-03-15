import { Router } from "express";
import jwt from "jsonwebtoken";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { fetchAllRecords, updateRecord } from "../lib/airtable.js";
import { mapRecordToWorker } from "../lib/compliance.js";
import { appendAuditEntry } from "./audit.js";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PAYROLL_FILE = join(__dirname, "../../data/payroll-records.json");
const JWT_SECRET = process.env.JWT_SECRET ?? "eej-jwt-fallback-secret-2024";

function requireAdmin(req: any, res: any): boolean {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return false; }
  try { jwt.verify(authHeader.slice(7), JWT_SECRET); return true; }
  catch { res.status(401).json({ error: "Invalid token" }); return false; }
}

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
router.get("/payroll/workers", async (req, res) => {
  if (!requireAdmin(req, res)) return;
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
    }));
    return res.json({ workers });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load workers" });
  }
});

// ── PATCH /api/payroll/workers/batch ─────────────────────────────────────────
// Batch-update totalHours / advancePayment / penalties for multiple workers
router.patch("/payroll/workers/batch", async (req, res) => {
  if (!requireAdmin(req, res)) return;
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
      if (Object.keys(fields).length > 0) await updateRecord(u.workerId, fields);
    }));

    return res.json({ success: true, updated: updates.length });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Batch update failed" });
  }
});

// ── POST /api/payroll/close-month ─────────────────────────────────────────────
// Commits the payroll snapshot to the ledger and resets worker fields to 0
router.post("/payroll/close-month", async (req, res) => {
  if (!requireAdmin(req, res)) return;
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

      // Reset worker fields to 0 in Airtable
      await updateRecord(w.id, {
        "TOTAL HOURS": 0,
        "ADVANCE PAYMENT": 0,
        "PENALTIES": 0,
      });
    }));

    // Save all new records
    writePayrollRecords([...existing, ...newRecords]);

    appendAuditEntry({
      workerId: "ALL",
      actor: "admin",
      field: "PAYROLL",
      newValue: { monthYear, recordsCreated: newRecords.length },
      action: "close-month",
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
router.get("/payroll/history/:workerId", async (req, res) => {
  if (!requireAdmin(req, res)) return;
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
router.get("/payroll/summary", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const all = readPayrollRecords();
    return res.json({ records: all });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load summary" });
  }
});

export default router;
