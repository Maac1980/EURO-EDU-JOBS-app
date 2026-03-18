import type { Role, ActiveTab } from "@/types";

interface BottomNavProps {
  role: Role;
  active: ActiveTab;
  onChange: (tab: ActiveTab) => void;
}

const STAFF_TABS = [
  { id: "home",       icon: HomeIcon,       label: "Home"       },
  { id: "candidates", icon: CandidatesIcon, label: "Candidates" },
  { id: "alerts",     icon: AlertsIcon,     label: "Alerts"     },
  { id: "profile",    icon: ProfileIcon,    label: "Profile"    },
] as const;

const WORKER_TABS = [
  { id: "home",      icon: HomeIcon,      label: "Home"      },
  { id: "mydocs",    icon: DocsIcon,      label: "My Docs"   },
  { id: "timesheet", icon: TimesheetIcon, label: "Timesheet" },
  { id: "profile",   icon: ProfileIcon,   label: "Profile"   },
] as const;

export function BottomNav({ role, active, onChange }: BottomNavProps) {
  const tabs = role === "worker" ? WORKER_TABS : STAFF_TABS;

  return (
    <nav className="bottom-nav">
      {tabs.map(({ id, icon: Icon, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            className={`bottom-nav-item${isActive ? " active" : ""}`}
            onClick={() => onChange(id as ActiveTab)}
          >
            <Icon active={isActive} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#FFD600" : "none"} stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function CandidatesIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function AlertsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function DocsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function TimesheetIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#FFD600" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
