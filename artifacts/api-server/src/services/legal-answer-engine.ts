/**
 * Legal Answer Engine — Structured legal Q&A for EEJ workers.
 *
 * Phase 1: Every response forced into a strict JSON schema.
 * Reads smart_documents ai_context before answering.
 * Runs legal-decision-engine for ground truth.
 * MOS-Check step for 2026 digital-first requirements.
 *
 * POST /api/legal/answer
 *
 * NO legal decisions by AI — deterministic engine is source of truth.
 * AI provides reasoning and guidance only.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus, type LegalInput, type LegalOutput } from "./legal-decision-engine.js";

const router = Router();

// ═══ ANSWER SCHEMA ══════════════════════════════════════════════════════════

export interface LegalAnswer {
  plain_answer: string;
  legal_basis: string[];
  applicability: string;
  required_docs: string[];
  deadlines: string;
  risks: string[];
  next_actions: string[];
  confidence: number;
  human_review: boolean;
  mos_check: MosCheck;
  source_data: {
    worker_status: string;
    risk_level: string;
    documents_analyzed: number;
    engine_used: "deterministic" | "ai_assisted";
  };
}

export interface MosCheck {
  digital_filing_required: boolean;
  mos_system_applicable: boolean;
  login_gov_pl_needed: boolean;
  upo_required: boolean;
  paper_filing_still_accepted: boolean;
  mos_notes: string[];
}

// ═══ MOS 2026 REQUIREMENTS ══════════════════════════════════════════════════

const MOS_RULES = {
  // Document types that MUST go through MOS (2026)
  DIGITAL_ONLY: ["TRC_APPLICATION", "WORK_PERMIT_A", "WORK_PERMIT_B", "SEASONAL_PERMIT"],
  // Documents that generate UPO
  UPO_GENERATING: ["TRC_APPLICATION", "WORK_PERMIT_A", "WORK_PERMIT_B", "APPEAL"],
  // Documents still accepted on paper
  PAPER_ACCEPTED: ["POWER_OF_ATTORNEY", "EMPLOYER_DECLARATION", "ACCOMMODATION", "INSURANCE"],
  // login.gov.pl required for
  LOGIN_GOV_REQUIRED: ["TRC_APPLICATION", "WORK_PERMIT_A", "MOS_CONFIRMATION"],
};

function runMosCheck(docTypes: string[], question: string): MosCheck {
  const qLower = question.toLowerCase();
  const mentionsMos = qLower.includes("mos") || qLower.includes("filing") || qLower.includes("digital") || qLower.includes("submit") || qLower.includes("application");
  const mentionsTrc = qLower.includes("trc") || qLower.includes("karta pobytu") || qLower.includes("residence");
  const mentionsPermit = qLower.includes("permit") || qLower.includes("zezwolenie");

  const hasDigitalOnly = docTypes.some(d => MOS_RULES.DIGITAL_ONLY.includes(d));
  const hasUpoDoc = docTypes.some(d => MOS_RULES.UPO_GENERATING.includes(d));
  const hasLoginGov = docTypes.some(d => MOS_RULES.LOGIN_GOV_REQUIRED.includes(d));

  const notes: string[] = [];

  if (hasDigitalOnly || mentionsTrc || mentionsPermit) {
    notes.push("2026 MOS requirement: TRC and work permit applications MUST be filed digitally via login.gov.pl MOS system");
    notes.push("Paper applications are no longer accepted for these document types since January 2026");
  }

  if (hasUpoDoc) {
    notes.push("UPO (Urzędowe Poświadczenie Odbioru) is generated automatically by MOS — keep this as proof of Art. 108 filing date");
  }

  if (hasLoginGov) {
    notes.push("Worker or authorized representative must have login.gov.pl account (Profil Zaufany or e-Dowód)");
  }

  if (mentionsMos && !hasDigitalOnly) {
    notes.push("Not all documents require MOS filing — employer declarations, insurance proofs, and powers of attorney can still be submitted on paper");
  }

  return {
    digital_filing_required: hasDigitalOnly || mentionsTrc || mentionsPermit,
    mos_system_applicable: hasDigitalOnly || mentionsMos,
    login_gov_pl_needed: hasLoginGov || mentionsTrc,
    upo_required: hasUpoDoc,
    paper_filing_still_accepted: !hasDigitalOnly,
    mos_notes: notes,
  };
}

// ═══ LEGAL REFERENCE TABLE (for structured answers) ═════════════════════════

const ARTICLE_DB: Record<string, { article: string; law: string; summary: string }> = {
  ART_108:     { article: "Art. 108 ust. 1 pkt 2", law: "Ustawa o cudzoziemcach", summary: "Right to stay and work while TRC application is pending (filed before expiry)" },
  ART_87:      { article: "Art. 87", law: "Ustawa o promocji zatrudnienia", summary: "Obligation to have work authorization for foreigners" },
  ART_88:      { article: "Art. 88", law: "Ustawa o promocji zatrudnienia", summary: "Work permit types (A, B, C, D, E, seasonal)" },
  ART_114:     { article: "Art. 114", law: "Ustawa o cudzoziemcach", summary: "Single permit (unified TRC + work permit)" },
  ART_127_KPA: { article: "Art. 127 § 1", law: "KPA", summary: "Right to appeal within 14 days of decision delivery" },
  ART_64_KPA:  { article: "Art. 64 § 2", law: "KPA", summary: "Authority must allow 7 days to correct formal defects" },
  ART_35_KPA:  { article: "Art. 35", law: "KPA", summary: "Processing time limit (1 month, 2 months for complex cases)" },
  ART_100:     { article: "Art. 100 ust. 1", law: "Ustawa o cudzoziemcach", summary: "Grounds for TRC refusal" },
  ART_120:     { article: "Art. 120", law: "Ustawa o cudzoziemcach", summary: "Continued work after employer change conditions" },
  ART_88Z:     { article: "Art. 88z", law: "Ustawa o promocji zatrudnienia", summary: "Oświadczenie for 24 months (Ukrainian, Belarusian, etc.)" },
  GDPR_6:      { article: "Art. 6 ust. 1", law: "GDPR / RODO", summary: "Lawful basis for processing personal data" },
  ZUS_36:      { article: "Art. 36", law: "Ustawa o systemie ubezpieczeń społecznych", summary: "7-day ZUS registration deadline" },
};

// ═══ CONTEXT BUILDER ════════════════════════════════════════════════════════

async function buildWorkerContext(workerId: string) {
  // Worker data
  const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
  if (wRows.rows.length === 0) return null;
  const w = wRows.rows[0] as any;

  // Latest TRC case (commit 19 — May 14 walkthrough finding #6). The engine
  // was reasoning blind to actual case state — only the worker row's expiry
  // dates + smart_documents inferred signals. When a worker has a REJECTED
  // TRC case (Andriy's walkthrough scenario), the case row is the ground
  // truth and must surface in the prompt so Claude can advise specifically
  // about the rejection + Mazowieckie decision + Art. 127 appeal window.
  // Same query shape as the cockpit aggregator (workers.ts:548-557).
  const trcCaseResult = await db.execute(sql`
    SELECT c.id, c.status, c.permit_type, c.voivodeship,
           c.application_date, c.actual_decision_date, c.expected_decision_date,
           c.appointment_date, c.renewal_deadline, c.payment_status,
           (SELECT COUNT(*)::int FROM trc_documents d
            WHERE d.case_id = c.id AND d.is_required = true AND d.is_uploaded = false) AS missing_required_count
    FROM trc_cases c
    WHERE c.worker_id = ${workerId}
    ORDER BY c.created_at DESC LIMIT 1
  `);
  const trcCase = trcCaseResult.rows[0] ?? null;

  // Smart documents (AI context from ingestion) — centralized in migrate.ts
  const sdRows = await db.execute(sql`
    SELECT id, doc_type, confidence, rationale, extracted_data, legal_impact, ai_context,
           mos_relevant, is_rejection, is_application, created_at
    FROM smart_documents
    WHERE worker_id = ${workerId}
    ORDER BY created_at DESC LIMIT 10
  `);
  const smartDocs = sdRows.rows as any[];

  // Legal decision engine evaluation
  const legalInput: LegalInput = {
    workerId: w.id,
    workerName: w.name,
    nationality: w.nationality ?? "",
    permitExpiry: w.work_permit_expiry ?? null,
    trcExpiry: w.trc_expiry ?? null,
    trcFilingDate: null,
    trcApplicationPending: smartDocs.some(d => d.doc_type === "TRC_APPLICATION" || d.doc_type === "UPO_RECEIPT"),
    employerContinuity: true,
    roleContinuity: true,
    formalDefect: false,
    contractEndDate: w.contract_end_date ?? null,
    bhpExpiry: w.bhp_status ?? null,
    medicalExpiry: w.badania_lek_expiry ?? null,
    oswiadczenieExpiry: w.oswiadczenie_expiry ?? null,
    hasValidPassport: !!(w.passport_expiry),
    evidenceSubmitted: smartDocs.filter(d => d.doc_type === "UPO_RECEIPT").length > 0 ? ["upo"] :
                       smartDocs.filter(d => d.doc_type === "MOS_CONFIRMATION").length > 0 ? ["mos_stamp"] : [],
  };

  // Check if any smart doc has a filing date
  for (const sd of smartDocs) {
    const ext = sd.extracted_data as any;
    if (ext?.issue_date && (sd.doc_type === "TRC_APPLICATION" || sd.doc_type === "UPO_RECEIPT")) {
      legalInput.trcFilingDate = ext.issue_date;
    }
    if (sd.is_rejection) {
      legalInput.formalDefect = true;
    }
  }

  // Surface a TRC case rejection signal into the legal engine input (commit
  // 19). A REJECTED case in trc_cases is the canonical signal — independent
  // of whether a rejection document was OCR-scanned into smart_documents.
  // Treating it as a formal defect drives the engine's appeal-related
  // outputs (warnings, required actions, art108 evaluation).
  if (trcCase && typeof trcCase.status === "string" &&
      ["REJECTED", "DENIED", "rejected", "denied"].includes(trcCase.status)) {
    legalInput.formalDefect = true;
  }

  const legalOutput: LegalOutput = evaluateLegalStatus(legalInput);

  // Schengen 90/180 check (border_crossings centralized in migrate.ts)
  let schengenData: any = null;
  const crossingRows = await db.execute(sql`
    SELECT crossing_date, direction FROM border_crossings
    WHERE worker_id = ${workerId} ORDER BY crossing_date ASC
  `);
  if (crossingRows.rows.length > 0) {
    const { calculateSchengen90180 } = await import("./schengen-calculator.js");
    const crossings = (crossingRows.rows as any[]).map(r => ({
      date: r.crossing_date?.toString().slice(0, 10) ?? "",
      direction: r.direction as "entry" | "exit",
    }));
    schengenData = calculateSchengen90180(crossings, undefined, legalOutput.art108Applied);
  }

  return { worker: w, trcCase, smartDocs, legalInput, legalOutput, schengenData };
}

// ═══ AI ANSWER GENERATION ═══════════════════════════════════════════════════

const ANSWER_SYSTEM_PROMPT = `You are a Polish immigration law analyst for a staffing agency. You answer questions about worker legal status, compliance, and procedures.

CRITICAL RULES:
1. You MUST output ONLY a JSON object matching this exact schema — no markdown, no text outside JSON:
{
  "plain_answer": "Clear answer in 2-4 sentences. No legal jargon.",
  "legal_basis": ["Array of applicable Polish law articles with full references"],
  "applicability": "When and to whom this applies (nationality, contract type, etc.)",
  "required_docs": ["Array of documents needed for this situation"],
  "deadlines": "Specific deadline information (e.g., '14 days from decision delivery per KPA Art. 127')",
  "risks": ["Array of risk items if action is not taken"],
  "next_actions": ["Array of specific actions in priority order"],
  "confidence": 0.0 to 1.0,
  "human_review": true or false
}

2. NEVER invent article numbers — use only real Polish law
3. NEVER guarantee success
4. Set human_review: true if the situation is complex, involves expired documents, or legal contradictions
5. Base your answer on the PROVIDED WORKER DATA — do not assume facts not in the context
6. Reference the worker's actual document status and dates
7. If no data is available, say so and set confidence low`;

async function generateAnswer(question: string, context: any): Promise<LegalAnswer> {
  const { worker: w, trcCase, smartDocs, legalOutput, schengenData } = context;

  // Build context string for AI
  const docContext = smartDocs.map((d: any) =>
    `- ${d.doc_type} (confidence: ${d.confidence}) — ${d.rationale ?? "no rationale"}`
  ).join("\n") || "No documents analyzed yet.";

  // TRC CASE section (commit 19 — May 14 walkthrough finding #6). The case
  // row is the ground truth on TRC status; without it Claude is blind to
  // rejections and cannot advise on appeal strategy. When present, this
  // section surfaces status + decision date + appeal window (renewal_deadline
  // doubles as Art. 127 KPA 14-day reckoning point) + missing-doc count.
  const trcCaseContext = trcCase ? `
TRC CASE (latest, ground truth — refer to this for any TRC question):
Status: ${trcCase.status ?? "N/A"}
Permit type: ${trcCase.permit_type ?? "N/A"}
Voivodeship (issuing authority): ${trcCase.voivodeship ?? "N/A"}
Application date: ${trcCase.application_date ?? "N/A"}
Decision date: ${trcCase.actual_decision_date ?? "N/A"}
Expected decision date: ${trcCase.expected_decision_date ?? "N/A"}
Appointment date: ${trcCase.appointment_date ?? "N/A"}
Renewal / appeal deadline: ${trcCase.renewal_deadline ?? "N/A"}
Payment status: ${trcCase.payment_status ?? "N/A"}
Missing required documents: ${trcCase.missing_required_count ?? 0}` : `
TRC CASE: No TRC case row on file for this worker.`;

  const workerContext = `WORKER DATA (source of truth):
Name: ${w.name}
Nationality: ${w.nationality ?? "N/A"}
PESEL: ${w.pesel ?? "N/A"}
Permit expires: ${w.trc_expiry ?? w.work_permit_expiry ?? "N/A"}
Contract ends: ${w.contract_end_date ?? "N/A"}
BHP expires: ${w.bhp_status ?? "N/A"}
Medical expires: ${w.badania_lek_expiry ?? "N/A"}
ZUS status: ${w.zus_status ?? "N/A"}
Visa type: ${w.visa_type ?? "N/A"}
${trcCaseContext}

LEGAL ENGINE STATUS: ${legalOutput.legalStatus}
RISK LEVEL: ${legalOutput.riskLevel}
LEGAL BASIS: ${legalOutput.legalBasis}
ART. 108 ELIGIBLE: ${legalOutput.art108Eligible}
ART. 108 APPLIED: ${legalOutput.art108Applied}
CONDITIONS: ${legalOutput.conditions.join("; ") || "None"}
WARNINGS: ${legalOutput.warnings.join("; ") || "None"}
REQUIRED ACTIONS: ${legalOutput.requiredActions.join("; ") || "None"}

ANALYZED DOCUMENTS:
${docContext}
${schengenData ? `\nSCHENGEN 90/180 STATUS:\nDays Used: ${schengenData.daysUsed}/90\nDays Remaining: ${schengenData.daysRemaining}\nLatest Legal Exit: ${schengenData.latestLegalExitDate}\nOverstay: ${schengenData.isOverstay ? "YES — CRITICAL" : "No"}\nWarning: ${schengenData.isWarning ? "YES — <15 days remaining" : "No"}` : ""}`;

  const prompt = `${workerContext}\n\nQUESTION: ${question}\n\nRespond with the JSON object only.`;

  // Try AI
  let aiResult: any = null;
  try {
    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const aiPromise = client.messages.create({
      model: "claude-sonnet-4-20250514", max_tokens: 1500,
      system: ANSWER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    const resp = await Promise.race([
      aiPromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI timed out after 30s")), 30000)),
    ]);
    const raw = resp.content[0]?.type === "text" ? resp.content[0].text : "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) aiResult = JSON.parse(jsonMatch[0]);
  } catch { /* AI unavailable */ }

  // MOS check
  const docTypes = smartDocs.map((d: any) => d.doc_type as string);
  const mosCheck = runMosCheck(docTypes, question);

  // If AI succeeded, merge with MOS check
  if (aiResult) {
    return {
      plain_answer: aiResult.plain_answer ?? "",
      legal_basis: Array.isArray(aiResult.legal_basis) ? aiResult.legal_basis : [],
      applicability: aiResult.applicability ?? "",
      required_docs: Array.isArray(aiResult.required_docs) ? aiResult.required_docs : [],
      deadlines: aiResult.deadlines ?? "No specific deadline identified",
      risks: Array.isArray(aiResult.risks) ? aiResult.risks : [],
      next_actions: Array.isArray(aiResult.next_actions) ? aiResult.next_actions : [],
      confidence: typeof aiResult.confidence === "number" ? aiResult.confidence : 0.5,
      human_review: aiResult.human_review ?? true,
      mos_check: mosCheck,
      source_data: {
        worker_status: legalOutput.legalStatus,
        risk_level: legalOutput.riskLevel,
        documents_analyzed: smartDocs.length,
        engine_used: "ai_assisted",
      },
    };
  }

  // Deterministic fallback — no AI, build from engine output
  const fallbackArticles: string[] = [];
  if (legalOutput.legalBasis) fallbackArticles.push(legalOutput.legalBasis);
  if (legalOutput.art108Applied) fallbackArticles.push("Art. 108 ust. 1 pkt 2 Ustawa o cudzoziemcach");

  return {
    plain_answer: `Worker ${w.name} current legal status: ${legalOutput.legalStatus}. Risk level: ${legalOutput.riskLevel}. ${legalOutput.warnings[0] ?? "No immediate warnings."}`,
    legal_basis: fallbackArticles,
    applicability: `Applies to ${w.nationality ?? "non-EU"} nationals working in Poland under ${w.visa_type ?? "standard"} authorization.`,
    required_docs: legalOutput.requiredActions.filter((a: string) => a.toLowerCase().includes("file") || a.toLowerCase().includes("obtain") || a.toLowerCase().includes("submit")),
    deadlines: legalOutput.expiryDays.permit !== null
      ? `Permit expires in ${legalOutput.expiryDays.permit} days`
      : "No permit deadline on file",
    risks: legalOutput.warnings,
    next_actions: legalOutput.requiredActions,
    confidence: 0.3,
    human_review: true,
    mos_check: mosCheck,
    source_data: {
      worker_status: legalOutput.legalStatus,
      risk_level: legalOutput.riskLevel,
      documents_analyzed: smartDocs.length,
      engine_used: "deterministic",
    },
  };
}

