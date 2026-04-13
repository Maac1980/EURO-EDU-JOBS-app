/**
 * EEJ Sovereign Intelligence Hub — Status Dashboard Schema
 *
 * Recruitment workflow mapping for Anna's team.
 * Auto-links candidates with <90 days to MOS 2026 Digital rules.
 *
 * Branding: EEJ Professional Blue (#3B82F6) / White (#FFFFFF)
 * Theme: Dark background (#0F172A), Blue accents, White text
 *
 * Anytype Set: "EEJ Status Dashboard"
 * Obsidian Canvas: dashboards/eej-status.canvas
 */

import type { Candidate, CandidateStatus, CandidateDerived } from "../objects/candidate.js";
import type { LegalRule } from "../objects/legal-rule.js";
import type { VerificationLog } from "../objects/verification-log.js";

// ═══ DASHBOARD SCHEMA ═══════════════════════════════════════════════════════

export interface StatusDashboard {
  /** Dashboard title */
  title: "EEJ Recruitment — Compliance Status";

  /** Organization context — immutable */
  org_context: "EEJ";

  /** Dashboard sections */
  sections: DashboardSection[];

  /** Theme enforcement */
  theme: EEJTheme;

  /** Auto-link rules */
  auto_links: AutoLinkRule[];

  /** Refresh interval (ms) */
  refresh_interval: 30_000;
}

// ═══ THEME ENFORCEMENT ══════════════════════════════════════════════════════

export interface EEJTheme {
  brand: "EEJ";

  colors: {
    /** Primary brand color — buttons, links, active states */
    primary: "#3B82F6";          // Blue-500
    /** Primary light — hover states, badges */
    primary_light: "#60A5FA";    // Blue-400
    /** Primary dark — pressed states */
    primary_dark: "#2563EB";     // Blue-600
    /** Background — page background */
    background: "#0F172A";       // Slate-950
    /** Surface — cards, panels */
    surface: "#1E293B";          // Slate-800
    /** Border — card borders, dividers */
    border: "#334155";           // Slate-700
    /** Text primary — headings, body */
    text_primary: "#FFFFFF";     // White
    /** Text secondary — labels, captions */
    text_secondary: "#94A3B8";   // Slate-400
    /** Text muted — timestamps, metadata */
    text_muted: "#64748B";       // Slate-500
  };

  compliance_zones: {
    green: "#22C55E";   // >60 days
    yellow: "#EAB308";  // 30-60 days
    red: "#EF4444";     // <30 days
    expired: "#6B7280"; // Crossed out
  };

  schengen_risk: {
    safe: "#22C55E";     // 0-79 days
    expedite: "#EAB308"; // 80-85 days
    defer: "#EF4444";    // 86-89 days
    do_not_place: "#7F1D1D"; // 90+ days
  };

  /** CSS class prefix for all EEJ components */
  css_prefix: "eej-";

  /** Explicitly NOT Apatris red (#C41E18) — never use in EEJ context */
  forbidden_colors: ["#C41E18"];
}

// ═══ DASHBOARD SECTIONS ═════════════════════════════════════════════════════

export interface DashboardSection {
  id: string;
  title: string;
  type: "summary" | "table" | "chart" | "alerts";
  data_source: string;
  columns?: DashboardColumn[];
  filters?: DashboardFilter[];
}

export interface DashboardColumn {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "status" | "badge" | "action";
  color_rule?: ColorRule;
}

export interface DashboardFilter {
  key: string;
  label: string;
  type: "select" | "range" | "boolean";
  options?: string[];
}

export interface ColorRule {
  field: string;
  rules: Array<{ condition: string; color: string }>;
}

// ═══ AUTO-LINK RULES ════════════════════════════════════════════════════════
//
// Core logic: If Candidate.days_remaining < 90, auto-link to MOS_2026_Digital.
// This creates a relation in the Knowledge Graph and surfaces it in the dashboard.
//

export interface AutoLinkRule {
  id: string;
  name: string;
  description: string;

  /** Condition on the Candidate object */
  when: {
    field: keyof Candidate;
    operator: "lt" | "lte" | "gt" | "gte" | "eq" | "in" | "is_null";
    value: any;
  };

  /** Action: link to this Legal Rule */
  then_link: {
    target_type: "Legal_Rule";
    target_id: string;
    relation: "MUST_COMPLY" | "SHOULD_REVIEW" | "INFO_ONLY";
    urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  };

  /** Dashboard behavior */
  dashboard_action: "highlight_red" | "highlight_yellow" | "show_badge" | "show_alert";
}

