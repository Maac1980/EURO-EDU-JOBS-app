/**
 * EEJ Sovereign Intelligence Hub — Legal Rule Object
 *
 * Codifies Polish immigration rules as structured data objects.
 * Used by the Decision Engine and Knowledge Graph (kg_nodes, node_type: "LEGAL_STATUTE").
 *
 * Anytype Object Type: "Legal_Rule"
 * Obsidian Template: templates/legal-rule.md
 */

// ═══ OBJECT DEFINITION ══════════════════════════════════════════════════════

export interface LegalRule {
  /** Unique rule identifier */
  id: string;

  /** Human-readable rule name */
  name: string;

  /** MOS 2026 requirement category */
  mos_requirement: MOSRequirement;

  /** Filing fee in PLN (2026 rates) */
  fee: RuleFee;

  /** Deadline calculation logic */
  deadline_logic: DeadlineLogic;

  /** Source document / legal basis */
  source_doc: string;

  /** Applicable nationalities (empty = all non-EU) */
  nationalities: string[];

  /** Is this rule active as of reference date? */
  active: boolean;

  /** Effective date of the rule */
  effective_date: string;

  /** KG node ID */
  kg_node_id: string;           // → kg_nodes.id (format: "statute:{name}")
}

// ═══ SUB-TYPES ══════════════════════════════════════════════════════════════

export type MOSRequirement =
  | "DIGITAL_FILING_MANDATORY"    // Must file via MOS portal
  | "EMPLOYER_SIGNATURE"          // Annex 1 via Profil Zaufany
  | "ZUS_KAS_SYNC"               // Auto-sync blocks unregistered workers
  | "ART_108_CONTINUITY"         // Filed before expiry = protected
  | "SPECUSTAWA_UKR"             // Ukrainian Special Act
  | "SCHENGEN_90_180"            // Visa-free stay limit
  | "APPEAL_DEADLINE"            // KPA Art. 127 — 14 days
  | "FORMAL_DEFECT"              // Brak formalny correction window
  | "FEE_PAYMENT";              // Fee required within MOS

export interface RuleFee {
  /** Fee amount in PLN */
  amount_pln: number;
  /** Fee description */
  description: string;
  /** Year the fee applies */
  year: number;
  /** Previous fee for comparison */
  previous_amount_pln: number | null;
}

export interface DeadlineLogic {
  /** Type of deadline calculation */
  type: "BEFORE_EXPIRY" | "AFTER_DECISION" | "FIXED_DATE" | "ROLLING_WINDOW" | "NONE";
  /** Number of days (e.g., 14 for appeal, 90 for Schengen) */
  days: number | null;
  /** Reference field on Candidate (e.g., "trc_expiry", "work_permit_expiry") */
  reference_field: string | null;
  /** Human description */
  description: string;
}

// ═══ PRE-DEFINED RULES (April 2026) ═════════════════════════════════════════

export const EEJ_LEGAL_RULES: LegalRule[] = [
  {
    id: "mos_2026_digital",
    name: "MOS 2026 Digital Filing Mandate",
    mos_requirement: "DIGITAL_FILING_MANDATORY",
    fee: { amount_pln: 800, description: "TRC application fee (2026)", year: 2026, previous_amount_pln: 440 },
    deadline_logic: { type: "BEFORE_EXPIRY", days: null, reference_field: "trc_expiry", description: "Must file before current permit expires for Art. 108 protection" },
    source_doc: "Ustawa o cudzoziemcach, Art. 108; MOS Portal regulation 2026",
    nationalities: [],
    active: true,
    effective_date: "2026-04-27",
    kg_node_id: "statute:mos_2026_digital",
  },
  {
    id: "art_108_continuity",
    name: "Art. 108 Continuity Protection",
    mos_requirement: "ART_108_CONTINUITY",
    fee: { amount_pln: 0, description: "No additional fee — protection from timely filing", year: 2026, previous_amount_pln: null },
    deadline_logic: { type: "BEFORE_EXPIRY", days: 0, reference_field: "trc_expiry", description: "TRC application must be filed on or before permit expiry date" },
    source_doc: "Art. 108 ust. 1 pkt 2 Ustawa o cudzoziemcach",
    nationalities: [],
    active: true,
    effective_date: "2013-05-01",
    kg_node_id: "statute:art_108",
  },
  {
    id: "work_permit_a_fee",
    name: "Work Permit Type A Fee (2026)",
    mos_requirement: "FEE_PAYMENT",
    fee: { amount_pln: 400, description: "Work Permit Type A fee (2026)", year: 2026, previous_amount_pln: 100 },
    deadline_logic: { type: "NONE", days: null, reference_field: null, description: "Paid within MOS portal at time of submission" },
    source_doc: "Rozporządzenie w sprawie opłat za zezwolenia na pracę (2026)",
    nationalities: [],
    active: true,
    effective_date: "2026-01-01",
    kg_node_id: "statute:work_permit_a_fee_2026",
  },
  {
    id: "employer_annex1_signature",
    name: "Employer Annex 1 Digital Signature",
    mos_requirement: "EMPLOYER_SIGNATURE",
    fee: { amount_pln: 0, description: "No fee — employer obligation", year: 2026, previous_amount_pln: null },
    deadline_logic: { type: "BEFORE_EXPIRY", days: 30, reference_field: "trc_expiry", description: "Employer must sign Annex 1 at least 30 days before planned MOS submission" },
    source_doc: "MOS Portal Annex 1 requirement; Profil Zaufany / Qualified E-Signature",
    nationalities: [],
    active: true,
    effective_date: "2026-04-27",
    kg_node_id: "statute:employer_annex1",
  },
  {
    id: "schengen_90_180",
    name: "Schengen 90/180-Day Visa-Free Stay",
    mos_requirement: "SCHENGEN_90_180",
    fee: { amount_pln: 0, description: "No fee — visa-free entry rule", year: 2026, previous_amount_pln: null },
    deadline_logic: { type: "ROLLING_WINDOW", days: 90, reference_field: "schengen_days_used", description: "90 days within any 180-day rolling window. Exceeding = overstay." },
    source_doc: "Schengen Borders Code, Art. 6; Regulation (EU) 2016/399",
    nationalities: ["Ukrainian", "Georgian", "Moldovan"],
    active: true,
    effective_date: "2017-06-11",
    kg_node_id: "statute:schengen_90_180",
  },
  {
    id: "kpa_appeal_14d",
    name: "KPA Appeal Deadline — 14 Days",
    mos_requirement: "APPEAL_DEADLINE",
    fee: { amount_pln: 0, description: "No fee for appeal", year: 2026, previous_amount_pln: null },
    deadline_logic: { type: "AFTER_DECISION", days: 14, reference_field: null, description: "14 days from decision delivery date (Art. 127 KPA)" },
    source_doc: "Kodeks Postępowania Administracyjnego, Art. 127 § 1",
    nationalities: [],
    active: true,
    effective_date: "1960-06-14",
    kg_node_id: "statute:kpa_art_127",
  },
  {
    id: "zus_kas_sync",
    name: "ZUS/KAS Auto-Sync on MOS Submission",
    mos_requirement: "ZUS_KAS_SYNC",
    fee: { amount_pln: 0, description: "No fee — system check", year: 2026, previous_amount_pln: null },
    deadline_logic: { type: "NONE", days: null, reference_field: null, description: "MOS portal syncs with KAS at submission. Unregistered workers trigger auto-rejection." },
    source_doc: "MOS Portal integration with KAS/ZUS (2026)",
    nationalities: [],
    active: true,
    effective_date: "2026-04-27",
    kg_node_id: "statute:zus_kas_sync",
  },
];
