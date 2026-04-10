/**
 * Document Action Logging — append-only log for all document actions.
 * Tracks: generated, uploaded, deleted, downloaded, opened, override.
 * Used by: Worker Document Menu, template generation, working documents.
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

type DocumentAction = "generated" | "uploaded" | "deleted" | "downloaded" | "opened" | "status_changed" | "validation_override" | "linked_to_case" | "approved" | "rejected";

// ── Log function (used by other services) ───────────────────────────────
export async function logDocumentAction(
  workerId: string,
  documentId: string | null,
  documentType: string,
  action: DocumentAction,
  actor: string,
  metadata?: Record<string, any>
): Promise<void> {
  await db.execute(sql`
    INSERT INTO document_action_log (worker_id, document_id, document_type, action, actor, metadata)
    VALUES (${workerId}, ${documentId}, ${documentType}, ${action}, ${actor}, ${JSON.stringify(metadata ?? {})}::jsonb)
  `).catch(err => console.error("[doc-log] Failed to log:", err.message));
}

// ── POST /api/doc-log — log an action ───────────────────────────────────
router.post("/doc-log", authenticateToken, async (req, res) => {
  try {
    const { workerId, documentId, documentType, action, metadata } = req.body as {
      workerId: string; documentId?: string; documentType: string; action: DocumentAction; metadata?: Record<string, any>;
    };
    if (!workerId || !action || !documentType) {
      return res.status(400).json({ error: "workerId, documentType, and action required" });
    }
    const actor = (req as any).user?.email ?? "unknown";
    await logDocumentAction(workerId, documentId ?? null, documentType, action, actor, metadata);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/doc-log/override — log validation override ────────────────
router.post("/doc-log/override", authenticateToken, async (req, res) => {
  try {
    const { workerId, templateName, missingFields } = req.body as {
      workerId: string; templateName: string; missingFields: string[];
    };
    if (!workerId || !templateName) {
      return res.status(400).json({ error: "workerId and templateName required" });
    }
    const actor = (req as any).user?.email ?? "unknown";
    await logDocumentAction(workerId, null, templateName, "validation_override", actor, {
      missingFields,
      overrideReason: "User clicked 'Kontynuuj mimo to'",
      fieldCount: missingFields.length,
    });
    return res.json({ success: true, logged: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/doc-log/:workerId — get action log for worker ──────────────
router.get("/doc-log/:workerId", authenticateToken, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM document_action_log
      WHERE worker_id = ${req.params.workerId}
      ORDER BY created_at DESC LIMIT 100
    `);
    return res.json({ log: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/doc-log — get recent global log (admin) ────────────────────
router.get("/doc-log", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT dal.*, w.name as worker_name FROM document_action_log dal
      LEFT JOIN workers w ON w.id = dal.worker_id
      ORDER BY dal.created_at DESC LIMIT 50
    `);
    return res.json({ log: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
