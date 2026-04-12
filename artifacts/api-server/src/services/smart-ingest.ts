/**
 * Smart Document Ingest — AI-powered document understanding for EEJ.
 *
 * POST /api/documents/smart-ingest
 *
 * Accepts a file (PDF/image) + workerId, then:
 *  1. AI analysis → doc_type, rationale, extracted_data, legal_impact
 *  2. Generates editable draft (appeal/justification) if applicable
 *  3. Stores AI context in JSONB column
 *  4. Runs legal-decision-engine to assess impact on worker status
 *
 * 2026 Polish MOS requirements: digital-first, Art. 108 sticker awareness,
 * UPO/MOS filing receipts, login.gov.pl verification.
 *
 * SAFETY: all drafts are PROJEKT. No auto-filing. No status changes without approval.
 * SECURITY: parameterized SQL only — no sql.raw().
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { evaluateLegalStatus, type LegalInput, type LegalOutput } from "./legal-decision-engine.js";

const router = Router();

// ═══ DOCUMENT TYPE DEFINITIONS (2026 MOS/Polish requirements) ═══════════════

const DOC_TYPES = {
  TRC_APPLICATION:     { label: "TRC Application (Wniosek o KP)", mos: true, filingRequired: true },
  TRC_CARD:            { label: "TRC Card (Karta Pobytu)", mos: false, filingRequired: false },
  WORK_PERMIT_A:       { label: "Work Permit Type A", mos: true, filingRequired: true },
  WORK_PERMIT_B:       { label: "Work Permit Type B", mos: true, filingRequired: true },
  SEASONAL_PERMIT:     { label: "Seasonal Work Permit", mos: true, filingRequired: true },
  OSWIADCZENIE:        { label: "Oświadczenie (Employer Declaration)", mos: false, filingRequired: true },
  PASSPORT:            { label: "Passport", mos: false, filingRequired: false },
  EMPLOYMENT_CONTRACT: { label: "Employment Contract (Umowa)", mos: false, filingRequired: false },
  UPO_RECEIPT:         { label: "UPO Filing Receipt", mos: true, filingRequired: false },
  MOS_CONFIRMATION:    { label: "MOS Submission Confirmation", mos: true, filingRequired: false },
  REJECTION_DECISION:  { label: "Rejection Decision (Decyzja Odmowna)", mos: false, filingRequired: false },
  APPEAL:              { label: "Appeal (Odwołanie)", mos: false, filingRequired: true },
  ZUS_ZUA:             { label: "ZUS ZUA Registration", mos: false, filingRequired: false },
  ZUS_ZCNA:            { label: "ZUS ZCNA Family", mos: false, filingRequired: false },
  MEDICAL_CERT:        { label: "Medical Certificate (Badania Lekarskie)", mos: false, filingRequired: false },
  BHP_CERT:            { label: "BHP Safety Certificate", mos: false, filingRequired: false },
  INSURANCE:           { label: "Insurance Proof", mos: false, filingRequired: false },
  ACCOMMODATION:       { label: "Accommodation Proof (Zameldowanie)", mos: false, filingRequired: false },
  A1_CERTIFICATE:      { label: "A1 Certificate (Posted Worker)", mos: false, filingRequired: false },
  EMPLOYER_DECLARATION:{ label: "Employer Declaration for Authority", mos: false, filingRequired: false },
  POWER_OF_ATTORNEY:   { label: "Power of Attorney (Pełnomocnictwo)", mos: false, filingRequired: false },
  UNKNOWN:             { label: "Unknown Document", mos: false, filingRequired: false },
} as const;

type DocTypeKey = keyof typeof DOC_TYPES;

// ═══ AI ANALYSIS PROMPT ═════════════════════════════════════════════════════

const ANALYSIS_PROMPT = `You are a Polish immigration document analyst for a staffing agency (2026 MOS digital system).

Analyze this document and return ONLY a JSON object with these fields:

{
  "doc_type": "one of: TRC_APPLICATION, TRC_CARD, WORK_PERMIT_A, WORK_PERMIT_B, SEASONAL_PERMIT, OSWIADCZENIE, PASSPORT, EMPLOYMENT_CONTRACT, UPO_RECEIPT, MOS_CONFIRMATION, REJECTION_DECISION, APPEAL, ZUS_ZUA, ZUS_ZCNA, MEDICAL_CERT, BHP_CERT, INSURANCE, ACCOMMODATION, A1_CERTIFICATE, EMPLOYER_DECLARATION, POWER_OF_ATTORNEY, UNKNOWN",
  "confidence": 0.0 to 1.0,
  "rationale": "Technical explanation of why this document matters for compliance (reference specific Polish law articles where applicable)",
  "extracted_data": {
    "worker_name": "extracted name or null",
    "date_of_birth": "YYYY-MM-DD or null",
    "pesel": "extracted PESEL or null",
    "passport_number": "extracted or null",
    "issue_date": "YYYY-MM-DD or null",
    "expiry_date": "YYYY-MM-DD or null",
    "decision_date": "YYYY-MM-DD or null",
    "case_number": "extracted case/reference number or null",
    "authority": "issuing authority name or null",
    "employer_name": "employer mentioned or null",
    "employer_nip": "NIP number or null",
    "salary": "mentioned salary or null",
    "position": "job title/position or null",
    "voivodeship": "voivodeship/region or null",
    "additional_fields": {}
  },
  "legal_articles": ["Art. 108 ust. 1 pkt 2 Ustawa o cudzoziemcach", "..."],
  "mos_relevant": true/false,
  "filing_impact": "How this document affects pending MOS/authority filings",
  "is_rejection": true/false,
  "is_application": true/false,
  "requires_action": true/false,
  "action_deadline_days": null or number,
  "raw_text_summary": "Brief content summary (max 200 chars)"
}

RULES:
- Extract dates in YYYY-MM-DD format
- PESEL must be exactly 11 digits if found
- Reference actual Polish immigration law articles
- If document is a rejection, set is_rejection: true
- If document is an application, set is_application: true
- If appeal deadline exists (14 days per KPA Art. 127), calculate action_deadline_days
- For MOS system documents, note the digital filing reference
- Never invent data not present in the document`;

// ═══ DRAFT GENERATION PROMPT ════════════════════════════════════════════════

const DRAFT_APPEAL_PROMPT = `You are a Polish immigration lawyer assistant. Based on the analyzed document, generate a formal appeal draft.

OUTPUT FORMAT — return JSON:
{
  "draft_pl": "Full Polish formal appeal text (odwołanie) marked as PROJEKT at the top. Include: header with authority, petitum, uzasadnienie, dowody, signature block. Reference applicable articles of KPA and Ustawa o cudzoziemcach.",
  "draft_en": "English translation of the same appeal for internal reference.",
  "draft_type": "APPEAL or JUSTIFICATION or COVER_LETTER or RESPONSE",
  "applicable_articles": ["Art. 127 KPA", "..."],
  "suggested_evidence": ["passport copy", "employment contract", "..."],
  "deadline_note": "Appeal must be filed within 14 days of decision delivery (Art. 127 § 1 KPA)"
}

RULES:
- Polish version is the authoritative legal text
- Mark as PROJEKT / DRAFT
- Never guarantee success
- Include placeholder for date and signature
- Reference actual Polish law articles only`;

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS smart_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'UNKNOWN',
      confidence REAL DEFAULT 0,
      rationale TEXT DEFAULT '',
      extracted_data JSONB DEFAULT '{}'::jsonb,
      legal_articles JSONB DEFAULT '[]'::jsonb,
      legal_impact JSONB DEFAULT '{}'::jsonb,
      ai_context JSONB DEFAULT '{}'::jsonb,
      draft_text TEXT,
      draft_type TEXT,
      draft_metadata JSONB DEFAULT '{}'::jsonb,
      mos_relevant BOOLEAN DEFAULT false,
      is_rejection BOOLEAN DEFAULT false,
      is_application BOOLEAN DEFAULT false,
      status TEXT DEFAULT 'analyzed',
      analyzed_by TEXT DEFAULT 'claude',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ═══ ROUTE: POST /api/documents/smart-ingest ════════════════════════════════

router.post("/documents/smart-ingest", authenticateToken, async (req, res) => {
  try {
    await ensureTable();

    const { image, mimeType, workerId, fileName } = req.body as {
      image?: string; mimeType?: string; workerId?: string; fileName?: string;
    };

    if (!image) return res.status(400).json({ error: "Base64 image/PDF data required" });
    if (!workerId) return res.status(400).json({ error: "workerId required" });

    const mime = mimeType ?? "image/jpeg";
    const name = fileName ?? "document";

    // ── Step 1: Load worker data ────────────────────────────────────────────
    const wRows = await db.execute(sql`SELECT * FROM workers WHERE id = ${workerId}`);
    if (wRows.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const w = wRows.rows[0] as any;

    // ── Step 2: AI Document Analysis (Claude Vision) ────────────────────────
    let analysis: any = {};
    let aiError: string | null = null;

    try {
      const mod = await import("@anthropic-ai/sdk");
      const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });

      const resp = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime as any, data: image } },
            { type: "text", text: `${ANALYSIS_PROMPT}\n\nWorker context: ${w.name}, ${w.nationality ?? "N/A"}, PESEL: ${w.pesel ?? "N/A"}, Current permit expires: ${w.trc_expiry ?? w.work_permit_expiry ?? "N/A"}` },
          ],
        }],
      });

      const rawText = resp.content[0]?.type === "text" ? resp.content[0].text : "{}";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch (err: any) {
      aiError = err.message;
      analysis = { doc_type: "UNKNOWN", confidence: 0, rationale: "AI analysis failed", extracted_data: {} };
    }

    const docType: DocTypeKey = (analysis.doc_type && analysis.doc_type in DOC_TYPES)
      ? analysis.doc_type as DocTypeKey
      : "UNKNOWN";

    // ── Step 3: Legal Impact Assessment (deterministic) ─────────────────────
    const legalInput: LegalInput = {
      workerId: w.id,
      workerName: w.name,
      nationality: w.nationality ?? "",
      permitExpiry: w.work_permit_expiry ?? null,
      trcExpiry: w.trc_expiry ?? null,
      trcFilingDate: null,
      trcApplicationPending: docType === "TRC_APPLICATION" || docType === "UPO_RECEIPT" || docType === "MOS_CONFIRMATION",
      employerContinuity: true,
      roleContinuity: true,
      formalDefect: false,
      contractEndDate: w.contract_end_date ?? null,
      bhpExpiry: w.bhp_status ?? null,
      medicalExpiry: w.badania_lek_expiry ?? null,
      oswiadczenieExpiry: w.oswiadczenie_expiry ?? null,
      hasValidPassport: docType === "PASSPORT" ? true : !!(w.passport_expiry),
      evidenceSubmitted: docType === "UPO_RECEIPT" ? ["upo"] : docType === "MOS_CONFIRMATION" ? ["mos_stamp"] : [],
    };

    // If document contains an expiry date, update the input
    const extractedExpiry = analysis.extracted_data?.expiry_date;
    if (extractedExpiry) {
      if (docType === "TRC_CARD" || docType === "TRC_APPLICATION") legalInput.trcExpiry = extractedExpiry;
      if (docType === "WORK_PERMIT_A" || docType === "WORK_PERMIT_B") legalInput.permitExpiry = extractedExpiry;
      if (docType === "PASSPORT") legalInput.hasValidPassport = new Date(extractedExpiry) > new Date();
    }

    const legalOutput: LegalOutput = evaluateLegalStatus(legalInput);

    const legalImpact = {
      currentStatus: legalOutput.legalStatus,
      riskLevel: legalOutput.riskLevel,
      legalBasis: legalOutput.legalBasis,
      art108Eligible: legalOutput.art108Eligible,
      art108Applied: legalOutput.art108Applied,
      warnings: legalOutput.warnings,
      requiredActions: legalOutput.requiredActions,
      documentEffect: DOC_TYPES[docType]?.label ?? "Unknown",
      mosRelevant: DOC_TYPES[docType]?.mos ?? false,
      filingRequired: DOC_TYPES[docType]?.filingRequired ?? false,
    };

    // ── Step 4: Generate Draft (if rejection or application) ────────────────
    let draftText: string | null = null;
    let draftType: string | null = null;
    let draftMetadata: any = {};

    if (analysis.is_rejection || analysis.is_application) {
      try {
        const mod = await import("@anthropic-ai/sdk");
        const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });

        const draftPrompt = analysis.is_rejection
          ? `This is a REJECTION decision for worker ${w.name}.\n\nRejection details:\n${analysis.raw_text_summary ?? "See document"}\n\nExtracted data: ${JSON.stringify(analysis.extracted_data)}\n\nGenerate a formal Polish appeal draft.`
          : `This is an APPLICATION document for worker ${w.name}.\n\nDocument type: ${DOC_TYPES[docType]?.label}\n\nExtracted data: ${JSON.stringify(analysis.extracted_data)}\n\nGenerate a cover letter / justification draft for the authority.`;

        const resp = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2500,
          system: DRAFT_APPEAL_PROMPT,
          messages: [{ role: "user", content: draftPrompt }],
        });

        const rawDraft = resp.content[0]?.type === "text" ? resp.content[0].text : "";
        const draftMatch = rawDraft.match(/\{[\s\S]*\}/);

        if (draftMatch) {
          const parsed = JSON.parse(draftMatch[0]);
          draftText = parsed.draft_pl ?? rawDraft;
          draftType = parsed.draft_type ?? (analysis.is_rejection ? "APPEAL" : "COVER_LETTER");
          draftMetadata = {
            draft_en: parsed.draft_en ?? "",
            applicable_articles: parsed.applicable_articles ?? [],
            suggested_evidence: parsed.suggested_evidence ?? [],
            deadline_note: parsed.deadline_note ?? "",
          };
        } else {
          draftText = rawDraft;
          draftType = analysis.is_rejection ? "APPEAL" : "COVER_LETTER";
        }
      } catch { /* draft generation is best-effort */ }
    }

    // ── Step 5: Store in database ───────────────────────────────────────────
    const aiContext = {
      analysis,
      legalImpact,
      workerContext: { name: w.name, nationality: w.nationality, pesel: w.pesel },
      analyzedAt: new Date().toISOString(),
      analyzedBy: "claude-sonnet-4-20250514",
      aiError,
    };

    const insertResult = await db.execute(sql`
      INSERT INTO smart_documents
        (worker_id, file_name, mime_type, doc_type, confidence, rationale,
         extracted_data, legal_articles, legal_impact, ai_context,
         draft_text, draft_type, draft_metadata,
         mos_relevant, is_rejection, is_application, status)
      VALUES
        (${workerId}, ${name}, ${mime}, ${docType},
         ${analysis.confidence ?? 0}, ${analysis.rationale ?? ""},
         ${JSON.stringify(analysis.extracted_data ?? {})}::jsonb,
         ${JSON.stringify(analysis.legal_articles ?? [])}::jsonb,
         ${JSON.stringify(legalImpact)}::jsonb,
         ${JSON.stringify(aiContext)}::jsonb,
         ${draftText}, ${draftType},
         ${JSON.stringify(draftMetadata)}::jsonb,
         ${analysis.mos_relevant ?? false},
         ${analysis.is_rejection ?? false},
         ${analysis.is_application ?? false},
         'analyzed')
      RETURNING id
    `);

    const docId = (insertResult.rows[0] as any)?.id;

    // ── Step 6: Log to audit ────────────────────────────────────────────────
    await db.execute(sql`
      INSERT INTO audit_entries (worker_id, worker_name, actor, field, new_value, action)
      VALUES (${workerId}, ${w.name}, ${(req as any).user?.name ?? "system"},
              'smart_ingest', ${JSON.stringify({ docType, confidence: analysis.confidence })}::jsonb,
              'DOCUMENT_SMART_INGESTED')
    `);

    // ── Response ────────────────────────────────────────────────────────────
    return res.json({
      id: docId,
      workerId,
      workerName: w.name,

      // AI Analysis
      docType,
      docTypeLabel: DOC_TYPES[docType]?.label ?? "Unknown",
      confidence: analysis.confidence ?? 0,
      rationale: analysis.rationale ?? "",
      extractedData: analysis.extracted_data ?? {},
      legalArticles: analysis.legal_articles ?? [],
      rawTextSummary: analysis.raw_text_summary ?? "",

      // Legal Impact
      legalImpact,

      // MOS 2026
      mosRelevant: analysis.mos_relevant ?? false,
      filingImpact: analysis.filing_impact ?? "",

      // Draft (editable)
      hasDraft: !!draftText,
      draft: draftText,
      draftType,
      draftMetadata,

      // Flags
      isRejection: analysis.is_rejection ?? false,
      isApplication: analysis.is_application ?? false,
      requiresAction: analysis.requires_action ?? false,
      actionDeadlineDays: analysis.action_deadline_days ?? null,

      // Meta
      status: "analyzed",
      aiError,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══ GET /api/documents/smart-ingest/:workerId — list analyzed documents ═════

router.get("/documents/smart-ingest/:workerId", authenticateToken, async (req, res) => {
  try {
    await ensureTable();
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const rows = await db.execute(sql`
      SELECT id, worker_id, file_name, doc_type, confidence, rationale,
             extracted_data, legal_impact, mos_relevant, is_rejection,
             is_application, status, draft_type, created_at
      FROM smart_documents
      WHERE worker_id = ${wid}
      ORDER BY created_at DESC
      LIMIT 30
    `);
    return res.json({ documents: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══ GET /api/documents/smart-ingest/detail/:id — full document with draft ═══

router.get("/documents/smart-ingest/detail/:id", authenticateToken, async (req, res) => {
  try {
    await ensureTable();
    const docId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rows = await db.execute(sql`
      SELECT * FROM smart_documents WHERE id = ${docId}
    `);
    if (rows.rows.length === 0) return res.status(404).json({ error: "Document not found" });
    return res.json({ document: rows.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══ PATCH /api/documents/smart-ingest/:id/draft — update edited draft ═══════

router.patch("/documents/smart-ingest/:id/draft", authenticateToken, async (req, res) => {
  try {
    const docId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { draft } = req.body as { draft?: string };
    if (!draft) return res.status(400).json({ error: "draft text required" });

    await db.execute(sql`
      UPDATE smart_documents
      SET draft_text = ${draft}, updated_at = NOW()
      WHERE id = ${docId}
    `);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
