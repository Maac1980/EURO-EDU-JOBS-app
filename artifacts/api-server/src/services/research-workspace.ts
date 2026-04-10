/**
 * Research Workspace — Perplexity-powered research memos.
 * Employer briefs, salary intel, sector analysis, legal research.
 * Perplexity = cited research. Claude = reasoning summary.
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

type MemoType = "employer_brief" | "salary_intel" | "sector_intel" | "legal_research" | "meeting_prep" | "sourcing_strategy" | "hiring_difficulty" | "custom";

// ── POST /api/research/create — create research memo ────────────────────
router.post("/research/create", authenticateToken, async (req, res) => {
  try {
    const { title, memoType, prompt, linkedEmployer, linkedSector, linkedCity } = req.body as {
      title: string; memoType: MemoType; prompt: string;
      linkedEmployer?: string; linkedSector?: string; linkedCity?: string;
    };
    if (!title || !prompt) return res.status(400).json({ error: "title and prompt required" });

    // Build research query based on memo type
    const systemPrompts: Record<MemoType, string> = {
      employer_brief: "Research this employer/company in Poland. Find: company size, industry, locations, recent news, hiring patterns, Glassdoor/GoWork reviews, financial health. Cite all sources.",
      salary_intel: "Research current salary ranges and compensation trends in Poland for this role/sector. Include: gross/net ranges, regional differences, benefits trends, ZUS implications. Cite sources from pracuj.pl, wynagrodzenia.pl, GUS data.",
      sector_intel: "Research this industry sector in Poland. Find: market size, major employers, growth trends, regulatory environment, talent availability, hiring challenges. Cite all sources.",
      legal_research: "Research Polish immigration and employment law on this topic. Focus on: applicable articles, recent changes, processing times, requirements, common issues. Cite isap.sejm.gov.pl, cudzoziemcy.gov.pl, praca.gov.pl.",
      meeting_prep: "Prepare a briefing for a meeting with this employer/client. Include: company overview, recent hiring, industry trends, potential needs, talking points, competitive landscape.",
      sourcing_strategy: "Research sourcing strategies for this role/skill in Poland. Include: where to find candidates, typical availability, salary expectations, competing demand, recommended approach.",
      hiring_difficulty: "Analyze hiring difficulty for this role in this location in Poland. Include: candidate supply/demand, average time to fill, competition, salary pressure, recommendations.",
      custom: "Research the following topic thoroughly. Provide cited findings with source URLs.",
    };

    // Step 1: Perplexity research
    let perplexityAnswer = "";
    let sources: string[] = [];
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (apiKey) {
        const resp = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar", return_citations: true,
            messages: [
              { role: "system", content: systemPrompts[memoType] ?? systemPrompts.custom },
              { role: "user", content: `${prompt}${linkedCity ? ` Location: ${linkedCity}, Poland.` : ""}${linkedSector ? ` Sector: ${linkedSector}.` : ""}` },
            ],
            max_tokens: 1500,
          }),
        });
        const data = await resp.json() as any;
        perplexityAnswer = data.choices?.[0]?.message?.content ?? "No results";
        sources = (data.citations ?? []).map((c: any) => typeof c === "string" ? c : c.url ?? "").filter(Boolean);
      } else {
        perplexityAnswer = "Perplexity API not configured — manual research required";
      }
    } catch (err: any) {
      perplexityAnswer = `Research failed: ${err.message}`;
    }

    // Step 2: Claude summary with action items
    let summary = "";
    let actionItems: string[] = [];
    try {
      const mod = await import("@anthropic-ai/sdk");
      const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 600,
        messages: [{ role: "user", content:
          `Summarize this research into a structured memo for a staffing agency recruiter/manager.

Research findings:
${perplexityAnswer.substring(0, 2000)}

Create:
1. EXECUTIVE SUMMARY (3-4 sentences)
2. KEY FINDINGS (bullet points, max 6)
3. ACTION ITEMS (what the team should do, max 4)
4. RISK/OPPORTUNITY (1-2 sentences)

Keep it practical and actionable.` }],
      });
      const text = resp.content[0].type === "text" ? resp.content[0].text : "";
      summary = text;
      const actionMatch = text.match(/ACTION ITEMS[\s\S]*?(?=\n\n|RISK|$)/i);
      if (actionMatch) {
        actionItems = actionMatch[0].split("\n").filter(l => l.trim().startsWith("-") || l.trim().startsWith("•")).map(l => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
      }
    } catch {
      summary = perplexityAnswer;
    }

    // Store memo
    await db.execute(sql`
      INSERT INTO immigration_searches (user_id, question, perplexity_response, ai_answer, source_urls, confidence, searched_at)
      VALUES (${memoType}, ${title + ": " + prompt}, ${perplexityAnswer}, ${summary},
        ${JSON.stringify(sources)}::jsonb, 'high', NOW())
    `);

    return res.json({
      title, memoType,
      research: perplexityAnswer,
      summary,
      sources,
      actionItems,
      linkedEmployer, linkedSector, linkedCity,
      status: "complete",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/research — list research memos ─────────────────────────────
router.get("/research", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, user_id as memo_type, question as title, ai_answer as summary,
        source_urls as sources, searched_at as created_at
      FROM immigration_searches
      WHERE user_id IN ('employer_brief','salary_intel','sector_intel','legal_research','meeting_prep','sourcing_strategy','hiring_difficulty','custom')
      ORDER BY searched_at DESC LIMIT 30
    `);
    return res.json({ memos: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/research/memo-types — available memo types ─────────────────
router.get("/research/memo-types", authenticateToken, async (_req, res) => {
  return res.json({
    types: [
      { id: "employer_brief", label: "Employer Research Brief", description: "Company overview, hiring patterns, reviews" },
      { id: "salary_intel", label: "Salary Intelligence", description: "Compensation ranges, trends, regional data" },
      { id: "sector_intel", label: "Sector Analysis", description: "Industry overview, major players, growth trends" },
      { id: "legal_research", label: "Legal/Procedural Research", description: "Immigration law, permit requirements, processing times" },
      { id: "meeting_prep", label: "Meeting Preparation Brief", description: "Client briefing, talking points, competitive landscape" },
      { id: "sourcing_strategy", label: "Sourcing Strategy", description: "Where to find candidates, market analysis" },
      { id: "hiring_difficulty", label: "Hiring Difficulty Forecast", description: "Supply/demand, time to fill, competition" },
      { id: "custom", label: "Custom Research", description: "Any research topic with cited sources" },
    ],
  });
});

export default router;
