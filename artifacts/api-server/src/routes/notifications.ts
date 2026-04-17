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

router.delete("/notifications", authenticateToken, requireAdmin, async (_req, res) => {
  try {
    await db.delete(schema.notifications);
    res.json({ success: true, message: "Notification history cleared." });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
