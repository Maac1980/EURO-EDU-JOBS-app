/**
 * Document Intake Hardening — production safety layer.
 * Runs AFTER SmartDocumentDrop extraction, BEFORE any system updates.
 *
 * Adds: duplicate detection, conflict detection, confidence gating,
 * completeness scoring, timeline validation, audit trail.
 *
 * Does NOT change legal truth. Flags for review only.
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import crypto from "crypto";

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────
interface HardeningResult {
  duplicate: { isDuplicate: boolean; duplicateOfId?: string; confidence: number; method?: string };
  conflicts: { hasConflicts: boolean; fields: { field: string; extracted: string; stored: string; severity: "high" | "low" }[] };
  confidenceGate: { level: "AUTO_SUGGEST" | "REVIEW_REQUIRED" | "FAILED"; overallConfidence: number; reason: string };
  completeness: { score: number; missingCritical: string[]; missingNonCritical: string[] };
  timeline: { status: "VALID" | "LATE" | "INCONSISTENT" | "UNKNOWN"; explanation: string };
  identityRisk: { level: "LOW" | "MEDIUM" | "HIGH"; matchConfidence: number };
  linkedCase: { caseId: string | null; confidence: number; explanation: string };
  auditTrail: Record<string, any>;
}

const CRITICAL_FIELDS = ["worker_name", "document_number", "expiry_date"];
const NONCRITICAL_FIELDS = ["filing_date", "authority", "case_reference", "nationality", "pesel"];

// ── POST /api/intake/harden — run hardening on extracted data ───────────
router.post("/intake/harden", authenticateToken, async (req, res) => {
  try {
    const { workerId, extractedFields, documentType, fileHash, matchedWorker } = req.body as {
      workerId?: string;
      extractedFields: Record<string, { value: string | null; confidence: number }>;
      documentType: string;
      fileHash?: string;
      matchedWorker?: { id: string; name: string; matchScore: number };
    };

    if (!extractedFields || !documentType) {
      return res.status(400).json({ error: "extractedFields and documentType required" });
    }

    const wid = workerId ?? matchedWorker?.id;
    let worker: any = null;
    if (wid) {
      const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${wid}`);
      if (wRows.rows.length > 0) worker = wRows.rows[0];
    }

    const result: HardeningResult = {
      duplicate: await checkDuplicate(wid, documentType, extractedFields, fileHash),
      conflicts: worker ? detectConflicts(extractedFields, worker, documentType) : { hasConflicts: false, fields: [] },
      confidenceGate: gateConfidence(extractedFields),
      completeness: scoreCompleteness(extractedFields),
      timeline: worker ? validateTimeline(extractedFields, worker) : { status: "UNKNOWN", explanation: "No worker data to validate against" },
      identityRisk: assessIdentityRisk(matchedWorker),
      linkedCase: wid ? await findLinkedCase(wid, extractedFields, documentType) : { caseId: null, confidence: 0, explanation: "No worker to link" },
      auditTrail: {
        timestamp: new Date().toISOString(),
        documentType,
        extractedFieldCount: Object.keys(extractedFields).length,
        workerMatched: !!wid,
        fileHash: fileHash ?? null,
      },
    };

    // Determine overall recommendation
    const blocked = result.confidenceGate.level === "FAILED"
      || result.identityRisk.level === "HIGH"
      || result.completeness.missingCritical.length > 0;

    const needsReview = result.confidenceGate.level === "REVIEW_REQUIRED"
      || result.conflicts.hasConflicts
      || result.duplicate.isDuplicate
      || result.timeline.status === "INCONSISTENT"
      || result.identityRisk.level === "MEDIUM";

    return res.json({
      ...result,
      recommendation: blocked ? "BLOCKED" : needsReview ? "REVIEW_REQUIRED" : "SAFE_TO_PROCEED",
      blockedReasons: blocked ? [
        result.confidenceGate.level === "FAILED" ? "Low confidence extraction" : null,
        result.identityRisk.level === "HIGH" ? "High identity mismatch risk" : null,
        result.completeness.missingCritical.length > 0 ? `Missing critical: ${result.completeness.missingCritical.join(", ")}` : null,
      ].filter(Boolean) : [],
      reviewReasons: needsReview ? [
        result.conflicts.hasConflicts ? `${result.conflicts.fields.length} field conflicts` : null,
        result.duplicate.isDuplicate ? "Possible duplicate document" : null,
        result.timeline.status === "INCONSISTENT" ? "Timeline inconsistency" : null,
      ].filter(Boolean) : [],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Duplicate Detection ─────────────────────────────────────────────────
async function checkDuplicate(
  workerId: string | undefined, documentType: string,
  fields: Record<string, { value: string | null; confidence: number }>,
  fileHash?: string
): Promise<HardeningResult["duplicate"]> {
  // Check by file hash
  if (fileHash) {
    const hashMatch = await db.execute(sql`
      SELECT id FROM legal_evidence WHERE storage_key = ${fileHash} LIMIT 1
    `);
    if (hashMatch.rows.length > 0) {
      return { isDuplicate: true, duplicateOfId: (hashMatch.rows[0] as any).id, confidence: 100, method: "file_hash" };
    }
  }

  // Check by reference number + worker + type
  const refNum = fields.document_number?.value ?? fields.case_reference?.value;
  if (refNum && workerId) {
    const refMatch = await db.execute(sql`
      SELECT id FROM legal_evidence
      WHERE worker_id = ${workerId}
        AND (extracted_reference = ${refNum} OR (ocr_result->>'fields'->>'document_number'->>'value') = ${refNum})
      LIMIT 1
    `);
    if (refMatch.rows.length > 0) {
      return { isDuplicate: true, duplicateOfId: (refMatch.rows[0] as any).id, confidence: 85, method: "reference_number" };
    }
  }

  // Check by worker + type + date
  const expDate = fields.expiry_date?.value;
  if (workerId && expDate) {
    const dateMatch = await db.execute(sql`
      SELECT id FROM legal_evidence
      WHERE worker_id = ${workerId} AND evidence_type = ${documentType}
        AND extracted_filing_date = ${expDate}
      LIMIT 1
    `);
    if (dateMatch.rows.length > 0) {
      return { isDuplicate: true, duplicateOfId: (dateMatch.rows[0] as any).id, confidence: 70, method: "worker_type_date" };
    }
  }

  return { isDuplicate: false, confidence: 0 };
}

// ── Conflict Detection ──────────────────────────────────────────────────
function detectConflicts(
  extracted: Record<string, { value: string | null; confidence: number }>,
  worker: any, documentType: string
): HardeningResult["conflicts"] {
  const conflicts: HardeningResult["conflicts"]["fields"] = [];

  const checks = [
    { field: "worker_name", extracted: extracted.worker_name?.value, stored: worker.name, severity: "high" as const },
    { field: "nationality", extracted: extracted.nationality?.value, stored: worker.nationality, severity: "low" as const },
    { field: "pesel", extracted: extracted.pesel?.value, stored: worker.pesel, severity: "high" as const },
    { field: "expiry_date", extracted: extracted.expiry_date?.value, stored: worker.trc_expiry ?? worker.work_permit_expiry, severity: "high" as const },
  ];

  for (const c of checks) {
    if (c.extracted && c.stored && c.extracted.toLowerCase().trim() !== String(c.stored).toLowerCase().trim()) {
      conflicts.push({ field: c.field, extracted: c.extracted, stored: String(c.stored), severity: c.severity });
    }
  }

  return { hasConflicts: conflicts.length > 0, fields: conflicts };
}

// ── Confidence Gating ───────────────────────────────────────────────────
function gateConfidence(fields: Record<string, { value: string | null; confidence: number }>): HardeningResult["confidenceGate"] {
  const scores = Object.values(fields).filter(f => f.value !== null).map(f => f.confidence);
  if (scores.length === 0) return { level: "FAILED", overallConfidence: 0, reason: "No fields extracted" };

  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // Strict thresholds for immigration/legal documents:
  // >90% = safe to suggest (legal filings must be near-certain)
  // 70-90% = human must verify every field before proceeding
  // <70% = too unreliable for legal documents — manual entry required
  if (avg >= 90) return { level: "AUTO_SUGGEST", overallConfidence: avg, reason: "High confidence extraction — verify before confirming" };
  if (avg >= 70) return { level: "REVIEW_REQUIRED", overallConfidence: avg, reason: "Medium confidence — every field must be manually verified" };
  return { level: "FAILED", overallConfidence: avg, reason: "Low confidence — document unreadable or wrong type. Manual entry required." };
}

// ── Completeness Scoring ────────────────────────────────────────────────
function scoreCompleteness(fields: Record<string, { value: string | null; confidence: number }>): HardeningResult["completeness"] {
  const missingCritical = CRITICAL_FIELDS.filter(f => !fields[f]?.value);
  const missingNonCritical = NONCRITICAL_FIELDS.filter(f => !fields[f]?.value);
  const total = CRITICAL_FIELDS.length + NONCRITICAL_FIELDS.length;
  const found = total - missingCritical.length - missingNonCritical.length;
  return { score: Math.round(found / total * 100), missingCritical, missingNonCritical };
}

// ── Timeline Validation ─────────────────────────────────────────────────
function validateTimeline(
  fields: Record<string, { value: string | null; confidence: number }>,
  worker: any
): HardeningResult["timeline"] {
  const filingDate = fields.filing_date?.value;
  const expiryDate = fields.expiry_date?.value;
  const permitExpiry = worker.trc_expiry ?? worker.work_permit_expiry;

  if (!filingDate && !expiryDate) return { status: "UNKNOWN", explanation: "No dates extracted" };

  // Check filing before permit expiry (Art. 108)
  if (filingDate && permitExpiry) {
    const filed = new Date(filingDate);
    const expires = new Date(permitExpiry);
    if (filed <= expires) {
      return { status: "VALID", explanation: `Filing date (${filingDate}) is before permit expiry (${permitExpiry}) — Art. 108 eligible` };
    } else {
      return { status: "LATE", explanation: `Filing date (${filingDate}) is AFTER permit expiry (${permitExpiry}) — Art. 108 may NOT apply` };
    }
  }

  // Check if extracted expiry differs from stored
  if (expiryDate && permitExpiry) {
    const ext = new Date(expiryDate);
    const stored = new Date(permitExpiry);
    const diffDays = Math.abs(Math.ceil((ext.getTime() - stored.getTime()) / 86400000));
    if (diffDays > 30) {
      return { status: "INCONSISTENT", explanation: `Extracted expiry (${expiryDate}) differs from stored (${permitExpiry}) by ${diffDays} days` };
    }
  }

  return { status: "VALID", explanation: "Timeline checks passed" };
}

// ── Identity Risk ───────────────────────────────────────────────────────
function assessIdentityRisk(matched?: { id: string; name: string; matchScore: number }): HardeningResult["identityRisk"] {
  // Strict for legal documents — attaching a permit to the wrong worker
  // can cause illegal employment liability
  if (!matched) return { level: "HIGH", matchConfidence: 0 };
  if (matched.matchScore >= 90) return { level: "LOW", matchConfidence: matched.matchScore };
  if (matched.matchScore >= 75) return { level: "MEDIUM", matchConfidence: matched.matchScore };
  return { level: "HIGH", matchConfidence: matched.matchScore };
}

// ── Find Linked Case ────────────────────────────────────────────────────
async function findLinkedCase(
  workerId: string,
  fields: Record<string, { value: string | null; confidence: number }>,
  documentType: string
): Promise<HardeningResult["linkedCase"]> {
  const caseRef = fields.case_reference?.value;

  // Try matching by case reference
  if (caseRef) {
    const refMatch = await db.execute(sql`
      SELECT id, case_type, status FROM legal_cases
      WHERE worker_id = ${workerId} AND title ILIKE ${"%" + caseRef + "%"}
      LIMIT 1
    `);
    if (refMatch.rows.length > 0) {
      const c = refMatch.rows[0] as any;
      return { caseId: c.id, confidence: 90, explanation: `Matched by reference: ${caseRef}` };
    }
  }

  // Try matching by document type → case type
  const typeMap: Record<string, string[]> = {
    rejection_letter: ["rejection", "TRC", "Appeal"],
    filing_proof: ["TRC", "Work Permit"],
    trc_receipt: ["TRC"],
    work_permit: ["Work Permit"],
    mos_stamp: ["TRC"],
    upo: ["TRC"],
  };
  const caseTypes = typeMap[documentType] ?? [];
  if (caseTypes.length > 0) {
    const typeMatch = await db.execute(sql`
      SELECT id, case_type, status FROM legal_cases
      WHERE worker_id = ${workerId}
        AND case_type = ANY(${caseTypes})
        AND status NOT IN ('APPROVED', 'resolved', 'closed')
      ORDER BY created_at DESC LIMIT 1
    `);
    if (typeMatch.rows.length > 0) {
      const c = typeMatch.rows[0] as any;
      return { caseId: c.id, confidence: 70, explanation: `Matched by document type ${documentType} → case type ${c.case_type}` };
    }
  }

  return { caseId: null, confidence: 0, explanation: "No matching case found" };
}

export default router;
