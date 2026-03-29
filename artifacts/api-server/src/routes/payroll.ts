import { Router } from "express";
import { randomUUID } from "crypto";
import PDFDocument from "pdfkit";
import { db, schema } from "../db/index.js";
import { eq, and, sql, desc } from "drizzle-orm";
import { toWorker } from "../lib/compliance.js";
import { appendAuditEntry } from "./audit.js";
import { authenticateToken, requireAdmin, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { sendPayslipEmail } from "../lib/alerter.js";

const router = Router();
const ZUS_RATE = 0.1126;

router.get("/payroll/workers", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(schema.workers);
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
    await db.update(schema.workers).set({ iban: iban.trim(), updatedAt: new Date() }).where(eq(schema.workers.id, String(req.params.id)));
    return res.json({ success: true, iban: iban.trim() });
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

    const existing = await db.select().from(schema.payrollRecords).where(eq(schema.payrollRecords.monthYear, monthYear)).limit(1);
    if (existing.length > 0) return res.status(409).json({ error: `Month ${monthYear} already closed.` });

    const rows = await db.select().from(schema.workers);
    const newRecords: any[] = [];

    for (const w of rows) {
      const totalHours = w.totalHours ?? 0;
      const hourlyRate = w.hourlyNettoRate ?? 0;
      const advancesDeducted = w.advancePayment ?? 0;
      const penaltiesDeducted = w.penalties ?? 0;
      const grossPay = totalHours * hourlyRate;
      const finalNettoPayout = grossPay - advancesDeducted - penaltiesDeducted;

      const [record] = await db.insert(schema.payrollRecords).values({
        workerId: w.id,
        workerName: w.name,
        monthYear,
        totalHours, hourlyRate, advancesDeducted, penaltiesDeducted,
        grossPay, finalNettoPayout, zusBaseSalary: grossPay,
        siteLocation: w.assignedSite,
      }).returning();
      newRecords.push({ ...record, __email: w.email });

      await db.update(schema.workers).set({
        totalHours: 0, advancePayment: 0, penalties: 0, updatedAt: new Date(),
      }).where(eq(schema.workers.id, w.id));
    }

    // Fire payslip emails in background
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
      newValue: { monthYear, recordsCreated: newRecords.length, totalPayout: newRecords.reduce((s: number, r: any) => s + r.finalNettoPayout, 0) },
      action: "PAYROLL_COMMIT",
    });

    return res.json({
      success: true, monthYear, recordsCreated: newRecords.length,
      totalPayout: newRecords.reduce((s: number, r: any) => s + r.finalNettoPayout, 0),
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Close month failed" });
  }
});

router.get("/payroll/history/:workerId", authenticateToken, async (req, res) => {
  try {
    const history = await db.select().from(schema.payrollRecords)
      .where(eq(schema.payrollRecords.workerId, String(req.params.workerId)))
      .orderBy(desc(schema.payrollRecords.monthYear));
    return res.json({ history });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load history" });
  }
});

router.get("/payroll/summary", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const records = await db.select().from(schema.payrollRecords);
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
    const rec = { ...existing };
    if (totalHours !== undefined) rec.totalHours = totalHours;
    if (hourlyRate !== undefined) rec.hourlyRate = hourlyRate;
    if (advancesDeducted !== undefined) rec.advancesDeducted = advancesDeducted;
    if (siteLocation !== undefined) rec.siteLocation = siteLocation;
    rec.grossPay = rec.totalHours * rec.hourlyRate;
    rec.zusBaseSalary = rec.grossPay * ZUS_RATE;
    rec.finalNettoPayout = rec.grossPay - rec.zusBaseSalary - (rec.advancesDeducted ?? 0) - (rec.penaltiesDeducted ?? 0);

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
    const records = await db.select().from(schema.payrollRecords).where(eq(schema.payrollRecords.monthYear, monthYear));
    if (records.length === 0) return res.status(404).json({ error: `No payroll records for ${monthYear}` });

    const workerRows = await db.select().from(schema.workers);
    const workerMap = new Map(workerRows.map(w => [w.id, w.iban ?? ""]));

    const BOM = "\uFEFF";
    const header = "Numer konta (IBAN);Nazwa odbiorcy;Kwota (PLN);Tytul przelewu";
    const lines = records.map(r => {
      const iban = (workerMap.get(r.workerId) ?? "").replace(/\s/g, "");
      const amount = r.finalNettoPayout.toFixed(2).replace(".", ",");
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
    const all = await db.select().from(schema.payrollRecords);
    const grouped: Record<string, { totalGross: number; totalNetto: number; count: number }> = {};
    for (const r of all) {
      if (!grouped[r.monthYear]) grouped[r.monthYear] = { totalGross: 0, totalNetto: 0, count: 0 };
      grouped[r.monthYear].totalGross += r.grossPay;
      grouped[r.monthYear].totalNetto += r.finalNettoPayout;
      grouped[r.monthYear].count += 1;
    }
    const sorted = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).slice(-months).map(([monthYear, v]) => ({ monthYear, ...v }));
    res.json({ trend: sorted });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Trend failed" });
  }
});

export default router;
