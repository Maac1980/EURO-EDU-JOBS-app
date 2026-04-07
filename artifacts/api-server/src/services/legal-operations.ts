/**
 * Legal Operations API — case management, evidence, documents,
 * suggestions, queue, approvals, notifications, PIP report.
 * Parts 2-17 of the legal system.
 */
import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq, desc, sql, and, asc } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus, type LegalInput } from "./legal-decision-engine.js";

const router = Router();

// ══ HELPER: Build LegalInput from worker row ════════════════════════════════

function workerToLegalInput(w: any): LegalInput {
  return {
    workerId: w.id,
    workerName: w.name ?? "",
    nationality: w.nationality ?? "",
    permitExpiry: w.work_permit_expiry ?? w.workPermitExpiry ?? null,
    trcExpiry: w.trc_expiry ?? w.trcExpiry ?? null,
    trcFilingDate: w.trc_filing_date ?? null,
    trcApplicationPending: !!(w.trc_filing_date && !w.trc_expiry),
    employerContinuity: w.employer_continuity ?? true,
    roleContinuity: w.role_continuity ?? true,
    formalDefect: w.formal_defect ?? false,
    contractEndDate: w.contract_end_date ?? w.contractEndDate ?? null,
    bhpExpiry: w.bhp_status ?? w.bhpStatus ?? null,
    medicalExpiry: w.badania_lek_expiry ?? w.badaniaLekExpiry ?? null,
    oswiadczenieExpiry: w.oswiadczenie_expiry ?? w.oswiadczenieExpiry ?? null,
    hasValidPassport: true,
    evidenceSubmitted: [],
  };
}

// ══ PART 1+2: LEGAL SNAPSHOTS ═══════════════════════════════════════════════

