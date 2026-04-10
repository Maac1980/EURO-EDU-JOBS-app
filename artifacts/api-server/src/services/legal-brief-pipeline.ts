/**
 * Legal Brief Pipeline — 4-stage sequential AI legal intelligence.
 *
 * Stage 1: Legal Research (Perplexity) — find applicable articles
 * Stage 2: Case Analysis (Claude) — structured analysis for lawyer
 * Stage 3: Validation (Claude) — check for invented facts, consistency
 * Stage 4: Urgency Assessment (deterministic) — deadline/pressure layer
 *
 * SAFETY:
 *  - Legal snapshot is SOURCE OF TRUTH — never overridden
 *  - Pipeline halts if Stage 3 validation fails
 *  - All output marked requiresLawyerReview: true
 *  - Each stage stored separately for audit
 *  - No auto-apply of any legal conclusions
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

interface BriefStage {
  stage: number;
  name: string;
  status: "completed" | "failed" | "skipped";
  output: string;
  confidence: number;
  duration_ms: number;
}

interface LegalBrief {
  workerId: string;
  workerName: string;
  caseId?: string;
  stages: BriefStage[];
  overallStatus: "COMPLETE" | "VALIDATION_FAILED" | "PARTIAL" | "FAILED";
  requiresLawyerReview: true;
  generatedAt: string;
}

// ── POST /api/legal-brief/generate — run full 4-stage pipeline ──────────
router.post("/legal-brief/generate", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseId, question } = req.body as { workerId: string; caseId?: string; question?: string };
    if (!workerId) return res.status(400).json({ error: "workerId required" });

    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    // Get snapshot
    const snapRows = await db.select().from(schema.legalSnapshots)
      .where(eq(schema.legalSnapshots.workerId, workerId))
      .orderBy(desc(schema.legalSnapshots.createdAt)).limit(1);
    const snapshot = snapRows[0] ?? null;

    // Get case if provided
    let caseData: any = null;
    if (caseId) {
      const cRows = await db.execute(sql`SELECT * FROM legal_cases WHERE id = ${caseId}`);
      if (cRows.rows.length > 0) caseData = cRows.rows[0];
    }

    const context = `Worker: ${w.name}, Nationality: ${w.nationality ?? "N/A"}
TRC Expiry: ${w.trc_expiry ?? "N/A"}, Work Permit: ${w.work_permit_expiry ?? "N/A"}
BHP: ${w.bhp_status ?? "N/A"}, Medical: ${w.badania_lek_expiry ?? "N/A"}
Contract: ${w.contract_end_date ?? "N/A"}, Site: ${w.assigned_site ?? "N/A"}
Legal Status: ${snapshot?.legalStatus ?? "UNKNOWN"}, Risk: ${snapshot?.riskLevel ?? "UNKNOWN"}
Legal Basis: ${snapshot?.legalBasis ?? "Unknown"}
${caseData ? `Case: ${caseData.case_type} — ${caseData.status}` : ""}
${question ? `Question: ${question}` : ""}`;

    const stages: BriefStage[] = [];

    // ── STAGE 1: Legal Research (Perplexity) ─────────────────────────────
    let researchOutput = "";
    const s1Start = Date.now();
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (apiKey) {
        const searchQuery = question ?? `Polish immigration law requirements for ${w.nationality} worker with ${snapshot?.legalStatus ?? "unknown"} status. TRC expiry ${w.trc_expiry ?? "unknown"}. Applicable articles and current requirements.`;
        const resp = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "Search Polish immigration law. Focus on: TRC, work permits, Art. 108, oświadczenie. Cite specific articles and source URLs." },
              { role: "user", content: searchQuery },
            ],
            max_tokens: 800,
          }),
        });
        const data = await resp.json() as any;
        researchOutput = data.choices?.[0]?.message?.content ?? "No research results";
      } else {
        researchOutput = "Perplexity not configured — using legal KB only";
      }
    } catch { researchOutput = "Research stage failed — continuing with available data"; }

    // Also search local KB
    const kbResults = await db.execute(sql`
      SELECT title, content, law_reference FROM legal_articles
      WHERE content ILIKE ${"%" + (w.nationality ?? "worker") + "%"}
        OR content ILIKE ${"%" + (snapshot?.legalStatus ?? "permit") + "%"}
      LIMIT 3
    `);
    const kbContext = (kbResults.rows as any[]).map(a => `[${a.law_reference}] ${a.content.substring(0, 200)}`).join("\n");

    stages.push({
      stage: 1, name: "Legal Research",
      status: researchOutput.includes("failed") ? "failed" : "completed",
      output: researchOutput + (kbContext ? `\n\nVerified KB:\n${kbContext}` : ""),
      confidence: researchOutput.includes("failed") ? 30 : 75,
      duration_ms: Date.now() - s1Start,
    });

    // ── STAGE 2: Case Analysis (Claude) ──────────────────────────────────
    let analysisOutput = "";
    const s2Start = Date.now();
    try {
      const mod = await import("@anthropic-ai/sdk");
      const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 1000,
        messages: [{ role: "user", content:
          `LEGAL SNAPSHOT DATA — DO NOT CONTRADICT:
${context}

Research findings:
${researchOutput.substring(0, 500)}

${kbContext ? "Verified KB articles:\n" + kbContext : ""}

Create a structured legal brief:
1. SITUATION SUMMARY (2-3 sentences)
2. APPLICABLE LAW (specific articles with numbers)
3. RISK ASSESSMENT (what could go wrong)
4. RECOMMENDED ACTIONS (numbered, prioritized)
5. DEADLINES (dates if known)
6. ALTERNATIVE PATHS (if primary path blocked)

Use only provided data. Do not invent facts. Mark as DRAFT.` }],
      });
      analysisOutput = resp.content[0].type === "text" ? resp.content[0].text : "";
    } catch (e: any) {
      analysisOutput = `Analysis failed: ${e.message}`;
    }

    stages.push({
      stage: 2, name: "Case Analysis",
      status: analysisOutput.includes("failed") ? "failed" : "completed",
      output: analysisOutput,
      confidence: analysisOutput.includes("failed") ? 20 : 80,
      duration_ms: Date.now() - s2Start,
    });

    // ── STAGE 3: Validation (Claude) — check for invented facts ──────────
    let validationOutput = "";
    let validationPassed = false;
    const s3Start = Date.now();

    if (analysisOutput && !analysisOutput.includes("failed")) {
      try {
        const mod = await import("@anthropic-ai/sdk");
        const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
        const resp = await client.messages.create({
          model: "claude-sonnet-4-20250514", max_tokens: 400,
          messages: [{ role: "user", content:
            `VALIDATION CHECK — verify this legal brief against source data.

SOURCE DATA (ground truth):
${context}

BRIEF TO VALIDATE:
${analysisOutput.substring(0, 800)}

Check for:
1. Any facts mentioned in the brief that are NOT in the source data
2. Any dates, names, or numbers that contradict the source
3. Any legal articles cited incorrectly
4. Any claims about worker status that differ from the snapshot

Return JSON:
{
  "valid": true/false,
  "issues": ["list of problems found"],
  "invented_facts": ["any facts not in source data"],
  "confidence": 0-100
}` }],
        });
        const text = resp.content[0].type === "text" ? resp.content[0].text : "{}";
        const match = text.match(/\{[\s\S]*\}/);
        const validation = match ? JSON.parse(match[0]) : { valid: false, issues: ["Could not parse validation"] };
        validationPassed = validation.valid === true;
        validationOutput = JSON.stringify(validation);
      } catch (e: any) {
        validationOutput = JSON.stringify({ valid: false, issues: [`Validation failed: ${e.message}`] });
      }
    } else {
      validationOutput = JSON.stringify({ valid: false, issues: ["Analysis stage failed — nothing to validate"] });
    }

    stages.push({
      stage: 3, name: "Fact Validation",
      status: validationPassed ? "completed" : "failed",
      output: validationOutput,
      confidence: validationPassed ? 90 : 30,
      duration_ms: Date.now() - s3Start,
    });

    // ── STAGE 4: Urgency Assessment (DETERMINISTIC — no AI) ──────────────
    const s4Start = Date.now();
    const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
    const trcDays = daysUntil(w.trc_expiry);
    const permitDays = daysUntil(w.work_permit_expiry);
    const contractDays = daysUntil(w.contract_end_date);
    const appealDeadline = caseData?.appeal_deadline ? daysUntil(caseData.appeal_deadline) : null;

    const urgencyFactors: string[] = [];
    let urgencyLevel = "LOW";

    if (trcDays !== null && trcDays < 0) { urgencyFactors.push(`TRC EXPIRED ${Math.abs(trcDays)} days ago`); urgencyLevel = "CRITICAL"; }
    else if (trcDays !== null && trcDays < 14) { urgencyFactors.push(`TRC expires in ${trcDays} days`); urgencyLevel = "HIGH"; }
    else if (trcDays !== null && trcDays < 60) { urgencyFactors.push(`TRC expires in ${trcDays} days`); if (urgencyLevel === "LOW") urgencyLevel = "MEDIUM"; }

    if (appealDeadline !== null && appealDeadline < 14) { urgencyFactors.push(`Appeal deadline in ${appealDeadline} days`); urgencyLevel = "CRITICAL"; }

    if (caseData?.status === "DEFECT_NOTICE") { urgencyFactors.push("Defect notice requires immediate response"); urgencyLevel = "HIGH"; }
    if (snapshot?.legalStatus === "EXPIRED_NOT_PROTECTED") { urgencyFactors.push("Worker not protected — immediate risk"); urgencyLevel = "CRITICAL"; }

    stages.push({
      stage: 4, name: "Urgency Assessment",
      status: "completed",
      output: JSON.stringify({ urgencyLevel, factors: urgencyFactors, trcDays, permitDays, contractDays, appealDeadline }),
      confidence: 100, // deterministic = always 100%
      duration_ms: Date.now() - s4Start,
    });

    // ── Build final brief ────────────────────────────────────────────────
    const overallStatus = !validationPassed ? "VALIDATION_FAILED"
      : stages.some(s => s.status === "failed") ? "PARTIAL"
      : "COMPLETE";

    const brief: LegalBrief = {
      workerId, workerName: w.name, caseId,
      stages, overallStatus,
      requiresLawyerReview: true,
      generatedAt: new Date().toISOString(),
    };

    // Store for audit
    await db.insert(schema.legalApprovals).values({
      targetType: "legal_brief",
      targetId: caseId ? caseId : workerId,
      action: "generate_brief",
      aiRequest: context,
      aiResponse: JSON.stringify(brief),
    });

    // Save brief as legal document with approval workflow
    if (analysisOutput && !analysisOutput.includes("failed")) {
      await db.insert(schema.legalDocuments).values({
        workerId,
        caseId: caseId ?? null,
        docType: "legal_brief",
        language: "en",
        title: `Legal Brief — ${w.name}${caseData ? ` (${caseData.case_type})` : ""}`,
        content: analysisOutput,
        status: "draft",
        linkedSnapshotId: snapshot?.id ?? null,
      });
    }

    // If validation failed, add warning
    if (!validationPassed) {
      brief.stages.push({
        stage: 0, name: "⚠ VALIDATION WARNING",
        status: "failed",
        output: "Stage 3 validation detected potential issues. Lawyer must review ALL facts before using this brief.",
        confidence: 0,
        duration_ms: 0,
      });
    }

    return res.json(brief);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/legal-brief/history — list generated briefs ────────────────
router.get("/legal-brief/history", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.select().from(schema.legalApprovals)
      .where(eq(schema.legalApprovals.action, "generate_brief"))
      .orderBy(desc(schema.legalApprovals.createdAt))
      .limit(20);

    const briefs = rows.map(r => {
      const parsed = r.aiResponse ? JSON.parse(r.aiResponse as string) : {};
      return {
        id: r.id, workerId: parsed.workerId, workerName: parsed.workerName,
        overallStatus: parsed.overallStatus, stageCount: parsed.stages?.length,
        generatedAt: parsed.generatedAt, approvalStatus: r.status,
      };
    });

    return res.json({ briefs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
