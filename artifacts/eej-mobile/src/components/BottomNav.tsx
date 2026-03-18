import type { Role, ActiveTab } from "@/types";

interface BottomNavProps {
  role: Role;
  active: ActiveTab;
  onChange: (tab: ActiveTab) => void;
}

type TabDef = { id: ActiveTab; icon: (a: boolean) => JSX.Element; label: string };

const EXEC_LEGAL_TABS: TabDef[] = [
  { id: "home",       label: "Home",       icon: HomeIcon },
  { id: "candidates", label: "Candidates", icon: CandidatesIcon },
  { id: "alerts",     label: "Alerts",     icon: AlertsIcon },
  { id: "profile",    label: "Profile",    icon: ProfileIcon },
];

const OPS_TABS: TabDef[] = [
  { id: "home",       label: "Home",     icon: HomeIcon },
  { id: "candidates", label: "Pipeline", icon: PipelineIcon },
  { id: "upload",     label: "Upload",   icon: UploadIcon },
  { id: "profile",    label: "Profile",  icon: ProfileIcon },
];

const CANDIDATE_TABS: TabDef[] = [
  { id: "home",   label: "Home",    icon: HomeIcon },
  { id: "mydocs", label: "My Docs", icon: DocsIcon },
  { id: "alerts", label: "Updates", icon: AlertsIcon },
  { id: "profile",label: "Profile", icon: ProfileIcon },
];

function getTabsForRole(role: Role): TabDef[] {
  if (role === "operations") return OPS_TABS;
  if (role === "candidate")  return CANDIDATE_TABS;
  return EXEC_LEGAL_TABS;
}

export function BottomNav({ role, active, onChange }: BottomNavProps) {
  const tabs = getTabsForRole(role);
  return (
    <nav className="bottom-nav">
      {tabs.map(({ id, icon, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            className={`bottom-nav-item${isActive ? " active" : ""}`}
            onClick={() => onChange(id)}
          >
            {icon(isActive)}
            <span>{label}</span>
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
function ProfileIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
function DocsIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
}
function UploadIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /></svg>;
}
function PipelineIcon(active: boolean) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
}
