import { Router } from "express";
import { db, schema } from "../db/index.js";
import { desc, eq, sql } from "drizzle-orm";
import { JWT_SECRET, authenticateToken, requireAdmin } from "../lib/authMiddleware.js";

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
    const entries = await db.select().from(schema.auditEntries)
      .orderBy(desc(schema.auditEntries.timestamp))
      .limit(2000);
    return res.json({ entries, total: entries.length });
  } catch {
    return res.status(500).json({ error: "Failed to read audit log." });
  }
});

router.delete("/audit", authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.delete(schema.auditEntries);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to clear audit log." });
  }
});

export default router;
