import { useState } from "react";
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
  KeyRound,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/lib/toast";
import { changePassword } from "@/lib/api";
import { LangToggle } from "@/components/LangToggle";

const TIER_COLORS: Record<number, { bg: string; text: string; border: string; label: string }> = {
  1: { bg: "#1B2A4A", text: "#FFD600", border: "#FFD600", label: "T1 · Executive" },
  2: { bg: "#2D4270", text: "#ffffff", border: "#93C5FD", label: "T2 · Legal" },
  3: { bg: "#1B5E8A", text: "#ffffff", border: "#67E8F9", label: "T3 · Operations" },
  4: { bg: "#1A6B4A", text: "#ffffff", border: "#6EE7B7", label: "T4 · Candidate" },
};

interface PermLabel {
  key: keyof Permission;
  label: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}

const PERM_LABELS: PermLabel[] = [
  { key: "seeFinancials", label: "Financial Data & Revenue", Icon: DollarSign },
  { key: "seePayroll", label: "Payroll & ZUS Access", Icon: DollarSign },
  { key: "seeGlobalCandidates", label: "Global Candidate Directory", Icon: Users },
  { key: "seeBizContracts", label: "B2B Client Contracts", Icon: Building2 },
  { key: "addCandidates", label: "Add / Register Candidates", Icon: PlusCircle },
  { key: "approveDocs", label: "Approve Documents", Icon: FileCheck },
  { key: "seeOwnDocsOnly", label: "Own Profile Only (limited)", Icon: Eye },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ProfileTab() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  if (!user) return null;

  const tc = TIER_COLORS[user.tier];
  const perms = ROLE_PERMISSIONS[user.role];

  async function submitChangePassword() {
    if (newPwd.length < 8) {
      showToast("New password must be at least 8 characters.", "error");
      return;
    }
    if (newPwd !== confirmPwd) {
      showToast("New password and confirmation don't match.", "error");
      return;
    }
    if (!currentPwd) {
      showToast("Enter your current password.", "error");
      return;
    }
    setPwSaving(true);
    try {
      await changePassword({ currentPassword: currentPwd, newPassword: newPwd });
      showToast("Password changed. You'll stay signed in for this session.", "success");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setPwOpen(false);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not change password.",
        "error",
      );
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">{tc.label}</div>
          <div className="tab-greeting-name">My profile</div>
        </div>
        <LangToggle />
      </div>

      {/* Avatar card */}
      <div className="profile-tab-hero" style={{ background: tc.bg, borderColor: tc.border }}>
        <div
          className="profile-tab-avatar"
          style={{
            background: tc.border + "30",
            color: tc.text,
            border: `2px solid ${tc.border}`,
          }}
        >
          {initials(user.name)}
        </div>
        <div className="profile-tab-name" style={{ color: tc.text }}>{user.name}</div>
        <div className="profile-tab-des" style={{ color: tc.text + "cc" }}>{user.email}</div>
        {user.designation && (
          <div className="profile-tab-des" style={{ color: tc.text + "aa", fontSize: 11, marginTop: 2 }}>
            {user.designation}
          </div>
        )}
        <div
          className="profile-tab-tier"
          style={{
            background: tc.border + "22",
            border: `1.5px solid ${tc.border}`,
            color: tc.text,
          }}
        >
          <Shield size={12} strokeWidth={2.5} />
          {tc.label}
        </div>
      </div>

      {/* Change password — expandable section */}
      <div className="section-label" style={{ marginTop: 20 }}>Security</div>
      <div className="profile-perms-card">
        <button
          className="profile-perm-row"
          onClick={() => setPwOpen((v) => !v)}
          style={{ cursor: "pointer", background: "transparent", border: "none", width: "100%", textAlign: "left" }}
        >
          <div
            className="profile-perm-icon"
            style={{ background: "#EFF6FF", border: "1.5px solid #BFDBFE" }}
          >
            <KeyRound size={14} color="#3B82F6" strokeWidth={2} />
          </div>
          <span className="profile-perm-label" style={{ color: "#1B2A4A", fontWeight: 600 }}>
            Change password
          </span>
          {pwOpen ? (
            <ChevronUp size={16} color="#6B7280" strokeWidth={2} style={{ flexShrink: 0 }} />
          ) : (
            <ChevronDown size={16} color="#6B7280" strokeWidth={2} style={{ flexShrink: 0 }} />
          )}
        </button>

        {pwOpen && (
          <div style={{ padding: "12px 14px", borderTop: "1px solid #F3F4F6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: 8, background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 11, color: "#92400E" }}>
              <AlertTriangle size={12} strokeWidth={2.2} />
              <span>
                If this is your first login, your current password is the bootstrap password Manish shared. Rotate it now.
              </span>
            </div>
            <input
              type="password"
              className="wc-note-input"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder="Current password"
              disabled={pwSaving}
              autoComplete="current-password"
              style={{ width: "100%", marginBottom: 8 }}
            />
            <input
              type="password"
              className="wc-note-input"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="New password (min 8 characters)"
              disabled={pwSaving}
              autoComplete="new-password"
              style={{ width: "100%", marginBottom: 8 }}
            />
            <input
              type="password"
              className="wc-note-input"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="Confirm new password"
              disabled={pwSaving}
              autoComplete="new-password"
              style={{ width: "100%", marginBottom: 10 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="ds-secondary"
                onClick={() => {
                  setPwOpen(false);
                  setCurrentPwd("");
                  setNewPwd("");
                  setConfirmPwd("");
                }}
                disabled={pwSaving}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                className="ds-primary"
                onClick={submitChangePassword}
                disabled={pwSaving || !currentPwd || !newPwd}
                style={{ flex: 1 }}
              >
                {pwSaving ? "Saving…" : "Update password"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Access Permissions */}
      <div className="section-label" style={{ marginTop: 20 }}>Access permissions</div>
      <div className="profile-perms-card">
        {PERM_LABELS.map(({ key, label, Icon }) => {
          const granted = perms[key];
          return (
            <div key={key} className="profile-perm-row">
              <div
                className="profile-perm-icon"
                style={{
                  background: granted ? "#ECFDF5" : "#F9FAFB",
                  border: `1.5px solid ${granted ? "#6EE7B7" : "#E5E7EB"}`,
                }}
              >
                <Icon size={14} color={granted ? "#059669" : "#9CA3AF"} strokeWidth={2} />
              </div>
              <span className="profile-perm-label" style={{ color: granted ? "#111827" : "#9CA3AF" }}>
                {label}
              </span>
              {granted ? (
                <CheckCircle2 size={16} color="#059669" strokeWidth={2.5} style={{ flexShrink: 0 }} />
              ) : (
                <XCircle size={16} color="#D1D5DB" strokeWidth={2} style={{ flexShrink: 0 }} />
              )}
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
          <span className="profile-session-key">Access level</span>
          <span className="profile-session-val">{tc.label}</span>
        </div>
        <div className="profile-session-row">
          <span className="profile-session-key">Session date</span>
          <span className="profile-session-val">
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        <div className="profile-session-row" style={{ borderBottom: "none" }}>
          <span className="profile-session-key">Environment</span>
          <span className="profile-session-val">Secure · Encrypted</span>
        </div>
      </div>

      <button className="profile-logout-btn" onClick={logout}>
        <LogOut size={16} strokeWidth={2.5} />
        Sign out of EEJ
      </button>

      <div style={{ height: 100 }} />
    </div>
  );
}
