/**
 * Case Engine — Phase 3
 * Full case lifecycle: NEW → DOCUMENTS_PENDING → READY_TO_FILE → FILED →
 * UNDER_REVIEW → DEFECT_NOTICE → DECISION_RECEIVED → APPROVED / REJECTED
 *
 * Explicit blocking logic. Package readiness. No AI decisions.
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

// ── Case status transitions ─────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  NEW: ["DOCUMENTS_PENDING"],
  DOCUMENTS_PENDING: ["READY_TO_FILE", "NEW"],
  READY_TO_FILE: ["FILED", "DOCUMENTS_PENDING"],
  FILED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["DEFECT_NOTICE", "DECISION_RECEIVED"],
  DEFECT_NOTICE: ["UNDER_REVIEW", "DOCUMENTS_PENDING"],
  DECISION_RECEIVED: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: ["NEW"], // can restart
};

// ── Blockers ─────────────────────────────────────────────────────────────────
interface Blocker {
  id: string;
  field: string;
  label: string;
  severity: "hard" | "soft"; // hard = cannot proceed, soft = warning
}

function detectBlockers(w: any, caseType: string): Blocker[] {
  const blockers: Blocker[] = [];
  if (!w.name) blockers.push({ id: "no_name", field: "name", label: "Worker name missing", severity: "hard" });
  if (!w.nationality) blockers.push({ id: "no_nationality", field: "nationality", label: "Nationality not set", severity: "hard" });

  if (caseType === "TRC" || caseType === "work_permit") {
    if (!w.trc_expiry && !w.work_permit_expiry) blockers.push({ id: "no_permit_date", field: "permit_expiry", label: "No permit expiry date — cannot determine filing urgency", severity: "hard" });
  }

  // Check documents
  const evidenceCount = 0; // will be set by caller
  if (caseType === "TRC") {
    if (!w.pesel && !w.nationality) blockers.push({ id: "no_id", field: "pesel", label: "No PESEL or nationality — cannot file TRC", severity: "hard" });
  }
  if (caseType === "Appeal") {
    // Need rejection decision uploaded
    blockers.push({ id: "need_rejection", field: "rejection_decision", label: "Upload rejection decision letter", severity: "soft" });
  }

  if (!w.bhp_status || new Date(w.bhp_status) < new Date()) {
    blockers.push({ id: "bhp_expired", field: "bhp_status", label: "BHP training expired — schedule before filing", severity: "soft" });
  }
  if (!w.badania_lek_expiry || new Date(w.badania_lek_expiry) < new Date()) {
    blockers.push({ id: "medical_expired", field: "badania_lek_expiry", label: "Medical examination expired", severity: "soft" });
  }

  return blockers;
}

function determineNextAction(status: string, caseType: string, blockers: Blocker[]): string {
  const hardBlockers = blockers.filter(b => b.severity === "hard");

  switch (status) {
    case "NEW": return hardBlockers.length > 0 ? `Resolve ${hardBlockers.length} blocker(s): ${hardBlockers[0].label}` : "Collect required documents";
    case "DOCUMENTS_PENDING": return hardBlockers.length > 0 ? `Missing: ${hardBlockers[0].label}` : "Review documents and mark ready to file";
    case "READY_TO_FILE": return `File ${caseType} application at voivodship office`;
    case "FILED": return "Wait for acknowledgment, monitor for defect notices";
    case "UNDER_REVIEW": return "Case under review — monitor for decision or defect notice";
    case "DEFECT_NOTICE": return "Respond to defect notice within deadline";
    case "DECISION_RECEIVED": return "Review decision and update case status";
    case "APPROVED": return "Case approved — update worker legal status";
    case "REJECTED": return "Review rejection — consider appeal within 14 days";
    default: return "Review case status";
  }
}

// ── POST /api/cases/create — create case with full lifecycle ─────────────
router.post("/cases/create", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseType, caseManager, notes } = req.body as any;
    if (!workerId || !caseType) return res.status(400).json({ error: "workerId and caseType required" });
    if (!["TRC", "Appeal", "Work Permit", "PR", "Citizenship"].includes(caseType))
      return res.status(400).json({ error: "Invalid caseType. Use: TRC, Appeal, Work Permit, PR, Citizenship" });

    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    const blockers = detectBlockers(w, caseType);
    const nextAction = determineNextAction("NEW", caseType, blockers);
    const evidenceCount = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM legal_evidence WHERE worker_id = ${workerId}`);

    await db.execute(sql`
      INSERT INTO legal_cases (worker_id, case_type, status, title, description,
        case_manager, next_action, blockers, linked_evidence_count, priority_score, severity)
      VALUES (${workerId}, ${caseType}, 'NEW',
        ${`${caseType} — ${w.name}`},
        ${notes ?? null},
        ${caseManager ?? null},
        ${nextAction},
        ${JSON.stringify(blockers)}::jsonb,
        ${(evidenceCount.rows[0] as any).cnt},
        ${blockers.filter(b => b.severity === "hard").length > 0 ? 70 : 90},
        ${blockers.filter(b => b.severity === "hard").length > 0 ? "warning" : "critical"})
    `);

    return res.status(201).json({
      success: true,
      caseType, status: "NEW",
      workerName: w.name,
      blockers, nextAction,
      evidenceCount: (evidenceCount.rows[0] as any).cnt,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/cases/:id/transition — move case to next status ───────────
router.patch("/cases/:id/transition", authenticateToken, async (req, res) => {
  try {
    const { newStatus, notes, filingDate, decisionDate } = req.body as any;
    if (!newStatus) return res.status(400).json({ error: "newStatus required" });

    const existing = await db.execute(sql`
      SELECT lc.*, w.name as worker_name FROM legal_cases lc
      JOIN workers w ON w.id = lc.worker_id WHERE lc.id = ${req.params.id}
    `);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Case not found" });
    const c = existing.rows[0] as any;

    const allowed = VALID_TRANSITIONS[c.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({
        error: `Cannot transition from ${c.status} to ${newStatus}. Allowed: ${allowed.join(", ")}`,
        currentStatus: c.status, allowedTransitions: allowed,
      });
    }

    // Get worker for blocker check
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${c.worker_id}`);
    const w = wRows.rows[0] as any ?? {};
    const blockers = detectBlockers(w, c.case_type);
    const nextAction = determineNextAction(newStatus, c.case_type, blockers);

    const updates: string[] = [
      `status = '${newStatus}'`,
      `next_action = '${nextAction.replace(/'/g, "''")}'`,
      `blockers = '${JSON.stringify(blockers)}'::jsonb`,
      `updated_at = NOW()`,
    ];
    if (notes) updates.push(`lawyer_notes = '${notes.replace(/'/g, "''")}'`);
    if (filingDate) updates.push(`decided_at = '${filingDate}'`);
    if (decisionDate) updates.push(`decided_at = '${decisionDate}'`);
    if (newStatus === "REJECTED") {
      updates.push(`appeal_deadline = (NOW() + INTERVAL '14 days')::date`);
      updates.push(`severity = 'critical'`);
    }
    if (newStatus === "APPROVED") updates.push(`severity = 'low'`);

    await db.execute(sql.raw(`UPDATE legal_cases SET ${updates.join(", ")} WHERE id = '${req.params.id}'`));

    return res.json({
      success: true,
      previousStatus: c.status, newStatus,
      nextAction, blockers,
      allowedNext: VALID_TRANSITIONS[newStatus] ?? [],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cases/:id/action-center — full action center for a case ─────
router.get("/cases/:id/action-center", authenticateToken, async (req, res) => {
  try {
    const caseRow = await db.execute(sql`
      SELECT lc.*, w.name as worker_name, w.nationality, w.trc_expiry,
        w.work_permit_expiry, w.bhp_status, w.badania_lek_expiry,
        w.contract_end_date, w.assigned_site, w.pesel
      FROM legal_cases lc
      JOIN workers w ON w.id = lc.worker_id
      WHERE lc.id = ${req.params.id}
    `);
    if (caseRow.rows.length === 0) return res.status(404).json({ error: "Case not found" });
    const c = caseRow.rows[0] as any;

    const blockers = detectBlockers(c, c.case_type);
    const hardBlockers = blockers.filter(b => b.severity === "hard");
    const nextAction = determineNextAction(c.status, c.case_type, blockers);

    // Evidence
    const evidence = await db.execute(sql`
      SELECT id, evidence_type, verified, ocr_confidence, uploaded_at
      FROM legal_evidence WHERE worker_id = ${c.worker_id} OR case_id = ${req.params.id}
      ORDER BY uploaded_at DESC
    `);

    // Documents generated for this case
    const docs = await db.execute(sql`
      SELECT id, doc_type, title, status, created_at
      FROM legal_documents WHERE case_id = ${req.params.id}
      ORDER BY created_at DESC
    `);

    // Build package readiness
    const packageReady = hardBlockers.length === 0;
    let suggestedPackage: any = null;

    if (c.case_type === "TRC") {
      suggestedPackage = {
        type: "TRC Filing Package",
        status: packageReady ? "READY" : "BLOCKED",
        blockedBy: hardBlockers.map(b => b.label),
        items: [
          { name: "TRC application form", status: "manual" },
          { name: "Cover letter", status: packageReady ? "can_generate" : "blocked" },
          { name: "Document checklist", status: "can_generate" },
          { name: "Power of Attorney", status: packageReady ? "can_generate" : "blocked" },
          { name: "Passport copy", status: (evidence.rows as any[]).some(e => e.evidence_type === "passport") ? "present" : "missing" },
          { name: "Medical exam", status: !c.badania_lek_expiry || new Date(c.badania_lek_expiry) < new Date() ? "expired" : "valid" },
          { name: "BHP certificate", status: !c.bhp_status || new Date(c.bhp_status) < new Date() ? "expired" : "valid" },
        ],
      };
    } else if (c.case_type === "Appeal") {
      suggestedPackage = {
        type: "Appeal Package",
        status: c.rejection_text ? "READY" : "BLOCKED",
        blockedBy: c.rejection_text ? [] : ["Upload rejection decision first"],
        items: [
          { name: "Appeal letter", status: c.rejection_text ? "can_generate" : "blocked" },
          { name: "Rejection decision copy", status: c.rejection_text ? "present" : "missing" },
          { name: "Supporting evidence", status: (evidence.rows as any[]).length > 0 ? "present" : "missing" },
        ],
      };
    } else {
      suggestedPackage = {
        type: `${c.case_type} Package`,
        status: packageReady ? "READY" : "BLOCKED",
        blockedBy: hardBlockers.map(b => b.label),
        items: [
          { name: "Application form", status: "manual" },
          { name: "Cover letter", status: packageReady ? "can_generate" : "blocked" },
          { name: "Supporting documents", status: (evidence.rows as any[]).length > 0 ? "present" : "missing" },
        ],
      };
    }

    return res.json({
      case: {
        id: c.id, caseType: c.case_type, status: c.status,
        workerName: c.worker_name, workerId: c.worker_id,
        nationality: c.nationality, site: c.assigned_site,
        appealDeadline: c.appeal_deadline,
        caseManager: c.case_manager,
        createdAt: c.created_at,
      },
      lifecycle: {
        currentStatus: c.status,
        nextAction,
        allowedTransitions: VALID_TRANSITIONS[c.status] ?? [],
        blockers,
        hardBlockerCount: hardBlockers.length,
      },
      evidence: { count: (evidence.rows as any[]).length, items: evidence.rows },
      documents: { count: (docs.rows as any[]).length, items: docs.rows },
      suggestedPackage,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cases/dashboard — all cases with action center summary ──────
router.get("/cases/dashboard", authenticateToken, async (_req, res) => {
  try {
    const cases = await db.execute(sql`
      SELECT lc.*, w.name as worker_name, w.nationality, w.assigned_site
      FROM legal_cases lc
      JOIN workers w ON w.id = lc.worker_id
      WHERE lc.status NOT IN ('APPROVED', 'resolved', 'closed')
        AND (lc.tenant_id IS NULL OR lc.tenant_id != 'test')
      ORDER BY
        CASE lc.status
          WHEN 'REJECTED' THEN 0 WHEN 'DEFECT_NOTICE' THEN 1
          WHEN 'NEW' THEN 2 WHEN 'DOCUMENTS_PENDING' THEN 3
          WHEN 'READY_TO_FILE' THEN 4 WHEN 'FILED' THEN 5
          WHEN 'UNDER_REVIEW' THEN 6 WHEN 'DECISION_RECEIVED' THEN 7
          ELSE 8 END,
        lc.appeal_deadline ASC NULLS LAST,
        lc.priority_score DESC
      LIMIT 50
    `);

    const statusCounts: Record<string, number> = {};
    for (const c of cases.rows as any[]) {
      statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    }

    return res.json({
      totalActive: cases.rows.length,
      statusCounts,
      cases: (cases.rows as any[]).map(c => ({
        id: c.id, caseType: c.case_type, status: c.status,
        workerName: c.worker_name, nationality: c.nationality,
        site: c.assigned_site, nextAction: c.next_action,
        blockers: c.blockers, appealDeadline: c.appeal_deadline,
        caseManager: c.case_manager, priority: c.priority_score,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
