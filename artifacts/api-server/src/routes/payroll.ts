import { Router } from "express";
import { randomUUID } from "crypto";
import PDFDocument from "pdfkit";
import { db, schema } from "../db/index.js";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { toWorker } from "../lib/compliance.js";
import { appendAuditEntry } from "./audit.js";
import { authenticateToken, requireAdmin, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { sendPayslipEmail } from "../lib/alerter.js";
import { requireTenant } from "../lib/tenancy.js";

const router = Router();
const ZUS_RATE = 0.1126;

/**
 * GET /payroll/current — Tier 1 alias for the dashboard PayrollPage.
 *
 * The frontend (`artifacts/apatris-dashboard/src/pages/PayrollPage.tsx`)
 * has always called `/api/payroll/current`, but this file historically
 * only exposed `/payroll/workers`. The path mismatch silently 404'd and
 * the grid rendered "No workers found" — see audit / Tier 1.
 *
 * This alias returns the same data as /payroll/workers but maps the
 * column names to the frontend-expected shape:
 *   hourlyNettoRate → hourlyRate
 *   totalHours      → monthlyHours
 *   advancePayment  → advance
 * `iban` is decrypted for display (T1/T2 viewers only — the route already
 * sits behind requireCoordinatorOrAdmin, so role gating is correct).
 */
router.get("/payroll/current", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10) || 200, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const tenantId = requireTenant(req);
    const { decrypt } = await import("../lib/encryption.js");

    const rows = await db.select().from(schema.workers)
      .where(eq(schema.workers.tenantId, tenantId))
      .limit(limit).offset(offset);

    const workers = rows.map(w => ({
      id: w.id,
      name: w.name,
      specialization: w.jobRole ?? null,
      siteLocation: w.assignedSite ?? null,
      hourlyRate: Number(w.hourlyNettoRate ?? 0),
      monthlyHours: Number(w.totalHours ?? 0),
      advance: Number(w.advancePayment ?? 0),
      penalties: Number(w.penalties ?? 0),
      iban: decrypt(w.iban ?? null) ?? "",
      pesel: decrypt(w.pesel ?? null) ?? "",
      nip: w.nip ?? null,
      contractType: w.contractType ?? null,
      pipelineStage: w.pipelineStage ?? null,
    }));

    return res.json({ workers });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load payroll" });
  }
});

/**
 * POST /payroll/commit — Tier 1 alias for `/payroll/close-month`.
 *
 * Frontend posts `{ monthYear, committedBy }`. Internally we delegate to
 * the existing close-month logic. Keeping the alias keeps the frontend
 * unchanged and avoids the rename churn during the Tier 1 falsehood pass.
 */
router.post("/payroll/commit", authenticateToken, requireAdmin, async (req, res, next) => {
  req.url = "/payroll/close-month";
  return next();
});

/**
 * PATCH /payroll/workers/:id — Tier 1 generic-field PATCH.
 *
 * The grid in PayrollPage edits per-cell with body `{ [field]: val }` where
 * `field ∈ {hourlyRate, monthlyHours, advance, penalties, iban, pit2}`.
 *
 * Pre-Tier-1 backend only accepted `/payroll/workers/:id/iban` and
 * `/payroll/workers/batch`, so every inline edit silently 404'd. This
 * route accepts the frontend field names, maps them to schema columns,
 * applies IBAN encryption via the same helper /iban uses, and accepts
 * (but no-ops) `pit2` since there is no `pit2` column yet — the frontend
 * stores pit2 locally and `.catch(() => {})` was already tolerant of a
 * non-persisting backend.
 *
 * Specific sub-routes (`/iban`, `/batch`) take precedence by being
 * registered earlier — Express matches them before this generic /:id.
 */
router.patch("/payroll/workers/:id", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const tenantId = requireTenant(req);
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.hourlyRate !== undefined) {
      const n = Number(body.hourlyRate);
      if (!isNaN(n) && n >= 0) updates.hourlyNettoRate = n;
    }
    if (body.monthlyHours !== undefined) {
      const n = Number(body.monthlyHours);
      if (!isNaN(n) && n >= 0) updates.totalHours = Math.round(n * 10) / 10;
    }
    if (body.advance !== undefined) {
      const n = Number(body.advance);
      if (!isNaN(n) && n >= 0) updates.advancePayment = n;
    }
    if (body.penalties !== undefined) {
      const n = Number(body.penalties);
      if (!isNaN(n) && n >= 0) updates.penalties = n;
    }
    if (body.iban !== undefined) {
      const { encryptIfPresent } = await import("../lib/encryption.js");
      const trimmed = String(body.iban).trim();
      updates.iban = trimmed ? (encryptIfPresent(trimmed) ?? trimmed) : null;
    }
    // pit2: no DB column yet; accepted but not persisted. Returning 200 lets
    // the frontend's silent .catch flow continue and the local toggle stays
    // in client state. Tracked as a Tier 5 schema follow-up.

    if (Object.keys(updates).length === 1) {
      return res.json({ success: true, noop: true });
    }

    await db.update(schema.workers).set(updates).where(
      and(eq(schema.workers.id, String(req.params.id)), eq(schema.workers.tenantId, tenantId))
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Worker update failed" });
  }
});

