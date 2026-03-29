import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { authenticateToken, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { appendAuditEntry } from "./audit.js";

const router = Router();

// GET /api/jobs — public job board (only published jobs)
router.get("/jobs", async (req, res) => {
  try {
    const jobs = await db.select().from(schema.jobPostings)
      .where(eq(schema.jobPostings.isPublished, true))
      .orderBy(desc(schema.jobPostings.createdAt));
    return res.json({ jobs });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load jobs" });
  }
});

// GET /api/jobs/all — admin view (all jobs including drafts)
router.get("/jobs/all", authenticateToken, async (req, res) => {
  try {
    const jobs = await db.select().from(schema.jobPostings).orderBy(desc(schema.jobPostings.createdAt));
    // Get application counts for each job
    const jobsWithCounts = await Promise.all(jobs.map(async (job) => {
      const apps = await db.select().from(schema.jobApplications).where(eq(schema.jobApplications.jobId, job.id));
      return { ...job, applicationCount: apps.length };
    }));
    return res.json({ jobs: jobsWithCounts });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load jobs" });
  }
});

// GET /api/jobs/:id — single job with applications
router.get("/jobs/:id", async (req, res) => {
  try {
    const [job] = await db.select().from(schema.jobPostings).where(eq(schema.jobPostings.id, String(req.params.id)));
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Get applications with worker details
    const applications = await db.select({
      application: schema.jobApplications,
      worker: schema.workers,
    }).from(schema.jobApplications)
      .innerJoin(schema.workers, eq(schema.jobApplications.workerId, schema.workers.id))
      .where(eq(schema.jobApplications.jobId, String(req.params.id)));

    return res.json({ job, applications: applications.map(a => ({ ...a.application, worker: a.worker })) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load job" });
  }
});

// POST /api/jobs — create job posting
router.post("/jobs", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const body = req.body;
    const [job] = await db.insert(schema.jobPostings).values({
      title: body.title,
      description: body.description,
      requirements: body.requirements,
      location: body.location,
      clientId: body.clientId || null,
      salaryMin: body.salaryMin,
      salaryMax: body.salaryMax,
      currency: body.currency || "PLN",
      contractType: body.contractType,
      isPublished: body.isPublished ?? false,
      closingDate: body.closingDate,
      createdBy: req.user?.id,
    }).returning();
    appendAuditEntry({ workerId: job.id, actor: req.user?.email ?? "admin", field: "JOB_POSTING", newValue: body, action: "create" });
    return res.status(201).json({ job });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create job" });
  }
});

// PATCH /api/jobs/:id — update job posting
router.patch("/jobs/:id", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const body = req.body;
    const updates: Record<string, unknown> = { ...body, updatedAt: new Date() };
    delete updates.id;
    const [updated] = await db.update(schema.jobPostings).set(updates)
      .where(eq(schema.jobPostings.id, String(req.params.id))).returning();
    if (!updated) return res.status(404).json({ error: "Job not found" });
    return res.json({ job: updated });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update job" });
  }
});

// DELETE /api/jobs/:id
router.delete("/jobs/:id", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    await db.delete(schema.jobPostings).where(eq(schema.jobPostings.id, String(req.params.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete job" });
  }
});

// ── Applications ─────────────────────────────────────────────────────────────

// POST /api/jobs/:id/apply — apply for a job (public or worker)
router.post("/jobs/:id/apply", async (req, res) => {
  try {
    const jobId = String(req.params.id);
    const { workerId, notes } = req.body as { workerId: string; notes?: string };

    // Check job exists and is published
    const [job] = await db.select().from(schema.jobPostings).where(eq(schema.jobPostings.id, jobId));
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Check for duplicate application
    const [existing] = await db.select().from(schema.jobApplications).where(
      and(eq(schema.jobApplications.jobId, jobId), eq(schema.jobApplications.workerId, workerId))
    );
    if (existing) return res.status(409).json({ error: "Already applied for this job" });

    // Calculate match score based on worker skills vs job requirements
    const [worker] = await db.select().from(schema.workers).where(eq(schema.workers.id, workerId));
    let matchScore = 0;
    const matchReasons: string[] = [];

    if (worker && job.requirements) {
      const reqs = job.requirements.toLowerCase();
      if (worker.jobRole && reqs.includes(worker.jobRole.toLowerCase())) {
        matchScore += 30;
        matchReasons.push(`Job role matches: ${worker.jobRole}`);
      }
      if (worker.experience) {
        const years = parseInt(worker.experience);
        if (!isNaN(years) && years >= 3) {
          matchScore += 20;
          matchReasons.push(`${years} years experience`);
        }
      }
      if (worker.qualification) {
        matchScore += 15;
        matchReasons.push(`Qualification: ${worker.qualification}`);
      }
      if (worker.assignedSite && job.location && worker.assignedSite.toLowerCase().includes(job.location.toLowerCase())) {
        matchScore += 15;
        matchReasons.push("Location match");
      }
      // Check document compliance by expiry dates
      const hasValidDocs = [worker.trcExpiry, worker.workPermitExpiry]
        .filter(Boolean)
        .every(d => new Date(d!).getTime() > Date.now());
      if (hasValidDocs) {
        matchScore += 20;
        matchReasons.push("Documents compliant");
      }
    }

    const [application] = await db.insert(schema.jobApplications).values({
      jobId,
      workerId,
      stage: "New",
      matchScore: Math.min(matchScore, 100),
      matchReasons: matchReasons,
      notes: notes || null,
    }).returning();

    return res.status(201).json({ application });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to apply" });
  }
});

// GET /api/applications — all applications (Kanban view)
router.get("/applications", authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.query as { jobId?: string };
    const baseQuery = db.select({
      application: schema.jobApplications,
      worker: schema.workers,
      job: schema.jobPostings,
    }).from(schema.jobApplications)
      .innerJoin(schema.workers, eq(schema.jobApplications.workerId, schema.workers.id))
      .innerJoin(schema.jobPostings, eq(schema.jobApplications.jobId, schema.jobPostings.id));

    const applications = jobId
      ? await baseQuery.where(eq(schema.jobApplications.jobId, jobId)).orderBy(desc(schema.jobApplications.appliedAt))
      : await baseQuery.orderBy(desc(schema.jobApplications.appliedAt));

    // Group by stage for Kanban
    const stages = ["New", "Screening", "Interview", "Offer", "Placed", "Active", "Released", "Blacklisted"];
    const kanban: Record<string, Array<Record<string, unknown>>> = {};
    for (const stage of stages) kanban[stage] = [];

    for (const a of applications) {
      const stage = a.application.stage || "New";
      if (!kanban[stage]) kanban[stage] = [];
      kanban[stage].push({
        ...a.application,
        worker: { id: a.worker.id, name: a.worker.name, email: a.worker.email, jobRole: a.worker.jobRole, nationality: a.worker.nationality },
        job: { id: a.job.id, title: a.job.title },
      });
    }

    return res.json({ applications: applications.map(a => ({ ...a.application, worker: a.worker, job: a.job })), kanban });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load applications" });
  }
});

