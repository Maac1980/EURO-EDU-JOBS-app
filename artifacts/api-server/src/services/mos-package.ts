/**
 * MOS Package Service — generates submission-ready packages for Polish MOS 2026.
 *
 * Features:
 *  - Gathers all VERIFIED smart_documents for a worker
 *  - Validates mandatory docs per voivodeship using Knowledge Graph
 *  - Formats filenames for MOS portal standard
 *  - Generates Case Strategy PDF (9-point legal brief)
 *  - Exports Playbook as Markdown with graph pattern confidence
 *
 * POST /api/mos/package/:workerId — generate full MOS package
 * GET  /api/mos/package/:workerId/strategy-pdf — download case strategy PDF
 * GET  /api/mos/package/:workerId/playbook — download playbook Markdown
 *
 * NO auto-submission to MOS. Package is generated for manual upload.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus, type LegalInput } from "./legal-decision-engine.js";

const router = Router();

// ═══ MOS 2026 FILENAME STANDARDS ════════════════════════════════════════════

const MOS_FILENAME_MAP: Record<string, string> = {
  TRC_APPLICATION: "01_WNIOSEK_KP",
  PASSPORT: "02_PASZPORT",
  EMPLOYMENT_CONTRACT: "03_UMOWA_O_PRACE",
  EMPLOYER_DECLARATION: "04_OSWIADCZENIE_PRACODAWCY",
  ACCOMMODATION: "05_ZAMELDOWANIE",
  INSURANCE: "06_UBEZPIECZENIE",
  UPO_RECEIPT: "07_UPO",
  MOS_CONFIRMATION: "08_POTWIERDZENIE_MOS",
  MEDICAL_CERT: "09_BADANIA_LEKARSKIE",
  BHP_CERT: "10_BHP",
  ZUS_ZUA: "11_ZUS_ZUA",
  POWER_OF_ATTORNEY: "12_PELNOMOCNICTWO",
  REJECTION_DECISION: "13_DECYZJA_ODMOWNA",
  APPEAL: "14_ODWOLANIE",
  WORK_PERMIT_A: "15_ZEZWOLENIE_A",
  WORK_PERMIT_B: "16_ZEZWOLENIE_B",
  A1_CERTIFICATE: "17_ZASWIADCZENIE_A1",
};

// ═══ MANDATORY DOCS PER VOIVODESHIP (base + overrides) ═════════════════════

const BASE_MANDATORY = ["PASSPORT", "EMPLOYMENT_CONTRACT", "EMPLOYER_DECLARATION", "ACCOMMODATION", "INSURANCE"];

const VOIVODESHIP_EXTRAS: Record<string, string[]> = {
  mazowieckie: ["ZUS_ZUA"],
  malopolskie: ["MEDICAL_CERT"],
  dolnoslaskie: [],
  wielkopolskie: ["ZUS_ZUA"],
  slaskie: [],
  pomorskie: [],
  lodzkie: [],
  lubelskie: ["MEDICAL_CERT"],
};

// ═══ GATHER VERIFIED DOCUMENTS ══════════════════════════════════════════════

async function gatherVerifiedDocs(workerId: string) {
  try {
    const rows = await db.execute(sql`
      SELECT id, doc_type, file_name, confidence, extracted_data, legal_impact,
             legal_articles, rationale, status, created_at
      FROM smart_documents
      WHERE worker_id = ${workerId} AND status = 'verified'
      ORDER BY created_at DESC
    `);
    return rows.rows as any[];
  } catch {
    return [];
  }
}

// ═══ VALIDATE COMPLETENESS VIA GRAPH ════════════════════════════════════════

async function validateCompleteness(workerId: string, voivodeship: string) {
  const docs = await gatherVerifiedDocs(workerId);
  const docTypes = new Set(docs.map((d: any) => d.doc_type));

  const vKey = voivodeship.toLowerCase().replace(/\s+/g, "");
  const mandatory = [...BASE_MANDATORY, ...(VOIVODESHIP_EXTRAS[vKey] ?? [])];

  const present: string[] = [];
  const missing: string[] = [];

  for (const req of mandatory) {
    if (docTypes.has(req)) {
      present.push(req);
    } else {
      missing.push(req);
    }
  }

  // Check graph for patterns specific to this voivodeship
  let graphInsights: string[] = [];
  try {
    const patternRows = await db.execute(sql`
      SELECT description, confidence, outcome FROM kg_patterns
      WHERE voivodeships @> ${JSON.stringify([voivodeship])}::jsonb
      ORDER BY frequency DESC LIMIT 5
    `);
    graphInsights = (patternRows.rows as any[]).map(p => `${p.description} (${Math.round(p.confidence * 100)}% confidence)`);
  } catch { /* graph may not be available */ }

  return {
    complete: missing.length === 0,
    present,
    missing,
    totalRequired: mandatory.length,
    completeness: mandatory.length > 0 ? Math.round((present.length / mandatory.length) * 100) : 0,
    voivodeshipNotes: graphInsights,
  };
}

