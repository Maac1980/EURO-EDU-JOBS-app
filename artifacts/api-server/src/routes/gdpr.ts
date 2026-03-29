import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import { authenticateToken, requireAdmin, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { appendAuditEntry } from "./audit.js";

const router = Router();

// GET /api/gdpr/requests — list all GDPR requests
router.get("/gdpr/requests", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const requests = await db.select({
      request: schema.gdprRequests,
      worker: schema.workers,
    }).from(schema.gdprRequests)
      .innerJoin(schema.workers, eq(schema.gdprRequests.workerId, schema.workers.id))
      .orderBy(desc(schema.gdprRequests.requestedAt));
    return res.json({
      requests: requests.map(r => ({
        ...r.request,
        worker: { id: r.worker.id, name: r.worker.name, email: r.worker.email },
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load GDPR requests" });
  }
});

// POST /api/gdpr/requests — create a GDPR request
router.post("/gdpr/requests", authenticateToken, async (req, res) => {
  try {
    const { workerId, requestType, notes } = req.body as {
      workerId: string; requestType: string; notes?: string;
    };
    if (!workerId || !requestType) {
      return res.status(400).json({ error: "workerId and requestType are required" });
    }
    if (!["export", "erasure", "consent_withdrawal"].includes(requestType)) {
      return res.status(400).json({ error: "requestType must be: export, erasure, or consent_withdrawal" });
    }

    const [request] = await db.insert(schema.gdprRequests).values({
      workerId, requestType, notes: notes || null,
    }).returning();

    // Update worker GDPR tracking
    if (requestType === "erasure") {
      await db.update(schema.workers).set({ gdprErasureRequestedAt: new Date() })
        .where(eq(schema.workers.id, workerId));
    }

    appendAuditEntry({
      workerId, actor: req.user?.email ?? "system",
      field: "GDPR_REQUEST", newValue: { requestType, requestId: request.id },
      action: "gdpr_request",
    });

    return res.status(201).json({ request });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create GDPR request" });
  }
});

// POST /api/gdpr/requests/:id/process — process a GDPR request
router.post("/gdpr/requests/:id/process", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const [request] = await db.select().from(schema.gdprRequests).where(eq(schema.gdprRequests.id, id));
    if (!request) return res.status(404).json({ error: "Request not found" });

    if (request.requestType === "export") {
      // Export all worker data
      const [worker] = await db.select().from(schema.workers).where(eq(schema.workers.id, request.workerId));
      const payroll = await db.select().from(schema.payrollRecords).where(eq(schema.payrollRecords.workerId, request.workerId));
      const notes = await db.select().from(schema.workerNotes).where(eq(schema.workerNotes.workerId, request.workerId));
      const dailyLogs = await db.select().from(schema.portalDailyLogs).where(eq(schema.portalDailyLogs.workerId, request.workerId));
      const attachments = await db.select().from(schema.fileAttachments).where(eq(schema.fileAttachments.workerId, request.workerId));

      const exportData = { worker, payroll, notes, dailyLogs, attachments, exportedAt: new Date().toISOString() };

      await db.update(schema.workers).set({ gdprDataExportedAt: new Date() })
        .where(eq(schema.workers.id, request.workerId));
      await db.update(schema.gdprRequests).set({
        status: "completed", completedAt: new Date(), processedBy: req.user?.email,
      }).where(eq(schema.gdprRequests.id, id));

      return res.json({ request: { ...request, status: "completed" }, exportData });
    }

    if (request.requestType === "erasure") {
      // Anonymize worker data (keep record for legal compliance but remove PII)
      await db.update(schema.workers).set({
        name: "[ERASED]", email: null, phone: null, pesel: null, nip: null,
        iban: null, nationality: null, visaType: null,
        gdprErasedAt: new Date(), updatedAt: new Date(),
      }).where(eq(schema.workers.id, request.workerId));

      // Delete related data
      await db.delete(schema.workerNotes).where(eq(schema.workerNotes.workerId, request.workerId));
      await db.delete(schema.portalDailyLogs).where(eq(schema.portalDailyLogs.workerId, request.workerId));
      await db.delete(schema.fileAttachments).where(eq(schema.fileAttachments.workerId, request.workerId));

      await db.update(schema.gdprRequests).set({
        status: "completed", completedAt: new Date(), processedBy: req.user?.email,
      }).where(eq(schema.gdprRequests.id, id));

      appendAuditEntry({
        workerId: request.workerId, actor: req.user?.email ?? "admin",
        field: "GDPR_ERASURE", action: "erasure_completed",
      });

      return res.json({ success: true, message: "Worker data erased per GDPR request" });
    }

    if (request.requestType === "consent_withdrawal") {
      await db.update(schema.workers).set({
        gdprConsentGiven: false, rodoConsentDate: null, updatedAt: new Date(),
      }).where(eq(schema.workers.id, request.workerId));

      await db.update(schema.gdprRequests).set({
        status: "completed", completedAt: new Date(), processedBy: req.user?.email,
      }).where(eq(schema.gdprRequests.id, id));

      return res.json({ success: true, message: "Consent withdrawn" });
    }

    return res.status(400).json({ error: "Unknown request type" });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to process request" });
  }
});

// POST /api/gdpr/consent/:workerId — record GDPR consent
router.post("/gdpr/consent/:workerId", authenticateToken, async (req, res) => {
  try {
    const workerId = String(req.params.workerId);
    await db.update(schema.workers).set({
      gdprConsentGiven: true,
      gdprConsentDate: new Date(),
      rodoConsentDate: new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    }).where(eq(schema.workers.id, workerId));

    appendAuditEntry({
      workerId, actor: req.user?.email ?? "system",
      field: "GDPR_CONSENT", action: "consent_given",
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to record consent" });
  }
});

export default router;
