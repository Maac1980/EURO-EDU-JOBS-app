import { Router } from "express";
import cron from "node-cron";
import { db, schema } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import { analyzeText } from "../lib/ai.js";
import { authenticateToken, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { sendEmail } from "../lib/alerter.js";

const router = Router();

// ── Perplexity API for regulatory search ────────────────────────────────────
async function searchRegulatory(query: string): Promise<string | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "You are a Polish labor law research assistant. Search for the latest regulatory changes, deadlines, and compliance requirements. Always include specific dates, fine amounts, and legal references." },
          { role: "user", content: query },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error("[regulatory] Perplexity search error:", e);
    return null;
  }
}

// ── Daily regulatory scan ───────────────────────────────────────────────────
async function runRegulatoryCheck(): Promise<void> {
  console.log("[regulatory] Running daily regulatory scan...");

  const queries = [
    { query: "Latest changes to Polish work permit regulations 2026 for foreign workers, praca.gov.pl updates", category: "work_permits", source: "praca.gov.pl" },
    { query: "ZUS social insurance changes Poland 2026, new contribution rates, reporting deadlines", category: "zus", source: "zus.pl" },
    { query: "Poland labor inspection penalties fines 2026, PIP enforcement actions, compliance requirements", category: "fines", source: "pip.gov.pl" },
    { query: "MOS portal Poland work permit application changes, processing times, new requirements 2026", category: "work_permits", source: "mos_portal" },
    { query: "Poland 7-day reporting obligation foreign workers, employer obligations, deadline changes 2026", category: "reporting", source: "praca.gov.pl" },
  ];

  for (const q of queries) {
    try {
      const searchResult = await searchRegulatory(q.query);
      if (!searchResult) continue;

      // Use Claude to analyze and summarize
      const analysis = await analyzeText(
        `Analyze this regulatory update for a Polish staffing agency managing foreign workers. Identify:\n1. Key changes\n2. Deadlines\n3. Fine amounts\n4. Required actions\n\nRegulatory info:\n${searchResult}`,
        "You are a Polish labor law compliance expert. Provide clear, actionable summaries in English. Flag any fines above PLN 10,000 as critical. Always mention specific deadlines."
      );

      // Determine severity
      let severity = "info";
      if (searchResult.toLowerCase().includes("fine") || searchResult.toLowerCase().includes("kara") || searchResult.toLowerCase().includes("50,000") || searchResult.toLowerCase().includes("50000")) {
        severity = "critical";
      } else if (searchResult.toLowerCase().includes("deadline") || searchResult.toLowerCase().includes("termin")) {
        severity = "warning";
      }

      // Extract fine amount if mentioned
      const fineMatch = searchResult.match(/PLN\s*[\d,]+|[\d,]+\s*PLN|[\d,]+\s*zł/i);
      const fineAmount = fineMatch ? fineMatch[0] : null;

      await db.insert(schema.regulatoryUpdates).values({
        source: q.source,
        title: `${q.category.replace(/_/g, " ").toUpperCase()} Update - ${new Date().toLocaleDateString("en-GB")}`,
        summary: analysis?.slice(0, 500) ?? searchResult.slice(0, 500),
        fullText: searchResult,
        category: q.category,
        severity,
        fineAmount,
        aiAnalysis: analysis,
      });

      // Send critical alerts immediately
      if (severity === "critical") {
        const adminEmail = process.env.ALERT_EMAIL_TO;
        if (adminEmail) {
          const smtpFrom = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? process.env.BREVO_SMTP_USER ?? "noreply@edu-jobs.eu";
          await sendEmail({
            from: `EEJ Regulatory Alert <${smtpFrom}>`,
            to: adminEmail,
            subject: `CRITICAL: ${q.category.replace(/_/g, " ")} regulatory change detected`,
            html: `<div style="font-family:Arial,sans-serif;padding:20px;"><h2 style="color:#dc2626;">Regulatory Alert</h2><p>${analysis?.slice(0, 1000) ?? searchResult.slice(0, 1000)}</p>${fineAmount ? `<p style="font-weight:bold;color:#dc2626;">Potential fine: ${fineAmount}</p>` : ""}</div>`,
          }).catch(e => console.warn("[regulatory] Alert email failed:", e));
        }
      }
    } catch (err) {
      console.error(`[regulatory] Error scanning ${q.source}:`, err);
    }
  }
  console.log("[regulatory] Daily scan complete");
}

// ── API Routes ──────────────────────────────────────────────────────────────

// GET /api/regulatory/updates — list all regulatory updates
router.get("/regulatory/updates", authenticateToken, async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    let updates = await db.select().from(schema.regulatoryUpdates).orderBy(desc(schema.regulatoryUpdates.fetchedAt)).limit(100);
    if (category) updates = updates.filter(u => u.category === category);
    return res.json({ updates });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load updates" });
  }
});

// POST /api/regulatory/scan — trigger manual regulatory scan
router.post("/regulatory/scan", authenticateToken, requireCoordinatorOrAdmin, async (_req, res) => {
  try {
    await runRegulatoryCheck();
    return res.json({ success: true, message: "Regulatory scan completed" });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

// PATCH /api/regulatory/updates/:id/read — mark as read
router.patch("/regulatory/updates/:id/read", authenticateToken, async (req, res) => {
  await db.update(schema.regulatoryUpdates).set({ readByAdmin: true }).where(eq(schema.regulatoryUpdates.id, String(req.params.id)));
  return res.json({ success: true });
});

// GET /api/regulatory/copilot — AI compliance copilot with streaming
router.get("/regulatory/copilot", authenticateToken, async (req, res) => {
  const question = req.query.q as string;
  if (!question) return res.status(400).json({ error: "Question (q) is required" });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });

  // Get recent regulatory updates for context
  const recentUpdates = await db.select().from(schema.regulatoryUpdates).orderBy(desc(schema.regulatoryUpdates.fetchedAt)).limit(5);
  const context = recentUpdates.map(u => `[${u.source}] ${u.summary}`).join("\n\n");

  try {
    const { streamAnalysis } = await import("../lib/ai.js");
    const stream = await streamAnalysis(
      `Context (recent regulatory updates):\n${context}\n\nUser question: ${question}`,
      "You are the EEJ AI Compliance Copilot — an expert in Polish labor law, work permits, ZUS, and foreign worker employment. Answer in clear English. Cite specific regulations, deadlines, and fine amounts. If unsure, say so."
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

// ── Schedule daily regulatory scan ──────────────────────────────────────────
export function startRegulatoryMonitor(): void {
  const cronExpr = process.env.REGULATORY_CRON ?? "0 7 * * *"; // 7am daily
  console.log(`[regulatory] Scheduling daily scan: "${cronExpr}"`);
  cron.schedule(cronExpr, () => { runRegulatoryCheck(); });
}

export default router;