export const EEJ_AUTO_LINK_RULES: AutoLinkRule[] = [
  {
    id: "mos_90_day_trigger",
    name: "MOS 2026 Digital Filing — <90 Days",
    description: "Candidates with <90 days remaining must file via MOS digital portal before expiry",
    when: { field: "days_remaining", operator: "lt", value: 90 },
    then_link: {
      target_type: "Legal_Rule",
      target_id: "mos_2026_digital",
      relation: "MUST_COMPLY",
      urgency: "HIGH",
    },
    dashboard_action: "highlight_yellow",
  },
  {
    id: "mos_30_day_critical",
    name: "MOS Filing URGENT — <30 Days",
    description: "Candidates with <30 days remaining need immediate MOS filing to preserve Art. 108",
    when: { field: "days_remaining", operator: "lt", value: 30 },
    then_link: {
      target_type: "Legal_Rule",
      target_id: "mos_2026_digital",
      relation: "MUST_COMPLY",
      urgency: "CRITICAL",
    },
    dashboard_action: "highlight_red",
  },
  {
    id: "expired_no_permit",
    name: "Expired / No Permit — Immediate Action",
    description: "Candidates with expired or no permit cannot be placed",
    when: { field: "current_status", operator: "in", value: ["EXPIRED_NOT_PROTECTED", "NO_PERMIT"] },
    then_link: {
      target_type: "Legal_Rule",
      target_id: "mos_2026_digital",
      relation: "MUST_COMPLY",
      urgency: "CRITICAL",
    },
    dashboard_action: "show_alert",
  },
  {
    id: "schengen_80_day_flag",
    name: "Schengen 80+ Days — Expedite Filing",
    description: "Candidates approaching Schengen limit must have MOS filed before placement",
    when: { field: "schengen_days_used", operator: "gte", value: 80 },
    then_link: {
      target_type: "Legal_Rule",
      target_id: "schengen_90_180",
      relation: "MUST_COMPLY",
      urgency: "HIGH",
    },
    dashboard_action: "show_badge",
  },
  {
    id: "employer_signature_check",
    name: "Employer Annex 1 — Pre-Filing Check",
    description: "Any candidate needing MOS filing must have employer Annex 1 signed first",
    when: { field: "days_remaining", operator: "lt", value: 90 },
    then_link: {
      target_type: "Legal_Rule",
      target_id: "employer_annex1_signature",
      relation: "SHOULD_REVIEW",
      urgency: "MEDIUM",
    },
    dashboard_action: "show_badge",
  },
];

// ═══ DEFAULT DASHBOARD LAYOUT ═══════════════════════════════════════════════

export const DEFAULT_DASHBOARD: StatusDashboard = {
  title: "EEJ Recruitment — Compliance Status",
  org_context: "EEJ",
  refresh_interval: 30_000,

  theme: {
    brand: "EEJ",
    colors: {
      primary: "#3B82F6",
      primary_light: "#60A5FA",
      primary_dark: "#2563EB",
      background: "#0F172A",
      surface: "#1E293B",
      border: "#334155",
      text_primary: "#FFFFFF",
      text_secondary: "#94A3B8",
      text_muted: "#64748B",
    },
    compliance_zones: { green: "#22C55E", yellow: "#EAB308", red: "#EF4444", expired: "#6B7280" },
    schengen_risk: { safe: "#22C55E", expedite: "#EAB308", defer: "#EF4444", do_not_place: "#7F1D1D" },
    css_prefix: "eej-",
    forbidden_colors: ["#C41E18"],
  },

  sections: [
    {
      id: "summary",
      title: "Compliance Overview",
      type: "summary",
      data_source: "GET /api/first-contact/stress-test",
    },
    {
      id: "candidates",
      title: "Active Candidates",
      type: "table",
      data_source: "GET /api/workers",
      columns: [
        { key: "name", label: "Name", type: "text" },
        { key: "nationality", label: "Nationality", type: "text" },
        { key: "days_remaining", label: "Days Left", type: "number", color_rule: { field: "days_remaining", rules: [
          { condition: "< 0", color: "#6B7280" },
          { condition: "< 30", color: "#EF4444" },
          { condition: "< 60", color: "#EAB308" },
          { condition: ">= 60", color: "#22C55E" },
        ]}},
        { key: "current_status", label: "Status", type: "status" },
        { key: "schengen_days_used", label: "Schengen", type: "badge" },
        { key: "mos_filing_required", label: "MOS", type: "badge" },
      ],
      filters: [
        { key: "current_status", label: "Status", type: "select", options: ["VALID", "EXPIRING_SOON", "PROTECTED_PENDING", "REVIEW_REQUIRED", "EXPIRED_NOT_PROTECTED", "NO_PERMIT"] },
        { key: "nationality", label: "Nationality", type: "select" },
      ],
    },
    {
      id: "alerts",
      title: "Compliance Alerts",
      type: "alerts",
      data_source: "GET /api/first-contact/ingest-audit",
    },
    {
      id: "feedback",
      title: "OCR Feedback Queue",
      type: "table",
      data_source: "GET /api/first-contact/ocr-feedback",
      columns: [
        { key: "doc_type", label: "Doc Type", type: "badge" },
        { key: "field_name", label: "Field", type: "text" },
        { key: "error_type", label: "Error", type: "text" },
        { key: "severity", label: "Severity", type: "status" },
        { key: "resolved", label: "Resolved", type: "boolean" as any },
      ],
    },
  ],

  auto_links: EEJ_AUTO_LINK_RULES,
};
