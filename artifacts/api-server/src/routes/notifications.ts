import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";

const router = Router();

router.get("/notifications", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const workerFilter = req.query.workerId as string | undefined;

    const entries = workerFilter
      ? await db.select().from(schema.notifications)
          .where(eq(schema.notifications.workerId, workerFilter))
          .orderBy(desc(schema.notifications.sentAt))
          .limit(limit)
          .offset(offset)
      : await db.select().from(schema.notifications)
          .orderBy(desc(schema.notifications.sentAt))
          .limit(limit)
          .offset(offset);
    res.json({ notifications: entries, total: entries.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// Item 3.0.0 emergency patch — explicit confirmation friction on the
// admin-only "clear all notifications" endpoint. Previously the handler ran
// `db.delete(schema.notifications)` with no WHERE clause on auth check alone;
// any admin token (and the notifications table has no tenant_id column) could
// wipe the entire table cross-tenant in a single call. Friction layer now
// requires the caller to send an explicit body token, and every successful
// invocation is audit-logged with actor email + row count. Aligns with
// Item 3.0 sub-task 5 confirmation-friction pattern landing early.
const CLEAR_ALL_CONFIRM_TOKEN = "WIPE_ALL_NOTIFICATIONS";

router.delete("/notifications", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const body = (req.body ?? {}) as { confirm?: unknown };
    if (body.confirm !== CLEAR_ALL_CONFIRM_TOKEN) {
      return res.status(400).json({
        error: `Destructive operation requires explicit confirmation. POST body must include { "confirm": "${CLEAR_ALL_CONFIRM_TOKEN}" }.`,
      });
    }

    const deleted = await db.delete(schema.notifications).returning({ id: schema.notifications.id });
    const actorEmail = (req.user as { email?: string } | undefined)?.email ?? "unknown";
    console.warn(`[notifications] CLEAR-ALL invoked by ${actorEmail} — ${deleted.length} rows deleted`);

    return res.json({
      success: true,
      message: "Notification history cleared.",
      deletedCount: deleted.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
