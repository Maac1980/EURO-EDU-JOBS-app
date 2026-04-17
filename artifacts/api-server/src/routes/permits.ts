import { Router } from "express";
import { db, schema } from "../db/index.js";
import { and, eq, desc } from "drizzle-orm";
import { authenticateToken, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { requireTenant } from "../lib/tenancy.js";

const router = Router();

// Government fee schedule (2026 rates)
const FEE_SCHEDULE: Record<string, { fee: number; label: string }> = {
  type_a: { fee: 100, label: "Type A Work Permit (general employment)" },
  type_b: { fee: 200, label: "Type B Work Permit (board member)" },
  type_c: { fee: 100, label: "Type C Work Permit (posted worker)" },
  seasonal: { fee: 30, label: "Seasonal Work Permit (up to 9 months)" },
  oswiadczenie: { fee: 100, label: "Oświadczenie (employer declaration, up to 24 months)" },
};

// Document checklists per permit type
const CHECKLISTS: Record<string, Array<{ name: string; required: boolean }>> = {
  type_a: [
    { name: "Valid passport (min 3 months beyond stay)", required: true },
    { name: "Completed application form", required: true },
    { name: "Employer's NIP/KRS registration", required: true },
    { name: "Labor market test (informacja starosty)", required: true },
    { name: "Employment contract draft", required: true },
    { name: "Proof of accommodation", required: true },
    { name: "Health insurance confirmation", required: true },
    { name: "Proof of government fee payment (PLN 100)", required: true },
    { name: "2 passport photos (35x45mm)", required: true },
    { name: "Diploma/qualification certificates", required: false },
  ],
  seasonal: [
    { name: "Valid passport", required: true },
    { name: "Seasonal work application form", required: true },
    { name: "Employer registration in seasonal work system", required: true },
    { name: "Proof of accommodation", required: true },
    { name: "Health insurance", required: true },
    { name: "Government fee payment (PLN 30)", required: true },
  ],
  oswiadczenie: [
    { name: "Valid passport", required: true },
    { name: "Oświadczenie form (employer declaration)", required: true },
    { name: "Employer's NIP registration", required: true },
    { name: "Employment contract draft", required: true },
    { name: "Government fee payment (PLN 100)", required: true },
    { name: "Copy of worker's passport data page", required: true },
  ],
  type_b: [
    { name: "Valid passport", required: true },
    { name: "Application form", required: true },
    { name: "Company registration (KRS)", required: true },
    { name: "Board resolution appointing the foreigner", required: true },
    { name: "Government fee payment (PLN 200)", required: true },
    { name: "Proof of company tax payments", required: true },
  ],
  type_c: [
    { name: "Valid passport", required: true },
    { name: "Application form", required: true },
    { name: "Foreign employer documentation", required: true },
    { name: "Posting agreement", required: true },
    { name: "Government fee payment (PLN 100)", required: true },
  ],
};

// GET /api/permits — list all work permit applications
router.get("/permits", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const tenantId = requireTenant(req);
    const permits = await db.select({
      permit: schema.workPermitApplications,
      worker: schema.workers,
    }).from(schema.workPermitApplications)
      .innerJoin(schema.workers, eq(schema.workPermitApplications.workerId, schema.workers.id))
      .where(eq(schema.workPermitApplications.tenantId, tenantId))
      .orderBy(desc(schema.workPermitApplications.createdAt))
      .limit(limit)
      .offset(offset);
    return res.json({
      permits: permits.map(p => ({
        ...p.permit,
        worker: { id: p.worker.id, name: p.worker.name, nationality: p.worker.nationality },
      })),
      limit,
      offset,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load permits" });
  }
});

// POST /api/permits — create new permit application
router.post("/permits", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const { workerId, permitType, applicationNumber, portal, notes } = req.body as any;
    if (!workerId || !permitType) return res.status(400).json({ error: "workerId and permitType required" });

    const checklist = (CHECKLISTS[permitType] ?? CHECKLISTS.type_a).map(d => ({ ...d, uploaded: false, verified: false }));
    const fee = FEE_SCHEDULE[permitType]?.fee ?? 100;

    // Calculate 7-day reporting deadline from submission
    const reportingDeadline = new Date();
    reportingDeadline.setDate(reportingDeadline.getDate() + 7);

    const actor = req.user?.email ?? "admin";
    const tenantId = requireTenant(req);

    const permit = await db.transaction(async (tx) => {
      const [p] = await tx.insert(schema.workPermitApplications).values({
        workerId,
        permitType,
        applicationNumber: applicationNumber || null,
        portal: portal || "mos",
        documents: checklist,
        governmentFee: fee.toString(),
        reportingDeadline: reportingDeadline.toISOString().slice(0, 10),
        notes: notes || null,
        tenantId,
      }).returning();

      await tx.insert(schema.auditEntries).values({
        workerId,
        workerName: null,
        actor,
        field: "WORK_PERMIT",
        oldValue: null,
        newValue: { permitType, id: p.id },
        action: "permit_created",
      });

      return p;
    });

    return res.status(201).json({ permit });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create permit" });
  }
});

