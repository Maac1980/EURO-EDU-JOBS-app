import { useState } from "react";
import {
  Briefcase, Columns3, Calendar, FileText, Receipt,
  Scale, Search, FileCheck, MapPin, Calculator,
  User, Settings, UserPlus, DollarSign,
  CalendarDays, Clock, BarChart3, Award, TrendingUp,
  Building2, CreditCard, Shield, Lock, Globe,
  Link2, Check,
} from "lucide-react";
import type { ActiveTab, Role } from "@/types";
import { useAuth } from "@/lib/auth";
import { recruitmentApplyUrl } from "@/lib/shareLink";

interface Props {
  onNavigate: (tab: ActiveTab) => void;
}

// Role gating per module. Each module declares which roles see it. Modules
// labelled "self" (mystatus / myupo / myschengen) are worker-side and only
// reach the candidate-tier UI. Modules labelled "admin" reach T1 executives
// (and legal where the business sense fits).
//
// Defaults err on the side of LESS exposure — Liza shouldn't see "Pricing &
// Plans"; Karan/Marj/Yana shouldn't see "AI Audit Trail"; workers see only
// their own surfaces.
type ModuleEntry = {
  id: ActiveTab;
  label: string;
  sub: string;
  Icon: any;
  color: string;
  bg: string;
  roles: Role[];
};

const MODULES: ModuleEntry[] = [
  // ── Universal staff tools (everyone except candidates) ──────────────────
  { id: "netperhour",   label: "Net Per Hour",        sub: "Gross↔Net calculator",        Icon: DollarSign,   color: "#10B981", bg: "#ECFDF5",
    roles: ["executive", "legal", "operations"] },
  { id: "calculator",   label: "ZUS Calculator",      sub: "Salary & tax calc",           Icon: Calculator,   color: "#6366F1", bg: "#EEF2FF",
    roles: ["executive", "legal", "operations"] },

  // ── Recruitment (operations + executive) ────────────────────────────────
  { id: "applications", label: "Applications",        sub: "New candidate applications",  Icon: UserPlus,     color: "#059669", bg: "#ECFDF5",
    roles: ["executive", "operations"] },
  { id: "jobs",         label: "Job Board",           sub: "Browse & post jobs",          Icon: Briefcase,    color: "#3B82F6", bg: "#EFF6FF",
    roles: ["executive", "operations"] },
  { id: "ats",          label: "ATS Pipeline",        sub: "Kanban recruitment",          Icon: Columns3,     color: "#8B5CF6", bg: "#F5F3FF",
    roles: ["executive", "operations"] },
  { id: "interviews",   label: "Interviews",          sub: "Schedule & track",            Icon: Calendar,     color: "#0EA5E9", bg: "#F0F9FF",
    roles: ["executive", "operations"] },
  { id: "skills",       label: "Skills",              sub: "Worker assessments",          Icon: Award,        color: "#8B5CF6", bg: "#F5F3FF",
    roles: ["executive", "operations"] },

  // ── Operations day-to-day ───────────────────────────────────────────────
  { id: "gps",          label: "GPS Tracking",        sub: "Worker locations",            Icon: MapPin,       color: "#10B981", bg: "#ECFDF5",
    roles: ["executive", "operations"] },
  { id: "availability", label: "Availability",        sub: "Worker calendar",             Icon: CalendarDays, color: "#0EA5E9", bg: "#F0F9FF",
    roles: ["executive", "operations"] },
  { id: "shifts",       label: "Shifts",              sub: "Schedule workers",            Icon: Clock,        color: "#F59E0B", bg: "#FFFBEB",
    roles: ["executive", "operations"] },
  { id: "clients",      label: "Clients",             sub: "Manage client companies",     Icon: Building2,    color: "#6366F1", bg: "#EEF2FF",
    roles: ["executive", "legal", "operations"] },

  // ── Legal / immigration (legal + executive; operations gets read-only views via cockpit) ──
  { id: "permits",      label: "Work Permits",        sub: "Track applications",          Icon: FileCheck,    color: "#7C3AED", bg: "#F5F3FF",
    roles: ["executive", "legal", "operations"] },
  { id: "trc",          label: "TRC Service",         sub: "Residence card management",   Icon: Scale,        color: "#7C3AED", bg: "#F5F3FF",
    roles: ["executive", "legal", "operations"] },
  { id: "immigration",  label: "Immigration Search",  sub: "AI-powered legal search",     Icon: Search,       color: "#1B2A4A", bg: "#F0F4FF",
    roles: ["executive", "legal"] },
  { id: "regulatory",   label: "Regulatory Intel",    sub: "Law changes & fines",         Icon: Scale,        color: "#DC2626", bg: "#FEF2F2",
    roles: ["executive", "legal"] },

  // ── Finance / billing (executive only — T23 financial gate; legal sees TRC service fees only) ──
  { id: "contracts",    label: "Contracts",           sub: "Generate Polish contracts",   Icon: FileText,     color: "#059669", bg: "#ECFDF5",
    roles: ["executive", "legal"] },
  { id: "invoices",     label: "Invoices",            sub: "Billing & Faktura VAT",       Icon: Receipt,      color: "#D97706", bg: "#FFFBEB",
    roles: ["executive"] },
  { id: "payroll",      label: "Payroll Ledger",      sub: "Monthly ZUS & PIT",           Icon: Calculator,   color: "#F59E0B", bg: "#FFFBEB",
    roles: ["executive"] },
  { id: "paytransparency", label: "Pay Report",       sub: "Transparency compliance",     Icon: BarChart3,    color: "#10B981", bg: "#ECFDF5",
    roles: ["executive"] },
  { id: "benchmark",    label: "Salary Benchmark",    sub: "Market rate comparison",      Icon: TrendingUp,   color: "#DC2626", bg: "#FEF2F2",
    roles: ["executive"] },
  { id: "pricing",      label: "Pricing & Plans",     sub: "Subscription management",     Icon: CreditCard,   color: "#10B981", bg: "#ECFDF5",
    roles: ["executive"] },

  // ── Compliance / admin (executive — Anna / Manish) ──────────────────────
  { id: "aiaudit",      label: "AI & Audit Trail",    sub: "EU AI Act compliance",        Icon: Shield,       color: "#DC2626", bg: "#FEF2F2",
    roles: ["executive"] },
  { id: "gdpr",         label: "GDPR",                sub: "Data protection & consent",   Icon: Lock,         color: "#7C3AED", bg: "#F5F3FF",
    roles: ["executive", "legal"] },
  { id: "agency",       label: "Agency Settings",     sub: "Profile & billing",           Icon: Settings,     color: "#6B7280", bg: "#F3F4F6",
    roles: ["executive"] },

  // ── Universal ───────────────────────────────────────────────────────────
  { id: "profile",      label: "Profile & Settings",  sub: "Account & permissions",       Icon: User,         color: "#1B2A4A", bg: "#F0F4FF",
    roles: ["executive", "legal", "operations", "candidate"] },

  // ── Worker-self surfaces (candidate-tier only) ──────────────────────────
  { id: "mystatus",     label: "My Legal Status",     sub: "Am I legal to work?",         Icon: Shield,       color: "#059669", bg: "#ECFDF5",
    roles: ["candidate"] },
  { id: "myupo",        label: "My UPO Certificate",  sub: "Digital proof of legal stay", Icon: Shield,       color: "#10B981", bg: "#ECFDF5",
    roles: ["candidate"] },
  { id: "myschengen",   label: "Schengen Days",       sub: "90/180 day counter",          Icon: Globe,        color: "#3B82F6", bg: "#EFF6FF",
    roles: ["candidate"] },
];

