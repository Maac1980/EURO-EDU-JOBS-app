/**
 * Safe Communication + Approval — Phase 4
 *
 * 3 types: worker (safe), internal (detailed), authority (formal)
 * AI drafts all 3, human approves. Deterministic fallback if AI fails.
 * Nothing external without is_approved = true.
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { completeBilingual, bilingualPromptSuffix } from "./bilingual.js";

const router = Router();

// ── Deterministic fallback messages (no AI needed) ──────────────────────
const FALLBACK_WORKER: Record<string, string> = {
  VALID: "Your documents are up to date. No action is needed at this time.",
  EXPIRING_SOON: "Some of your documents will need to be renewed soon. Your employer will contact you with details.",
  PROTECTED_PENDING: "Your application is being processed. You are authorized to continue working. Keep your passport stamp accessible.",
  EXPIRED_NOT_PROTECTED: "Important: please contact your employer's HR department as soon as possible regarding your documents.",
  NO_PERMIT: "Important: please contact your employer's HR department immediately.",
  REVIEW_REQUIRED: "Your case is being reviewed by the legal team. They will contact you with next steps.",
};

const FALLBACK_INTERNAL: Record<string, string> = {
  VALID: "Worker is fully compliant. All documents current. No action required.",
  EXPIRING_SOON: "Documents expiring within 60 days. Initiate renewal process. Check TRC/permit dates.",
  PROTECTED_PENDING: "Art. 108 protection active. Application filed before expiry. Monitor for decision or defect notice.",
  EXPIRED_NOT_PROTECTED: "CRITICAL: Work authorization expired without Art. 108 protection. Worker must stop work immediately. File new application urgently.",
  NO_PERMIT: "CRITICAL: No work authorization on file. Verify worker's right to work before any assignment.",
  REVIEW_REQUIRED: "Insufficient data for automated determination. Manual review required by legal team.",
};

// ── POST /api/comms/generate — generate all 3 types ────────────────────
router.post("/comms/generate", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseId } = req.body as { workerId: string; caseId?: string };
    if (!workerId) return res.status(400).json({ error: "workerId required" });

    // Get worker + snapshot + case
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    const snapRows = await db.select().from(schema.legalSnapshots)
      .where(eq(schema.legalSnapshots.workerId, workerId))
      .orderBy(desc(schema.legalSnapshots.createdAt)).limit(1);
    const snapshot = snapRows[0] ?? null;
    const status = snapshot?.legalStatus ?? "REVIEW_REQUIRED";

    let caseData: any = null;
    if (caseId) {
      const cRows = await db.execute(sql`SELECT * FROM legal_cases WHERE id = ${caseId}`);
      if (cRows.rows.length > 0) caseData = cRows.rows[0];
    }

    // Try AI generation
    let workerMsg = "", internalMsg = "", authorityMsg = "";
    let generatedBy = "ai";

    try {
      const mod = await import("@anthropic-ai/sdk");
      const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });

      const context = `LEGAL SNAPSHOT DATA — DO NOT CONTRADICT:
Worker: ${w.name}, Nationality: ${w.nationality ?? "N/A"}
Legal Status: ${status}
Legal Basis: ${snapshot?.legalBasis ?? "Unknown"}
Risk Level: ${snapshot?.riskLevel ?? "Unknown"}
Warnings: ${JSON.stringify(snapshot?.warnings ?? [])}
Required Actions: ${JSON.stringify(snapshot?.requiredActions ?? [])}
${caseData ? `Case: ${caseData.case_type} — Status: ${caseData.status}` : "No active case"}`;

      const resp = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 1000,
        messages: [{ role: "user", content: `${context}

Generate 3 messages. Use ONLY the data above. Do NOT invent facts.

=== WORKER MESSAGE ===
Simple, calm, no legal jargon, no article numbers, no risk scores.
Tell the worker: what is their situation, what happens next, what they need to do (if anything).
Max 3 sentences.

=== INTERNAL MESSAGE ===
Detailed. Include legal status, risk level, required actions, deadlines.
For the legal team and case managers.

=== AUTHORITY DRAFT ===
Formal Polish legal correspondence style.
Reference applicable articles. Professional tone.
For voivodship office or government authority.

Mark all as DRAFT.` }],
      });

      const text = resp.content[0].type === "text" ? resp.content[0].text : "";
      const workerMatch = text.match(/=== WORKER MESSAGE ===([\s\S]*?)(?:=== INTERNAL|$)/i);
      const internalMatch = text.match(/=== INTERNAL MESSAGE ===([\s\S]*?)(?:=== AUTHORITY|$)/i);
      const authorityMatch = text.match(/=== AUTHORITY DRAFT ===([\s\S]*?)$/i);

      workerMsg = (workerMatch?.[1] ?? "").trim();
      internalMsg = (internalMatch?.[1] ?? "").trim();
      authorityMsg = (authorityMatch?.[1] ?? "").trim();
    } catch (err: any) {
      console.error("[comms] AI generation failed:", err.message);
      generatedBy = "fallback";
    }

    // Fallback if AI failed or returned empty
    if (!workerMsg) workerMsg = FALLBACK_WORKER[status] ?? FALLBACK_WORKER.REVIEW_REQUIRED;
    if (!internalMsg) internalMsg = FALLBACK_INTERNAL[status] ?? FALLBACK_INTERNAL.REVIEW_REQUIRED;
    if (!authorityMsg && generatedBy === "fallback") {
      authorityMsg = `[Deterministic fallback — AI unavailable]\n\nWorker: ${w.name}\nStatus: ${status}\nManual drafting required for authority correspondence.`;
    }

    // Generate bilingual versions and store all outputs
    const outputs: any[] = [];
    for (const [type, content, origLang] of [
      ["worker", workerMsg, "pl"] as const,
      ["internal", internalMsg, "en"] as const,
      ["authority", authorityMsg, "pl"] as const,
    ]) {
      if (!content) continue;
      const bilingual = await completeBilingual(content, origLang);
      const fullContent = JSON.stringify({ pl: bilingual.pl, en: bilingual.en, original: origLang });
      await db.execute(sql`
        INSERT INTO communication_outputs (worker_id, case_id, comm_type, content, generated_by, snapshot_id, audit_log)
        VALUES (${workerId}, ${caseId ?? null}, ${type}, ${fullContent}, ${generatedBy},
          ${snapshot?.id ?? null},
          ${JSON.stringify([{ action: "generated_bilingual", by: generatedBy, at: new Date().toISOString() }])}::jsonb)
      `);
      outputs.push({ type, pl: bilingual.pl.substring(0, 100) + "...", en: bilingual.en.substring(0, 100) + "...", generatedBy });
    }

    return res.json({
      workerId, workerName: w.name,
      legalStatus: status,
      outputs,
      generatedBy,
      allDraft: true,
      status: "DRAFT — all outputs require approval before use",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/comms/worker/:workerId — get approved worker message ───────
router.get("/comms/worker/:workerId", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT content_edited, content FROM communication_outputs
      WHERE worker_id = ${req.params.workerId}
        AND comm_type = 'worker' AND is_approved = TRUE
      ORDER BY approved_at DESC LIMIT 1
    `);

    if (rows.rows.length === 0) {
      // Fallback: deterministic message from snapshot
      const snap = await db.select().from(schema.legalSnapshots)
        .where(eq(schema.legalSnapshots.workerId, req.params.workerId))
        .orderBy(desc(schema.legalSnapshots.createdAt)).limit(1);
      const status = snap[0]?.legalStatus ?? "REVIEW_REQUIRED";
      return res.json({
        message: FALLBACK_WORKER[status] ?? "Please contact your employer for information about your case.",
        source: "deterministic",
        approved: false,
      });
    }

    const row = rows.rows[0] as any;
    return res.json({
      message: row.content_edited ?? row.content,
      source: "approved",
      approved: true,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/comms/drafts — list all drafts (internal view) ─────────────
router.get("/comms/drafts", authenticateToken, async (req, res) => {
  try {
    const workerFilter = req.query.workerId as string;
    const rows = await db.execute(sql`
      SELECT co.*, w.name as worker_name
      FROM communication_outputs co
      JOIN workers w ON w.id = co.worker_id
      WHERE (${!workerFilter} OR co.worker_id = ${workerFilter ?? ""})
      ORDER BY co.generated_at DESC LIMIT 50
    `);
    return res.json({ drafts: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/comms/:id/edit — edit draft before approval ──────────────
router.patch("/comms/:id/edit", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body as { content: string };
    if (!content) return res.status(400).json({ error: "content required" });

    await db.execute(sql`
      UPDATE communication_outputs SET
        content_edited = ${content},
        audit_log = audit_log || ${JSON.stringify([{ action: "edited", by: (req as any).user?.email ?? "admin", at: new Date().toISOString() }])}::jsonb
      WHERE id = ${req.params.id} AND is_approved = FALSE
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/comms/:id/approve — approve for external use ─────────────
router.patch("/comms/:id/approve", authenticateToken, async (req, res) => {
  try {
    const approver = (req as any).user?.email ?? "admin";
    await db.execute(sql`
      UPDATE communication_outputs SET
        is_approved = TRUE,
        approved_by = ${approver},
        approved_at = NOW(),
        audit_log = audit_log || ${JSON.stringify([{ action: "approved", by: approver, at: new Date().toISOString() }])}::jsonb
      WHERE id = ${req.params.id}
    `);
    return res.json({ success: true, approved: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/comms/:id/reject — reject draft ─────────────────────────
router.patch("/comms/:id/reject", authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body as { reason?: string };
    await db.execute(sql`
      UPDATE communication_outputs SET
        audit_log = audit_log || ${JSON.stringify([{ action: "rejected", by: (req as any).user?.email ?? "admin", reason: reason ?? "", at: new Date().toISOString() }])}::jsonb
      WHERE id = ${req.params.id}
    `);
    // Delete rejected draft
    await db.execute(sql`DELETE FROM communication_outputs WHERE id = ${req.params.id} AND is_approved = FALSE`);
    return res.json({ success: true, deleted: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
