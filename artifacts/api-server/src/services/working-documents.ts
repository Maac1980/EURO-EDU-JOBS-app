/**
 * Working Documents — upload, view, organize, link worker/case files.
 * Uses existing legal_evidence table with notes/source/tags fields.
 * Separate from template generation — these are incoming documents.
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

const DOCUMENT_TYPES = [
  "passport", "permit", "filing_proof", "upo", "mos_stamp",
  "rejection_letter", "decision_letter", "insurance_proof",
  "bank_statement", "contract_copy", "bhp_certificate",
  "medical_certificate", "photo", "supporting_document", "other",
];

// ── GET /api/worker-docs/:workerId — list all documents for worker ──────
router.get("/worker-docs/:workerId", authenticateToken, async (req, res) => {
  try {
    const rows = await db.select().from(schema.legalEvidence)
      .where(eq(schema.legalEvidence.workerId, String(req.params.workerId)))
      .orderBy(desc(schema.legalEvidence.uploadedAt));

    const docs = rows.map(r => ({
      id: r.id,
      workerId: r.workerId,
      caseId: r.caseId,
      type: r.evidenceType,
      filename: r.filename ?? "Untitled",
      storageUrl: r.storageUrl,
      notes: (r as any).notes ?? "",
      source: (r as any).source ?? "uploaded",
      tags: (r as any).tags ?? [],
      ocrConfidence: r.ocrConfidence,
      verified: r.verified,
      verifiedBy: r.verifiedBy,
      hasMismatch: r.mismatchFlags !== null && Object.keys(r.mismatchFlags as any ?? {}).length > 0,
      uploadedAt: r.uploadedAt,
    }));

    return res.json({
      workerId: req.params.workerId,
      totalDocuments: docs.length,
      byType: groupBy(docs, "type"),
      documents: docs,
      supportedTypes: DOCUMENT_TYPES,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/worker-docs — upload document metadata ────────────────────
router.post("/worker-docs", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseId, evidenceType, filename, storageUrl, notes, tags } = req.body as any;
    if (!workerId || !evidenceType) return res.status(400).json({ error: "workerId and evidenceType required" });
    if (!DOCUMENT_TYPES.includes(evidenceType)) {
      return res.status(400).json({ error: `Invalid type. Use: ${DOCUMENT_TYPES.join(", ")}` });
    }

    await db.execute(sql`
      INSERT INTO legal_evidence (worker_id, case_id, evidence_type, filename, storage_url, notes, source, tags)
      VALUES (${workerId}, ${caseId ?? null}, ${evidenceType}, ${filename ?? "uploaded_" + Date.now()},
        ${storageUrl ?? null}, ${notes ?? null}, 'uploaded', ${JSON.stringify(tags ?? [])}::jsonb)
    `);

    return res.status(201).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/worker-docs/:id/link — link document to case ─────────────
router.patch("/worker-docs/:id/link", authenticateToken, async (req, res) => {
  try {
    const { caseId } = req.body as { caseId: string };
    if (!caseId) return res.status(400).json({ error: "caseId required" });

    await db.update(schema.legalEvidence)
      .set({ caseId })
      .where(eq(schema.legalEvidence.id, String(req.params.id)));

    return res.json({ success: true, linkedTo: caseId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/worker-docs/:id/notes — update notes/tags ────────────────
router.patch("/worker-docs/:id/notes", authenticateToken, async (req, res) => {
  try {
    const { notes, tags } = req.body as { notes?: string; tags?: string[] };
    await db.execute(sql`
      UPDATE legal_evidence SET
        notes = COALESCE(${notes ?? null}, notes),
        tags = COALESCE(${tags ? JSON.stringify(tags) : null}::jsonb, tags)
      WHERE id = ${req.params.id}
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/worker-docs/:id — delete document ───────────────────────
router.delete("/worker-docs/:id", authenticateToken, async (req, res) => {
  try {
    await db.delete(schema.legalEvidence).where(eq(schema.legalEvidence.id, String(req.params.id)));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/worker-docs/types — list supported types ───────────────────
router.get("/worker-docs/types", authenticateToken, async (_req, res) => {
  return res.json({ types: DOCUMENT_TYPES });
});

function groupBy(items: any[], key: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const k = item[key] ?? "other";
    result[k] = (result[k] ?? 0) + 1;
  }
  return result;
}

export default router;
