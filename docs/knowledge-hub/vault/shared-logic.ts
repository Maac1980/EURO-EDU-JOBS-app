/**
 * EEJ Sovereign Intelligence Hub — Shared Logic Vault
 *
 * READ-ONLY references to algorithms shared across platforms.
 * EEJ can READ these logic definitions but CANNOT WRITE to
 * platform-specific objects (e.g., Apatris welding tonnage).
 *
 * ISOLATION RULES:
 *   1. EEJ reads from this vault — never writes to external platform objects
 *   2. Algorithms are defined as pure functions (no side effects, no DB access)
 *   3. Each algorithm has a source_platform and access_level
 *   4. EEJ-specific extensions live in objects/ (not here)
 *   5. Apatris-specific objects (welding certs, UDT, tonnage) are BLOCKED
 *
 * Anytype Space: "Shared Logic Vault"
 * Obsidian Vault: vaults/shared-logic/
 */

// ═══ VAULT ACCESS CONTROL ═══════════════════════════════════════════════════

export type AccessLevel = "READ" | "READ_WRITE" | "BLOCKED";
export type SourcePlatform = "SHARED" | "EEJ" | "APATRIS";

export interface VaultEntry {
  /** Algorithm identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Which platform owns this logic */
  source_platform: SourcePlatform;

  /** EEJ's access level to this entry */
  eej_access: AccessLevel;

  /** Description of what the algorithm does */
  description: string;

  /** The pure function this references */
  function_ref: string;

  /** File path in the codebase */
  file_path: string;

  /** Tags for search */
  tags: string[];
}

// ═══ SHARED ALGORITHMS (EEJ can READ) ═══════════════════════════════════════

