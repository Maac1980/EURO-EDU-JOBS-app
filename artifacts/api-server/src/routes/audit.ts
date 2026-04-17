import { Router } from "express";
import { db, schema } from "../db/index.js";
import { desc } from "drizzle-orm";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";

const router = Router();

export interface AuditEntry {
  timestamp: string;
  actor: string;
  workerId: string;
  workerName?: string;
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  action?: string;
}

export function appendAuditEntry(entry: Omit<AuditEntry, "timestamp">) {
  // Fire and forget - don't block the caller
  db.insert(schema.auditEntries).values({
    workerId: entry.workerId,
    workerName: entry.workerName ?? null,
    actor: entry.actor,
    field: entry.field,
    oldValue: entry.oldValue ? JSON.parse(JSON.stringify(entry.oldValue)) : null,
    newValue: entry.newValue ? JSON.parse(JSON.stringify(entry.newValue)) : null,
    action: entry.action ?? null,
  }).catch(e => console.error("[audit] write error:", e));
}

router.get("/audit", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const entries = await db.select().from(schema.auditEntries)
      .orderBy(desc(schema.auditEntries.timestamp))
      .limit(limit)
      .offset(offset);
    return res.json({ entries, total: entries.length, limit, offset });
  } catch {
    return res.status(500).json({ error: "Failed to read audit log." });
  }
});

// Audit entries are immutable — no DELETE endpoint by design (compliance requirement).

export default router;