// PATCH /api/permits/:id — update permit status/documents
router.patch("/permits/:id", authenticateToken, async (req, res) => {
  try {
    const body = req.body;
    const updates: any = { updatedAt: new Date() };
    if (body.status) updates.status = body.status;
    if (body.applicationNumber) updates.applicationNumber = body.applicationNumber;
    if (body.submittedAt) updates.submittedAt = new Date(body.submittedAt);
    if (body.decisionDate) updates.decisionDate = body.decisionDate;
    if (body.expiryDate) updates.expiryDate = body.expiryDate;
    if (body.documents) updates.documents = body.documents;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.reportingDeadline) updates.reportingDeadline = body.reportingDeadline;

    const tenantId = requireTenant(req);
    const [updated] = await db.update(schema.workPermitApplications).set(updates)
      .where(and(eq(schema.workPermitApplications.id, String(req.params.id)), eq(schema.workPermitApplications.tenantId, tenantId))).returning();
    if (!updated) return res.status(404).json({ error: "Permit not found" });
    return res.json({ permit: updated });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update permit" });
  }
});

// GET /api/permits/deadlines — upcoming deadlines (7-day reporting, renewals)
router.get("/permits/deadlines", authenticateToken, async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const tenantId = requireTenant(req);
    const permits = await db.select({
      permit: schema.workPermitApplications,
      worker: schema.workers,
    }).from(schema.workPermitApplications)
      .innerJoin(schema.workers, eq(schema.workPermitApplications.workerId, schema.workers.id))
      .where(eq(schema.workPermitApplications.tenantId, tenantId));

    const deadlines = permits
      .filter(p => {
        if (p.permit.reportingDeadline) {
          const d = new Date(p.permit.reportingDeadline);
          if (d <= thirtyDaysFromNow) return true;
        }
        if (p.permit.expiryDate) {
          const d = new Date(p.permit.expiryDate);
          if (d <= thirtyDaysFromNow) return true;
        }
        return false;
      })
      .map(p => ({
        ...p.permit,
        worker: { id: p.worker.id, name: p.worker.name },
        reportingDaysLeft: p.permit.reportingDeadline ? Math.ceil((new Date(p.permit.reportingDeadline).getTime() - Date.now()) / 86400000) : null,
        expiryDaysLeft: p.permit.expiryDate ? Math.ceil((new Date(p.permit.expiryDate).getTime() - Date.now()) / 86400000) : null,
      }))
      .sort((a, b) => (a.reportingDaysLeft ?? 999) - (b.reportingDaysLeft ?? 999));

    return res.json({ deadlines });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load deadlines" });
  }
});

// GET /api/permits/fees — cost calculator
router.get("/permits/fees", (_req, res) => {
  return res.json({ fees: FEE_SCHEDULE });
});

// GET /api/permits/checklist/:permitType — document checklist
router.get("/permits/checklist/:permitType", (req, res) => {
  const type = String(req.params.permitType);
  const checklist = CHECKLISTS[type];
  if (!checklist) return res.status(404).json({ error: "Unknown permit type" });
  return res.json({ permitType: type, checklist, fee: FEE_SCHEDULE[type] });
});

// DELETE /api/permits/:id
router.delete("/permits/:id", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  const tenantId = requireTenant(req);
  await db.delete(schema.workPermitApplications).where(
    and(eq(schema.workPermitApplications.id, String(req.params.id)), eq(schema.workPermitApplications.tenantId, tenantId))
  );
  return res.json({ success: true });
});

export default router;
