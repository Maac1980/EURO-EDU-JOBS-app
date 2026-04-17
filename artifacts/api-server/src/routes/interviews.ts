import { Router } from "express";
import { db, schema } from "../db/index.js";
import { and, eq, desc } from "drizzle-orm";
import { authenticateToken, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { requireTenant } from "../lib/tenancy.js";

const router = Router();

// GET /api/interviews — list all interviews (scoped via worker tenant)
router.get("/interviews", authenticateToken, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const interviews = await db.select({
      interview: schema.interviews,
      worker: schema.workers,
      job: schema.jobPostings,
    }).from(schema.interviews)
      .innerJoin(schema.workers, eq(schema.interviews.workerId, schema.workers.id))
      .innerJoin(schema.jobPostings, eq(schema.interviews.jobId, schema.jobPostings.id))
      .where(eq(schema.workers.tenantId, tenantId))
      .orderBy(desc(schema.interviews.scheduledAt));

    return res.json({
      interviews: interviews.map(i => ({
        ...i.interview,
        worker: { id: i.worker.id, name: i.worker.name, email: i.worker.email },
        job: { id: i.job.id, title: i.job.title },
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load interviews" });
  }
});

// POST /api/interviews — schedule interview
router.post("/interviews", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const body = req.body;
    const tenantId = requireTenant(req);
    const [worker] = await db.select().from(schema.workers).where(
      and(eq(schema.workers.id, body.workerId), eq(schema.workers.tenantId, tenantId))
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const [interview] = await db.insert(schema.interviews).values({
      applicationId: body.applicationId,
      workerId: body.workerId,
      jobId: body.jobId,
      scheduledAt: new Date(body.scheduledAt),
      duration: body.duration || 30,
      location: body.location,
      interviewerName: body.interviewerName,
      interviewerEmail: body.interviewerEmail,
    }).returning();

    // Update application stage to Interview
    await db.update(schema.jobApplications).set({ stage: "Interview", updatedAt: new Date() })
      .where(eq(schema.jobApplications.id, body.applicationId));

    return res.status(201).json({ interview });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to schedule interview" });
  }
});

// PATCH /api/interviews/:id — update interview (feedback, status)
router.patch("/interviews/:id", authenticateToken, async (req, res) => {
  try {
    const body = req.body;
    const updates: Record<string, unknown> = { ...body, updatedAt: new Date() };
    delete updates.id;
    const [updated] = await db.update(schema.interviews).set(updates)
      .where(eq(schema.interviews.id, String(req.params.id))).returning();
    if (!updated) return res.status(404).json({ error: "Interview not found" });
    return res.json({ interview: updated });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update interview" });
  }
});

// DELETE /api/interviews/:id
router.delete("/interviews/:id", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    await db.delete(schema.interviews).where(eq(schema.interviews.id, String(req.params.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete interview" });
  }
});

export default router;
