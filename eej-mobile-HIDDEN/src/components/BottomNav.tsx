import type { ReactElement } from "react";
import type { Role, ActiveTab } from "@/types";
import { useI18n } from "@/lib/i18n";

interface BottomNavProps {
  role: Role;
  active: ActiveTab;
  onChange: (tab: ActiveTab) => void;
  badgeCounts?: Partial<Record<ActiveTab, number>>;
}

type TabDef = { id: ActiveTab; icon: (a: boolean) => ReactElement; i18nKey: string };

const EXEC_LEGAL_TABS: TabDef[] = [
  { id: "home",       i18nKey: "nav.home",       icon: HomeIcon },
  { id: "candidates", i18nKey: "nav.candidates", icon: CandidatesIcon },
  { id: "jobs",       i18nKey: "nav.jobs",       icon: JobsIcon },
  { id: "alerts",     i18nKey: "nav.alerts",     icon: AlertsIcon },
  { id: "more",       i18nKey: "nav.more",       icon: MoreIcon },
];

const OPS_TABS: TabDef[] = [
  { id: "home",       i18nKey: "nav.home",     icon: HomeIcon },
  { id: "candidates", i18nKey: "nav.pipeline", icon: PipelineIcon },
  { id: "jobs",       i18nKey: "nav.jobs",     icon: JobsIcon },
  { id: "alerts",     i18nKey: "nav.alerts",   icon: AlertsIcon },
  { id: "more",       i18nKey: "nav.more",     icon: MoreIcon },
];

const CANDIDATE_TABS: TabDef[] = [
  { id: "home",   i18nKey: "nav.home",    icon: HomeIcon },
  { id: "mydocs", i18nKey: "nav.mydocs",  icon: DocsIcon },
  { id: "alerts", i18nKey: "nav.updates", icon: AlertsIcon },
  { id: "more",   i18nKey: "nav.more",    icon: MoreIcon },
];

// Tabs that should highlight the "More" button
const MORE_CHILDREN: ActiveTab[] = [
  "calculator", "profile", "ats", "interviews", "contracts",
  "invoices", "regulatory", "immigration", "permits", "gps", "applications", "trc",
  "availability", "shifts", "paytransparency", "skills", "benchmark",
  "payroll", "clients", "pricing", "aiaudit", "gdpr", "agency", "netperhour",
];

function getTabsForRole(role: Role): TabDef[] {
  if (role === "operations") return OPS_TABS;
  if (role === "candidate")  return CANDIDATE_TABS;
  return EXEC_LEGAL_TABS;
}

export function BottomNav({ role, active, onChange, badgeCounts = {} }: BottomNavProps) {
  const tabs = getTabsForRole(role);
  const { t } = useI18n();

  // If current tab is a child of "More", highlight "More" as active
  const effectiveActive = MORE_CHILDREN.includes(active) ? "more" : active;

  return (
    <nav className="bottom-nav">
      {tabs.map(({ id, icon, i18nKey }) => {
        const isActive = effectiveActive === id;
        const count    = badgeCounts[id] ?? 0;
        return (
          <button
            key={id}
            className={`bottom-nav-item${isActive ? " active" : ""}`}
            onClick={() => onChange(id)}
            style={{ position: "relative" }}
          >
            {/* P4 — dedicated classes on the icon wrapper and label so the
                CSS rule `.bottom-nav-label` doesn't bleed into the badge.
                Before this change, `.bottom-nav-item span` (specificity
                0,1,1) won over `.nav-badge` (0,1,0) and forced the badge
                text to font-size:10px / weight:700 / letter-spacing:0.04em
                / uppercase — and when the tab was active, the badge text
                also went navy-on-red. That caused the visible "icon-label
                collision" and "HOME label garbled" symptoms. */}
            <span className="bottom-nav-icon">
              {icon(isActive)}
              {count > 0 && (
                <span className="nav-badge">{count > 9 ? "9+" : count}</span>
              )}
            </span>
            <span className="bottom-nav-label">{t(i18nKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}

function HomeIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#FFD600" : "none"} stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
}
function CandidatesIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
function AlertsIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
}
function DocsIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
}
function PipelineIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
}
function JobsIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>;
}
function MoreIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}