export default function MoreTab({ onNavigate }: Props) {
  const { user } = useAuth();
  const role: Role = (user?.role as Role) ?? "operations";
  const visible = MODULES.filter((m) => m.roles.includes(role));

  // Recruitment-link copy — mirrors the dashboard "Ad Link" button (commit 24
  // #15). URL via lib/shareLink.recruitmentApplyUrl() so the env override
  // (VITE_SHARE_BASE_URL, P3b) governs both this tile and the share dialog.
  // Only shown to staff who would actually share the link — candidates don't
  // recruit candidates.
  const [adLinkCopied, setAdLinkCopied] = useState(false);
  const canShareRecruitmentLink = role === "executive" || role === "operations" || role === "legal";
  const copyRecruitmentLink = () => {
    const url = recruitmentApplyUrl();
    navigator.clipboard.writeText(url).then(() => {
      setAdLinkCopied(true);
      setTimeout(() => setAdLinkCopied(false), 2500);
    }).catch(() => {});
  };

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">All features</div>
          <div className="tab-greeting-name">Platform modules</div>
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{visible.length} available to you</div>
      </div>

      {/* Recruitment-link card — primary CTA above the module grid.
          One-tap copy; pastes into WhatsApp/email to share the public
          /apply form with prospective workers. */}
      {canShareRecruitmentLink && (
        <button
          type="button"
          onClick={copyRecruitmentLink}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            marginBottom: 12,
            borderRadius: 14,
            background: adLinkCopied ? "#ECFDF5" : "#EFF6FF",
            border: `1.5px solid ${adLinkCopied ? "#6EE7B7" : "#BFDBFE"}`,
            cursor: "pointer",
            textAlign: "left",
            transition: "background 0.15s",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {adLinkCopied
              ? <Check size={20} color="#10B981" strokeWidth={2.5} />
              : <Link2 size={20} color="#2563EB" strokeWidth={2} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: adLinkCopied ? "#065F46" : "#1E3A8A" }}>
              {adLinkCopied ? "Copied — paste into WhatsApp" : "Copy Recruitment Link"}
            </div>
            <div style={{ fontSize: 11, color: adLinkCopied ? "#047857" : "#3B82F6", marginTop: 2 }}>
              Public /apply form — CV + passport intake
            </div>
          </div>
        </button>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {visible.map(({ id, label, sub, Icon, color, bg }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            style={{
              background: bg,
              border: `1.5px solid ${color}20`,
              borderRadius: 14,
              padding: "16px 12px",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              transition: "transform 0.1s",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon size={20} color={color} strokeWidth={2} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{label}</div>
            <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.3 }}>{sub}</div>
          </button>
        ))}
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}
