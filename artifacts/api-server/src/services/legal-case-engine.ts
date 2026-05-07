/**
 * EEJ Legal Case Management Engine
 *
 * T1: Case lifecycle (NEW → APPROVED/REJECTED) with SLA tracking + blocker logic
 * T2: AI document generation per stage transition (Claude, bilingual PL+EN)
 * T3: Case notebook with full-text search (tsvector)
 *
 * org_context: EEJ. No shared data with external platforms.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { safeError } from "../lib/security.js";

const router = Router();

// ═══ CONSTANTS ══════════════════════════════════════════════════════════════

const CASE_STATUSES = [
  "NEW", "DOCS_PENDING", "READY_TO_FILE", "FILED",
  "UNDER_REVIEW", "DEFECT_NOTICE", "DECISION_RECEIVED",
  "APPROVED", "REJECTED",
] as const;

type CaseStatus = typeof CASE_STATUSES[number];

const VALID_TRANSITIONS: Record<string, string[]> = {
  NEW: ["DOCS_PENDING"],
  DOCS_PENDING: ["READY_TO_FILE"],
  READY_TO_FILE: ["FILED"],
  FILED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["DEFECT_NOTICE", "DECISION_RECEIVED"],
  DEFECT_NOTICE: ["UNDER_REVIEW", "DECISION_RECEIVED"],
  DECISION_RECEIVED: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
};

const HARD_BLOCKERS: CaseStatus[] = ["DEFECT_NOTICE", "REJECTED"];

const SLA_DAYS: Record<string, number> = {
  NEW: 3,
  DOCS_PENDING: 14,
  READY_TO_FILE: 5,
  FILED: 0,
  UNDER_REVIEW: 90,
  DEFECT_NOTICE: 14,
  DECISION_RECEIVED: 7,
  APPROVED: 0,
  REJECTED: 0,
};

const CASE_TYPES = ["TRC", "APPEAL", "PR", "CITIZENSHIP", "WORK_PERMIT", "OSWIADCZENIE"] as const;

// Stage → document template for AI generation
const STAGE_DOC_TEMPLATES: Record<string, { type: string; titlePl: string; titleEn: string; prompt: string }> = {
  NEW: { type: "CASE_ASSESSMENT", titlePl: "Ocena sprawy + lista dokumentów", titleEn: "Case Assessment + Document Checklist", prompt: "Generate a case assessment document and document checklist for a Polish immigration case." },
  DOCS_PENDING: { type: "WORKER_NOTIFICATION", titlePl: "Pismo do pracownika", titleEn: "Worker Notification Letter", prompt: "Generate a notification letter to the worker about required documents for their immigration case." },
  READY_TO_FILE: { type: "MOS_COVER_LETTER", titlePl: "Pismo przewodnie do MOS + Załącznik 1", titleEn: "MOS Application Cover Letter + Annex 1", prompt: "Generate a formal cover letter for MOS digital filing and an Annex 1 employer declaration." },
  FILED: { type: "FILING_CONFIRMATION", titlePl: "Potwierdzenie złożenia wniosku", titleEn: "Filing Confirmation", prompt: "Generate a filing confirmation document referencing the UPO submission number." },
  UNDER_REVIEW: { type: "STATUS_INQUIRY", titlePl: "Zapytanie o status sprawy", titleEn: "Status Inquiry to Voivodeship", prompt: "Generate a formal status inquiry letter to the voivodeship office, citing KPA Art. 35-36 (deadline for processing)." },
  DEFECT_NOTICE: { type: "DEFECT_RESPONSE", titlePl: "Odpowiedź na braki formalne", titleEn: "Defect Response Letter", prompt: "Generate a response to a formal defect notice (brak formalny), citing Art. 64§2 KPA." },
  DECISION_RECEIVED: { type: "DECISION_ANALYSIS", titlePl: "Analiza decyzji", titleEn: "Decision Analysis Memo", prompt: "Generate a legal analysis memo of the decision received, including appeal options and deadlines." },
  REJECTED: { type: "APPEAL_LETTER", titlePl: "Odwołanie z podstawą prawną", titleEn: "Appeal Letter with Legal Grounds", prompt: "Generate a formal appeal letter citing Art. 127 KPA, relevant NSA/WSA case law, and specific legal grounds for appeal." },
  APPROVED: { type: "COMPLIANCE_CONFIRMATION", titlePl: "Potwierdzenie zgodności", titleEn: "Compliance Confirmation for Worker + Employer", prompt: "Generate a compliance confirmation document for both the worker and employer." },
};

// ═══ NOTEBOOK HELPER ════════════════════════════════════════════════════════

async function logNotebook(caseId: string, entryType: string, title: string, content: string, author: string) {
  await db.execute(sql`
    INSERT INTO eej_case_notebook (case_id, entry_type, title, content, author, org_context)
    VALUES (${caseId}, ${entryType}, ${title}, ${content}, ${author}, 'EEJ')
  `);
}

// ═══ AI DOC GENERATION HELPER ═══════════════════════════════════════════════

async function generateStageDocument(caseId: string, caseData: any, newStatus: string, actor: string) {
  const template = STAGE_DOC_TEMPLATES[newStatus];
  if (!template) return;

  let contentPl = `[PROJEKT] ${template.titlePl}\n\nDokument w przygotowaniu...`;
  let contentEn = `[DRAFT] ${template.titleEn}\n\nDocument in preparation...`;

  try {
    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });

    const workerContext = `Worker: ${caseData.worker_name ?? "N/A"}, Case: ${caseData.case_type}, Voivodeship: ${caseData.voivodeship ?? "N/A"}, Status: ${newStatus}`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: `You are a Polish immigration document assistant for EEJ recruitment agency. Generate bilingual (Polish + English) legal documents. Polish version is authoritative. Mark all drafts as PROJEKT/DRAFT. Reference actual Polish law articles. Never guarantee outcomes.`,
      messages: [{ role: "user", content: `${template.prompt}\n\nContext: ${workerContext}\nNotes: ${caseData.notes ?? "None"}\n\nReturn JSON: {"content_pl": "...", "content_en": "..."}` }],
    });

    const rawText = resp.content[0]?.type === "text" ? resp.content[0].text : "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      contentPl = parsed.content_pl ?? contentPl;
      contentEn = parsed.content_en ?? contentEn;
    }
  } catch { /* AI generation is best-effort — fallback template used */ }

  // Store generated document
  await db.execute(sql`
    INSERT INTO eej_case_generated_docs (case_id, doc_type, title_pl, title_en, content_pl, content_en, stage_trigger, status, org_context)
    VALUES (${caseId}, ${template.type}, ${template.titlePl}, ${template.titleEn}, ${contentPl}, ${contentEn}, ${newStatus}, 'DRAFT', 'EEJ')
  `);

  // Log to notebook
  await logNotebook(caseId, "document", `AI Generated: ${template.titleEn}`, `Document type: ${template.type}. Status: DRAFT. Awaiting lawyer review.`, "ai_system");
}

