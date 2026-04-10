/**
 * Legal Consistency Checker
 *
 * Verifies that legal_cases status and legal_snapshots status are consistent.
 * Flags mismatches — does NOT auto-fix. Human reviews and triggers snapshot refresh.
 *
 * Rules:
 * - FILED/UNDER_REVIEW with filing before expiry → snapshot should be PROTECTED_PENDING
 * - REJECTED → snapshot must NOT be PROTECTED_PENDING
 * - APPROVED → snapshot must be VALID
 * - Case exists but no snapshot → flag for review
 * - Snapshot says PROTECTED_PENDING but no FILED/UNDER_REVIEW case → flag
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus } from "./legal-decision-engine.js";

const router = Router();

// ── Valid mappings: case_status → allowed snapshot statuses ──────────────
const VALID_MAPPINGS: Record<string, string[]> = {
  NEW: ["VALID", "EXPIRING_SOON", "EXPIRED_NOT_PROTECTED", "NO_PERMIT", "REVIEW_REQUIRED"],
  DOCUMENTS_PENDING: ["VALID", "EXPIRING_SOON", "EXPIRED_NOT_PROTECTED", "NO_PERMIT", "REVIEW_REQUIRED"],
  READY_TO_FILE: ["VALID", "EXPIRING_SOON", "EXPIRED_NOT_PROTECTED", "REVIEW_REQUIRED"],
  FILED: ["VALID", "EXPIRING_SOON", "PROTECTED_PENDING", "REVIEW_REQUIRED"],
  UNDER_REVIEW: ["PROTECTED_PENDING", "VALID", "REVIEW_REQUIRED"],
  DEFECT_NOTICE: ["PROTECTED_PENDING", "REVIEW_REQUIRED"],
  DECISION_RECEIVED: ["PROTECTED_PENDING", "REVIEW_REQUIRED"],
  APPROVED: ["VALID"],
  REJECTED: ["EXPIRED_NOT_PROTECTED", "REVIEW_REQUIRED", "EXPIRING_SOON"],
  // Legacy statuses
  open: ["VALID", "EXPIRING_SOON", "EXPIRED_NOT_PROTECTED", "NO_PERMIT", "PROTECTED_PENDING", "REVIEW_REQUIRED"],
  resolved: ["VALID"],
  closed: ["VALID"],
};

interface ConsistencyIssue {
  workerId: string;
  workerName: string;
  caseId: string;
  caseStatus: string;
  caseType: string;
  snapshotStatus: string | null;
  rule: string;
  severity: "error" | "warning" | "info";
  description: string;
  suggestedFix: string;
}

// ── GET /api/consistency/check — run full consistency check ──────────────
router.get("/consistency/check", authenticateToken, async (_req, res) => {
  try {
    // Get all active cases with their latest snapshot
    const cases = await db.execute(sql`
      SELECT lc.id as case_id, lc.worker_id, lc.case_type, lc.status as case_status,
        lc.appeal_deadline, w.name as worker_name,
        ls.legal_status as snapshot_status, ls.risk_level, ls.created_at as snapshot_date
      FROM legal_cases lc
      JOIN workers w ON w.id = lc.worker_id
      LEFT JOIN LATERAL (
        SELECT legal_status, risk_level, created_at
        FROM legal_snapshots WHERE worker_id = lc.worker_id
        ORDER BY created_at DESC LIMIT 1
      ) ls ON TRUE
      WHERE lc.status NOT IN ('resolved', 'closed')
        AND (lc.tenant_id IS NULL OR lc.tenant_id != 'test')
      ORDER BY lc.created_at DESC
    `);

    const issues: ConsistencyIssue[] = [];

    for (const row of cases.rows as any[]) {
      const cs = row.case_status;
      const ss = row.snapshot_status;
      const base = { workerId: row.worker_id, workerName: row.worker_name, caseId: row.case_id, caseStatus: cs, caseType: row.case_type, snapshotStatus: ss };

      // Rule 1: Case exists but no snapshot
      if (!ss) {
        issues.push({
          ...base, rule: "NO_SNAPSHOT",
          severity: "warning",
          description: `Case ${cs} exists but no legal snapshot found for worker`,
          suggestedFix: "Run POST /api/legal/snapshot/{workerId} to create snapshot",
        });
        continue;
      }

      // Rule 2: Check valid mappings
      const allowed = VALID_MAPPINGS[cs];
      if (allowed && !allowed.includes(ss)) {
        issues.push({
          ...base, rule: "INVALID_MAPPING",
          severity: "error",
          description: `Case status "${cs}" is inconsistent with snapshot status "${ss}". Allowed: ${allowed.join(", ")}`,
          suggestedFix: `Refresh snapshot or update case status. Current mapping is contradictory.`,
        });
      }

      // Rule 3: REJECTED but still PROTECTED_PENDING
      if (cs === "REJECTED" && ss === "PROTECTED_PENDING") {
        issues.push({
          ...base, rule: "REJECTED_STILL_PROTECTED",
          severity: "error",
          description: "Case REJECTED but snapshot still shows PROTECTED_PENDING — protection ended with rejection",
          suggestedFix: "Refresh snapshot — status should change to EXPIRED_NOT_PROTECTED or REVIEW_REQUIRED",
        });
      }

      // Rule 4: APPROVED but snapshot not VALID
      if (cs === "APPROVED" && ss !== "VALID") {
        issues.push({
          ...base, rule: "APPROVED_NOT_VALID",
          severity: "error",
          description: `Case APPROVED but snapshot shows "${ss}" — should be VALID`,
          suggestedFix: "Refresh snapshot with new permit/TRC dates from the approval decision",
        });
      }

      // Rule 5: FILED/UNDER_REVIEW but snapshot is EXPIRED_NOT_PROTECTED
      if ((cs === "FILED" || cs === "UNDER_REVIEW") && ss === "EXPIRED_NOT_PROTECTED") {
        issues.push({
          ...base, rule: "FILED_BUT_EXPIRED",
          severity: "warning",
          description: `Case ${cs} but snapshot shows EXPIRED_NOT_PROTECTED — check if filing was before expiry for Art.108`,
          suggestedFix: "Verify filing date vs permit expiry. If filed before expiry, update trcFilingDate on worker and refresh snapshot.",
        });
      }

      // Rule 6: Snapshot is PROTECTED_PENDING but no FILED/UNDER_REVIEW case
      if (ss === "PROTECTED_PENDING" && !["FILED", "UNDER_REVIEW", "DEFECT_NOTICE", "DECISION_RECEIVED"].includes(cs)) {
        issues.push({
          ...base, rule: "PROTECTED_WITHOUT_CASE",
          severity: "warning",
          description: `Snapshot shows PROTECTED_PENDING but case is "${cs}" — protection requires filed case`,
          suggestedFix: "Either transition case to FILED or refresh snapshot to remove protection status",
        });
      }

      // Rule 7: Stale snapshot (> 7 days old)
      if (row.snapshot_date) {
        const age = Math.ceil((Date.now() - new Date(row.snapshot_date).getTime()) / 86400000);
        if (age > 7) {
          issues.push({
            ...base, rule: "STALE_SNAPSHOT",
            severity: "info",
            description: `Snapshot is ${age} days old — may not reflect current state`,
            suggestedFix: "Refresh snapshot to ensure current accuracy",
          });
        }
      }
    }

    // ── Cross-system checks (Rules 8-13) ────────────────────────────────
    // Rule 8: Workers with CRITICAL risk but no legal case
    const criticalWorkers = await db.execute(sql`
      SELECT ls.worker_id, w.name FROM legal_snapshots ls
      JOIN workers w ON w.id = ls.worker_id
      WHERE ls.risk_level = 'CRITICAL'
        AND ls.created_at > NOW() - INTERVAL '7 days'
        AND NOT EXISTS (SELECT 1 FROM legal_cases lc WHERE lc.worker_id = ls.worker_id AND lc.status NOT IN ('resolved','closed','APPROVED'))
        AND (w.tenant_id IS NULL OR w.tenant_id != 'test')
      GROUP BY ls.worker_id, w.name
    `);
    for (const cw of criticalWorkers.rows as any[]) {
      issues.push({
        workerId: cw.worker_id, workerName: cw.name, caseId: "", caseStatus: "N/A", caseType: "N/A", snapshotStatus: "CRITICAL",
        rule: "CRITICAL_NO_CASE", severity: "warning" as const,
        description: `Worker has CRITICAL risk but no open legal case`,
        suggestedFix: "Create a legal case to track and resolve the compliance issue",
      });
    }

    // Rule 9: Pending approvals older than 5 days
    const stuckApprovals = await db.execute(sql`
      SELECT COUNT(*)::int as cnt FROM legal_approvals WHERE status = 'pending' AND created_at < NOW() - INTERVAL '5 days'
    `);
    const stuckCount = (stuckApprovals.rows[0] as any)?.cnt ?? 0;
    if (stuckCount > 0) {
      issues.push({
        workerId: "", workerName: "System", caseId: "", caseStatus: "N/A", caseType: "N/A", snapshotStatus: "N/A",
        rule: "STUCK_APPROVALS", severity: "warning" as const,
        description: `${stuckCount} approval(s) pending for more than 5 days`,
        suggestedFix: "Review and process pending approvals in the approval queue",
      });
    }

    // Rule 10: Documents in draft status older than 7 days
    const stuckDocs = await db.execute(sql`
      SELECT COUNT(*)::int as cnt FROM legal_documents WHERE status = 'draft' AND created_at < NOW() - INTERVAL '7 days'
    `);
    const stuckDocCount = (stuckDocs.rows[0] as any)?.cnt ?? 0;
    if (stuckDocCount > 0) {
      issues.push({
        workerId: "", workerName: "System", caseId: "", caseStatus: "N/A", caseType: "N/A", snapshotStatus: "N/A",
        rule: "STUCK_DOCUMENTS", severity: "info" as const,
        description: `${stuckDocCount} document(s) in draft for more than 7 days`,
        suggestedFix: "Review draft documents — approve, edit, or delete",
      });
    }

    // Rule 11: Evidence with low OCR confidence not reviewed
    const lowConfEvidence = await db.execute(sql`
      SELECT COUNT(*)::int as cnt FROM legal_evidence WHERE ocr_confidence IS NOT NULL AND ocr_confidence < 70 AND verified = false
    `);
    const lowConfCount = (lowConfEvidence.rows[0] as any)?.cnt ?? 0;
    if (lowConfCount > 0) {
      issues.push({
        workerId: "", workerName: "System", caseId: "", caseStatus: "N/A", caseType: "N/A", snapshotStatus: "N/A",
        rule: "LOW_CONFIDENCE_EVIDENCE", severity: "warning" as const,
        description: `${lowConfCount} evidence document(s) with low OCR confidence (<70%) not verified`,
        suggestedFix: "Review and manually verify these documents",
      });
    }

    // Rule 12: Suggestions pending for more than 3 days
    const stuckSuggestions = await db.execute(sql`
      SELECT COUNT(*)::int as cnt FROM legal_suggestions WHERE status = 'pending' AND created_at < NOW() - INTERVAL '3 days'
    `);
    const stuckSugCount = (stuckSuggestions.rows[0] as any)?.cnt ?? 0;
    if (stuckSugCount > 5) {
      issues.push({
        workerId: "", workerName: "System", caseId: "", caseStatus: "N/A", caseType: "N/A", snapshotStatus: "N/A",
        rule: "STALE_SUGGESTIONS", severity: "info" as const,
        description: `${stuckSugCount} suggestions pending for more than 3 days`,
        suggestedFix: "Act on or dismiss pending suggestions",
      });
    }

    // Rule 13: Workers with active cases but no recent snapshot
    const caseNoSnap = await db.execute(sql`
      SELECT lc.worker_id, w.name FROM legal_cases lc
      JOIN workers w ON w.id = lc.worker_id
      WHERE lc.status NOT IN ('resolved','closed','APPROVED')
        AND NOT EXISTS (SELECT 1 FROM legal_snapshots ls WHERE ls.worker_id = lc.worker_id AND ls.created_at > NOW() - INTERVAL '14 days')
        AND (w.tenant_id IS NULL OR w.tenant_id != 'test')
      GROUP BY lc.worker_id, w.name
    `);
    for (const cn of caseNoSnap.rows as any[]) {
      issues.push({
        workerId: cn.worker_id, workerName: cn.name, caseId: "", caseStatus: "N/A", caseType: "N/A", snapshotStatus: "N/A",
        rule: "CASE_NO_RECENT_SNAPSHOT", severity: "warning" as const,
        description: `Active case but no legal snapshot in last 14 days`,
        suggestedFix: "Run legal scan or create snapshot for this worker",
      });
    }

    // Sort: errors first, then warnings, then info
    issues.sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    return res.json({
      totalCases: cases.rows.length,
      totalIssues: issues.length,
      errors: issues.filter(i => i.severity === "error").length,
      warnings: issues.filter(i => i.severity === "warning").length,
      info: issues.filter(i => i.severity === "info").length,
      consistent: issues.filter(i => i.severity === "error").length === 0,
      issues,
      mappingRules: VALID_MAPPINGS,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/consistency/refresh/:workerId — refresh snapshot for worker ─
router.post("/consistency/refresh/:workerId", authenticateToken, async (req, res) => {
  try {
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${req.params.workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    // Check if worker has a filed case — affects trcApplicationPending
    const filedCase = await db.execute(sql`
      SELECT id, status FROM legal_cases
      WHERE worker_id = ${req.params.workerId}
        AND status IN ('FILED', 'UNDER_REVIEW', 'DEFECT_NOTICE', 'DECISION_RECEIVED')
      LIMIT 1
    `);
    const hasFiled = filedCase.rows.length > 0;

    const input = {
      workerId: w.id, workerName: w.name ?? "", nationality: w.nationality ?? "",
      permitExpiry: w.work_permit_expiry ?? null, trcExpiry: w.trc_expiry ?? null,
      trcFilingDate: w.trc_filing_date ?? null,
      trcApplicationPending: hasFiled, // derive from case status
      employerContinuity: true, roleContinuity: true, formalDefect: false,
      contractEndDate: w.contract_end_date ?? null, bhpExpiry: w.bhp_status ?? null,
      medicalExpiry: w.badania_lek_expiry ?? null, oswiadczenieExpiry: w.oswiadczenie_expiry ?? null,
      hasValidPassport: true, evidenceSubmitted: [],
    };

    const result = evaluateLegalStatus(input);

    const [snapshot] = await db.insert(schema.legalSnapshots).values({
      workerId: req.params.workerId,
      legalStatus: result.legalStatus,
      legalBasis: result.legalBasis,
      riskLevel: result.riskLevel,
      conditions: result.conditions,
      warnings: result.warnings,
      requiredActions: result.requiredActions,
      nationality: w.nationality,
      snapshotData: { input, result, refreshedFrom: "consistency_check", caseContext: hasFiled ? "has_filed_case" : "no_filed_case" },
      createdBy: "consistency-refresh",
    }).returning();

    return res.json({
      refreshed: true,
      workerId: req.params.workerId,
      workerName: w.name,
      newStatus: result.legalStatus,
      riskLevel: result.riskLevel,
      caseContextUsed: hasFiled,
      snapshotId: snapshot.id,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
