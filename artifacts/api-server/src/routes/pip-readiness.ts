import { Router } from "express";
import { authenticateToken } from "../lib/authMiddleware.js";
import { calculatePIPReadiness } from "../services/pip-readiness.service.js";

const router = Router();

// GET /api/pip-readiness — calculate PIP inspection readiness score
router.get("/pip-readiness", authenticateToken, async (req: any, res) => {
  try {
    const result = await calculatePIPReadiness(req.tenantId ?? req.user?.tenantId);

    res.json({
      ...result,
      aiSummary: null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to calculate PIP readiness" });
  }
});

export default router;