// ═══ ROUTES ═════════════════════════════════════════════════════════════════

// POST /api/legal/answer — ask a structured legal question about a worker
router.post("/legal/answer", authenticateToken, async (req, res) => {
  try {
    const { workerId, question } = req.body as { workerId?: string; question?: string };
    if (!workerId) return res.status(400).json({ error: "workerId required" });
    if (!question || question.trim().length < 5) return res.status(400).json({ error: "question required (min 5 chars)" });

    const context = await buildWorkerContext(workerId);
    if (!context) return res.status(404).json({ error: "Worker not found" });

    const answer = await generateAnswer(question.trim(), context);

    // Audit log
    await db.execute(sql`
      INSERT INTO audit_entries (worker_id, worker_name, actor, field, new_value, action)
      VALUES (${workerId}, ${context.worker.name},
              ${(req as any).user?.name ?? "system"},
              'legal_answer', ${JSON.stringify({ question: question.trim(), confidence: answer.confidence })}::jsonb,
              'LEGAL_QUESTION_ASKED')
    `);

    return res.json({ answer });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/legal/answer/batch — ask about multiple workers at once
router.post("/legal/answer/batch", authenticateToken, async (req, res) => {
  try {
    const { question, workerIds } = req.body as { question?: string; workerIds?: string[] };
    if (!question) return res.status(400).json({ error: "question required" });
    if (!workerIds || workerIds.length === 0) return res.status(400).json({ error: "workerIds array required" });
    if (workerIds.length > 20) return res.status(400).json({ error: "Maximum 20 workers per batch" });

    const results: Array<{ workerId: string; workerName: string; answer: LegalAnswer }> = [];

    for (const wid of workerIds) {
      try {
        const context = await buildWorkerContext(wid);
        if (!context) continue;
        const answer = await generateAnswer(question.trim(), context);
        results.push({ workerId: wid, workerName: context.worker.name, answer });
      } catch { /* skip failed workers */ }
    }

    return res.json({ question, results, totalProcessed: results.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/legal/answer/mos-requirements — 2026 MOS digital filing guide
router.get("/legal/answer/mos-requirements", authenticateToken, (_req, res) => {
  return res.json({
    year: 2026,
    system: "MOS (Moduł Obsługi Spraw) via login.gov.pl",
    rules: {
      digital_only: MOS_RULES.DIGITAL_ONLY.map(d => ({ type: d, description: "Must be filed digitally — no paper" })),
      upo_generating: MOS_RULES.UPO_GENERATING.map(d => ({ type: d, description: "Generates UPO filing receipt automatically" })),
      paper_accepted: MOS_RULES.PAPER_ACCEPTED.map(d => ({ type: d, description: "Can still be submitted on paper" })),
      login_gov_required: MOS_RULES.LOGIN_GOV_REQUIRED.map(d => ({ type: d, description: "Requires login.gov.pl account" })),
    },
    important_notes: [
      "Since January 2026, TRC and work permit applications MUST be filed via MOS",
      "UPO serves as proof of filing date for Art. 108 protection",
      "Profil Zaufany or e-Dowód required for login.gov.pl access",
      "Power of Attorney (pełnomocnictwo) can still be submitted on paper",
      "Fee payments (2026 rates: TRC PLN 800, Work Permit PLN 400 — quadrupled from pre-2026) are handled within MOS portal",
      "CRITICAL: Employer MUST have Profil Zaufany or Qualified Electronic Signature to sign Annex 1 digital links",
      "MOS syncs with ZUS/KAS on submit — worker MUST be ZUS-registered before filing or application may be auto-rejected",
    ],
    articles: ARTICLE_DB,
  });
});

export default router;
