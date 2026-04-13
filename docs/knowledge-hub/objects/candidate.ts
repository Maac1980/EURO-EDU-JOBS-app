/**
 * EEJ Sovereign Intelligence Hub — Candidate Object
 *
 * Core recruitment entity. Maps to the `workers` table in EEJ database.
 * Used by the Knowledge Graph (kg_nodes, node_type: "WORKER") and
 * the Status Dashboard for real-time compliance tracking.
 *
 * Anytype Object Type: "Candidate"
 * Obsidian Template: templates/candidate.md
 */

// ═══ OBJECT DEFINITION ══════════════════════════════════════════════════════

export interface Candidate {
  /** Primary key — maps to workers.id */
  id: string;

  /** Full legal name as on passport/permit */
  name: string;

  /** ISO nationality (e.g., "Ukrainian", "Philippine", "Indian") */
  nationality: string;

  /** Days remaining on active work authorization. Null = unknown/no permit. */
  days_remaining: number | null;

  /** Current legal status from the Decision Engine */
  current_status: CandidateStatus;

  /** PESEL (Polish ID number, 11 digits) — required for MOS filing */
  pesel: string | null;

  /** Passport number — primary identity document */
  passport_number: string | null;

  /** Passport expiry date (ISO string) */
  passport_expiry: string | null;

  /** TRC (Karta Pobytu) expiry date */
  trc_expiry: string | null;

  /** Work permit expiry date */
  work_permit_expiry: string | null;

  /** Date TRC application was filed (for Art. 108 assessment) */
  trc_filing_date: string | null;

  /** Schengen 90/180 days used — recruitment placement risk */
  schengen_days_used: number | null;

  /** Current employer (for continuity checks) */
  employer: string | null;

  /** Job role/position */
  role: string | null;

  /** Recruitment pipeline stage */
  pipeline_stage: PipelineStage;
}

// ═══ ENUMS ══════════════════════════════════════════════════════════════════

export type CandidateStatus =
  | "VALID"                    // All docs current, compliant
  | "EXPIRING_SOON"           // <60 days, needs renewal
  | "PROTECTED_PENDING"       // Art. 108 active, TRC filed
  | "REVIEW_REQUIRED"         // Edge case, needs lawyer
  | "EXPIRED_NOT_PROTECTED"   // Expired, no Art. 108
  | "NO_PERMIT";              // No work authorization

export type PipelineStage =
  | "New"
  | "Screening"
  | "Interview"
  | "Offer"
  | "Placed"
  | "Active"
  | "Released"
  | "Blacklisted";

// ═══ RELATIONS ══════════════════════════════════════════════════════════════

export interface CandidateRelations {
  /** Documents uploaded for this candidate */
  documents: string[];         // → Verification_Log.id[]

  /** Legal rules that apply based on days_remaining */
  applicable_rules: string[];  // → Legal_Rule.id[]

  /** Knowledge Graph node ID */
  kg_node_id: string;          // → kg_nodes.id (format: "worker:{id}")

  /** Linked legal cases */
  legal_cases: string[];
}

// ═══ COMPUTED FIELDS ════════════════════════════════════════════════════════

export interface CandidateDerived {
  /** Compliance color zone (from days_remaining) */
  zone: "GREEN" | "YELLOW" | "RED" | "EXPIRED";

  /** Schengen placement risk for recruitment team */
  schengen_risk: "SAFE" | "EXPEDITE" | "DEFER" | "DO_NOT_PLACE";

  /** MOS 2026 digital filing required? */
  mos_filing_required: boolean;

  /** Art. 108 protection eligible? */
  art108_eligible: boolean;
}

// ═══ ZONE LOGIC ═════════════════════════════════════════════════════════════

export function computeZone(days: number | null): CandidateDerived["zone"] {
  if (days === null || days < 0) return "EXPIRED";
  if (days < 30) return "RED";
  if (days < 60) return "YELLOW";
  return "GREEN";
}

export function computeSchengenRisk(daysUsed: number | null): CandidateDerived["schengen_risk"] {
  if (daysUsed === null) return "SAFE";
  if (daysUsed >= 90) return "DO_NOT_PLACE";
  if (daysUsed >= 86) return "DEFER";
  if (daysUsed >= 80) return "EXPEDITE";
  return "SAFE";
}

export function computeMosRequired(days: number | null, status: CandidateStatus): boolean {
  if (status === "EXPIRED_NOT_PROTECTED" || status === "NO_PERMIT") return true;
  if (days !== null && days < 90) return true;
  return false;
}