// POST /api/legal/snapshot/:workerId — create legal snapshot
router.post("/legal/snapshot/:workerId", authenticateToken, async (req, res) => {
  try {
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${req.params.workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;
    const input = workerToLegalInput(w);
    const result = evaluateLegalStatus(input);

    const [snapshot] = await db.insert(schema.legalSnapshots).values({
      workerId: req.params.workerId,
      legalStatus: result.legalStatus,
      legalBasis: result.legalBasis,
      riskLevel: result.riskLevel,
      conditions: result.conditions,
      warnings: result.warnings,
      requiredActions: result.requiredActions,
      permitExpiry: input.permitExpiry,
      trcFilingDate: input.trcFilingDate,
      employerContinuity: input.employerContinuity,
      roleContinuity: input.roleContinuity,
      formalDefect: input.formalDefect,
      nationality: input.nationality,
      snapshotData: { input, result, timestamp: new Date().toISOString() },
      createdBy: (req as any).user?.email ?? "system",
    }).returning();

    // Auto-generate suggestions
    await generateSuggestions(req.params.workerId, result);

    return res.json({ snapshot, legalResult: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/legal/snapshot/:workerId — get latest snapshot
router.get("/legal/snapshot/:workerId", authenticateToken, async (req, res) => {
  try {
    const rows = await db.select().from(schema.legalSnapshots)
      .where(eq(schema.legalSnapshots.workerId, req.params.workerId))
      .orderBy(desc(schema.legalSnapshots.createdAt))
      .limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "No snapshot found" });
    return res.json({ snapshot: rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/legal/scan-all — scan ALL workers, create snapshots
router.post("/legal/scan-all", authenticateToken, async (_req, res) => {
  try {
    const workers = await db.execute(sql`SELECT * FROM workers WHERE pipeline_stage IN ('Active','Placed','Screening')`);
    const results: any[] = [];
    for (const w of workers.rows as any[]) {
      const input = workerToLegalInput(w);
      const result = evaluateLegalStatus(input);
      await db.insert(schema.legalSnapshots).values({
        workerId: w.id,
        legalStatus: result.legalStatus,
        legalBasis: result.legalBasis,
        riskLevel: result.riskLevel,
        conditions: result.conditions,
        warnings: result.warnings,
        requiredActions: result.requiredActions,
        nationality: w.nationality,
        snapshotData: { input, result },
        createdBy: "system-scan",
      });
      await generateSuggestions(w.id, result);
      results.push({ workerId: w.id, name: w.name, status: result.legalStatus, risk: result.riskLevel });
    }
    results.sort((a, b) => riskOrder(a.risk) - riskOrder(b.risk));
    return res.json({ scanned: results.length, results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 3: EVIDENCE + OCR ══════════════════════════════════════════════════

// POST /api/legal/evidence — upload evidence
router.post("/legal/evidence", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseId, evidenceType, filename, storageUrl, manualData } = req.body as any;
    if (!workerId || !evidenceType) return res.status(400).json({ error: "workerId and evidenceType required" });

    const [ev] = await db.insert(schema.legalEvidence).values({
      workerId, caseId: caseId ?? null, evidenceType, filename, storageUrl,
      manualData: manualData ?? null,
    }).returning();
    return res.status(201).json({ evidence: ev });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/legal/evidence/:id/ocr — run OCR on evidence
router.post("/legal/evidence/:id/ocr", authenticateToken, async (req, res) => {
  try {
    const { image, mimeType } = req.body as { image: string; mimeType?: string };
    if (!image) return res.status(400).json({ error: "Base64 image required" });

    let ocrResult: any = {};
    let confidence = 0;
    try {
      const mod = await import("@anthropic-ai/sdk");
      const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 800,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: (mimeType ?? "image/jpeg") as any, data: image } },
          { type: "text", text: `Extract from this Polish immigration document: filing_date (YYYY-MM-DD), reference_number, authority_name, document_type, expiry_date, worker_name. Return JSON: { "fields": { "field": { "value": "...", "confidence": 90 } } }` },
        ]}],
      });
      const text = resp.content[0].type === "text" ? resp.content[0].text : "{}";
      const match = text.match(/\{[\s\S]*\}/);
      ocrResult = match ? JSON.parse(match[0]) : {};
      const fields = ocrResult.fields ?? {};
      const scores = Object.values(fields).map((f: any) => f.confidence ?? 0) as number[];
      confidence = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
    } catch (e: any) {
      ocrResult = { error: e.message };
    }

    // Update evidence record
    await db.update(schema.legalEvidence).set({
      ocrResult, ocrConfidence: confidence,
      extractedFilingDate: ocrResult.fields?.filing_date?.value ?? null,
      extractedReference: ocrResult.fields?.reference_number?.value ?? null,
      extractedAuthority: ocrResult.fields?.authority_name?.value ?? null,
    }).where(eq(schema.legalEvidence.id, req.params.id));

    // Check mismatches with manual data
    const [ev] = await db.select().from(schema.legalEvidence).where(eq(schema.legalEvidence.id, req.params.id));
    let mismatches: any = null;
    if (ev?.manualData && ocrResult.fields) {
      mismatches = {};
      for (const [key, val] of Object.entries(ocrResult.fields as Record<string, any>)) {
        const manual = (ev.manualData as any)[key];
        if (manual && val.value && manual !== val.value) {
          mismatches[key] = { ocr: val.value, manual, confidence: val.confidence };
        }
      }
      if (Object.keys(mismatches).length > 0) {
        await db.update(schema.legalEvidence).set({ mismatchFlags: mismatches }).where(eq(schema.legalEvidence.id, req.params.id));
      }
    }

    return res.json({ ocrResult, confidence, mismatches, status: "DRAFT — verify extracted data" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/legal/evidence/:workerId — list evidence for worker
router.get("/legal/evidence/:workerId", authenticateToken, async (req, res) => {
  try {
    const rows = await db.select().from(schema.legalEvidence)
      .where(eq(schema.legalEvidence.workerId, req.params.workerId))
      .orderBy(desc(schema.legalEvidence.uploadedAt));
    return res.json({ evidence: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 4+5: CASE MANAGEMENT ═══════════════════════════════════════════════

// POST /api/legal/cases — create case (extended)
router.post("/legal/cases-new", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseType, title, description, caseManager, trcCaseId } = req.body as any;
    if (!workerId || !caseType || !title) return res.status(400).json({ error: "workerId, caseType, title required" });

    await db.execute(sql`
      INSERT INTO legal_cases (worker_id, case_type, title, description, case_manager, trc_case_id, status, severity, priority_score)
      VALUES (${workerId}, ${caseType}, ${title}, ${description ?? null}, ${caseManager ?? null}, ${trcCaseId ?? null}, 'NEW', 'warning', 50)
    `);
    return res.status(201).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/legal/cases/:id/status — update case status
router.patch("/legal/cases/:id/status", authenticateToken, async (req, res) => {
  try {
    const { status, lawyerNotes, lawyerDecision, appealDeadline } = req.body as any;
    const updates: string[] = ["updated_at = NOW()"];
    if (status) updates.push(`status = '${status}'`);
    if (lawyerNotes) updates.push(`lawyer_notes = '${lawyerNotes.replace(/'/g, "''")}'`);
    if (lawyerDecision) updates.push(`lawyer_decision = '${lawyerDecision}'`);
    if (appealDeadline) updates.push(`appeal_deadline = '${appealDeadline}'`);
    if (status === "REJECTED") {
      // Auto-calculate 14-day appeal deadline
      updates.push(`appeal_deadline = COALESCE(appeal_deadline, (NOW() + INTERVAL '14 days')::date)`);
    }
    if (status === "APPROVED" || status === "REJECTED") {
      updates.push(`decided_at = NOW()`);
    }
    await db.execute(sql.raw(`UPDATE legal_cases SET ${updates.join(", ")} WHERE id = '${req.params.id}'`));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 6+7: DOCUMENTS ═════════════════════════════════════════════════════

// POST /api/legal/documents/generate — generate document from template/AI
router.post("/legal/documents/generate", authenticateToken, async (req, res) => {
  try {
    const { workerId, caseId, docType, language, snapshotId } = req.body as any;
    if (!workerId || !docType) return res.status(400).json({ error: "workerId and docType required" });

    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    // Get snapshot for context
    let snapshot: any = null;
    if (snapshotId) {
      const sRows = await db.select().from(schema.legalSnapshots).where(eq(schema.legalSnapshots.id, snapshotId));
      if (sRows.length > 0) snapshot = sRows[0];
    }

    // Generate with AI
    let content = "";
    try {
      const mod = await import("@anthropic-ai/sdk");
      const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
      const snapshotContext = snapshot
        ? `\n\nLEGAL SNAPSHOT DATA — DO NOT CONTRADICT:\nStatus: ${snapshot.legalStatus}\nBasis: ${snapshot.legalBasis}\nRisk: ${snapshot.riskLevel}\nWarnings: ${JSON.stringify(snapshot.warnings)}\nRequired Actions: ${JSON.stringify(snapshot.requiredActions)}`
        : "";

      const resp = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 2000,
        messages: [{ role: "user", content:
          `Generate a ${docType} document in ${language ?? "pl"} (Polish) for:
Worker: ${w.name}, Nationality: ${w.nationality ?? "N/A"}, PESEL: ${w.pesel ?? "N/A"}
Document type: ${docType}
${snapshotContext}

Generate formal legal document text. Include date, parties, legal references.
Mark as "DRAFT — Requires Legal Review" at top.
Do not use markdown formatting.` }],
      });
      content = resp.content[0].type === "text" ? resp.content[0].text : "Generation failed";
    } catch (e: any) {
      content = `DRAFT — AI generation failed: ${e.message}. Manual drafting required.`;
    }

    const [doc] = await db.insert(schema.legalDocuments).values({
      workerId, caseId: caseId ?? null, docType,
      language: language ?? "pl",
      title: `${docType} — ${w.name}`,
      content, status: "draft",
      linkedSnapshotId: snapshotId ?? null,
    }).returning();

    // Create approval record
    await db.insert(schema.legalApprovals).values({
      targetType: "document", targetId: doc.id,
      action: "approve_document", roleRequired: "case_manager",
    });

    return res.json({ document: doc, status: "DRAFT — Requires Legal Review" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/legal/documents — list documents
router.get("/legal/documents", authenticateToken, async (req, res) => {
  try {
    const workerId = req.query.workerId as string;
    const rows = workerId
      ? await db.select().from(schema.legalDocuments).where(eq(schema.legalDocuments.workerId, workerId)).orderBy(desc(schema.legalDocuments.createdAt))
      : await db.select().from(schema.legalDocuments).orderBy(desc(schema.legalDocuments.createdAt)).limit(50);
    return res.json({ documents: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/legal/documents/:id/approve — approve document
router.patch("/legal/documents/:id/approve", authenticateToken, async (req, res) => {
  try {
    await db.update(schema.legalDocuments).set({
      status: "approved", approvedBy: (req as any).user?.email ?? "admin", approvedAt: new Date(), updatedAt: new Date(),
    }).where(eq(schema.legalDocuments.id, req.params.id));

    await db.execute(sql`
      UPDATE legal_approvals SET status = 'approved', approved_by = ${(req as any).user?.email ?? "admin"}, approved_at = NOW()
      WHERE target_type = 'document' AND target_id = ${req.params.id} AND status = 'pending'
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 8: AUTO-SUGGEST ════════════════════════════════════════════════════

async function generateSuggestions(workerId: string, result: any) {
  const suggestions: { type: string; reason: string; priority: number }[] = [];

  if (result.legalStatus === "EXPIRING_SOON") {
    suggestions.push({ type: "file_trc_application", reason: "Work authorization expiring soon — file TRC before expiry for Art. 108 protection", priority: 90 });
  }
  if (result.legalStatus === "EXPIRED_NOT_PROTECTED") {
    suggestions.push({ type: "urgent_renewal", reason: "Authorization expired without Art. 108 protection — immediate action required", priority: 100 });
  }
  if (result.legalStatus === "PROTECTED_PENDING" && result.warnings.length > 0) {
    suggestions.push({ type: "prepare_cover_letter", reason: "Art. 108 active but warnings present — prepare supporting documents", priority: 60 });
  }
  if (result.requiredActions.some((a: string) => a.includes("BHP"))) {
    suggestions.push({ type: "schedule_bhp", reason: "BHP training expired or expiring", priority: 70 });
  }
  if (result.requiredActions.some((a: string) => a.includes("medical") || a.includes("badania"))) {
    suggestions.push({ type: "schedule_medical", reason: "Medical examination expired or expiring", priority: 70 });
  }

  for (const s of suggestions) {
    await db.execute(sql`
      INSERT INTO legal_suggestions (worker_id, suggestion_type, reason, priority, status)
      VALUES (${workerId}, ${s.type}, ${s.reason}, ${s.priority}, 'pending')
      ON CONFLICT (worker_id, suggestion_type, status) WHERE status = 'pending' DO NOTHING
    `);
  }
}

// GET /api/legal/suggestions — list pending suggestions
router.get("/legal/suggestions", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.select().from(schema.legalSuggestions)
      .where(eq(schema.legalSuggestions.status, "pending"))
      .orderBy(desc(schema.legalSuggestions.priority));
    return res.json({ suggestions: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/legal/suggestions/:id — act on or dismiss
router.patch("/legal/suggestions/:id", authenticateToken, async (req, res) => {
  try {
    const { action } = req.body as { action: "dismiss" | "act" };
    if (action === "dismiss") {
      await db.update(schema.legalSuggestions).set({ status: "dismissed", dismissedBy: (req as any).user?.email ?? "admin", dismissedAt: new Date() })
        .where(eq(schema.legalSuggestions.id, req.params.id));
    } else {
      await db.update(schema.legalSuggestions).set({ status: "acted", actedOnAt: new Date() })
        .where(eq(schema.legalSuggestions.id, req.params.id));
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 9: LEGAL QUEUE ═════════════════════════════════════════════════════

router.get("/legal/queue", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT lc.*, w.name as worker_name, w.nationality,
        ls.legal_status, ls.risk_level, ls.required_actions,
        (SELECT COUNT(*)::int FROM legal_evidence le WHERE le.case_id = lc.id) as evidence_count,
        (SELECT COUNT(*)::int FROM legal_documents ld WHERE ld.case_id = lc.id AND ld.status = 'draft') as pending_docs
      FROM legal_cases lc
      JOIN workers w ON w.id = lc.worker_id
      LEFT JOIN LATERAL (
        SELECT * FROM legal_snapshots WHERE worker_id = lc.worker_id ORDER BY created_at DESC LIMIT 1
      ) ls ON TRUE
      WHERE lc.status NOT IN ('resolved', 'closed')
      ORDER BY
        CASE lc.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        CASE ls.risk_level WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
        lc.appeal_deadline ASC NULLS LAST,
        lc.created_at ASC
      LIMIT 100
    `);
    return res.json({ queue: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 10: REJECTION INTELLIGENCE ═════════════════════════════════════════

router.post("/legal/rejection/analyze", authenticateToken, async (req, res) => {
  try {
    const { caseId, rejectionText } = req.body as any;
    if (!rejectionText) return res.status(400).json({ error: "rejectionText required" });

    // Rule-based classification first
    const lower = rejectionText.toLowerCase();
    let classification: { category: string; confidence: number }[] = [];

    if (lower.includes("brak") || lower.includes("nie załączono") || lower.includes("nie przedłożono"))
      classification.push({ category: "missing_documents", confidence: 90 });
    if (lower.includes("wada formalna") || lower.includes("braki formalne"))
      classification.push({ category: "formal_defect", confidence: 95 });
    if (lower.includes("termin") || lower.includes("po terminie") || lower.includes("spóźnion"))
      classification.push({ category: "timing_error", confidence: 85 });
    if (lower.includes("pracodawc") && (lower.includes("nie spełnia") || lower.includes("warunki")))
      classification.push({ category: "employer_error", confidence: 80 });
    if (lower.includes("podstaw") && lower.includes("prawn"))
      classification.push({ category: "legal_basis_problem", confidence: 75 });

    if (classification.length === 0) classification.push({ category: "unclassified", confidence: 50 });

    // AI explanation (controlled)
    let aiExplanation = "";
    let aiNextSteps = "";
    try {
      const mod = await import("@anthropic-ai/sdk");
      const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 500,
        messages: [{ role: "user", content:
          `LEGAL SNAPSHOT DATA — DO NOT CONTRADICT.
Rule-based classification: ${JSON.stringify(classification)}

Rejection text from Polish immigration authority:
"${rejectionText}"

Provide:
1. Plain-language explanation of what this rejection means (2-3 sentences)
2. Recommended next steps (numbered list, max 5)
3. Appeal deadline consideration (usually 14 days from decision delivery)

Keep under 200 words. Mark as DRAFT.` }],
      });
      const text = resp.content[0].type === "text" ? resp.content[0].text : "";
      aiExplanation = text;
    } catch { aiExplanation = "AI explanation unavailable."; }

    // Store on case
    if (caseId) {
      await db.execute(sql`
        UPDATE legal_cases SET
          rejection_text = ${rejectionText},
          rejection_classification = ${JSON.stringify(classification)}::jsonb,
          appeal_deadline = COALESCE(appeal_deadline, (NOW() + INTERVAL '14 days')::date),
          status = 'REJECTED',
          updated_at = NOW()
        WHERE id = ${caseId}
      `);
    }

    // Store AI request/response for audit
    await db.insert(schema.legalApprovals).values({
      targetType: "rejection_analysis", targetId: caseId ?? "00000000-0000-0000-0000-000000000000",
      action: "analyze_rejection", aiRequest: rejectionText, aiResponse: aiExplanation,
    });

    return res.json({
      classification, aiExplanation,
      appealDeadline: "14 days from delivery of decision",
      status: "DRAFT — Requires Legal Review",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 12: APPROVALS ══════════════════════════════════════════════════════

router.get("/legal/approvals", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.select().from(schema.legalApprovals)
      .where(eq(schema.legalApprovals.status, "pending"))
      .orderBy(desc(schema.legalApprovals.createdAt))
      .limit(50);
    return res.json({ approvals: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/legal/approvals/:id", authenticateToken, async (req, res) => {
  try {
    const { status, notes } = req.body as { status: "approved" | "rejected"; notes?: string };
    await db.update(schema.legalApprovals).set({
      status, approvedBy: (req as any).user?.email ?? "admin", approvedAt: new Date(), notes: notes ?? null,
    }).where(eq(schema.legalApprovals.id, req.params.id));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 14: NOTIFICATIONS ══════════════════════════════════════════════════

router.post("/legal/notifications", authenticateToken, async (req, res) => {
  try {
    const { workerId, clientId, caseId, messageType, message, recipientType } = req.body as any;
    if (!messageType || !message) return res.status(400).json({ error: "messageType and message required" });

    const [notif] = await db.insert(schema.legalNotifications).values({
      workerId: workerId ?? null, clientId: clientId ?? null, caseId: caseId ?? null,
      messageType, message, recipientType: recipientType ?? "worker",
      status: "pending", aiGenerated: false, approved: false,
    }).returning();

    // Create approval
    await db.insert(schema.legalApprovals).values({
      targetType: "notification", targetId: notif.id,
      action: "send_notification", roleRequired: "case_manager",
    });

    return res.status(201).json({ notification: notif, status: "DRAFT — requires approval before sending" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/legal/notifications", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.select().from(schema.legalNotifications)
      .orderBy(desc(schema.legalNotifications.createdAt)).limit(100);
    return res.json({ notifications: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 13+16: CLIENT/WORKER PORTAL (SAFE) ═════════════════════════════════

router.get("/legal/portal/status/:workerId", async (req, res) => {
  try {
    const rows = await db.select().from(schema.legalSnapshots)
      .where(eq(schema.legalSnapshots.workerId, req.params.workerId))
      .orderBy(desc(schema.legalSnapshots.createdAt)).limit(1);
    if (rows.length === 0) return res.json({ status: "No information available", nextSteps: "Contact your employer" });

    const s = rows[0];
    // Safe messages only — no legal codes, no risk levels
    const statusMap: Record<string, string> = {
      VALID: "Your documents are up to date",
      EXPIRING_SOON: "Some documents need renewal soon",
      PROTECTED_PENDING: "Your application is being processed — you are authorized to work",
      REVIEW_REQUIRED: "Your case is under review",
      EXPIRED_NOT_PROTECTED: "Action required — please contact your employer immediately",
      NO_PERMIT: "Action required — please contact your employer immediately",
    };
    const nextStepsMap: Record<string, string> = {
      VALID: "No action needed at this time",
      EXPIRING_SOON: "Your employer will contact you about document renewal",
      PROTECTED_PENDING: "Keep your passport stamp (stempel) accessible. Wait for decision",
      REVIEW_REQUIRED: "Your employer's legal team is reviewing your case",
      EXPIRED_NOT_PROTECTED: "Contact your employer's HR department urgently",
      NO_PERMIT: "Contact your employer's HR department urgently",
    };

    return res.json({
      status: statusMap[s.legalStatus] ?? "Information unavailable",
      nextSteps: nextStepsMap[s.legalStatus] ?? "Contact your employer",
      lastUpdated: s.createdAt,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ PART 17: PIP INSPECTION REPORT ══════════════════════════════════════════

router.get("/legal/pip-report", authenticateToken, async (_req, res) => {
  try {
    const workers = await db.execute(sql`SELECT * FROM workers WHERE pipeline_stage IN ('Active','Placed')`);
    let score = 100;
    const issues: any[] = [];
    const workerStatuses: any[] = [];

    for (const w of workers.rows as any[]) {
      const input = workerToLegalInput(w);
      const result = evaluateLegalStatus(input);
      workerStatuses.push({ name: w.name, status: result.legalStatus, risk: result.riskLevel, warnings: result.warnings.length });

      if (result.legalStatus === "EXPIRED_NOT_PROTECTED" || result.legalStatus === "NO_PERMIT") { score -= 10; issues.push({ worker: w.name, issue: "No valid work authorization", severity: "CRITICAL" }); }
      else if (result.riskLevel === "CRITICAL") { score -= 5; issues.push({ worker: w.name, issue: result.warnings[0], severity: "HIGH" }); }
      else if (result.riskLevel === "HIGH") { score -= 3; issues.push({ worker: w.name, issue: result.warnings[0], severity: "MEDIUM" }); }
      else if (result.riskLevel === "MEDIUM") { score -= 1; }
    }

    score = Math.max(0, Math.min(100, score));
    const readiness = score >= 80 ? "READY" : score >= 50 ? "NEEDS_ATTENTION" : "NOT_READY";

    // Evidence count
    const evCount = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM legal_evidence WHERE verified = true`);
    const caseCount = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM legal_cases WHERE status NOT IN ('resolved','closed')`);

    return res.json({
      score, readiness,
      totalWorkers: (workers.rows as any[]).length,
      issues: issues.slice(0, 20),
      workerStatuses,
      verifiedEvidence: (evCount.rows[0] as any).cnt,
      openCases: (caseCount.rows[0] as any).cnt,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ══ HELPERS ═════════════════════════════════════════════════════════════════

function riskOrder(risk: string): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[risk] ?? 4;
}

export default router;
