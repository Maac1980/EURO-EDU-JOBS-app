import { Router } from "express";
import cron from "node-cron";
import { db, schema } from "../db/index.js";
import { eq, desc, sql, gte, and } from "drizzle-orm";
import { analyzeText } from "../lib/ai.js";
import { authenticateToken, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { sendEmail } from "../lib/alerter.js";
import { toWorker } from "../lib/compliance.js";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 1: REGULATORY INTELLIGENCE — Automated Daily Monitoring
// ═══════════════════════════════════════════════════════════════════════════════

// ── Claude web search for regulatory intelligence ───────────────────────────
interface SearchResult {
  content: string;
  citations: Array<{ url: string; title?: string }>;
}

async function searchRegulatory(query: string): Promise<SearchResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: "You are a Polish immigration and labor law research assistant. Always cite specific legal sources (Dz.U., Ustawa, Rozporządzenie), exact dates, fine amounts in PLN. Respond with detailed analysis.",
      messages: [{ role: "user", content: query }],
    });
    const content = response.content[0]?.type === "text" ? response.content[0].text : null;
    return content ? { content, citations: [] } : null;
  } catch (e) {
    console.error("[regulatory-search] Error:", e);
    return null;
  }
}

// ── Claude impact analysis with structured output ───────────────────────────
async function analyzeImpact(rawInfo: string, workerCount: number): Promise<{
  title: string;
  summary: string;
  severity: "info" | "warning" | "critical";
  workersAffected: number;
  costImpact: string | null;
  deadlineChange: string | null;
  fineAmount: string | null;
  actionRequired: string[];
} | null> {
  const prompt = `You are analyzing a regulatory update for a Polish staffing agency managing ${workerCount} foreign workers.

Regulatory information:
${rawInfo}

Return ONLY valid JSON (no markdown, no backticks):
{
  "title": "Short descriptive title (max 80 chars)",
  "summary": "2-3 sentence plain English summary of what changed and why it matters",
  "severity": "critical" or "warning" or "info",
  "workersAffected": number of workers likely affected (estimate based on ${workerCount} total),
  "costImpact": "e.g. 'increase PLN 50/worker/month' or null if no cost change",
  "deadlineChange": "e.g. 'new deadline 2026-04-01' or null if no deadline",
  "fineAmount": "e.g. 'PLN 50,000' or null",
  "actionRequired": ["step 1", "step 2", "step 3"]
}

Rules:
- severity=critical if: fines > PLN 10,000, immediate deadlines (<30 days), work permits affected
- severity=warning if: deadlines within 60 days, rate changes, new requirements
- severity=info if: informational only, no immediate action needed
- workersAffected: estimate realistically based on the change type`;

  const result = await analyzeText(prompt);
  if (!result) return null;
  try {
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch { return null; }
}

// ── Build email alert HTML ──────────────────────────────────────────────────
function buildAlertEmail(updates: Array<{
  title: string; summary: string; severity: string;
  workersAffected: number | null; costImpact: string | null;
  fineAmount: string | null; actionRequired: unknown;
  source: string;
}>): string {
  const severityColor = (s: string) => s === "critical" ? "#dc2626" : s === "warning" ? "#d97706" : "#16a34a";
  const severityBg = (s: string) => s === "critical" ? "#fef2f2" : s === "warning" ? "#fffbeb" : "#f0fdf4";
  const severityLabel = (s: string) => s === "critical" ? "CRITICAL" : s === "warning" ? "WARNING" : "INFO";

  const rows = updates.map(u => {
    const actions = Array.isArray(u.actionRequired)
      ? (u.actionRequired as string[]).map(a => `<li style="margin:4px 0;color:#333;">${a}</li>`).join("")
      : "";
    return `
    <div style="margin:16px 0;padding:16px;border-radius:8px;background:${severityBg(u.severity)};border-left:4px solid ${severityColor(u.severity)};">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${severityColor(u.severity)};color:#fff;font-size:11px;font-weight:700;">${severityLabel(u.severity)}</span>
        <span style="font-size:12px;color:#666;">${u.source}</span>
      </div>
      <h3 style="margin:0 0 8px;color:#111;font-size:16px;">${u.title}</h3>
      <p style="margin:0 0 8px;color:#444;font-size:14px;">${u.summary}</p>
      <div style="display:flex;gap:16px;font-size:13px;color:#555;margin-bottom:8px;">
        ${u.workersAffected ? `<span>Workers affected: <strong>${u.workersAffected}</strong></span>` : ""}
        ${u.costImpact ? `<span>Cost: <strong>${u.costImpact}</strong></span>` : ""}
        ${u.fineAmount ? `<span style="color:#dc2626;">Fine: <strong>${u.fineAmount}</strong></span>` : ""}
      </div>
      ${actions ? `<div style="margin-top:8px;"><strong style="font-size:13px;">Action required:</strong><ol style="margin:4px 0;padding-left:20px;font-size:13px;">${actions}</ol></div>` : ""}
    </div>`;
  }).join("");

  const criticalCount = updates.filter(u => u.severity === "critical").length;
  const warningCount = updates.filter(u => u.severity === "warning").length;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:680px;margin:0 auto;">
    <div style="background:#333;padding:24px 28px;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;color:#E9FF70;font-size:22px;">EEJ Regulatory Intelligence</h1>
      <p style="margin:6px 0 0;color:#aaa;font-size:13px;">Daily compliance scan — ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</p>
    </div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
      <p style="font-size:14px;color:#333;">
        Detected <strong>${updates.length}</strong> regulatory change${updates.length !== 1 ? "s" : ""}:
        ${criticalCount > 0 ? `<span style="color:#dc2626;font-weight:700;">${criticalCount} critical</span>` : ""}
        ${warningCount > 0 ? `${criticalCount > 0 ? ", " : ""}<span style="color:#d97706;font-weight:700;">${warningCount} warning</span>` : ""}
      </p>
      ${rows}
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
      <p style="font-size:11px;color:#999;">EEJ Regulatory Intelligence Module | edu-jobs.eu | Auto-generated, do not reply</p>
    </div>
  </div>
</body></html>`;
}

// ── The main daily scan ─────────────────────────────────────────────────────
async function runRegulatoryCheck(): Promise<{ scanned: number; detected: number; critical: number; emailSent: boolean }> {
  console.log("[regulatory] Running daily regulatory scan at", new Date().toISOString());

  // [tenancy] Intentionally unscoped: regulatory scan is a platform-level
  // background job that reports system-wide impact counts, not a per-tenant
  // query. Each tenant's UI will still filter regulatory_updates by severity.
  const workerRows = await db.select().from(schema.workers);
  const workerCount = workerRows.length;

  const scanQueries = [
    // Polish government sources
    { query: `Latest changes to Polish work permit regulations and requirements for foreign workers in 2026. Check praca.gov.pl for any new announcements, updated forms, or changed procedures. Focus on Type A, seasonal permits, and oświadczenie.`, category: "work_permits", source: "praca.gov.pl" },
    { query: `ZUS Poland social insurance changes 2026: new contribution rates, changed deadlines for registration (ZUS ZUA/ZZA forms), employer obligations for foreign workers on umowa zlecenie. Include specific rate percentages.`, category: "zus", source: "zus.pl" },
    { query: `Poland government announcements 2026 affecting employers of foreign workers: gov.pl updates, new legal acts (Dz.U.), changes to the Foreigners Act (Ustawa o Cudzoziemcach), Sejm legislation.`, category: "labor_law", source: "gov.pl" },
    { query: `MOS portal Poland 2026 updates: e-application system for residence/work permits, new features, changed processing times, system outages, new document requirements for Karta Pobytu applications.`, category: "work_permits", source: "mos_portal" },
    { query: `EU Posted Workers Directive updates 2026, EUR-Lex changes affecting Polish staffing agencies, cross-border employment rules, social security coordination A1 certificates, minimum wage alignment.`, category: "eu_law", source: "eur_lex" },
    // Fine prevention
    { query: `Poland PIP labor inspection fines 2026 for employing foreign workers illegally, missing work permits, late ZUS registration, 7-day reporting obligation violations. Maximum fine amounts in PLN.`, category: "fines", source: "pip.gov.pl" },
    // Reporting obligations
    { query: `Poland 7-day reporting obligation for employers hiring foreign workers 2026: powiadomienie starosty, ZUS registration deadline, required documents, penalties for late reporting.`, category: "reporting", source: "praca.gov.pl" },
  ];

  const detectedUpdates: Array<any> = [];
  let result = { scanned: scanQueries.length, detected: 0, critical: 0, emailSent: false };

  for (const q of scanQueries) {
    try {
      const searchResult = await searchRegulatory(q.query);
      if (!searchResult?.content) continue;

      // Claude analyzes the impact
      const impact = await analyzeImpact(searchResult.content, workerCount);
      if (!impact) continue;

      // Store in DB
      const [inserted] = await db.insert(schema.regulatoryUpdates).values({
        source: q.source,
        title: impact.title,
        summary: impact.summary,
        fullText: searchResult.content,
        category: q.category,
        severity: impact.severity,
        fineAmount: impact.fineAmount,
        aiAnalysis: searchResult.content,
        workersAffected: impact.workersAffected,
        costImpact: impact.costImpact,
        deadlineChange: impact.deadlineChange,
        actionRequired: impact.actionRequired,
        sourceUrls: searchResult.citations,
      }).returning();

      detectedUpdates.push({ ...inserted, ...impact, source: q.source });
      result.detected++;
      if (impact.severity === "critical") result.critical++;
    } catch (err) {
      console.error(`[regulatory] Error scanning ${q.source}:`, err);
    }
  }

  // Send consolidated email if any updates detected
  if (detectedUpdates.length > 0) {
    const adminEmail = process.env.ALERT_EMAIL_TO;
    if (adminEmail) {
      try {
        const smtpFrom = process.env.SMTP_FROM ?? process.env.BREVO_SMTP_USER ?? process.env.SMTP_USER ?? "noreply@edu-jobs.eu";
        const critCount = detectedUpdates.filter(u => u.severity === "critical").length;
        const subject = critCount > 0
          ? `[CRITICAL] ${critCount} regulatory change${critCount > 1 ? "s" : ""} require immediate action — EEJ`
          : `${detectedUpdates.length} regulatory update${detectedUpdates.length > 1 ? "s" : ""} detected — EEJ`;

        await sendEmail({
          from: `EEJ Regulatory Intelligence <${smtpFrom}>`,
          to: adminEmail,
          subject,
          html: buildAlertEmail(detectedUpdates),
        });
        result.emailSent = true;

        // Mark all as email sent
        for (const u of detectedUpdates) {
          await db.update(schema.regulatoryUpdates).set({ emailSent: true }).where(eq(schema.regulatoryUpdates.id, u.id));
        }
      } catch (e) {
        console.warn("[regulatory] Alert email failed:", e);
      }
    }
  }

  console.log(`[regulatory] Scan complete: ${result.detected} updates detected, ${result.critical} critical, email=${result.emailSent}`);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 2: IMMIGRATION SEARCH ENGINE — AI-Powered Polish Immigration Search
// ═══════════════════════════════════════════════════════════════════════════════

async function immigrationSearch(question: string, userId?: string): Promise<{
  answer: string;
  sources: Array<{ url: string; title?: string; dateVerified: string }>;
  confidence: "high" | "medium" | "low";
  actionItems: string[];
  language: string;
}> {
  // Detect language
  const polishChars = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
  const language = polishChars.test(question) ? "pl" : "en";

  // Step 1: Search official sources via Claude
  const searchResult = await searchRegulatory(
    `${question}\n\nSearch specifically on: praca.gov.pl, gov.pl, ZUS.pl, MOS portal (mos.cudzoziemcy.gov.pl), udsc.gov.pl, and official EU sources. Include exact URLs, dates, costs in PLN/EUR, document names, and legal references (Dz.U. numbers). Focus on 2026 current regulations.`
  );

  if (!searchResult?.content) {
    throw new Error("Search returned no results. Check your ANTHROPIC_API_KEY.");
  }

  // Step 2: Use Claude to synthesize a clear answer
  const responseLanguage = language === "pl" ? "Polish" : "English";
  const claudePrompt = `You are the EEJ Immigration Intelligence Engine — the most knowledgeable assistant for Polish immigration and labor law.

A staffing agency user asked: "${question}"

Here is the latest information from official sources:
${searchResult.content}

Sources found: ${JSON.stringify(searchResult.citations)}

Respond in ${responseLanguage}. Structure your answer as follows:

1. **Direct Answer** (2-3 sentences, clear and specific)
2. **Key Details** (bullet points with specific numbers, dates, costs, document names)
3. **Step-by-Step Action Items** (numbered, specific, actionable)
4. **Important Warnings** (deadlines, fines, common mistakes)

Also return a JSON block at the END of your response (after the human-readable answer):
<!--JSON
{
  "confidence": "high" or "medium" or "low",
  "actionItems": ["step 1", "step 2", "step 3"]
}
-->

Rules:
- confidence=high if sources are official government sites from 2025-2026
- confidence=medium if sources are reputable but not official
- confidence=low if information seems outdated or unverified
- Always mention specific PLN amounts, exact dates, and legal references
- If you're unsure about something, say so explicitly`;

  const aiAnswer = await analyzeText(claudePrompt);
  if (!aiAnswer) throw new Error("AI analysis failed. Check your ANTHROPIC_API_KEY.");

  // Extract confidence and action items from JSON block
  let confidence: "high" | "medium" | "low" = "medium";
  let actionItems: string[] = [];
  const jsonBlockMatch = aiAnswer.match(/<!--JSON\s*([\s\S]*?)-->/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      confidence = parsed.confidence ?? "medium";
      actionItems = parsed.actionItems ?? [];
    } catch { /* ignore parse errors */ }
  }

  // Clean the answer (remove JSON block)
  const cleanAnswer = aiAnswer.replace(/<!--JSON[\s\S]*?-->/, "").trim();

  // Build source list with verification dates
  const sources = searchResult.citations.map(c => ({
    url: typeof c === "string" ? c : c.url,
    title: typeof c === "string" ? undefined : c.title,
    dateVerified: new Date().toISOString().slice(0, 10),
  }));

  // Save to search history
  await db.insert(schema.immigrationSearches).values({
    userId: userId ?? null,
    question,
    language,
    perplexityResponse: searchResult.content,
    aiAnswer: cleanAnswer,
    sourceUrls: sources,
    confidence,
    actionItems,
  }).catch(e => console.warn("[immigration-search] Failed to save history:", e));

  return { answer: cleanAnswer, sources, confidence, actionItems, language };
}

