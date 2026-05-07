/**
 * Digital Document Safe — secure timestamped vault for official MOS certificates.
 *
 * No manipulation, no watermarking. Just secure storage with audit trail.
 * Each file is timestamped and linked to worker + case.
 *
 * POST /api/safe/:workerId/upload — upload official document
 * GET  /api/safe/:workerId — list documents in safe
 * GET  /api/safe/document/:docId — get document metadata
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

const SAFE_CATEGORIES = [
  "MOS_CERTIFICATE",
  "SUBMISSION_CONFIRMATION",
  "UPO_RECEIPT",
  "DECISION_POSITIVE",
  "DECISION_NEGATIVE",
  "TRC_CARD_SCAN",
  "STAMP_PROOF",
  "OFFICIAL_CORRESPONDENCE",
];

// POST /api/safe/:workerId/upload
router.post("/safe/:workerId/upload", authenticateToken, async (req, res) => {
  try {
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const { fileName, mimeType, fileSize, category, description, caseId } = req.body as {
      fileName: string; mimeType?: string; fileSize?: number;
      category?: string; description?: string; caseId?: string;
    };

    if (!fileName) return res.status(400).json({ error: "fileName required" });

    const cat = SAFE_CATEGORIES.includes(category ?? "") ? category : "MOS_CERTIFICATE";

    const rows = await db.execute(sql`
      INSERT INTO digital_safe (worker_id, case_id, doc_category, file_name, mime_type, file_size,
        description, uploaded_by)
      VALUES (${wid}, ${caseId ?? null}, ${cat}, ${fileName}, ${mimeType ?? "application/pdf"},
        ${fileSize ?? 0}, ${description ?? null}, ${(req as any).user?.name ?? "system"})
      RETURNING *
    `);

    // Audit
    await db.execute(sql`
      INSERT INTO audit_entries (worker_id, actor, field, new_value, action)
      VALUES (${wid}, ${(req as any).user?.name ?? "system"}, 'digital_safe',
        ${JSON.stringify({ fileName, category: cat })}::jsonb, 'SAFE_DOCUMENT_UPLOADED')
    `);

    return res.json({ document: rows.rows[0], categories: SAFE_CATEGORIES });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/safe/:workerId
router.get("/safe/:workerId", authenticateToken, async (req, res) => {
  try {
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const rows = await db.execute(sql`
      SELECT * FROM digital_safe WHERE worker_id = ${wid} ORDER BY created_at DESC
    `);
    return res.json({ documents: rows.rows, categories: SAFE_CATEGORIES });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/safe/document/:docId/verify — mark as verified
router.post("/safe/document/:docId/verify", authenticateToken, async (req, res) => {
  try {
    const did = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
    await db.execute(sql`
      UPDATE digital_safe SET verified = true, verified_by = ${(req as any).user?.name ?? "system"},
        verified_at = NOW() WHERE id = ${did}
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/safe/categories
router.get("/safe/categories", authenticateToken, (_req, res) => {
  return res.json({ categories: SAFE_CATEGORIES });
});

export default router;
