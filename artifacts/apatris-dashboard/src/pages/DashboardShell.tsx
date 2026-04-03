import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { CandidateProvider } from "@/lib/candidateContext";
import { ToastProvider } from "@/lib/toast";
import { I18nProvider } from "@/lib/i18n";
import type { ActiveTab, Role } from "@/types";
import Sidebar from "@/components/Sidebar";

// Tab imports — all 25+ modules
import ExecutiveHome from "./tabs/ExecutiveHome";
import LegalHome from "./tabs/LegalHome";
import OperationsHome from "./tabs/OperationsHome";
import CandidateHome from "./tabs/CandidateHome";
import CandidatesList from "./tabs/CandidatesList";
import BulkUploadTab from "./tabs/BulkUploadTab";
import ProfileTab from "./tabs/ProfileTab";
import AlertsTab from "./tabs/AlertsTab";
import MyDocsTab from "./tabs/MyDocsTab";
import UpdatesTab from "./tabs/UpdatesTab";
import PlaceholderTab from "./tabs/PlaceholderTab";
import MoreTab from "./tabs/MoreTab";
import JobBoardTab from "./tabs/JobBoardTab";
import ATSPipelineTab from "./tabs/ATSPipelineTab";
import InterviewsTab from "./tabs/InterviewsTab";
import ContractsTab from "./tabs/ContractsTab";
import InvoicesTab from "./tabs/InvoicesTab";
import RegulatoryTab from "./tabs/RegulatoryTab";
import ImmigrationSearchTab from "./tabs/ImmigrationSearchTab";
import WorkPermitTab from "./tabs/WorkPermitTab";
import GPSTrackingTab from "./tabs/GPSTrackingTab";
import ApplicationsTab from "./tabs/ApplicationsTab";
import TRCServiceTab from "./tabs/TRCServiceTab";
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

function TabContent({ role, tab, onNavigate }: { role: Role; tab: ActiveTab; onNavigate: (t: ActiveTab) => void }) {
  if (tab === "calculator" || tab === "netperhour") return <NetPerHourTab />;
  if (tab === "home") {
    if (role === "executive") return <ExecutiveHome onNavigate={onNavigate} />;
    if (role === "legal") return <LegalHome />;
    if (role === "operations") return <OperationsHome />;
    if (role === "candidate") return <CandidateHome />;
  }
  if (tab === "candidates") {
    if (role === "candidate") return <PlaceholderTab emoji="🔒" title="Access Restricted" description="The global candidate directory is visible only to staff." />;
    return <CandidatesList role={role} />;
  }
  if (tab === "upload") return role === "candidate" ? <MyDocsTab /> : <BulkUploadTab />;
  if (tab === "alerts") return role === "candidate" ? <UpdatesTab /> : <AlertsTab role={role} />;
  if (tab === "mydocs") return <MyDocsTab />;
  if (tab === "profile") return <ProfileTab />;
  if (tab === "more") return <MoreTab onNavigate={onNavigate} />;
  if (tab === "jobs") return <JobBoardTab />;
  if (tab === "ats") return <ATSPipelineTab />;
  if (tab === "interviews") return <InterviewsTab />;
  if (tab === "contracts") return <ContractsTab />;
  if (tab === "invoices") return <InvoicesTab />;
  if (tab === "regulatory") return <RegulatoryTab />;
  if (tab === "immigration") return <ImmigrationSearchTab />;
  if (tab === "permits") return <WorkPermitTab />;
  if (tab === "gps") return <GPSTrackingTab />;
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
  return null;
}

const TAB_LABELS: Partial<Record<ActiveTab, string>> = {
  home: "Dashboard",
  candidates: "Candidates",
  jobs: "Job Board",
  ats: "ATS Pipeline",
  applications: "Applications",
  interviews: "Interviews",
  contracts: "Contracts",
  invoices: "Invoices",
  regulatory: "Regulatory Intelligence",
  immigration: "Immigration Search",
  permits: "Work Permits",
  gps: "GPS Tracking",
  calculator: "ZUS Calculator",
  netperhour: "Net Per Hour",
  payroll: "Payroll Ledger",
  clients: "Clients",
  alerts: "Alerts",
  trc: "TRC Service",
  availability: "Availability",
  shifts: "Shift Schedule",
  paytransparency: "Pay Transparency",
  skills: "Skills Assessment",
  benchmark: "Salary Benchmark",
  pricing: "Pricing & Plans",
  aiaudit: "AI Audit Trail",
  gdpr: "GDPR",
  agency: "Agency Settings",
  profile: "Profile",
  more: "All Modules",
  mydocs: "My Documents",
  upload: "Upload",
};

export default function DashboardShell() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("eej_sidebar_collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggleSidebar = () => {
    setCollapsed((c) => {
      localStorage.setItem("eej_sidebar_collapsed", String(!c));
      return !c;
    });
  };

  if (!user) return null;

  return (
    <I18nProvider>
      <ToastProvider>
        <CandidateProvider>
          <div style={{ display: "flex", height: "100vh", background: "#0d0f14", color: "#e5e7eb" }}>
            <Sidebar
              active={activeTab}
              onNavigate={setActiveTab}
              collapsed={collapsed}
              onToggle={toggleSidebar}
            />

            {/* Main content area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Top bar */}
              <header
                style={{
                  height: 56,
                  minHeight: 56,
                  borderBottom: "1px solid rgba(233,255,112,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 24px",
                  background: "#0a0c10",
                }}
              >
                <h1 style={{ fontSize: 16, fontWeight: 700, color: "#f3f4f6", margin: 0 }}>
                  {TAB_LABELS[activeTab] ?? "Dashboard"}
                </h1>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#6B7280" }}>
                  <span style={{
                    background: "rgba(233,255,112,0.1)",
                    color: "#E9FF70",
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 11,
                  }}>
                    T{user.tier} {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>
                  <span>{user.shortName}</span>
                </div>
              </header>

              {/* Content */}
              <main className="dashboard-content">
                <TabContent role={user.role} tab={activeTab} onNavigate={setActiveTab} />
              </main>
            </div>
          </div>
        </CandidateProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
