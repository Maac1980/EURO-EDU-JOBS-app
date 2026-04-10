/**
 * Legal Tracking Card — one authoritative compliance view per worker.
 * Every field from the architecture spec in one API response.
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

router.get("/legal-card/:workerId", authenticateToken, async (req, res) => {
  try {
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${req.params.workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    const now = new Date();
    const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000) : null;

    // Get latest snapshot
    const snapRows = await db.select().from(schema.legalSnapshots)
      .where(eq(schema.legalSnapshots.workerId, req.params.workerId))
      .orderBy(desc(schema.legalSnapshots.createdAt)).limit(1);

    // Get active case
    const caseRows = await db.execute(sql`
      SELECT * FROM legal_cases WHERE worker_id = ${req.params.workerId}
        AND status NOT IN ('resolved','closed','APPROVED') ORDER BY created_at DESC LIMIT 1
    `);

    // Get evidence count
    const evCount = await db.execute(sql`
      SELECT COUNT(*)::int as total,
        COUNT(CASE WHEN verified = true THEN 1 END)::int as verified
      FROM legal_evidence WHERE worker_id = ${req.params.workerId}
    `);

    // Get documents count
    const docCount = await db.execute(sql`
      SELECT COUNT(*)::int as total,
        COUNT(CASE WHEN status = 'approved' THEN 1 END)::int as approved
      FROM legal_documents WHERE worker_id = ${req.params.workerId}
    `);

    const card = {
      // Identity
      workerId: w.id,
      name: w.name ?? "—",
      nationality: w.nationality ?? "—",
      pesel: w.pesel ?? "—",
      email: w.email ?? "—",
      phone: w.phone ?? "—",

      // Residence & Work Authorization
      residenceBasis: w.residence_basis ?? "Unknown",
      rightToWorkBasis: w.right_to_work_basis ?? "Unknown",
      permitType: w.permit_type ?? w.visa_type ?? "—",
      permitNumber: w.permit_number ?? "—",
      permitIssueDate: w.permit_issue_date ?? null,
      permitExpiry: w.trc_expiry ?? w.work_permit_expiry ?? null,
      permitExpiryDays: daysUntil(w.trc_expiry ?? w.work_permit_expiry),
      permitAuthority: w.permit_authority ?? "—",

      // Contract
      contractType: w.contract_type ?? "—",
      contractSignedDate: w.contract_signed_date ?? null,
      contractEndDate: w.contract_end_date ?? null,
      contractEndDays: daysUntil(w.contract_end_date),
      contractSubmittedToAuthority: w.contract_submitted_to_authority ?? null,

      // Consistency Checks
      salaryConsistencyOk: w.salary_consistency_ok ?? true,
      roleConsistencyOk: w.role_consistency_ok ?? true,
      locationConsistencyOk: w.location_consistency_ok ?? true,
      hoursFteConsistencyOk: w.hours_fte_consistency_ok ?? true,

      // Documents on File
      residenceDocOnFile: w.residence_doc_on_file ?? false,
      workAuthDocOnFile: w.work_auth_doc_on_file ?? false,
      translationRequired: w.translation_required ?? false,
      translationCompleted: w.translation_completed ?? false,
      swornTranslationRequired: w.sworn_translation_required ?? false,
      swornTranslationCompleted: w.sworn_translation_completed ?? false,
      mandatoryDocsComplete: w.mandatory_docs_complete ?? false,

      // Safety Training & Medical
      bhpExpiry: w.bhp_status ?? null,
      bhpExpiryDays: daysUntil(w.bhp_status),
      medicalExpiry: w.badania_lek_expiry ?? null,
      medicalExpiryDays: daysUntil(w.badania_lek_expiry),

      // Verification & Risk
      lastVerificationDate: w.last_verification_date ?? null,
      nextReviewDate: w.next_review_date ?? null,
      riskLevel: w.risk_level ?? snapRows[0]?.riskLevel ?? "MEDIUM",
      complianceStatus: w.compliance_status_v2 ?? "PENDING_REVIEW",
      blockedReason: w.blocked_reason ?? null,
      retentionUntil: w.retention_until ?? null,

      // Domain Statuses (4 dimensions)
      recruitmentStage: w.recruitment_stage ?? "NEW",
      workerStatus: w.worker_status ?? "BENCH",
      legalCaseStatus: w.legal_case_status ?? "NOT_STARTED",

      // Legal Snapshot
      snapshot: snapRows[0] ? {
        legalStatus: snapRows[0].legalStatus,
        legalBasis: snapRows[0].legalBasis,
        riskLevel: snapRows[0].riskLevel,
        warnings: snapRows[0].warnings,
        requiredActions: snapRows[0].requiredActions,
        createdAt: snapRows[0].createdAt,
      } : null,

      // Active Case
      activeCase: caseRows.rows.length > 0 ? {
        id: (caseRows.rows[0] as any).id,
        type: (caseRows.rows[0] as any).case_type,
        status: (caseRows.rows[0] as any).status,
        nextAction: (caseRows.rows[0] as any).next_action,
        appealDeadline: (caseRows.rows[0] as any).appeal_deadline,
      } : null,

      // Evidence & Documents
      evidence: {
        total: (evCount.rows[0] as any)?.total ?? 0,
        verified: (evCount.rows[0] as any)?.verified ?? 0,
      },
      documents: {
        total: (docCount.rows[0] as any)?.total ?? 0,
        approved: (docCount.rows[0] as any)?.approved ?? 0,
      },

      // Assignment
      assignedSite: w.assigned_site ?? "—",
      jobRole: w.job_role ?? "—",
      hourlyRate: w.hourly_netto_rate ?? 0,
    };

    return res.json({ card });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/legal-card/:workerId — update tracking card fields ───────
router.patch("/legal-card/:workerId", authenticateToken, async (req, res) => {
  try {
    const fields = req.body as Record<string, any>;
    const allowed = [
      "residence_basis", "right_to_work_basis", "permit_type", "permit_number",
      "permit_issue_date", "permit_authority", "contract_signed_date",
      "contract_submitted_to_authority", "salary_consistency_ok", "role_consistency_ok",
      "location_consistency_ok", "hours_fte_consistency_ok", "residence_doc_on_file",
      "work_auth_doc_on_file", "translation_required", "translation_completed",
      "sworn_translation_required", "sworn_translation_completed", "mandatory_docs_complete",
      "last_verification_date", "next_review_date", "risk_level", "blocked_reason",
      "retention_until",
    ];

    const updates: string[] = ["updated_at = NOW()"];
    for (const [key, val] of Object.entries(fields)) {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (allowed.includes(snakeKey) && val !== undefined) {
        const sqlVal = val === null ? "NULL" : typeof val === "boolean" ? String(val) : `'${String(val).replace(/'/g, "''")}'`;
        updates.push(`${snakeKey} = ${sqlVal}`);
      }
    }

    if (updates.length <= 1) return res.status(400).json({ error: "No valid fields to update" });

    await db.execute(sql.raw(`UPDATE workers SET ${updates.join(", ")} WHERE id = '${req.params.workerId}'`));
    return res.json({ success: true, fieldsUpdated: updates.length - 1 });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
