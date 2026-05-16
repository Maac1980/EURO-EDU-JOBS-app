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
import MyStatusTab from "./tabs/MyStatusTab";
import MyUPOTab from "./tabs/MyUPOTab";
import MySchengenTab from "./tabs/MySchengenTab";
import { useCandidates } from "@/lib/candidateContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { LangToggle } from "@/components/LangToggle";
/* P3a — fetchNotifications import removed from Dashboard. The bell badge
   previously subscribed to GET /notifications (returned "2") while the
   bottom-nav ALERTS badge subscribed to candidate-derived getBadgeCounts
   (returned "7") — two different counts for what looks like one signal.
   The bell now reads from the same getBadgeCounts result as the bottom-nav
   badge, and the bell click navigates to that same tab. fetchNotifications
   is still exported from lib/api and still consumed by ExecutiveHome.tsx
   for its own notifications widget — that surface is unchanged. */

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

// Tier 1 closeout #22/#31 — back-navigation in the persistent top bar.
// The bottom-nav tabs (home/candidates/upload/alerts/more) are top-level
// destinations and don't show a back button. Every other tab is a drill-
// down and shows the back button in the persistent .dash-header (NOT a
// separate bar — eliminates the per-page scroll-context that broke #16).
// History-aware: pops a navigation stack maintained by activeTab changes,
// so the user returns to the previous tab (typically MoreTab if reached
// from there, but supports deeper nav).
const BOTTOM_NAV_TABS = new Set<ActiveTab>(["home", "candidates", "upload", "alerts", "more"]);

function isSubModule(tab: ActiveTab): boolean {
  return !BOTTOM_NAV_TABS.has(tab);
}

// Tab routing — all 24 modules. Build: 2026-03-31
function TabContent({ role, tab, candidateId, onNavigate }: { role: Role; tab: ActiveTab; candidateId?: string; onNavigate: (t: ActiveTab) => void }) {
  if (tab === "calculator") return <NetPerHourTab />;
  if (tab === "home") {
    if (role === "executive")  return <ExecutiveHome onNavigate={onNavigate} />;
    if (role === "legal")      return <LegalHome onNavigate={onNavigate} />;
    if (role === "operations") return <OperationsHome onNavigate={onNavigate} />;
    if (role === "candidate")  return <CandidateHome candidateId={candidateId} />;
  }
  if (tab === "candidates") {
    if (role === "candidate") return (
      <PlaceholderTab emoji="🔒" title="Access Restricted" description="The global candidate directory is visible only to staff designations." />
    );
    return <CandidatesList role={role} onNavigate={onNavigate} />;
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
  if (tab === "mystatus") return <MyStatusTab />;
  if (tab === "myupo") return <MyUPOTab />;
  if (tab === "myschengen") return <MySchengenTab />;
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
  const [activeTab, setActiveTabRaw] = useState<ActiveTab>("home");
  const [navStack, setNavStack] = useState<ActiveTab[]>([]);
  /* P3a — notifCount state removed. Bell badge now derives from badgeCounts
     below (single source of truth shared with BottomNav). */

  // Tier 1 closeout #22/#31 — wrap setActiveTab to maintain a back-stack.
  // When navigating to a new tab, push the current onto the stack (deduped).
  // Bottom-nav switches replace the stack (top-level destinations).
  const setActiveTab = (next: ActiveTab) => {
    setActiveTabRaw((current) => {
      if (current === next) return current;
      if (BOTTOM_NAV_TABS.has(next)) {
        setNavStack([]);
      } else {
        setNavStack((s) => [...s, current]);
      }
      return next;
    });
  };

  const goBack = () => {
    setNavStack((s) => {
      if (s.length === 0) {
        setActiveTabRaw("more");
        return s;
      }
      const prev = s[s.length - 1];
      setActiveTabRaw(prev);
      return s.slice(0, -1);
    });
  };

  // Audit finding B (2026-05-16) — the prior commit's ref-based scroll
  // reset targeted the WRAPPER div (overflow:hidden, doesn't scroll)
  // instead of .tab-page (overflow-y:auto, the actual scroll container).
  // Setting scrollTop on a non-scrolling element is a no-op.
  //
  // Fix: pass key={activeTab} to <TabContent> below so React remounts
  // the tab on every change. The new .tab-page mounts with scrollTop=0
  // by definition — fresh DOM element. No effect, no ref, no race.
  // window.scrollTo is kept as a defensive document-level reset for any
  // page that scrolls the body.
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [activeTab]);

  /* P3a — the fetchNotifications polling effect was removed. Its only
     consumer was notifCount → bell badge, and that subscription is now
     unified with the bottom-nav badge below. */

  if (!user) return null;

  const accentColor = ROLE_COLOR[user.role];
  const tierLabel   = ROLE_TIER[user.role];
  const badgeCounts = getBadgeCounts(user.role, candidates);
  /* P3a — bell badge + click target unified with bottom-nav badge.
     getBadgeCounts puts the role's attention count on `alerts` for
     executive/legal/candidate and on `home` for operations. The bell
     mirrors whichever the role uses, and the bell click navigates to
     that same tab — so the bell number and the bottom-nav number always
     agree, and tapping the bell always lands you on the page that
     itemizes the same alerts. */
  const bellTab: ActiveTab = badgeCounts.alerts !== undefined ? "alerts" : "home";
  const bellCount = badgeCounts[bellTab] ?? 0;

  return (
    <div className="eej-screen">
      <div className="eej-container" style={{ position: "relative" }}>

        <ToastContainer />

        <header className="dash-header" style={{ background: accentColor }}>
          <div className="dash-header-left">
            {/* Tier 1 closeout #31 — back button lives in the persistent
                top bar (not a separate per-page bar). Only rendered on
                drill-down tabs; bottom-nav tabs are top-level. Hit area
                ≥44×44 per Apple HIG. */}
            {isSubModule(activeTab) ? (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: "rgba(255,255,255,0.18)", border: "none",
                  color: "#fff", cursor: "pointer", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 700, lineHeight: 1,
                  WebkitTapHighlightColor: "rgba(255,255,255,0.25)",
                }}
              >
                ‹
              </button>
            ) : (
              <div className="dash-logo-sm">EEJ</div>
            )}
            <div className="dash-header-text">
              <div className="dash-header-title">
                {user.shortName}
                <span className="dash-tier-chip" style={{ marginLeft: 6 }}>{tierLabel}</span>
              </div>
              <div className="dash-header-sub">{user.designation}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LangToggle />
            <button
              onClick={() => setActiveTab(bellTab)}
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
              {bellCount > 0 && (
                <span style={{
                  position: "absolute", top: -2, right: -4,
                  background: "#EF4444", color: "#fff",
                  fontSize: 9, fontWeight: 800,
                  minWidth: 16, height: 16,
                  borderRadius: 8, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  padding: "0 3px",
                }}>
                  {bellCount > 99 ? "99+" : bellCount}
                </span>
              )}
            </button>
            <button className="dash-logout" onClick={logout} title="Logout">
              <LogoutIcon />
            </button>
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Tier 1 closeout #22/#31 — back-bar in the persistent .dash-header.
              Audit-2026-05-16 finding B fix: key={activeTab} forces React to
              remount TabContent on every tab change. The new .tab-page mounts
              fresh at scrollTop=0 — no ref-based reset needed (the prior ref
              targeted the wrong overflow:hidden wrapper). */}
          <ErrorBoundary>
            <TabContent key={activeTab} role={user.role} tab={activeTab} candidateId={user.candidateId} onNavigate={setActiveTab} />
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