// ═══════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── FEATURE 1: Regulatory Intelligence Routes ───────────────────────────────

// GET /api/regulatory/updates — list regulatory updates with filters
router.get("/regulatory/updates", authenticateToken, async (req, res) => {
  try {
    const { category, severity, unreadOnly } = req.query as Record<string, string>;
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    let updates = await db.select().from(schema.regulatoryUpdates)
      .orderBy(desc(schema.regulatoryUpdates.fetchedAt))
      .limit(limit)
      .offset(offset);
    if (category) updates = updates.filter(u => u.category === category);
    if (severity) updates = updates.filter(u => u.severity === severity);
    if (unreadOnly === "true") updates = updates.filter(u => !u.readByAdmin);

    return res.json({ updates, total: updates.length, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load updates" });
  }
});

// GET /api/regulatory/summary — dashboard widget: "3 new changes this week"
router.get("/regulatory/summary", authenticateToken, async (_req, res) => {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const allRecent = await db.select().from(schema.regulatoryUpdates)
      .where(gte(schema.regulatoryUpdates.fetchedAt, oneWeekAgo))
      .orderBy(desc(schema.regulatoryUpdates.fetchedAt));

    const unreadCount = allRecent.filter(u => !u.readByAdmin).length;
    const criticalCount = allRecent.filter(u => u.severity === "critical").length;
    const warningCount = allRecent.filter(u => u.severity === "warning").length;

    // Total workers affected this week
    const totalWorkersAffected = allRecent.reduce((sum, u) => sum + (u.workersAffected ?? 0), 0);

    return res.json({
      thisWeek: allRecent.length,
      unread: unreadCount,
      critical: criticalCount,
      warning: warningCount,
      totalWorkersAffected,
      latestUpdates: allRecent.slice(0, 5).map(u => ({
        id: u.id, title: u.title, severity: u.severity, source: u.source,
        workersAffected: u.workersAffected, fetchedAt: u.fetchedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load summary" });
  }
});

// POST /api/regulatory/scan — trigger manual scan
router.post("/regulatory/scan", authenticateToken, requireCoordinatorOrAdmin, async (_req, res) => {
  try {
    const result = await runRegulatoryCheck();
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

// PATCH /api/regulatory/updates/:id/read — mark as read
router.patch("/regulatory/updates/:id/read", authenticateToken, async (req, res) => {
  await db.update(schema.regulatoryUpdates).set({ readByAdmin: true })
    .where(eq(schema.regulatoryUpdates.id, String(req.params.id)));
  return res.json({ success: true });
});

// POST /api/regulatory/updates/read-all — mark all as read
router.post("/regulatory/updates/read-all", authenticateToken, async (_req, res) => {
  await db.update(schema.regulatoryUpdates).set({ readByAdmin: true })
    .where(eq(schema.regulatoryUpdates.readByAdmin, false));
  return res.json({ success: true });
});

// ── FEATURE 2: Immigration Search Engine Routes ─────────────────────────────

// POST /api/immigration/search — the main search endpoint
router.post("/immigration/search", authenticateToken, async (req, res) => {
  try {
    const { question } = req.body as { question?: string };
    if (!question?.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }
    if (question.length > 1000) {
      return res.status(400).json({ error: "Question too long (max 1000 characters)" });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured. Immigration search requires ANTHROPIC_API_KEY." });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured. Immigration search requires Claude for analysis." });
    }

    const result = await immigrationSearch(question.trim(), req.user?.email ?? req.user?.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Search failed" });
  }
});

// GET /api/immigration/search/stream — SSE streaming version
router.get("/immigration/search/stream", authenticateToken, async (req, res) => {
  const question = req.query.q as string;
  if (!question?.trim()) return res.status(400).json({ error: "Question (q) is required" });
  if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "API keys not configured" });
  }

  const language = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(question) ? "pl" : "en";

  // Step 1: Search (non-streaming)
  const searchResult = await searchRegulatory(
    `${question}\n\nSearch on: praca.gov.pl, gov.pl, ZUS.pl, MOS portal, udsc.gov.pl. Include URLs, dates, costs, legal references.`
  );
  if (!searchResult?.content) return res.status(500).json({ error: "Search returned no results" });

  // Step 2: Stream Claude response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send sources first
  res.write(`data: ${JSON.stringify({ type: "sources", sources: searchResult.citations.map(c => ({ url: typeof c === "string" ? c : c.url, title: typeof c === "string" ? undefined : c.title, dateVerified: new Date().toISOString().slice(0, 10) })) })}\n\n`);

  try {
    const { streamAnalysis } = await import("../lib/ai.js");
    const responseLanguage = language === "pl" ? "Polish" : "English";
    const stream = await streamAnalysis(
      `User question about Polish immigration: "${question}"\n\nLatest information:\n${searchResult.content}\n\nRespond in ${responseLanguage}. Give a direct answer, key details, step-by-step actions, and warnings. Be specific with dates, costs, legal references.`,
      "You are the EEJ Immigration Intelligence Engine — expert in Polish immigration law, work permits, ZUS, and foreign worker employment. Always cite specific regulations."
    );

    let fullAnswer = "";
    for await (const chunk of stream) {
      fullAnswer += chunk;
      res.write(`data: ${JSON.stringify({ type: "text", text: chunk })}\n\n`);
    }

    // Save to history
    await db.insert(schema.immigrationSearches).values({
      userId: req.user?.email ?? null,
      question: question.trim(),
      language,
      perplexityResponse: searchResult.content,
      aiAnswer: fullAnswer,
      sourceUrls: searchResult.citations,
      confidence: "medium",
      actionItems: [],
    }).catch(() => {});

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
    return;
  } catch (err) {
    if (!res.headersSent) return res.status(500).json({ error: err instanceof Error ? err.message : "Stream failed" });
    res.end();
    return;
  }
});

// GET /api/immigration/history — user's search history
router.get("/immigration/history", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.email ?? req.user?.id;
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
    const searches = await db.select({
      id: schema.immigrationSearches.id,
      question: schema.immigrationSearches.question,
      language: schema.immigrationSearches.language,
      confidence: schema.immigrationSearches.confidence,
      searchedAt: schema.immigrationSearches.searchedAt,
    }).from(schema.immigrationSearches)
      .where(userId ? eq(schema.immigrationSearches.userId, userId) : sql`TRUE`)
      .orderBy(desc(schema.immigrationSearches.searchedAt))
      .limit(limit);
    return res.json({ searches });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load history" });
  }
});

// GET /api/immigration/history/:id — get full search result
router.get("/immigration/history/:id", authenticateToken, async (req, res) => {
  try {
    const [search] = await db.select().from(schema.immigrationSearches)
      .where(eq(schema.immigrationSearches.id, String(req.params.id)));
    if (!search) return res.status(404).json({ error: "Search not found" });
    return res.json({ search });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load search" });
  }
});

// GET /api/immigration/popular — popular/suggested questions
router.get("/immigration/popular", (_req, res) => {
  return res.json({
    questions: [
      { text: "What documents does an Indian worker need for a work permit in Poland 2026?", category: "work_permits" },
      { text: "How much does a MOS residence permit (Karta Pobytu) cost now?", category: "costs" },
      { text: "What is the 7-day reporting rule for new foreign workers?", category: "reporting" },
      { text: "Can Ukrainian workers still work in Poland after March 2026?", category: "ukraine" },
      { text: "What are the ZUS contribution rates for umowa zlecenie workers in 2026?", category: "zus" },
      { text: "What fines can PIP impose for employing workers without permits?", category: "fines" },
      { text: "How long does a Type A work permit application take in 2026?", category: "processing" },
      { text: "What changed in the Foreigners Act (Ustawa o Cudzoziemcach) recently?", category: "legislation" },
      { text: "Do I need a labor market test (informacja starosty) for welders?", category: "labor_test" },
      { text: "What are the requirements for seasonal work permits?", category: "seasonal" },
      { text: "Jakie dokumenty potrzebne do zezwolenia na pracę typu A?", category: "work_permits" },
      { text: "Ile kosztuje Karta Pobytu w 2026 roku?", category: "costs" },
    ],
  });
});

// ── AI Compliance Copilot (streaming) ───────────────────────────────────────
router.get("/regulatory/copilot", authenticateToken, async (req, res) => {
  const question = req.query.q as string;
  if (!question) return res.status(400).json({ error: "Question (q) is required" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });

  const recentUpdates = await db.select().from(schema.regulatoryUpdates)
    .orderBy(desc(schema.regulatoryUpdates.fetchedAt)).limit(10);
  const context = recentUpdates.map(u => `[${u.source} | ${u.severity}] ${u.title}: ${u.summary}`).join("\n\n");

  try {
    const { streamAnalysis } = await import("../lib/ai.js");
    const stream = await streamAnalysis(
      `Context (latest regulatory intelligence):\n${context}\n\nUser question: ${question}`,
      "You are the EEJ AI Compliance Copilot. Expert in Polish labor law, work permits, ZUS, RODO/GDPR, and foreign worker employment. Answer clearly. Cite specific regulations, deadlines, and fine amounts."
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  } catch (err) {
    if (!res.headersSent) return res.status(500).json({ error: err instanceof Error ? err.message : "Copilot error" });
    return;
  }
});

// ── Schedule daily regulatory scan (6am) ────────────────────────────────────
export function startRegulatoryMonitor(): void {
  const cronExpr = process.env.REGULATORY_CRON ?? "0 6 * * *";
  console.log(`[regulatory] Scheduling daily scan: "${cronExpr}"`);
  cron.schedule(cronExpr, () => { runRegulatoryCheck(); });
}

export default router;