// ═══ GENERATE CASE STRATEGY (in-memory, returned as structured data) ════════

async function generateCaseStrategy(workerId: string) {
  const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
  if (wRows.rows.length === 0) throw new Error("Worker not found");
  const w = wRows.rows[0] as any;

  const docs = await gatherVerifiedDocs(workerId);

  // Legal engine assessment
  const legalInput: LegalInput = {
    workerId: w.id, workerName: w.name, nationality: w.nationality ?? "",
    permitExpiry: w.work_permit_expiry ?? null, trcExpiry: w.trc_expiry ?? null,
    trcFilingDate: null, trcApplicationPending: docs.some(d => d.doc_type === "TRC_APPLICATION" || d.doc_type === "UPO_RECEIPT"),
    employerContinuity: true, roleContinuity: true, formalDefect: docs.some(d => d.doc_type === "REJECTION_DECISION"),
    contractEndDate: w.contract_end_date ?? null, bhpExpiry: w.bhp_status ?? null,
    medicalExpiry: w.badania_lek_expiry ?? null, oswiadczenieExpiry: w.oswiadczenie_expiry ?? null,
    hasValidPassport: !!(w.passport_expiry), evidenceSubmitted: docs.filter(d => d.doc_type === "UPO_RECEIPT").length > 0 ? ["upo"] : [],
  };
  const legal = evaluateLegalStatus(legalInput);

  // Graph patterns for this worker
  let patterns: any[] = [];
  try {
    const pRows = await db.execute(sql`
      SELECT pattern_type, description, confidence, outcome, frequency
      FROM kg_patterns WHERE example_worker_ids @> ${JSON.stringify([workerId])}::jsonb
      ORDER BY frequency DESC LIMIT 10
    `);
    patterns = pRows.rows as any[];
  } catch { /* graph optional */ }

  // All legal articles referenced
  const allArticles = new Set<string>();
  for (const d of docs) {
    if (Array.isArray(d.legal_articles)) {
      d.legal_articles.forEach((a: string) => allArticles.add(a));
    }
  }

  return {
    worker: { id: w.id, name: w.name, nationality: w.nationality, pesel: w.pesel },
    legalStatus: legal.legalStatus,
    riskLevel: legal.riskLevel,
    legalBasis: legal.legalBasis,
    art108: { eligible: legal.art108Eligible, applied: legal.art108Applied },
    conditions: legal.conditions,
    warnings: legal.warnings,
    requiredActions: legal.requiredActions,
    expiryDays: legal.expiryDays,
    documents: docs.map(d => ({
      type: d.doc_type,
      mosFilename: MOS_FILENAME_MAP[d.doc_type] ?? d.doc_type,
      confidence: d.confidence,
      rationale: d.rationale,
    })),
    legalArticles: [...allArticles],
    graphPatterns: patterns,
    generatedAt: new Date().toISOString(),
  };
}

// ═══ GENERATE STRATEGY PDF ══════════════════════════════════════════════════