// ═══ T1 ROUTES: LEGAL CASES ════════════════════════════════════════════════

// GET all cases (with filtering)
router.get("/v1/legal/cases", authenticateToken, async (req, res) => {
  try {
    const { status, workerId, caseType, limit: lim } = req.query as Record<string, string | undefined>;
    const maxRows = Math.min(parseInt(lim ?? "100", 10), 500);

    let rows;
    if (status) {
      rows = await db.execute(sql`SELECT * FROM eej_legal_cases WHERE org_context = 'EEJ' AND status = ${status} ORDER BY sla_deadline ASC NULLS LAST LIMIT ${maxRows}`);
    } else if (workerId) {
      rows = await db.execute(sql`SELECT * FROM eej_legal_cases WHERE org_context = 'EEJ' AND worker_id = ${workerId} ORDER BY created_at DESC LIMIT ${maxRows}`);
    } else {
      rows = await db.execute(sql`SELECT * FROM eej_legal_cases WHERE org_context = 'EEJ' ORDER BY updated_at DESC LIMIT ${maxRows}`);
    }

    return res.json({ cases: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET case queue (SLA-sorted, blockers first)
router.get("/v1/legal/cases/queue", authenticateToken, async (req, res) => {
  try {

    const blockedRows = await db.execute(sql`
      SELECT * FROM eej_legal_cases WHERE org_context = 'EEJ' AND blocker_type = 'HARD' AND status NOT IN ('APPROVED', 'REJECTED')
      ORDER BY sla_deadline ASC NULLS LAST
    `);

    const overdueRows = await db.execute(sql`
      SELECT * FROM eej_legal_cases WHERE org_context = 'EEJ' AND sla_deadline < NOW() AND status NOT IN ('APPROVED', 'REJECTED') AND blocker_type != 'HARD'
      ORDER BY sla_deadline ASC
    `);

    const activeRows = await db.execute(sql`
      SELECT * FROM eej_legal_cases WHERE org_context = 'EEJ' AND status NOT IN ('APPROVED', 'REJECTED') AND blocker_type != 'HARD' AND (sla_deadline >= NOW() OR sla_deadline IS NULL)
      ORDER BY sla_deadline ASC NULLS LAST LIMIT 50
    `);

    return res.json({
      queue: {
        blocked: blockedRows.rows,
        overdue: overdueRows.rows,
        active: activeRows.rows,
      },
      counts: {
        blocked: blockedRows.rows.length,
        overdue: overdueRows.rows.length,
        active: activeRows.rows.length,
      },
    });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// POST create new case
router.post("/v1/legal/cases", authenticateToken, async (req, res) => {
  try {
    const { workerId, workerName, caseType, voivodeship, mosFee, notes } = req.body as {
      workerId: string; workerName?: string; caseType?: string; voivodeship?: string; mosFee?: number; notes?: string;
    };

    if (!workerId) return res.status(400).json({ error: "workerId is required" });

    const ct = CASE_TYPES.includes(caseType as any) ? caseType : "TRC";
    const slaDeadline = new Date(Date.now() + SLA_DAYS.NEW * 86400000).toISOString();

    const rows = await db.execute(sql`
      INSERT INTO eej_legal_cases (worker_id, worker_name, case_type, status, voivodeship, mos_fee_pln, notes, sla_deadline, org_context)
      VALUES (${workerId}, ${workerName ?? null}, ${ct}, 'NEW', ${voivodeship ?? null}, ${mosFee ?? null}, ${notes ?? null}, ${slaDeadline}, 'EEJ')
      RETURNING *
    `);

    const newCase = rows.rows[0] as any;

    // Auto-log to notebook
    await logNotebook(newCase.id, "status_change", "Case Created", `Case type: ${ct}. Status: NEW. SLA: ${SLA_DAYS.NEW} days.`, (req as any).user?.name ?? "system");

    // Auto-generate initial document
    await generateStageDocument(newCase.id, newCase, "NEW", (req as any).user?.name ?? "system");

    return res.json({ case: newCase });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// PATCH update case (status transition)
router.patch("/v1/legal/cases/:id", authenticateToken, async (req, res) => {
  try {
    const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status: newStatus, notes, nextAction, appealDeadline } = req.body as {
      status?: string; notes?: string; nextAction?: string; appealDeadline?: string;
    };

    // Fetch current case
    const caseRows = await db.execute(sql`SELECT * FROM eej_legal_cases WHERE id = ${caseId} AND org_context = 'EEJ'`);
    if (caseRows.rows.length === 0) return res.status(404).json({ error: "Case not found" });

    const current = caseRows.rows[0] as any;

    // Validate transition
    if (newStatus) {
      const allowed = VALID_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(newStatus)) {
        return res.status(400).json({
          error: `Invalid transition: ${current.status} → ${newStatus}`,
          allowed: allowed,
        });
      }
    }

    const targetStatus = newStatus ?? current.status;
    const blockerType = HARD_BLOCKERS.includes(targetStatus as CaseStatus) ? "HARD" : "NONE";
    const blockerReason = targetStatus === "DEFECT_NOTICE" ? "Formal defect requires correction within deadline" :
                          targetStatus === "REJECTED" ? "Application rejected — appeal required or case closed" : null;
    const slaDays = SLA_DAYS[targetStatus] ?? 0;
    const slaDeadline = slaDays > 0 ? new Date(Date.now() + slaDays * 86400000).toISOString() : null;

    // Update case
    await db.execute(sql`
      UPDATE eej_legal_cases SET
        status = ${targetStatus},
        blocker_type = ${blockerType},
        blocker_reason = ${blockerReason},
        stage_entered_at = ${newStatus ? new Date().toISOString() : current.stage_entered_at},
        sla_deadline = ${slaDeadline},
        notes = COALESCE(${notes ?? null}, notes),
        next_action = COALESCE(${nextAction ?? null}, next_action),
        appeal_deadline = COALESCE(${appealDeadline ?? null}::DATE, appeal_deadline),
        updated_at = NOW()
      WHERE id = ${caseId}
    `);

    // Log transition to notebook
    if (newStatus) {
      await logNotebook(caseId, "status_change",
        `Status: ${current.status} → ${targetStatus}`,
        `Transitioned by ${(req as any).user?.name ?? "system"}. SLA: ${slaDays}d. Blocker: ${blockerType}.${notes ? ` Notes: ${notes}` : ""}`,
        (req as any).user?.name ?? "system"
      );

      // Auto-generate document for new stage
      const updatedCase = { ...current, status: targetStatus, notes: notes ?? current.notes };
      await generateStageDocument(caseId, updatedCase, targetStatus, (req as any).user?.name ?? "system");
    }

    // Fetch updated case
    const updated = await db.execute(sql`SELECT * FROM eej_legal_cases WHERE id = ${caseId}`);
    return res.json({ case: updated.rows[0] });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// ═══ T2 ROUTES: GENERATED DOCUMENTS ════════════════════════════════════════

// GET docs for a case
router.get("/v1/legal/cases/:id/docs", authenticateToken, async (req, res) => {
  try {
    const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rows = await db.execute(sql`SELECT * FROM eej_case_generated_docs WHERE case_id = ${caseId} AND org_context = 'EEJ' ORDER BY created_at DESC`);
    return res.json({ docs: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET lawyer review queue (all DRAFT docs)
router.get("/v1/legal/docs/review-queue", authenticateToken, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT d.*, c.worker_name, c.case_type, c.voivodeship
      FROM eej_case_generated_docs d
      JOIN eej_legal_cases c ON c.id = d.case_id
      WHERE d.org_context = 'EEJ' AND d.status = 'DRAFT'
      ORDER BY d.created_at ASC
    `);
    return res.json({ queue: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// PATCH review a document (approve/reject)
router.patch("/v1/legal/docs/:id/review", authenticateToken, async (req, res) => {
  try {
    const docId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status, reviewNotes } = req.body as { status: "APPROVED" | "REJECTED"; reviewNotes?: string };

    if (!["APPROVED", "REJECTED"].includes(status)) return res.status(400).json({ error: "Status must be APPROVED or REJECTED" });

    await db.execute(sql`
      UPDATE eej_case_generated_docs SET status = ${status}, reviewed_by = ${(req as any).user?.name ?? "reviewer"},
        reviewed_at = NOW(), review_notes = ${reviewNotes ?? null}
      WHERE id = ${docId} AND org_context = 'EEJ'
    `);

    // Log to notebook
    const docRow = await db.execute(sql`SELECT case_id, title_en FROM eej_case_generated_docs WHERE id = ${docId}`);
    if (docRow.rows.length > 0) {
      const doc = docRow.rows[0] as any;
      await logNotebook(doc.case_id, "document", `Document ${status}: ${doc.title_en}`, `Reviewed by ${(req as any).user?.name ?? "reviewer"}.${reviewNotes ? ` Notes: ${reviewNotes}` : ""}`, (req as any).user?.name ?? "reviewer");
    }

    return res.json({ success: true, status });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// ═══ T3 ROUTES: CASE NOTEBOOK ══════════════════════════════════════════════

// GET notebook entries for a case
router.get("/v1/legal/cases/:id/notebook", authenticateToken, async (req, res) => {
  try {
    const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rows = await db.execute(sql`
      SELECT * FROM eej_case_notebook WHERE case_id = ${caseId} AND org_context = 'EEJ' ORDER BY created_at DESC
    `);
    return res.json({ entries: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// POST manual notebook entry
router.post("/v1/legal/cases/:id/notebook", authenticateToken, async (req, res) => {
  try {
    const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { title, content } = req.body as { title: string; content?: string };

    if (!title) return res.status(400).json({ error: "title is required" });

    await logNotebook(caseId, "manual", title, content ?? "", (req as any).user?.name ?? "lawyer");

    return res.json({ success: true });
  } catch (err: any) {
    return safeError(res, err);
  }
});

// GET full-text search across all notebooks
router.get("/v1/legal/notebook/search", authenticateToken, async (req, res) => {
  try {
    const { q, limit: lim } = req.query as { q?: string; limit?: string };
    if (!q) return res.status(400).json({ error: "q (search query) is required" });

    const maxRows = Math.min(parseInt(lim ?? "30", 10), 100);
    const rows = await db.execute(sql`
      SELECT n.*, c.worker_name, c.case_type, c.status as case_status,
             ts_rank(n.search_vector, plainto_tsquery('simple', ${q})) as rank
      FROM eej_case_notebook n
      JOIN eej_legal_cases c ON c.id = n.case_id
      WHERE n.org_context = 'EEJ' AND n.search_vector @@ plainto_tsquery('simple', ${q})
      ORDER BY rank DESC LIMIT ${maxRows}
    `);

    return res.json({ results: rows.rows, total: rows.rows.length, query: q });
  } catch (err: any) {
    return safeError(res, err);
  }
});

export default router;
