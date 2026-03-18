import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import type { ActiveTab } from "@/types";

const TAB_CONTENT: Record<string, { title: string; description: string; emoji: string }> = {
  home:       { title: "Home",       description: "Your dashboard overview and key metrics will appear here.", emoji: "🏠" },
  candidates: { title: "Candidates", description: "Browse and manage your candidate pool here.",               emoji: "👥" },
  alerts:     { title: "Alerts",     description: "Compliance alerts and document expiry notifications.",       emoji: "🔔" },
  profile:    { title: "Profile",    description: "Your account settings and preferences.",                    emoji: "👤" },
  mydocs:     { title: "My Docs",    description: "Your uploaded documents and their statuses.",               emoji: "📄" },
  timesheet:  { title: "Timesheet",  description: "Log and review your working hours.",                       emoji: "🗓️" },
};

const ROLE_COLOR: Record<string, string> = {
  owner:   "#1B2A4A",
  manager: "#2D4270",
  office:  "#1B5E8A",
  worker:  "#1A6B4A",
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");

  if (!user) return null;

  const content = TAB_CONTENT[activeTab];
  const accentColor = ROLE_COLOR[user.role] ?? "#1B2A4A";

  return (
    <div className="eej-screen">
      <div className="eej-container">

        {/* Top Header */}
        <header className="dash-header" style={{ background: accentColor }}>
          <div className="dash-header-left">
            <div className="dash-logo-sm">EEJ</div>
            <div>
              <div className="dash-header-title">{user.name} Dashboard</div>
              <div className="dash-header-sub">Euro Edu Jobs</div>
            </div>
          </div>
          <button className="dash-logout" onClick={logout} title="Logout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </header>

        {/* Role badge */}
        <div className="dash-role-badge-row">
          <span className="dash-role-badge" style={{ borderColor: accentColor, color: accentColor }}>
            {user.name.toUpperCase()}
          </span>
        </div>

        {/* Main content area */}
        <main className="dash-main">
          <div className="dash-content-card">
            <div className="dash-content-emoji">{content.emoji}</div>
            <h2 className="dash-content-title">{content.title}</h2>
            <p className="dash-content-desc">{content.description}</p>
            <div className="dash-coming-soon">
              <span>⚡</span> Phase 2 content coming soon
            </div>
          </div>
        </main>

        {/* Bottom Navigation */}
        <BottomNav role={user.role} active={activeTab} onChange={setActiveTab} />
      </div>
    </div>
  );
}
