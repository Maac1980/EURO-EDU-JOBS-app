import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { ToastContainer } from "@/components/Toast";
import type { ActiveTab, Role } from "@/types";
import ExecutiveHome   from "./tabs/ExecutiveHome";
import LegalHome       from "./tabs/LegalHome";
import OperationsHome  from "./tabs/OperationsHome";
import CandidateHome   from "./tabs/CandidateHome";
import CandidatesList  from "./tabs/CandidatesList";
import PlaceholderTab  from "./tabs/PlaceholderTab";

const ROLE_COLOR: Record<Role, string> = {
  executive:  "#1B2A4A",
  legal:      "#2D4270",
  operations: "#1B5E8A",
  candidate:  "#1A6B4A",
};

const ROLE_TIER: Record<Role, string> = {
  executive:  "T1",
  legal:      "T2",
  operations: "T3",
  candidate:  "T4",
};

function TabContent({ role, tab }: { role: Role; tab: ActiveTab }) {
  if (tab === "home") {
    if (role === "executive")  return <ExecutiveHome />;
    if (role === "legal")      return <LegalHome />;
    if (role === "operations") return <OperationsHome />;
    if (role === "candidate")  return <CandidateHome />;
  }
  if (tab === "candidates") {
    if (role === "candidate") return (
      <PlaceholderTab emoji="🔒" title="Access Restricted" description="The global candidate directory is visible only to staff designations." />
    );
    return <CandidatesList role={role} />;
  }
  if (tab === "upload") {
    return <PlaceholderTab emoji="📤" title="Upload Documents" description="Bulk upload candidate documents and assign to profiles." />;
  }
  if (tab === "alerts") {
    if (role === "candidate") return (
      <PlaceholderTab emoji="🔔" title="My Updates" description="Document status updates and deployment notifications will appear here." />
    );
    return <PlaceholderTab emoji="🔔" title="Compliance Alerts" description="System-wide document expiry and compliance alerts." />;
  }
  if (tab === "mydocs") {
    return <PlaceholderTab emoji="📄" title="My Documents" description="Upload and track your employment documents here." />;
  }
  if (tab === "profile") {
    return <PlaceholderTab emoji="👤" title="Profile" description="Account settings and designation details." />;
  }
  return null;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");

  if (!user) return null;

  const accentColor = ROLE_COLOR[user.role];
  const tierLabel   = ROLE_TIER[user.role];

  return (
    <div className="eej-screen">
      <div className="eej-container" style={{ position: "relative" }}>

        {/* Toast Layer */}
        <ToastContainer />

        {/* Top Header */}
        <header className="dash-header" style={{ background: accentColor }}>
          <div className="dash-header-left">
            <div className="dash-logo-sm">EEJ</div>
            <div className="dash-header-text">
              <div className="dash-header-title">
                {user.shortName}
                <span className="dash-tier-chip" style={{ marginLeft: 6 }}>{tierLabel}</span>
              </div>
              <div className="dash-header-sub">{user.designation}</div>
            </div>
          </div>
          <button className="dash-logout" onClick={logout} title="Logout">
            <LogoutIcon />
          </button>
        </header>

        {/* Tab Content */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <TabContent role={user.role} tab={activeTab} />
        </div>

        {/* Bottom Navigation */}
        <BottomNav role={user.role} active={activeTab} onChange={setActiveTab} />
      </div>
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
