/**
 * EEJ Sovereign Intelligence Hub — Verification Log Object
 *
 * Tracks every document upload through Smart Ingest, including
 * AI confidence, Anna's corrections, and prompt tuning signals.
 * Maps to `smart_documents` + `ocr_feedback_log` tables.
 *
 * Anytype Object Type: "Verification_Log"
 * Obsidian Template: templates/verification-log.md
 */

// ═══ OBJECT DEFINITION ══════════════════════════════════════════════════════

export interface VerificationLog {
  /** Primary key — maps to smart_documents.id */
  id: string;

  /** Worker this document belongs to */
  worker_id: string;

  /** Worker name (denormalized for display) */
  worker_name: string;

  /** Document classification from AI */
  doc_type: DocType;

  /** Human-readable label */
  doc_type_label: string;

  /** AI extraction confidence (0.0 to 1.0) */
  extraction_confidence: number;

  /** Extracted data fields (key-value from Claude Vision OCR) */
  extracted_data: Record<string, string | null>;

  /** Legal impact assessment from Decision Engine */
  legal_impact: LegalImpactSummary;

  /** Anna's feedback corrections (if any) */
  anna_feedback: FeedbackEntry[];

  /** Document status in the pipeline */
  status: VerificationStatus;

  /** MOS 2026 relevance */
  mos_relevant: boolean;

  /** Is this a rejection decision? */
  is_rejection: boolean;

  /** Timestamp of upload */
  created_at: string;

  /** Timestamp of verification */
  verified_at: string | null;

  /** Who verified */
  verified_by: string | null;

  /** Organization context — always 'EEJ' for this platform */
  org_context: "EEJ";
}

// ═══ SUB-TYPES ══════════════════════════════════════════════════════════════

export type DocType =
  | "PASSPORT"
  | "TRC_APPLICATION"
  | "TRC_CARD"
  | "WORK_PERMIT_A"
  | "WORK_PERMIT_B"
  | "SEASONAL_PERMIT"
  | "OSWIADCZENIE"
  | "EMPLOYMENT_CONTRACT"
  | "UPO_RECEIPT"
  | "MOS_CONFIRMATION"
  | "REJECTION_DECISION"
  | "APPEAL"
  | "ZUS_ZUA"
  | "ZUS_ZCNA"
  | "MEDICAL_CERT"
  | "BHP_CERT"
  | "INSURANCE"
  | "ACCOMMODATION"
  | "A1_CERTIFICATE"
  | "EMPLOYER_DECLARATION"
  | "POWER_OF_ATTORNEY"
  | "UNKNOWN";

export type VerificationStatus =
  | "analyzed"       // AI processed, awaiting human review
  | "verified"       // Human confirmed, synced to worker
  | "rejected"       // Human rejected the extraction
  | "needs_review";  // Low confidence, manual review required

export interface LegalImpactSummary {
  current_status: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  legal_basis: string;
  art108_eligible: boolean;
  art108_applied: boolean;
  mos_relevant: boolean;
  filing_required: boolean;
}

// ═══ FEEDBACK ENTRY (from ocr_feedback_log) ═════════════════════════════════

export interface FeedbackEntry {
  /** Feedback log ID */
  id: string;

  /** Which field had the error */
  field_name: string;

  /** What the AI extracted (wrong value) */
  ocr_value: string | null;

  /** What Anna corrected it to */
  corrected_value: string;

  /** Error classification */
  error_type: FeedbackErrorType;

  /** How bad the error was */
  severity: "low" | "medium" | "high" | "critical";

  /** Free-text notes for prompt tuning */
  notes: string | null;

  /** Who logged it */
  logged_by: string;

  /** Has the prompt been tuned to fix this? */
  resolved: boolean;

  /** Timestamp */
  created_at: string;

  /** Always scoped to EEJ */
  org_context: "EEJ";
}

export type FeedbackErrorType =
  | "extraction_error"
  | "classification_error"
  | "date_format"
  | "name_mismatch"
  | "missing_field"
  | "wrong_field"
  | "confidence_too_high"
  | "mrz_parse_error"
  | "language_error";

// ═══ RELATIONS ══════════════════════════════════════════════════════════════

export interface VerificationLogRelations {
  /** Candidate this log belongs to */
  candidate_id: string;        // → Candidate.id

  /** Legal rules triggered by this document */
  triggered_rules: string[];   // → Legal_Rule.id[]

  /** KG document node */
  kg_node_id: string;          // → kg_nodes.id (format: "doc:{id}")

  /** KG decision result node */
  kg_result_id: string;        // → kg_nodes.id (format: "result:{id}")
}

// ═══ CONFIDENCE THRESHOLDS ══════════════════════════════════════════════════

export const CONFIDENCE_THRESHOLDS = {
  /** Above this: auto-suggest for review */
  AUTO_SUGGEST: 0.80,

  /** Below this: force manual review */
  MANUAL_REQUIRED: 0.50,

  /** Below this: reject and re-upload */
  REJECT_THRESHOLD: 0.20,
} as const;

export function classifyConfidence(confidence: number): "high" | "medium" | "low" | "reject" {
  if (confidence >= CONFIDENCE_THRESHOLDS.AUTO_SUGGEST) return "high";
  if (confidence >= CONFIDENCE_THRESHOLDS.MANUAL_REQUIRED) return "medium";
  if (confidence >= CONFIDENCE_THRESHOLDS.REJECT_THRESHOLD) return "low";
  return "reject";
}
