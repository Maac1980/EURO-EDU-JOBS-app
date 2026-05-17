/**
 * Legal Intelligence — unified service for EEJ.
 *
 * Features:
 *  - Research Workspace (Perplexity + Claude)
 *  - Appeal Assistant
 *  - POA Generator
 *  - Authority Drafting
 *  - Legal Reasoning Panel
 *  - Next Action Engine
 *  - Case Intelligence
 *  - TRC Workspace
 *  - Fleet Signals + Batch
 *
 * All outputs are DRAFT. No auto-send/file/approve.
 * Legal tracking card remains source of truth.
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
// Item 2.2 — friendly error mapping for the 9 route catches below.
import { mapErrorToFriendlyResponse } from "./document-format.js";

const router = Router();

// ═══ LEGAL REFERENCE TABLE ══════════════════════════════════════════════════

const LEGAL_REFERENCES = [
  { article: "Art. 98-100", law: "Ustawa o cudzoziemcach", topic: "TRC application requirements", applies_to: ["TRC"] },
  { article: "Art. 108 ust. 1 pkt 2", law: "Ustawa o cudzoziemcach", topic: "Filing continuity — right to stay while TRC pending", applies_to: ["TRC", "APPEAL"] },
  { article: "Art. 114", law: "Ustawa o cudzoziemcach", topic: "Single permit (TRC + work)", applies_to: ["TRC"] },
  { article: "Art. 118", law: "Ustawa o cudzoziemcach", topic: "Change of employer during TRC", applies_to: ["TRC"] },
  { article: "Art. 87", law: "Ustawa o promocji zatrudnienia", topic: "Work permit obligation", applies_to: ["WORK_PERMIT", "TRC"] },
  { article: "Art. 88", law: "Ustawa o promocji zatrudnienia", topic: "Work permit types A-E", applies_to: ["WORK_PERMIT"] },
  { article: "Art. 88z", law: "Ustawa o promocji zatrudnienia", topic: "Oświadczenie (24 months)", applies_to: ["WORK_PERMIT"] },
  { article: "Art. 127 KPA", law: "KPA", topic: "Right to appeal (14 days)", applies_to: ["APPEAL"] },
  { article: "Art. 64 KPA", law: "KPA", topic: "Formal defects — 7 days to correct", applies_to: ["TRC", "WORK_PERMIT", "APPEAL"] },
  { article: "Art. 35-36 KPA", law: "KPA", topic: "Processing time limits", applies_to: ["TRC", "WORK_PERMIT"] },
  { article: "Art. 73 KPA", law: "KPA", topic: "Right to inspect files", applies_to: ["TRC", "WORK_PERMIT", "APPEAL"] },
  { article: "Art. 6 GDPR", law: "RODO", topic: "Lawful basis for data processing", applies_to: ["TRC", "WORK_PERMIT"] },
  { article: "Art. 22¹ KP", law: "Kodeks pracy", topic: "Employment contract requirements", applies_to: ["TRC", "WORK_PERMIT"] },
  { article: "Directive 96/71/EC", law: "EU", topic: "Posted workers", applies_to: ["POSTED_WORKER"] },
  { article: "Art. 2 pkt 22a", law: "Ustawa o cudzoziemcach", topic: "Ukrainian special provisions (CUKR)", applies_to: ["TRC"] },
  { article: "Art. 36 ustawy o sus", law: "ZUS", topic: "7-day ZUS registration deadline", applies_to: ["TRC", "WORK_PERMIT"] },
  { article: "Art. 10 KPA", law: "KPA", topic: "Right to be heard before decision", applies_to: ["TRC", "APPEAL"] },
  { article: "Art. 139a-139f", law: "Ustawa o cudzoziemcach", topic: "Employer notification obligations", applies_to: ["TRC", "WORK_PERMIT"] },
];

// ═══ DOCUMENT COMPLETENESS MATRIX ═══════════════════════════════════════════

const DOC_MATRIX: Record<string, Array<{ key: string; label: string; required: boolean }>> = {
  TRC: [
    { key: "passport", label: "Valid passport", required: true },
    { key: "work_contract", label: "Work contract (Umowa)", required: true },
    { key: "employer_declaration", label: "Employer declaration", required: true },
    { key: "accommodation", label: "Accommodation proof", required: true },
    { key: "insurance", label: "Health insurance", required: true },
    { key: "filing_proof", label: "Filing proof (stempel/UPO)", required: true },
    { key: "photo", label: "Biometric photos", required: false },
    { key: "financial", label: "Bank statement", required: false },
  ],
  WORK_PERMIT: [
    { key: "passport", label: "Valid passport", required: true },
    { key: "labor_test", label: "Labour market test", required: true },
    { key: "employer_nip", label: "Employer NIP", required: true },
    { key: "salary_offer", label: "Salary offer/contract", required: true },
  ],
  APPEAL: [
    { key: "rejection", label: "Rejection decision copy", required: true },
    { key: "appeal_letter", label: "Appeal letter", required: true },
    { key: "supporting_evidence", label: "Supporting evidence", required: true },
    { key: "poa", label: "Power of attorney", required: false },
  ],
};

// ═══ HELPERS ════════════════════════════════════════════════════════════════

const daysUntil = (d: string | null | undefined) => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
};

const AI_TIMEOUT_MS = 30000; // 30 seconds

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)),
  ]);
}

async function callClaude(prompt: string, system: string, maxTokens = 1200): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "[AI not configured]";
  try {
    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey });
    const resp = await withTimeout(
      client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
      AI_TIMEOUT_MS,
      "Claude AI call",
    );
    return resp.content[0]?.type === "text" ? resp.content[0].text : "";
  } catch (err: any) {
    // Item 2.2 — preserve "[AI error: ...]" string contract (callers check
    // .startsWith("[AI") to detect failure) but also log the raw error so
    // server logs carry the masked signal.
    console.error("[legal-intelligence] Claude call failed:", err?.message ?? err);
    return `[AI error: ${err.message}]`;
  }
}

async function callPerplexity(system: string, query: string): Promise<{ answer: string; sources: string[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { answer: "[Perplexity not configured]", sources: [] };
  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar", return_citations: true, max_tokens: 2000,
        messages: [{ role: "system", content: system }, { role: "user", content: query }],
      }),
    });
    if (!resp.ok) {
      // Item 2.2 — was silent on non-OK HTTP; log so ops can see Perplexity
      // throttling / outages without scraping the answer-string prefix.
      console.warn(`[legal-intelligence] Perplexity HTTP ${resp.status}`);
      return { answer: `[Perplexity ${resp.status}]`, sources: [] };
    }
    const data = await resp.json() as any;
    return {
      answer: data.choices?.[0]?.message?.content ?? "",
      sources: (data.citations ?? []).map((c: any) => typeof c === "string" ? c : c.url ?? "").filter(Boolean),
    };
  } catch (err: any) {
    // Item 2.2 — preserve "[Perplexity error: ...]" string contract; also log.
    console.error("[legal-intelligence] Perplexity call failed:", err?.message ?? err);
    return { answer: `[Perplexity error: ${err.message}]`, sources: [] };
  }
}

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

// ═══ ROUTES ═════════════════════════════════════════════════════════════════

// --- Research Workspace ---
router.post("/legal-intelligence/research", authenticateToken, async (req, res) => {
  try {
    const { title, memoType, prompt, linkedWorkerId } = req.body;
    if (!title || !prompt) return res.status(400).json({ error: "title and prompt required" });

    const perp = await callPerplexity(
      "Research Polish immigration and employment law. Cite official sources.",
      prompt
    );
    const summary = await callClaude(
      `Summarize this research:\n${perp.answer.substring(0, 3000)}\n\nCreate: EXECUTIVE SUMMARY, KEY FINDINGS, ACTION ITEMS, LIMITATIONS.`,
      "You are a Polish immigration law analyst. Never invent articles. All output is DRAFT."
    );

    const rows = await db.execute(sql`
      INSERT INTO research_memos (title, memo_type, prompt, perplexity_answer, sources, summary, linked_worker_id)
      VALUES (${title}, ${memoType ?? "custom"}, ${prompt}, ${perp.answer},
        ${JSON.stringify(perp.sources)}::jsonb, ${summary}, ${linkedWorkerId ?? null})
      RETURNING *
    `);
    return res.json({ memo: rows.rows[0] });
  } catch (err: any) {
    // Item 2.2 — friendly-error mapping (P5 pattern). Logs raw err with route
    // path so ops can identify which legal-intelligence route failed; returns
    // shaped {error, code, userMessage} body.
    console.error(`[legal-intelligence ${req.method} ${req.path}] failed:`, err?.message ?? err);
    const mapped = mapErrorToFriendlyResponse(err, 'legal');
    return res.status(mapped.httpStatus).json(mapped.body);
  }
});

router.get("/legal-intelligence/research", authenticateToken, async (req, res) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM research_memos ORDER BY created_at DESC LIMIT 30`);
    res.json({ memos: rows.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- Appeal Assistant ---
router.post("/legal-intelligence/appeal", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseId, rejectionText } = req.body;
    if (!workerId) return res.status(400).json({ error: "workerId required" });

    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;
    const hasRejection = !!(rejectionText?.trim());
    const providerStatus = { perplexity: "not_called", claude: "not_called" };

    // Item 2.A — Perplexity research + Claude analysis run concurrently.
    // Both are independent: Perplexity researches general appeal procedures
    // (uses rejectionText or KPA Art. 127 fallback), Claude analyzes the
    // worker context for grounds/evidence/articles (uses the `context`
    // string only — does NOT read perp.answer). Saves the slower of the two
    // (~15-30s) off appeal-route wait time.
    //
    // Both callPerplexity and callClaude catch their own errors internally
    // (Item 2.2 pattern — return "[Perplexity error: ...]" / "[AI error: ...]"
    // string contracts), so Promise.all will NOT reject and providerStatus
    // tracking still fires correctly after each promise resolves.
    let appealGrounds: string[] = [];
    let missingEvidence: string[] = [];
    let lawyerNote = "";
    let appealDraftPl = "";
    let appealDraftEn = "";
    let workerExplanation = "";
    let clientExplanation = "";
    let relevantArticles: any[] = [];

    const context = `Worker: ${w.name}, ${w.nationality ?? "N/A"}\nPermit: ${w.trc_expiry ?? w.work_permit_expiry ?? "N/A"}\n${hasRejection ? `Rejection: ${rejectionText.substring(0, 2000)}` : "No rejection text."}`;

    const [perp, aiRaw] = await Promise.all([
      callPerplexity(
        "Research Polish administrative appeal procedures for immigration decisions. Cite official sources.",
        hasRejection ? `Appeal procedures for: ${rejectionText.substring(0, 500)}` : "General TRC appeal procedures under KPA Art. 127"
      ),
      callClaude(
        `${context}\n\nAnalyze and return JSON: {appealGrounds:[], missingEvidence:[], lawyerReviewNote:"", appealOutline:"", workerExplanation:"", clientExplanation:"", relevantArticles:[{article:"",relevance:""}]}.\n${hasRejection ? "" : "No rejection text — provide general guidance only."}`,
        "You are a Polish immigration law analyst. DRAFT only. Never guarantee success. Never invent articles.", 2500
      ),
    ]);

    // Perplexity result
    const research = perp.answer;
    const sources = perp.sources;
    providerStatus.perplexity = perp.answer.startsWith("[") ? "error" : "success";

    // Claude result
    providerStatus.claude = aiRaw.startsWith("[AI") ? "error" : "success";

    try {
      const jsonMatch = aiRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        appealGrounds = parsed.appealGrounds?.slice(0, 5) ?? [];
        missingEvidence = parsed.missingEvidence?.slice(0, 5) ?? [];
        lawyerNote = parsed.lawyerReviewNote ?? "";
        workerExplanation = parsed.workerExplanation ?? "";
        clientExplanation = parsed.clientExplanation ?? "";
        relevantArticles = parsed.relevantArticles?.slice(0, 8) ?? [];
        if (hasRejection && parsed.appealOutline) {
          appealDraftPl = await callClaude(
            `Draft formal Polish appeal (odwołanie) based on:\n${parsed.appealOutline}\nWorker: ${w.name}\nMark as PROJEKT.`,
            "Draft formal Polish administrative appeal. PROJEKT only.", 2000
          );
          appealDraftEn = await callClaude(
            `Translate this Polish appeal to English preserving all legal meaning:\n${appealDraftPl.substring(0, 2000)}`,
            "Translate Polish legal text to English. Preserve article references.", 1500
          );
        }
      }
    } catch (err) {
      // Item 2.2 — appeal AI JSON parse silent failure now logged so we can
      // see when Claude returns non-JSON in the appeal-analysis path.
      console.warn("[legal-intelligence/appeal] AI JSON parse failed:", err instanceof Error ? err.message : err);
    }

    const rows = await db.execute(sql`
      INSERT INTO appeal_outputs (worker_id, case_id, rejection_text, appeal_draft_pl, appeal_draft_en,
        worker_explanation, client_explanation, appeal_grounds, missing_evidence, relevant_articles, lawyer_note, provider_status)
      VALUES (${workerId}, ${caseId ?? null}, ${rejectionText ?? null}, ${appealDraftPl}, ${appealDraftEn},
        ${workerExplanation}, ${clientExplanation}, ${JSON.stringify(appealGrounds)}::jsonb,
        ${JSON.stringify(missingEvidence)}::jsonb, ${JSON.stringify(relevantArticles)}::jsonb,
        ${lawyerNote}, ${JSON.stringify(providerStatus)}::jsonb)
      RETURNING *
    `);
    return res.json({ output: rows.rows[0] });
  } catch (err: any) {
    // Item 2.2 — friendly-error mapping (P5 pattern). Logs raw err with route
    // path so ops can identify which legal-intelligence route failed; returns
    // shaped {error, code, userMessage} body.
    console.error(`[legal-intelligence ${req.method} ${req.path}] failed:`, err?.message ?? err);
    const mapped = mapErrorToFriendlyResponse(err, 'legal');
    return res.status(mapped.httpStatus).json(mapped.body);
  }
});

// --- POA Generator ---
router.post("/legal-intelligence/poa", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseId, poaType, representativeName } = req.body;
    if (!workerId || !representativeName) return res.status(400).json({ error: "workerId and representativeName required" });

    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, "0")}.${(today.getMonth() + 1).toString().padStart(2, "0")}.${today.getFullYear()}`;

    const SCOPES: Record<string, string> = {
      GENERAL: "do reprezentowania mnie przed organami administracji publicznej RP",
      TRC_PROCEEDINGS: "do reprezentowania mnie w postępowaniu dot. zezwolenia na pobyt czasowy i pracę",
      APPEAL: "do reprezentowania mnie w postępowaniu odwoławczym od decyzji",
      FILE_INSPECTION: "do wglądu do akt sprawy",
      WORK_PERMIT: "do reprezentowania mnie w postępowaniu dot. zezwolenia na pracę",
    };

    const content = `PEŁNOMOCNICTWO\n(PROJEKT)\n\nMiejscowość: Warszawa\nData: ${dateStr}\n\nJa, niżej podpisany/a:\n   ${w.name ?? "___"}\n   PESEL: ${w.pesel ?? "___"}\n   Paszport: ${w.passport_number ?? "___"}\n\nudzielam pełnomocnictwa:\n   ${representativeName}\n\n${SCOPES[poaType] ?? SCOPES.GENERAL}.\n\n_________________________________\nPodpis mocodawcy`;

    const rows = await db.execute(sql`
      INSERT INTO poa_documents (worker_id, case_id, poa_type, content_pl, representative_name)
      VALUES (${workerId}, ${caseId ?? null}, ${poaType ?? "GENERAL"}, ${content}, ${representativeName})
      RETURNING *
    `);
    return res.json({ poa: rows.rows[0] });
  } catch (err: any) {
    // Item 2.2 — friendly-error mapping (P5 pattern). Logs raw err with route
    // path so ops can identify which legal-intelligence route failed; returns
    // shaped {error, code, userMessage} body.
    console.error(`[legal-intelligence ${req.method} ${req.path}] failed:`, err?.message ?? err);
    const mapped = mapErrorToFriendlyResponse(err, 'legal');
    return res.status(mapped.httpStatus).json(mapped.body);
  }
});

// --- Authority Drafting ---
router.post("/legal-intelligence/authority-draft", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseId, draftType, specificIssue, authorityName } = req.body;
    if (!workerId || !specificIssue) return res.status(400).json({ error: "workerId and specificIssue required" });

    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    const contentPl = await callClaude(
      `Draft formal Polish letter to ${authorityName ?? "authority"} regarding: ${specificIssue}\nWorker: ${w.name}\nMark as PROJEKT.`,
      "Draft formal Polish administrative correspondence. PROJEKT only.", 2000
    );
    const contentEn = await callClaude(
      `Translate to English:\n${contentPl.substring(0, 2000)}`,
      "Translate Polish legal text to English.", 1500
    );

    const rows = await db.execute(sql`
      INSERT INTO authority_drafts (worker_id, case_id, draft_type, content_pl, content_en)
      VALUES (${workerId}, ${caseId ?? null}, ${draftType ?? "CLARIFICATION"}, ${contentPl}, ${contentEn})
      RETURNING *
    `);
    return res.json({ draft: rows.rows[0] });
  } catch (err: any) {
    // Item 2.2 — friendly-error mapping (P5 pattern). Logs raw err with route
    // path so ops can identify which legal-intelligence route failed; returns
    // shaped {error, code, userMessage} body.
    console.error(`[legal-intelligence ${req.method} ${req.path}] failed:`, err?.message ?? err);
    const mapped = mapErrorToFriendlyResponse(err, 'legal');
    return res.status(mapped.httpStatus).json(mapped.body);
  }
});

// --- Worker Intelligence (Next Action + Risk) ---
router.get("/legal-intelligence/worker/:workerId", authenticateToken, async (req, res) => {
  try {
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${req.params.workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    const deadlines: any[] = [];
    const addDl = (label: string, date: string | null) => {
      if (!date) return;
      const days = daysUntil(date)!;
      deadlines.push({ label, date, daysLeft: days, status: days < 0 ? "expired" : days < 14 ? "urgent" : days < 30 ? "warning" : "ok" });
    };
    addDl("Permit", w.trc_expiry ?? w.work_permit_expiry);
    addDl("Passport", w.passport_expiry);
    addDl("BHP", w.bhp_expiry ?? w.bhp_status);
    addDl("Medical", w.medical_exam_expiry ?? w.badania_lek_expiry);
    addDl("Contract", w.contract_end_date);
    deadlines.sort((a, b) => a.daysLeft - b.daysLeft);

    const alerts: any[] = [];
    for (const dl of deadlines) {
      if (dl.status === "expired") alerts.push({ severity: "critical", message: `${dl.label} expired ${Math.abs(dl.daysLeft)} days ago` });
      else if (dl.status === "urgent") alerts.push({ severity: "high", message: `${dl.label} expires in ${dl.daysLeft} days` });
    }
    if (!w.pesel) alerts.push({ severity: "medium", message: "Missing PESEL" });
    if (!w.passport_expiry) alerts.push({ severity: "high", message: "No passport on file" });

    const criticalCount = alerts.filter(a => a.severity === "critical").length;
    const riskLevel = criticalCount > 0 ? "CRITICAL" : alerts.filter(a => a.severity === "high").length >= 2 ? "HIGH" : alerts.length > 0 ? "MEDIUM" : "LOW";

    const nextActions: any[] = [];
    for (const dl of deadlines) {
      if (dl.status === "expired") nextActions.push({ action: `Renew ${dl.label} (expired)`, priority: "critical" });
      else if (dl.status === "urgent") nextActions.push({ action: `${dl.label} expires in ${dl.daysLeft}d — renew now`, priority: "high" });
    }
    if (!w.passport_expiry) nextActions.push({ action: "Upload passport", priority: "high" });

    return res.json({
      intelligence: {
        workerId: w.id, workerName: w.name,
        riskLevel, deadlines, alerts, nextActions: nextActions.slice(0, 8),
        primaryAction: nextActions[0]?.action ?? "No immediate action required",
        scores: {
          documentCompleteness: [w.passport_expiry, w.trc_expiry ?? w.work_permit_expiry, w.bhp_expiry, w.medical_exam_expiry, w.contract_end_date, w.pesel].filter(Boolean).length / 6 * 100 | 0,
          complianceHealth: Math.max(0, 100 - criticalCount * 25 - alerts.filter(a => a.severity === "high").length * 10),
        },
      },
    });
  } catch (err: any) {
    // Item 2.2 — friendly-error mapping (P5 pattern). Logs raw err with route
    // path so ops can identify which legal-intelligence route failed; returns
    // shaped {error, code, userMessage} body.
    console.error(`[legal-intelligence ${req.method} ${req.path}] failed:`, err?.message ?? err);
    const mapped = mapErrorToFriendlyResponse(err, 'legal');
    return res.status(mapped.httpStatus).json(mapped.body);
  }
});

// --- Fleet Signals (cached 60s) ---
let fleetCache: { data: any; ts: number } | null = null;
const FLEET_CACHE_TTL = 60000; // 60 seconds

router.get("/legal-intelligence/fleet-signals", authenticateToken, async (req, res) => {
  try {
    // Return cache if fresh
    if (fleetCache && Date.now() - fleetCache.ts < FLEET_CACHE_TTL) {
      return res.json(fleetCache.data);
    }

    const expired = await db.execute(sql`
      SELECT COUNT(DISTINCT id)::int as count FROM workers
      WHERE (trc_expiry IS NOT NULL AND trc_expiry::date < CURRENT_DATE)
         OR (work_permit_expiry IS NOT NULL AND work_permit_expiry::date < CURRENT_DATE)
    `);
    const expiring = await db.execute(sql`
      SELECT COUNT(DISTINCT id)::int as count FROM workers
      WHERE (trc_expiry IS NOT NULL AND trc_expiry::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)
         OR (work_permit_expiry IS NOT NULL AND work_permit_expiry::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)
    `);
    const total = await db.execute(sql`SELECT COUNT(*)::int as count FROM workers`);

    const response = {
      signals: {
        totalWorkers: (total.rows[0] as any)?.count ?? 0,
        expired: (expired.rows[0] as any)?.count ?? 0,
        expiringSoon: (expiring.rows[0] as any)?.count ?? 0,
      },
    };
    fleetCache = { data: response, ts: Date.now() };
    return res.json(response);
  } catch (err: any) {
    // Item 2.2 — friendly-error mapping (P5 pattern). Logs raw err with route
    // path so ops can identify which legal-intelligence route failed; returns
    // shaped {error, code, userMessage} body.
    console.error(`[legal-intelligence ${req.method} ${req.path}] failed:`, err?.message ?? err);
    const mapped = mapErrorToFriendlyResponse(err, 'legal');
    return res.status(mapped.httpStatus).json(mapped.body);
  }
});

// --- Legal References ---
router.get("/legal-intelligence/references", authenticateToken, (_req, res) => {
  res.json({ references: LEGAL_REFERENCES });
});

// --- Copilot ---
router.post("/legal-intelligence/copilot", authenticateToken, async (req, res) => {
  try {
    const { workerId, question } = req.body;
    if (!workerId || !question) return res.status(400).json({ error: "workerId and question required" });

    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    const context = `Worker: ${w.name}, ${w.nationality ?? "N/A"}, PESEL: ${w.pesel ?? "N/A"}\nPermit: ${w.trc_expiry ?? "N/A"}, Passport: ${w.passport_expiry ?? "N/A"}\nSite: ${w.assigned_site ?? "N/A"}, Status: ${w.worker_status ?? "Active"}`;

    const answer = await callClaude(
      `${context}\n\nQUESTION: ${question}\n\nAnswer based ONLY on the data above. Never invent facts. Advisory only.`,
      "You are a Polish immigration case assistant. Use ONLY provided data. Never fabricate. DRAFT output."
    );

    return res.json({ answer, source: answer.startsWith("[AI") ? "fallback" : "ai", requiresReview: true });
  } catch (err: any) {
    // Item 2.2 — friendly-error mapping (P5 pattern). Logs raw err with route
    // path so ops can identify which legal-intelligence route failed; returns
    // shaped {error, code, userMessage} body.
    console.error(`[legal-intelligence ${req.method} ${req.path}] failed:`, err?.message ?? err);
    const mapped = mapErrorToFriendlyResponse(err, 'legal');
    return res.status(mapped.httpStatus).json(mapped.body);
  }
});

// --- Approve (parameterized — no sql.raw) ---
router.post("/legal-intelligence/approve", authenticateToken, async (req, res) => {
  try {
    const { entityType, entityId } = req.body;
    if (!entityType || !entityId) return res.status(400).json({ error: "entityType and entityId required" });

    // Parameterized update per table — no sql.raw, no string interpolation
    switch (entityType) {
      case "appeal_output":
        await db.execute(sql`UPDATE appeal_outputs SET status = 'approved' WHERE id = ${entityId}`);
        break;
      case "poa_document":
        await db.execute(sql`UPDATE poa_documents SET status = 'approved' WHERE id = ${entityId}`);
        break;
      case "authority_draft":
        await db.execute(sql`UPDATE authority_drafts SET status = 'approved' WHERE id = ${entityId}`);
        break;
      case "research_memo":
        await db.execute(sql`UPDATE research_memos SET status = 'approved' WHERE id = ${entityId}`);
        break;
      case "smart_document":
        await db.execute(sql`UPDATE smart_documents SET status = 'approved' WHERE id = ${entityId}`);
        break;
      default:
        return res.status(400).json({ error: `Unknown entityType: ${entityType}` });
    }
    return res.json({ success: true, status: "approved" });
  } catch (err: any) {
    // Item 2.2 — friendly-error mapping (P5 pattern). Logs raw err with route
    // path so ops can identify which legal-intelligence route failed; returns
    // shaped {error, code, userMessage} body.
    console.error(`[legal-intelligence ${req.method} ${req.path}] failed:`, err?.message ?? err);
    const mapped = mapErrorToFriendlyResponse(err, 'legal');
    return res.status(mapped.httpStatus).json(mapped.body);
  }
});

export default router;