async function generateStrategyPDF(workerId: string): Promise<Buffer> {
  const strategy = await generateCaseStrategy(workerId);

  const PDFDocument = (await import("pdfkit")).default;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(18).fillColor("#c41e18").text("EEJ CASE STRATEGY BRIEF", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#666").text("PROJEKT / DRAFT — For Internal Review Only", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor("#999").text(`Generated: ${new Date().toLocaleString("en-GB")}`, { align: "center" });
    doc.moveDown(1);

    // Line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#c41e18").lineWidth(2).stroke();
    doc.moveDown(1);

    // Worker Info
    doc.fontSize(12).fillColor("#1a1a2e").text("1. WORKER PROFILE");
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#333");
    doc.text(`Name: ${strategy.worker.name}`);
    doc.text(`Nationality: ${strategy.worker.nationality ?? "N/A"}`);
    doc.text(`PESEL: ${strategy.worker.pesel ?? "N/A"}`);
    doc.moveDown(0.5);

    // Legal Status
    doc.fontSize(12).fillColor("#1a1a2e").text("2. LEGAL STATUS");
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor(strategy.riskLevel === "CRITICAL" ? "#dc2626" : strategy.riskLevel === "HIGH" ? "#ea580c" : "#333");
    doc.text(`Status: ${strategy.legalStatus} | Risk: ${strategy.riskLevel}`);
    doc.text(`Legal Basis: ${strategy.legalBasis}`);
    doc.text(`Art. 108: ${strategy.art108.applied ? "ACTIVE" : strategy.art108.eligible ? "Eligible" : "Not Applicable"}`);
    doc.moveDown(0.5);

    // Conditions & Warnings
    if (strategy.conditions.length > 0) {
      doc.fontSize(12).fillColor("#1a1a2e").text("3. CONDITIONS");
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#333");
      strategy.conditions.forEach((c: string) => doc.text(`• ${c}`));
      doc.moveDown(0.5);
    }

    if (strategy.warnings.length > 0) {
      doc.fontSize(12).fillColor("#dc2626").text("4. WARNINGS");
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#dc2626");
      strategy.warnings.forEach((w: string) => doc.text(`⚠ ${w}`));
      doc.moveDown(0.5);
    }

    // Required Actions
    if (strategy.requiredActions.length > 0) {
      doc.fontSize(12).fillColor("#1a1a2e").text("5. REQUIRED ACTIONS");
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#333");
      strategy.requiredActions.forEach((a: string, i: number) => doc.text(`${i + 1}. ${a}`));
      doc.moveDown(0.5);
    }

    // Documents
    doc.fontSize(12).fillColor("#1a1a2e").text("6. VERIFIED DOCUMENTS");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#333");
    strategy.documents.forEach((d: any) => {
      doc.text(`${d.mosFilename} — Confidence: ${Math.round(d.confidence * 100)}%`);
    });
    doc.moveDown(0.5);

    // Legal Articles
    if (strategy.legalArticles.length > 0) {
      doc.fontSize(12).fillColor("#1a1a2e").text("7. APPLICABLE LEGAL ARTICLES");
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#333");
      strategy.legalArticles.forEach((a: string) => doc.text(`• ${a}`));
      doc.moveDown(0.5);
    }

    // Graph Patterns
    if (strategy.graphPatterns.length > 0) {
      doc.fontSize(12).fillColor("#1a1a2e").text("8. HISTORICAL PATTERNS (Knowledge Graph)");
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#333");
      strategy.graphPatterns.forEach((p: any) => {
        doc.text(`• ${p.description} — Confidence: ${Math.round(p.confidence * 100)}%, Frequency: ${p.frequency}x`);
      });
      doc.moveDown(0.5);
    }

    // Expiry Timeline
    doc.fontSize(12).fillColor("#1a1a2e").text("9. EXPIRY TIMELINE");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#333");
    const exp = strategy.expiryDays;
    if (exp.permit !== null) doc.text(`Permit: ${exp.permit < 0 ? `EXPIRED (${Math.abs(exp.permit)}d ago)` : `${exp.permit} days remaining`}`);
    if (exp.trc !== null) doc.text(`TRC: ${exp.trc < 0 ? `EXPIRED (${Math.abs(exp.trc)}d ago)` : `${exp.trc} days remaining`}`);
    if (exp.bhp !== null) doc.text(`BHP: ${exp.bhp} days`);
    if (exp.medical !== null) doc.text(`Medical: ${exp.medical} days`);
    if (exp.contract !== null) doc.text(`Contract: ${exp.contract} days`);
    doc.moveDown(1);

    // Footer
    doc.fontSize(7).fillColor("#999").text("EEJ Legal Intelligence · PROJEKT · Not for external filing · Requires human review", { align: "center" });

    doc.end();
  });
}

// ═══ GENERATE PLAYBOOK MARKDOWN ═════════════════════════════════════════════

