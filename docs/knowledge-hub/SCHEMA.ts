/**
 * EEJ Sovereign Intelligence Hub — Master Schema Index
 *
 * This is the single entry point for the EEJ knowledge architecture.
 * All object types, workflows, and vault entries are exported from here.
 *
 * DIRECTORY STRUCTURE (local-first, Anytype/Obsidian-compatible):
 *
 *   docs/knowledge-hub/
 *   |-- SCHEMA.ts                          ← YOU ARE HERE (master index)
 *   |-- objects/
 *   |   |-- candidate.ts                   ← Candidate object definition
 *   |   |-- legal-rule.ts                  ← Legal Rule object + 7 pre-defined rules
 *   |   |-- verification-log.ts            ← Verification Log + feedback entries
 *   |-- workflows/
 *   |   |-- status-dashboard.ts            ← Dashboard schema + auto-link rules
 *   |-- vault/
 *   |   |-- shared-logic.ts                ← Shared algorithm vault + isolation shield
 *
 * ANYTYPE MAPPING:
 *   Object Types → Candidate, Legal_Rule, Verification_Log
 *   Sets         → EEJ Status Dashboard
 *   Relations    → candidate_id, applicable_rules, triggered_rules
 *   Space        → "EEJ Recruitment Intelligence"
 *
 * OBSIDIAN MIGRATION:
 *   1. Create vault: ~/Obsidian/EEJ-Intelligence/
 *   2. Copy templates from objects/*.ts → templates/*.md (frontmatter format)
 *   3. Create canvas from workflows/status-dashboard.ts → dashboards/eej-status.canvas
 *   4. Link existing notes via [[Candidate/Name]] wikilinks
 *   5. Tag with #eej/candidate, #eej/legal-rule, #eej/verification
 *
 * OBSIDIAN FRONTMATTER FORMAT (for one-tap migration):
 *
 *   ---
 *   type: candidate
 *   org_context: EEJ
 *   name: "Oleksandr Bondarenko"
 *   nationality: Ukrainian
 *   days_remaining: 45
 *   current_status: EXPIRING_SOON
 *   mos_filing_required: true
 *   tags: [eej/candidate, recruitment, mos-2026]
 *   ---
 *
 * BRANDING:
 *   Primary: #3B82F6 (Blue-500)
 *   Background: #0F172A (Slate-950)
 *   Text: #FFFFFF (White)
 *   Forbidden: #C41E18 (Apatris Red — never use)
 */

// ═══ OBJECT EXPORTS ═════════════════════════════════════════════════════════

export type { Candidate, CandidateStatus, CandidateDerived, CandidateRelations, PipelineStage } from "./objects/candidate.js";
export { computeZone, computeSchengenRisk, computeMosRequired } from "./objects/candidate.js";

export type { LegalRule, MOSRequirement, RuleFee, DeadlineLogic } from "./objects/legal-rule.js";
export { EEJ_LEGAL_RULES } from "./objects/legal-rule.js";

export type { VerificationLog, DocType, VerificationStatus, LegalImpactSummary, FeedbackEntry, FeedbackErrorType, VerificationLogRelations } from "./objects/verification-log.js";
export { CONFIDENCE_THRESHOLDS, classifyConfidence } from "./objects/verification-log.js";

// ═══ WORKFLOW EXPORTS ═══════════════════════════════════════════════════════

export type { StatusDashboard, EEJTheme, DashboardSection, AutoLinkRule } from "./workflows/status-dashboard.js";
export { EEJ_AUTO_LINK_RULES, DEFAULT_DASHBOARD } from "./workflows/status-dashboard.js";

// ═══ VAULT EXPORTS ══════════════════════════════════════════════════════════

export type { VaultEntry, AccessLevel, SourcePlatform } from "./vault/shared-logic.js";
export { SHARED_VAULT, canEEJRead, canEEJWrite, isBlocked, getEEJAccessibleEntries, getBlockedEntries } from "./vault/shared-logic.js";

// ═══ SCHEMA METADATA ════════════════════════════════════════════════════════

export const SCHEMA_META = {
  name: "EEJ Sovereign Intelligence Hub",
  version: "1.0.0",
  org_context: "EEJ" as const,
  created: "2026-04-13",
  author: "EEJ Engineering",
  objects: ["Candidate", "Legal_Rule", "Verification_Log"],
  workflows: ["Status Dashboard"],
  vault_entries: {
    shared_read: 5,
    eej_read_write: 3,
    blocked: 3,
  },
  auto_link_rules: 5,
  legal_rules: 7,
  theme: "Professional Blue/White (#3B82F6/#FFFFFF)",
} as const;
