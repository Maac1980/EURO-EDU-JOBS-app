/**
 * Legal Engine — AI-powered compliance scanning + case management.
 * AI drafts recommendations, lawyer reviews and approves.
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

interface WorkerDoc {
  id: string; name: string;
  trc_expiry: string | null; work_permit_expiry: string | null;
  bhp_status: string | null; badania_lek_expiry: string | null;
  contract_end_date: string | null; oswiadczenie_expiry: string | null;
  assigned_site: string | null; pipeline_stage: string | null;
  [key: string]: unknown;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function classifySeverity(days: number | null): "expired" | "critical" | "warning" | "ok" | "missing" {
  if (days === null) return "missing";
  if (days < 0) return "expired";
  if (days < 30) return "critical";
  if (days < 60) return "warning";
  return "ok";
}

async function getClaudeRecommendation(workerName: string, issues: string[]): Promise<{ recommendation: string; sources: string[] }> {
  try {
    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content:
        `You are a Polish immigration and labor law assistant for a staffing agency. Worker: ${workerName}. Issues found:\n${issues.join("\n")}\n\nProvide:\n1. Specific legal recommendation (what to do, in what order)\n2. Relevant Polish law articles (e.g. Art. 108 Ustawa o cudzoziemcach)\n3. Deadlines to meet\n\nKeep response under 200 words. Format as plain text, not markdown.`
      }],
    });
    const text = resp.content[0].type === "text" ? resp.content[0].text : "";
    const sources = text.match(/Art\.\s*\d+[a-z]?\s*(?:ust\.\s*\d+\s*)?(?:Ustaw[ay]\s+o\s+\w+|Kodeks\s+Pracy|KP)/gi) ?? [];
    return { recommendation: text, sources };
  } catch (err) {
    console.error("[legal-engine] Claude error:", err);
    return { recommendation: "AI recommendation unavailable — review manually.", sources: [] };
  }
}

// ── GET /api/legal/scan — run compliance scan ────────────────────────────
router.get("/legal/scan", authenticateToken, async (_req, res) => {
  try {
    const result = await db.execute<WorkerDoc>(sql`
      SELECT id, name, trc_expiry, work_permit_expiry, bhp_status,
        badania_lek_expiry, contract_end_date, oswiadczenie_expiry,
        assigned_site, pipeline_stage
      FROM workers WHERE pipeline_stage IN ('Active','Placed','Screening')
    `);
    const workers: WorkerDoc[] = result.rows;
    const now = new Date();

    const scanResults: any[] = [];
    for (const w of workers) {
      const issues: { field: string; label: string; severity: string; days: number | null }[] = [];
      const checks = [
        { field: "trc_expiry", label: "TRC / Residence Permit" },
        { field: "work_permit_expiry", label: "Work Permit" },
        { field: "bhp_status", label: "BHP Safety Training" },
        { field: "badania_lek_expiry", label: "Medical Examination" },
        { field: "contract_end_date", label: "Contract" },
        { field: "oswiadczenie_expiry", label: "Oświadczenie" },
      ];

      for (const c of checks) {
        const val = (w as any)[c.field];
        const days = daysUntil(val);
        const sev = classifySeverity(days);
        if (sev !== "ok") {
          issues.push({ field: c.field, label: c.label, severity: sev, days });
        }
      }

      if (issues.length > 0) {
        scanResults.push({
          workerId: w.id, workerName: w.name, site: w.assigned_site,
          issues, worstSeverity: issues.some(i => i.severity === "expired") ? "expired"
            : issues.some(i => i.severity === "critical") ? "critical"
            : issues.some(i => i.severity === "missing") ? "missing" : "warning",
        });
      }
    }

    scanResults.sort((a, b) => {
      const order = { expired: 0, critical: 1, missing: 2, warning: 3 };
      return (order[a.worstSeverity as keyof typeof order] ?? 4) - (order[b.worstSeverity as keyof typeof order] ?? 4);
    });

    return res.json({
      scannedAt: now.toISOString(),
      totalWorkers: workers.length,
      issuesFound: scanResults.length,
      results: scanResults,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/legal/scan-with-ai — scan + AI recommendations ────────────
router.post("/legal/scan-with-ai", authenticateToken, async (req, res) => {
  try {
    const { workerId } = req.body as { workerId?: string };
    if (!workerId) return res.status(400).json({ error: "workerId required" });

    const result = await db.execute<WorkerDoc>(sql`
      SELECT id, name, trc_expiry, work_permit_expiry, bhp_status,
        badania_lek_expiry, contract_end_date, oswiadczenie_expiry
      FROM workers WHERE id = ${workerId}
    `);
    if (result.rows.length === 0) return res.status(404).json({ error: "Worker not found" });

    const w: WorkerDoc = result.rows[0];
    const issueTexts: string[] = [];
    const checks = [
      { field: "trc_expiry", label: "TRC" }, { field: "work_permit_expiry", label: "Work Permit" },
      { field: "bhp_status", label: "BHP" }, { field: "badania_lek_expiry", label: "Medical Exam" },
      { field: "contract_end_date", label: "Contract" }, { field: "oswiadczenie_expiry", label: "Oświadczenie" },
    ];
    for (const c of checks) {
      const days = daysUntil((w as any)[c.field]);
      const sev = classifySeverity(days);
      if (sev !== "ok") issueTexts.push(`${c.label}: ${sev}${days !== null ? ` (${days} days)` : " (missing)"}`);
    }

    if (issueTexts.length === 0) {
      return res.json({ workerId, workerName: w.name, status: "compliant", recommendation: "No issues found.", sources: [] });
    }

    const ai = await getClaudeRecommendation(w.name, issueTexts);

    // Save as legal case
    await db.execute(sql`
      INSERT INTO legal_cases (worker_id, case_type, severity, title, description, ai_recommendation, ai_sources, ai_confidence, status)
      VALUES (${workerId}, 'compliance_scan', 'critical', ${"Compliance issues for " + w.name},
        ${issueTexts.join("; ")}, ${ai.recommendation}, ${JSON.stringify(ai.sources)}::jsonb, 85, 'open')
    `);

    return res.json({
      workerId, workerName: w.name,
      issues: issueTexts,
      aiRecommendation: ai.recommendation,
      aiSources: ai.sources,
      status: "DRAFT — Requires Legal Review",
      caseCreated: true,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/legal/cases — list legal cases ──────────────────────────────
router.get("/legal/cases", authenticateToken, async (req, res) => {
  try {
    const status = (req.query.status as string) || "";
    const where = status ? sql`WHERE lc.status = ${status}` : sql``;
    const rows = await db.execute(sql`
      SELECT lc.*, w.name as worker_name FROM legal_cases lc
      LEFT JOIN workers w ON w.id = lc.worker_id
      ${where}
      ORDER BY lc.created_at DESC LIMIT 100
    `);
    return res.json({ cases: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/legal/cases/:id — lawyer review ──────────────────────────
router.patch("/legal/cases/:id", authenticateToken, async (req, res) => {
  try {
    const { status, lawyerNotes, lawyerDecision } = req.body as any;
    await db.execute(sql`
      UPDATE legal_cases SET
        status = COALESCE(${status ?? null}, status),
        lawyer_notes = COALESCE(${lawyerNotes ?? null}, lawyer_notes),
        lawyer_decision = COALESCE(${lawyerDecision ?? null}, lawyer_decision),
        decided_at = CASE WHEN ${status ?? null} IN ('approved','rejected') THEN NOW() ELSE decided_at END,
        updated_at = NOW()
      WHERE id = ${req.params.id}
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
