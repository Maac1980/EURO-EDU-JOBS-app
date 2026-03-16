import { Router } from "express";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";
import { getNotifications, clearNotifications } from "../lib/notificationLog.js";

const router = Router();

// GET /notifications — admin: returns full history; coordinator+: returns their own sends
router.get("/notifications", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
    const workerFilter = req.query.workerId as string | undefined;
    let entries = getNotifications(500);
    if (workerFilter) {
      entries = entries.filter((e) => e.workerId === workerFilter);
    }
    res.json({ notifications: entries.slice(0, limit), total: entries.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// DELETE /notifications — admin only: wipe all notification history
router.delete("/notifications", authenticateToken, requireAdmin, async (_req, res) => {
  try {
    clearNotifications();
    res.json({ success: true, message: "Notification history cleared." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
