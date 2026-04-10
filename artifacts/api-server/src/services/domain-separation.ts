/**
 * Domain Separation Service — 4 distinct status dimensions per worker.
 * These NEVER mix. Each is determined by different business logic.
 *
 * 1. recruitment_stage — where in hiring pipeline
 * 2. worker_status — operational state
 * 3. compliance_status — document/legal compliance
 * 4. legal_case_status — TRC/permit case progress
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus } from "./legal-decision-engine.js";

const router = Router();

// ── Enums (locked) ──────────────────────────────────────────────────────
export const RECRUITMENT_STAGES = ["NEW", "SCREENING", "INTERVIEW", "OFFER_SENT", "OFFER_ACCEPTED", "PLACED", "REJECTED"] as const;
export const WORKER_STATUSES = ["BENCH", "ACTIVE", "ASSIGNED", "RELEASED", "BLOCKED"] as const;
export const COMPLIANCE_STATUSES = ["COMPLIANT", "WARNING", "BLOCKED", "EXPIRED", "PENDING_REVIEW"] as const;
export const LEGAL_CASE_STATUSES = ["NOT_STARTED", "COLLECTING_DOCS", "READY_TO_SUBMIT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "CLOSED"] as const;

// ── Derive all 4 statuses for a worker ──────────────────────────────────
function deriveStatuses(w: any) {
  // 1. Recruitment stage — from pipeline_stage
  const pipelineMap: Record<string, string> = {
    New: "NEW", Screening: "SCREENING", Interview: "INTERVIEW",
    "Offer Sent": "OFFER_SENT", Placed: "PLACED", Active: "PLACED",
    Released: "REJECTED", Blacklisted: "REJECTED",
  };
  const recruitmentStage = pipelineMap[w.pipeline_stage] ?? "NEW";

  // 2. Worker status — from assignment and activity
  let workerStatus = "BENCH";
  if (w.assigned_site && w.assigned_site !== "Available" && w.assigned_site !== "") {
    workerStatus = "ASSIGNED";
    if (w.pipeline_stage === "Active" || w.pipeline_stage === "Placed") workerStatus = "ACTIVE";
  }
  if (w.pipeline_stage === "Released") workerStatus = "RELEASED";
  if (w.blocked_reason) workerStatus = "BLOCKED";

  // 3. Compliance status — from document expiry dates
  const now = new Date();
  const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000) : null;
  const bhpDays = daysUntil(w.bhp_status);
  const medDays = daysUntil(w.badania_lek_expiry);
  const trcDays = daysUntil(w.trc_expiry);
  const permitDays = daysUntil(w.work_permit_expiry);
  const contractDays = daysUntil(w.contract_end_date);

  let complianceStatus = "COMPLIANT";
  const anyExpired = [bhpDays, medDays, trcDays, permitDays, contractDays].some(d => d !== null && d < 0);
  const anyWarning = [bhpDays, medDays, trcDays, permitDays, contractDays].some(d => d !== null && d >= 0 && d < 30);
  const allNull = [w.bhp_status, w.badania_lek_expiry, w.trc_expiry, w.work_permit_expiry].every(d => !d);

  if (anyExpired) complianceStatus = "EXPIRED";
  else if (w.blocked_reason) complianceStatus = "BLOCKED";
  else if (anyWarning) complianceStatus = "WARNING";
  else if (allNull) complianceStatus = "PENDING_REVIEW";

  // 4. Legal case status — from latest legal case
  let legalCaseStatus = "NOT_STARTED";
  // Will be set by caller from legal_cases query

  return { recruitmentStage, workerStatus, complianceStatus, legalCaseStatus };
}

// ── POST /api/domain/sync — sync all 4 statuses for all workers ─────────
router.post("/domain/sync", authenticateToken, async (_req, res) => {
  try {
    const workers = await db.execute(sql`
      SELECT * FROM workers WHERE pipeline_stage IN ('Active','Placed','Screening','New','Interview')
        AND (tenant_id IS NULL OR tenant_id != 'test')
    `);

    let updated = 0;
    for (const w of workers.rows as any[]) {
      const statuses = deriveStatuses(w);

      // Get latest legal case status
      const caseRow = await db.execute(sql`
        SELECT status FROM legal_cases WHERE worker_id = ${w.id}
          AND status NOT IN ('resolved','closed') ORDER BY created_at DESC LIMIT 1
      `);
      if (caseRow.rows.length > 0) {
        const cs = (caseRow.rows[0] as any).status;
        const caseMap: Record<string, string> = {
          NEW: "COLLECTING_DOCS", DOCUMENTS_PENDING: "COLLECTING_DOCS",
          READY_TO_FILE: "READY_TO_SUBMIT", FILED: "SUBMITTED",
          UNDER_REVIEW: "UNDER_REVIEW", DEFECT_NOTICE: "UNDER_REVIEW",
          DECISION_RECEIVED: "UNDER_REVIEW", APPROVED: "APPROVED",
          REJECTED: "REJECTED", open: "COLLECTING_DOCS",
        };
        statuses.legalCaseStatus = caseMap[cs] ?? "NOT_STARTED";
      }

      await db.execute(sql`
        UPDATE workers SET
          recruitment_stage = ${statuses.recruitmentStage},
          worker_status = ${statuses.workerStatus},
          compliance_status_v2 = ${statuses.complianceStatus},
          legal_case_status = ${statuses.legalCaseStatus},
          updated_at = NOW()
        WHERE id = ${w.id}
      `);
      updated++;
    }

    return res.json({ synced: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/domain/statuses/:workerId — get all 4 for one worker ───────
router.get("/domain/statuses/:workerId", authenticateToken, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT recruitment_stage, worker_status, compliance_status_v2, legal_case_status,
        risk_level, blocked_reason, mandatory_docs_complete, last_verification_date, next_review_date
      FROM workers WHERE id = ${req.params.workerId}
    `);
    if (rows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    return res.json(rows.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/domain/summary — counts per status dimension ───────────────
router.get("/domain/summary", authenticateToken, async (_req, res) => {
  try {
    const recruitment = await db.execute(sql`
      SELECT recruitment_stage, COUNT(*)::int as cnt FROM workers
      WHERE tenant_id IS NULL OR tenant_id != 'test'
      GROUP BY recruitment_stage ORDER BY cnt DESC
    `);
    const workerStatus = await db.execute(sql`
      SELECT worker_status, COUNT(*)::int as cnt FROM workers
      WHERE tenant_id IS NULL OR tenant_id != 'test'
      GROUP BY worker_status ORDER BY cnt DESC
    `);
    const compliance = await db.execute(sql`
      SELECT compliance_status_v2, COUNT(*)::int as cnt FROM workers
      WHERE tenant_id IS NULL OR tenant_id != 'test'
      GROUP BY compliance_status_v2 ORDER BY cnt DESC
    `);
    const legalCase = await db.execute(sql`
      SELECT legal_case_status, COUNT(*)::int as cnt FROM workers
      WHERE tenant_id IS NULL OR tenant_id != 'test'
      GROUP BY legal_case_status ORDER BY cnt DESC
    `);

    return res.json({
      recruitment: recruitment.rows,
      workerStatus: workerStatus.rows,
      compliance: compliance.rows,
      legalCase: legalCase.rows,
      enums: { RECRUITMENT_STAGES, WORKER_STATUSES, COMPLIANCE_STATUSES, LEGAL_CASE_STATUSES },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