// PATCH /api/applications/:id/stage — move application between pipeline stages (Kanban drag-drop)
router.patch("/applications/:id/stage", authenticateToken, async (req, res) => {
  try {
    const { stage, notes } = req.body as { stage: string; notes?: string };
    const updates: Record<string, unknown> = { stage, updatedAt: new Date() };
    if (notes !== undefined) updates.notes = notes;

    const [updated] = await db.update(schema.jobApplications).set(updates)
      .where(eq(schema.jobApplications.id, String(req.params.id))).returning();
    if (!updated) return res.status(404).json({ error: "Application not found" });

    // Also update worker's pipeline stage
    await db.update(schema.workers).set({ pipelineStage: stage, updatedAt: new Date() })
      .where(eq(schema.workers.id, updated.workerId));

    appendAuditEntry({
      workerId: updated.workerId,
      actor: req.user?.email ?? "admin",
      field: "PIPELINE_STAGE",
      newValue: { stage, applicationId: updated.id },
      action: "stage_change",
    });

    return res.json({ application: updated });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update stage" });
  }
});

// ── Candidate Matching ──────────────────────────────────────────────────────

// GET /api/jobs/:id/matches — find best candidates for a job
router.get("/jobs/:id/matches", authenticateToken, async (req, res) => {
  try {
    const [job] = await db.select().from(schema.jobPostings).where(eq(schema.jobPostings.id, String(req.params.id)));
    if (!job) return res.status(404).json({ error: "Job not found" });

    const workers = await db.select().from(schema.workers);

    const matches = workers.map(w => {
      let score = 0;
      const reasons: string[] = [];

      if (job.requirements) {
        const reqs = job.requirements.toLowerCase();
        if (w.jobRole && reqs.includes(w.jobRole.toLowerCase())) { score += 30; reasons.push(`Role: ${w.jobRole}`); }
        if (w.experience) { const y = parseInt(w.experience); if (!isNaN(y) && y >= 3) { score += 20; reasons.push(`${y}yr exp`); } }
        if (w.qualification) { score += 15; reasons.push(`Qual: ${w.qualification}`); }
      }
      if (w.assignedSite && job.location && w.assignedSite.toLowerCase().includes(job.location.toLowerCase())) {
        score += 15; reasons.push("Location match");
      }
      // Compliance bonus
      const expiryDays = [w.trcExpiry, w.workPermitExpiry, w.contractEndDate]
        .filter((d): d is string => d !== null && d !== undefined)
        .map(d => { const diff = new Date(d).getTime() - Date.now(); return Math.ceil(diff / 86400000); })
        .filter(d => d > 0);
      if (expiryDays.length === 0 || Math.min(...expiryDays) > 60) { score += 20; reasons.push("Compliant"); }

      return { worker: { id: w.id, name: w.name, email: w.email, jobRole: w.jobRole, nationality: w.nationality, experience: w.experience, qualification: w.qualification }, score: Math.min(score, 100), reasons };
    }).filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);

    return res.json({ job: { id: job.id, title: job.title }, matches });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to match candidates" });
  }
});

export default router;