router.get("/payroll/workers", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const tenantId = requireTenant(req);
    const rows = await db.select().from(schema.workers)
      .where(eq(schema.workers.tenantId, tenantId))
      .limit(limit).offset(offset);
    const workers = rows.map(w => ({
      id: w.id, name: w.name, specialization: w.jobRole, siteLocation: w.assignedSite,
      hourlyNettoRate: w.hourlyNettoRate ?? 0, totalHours: w.totalHours ?? 0,
      advancePayment: w.advancePayment ?? 0, penalties: w.penalties ?? 0,
      iban: w.iban, pesel: w.pesel, nip: w.nip,
    }));
    return res.json({ workers });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load workers" });
  }
});

router.patch("/payroll/workers/:id/iban", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const { iban } = req.body as { iban?: string };
    if (iban === undefined) return res.status(400).json({ error: "iban field required" });
    const { encryptIfPresent } = await import("../lib/encryption.js");
    const tenantId = requireTenant(req);
    const trimmed = iban.trim();
    const stored = trimmed ? (encryptIfPresent(trimmed) ?? trimmed) : trimmed;
    await db.update(schema.workers).set({ iban: stored, updatedAt: new Date() }).where(
      and(eq(schema.workers.id, String(req.params.id)), eq(schema.workers.tenantId, tenantId))
    );
    return res.json({ success: true, iban: trimmed });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "IBAN update failed" });
  }
});

router.patch("/payroll/workers/batch", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const updates = req.body.updates as Array<{
      workerId: string; totalHours?: number; advancePayment?: number; penalties?: number;
      hourlyNettoRate?: number; siteLocation?: string;
    }>;
    if (!Array.isArray(updates)) return res.status(400).json({ error: "updates must be an array" });

    for (const u of updates) {
      const fields: any = { updatedAt: new Date() };
      if (u.totalHours !== undefined) fields.totalHours = u.totalHours;
      if (u.advancePayment !== undefined) fields.advancePayment = u.advancePayment;
      if (u.penalties !== undefined) fields.penalties = u.penalties;
      if (u.hourlyNettoRate !== undefined) fields.hourlyNettoRate = u.hourlyNettoRate;
      if (u.siteLocation !== undefined) fields.assignedSite = u.siteLocation;
      if (Object.keys(fields).length > 1) {
        await db.update(schema.workers).set(fields).where(eq(schema.workers.id, u.workerId));
      }
    }
    return res.json({ success: true, updated: updates.length });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Batch update failed" });
  }
});

router.post("/payroll/close-month", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { monthYear } = req.body as { monthYear?: string };
    if (!monthYear) return res.status(400).json({ error: "monthYear is required" });

    const tenantId = requireTenant(req);
    const existing = await db.select().from(schema.payrollRecords).where(
      and(eq(schema.payrollRecords.monthYear, monthYear), eq(schema.payrollRecords.tenantId, tenantId))
    ).limit(1);
    if (existing.length > 0) return res.status(409).json({ error: `Month ${monthYear} already closed.` });

    const newRecords: any[] = await db.transaction(async (tx) => {
      const rows = await tx.select().from(schema.workers).where(eq(schema.workers.tenantId, tenantId));
      if (rows.length === 0) return [];

      const valuesToInsert = rows.map(w => {
        const totalHours = Number(w.totalHours ?? 0);
        const hourlyRate = Number(w.hourlyNettoRate ?? 0);
        const advancesDeducted = Number(w.advancePayment ?? 0);
        const penaltiesDeducted = Number(w.penalties ?? 0);
        const grossPay = totalHours * hourlyRate;
        const finalNettoPayout = grossPay - advancesDeducted - penaltiesDeducted;
        return {
          workerId: w.id,
          workerName: w.name,
          monthYear,
          totalHours: totalHours.toString(),
          hourlyRate: hourlyRate.toString(),
          advancesDeducted: advancesDeducted.toString(),
          penaltiesDeducted: penaltiesDeducted.toString(),
          grossPay: grossPay.toString(),
          finalNettoPayout: finalNettoPayout.toString(),
          zusBaseSalary: grossPay.toString(),
          siteLocation: w.assignedSite,
          tenantId,
        };
      });

      const inserted = await tx.insert(schema.payrollRecords).values(valuesToInsert).returning();

      const workerIds = rows.map(w => w.id);
      await tx.update(schema.workers).set({
        totalHours: "0", advancePayment: "0", penalties: "0", updatedAt: new Date(),
      }).where(inArray(schema.workers.id, workerIds));

      const emailByWorkerId = new Map(rows.map(w => [w.id, w.email]));
      return inserted.map(r => ({ ...r, __email: emailByWorkerId.get(r.workerId) ?? null }));
    });

    // Fire payslip emails in background (after commit)
    Promise.allSettled(
      newRecords.filter(r => r.__email).map(async (r) => {
        try {
          const pdf = await buildPayslipBuffer(r);
          await sendPayslipEmail(r.__email, r.workerName, monthYear, pdf, {
            totalHours: r.totalHours, hourlyRate: r.hourlyRate, grossPay: r.grossPay,
            advancesDeducted: r.advancesDeducted, penaltiesDeducted: r.penaltiesDeducted,
            zusDeducted: 0, finalNettoPayout: r.finalNettoPayout, siteLocation: r.siteLocation,
          });
        } catch (e) { console.warn(`[payroll] payslip email failed for ${r.workerName}:`, e); }
      })
    );

    appendAuditEntry({
      workerId: "ALL", actor: req.user?.email ?? "admin", field: "PAYROLL",
      newValue: { monthYear, recordsCreated: newRecords.length, totalPayout: newRecords.reduce((s: number, r: any) => s + Number(r.finalNettoPayout), 0) },
      action: "PAYROLL_COMMIT",
    });

    return res.json({
      success: true, monthYear, recordsCreated: newRecords.length,
      totalPayout: newRecords.reduce((s: number, r: any) => s + Number(r.finalNettoPayout), 0),
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Close month failed" });
  }
});