async function generatePlaybook(workerId: string): Promise<string> {
  const strategy = await generateCaseStrategy(workerId);
  const now = new Date().toISOString();

  const lines: string[] = [
    `# EEJ Case Playbook — ${strategy.worker.name}`,
    ``,
    `**Generated:** ${now}`,
    `**Status:** DRAFT — For Internal Use Only`,
    ``,
    `---`,
    ``,
    `## 1. Worker Profile`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| Name | ${strategy.worker.name} |`,
    `| Nationality | ${strategy.worker.nationality ?? "N/A"} |`,
    `| PESEL | ${strategy.worker.pesel ?? "N/A"} |`,
    ``,
    `## 2. Legal Status`,
    ``,
    `- **Status:** ${strategy.legalStatus}`,
    `- **Risk Level:** ${strategy.riskLevel}`,
    `- **Legal Basis:** ${strategy.legalBasis}`,
    `- **Art. 108:** ${strategy.art108.applied ? "ACTIVE ✓" : strategy.art108.eligible ? "Eligible" : "N/A"}`,
    ``,
    `## 3. Conditions`,
    ``,
    ...strategy.conditions.map((c: string) => `- ${c}`),
    ``,
    `## 4. Warnings`,
    ``,
    ...strategy.warnings.map((w: string) => `- ⚠️ ${w}`),
    ``,
    `## 5. Required Actions`,
    ``,
    ...strategy.requiredActions.map((a: string, i: number) => `${i + 1}. ${a}`),
    ``,
    `## 6. Verified Documents (MOS Format)`,
    ``,
    `| # | MOS Filename | Type | Confidence |`,
    `|---|---|---|---|`,
    ...strategy.documents.map((d: any, i: number) => `| ${i + 1} | ${d.mosFilename} | ${d.type} | ${Math.round(d.confidence * 100)}% |`),
    ``,
    `## 7. Legal Articles`,
    ``,
    ...strategy.legalArticles.map((a: string) => `- ${a}`),
    ``,
    `## 8. Knowledge Graph Patterns`,
    ``,
    `| Pattern | Confidence | Frequency | Outcome |`,
    `|---|---|---|---|`,
    ...strategy.graphPatterns.map((p: any) => `| ${p.description} | ${Math.round(p.confidence * 100)}% | ${p.frequency}x | ${p.outcome} |`),
    ``,
    `## 9. Expiry Timeline`,
    ``,
    `| Document | Days Remaining |`,
    `|---|---|`,
    ...(strategy.expiryDays.permit !== null ? [`| Permit | ${strategy.expiryDays.permit}d |`] : []),
    ...(strategy.expiryDays.trc !== null ? [`| TRC | ${strategy.expiryDays.trc}d |`] : []),
    ...(strategy.expiryDays.bhp !== null ? [`| BHP | ${strategy.expiryDays.bhp}d |`] : []),
    ...(strategy.expiryDays.medical !== null ? [`| Medical | ${strategy.expiryDays.medical}d |`] : []),
    ...(strategy.expiryDays.contract !== null ? [`| Contract | ${strategy.expiryDays.contract}d |`] : []),
    ``,
    `---`,
    ``,
    `*EEJ Legal Intelligence · ${now} · DRAFT*`,
  ];

  return lines.join("\n");
}

// ═══ ROUTES ═════════════════════════════════════════════════════════════════

// POST /api/mos/package/:workerId — generate full MOS package overview
router.post("/mos/package/:workerId", authenticateToken, async (req, res) => {
  try {
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const { voivodeship } = req.body as { voivodeship?: string };

    const strategy = await generateCaseStrategy(wid);
    const docs = await gatherVerifiedDocs(wid);
    const validation = await validateCompleteness(wid, voivodeship ?? "mazowieckie");

    // Format documents with MOS filenames
    const mosDocuments = docs.map((d: any, i: number) => ({
      index: i + 1,
      originalName: d.file_name,
      mosFilename: `${MOS_FILENAME_MAP[d.doc_type] ?? d.doc_type}_${strategy.worker.name.replace(/\s+/g, "_").toUpperCase()}.pdf`,
      docType: d.doc_type,
      confidence: d.confidence,
      status: d.status,
    }));

    return res.json({
      worker: strategy.worker,
      legalStatus: strategy.legalStatus,
      riskLevel: strategy.riskLevel,
      mosDocuments,
      validation,
      strategy: {
        legalBasis: strategy.legalBasis,
        art108: strategy.art108,
        warnings: strategy.warnings,
        requiredActions: strategy.requiredActions,
        legalArticles: strategy.legalArticles,
        graphPatterns: strategy.graphPatterns.map((p: any) => ({
          description: p.description,
          confidence: Math.round(p.confidence * 100),
          frequency: p.frequency,
          outcome: p.outcome,
        })),
      },
      readyForSubmission: validation.complete && strategy.riskLevel !== "CRITICAL",
      generatedAt: strategy.generatedAt,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/mos/package/:workerId/strategy-pdf — download case strategy PDF
router.get("/mos/package/:workerId/strategy-pdf", authenticateToken, async (req, res) => {
  try {
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const pdf = await generateStrategyPDF(wid);

    const wRows = await db.execute(sql`SELECT name FROM workers WHERE id = ${wid}`);
    const name = ((wRows.rows[0] as any)?.name ?? "worker").replace(/\s+/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="EEJ_STRATEGY_${name}_${new Date().toISOString().slice(0, 10)}.pdf"`);
    return res.send(pdf);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/mos/package/:workerId/playbook — download playbook Markdown
router.get("/mos/package/:workerId/playbook", authenticateToken, async (req, res) => {
  try {
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const md = await generatePlaybook(wid);

    const wRows = await db.execute(sql`SELECT name FROM workers WHERE id = ${wid}`);
    const name = ((wRows.rows[0] as any)?.name ?? "worker").replace(/\s+/g, "_");

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="EEJ_PLAYBOOK_${name}_${new Date().toISOString().slice(0, 10)}.md"`);
    return res.send(md);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
