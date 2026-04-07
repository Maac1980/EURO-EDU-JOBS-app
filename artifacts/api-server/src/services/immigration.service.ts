/**
 * Immigration Service — Perplexity searches Polish immigration law,
 * Claude synthesizes answers. Lawyer reviews before acting.
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

const PERPLEXITY_SYSTEM = `You are a Polish immigration law research assistant. Search ONLY these official Polish government sources:
- cudzoziemcy.gov.pl (immigration portal)
- praca.gov.pl (work permits)
- gov.pl/web/uw-mazowiecki (voivodship offices)
- zus.pl (social security)
- pip.gov.pl (labor inspection)
- isap.sejm.gov.pl (published law texts)

Focus on: TRC (Karta Pobytu), work permits (Type A/B/C/seasonal), oświadczenie, Art. 108 protection, posted worker EU rules, A1 certificates.
Always cite specific article numbers and source URLs. Return factual legal information only.`;

async function searchPerplexity(query: string): Promise<{ answer: string; sources: string[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { answer: "Perplexity API key not configured.", sources: [] };

  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: PERPLEXITY_SYSTEM },
          { role: "user", content: query },
        ],
        max_tokens: 1000,
        return_citations: true,
      }),
    });
    const data = await resp.json() as any;
    const answer = data.choices?.[0]?.message?.content ?? "No results found.";
    const sources = (data.citations ?? []).map((c: any) => typeof c === "string" ? c : c.url ?? "");
    return { answer, sources: sources.filter(Boolean) };
  } catch (err) {
    console.error("[immigration] Perplexity error:", err);
    return { answer: "Search failed — try again later.", sources: [] };
  }
}

async function synthesizeWithClaude(question: string, perplexityAnswer: string, kbArticles: any[]): Promise<string> {
  try {
    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });

    const kbContext = kbArticles.length > 0
      ? `\n\nVerified Legal KB Articles:\n${kbArticles.map(a => `[${a.law_reference}] ${a.title}: ${a.content}`).join("\n\n")}`
      : "";

    const resp = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [{ role: "user", content:
        `You are a Polish immigration law advisor for a staffing agency managing foreign workers in Poland.

Question: ${question}

Live search results from Polish government sources:
${perplexityAnswer}
${kbContext}

Provide a structured answer:
1. DIRECT ANSWER (yes/no/depends + explanation)
2. LEGAL BASIS (specific article numbers)
3. REQUIRED DOCUMENTS (if applicable)
4. DEADLINES (processing times, filing deadlines)
5. RISK WARNING (what happens if not compliant)

Mark as "AI DRAFT — Requires Legal Review". Keep under 300 words.`
      }],
    });
    return resp.content[0].type === "text" ? resp.content[0].text : "Unable to synthesize answer.";
  } catch (err) {
    console.error("[immigration] Claude error:", err);
    return perplexityAnswer + "\n\n[Claude synthesis unavailable — showing raw search results]";
  }
}

// ── POST /api/immigration/ask — AI immigration Q&A ──────────────────────
router.post("/immigration/ask", authenticateToken, async (req, res) => {
  try {
    const { question, workerNationality, permitType } = req.body as { question: string; workerNationality?: string; permitType?: string };
    if (!question?.trim()) return res.status(400).json({ error: "Question is required" });

    const enrichedQuery = `${question}${workerNationality ? ` Worker nationality: ${workerNationality}.` : ""}${permitType ? ` Permit type: ${permitType}.` : ""} Poland immigration law 2026.`;

    // 1. Search verified KB first
    const kbResults = await db.execute(sql`
      SELECT title, content, law_reference, source_url, category
      FROM legal_articles
      WHERE keywords ILIKE ${"%" + question.split(" ").slice(0, 3).join("%") + "%"}
        OR title ILIKE ${"%" + question.split(" ")[0] + "%"}
      LIMIT 5
    `);

    // 2. Search Perplexity for live sources
    const perplexity = await searchPerplexity(enrichedQuery);

    // 3. Claude synthesizes both KB + live results
    const synthesis = await synthesizeWithClaude(question, perplexity.answer, kbResults.rows as any[]);

    // 4. Store search in history
    await db.execute(sql`
      INSERT INTO immigration_searches (user_id, question, perplexity_response, ai_answer, source_urls, confidence, searched_at)
      VALUES ('system', ${question}, ${perplexity.answer}, ${synthesis},
        ${JSON.stringify(perplexity.sources)}::jsonb, 'high', NOW())
    `);

    return res.json({
      question,
      answer: synthesis,
      sources: perplexity.sources,
      kbArticlesUsed: (kbResults.rows as any[]).length,
      fromVerifiedKB: (kbResults.rows as any[]).length > 0,
      status: "AI DRAFT — Requires Legal Review",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/immigration/articles — list KB articles ────────────────────
router.get("/immigration/articles", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM legal_articles ORDER BY category, title`);
    return res.json({ articles: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/immigration/articles — add verified article to KB ─────────
router.post("/immigration/articles", authenticateToken, async (req, res) => {
  try {
    const { title, content, category, lawReference, sourceUrl, keywords } = req.body as any;
    if (!title || !content || !category) return res.status(400).json({ error: "title, content, category required" });
    await db.execute(sql`
      INSERT INTO legal_articles (title, content, category, law_reference, source_url, keywords, verified_by, last_verified)
      VALUES (${title}, ${content}, ${category}, ${lawReference ?? null}, ${sourceUrl ?? null}, ${keywords ?? null}, 'admin', NOW())
    `);
    return res.status(201).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/immigration/check-worker — check specific worker's status ─
router.post("/immigration/check-worker", authenticateToken, async (req, res) => {
  try {
    const { workerId } = req.body as { workerId: string };
    const result = await db.execute(sql`
      SELECT name, nationality, visa_type, trc_expiry, work_permit_expiry, oswiadczenie_expiry, pipeline_stage
      FROM workers WHERE id = ${workerId}
    `);
    if (result.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = result.rows[0] as any;

    const query = `Current requirements for ${w.nationality} worker in Poland with ${w.visa_type ?? "unknown"} visa. TRC expires ${w.trc_expiry ?? "not issued"}. Work permit expires ${w.work_permit_expiry ?? "not issued"}. What are the renewal steps and deadlines?`;

    const perplexity = await searchPerplexity(query);
    const synthesis = await synthesizeWithClaude(query, perplexity.answer, []);

    return res.json({
      worker: { name: w.name, nationality: w.nationality, visaType: w.visa_type },
      guidance: synthesis,
      sources: perplexity.sources,
      status: "AI DRAFT — Requires Legal Review",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