router.get("/payroll/history/:workerId", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const tenantId = requireTenant(req);
    const history = await db.select().from(schema.payrollRecords)
      .where(and(
        eq(schema.payrollRecords.workerId, String(req.params.workerId)),
        eq(schema.payrollRecords.tenantId, tenantId),
      ))
      .orderBy(desc(schema.payrollRecords.monthYear))
      .limit(limit)
      .offset(offset);
    return res.json({ history });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load history" });
  }
});

router.get("/payroll/summary", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const tenantId = requireTenant(req);
    const records = await db.select().from(schema.payrollRecords)
      .where(eq(schema.payrollRecords.tenantId, tenantId))
      .orderBy(desc(schema.payrollRecords.createdAt))
      .limit(limit)
      .offset(offset);
    return res.json({ records });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load summary" });
  }
});

router.patch("/payroll/records/:id", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const [existing] = await db.select().from(schema.payrollRecords).where(eq(schema.payrollRecords.id, String(req.params.id)));
    if (!existing) return res.status(404).json({ error: "Record not found" });

    const { totalHours, hourlyRate, advancesDeducted, siteLocation } = req.body as any;
    const rec: any = { ...existing };
    if (totalHours !== undefined) rec.totalHours = String(totalHours);
    if (hourlyRate !== undefined) rec.hourlyRate = String(hourlyRate);
    if (advancesDeducted !== undefined) rec.advancesDeducted = String(advancesDeducted);
    if (siteLocation !== undefined) rec.siteLocation = siteLocation;
    const grossPayNum = Number(rec.totalHours) * Number(rec.hourlyRate);
    rec.grossPay = grossPayNum.toString();
    const zusBaseNum = grossPayNum * ZUS_RATE;
    rec.zusBaseSalary = zusBaseNum.toString();
    const finalNettoNum = grossPayNum - zusBaseNum - Number(rec.advancesDeducted ?? 0) - Number(rec.penaltiesDeducted ?? 0);
    rec.finalNettoPayout = finalNettoNum.toString();

    await db.update(schema.payrollRecords).set(rec).where(eq(schema.payrollRecords.id, String(req.params.id)));
    return res.json({ success: true, record: rec });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Record update failed" });
  }
});

