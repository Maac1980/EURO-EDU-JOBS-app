import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import type { ActiveTab, Role } from "@/types";
import OwnerHome from "./tabs/OwnerHome";
import ManagerHome from "./tabs/ManagerHome";
import CandidatesList from "./tabs/CandidatesList";
import PlaceholderTab from "./tabs/PlaceholderTab";

const ROLE_COLOR: Record<Role, string> = {
  owner:   "#1B2A4A",
  manager: "#2D4270",
  office:  "#1B5E8A",
  worker:  "#1A6B4A",
};

function TabContent({ role, tab }: { role: Role; tab: ActiveTab }) {
  if (tab === "home") {
    if (role === "owner") return <OwnerHome />;
    if (role === "manager") return <ManagerHome />;
    if (role === "office") return (
      <PlaceholderTab emoji="🗂️" title="Office Home" description="Candidate intake, document requests, and recruiter tasks." />
    );
    return (
      <PlaceholderTab emoji="👤" title="Worker Home" description="Your shift schedule, documents, and upcoming deployments." />
    );
  }
  if (tab === "candidates") {
    return <CandidatesList />;
  }
  if (tab === "alerts") {
    return <PlaceholderTab emoji="🔔" title="Alerts" description="Compliance alerts and document expiry notifications." />;
  }
  if (tab === "profile") {
    return <PlaceholderTab emoji="👤" title="Profile" description="Your account settings and preferences." />;
  }
  if (tab === "mydocs") {
    return <PlaceholderTab emoji="📄" title="My Documents" description="Upload and track your employment documents here." />;
  }
  if (tab === "timesheet") {
    return <PlaceholderTab emoji="🗓️" title="Timesheet" description="Log your hours and view payslip summaries." />;
  }
  return null;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");

  if (!user) return null;

  const accentColor = ROLE_COLOR[user.role];
  const showCandidatesTab = user.role !== "worker";

  return (
    <div className="eej-screen">
      <div className="eej-container">

        {/* Top Header */}
        <header className="dash-header" style={{ background: accentColor }}>
          <div className="dash-header-left">
            <div className="dash-logo-sm">EEJ</div>
            <div>
              <div className="dash-header-title">{user.name} Dashboard</div>
              <div className="dash-header-sub">Euro Edu Jobs · {formatDate()}</div>
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

function formatDate() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
