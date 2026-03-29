import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";

const router = Router();

router.get("/notifications", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
    const workerFilter = req.query.workerId as string | undefined;
    let query = db.select().from(schema.notifications).orderBy(desc(schema.notifications.sentAt)).limit(500);
    let entries = await query;
    if (workerFilter) entries = entries.filter(e => e.workerId === workerFilter);
    res.json({ notifications: entries.slice(0, limit), total: entries.length });
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
