import { KnowledgeCenter } from "@/components/KnowledgeCenter";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { ToastContainer } from "@/components/Toast";
import { CandidateProvider } from "@/lib/candidateContext";
import type { ActiveTab, Role } from "@/types";
import ExecutiveHome   from "./tabs/ExecutiveHome";
import LegalHome       from "./tabs/LegalHome";
import OperationsHome  from "./tabs/OperationsHome";
import CandidateHome   from "./tabs/CandidateHome";
import CandidatesList  from "./tabs/CandidatesList";
import BulkUploadTab   from "./tabs/BulkUploadTab";
import ProfileTab      from "./tabs/ProfileTab";
import AlertsTab       from "./tabs/AlertsTab";
import MyDocsTab       from "./tabs/MyDocsTab";
import UpdatesTab      from "./tabs/UpdatesTab";
import PlaceholderTab  from "./tabs/PlaceholderTab";
import { COMPLIANCE_ALERTS, MOCK_CANDIDATES } from "@/data/mockData";

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

function getBadgeCounts(role: Role): Partial<Record<ActiveTab, number>> {
  const alertCount = COMPLIANCE_ALERTS.visaExpiring.length;
  const needsDocs  = MOCK_CANDIDATES.filter((c) => c.status === "missing" || c.status === "expiring").length;
  if (role === "executive")  return { alerts: alertCount };
  if (role === "legal")      return { alerts: alertCount };
  if (role === "operations") return { home: needsDocs };
  if (role === "candidate")  return { alerts: 3 };
  return {};
}

function TabContent({ role, tab, candidateId }: { role: Role; tab: ActiveTab; candidateId?: string }) {
  if (tab === "calculator") return <KnowledgeCenter />;
  if (tab === "home") {
    if (role === "executive")  return <ExecutiveHome />;
    if (role === "legal")      return <LegalHome />;
    if (role === "operations") return <OperationsHome />;
    if (role === "candidate")  return <CandidateHome candidateId={candidateId} />;
  }
  if (tab === "candidates") {
    if (role === "candidate") return (
      <PlaceholderTab emoji="🔒" title="Access Restricted" description="The global candidate directory is visible only to staff designations." />
    );
    return <CandidatesList role={role} />;
  }
  if (tab === "upload") {
    if (role === "candidate") return <MyDocsTab />;
    return <BulkUploadTab />;
  }
  if (tab === "alerts") {
    if (role === "candidate") return <UpdatesTab />;
    return <AlertsTab role={role} />;
  }
  if (tab === "mydocs") return <MyDocsTab />;
  if (tab === "profile") return <ProfileTab />;
  return null;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");

  if (!user) return null;

  const accentColor = ROLE_COLOR[user.role];
  const tierLabel   = ROLE_TIER[user.role];
  const badgeCounts = getBadgeCounts(user.role);

  return (
    <CandidateProvider>
      <div className="eej-screen">
        <div className="eej-container" style={{ position: "relative" }}>

          <ToastContainer />

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

          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <TabContent role={user.role} tab={activeTab} candidateId={user.candidateId} />
          </div>

          <BottomNav
            role={user.role}
            active={activeTab}
            onChange={setActiveTab}
            badgeCounts={badgeCounts}
          />
        </div>
      </div>
    </CandidateProvider>
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
