import { useAuth } from "@/lib/auth";
import { ROLE_PERMISSIONS, type Permission } from "@/types";
import {
  Shield,
  DollarSign,
  Users,
  FileCheck,
  PlusCircle,
  Eye,
  Building2,
  LogOut,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const TIER_COLORS: Record<number, { bg: string; text: string; border: string; label: string }> = {
  1: { bg: "#1B2A4A", text: "#FFD600",  border: "#FFD600",  label: "T1 · Executive" },
  2: { bg: "#2D4270", text: "#ffffff",  border: "#93C5FD",  label: "T2 · Legal"     },
  3: { bg: "#1B5E8A", text: "#ffffff",  border: "#67E8F9",  label: "T3 · Operations" },
  4: { bg: "#1A6B4A", text: "#ffffff",  border: "#6EE7B7",  label: "T4 · Candidate" },
};

interface PermLabel {
  key: keyof Permission;
  label: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}

const PERM_LABELS: PermLabel[] = [
  { key: "seeFinancials",       label: "Financial Data & Revenue",   Icon: DollarSign  },
  { key: "seePayroll",          label: "Payroll & ZUS Access",       Icon: DollarSign  },
  { key: "seeGlobalCandidates", label: "Global Candidate Directory", Icon: Users       },
  { key: "seeBizContracts",     label: "B2B Client Contracts",       Icon: Building2   },
  { key: "addCandidates",       label: "Add / Register Candidates",  Icon: PlusCircle  },
  { key: "approveDocs",         label: "Approve Documents",          Icon: FileCheck   },
  { key: "seeOwnDocsOnly",      label: "Own Profile Only (limited)", Icon: Eye         },
];

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function ProfileTab() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const tc    = TIER_COLORS[user.tier];
  const perms = ROLE_PERMISSIONS[user.role];

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">{tc.label}</div>
          <div className="tab-greeting-name">My Profile</div>
        </div>
      </div>

      {/* Avatar card */}
      <div className="profile-tab-hero" style={{ background: tc.bg, borderColor: tc.border }}>
        <div className="profile-tab-avatar" style={{ background: tc.border + "30", color: tc.text, border: `2px solid ${tc.border}` }}>
          {initials(user.shortName)}
        </div>
        <div className="profile-tab-name" style={{ color: tc.text }}>{user.shortName}</div>
        <div className="profile-tab-des" style={{ color: tc.text + "cc" }}>{user.designation}</div>
        <div className="profile-tab-tier" style={{ background: tc.border + "22", border: `1.5px solid ${tc.border}`, color: tc.text }}>
          <Shield size={12} strokeWidth={2.5} />
          {tc.label}
        </div>
      </div>

      {/* Access Permissions */}
      <div className="section-label" style={{ marginTop: 20 }}>Access Permissions</div>
      <div className="profile-perms-card">
        {PERM_LABELS.map(({ key, label, Icon }) => {
          const granted = perms[key];
          return (
            <div key={key} className="profile-perm-row">
              <div className="profile-perm-icon" style={{ background: granted ? "#ECFDF5" : "#F9FAFB", border: `1.5px solid ${granted ? "#6EE7B7" : "#E5E7EB"}` }}>
                <Icon size={14} color={granted ? "#059669" : "#9CA3AF"} strokeWidth={2} />
              </div>
              <span className="profile-perm-label" style={{ color: granted ? "#111827" : "#9CA3AF" }}>{label}</span>
              {granted
                ? <CheckCircle2 size={16} color="#059669" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                : <XCircle     size={16} color="#D1D5DB" strokeWidth={2}   style={{ flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>

      {/* Session Info */}
      <div className="section-label" style={{ marginTop: 20 }}>Session</div>
      <div className="profile-session-card">
        <div className="profile-session-row">
          <span className="profile-session-key">Platform</span>
          <span className="profile-session-val">Euro Edu Jobs — RBAC v3</span>
        </div>
        <div className="profile-session-row">
          <span className="profile-session-key">Access Level</span>
          <span className="profile-session-val">{tc.label}</span>
        </div>
        <div className="profile-session-row">
          <span className="profile-session-key">Session Date</span>
          <span className="profile-session-val">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
        <div className="profile-session-row" style={{ borderBottom: "none" }}>
          <span className="profile-session-key">Environment</span>
          <span className="profile-session-val">Secure · Encrypted</span>
        </div>
      </div>

      {/* Logout */}
      <button className="profile-logout-btn" onClick={logout}>
        <LogOut size={16} strokeWidth={2.5} />
        Sign Out of EEJ
      </button>

      <div style={{ height: 100 }} />
    </div>
  );
}
