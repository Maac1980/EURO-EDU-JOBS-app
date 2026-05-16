/**
 * Smart Document Processing — drop PDF/image, extract data, match worker.
 * Reusable across rejection letters, evidence, TRC receipts, passports.
 * Claude Vision identifies document type automatically.
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

export interface SmartDocResult {
  documentType: "rejection_letter" | "passport" | "trc_receipt" | "bhp_certificate" | "medical_exam" | "work_permit" | "contract" | "mos_stamp" | "upo" | "correspondence" | "unknown";
  extractedFields: Record<string, { value: string | null; confidence: number }>;
  matchedWorker: { id: string; name: string; matchScore: number } | null;
  rawText: string;
  overallConfidence: number;
}

const EXTRACTION_PROMPT = `You are analyzing a Polish immigration/employment document. Extract data with high precision.

STEP 1: Identify the document type. Choose exactly one:
rejection_letter, passport, trc_receipt, bhp_certificate, medical_exam, work_permit, contract, mos_stamp, upo, correspondence, unknown

STEP 2: Extract ALL visible fields. For PASSPORTS specifically:
- READ THE MRZ (Machine Readable Zone) — the 2 lines of capital letters/numbers at the bottom of the data page
- MRZ Line 1: P<NATIONALITY<<SURNAME<<GIVEN_NAMES
- MRZ Line 2: PASSPORT_NUMBER<CHECK<NATIONALITY<DATE_OF_BIRTH<CHECK<SEX<EXPIRY_DATE<CHECK
- Extract from MRZ: passport_number, nationality (3-letter ISO), date_of_birth (YYMMDD→YYYY-MM-DD), expiry_date (YYMMDD→YYYY-MM-DD), sex
- ALSO read the Visual Inspection Zone (VIZ): the printed text above the MRZ with name, photo, etc.
- If MRZ and VIZ conflict, prefer MRZ data (it's machine-verified)

For ALL document types extract:
- worker_name (full name — for passport: SURNAME, GIVEN NAMES from MRZ)
- decision_type (positive/negative/partial — if applicable)
- rejection_reasons (list if rejection letter)
- case_reference (sygnatura, numer sprawy)
- voivodeship (which wojewoda/urząd)
- decision_date (YYYY-MM-DD)
- filing_date (YYYY-MM-DD)
- expiry_date (YYYY-MM-DD — for passport: from MRZ line 2)
- document_number (for passport: from MRZ line 2, first 9 chars)
- nationality (for passport: 3-letter code from MRZ, e.g., UKR, BLR, GEO)
- date_of_birth (YYYY-MM-DD — for passport: from MRZ line 2)
- pesel (if visible)
- sex (M/F — for passport: from MRZ)
- authority_name (issuing authority)
- key_text (most important paragraph, max 200 chars)

STEP 3: For each field, provide confidence 0-100. For MRZ-extracted fields, confidence should be 90+ if clearly readable.

Return JSON only:
{
  "document_type": "...",
  "fields": {
    "worker_name": { "value": "...", "confidence": 90 },
    "decision_type": { "value": "...", "confidence": 85 },
    ...
  },
  "raw_text_summary": "..."
}

If a field is not visible, set value to null and confidence to 0.`;

async function extractWithVision(imageBase64: string, mimeType: string, fileName?: string): Promise<any> {
  // Upload-pipeline /goal: route through the universal format normalizer so
  // /smart-doc/process accepts PDF/HEIC/DOCX/etc. the same way smart-ingest
  // does. Without this, the AI-first identity-extraction path in
  // DocumentWorkflow would still 400 on non-image input.
  const { normalizeForClaudeVision, mapErrorToFriendlyResponse, FriendlyError } = await import("./document-format.js");
  let normalized;
  try {
    normalized = await normalizeForClaudeVision(imageBase64, mimeType, fileName);
  } catch (err) {
    if (err instanceof FriendlyError) {
      return { error: err.message, userMessage: err.message, code: err.code };
    }
    const mapped = mapErrorToFriendlyResponse(err);
    return { error: mapped.body.error, userMessage: mapped.body.userMessage, code: mapped.body.code };
  }
  const arr = Array.isArray(normalized) ? normalized : [normalized];

  try {
    const mod = await import("@anthropic-ai/sdk");
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const contentBlocks: Array<Record<string, unknown>> = arr.map((n) =>
      n.kind === "image"
        ? { type: "image", source: { type: "base64", media_type: n.mediaType, data: n.base64 } }
        : { type: "text", text: `[Document content${n.pageCount ? ` — ${n.pageCount} page(s)` : ""}, source: ${n.sourceFormat}]\n\n${n.text}` }
    );
    contentBlocks.push({ type: "text", text: EXTRACTION_PROMPT });

    const resp = await client.messages.create({
      model: "claude-sonnet-4-20250514", max_tokens: 1200,
      messages: [{ role: "user", content: contentBlocks as any }],
    });
    const text = resp.content[0].type === "text" ? resp.content[0].text : "{}";
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { error: "AI response could not be parsed", userMessage: "We couldn't read the AI's response. Please try again." };
  } catch (err: any) {
    // Log raw error server-side, return friendly userMessage to caller.
    const mapped = mapErrorToFriendlyResponse(err);
    console.warn(`[smart-doc/process] Claude call failed: ${mapped.body.code} — ${mapped.body.error?.slice(0, 200)}`);
    return { error: mapped.body.error, userMessage: mapped.body.userMessage, code: mapped.body.code };
  }
}

async function fuzzyMatchWorker(name: string | null): Promise<{ id: string; name: string; matchScore: number } | null> {
  if (!name || name.length < 2) return null;

  const parts = name.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts[parts.length - 1] ?? "";

  // Try exact match first
  const exact = await db.execute(sql`
    SELECT id, name FROM workers WHERE LOWER(name) = ${name.toLowerCase()} LIMIT 1
  `);
  if (exact.rows.length > 0) {
    return { id: (exact.rows[0] as any).id, name: (exact.rows[0] as any).name, matchScore: 100 };
  }

  // Fuzzy: first name AND last name
  if (firstName && lastName && firstName !== lastName) {
    const fuzzy = await db.execute(sql`
      SELECT id, name FROM workers
      WHERE LOWER(name) ILIKE ${"%" + firstName.toLowerCase() + "%"}
        AND LOWER(name) ILIKE ${"%" + lastName.toLowerCase() + "%"}
      LIMIT 3
    `);
    if (fuzzy.rows.length === 1) {
      return { id: (fuzzy.rows[0] as any).id, name: (fuzzy.rows[0] as any).name, matchScore: 85 };
    }
    if (fuzzy.rows.length > 1) {
      return { id: (fuzzy.rows[0] as any).id, name: (fuzzy.rows[0] as any).name, matchScore: 60 };
    }
  }

  // Partial: last name only
  const partial = await db.execute(sql`
    SELECT id, name FROM workers WHERE LOWER(name) ILIKE ${"%" + lastName.toLowerCase() + "%"} LIMIT 3
  `);
  if (partial.rows.length === 1) {
    return { id: (partial.rows[0] as any).id, name: (partial.rows[0] as any).name, matchScore: 70 };
  }
  if (partial.rows.length > 1) {
    return { id: (partial.rows[0] as any).id, name: (partial.rows[0] as any).name, matchScore: 40 };
  }

  return null;
}

// ── POST /api/intake/full-pipeline — extract + harden in one call ────────
router.post("/intake/full-pipeline", authenticateToken, async (req, res) => {
  try {
    const { image, mimeType } = req.body as { image?: string; mimeType?: string };
    if (!image) return res.status(400).json({ error: "Base64 image data required" });

    // Stage 1: Extract with Claude Vision
    const extracted = await extractWithVision(image, mimeType ?? "image/jpeg");
    if (extracted.error) return res.status(500).json({ error: extracted.error, stage: "extraction" });

    const fields = extracted.fields ?? {};
    const workerName = fields.worker_name?.value ?? null;
    const matchedWorker = await fuzzyMatchWorker(workerName);
    const documentType = extracted.document_type ?? "unknown";

    // Stage 2: Hardening checks
    const confidences = Object.values(fields).map((f: any) => f.confidence ?? 0) as number[];
    const overallConfidence = confidences.length > 0 ? Math.round(confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length) : 0;

    // Confidence gating (strict for legal docs)
    const confidenceGate = overallConfidence >= 90 ? "AUTO_SUGGEST"
      : overallConfidence >= 70 ? "REVIEW_REQUIRED" : "FAILED";

    // Identity risk
    const identityRisk = !matchedWorker ? "HIGH"
      : matchedWorker.matchScore >= 90 ? "LOW"
      : matchedWorker.matchScore >= 75 ? "MEDIUM" : "HIGH";

    // Completeness
    const criticalFields = ["worker_name", "document_number", "expiry_date"];
    const missingCritical = criticalFields.filter(f => !fields[f]?.value);

    // Overall recommendation
    const blocked = confidenceGate === "FAILED" || identityRisk === "HIGH" || missingCritical.length > 0;
    const needsReview = confidenceGate === "REVIEW_REQUIRED" || identityRisk === "MEDIUM";

    // Suggested actions
    const suggestions: string[] = [];
    if (matchedWorker && matchedWorker.matchScore >= 75) suggestions.push(`Attach to worker: ${matchedWorker.name}`);
    if (documentType === "rejection_letter") suggestions.push("Run rejection analysis");
    if (documentType === "filing_proof" || documentType === "mos_stamp" || documentType === "upo") suggestions.push("Create evidence record + verify Art.108");
    if (documentType === "passport") suggestions.push("Update identity record");
    if (!matchedWorker) suggestions.push("Select worker manually");

    return res.json({
      extraction: { documentType, fields, rawText: extracted.raw_text_summary ?? "" },
      matching: { matchedWorker, identityRisk },
      hardening: { confidenceGate, overallConfidence, missingCritical, completenessScore: Math.round((1 - missingCritical.length / criticalFields.length) * 100) },
      recommendation: blocked ? "BLOCKED" : needsReview ? "REVIEW_REQUIRED" : "SAFE_TO_PROCEED",
      suggestions,
      status: "DRAFT — confirm before any system updates",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/smart-doc/process — main processing endpoint ──────────────
router.post("/smart-doc/process", authenticateToken, async (req, res) => {
  try {
    const { image, mimeType, fileName } = req.body as { image?: string; mimeType?: string; fileName?: string };
    if (!image) return res.status(400).json({ error: "Base64 image data required", userMessage: "We didn't receive any file content. Please try again.", code: "EMPTY_FILE" });

    const mime = mimeType ?? "image/jpeg";
    const extracted = await extractWithVision(image, mime, fileName);

    if (extracted.error) {
      // Upload-pipeline /goal: never leak raw API errors. extractWithVision
      // now returns userMessage + code populated by document-format.ts.
      return res.status(415).json({
        error: extracted.error,
        userMessage: extracted.userMessage ?? "We couldn't read this file. Please try a clearer photo, a PDF, or a JPG.",
        code: extracted.code ?? "AI_UNKNOWN",
      });
    }

    const fields = extracted.fields ?? {};
    const workerName = fields.worker_name?.value ?? null;

    // Fuzzy match worker
    const matchedWorker = await fuzzyMatchWorker(workerName);

    // Calculate overall confidence
    const confidences = Object.values(fields).map((f: any) => f.confidence ?? 0) as number[];
    const overallConfidence = confidences.length > 0 ? Math.round(confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length) : 0;

    const result: SmartDocResult = {
      documentType: extracted.document_type ?? "unknown",
      extractedFields: fields,
      matchedWorker,
      rawText: extracted.raw_text_summary ?? "",
      overallConfidence,
    };

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/smart-doc/rejection — process + classify rejection ────────
router.post("/smart-doc/rejection", authenticateToken, async (req, res) => {
  try {
    const { image, mimeType } = req.body as { image?: string; mimeType?: string };
    if (!image) return res.status(400).json({ error: "Base64 image data required" });

    // Step 1: Extract from document
    const extracted = await extractWithVision(image, mimeType ?? "image/jpeg");
    if (extracted.error) return res.status(500).json({ error: extracted.error });

    const fields = extracted.fields ?? {};
    const workerName = fields.worker_name?.value ?? null;
    const rejectionReasons = fields.rejection_reasons?.value ?? fields.key_text?.value ?? "";
    const caseRef = fields.case_reference?.value ?? "";
    const voivodeship = fields.voivodeship?.value ?? "";
    const decisionDate = fields.decision_date?.value ?? "";

    // Step 2: Match worker
    const matchedWorker = await fuzzyMatchWorker(workerName);

    // Step 3: Classify rejection (rule-based)
    const lower = rejectionReasons.toLowerCase();
    const classification: { category: string; confidence: number }[] = [];
    if (lower.includes("brak") || lower.includes("nie załączono") || lower.includes("nie przedłożono"))
      classification.push({ category: "missing_documents", confidence: 90 });
    if (lower.includes("wada formalna") || lower.includes("braki formalne"))
      classification.push({ category: "formal_defect", confidence: 95 });
    if (lower.includes("termin") || lower.includes("po terminie"))
      classification.push({ category: "timing_error", confidence: 85 });
    if (lower.includes("pracodawc") && (lower.includes("nie spełnia") || lower.includes("warunki")))
      classification.push({ category: "employer_error", confidence: 80 });
    if (classification.length === 0)
      classification.push({ category: "unclassified", confidence: 50 });

    // Step 4: AI explanation
    let aiExplanation = "";
    try {
      const mod = await import("@anthropic-ai/sdk");
      const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 500,
        messages: [{ role: "user", content:
          `LEGAL SNAPSHOT DATA — DO NOT CONTRADICT.
Classification: ${JSON.stringify(classification)}
Worker: ${workerName ?? "Unknown"}
Voivodeship: ${voivodeship}
Case: ${caseRef}
Decision date: ${decisionDate}

Rejection text: "${rejectionReasons}"

Provide in 150 words max:
1. What this rejection means (plain language)
2. Top 3 next steps
3. Appeal deadline (14 days from decision delivery)
Mark as DRAFT.` }],
      });
      aiExplanation = resp.content[0].type === "text" ? resp.content[0].text : "";
    } catch { aiExplanation = "AI explanation unavailable"; }

    // Step 5: Create legal case if worker matched
    let caseCreated = false;
    if (matchedWorker && matchedWorker.matchScore >= 60) {
      const existing = await db.execute(sql`
        SELECT id FROM legal_cases WHERE worker_id = ${matchedWorker.id} AND case_type = 'rejection' AND status != 'resolved' LIMIT 1
      `);
      if (existing.rows.length === 0) {
        await db.execute(sql`
          INSERT INTO legal_cases (worker_id, case_type, severity, title, description, status, rejection_text, rejection_classification, appeal_deadline, priority_score)
          VALUES (${matchedWorker.id}, 'rejection', 'critical',
            ${"Rejection: " + (workerName ?? "Unknown") + " — " + voivodeship},
            ${rejectionReasons}, 'open', ${rejectionReasons},
            ${JSON.stringify(classification)}::jsonb,
            ${decisionDate ? new Date(new Date(decisionDate).getTime() + 14 * 86400000).toISOString().slice(0, 10) : null},
            95)
        `);
        caseCreated = true;
      }
    }

    // Store AI interaction for audit
    await db.execute(sql`
      INSERT INTO legal_approvals (target_type, target_id, action, ai_request, ai_response)
      VALUES ('rejection_ocr', gen_random_uuid(), 'ocr_rejection', ${rejectionReasons}, ${aiExplanation})
    `);

    const confidences = Object.values(fields).map((f: any) => f.confidence ?? 0) as number[];
    const overallConfidence = confidences.length > 0 ? Math.round(confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length) : 0;

    return res.json({
      documentType: extracted.document_type ?? "rejection_letter",
      extractedFields: fields,
      matchedWorker,
      classification,
      aiExplanation,
      caseRef, voivodeship, decisionDate,
      appealDeadline: decisionDate ? new Date(new Date(decisionDate).getTime() + 14 * 86400000).toISOString().slice(0, 10) : "14 days from delivery",
      caseCreated,
      overallConfidence,
      status: "DRAFT — Requires Legal Review",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