export const SHARED_VAULT: VaultEntry[] = [
  // ── SHARED: Both platforms use these ──────────────────────────────────────
  {
    id: "art_108_assessment",
    name: "Art. 108 Continuity Protection Assessment",
    source_platform: "SHARED",
    eej_access: "READ",
    description: "Pure function: evaluates whether a worker's TRC filing qualifies for Art. 108 legal stay protection. Checks filing date vs. permit expiry, employer continuity, role continuity, formal defects.",
    function_ref: "evaluateLegalStatus()",
    file_path: "artifacts/api-server/src/services/legal-decision-engine.ts",
    tags: ["art108", "legal", "continuity", "permit", "trc"],
  },
  {
    id: "schengen_90_180_calc",
    name: "Schengen 90/180-Day Calculator",
    source_platform: "SHARED",
    eej_access: "READ",
    description: "Calculates remaining Schengen visa-free days using a rolling 180-day window. Tracks border crossings and computes overstay risk.",
    function_ref: "calculateSchengen90180()",
    file_path: "artifacts/api-server/src/services/schengen-calculator.ts",
    tags: ["schengen", "visa", "90-180", "overstay"],
  },
  {
    id: "zus_net_calculation",
    name: "ZUS/PIT Net Salary Calculator",
    source_platform: "SHARED",
    eej_access: "READ",
    description: "Polish payroll calculation: gross → net with ZUS employee contributions, health insurance, PIT advance. Benchmark: 160h x 31.40 PLN = 3929.05 PLN net.",
    function_ref: "calculateNet()",
    file_path: "artifacts/api-server/src/services/zus.service.ts",
    tags: ["zus", "payroll", "pit", "net", "gross"],
  },
  {
    id: "document_classification",
    name: "AI Document Classification (Claude Vision)",
    source_platform: "SHARED",
    eej_access: "READ",
    description: "Claude Vision OCR: classifies uploaded documents into 21 types (passport, TRC, work permit, etc.) with confidence scoring and MRZ parsing.",
    function_ref: "ANALYSIS_PROMPT + Claude API call",
    file_path: "artifacts/api-server/src/services/smart-ingest.ts",
    tags: ["ocr", "classification", "claude", "vision", "mrz"],
  },
  {
    id: "knowledge_graph_sync",
    name: "Knowledge Graph Sync (PostgreSQL JSONB)",
    source_platform: "SHARED",
    eej_access: "READ",
    description: "Syncs verified document data to a PostgreSQL JSONB adjacency-list knowledge graph. Creates nodes (Worker, Document, Legal Statute, Decision Result, Urzad, Employer) and edges (HAS, TRIGGERS, BASED_ON, FILED_AT).",
    function_ref: "syncToGraph()",
    file_path: "artifacts/api-server/src/services/knowledge-graph.ts",
    tags: ["kg", "graph", "nodes", "edges", "sync"],
  },

  // ── EEJ-ONLY: Recruitment-specific logic ─────────────────────────────────
  {
    id: "schengen_recruitment_risk",
    name: "Schengen Recruitment Placement Risk",
    source_platform: "EEJ",
    eej_access: "READ_WRITE",
    description: "EEJ-specific: maps Schengen days used to recruitment placement risk tiers (SAFE/EXPEDITE/DEFER/DO_NOT_PLACE). Used by Anna's team for candidate screening.",
    function_ref: "computeSchengenRisk()",
    file_path: "docs/knowledge-hub/objects/candidate.ts",
    tags: ["schengen", "recruitment", "placement", "risk"],
  },
  {
    id: "mos_2026_submission_sheet",
    name: "MOS 2026 Data Exporter / Submission Sheet",
    source_platform: "EEJ",
    eej_access: "READ_WRITE",
    description: "Pre-fills MOS portal submission form with worker data. Validates checklist (PESEL, passport, ZUS, TRC). Tracks blockers (unsigned Annex 1, missing ZUS registration).",
    function_ref: "POST /api/mos2026/submission-sheet/:workerId",
    file_path: "artifacts/api-server/src/services/mos-2026-mandate.ts",
    tags: ["mos", "2026", "submission", "digital", "filing"],
  },
  {
    id: "ocr_feedback_loop",
    name: "OCR Feedback Loop (Prompt Tuning)",
    source_platform: "EEJ",
    eej_access: "READ_WRITE",
    description: "Anna logs OCR errors → stored in ocr_feedback_log (org_context=EEJ) → aggregated into prompt tuning hints for improving extraction accuracy.",
    function_ref: "POST /api/first-contact/ocr-feedback",
    file_path: "artifacts/api-server/src/services/first-contact-verification.ts",
    tags: ["ocr", "feedback", "prompt", "tuning", "anna"],
  },

  // ── APATRIS-ONLY: BLOCKED from EEJ ──────────────────────────────────────
  {
    id: "welding_certification_tracker",
    name: "Welding Certification Tracker (UDT/EN)",
    source_platform: "APATRIS",
    eej_access: "BLOCKED",
    description: "BLOCKED: Tracks welding certifications (UDT, EN ISO 9606-1, AWS D1.1). Industrial-specific. Not applicable to EEJ recruitment context.",
    function_ref: "N/A — Apatris-only",
    file_path: "BLOCKED",
    tags: ["welding", "udt", "certification", "industrial", "BLOCKED"],
  },
  {
    id: "site_safety_ai",
    name: "Site Safety AI (PPE Detection)",
    source_platform: "APATRIS",
    eej_access: "BLOCKED",
    description: "BLOCKED: AI-powered construction site photo scanning for PPE violations. Industrial-specific. Not applicable to EEJ recruitment.",
    function_ref: "N/A — Apatris-only",
    file_path: "BLOCKED",
    tags: ["safety", "ppe", "industrial", "construction", "BLOCKED"],
  },
  {
    id: "tonnage_tracking",
    name: "Production Tonnage Tracking",
    source_platform: "APATRIS",
    eej_access: "BLOCKED",
    description: "BLOCKED: Tracks daily welding output tonnage per worker per site. Industrial KPI. Not applicable to EEJ recruitment.",
    function_ref: "N/A — Apatris-only",
    file_path: "BLOCKED",
    tags: ["tonnage", "production", "welding", "industrial", "BLOCKED"],
  },
];

// ═══ ACCESS CONTROL FUNCTIONS ═══════════════════════════════════════════════

export function canEEJRead(entryId: string): boolean {
  const entry = SHARED_VAULT.find(e => e.id === entryId);
  if (!entry) return false;
  return entry.eej_access === "READ" || entry.eej_access === "READ_WRITE";
}

export function canEEJWrite(entryId: string): boolean {
  const entry = SHARED_VAULT.find(e => e.id === entryId);
  if (!entry) return false;
  return entry.eej_access === "READ_WRITE";
}

export function isBlocked(entryId: string): boolean {
  const entry = SHARED_VAULT.find(e => e.id === entryId);
  if (!entry) return true; // Unknown entries are blocked by default
  return entry.eej_access === "BLOCKED";
}

export function getEEJAccessibleEntries(): VaultEntry[] {
  return SHARED_VAULT.filter(e => e.eej_access !== "BLOCKED");
}

export function getBlockedEntries(): VaultEntry[] {
  return SHARED_VAULT.filter(e => e.eej_access === "BLOCKED");
}