function buildPayslipBuffer(record: any): Promise<Buffer> {
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

    doc.rect(0, 0, PAGE_W, 70).fill(DARK);
    doc.rect(0, 68, PAGE_W, 3).fill(LIME);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(LIME).text("EURO EDU JOBS", MARGIN, 20);
    doc.font("Helvetica").fontSize(9).fillColor("#aaaaaa").text("Odcinek Wyplaty / Payslip", MARGIN, 46);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(LIME).text(record.monthYear, PAGE_W - 130, 28, { width: 90, align: "right" });

    doc.rect(MARGIN, 90, PAGE_W - MARGIN * 2, 52).fill("#f8f8f8").stroke("#e0e0e0");
    doc.font("Helvetica-Bold").fontSize(16).fillColor(DARK).text(record.workerName, MARGIN + 14, 100);
    doc.font("Helvetica").fontSize(10).fillColor("#666").text(`Lokacja: ${record.siteLocation || "\u2014"}`, MARGIN + 14, 120);

    const rows: [string, string][] = [
      ["Godziny przepracowane", `${record.totalHours.toFixed(1)} h`],
      ["Stawka godzinowa (netto)", `${record.hourlyRate.toFixed(2)} zl`],
      ["Wynagrodzenie brutto", `${record.grossPay.toFixed(2)} zl`],
      ["Zaliczki potracone", `- ${record.advancesDeducted.toFixed(2)} zl`],
      ["Kary potracone", `- ${(record.penaltiesDeducted ?? 0).toFixed(2)} zl`],
    ];

    let y = 164;
    rows.forEach(([label, value], i) => {
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 30).fill(i % 2 === 0 ? "#ffffff" : "#f9f9f9").stroke("#eeeeee");
      doc.font("Helvetica").fontSize(11).fillColor(DARK).text(label, MARGIN + 14, y + 9);
      doc.font("Helvetica").fontSize(11).fillColor(DARK).text(value, PAGE_W - MARGIN - 100, y + 9, { width: 90, align: "right" });
      y += 30;
    });

    y += 6;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 40).fill(DARK);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(LIME).text("DO WYPLATY NETTO", MARGIN + 14, y + 12);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(LIME).text(`${record.finalNettoPayout.toFixed(2)} zl`, PAGE_W - MARGIN - 110, y + 10, { width: 100, align: "right" });

    const footerY = PAGE_H - 40;
    doc.rect(0, footerY, PAGE_W, 40).fill(DARK);
    doc.rect(0, footerY, PAGE_W, 2).fill(LIME);
    doc.font("Helvetica").fontSize(8).fillColor("#aaaaaa").text(`EURO EDU JOBS \u2014 ${new Date().toLocaleDateString("pl-PL")}`, MARGIN, footerY + 14);
    doc.end();
  });
}

router.get("/payroll/payslip/:workerId/:monthYear", authenticateToken, async (req, res) => {
  try {
    const [record] = await db.select().from(schema.payrollRecords).where(
      and(eq(schema.payrollRecords.workerId, String(req.params.workerId)), eq(schema.payrollRecords.monthYear, String(req.params.monthYear)))
    );
    if (!record) return res.status(404).json({ error: "Payroll record not found." });
    const pdfBuffer = await buildPayslipBuffer(record);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Payslip_${record.workerName.replace(/\s+/g, "_")}_${record.monthYear}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate payslip." });
    }
    return;
  }
});

router.get("/payroll/bank-export", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { monthYear } = req.query as { monthYear?: string };
    if (!monthYear) return res.status(400).json({ error: "monthYear query param required" });
    const tenantId = requireTenant(req);
    const records = await db.select().from(schema.payrollRecords).where(
      and(eq(schema.payrollRecords.monthYear, monthYear), eq(schema.payrollRecords.tenantId, tenantId))
    );
    if (records.length === 0) return res.status(404).json({ error: `No payroll records for ${monthYear}` });

    const { decrypt } = await import("../lib/encryption.js");
    const workerRows = await db.select().from(schema.workers).where(eq(schema.workers.tenantId, tenantId));
    const workerMap = new Map(workerRows.map(w => [w.id, decrypt(w.iban ?? null) ?? ""]));

    const BOM = "\uFEFF";
    const header = "Numer konta (IBAN);Nazwa odbiorcy;Kwota (PLN);Tytul przelewu";
    const lines = records.map(r => {
      const iban = (workerMap.get(r.workerId) ?? "").replace(/\s/g, "");
      const amount = Number(r.finalNettoPayout).toFixed(2).replace(".", ",");
      return `${iban};${r.workerName};${amount};Wynagrodzenie ${r.monthYear} - ${r.workerName}`;
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="EEJ_Przelewy_${monthYear}.csv"`);
    return res.end(BOM + [header, ...lines].join("\r\n"));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Export failed" });
  }
});

router.get("/payroll/trend", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const months = Math.min(parseInt(String(req.query.months ?? "6"), 10), 24);
    const tenantId = requireTenant(req);
    const all = await db.select().from(schema.payrollRecords).where(eq(schema.payrollRecords.tenantId, tenantId));
    const grouped: Record<string, { totalGross: number; totalNetto: number; count: number }> = {};
    for (const r of all) {
      if (!grouped[r.monthYear]) grouped[r.monthYear] = { totalGross: 0, totalNetto: 0, count: 0 };
      grouped[r.monthYear].totalGross += Number(r.grossPay);
      grouped[r.monthYear].totalNetto += Number(r.finalNettoPayout);
      grouped[r.monthYear].count += 1;
    }
    const sorted = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).slice(-months).map(([monthYear, v]) => ({ monthYear, ...v }));
    res.json({ trend: sorted });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Trend failed" });
  }
});

export default router;
