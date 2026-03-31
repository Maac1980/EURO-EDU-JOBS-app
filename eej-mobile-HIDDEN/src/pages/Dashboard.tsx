import { KnowledgeCenter } from "@/components/KnowledgeCenter";
import { useState, useEffect } from "react";
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
import MoreTab         from "./tabs/MoreTab";
import JobBoardTab     from "./tabs/JobBoardTab";
import ATSPipelineTab  from "./tabs/ATSPipelineTab";
import InterviewsTab   from "./tabs/InterviewsTab";
import ContractsTab    from "./tabs/ContractsTab";
import InvoicesTab     from "./tabs/InvoicesTab";
import RegulatoryTab   from "./tabs/RegulatoryTab";
import ImmigrationSearchTab from "./tabs/ImmigrationSearchTab";
import WorkPermitTab   from "./tabs/WorkPermitTab";
import GPSTrackingTab  from "./tabs/GPSTrackingTab";
import ApplicationsTab from "./tabs/ApplicationsTab";
import TRCServiceTab   from "./tabs/TRCServiceTab";
import WorkerCalendarTab from "./tabs/WorkerCalendarTab";
import ShiftScheduleTab from "./tabs/ShiftScheduleTab";
import PayTransparencyTab from "./tabs/PayTransparencyTab";
import SkillsAssessmentTab from "./tabs/SkillsAssessmentTab";
import SalaryBenchmarkTab from "./tabs/SalaryBenchmarkTab";
import PayrollTab from "./tabs/PayrollTab";
import ClientsTab from "./tabs/ClientsTab";
import PricingTab from "./tabs/PricingTab";
import AiAuditTab from "./tabs/AiAuditTab";
import GDPRTab from "./tabs/GDPRTab";
import AgencySettingsTab from "./tabs/AgencySettingsTab";
import NetPerHourTab from "./tabs/NetPerHourTab";
import { useCandidates } from "@/lib/candidateContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { fetchNotifications } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

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

function getBadgeCounts(role: Role, candidates: { status: string; visaDaysLeft?: number }[]): Partial<Record<ActiveTab, number>> {
  const alertCount = candidates.filter(c =>
    c.status === "expiring" || (c.visaDaysLeft !== undefined && c.visaDaysLeft > 0 && c.visaDaysLeft <= 60)
  ).length;
  const needsDocs = candidates.filter((c) => c.status === "missing" || c.status === "expiring").length;
  if (role === "executive")  return { alerts: alertCount || 0 };
  if (role === "legal")      return { alerts: alertCount || 0 };
  if (role === "operations") return { home: needsDocs || 0 };
  if (role === "candidate")  return { alerts: 0 };
  return {};
}

// Tab routing — all 24 modules. Build: 2026-03-31
function TabContent({ role, tab, candidateId, onNavigate }: { role: Role; tab: ActiveTab; candidateId?: string; onNavigate: (t: ActiveTab) => void }) {
  if (tab === "calculator") return <NetPerHourTab />;
  if (tab === "home") {
    if (role === "executive")  return <ExecutiveHome onNavigate={onNavigate} />;
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
  if (tab === "mydocs")       return <MyDocsTab />;
  if (tab === "profile")      return <ProfileTab />;
  if (tab === "more")         return <MoreTab onNavigate={onNavigate} />;
  if (tab === "jobs")         return <JobBoardTab />;
  if (tab === "ats")          return <ATSPipelineTab />;
  if (tab === "interviews")   return <InterviewsTab />;
  if (tab === "contracts")    return <ContractsTab />;
  if (tab === "invoices")     return <InvoicesTab />;
  if (tab === "regulatory")   return <RegulatoryTab />;
  if (tab === "immigration")  return <ImmigrationSearchTab />;
  if (tab === "permits")      return <WorkPermitTab />;
  if (tab === "gps")          return <GPSTrackingTab />;
  if (tab === "applications") return <ApplicationsTab />;
  if (tab === "trc") return <TRCServiceTab />;
  if (tab === "availability") return <WorkerCalendarTab />;
  if (tab === "shifts") return <ShiftScheduleTab />;
  if (tab === "paytransparency") return <PayTransparencyTab />;
  if (tab === "skills") return <SkillsAssessmentTab />;
  if (tab === "benchmark") return <SalaryBenchmarkTab />;
  if (tab === "payroll") return <PayrollTab />;
  if (tab === "clients") return <ClientsTab />;
  if (tab === "pricing") return <PricingTab />;
  if (tab === "aiaudit") return <AiAuditTab />;
  if (tab === "gdpr") return <GDPRTab />;
  if (tab === "agency") return <AgencySettingsTab />;
  if (tab === "netperhour") return <NetPerHourTab />;
  return null;
}

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <CandidateProvider>
      <DashboardInner />
    </CandidateProvider>
  );
}

function DashboardInner() {
  const { user, logout } = useAuth();
  const { candidates } = useCandidates();
  const { language, setLanguage } = useI18n();
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    fetchNotifications()
      .then((n) => setNotifCount(n.length))
      .catch(() => {});
    // Poll every 60 seconds for new notifications
    const interval = setInterval(() => {
      fetchNotifications().then((n) => setNotifCount(n.length)).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!user) return null;

  const accentColor = ROLE_COLOR[user.role];
  const tierLabel   = ROLE_TIER[user.role];
  const badgeCounts = getBadgeCounts(user.role, candidates);

  return (
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setLanguage(language === "en" ? "pl" : "en")}
              title="Toggle language"
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6,
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 8px",
                cursor: "pointer",
                letterSpacing: 0.5,
              }}
            >
              {language === "en" ? "PL" : "EN"}
            </button>
            <button
              onClick={() => setActiveTab("applications")}
              title="Notifications"
              style={{
                background: "none",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                position: "relative",
                padding: 4,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {notifCount > 0 && (
                <span style={{
                  position: "absolute", top: -2, right: -4,
                  background: "#EF4444", color: "#fff",
                  fontSize: 9, fontWeight: 800,
                  minWidth: 16, height: 16,
                  borderRadius: 8, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  padding: "0 3px",
                }}>
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              )}
            </button>
            <button className="dash-logout" onClick={logout} title="Logout">
              <LogoutIcon />
            </button>
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <ErrorBoundary>
            <TabContent role={user.role} tab={activeTab} candidateId={user.candidateId} onNavigate={setActiveTab} />
          </ErrorBoundary>
        </div>

        <BottomNav
          role={user.role}
          active={activeTab}
          onChange={setActiveTab}
          badgeCounts={badgeCounts}
        />
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
