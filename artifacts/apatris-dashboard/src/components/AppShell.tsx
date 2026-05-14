import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import {
  Users, Calculator, AlertTriangle, History, Settings, LogOut,
  FileSignature, FileCheck, MapPin, BarChart3, Sparkles,
  Shield, Search, CalendarDays, Clock, Award, TrendingUp,
  Globe, Building2, UserPlus, Briefcase, Receipt, FileText, Stamp,
  LayoutGrid, ChevronDown, X, ArrowLeft, Link2, Check,
} from "lucide-react";

// ── Grouped Navigation ──────────────────────────────────────────────────────

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  id: string;
  label: string;
  color: string;
  hoverBg: string;
  activeBg: string;
  items: NavItem[];
}

// ═══ Phase 1 Navigation: 8 domain groups ═══
const NAV_GROUPS: NavGroup[] = [
  {
    id: "recruitment",
    label: "Recruitment",
    color: "text-violet-400",
    hoverBg: "hover:bg-violet-500/10",
    activeBg: "bg-violet-500/15 text-violet-400",
    items: [
      { path: "/job-board",          label: "Job Board",     icon: Briefcase },
      { path: "/candidates",        label: "Candidates",    icon: UserPlus },
      { path: "/ats-pipeline",      label: "ATS Pipeline",  icon: Users },
      { path: "/applications",      label: "Applications",  icon: UserPlus },
      { path: "/interviews",        label: "Interviews",    icon: CalendarDays },
      { path: "/crm-pipeline",      label: "CRM Pipeline",  icon: Briefcase },
      { path: "/contracts",          label: "Contracts",     icon: FileSignature },
    ],
  },
  {
    id: "workers",
    label: "Workers",
    color: "text-blue-400",
    hoverBg: "hover:bg-blue-500/10",
    activeBg: "bg-blue-500/15 text-blue-400",
    items: [
      { path: "/workers",            label: "All Workers",   icon: Users },
      { path: "/worker-timeline",   label: "Timeline",      icon: Clock },
      { path: "/onboarding-checklist", label: "Onboarding", icon: Users },
      { path: "/bulk-upload",       label: "Bulk Upload",   icon: Users },
      { path: "/hours",             label: "Hours",         icon: Clock },
      { path: "/availability",      label: "Availability",  icon: CalendarDays },
      { path: "/shift-schedule",    label: "Shifts",        icon: Clock },
      { path: "/gps-tracking",      label: "GPS Tracking",  icon: MapPin },
      { path: "/housing",           label: "Housing",       icon: Users },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    color: "text-amber-400",
    hoverBg: "hover:bg-amber-500/10",
    activeBg: "bg-amber-500/15 text-amber-400",
    items: [
      { path: "/legal-dashboard",   label: "Legal Ops",      icon: Shield },
      { path: "/case-action-center",label: "Action Center",  icon: Shield },
      { path: "/case-management",   label: "Cases",          icon: FileCheck },
      { path: "/compliance-alerts", label: "Alerts",          icon: AlertTriangle },
      { path: "/legal-queue",       label: "Legal Queue",    icon: Clock },
      { path: "/immigration",       label: "Permits",         icon: Stamp },
      { path: "/trc-service",       label: "TRC Service",    icon: FileCheck },
      { path: "/fines-report",      label: "Fines Risk",     icon: AlertTriangle },
      { path: "/safety-monitor",    label: "Safety Monitor", icon: Shield },
      { path: "/inspection-report", label: "PIP Report",     icon: Shield },
      { path: "/rejection-intel",   label: "Rejections",     icon: AlertTriangle },
      { path: "/gdpr",              label: "GDPR",           icon: Shield },
      { path: "/legal-intelligence", label: "Legal Intelligence", icon: Sparkles },
      { path: "/command-center",     label: "Command Center",  icon: Shield },
      { path: "/legal-answer",      label: "Legal Answer",    icon: Shield },
      { path: "/trc-workspace",     label: "TRC Workspace",  icon: FileCheck },
      { path: "/smart-ingest",      label: "Smart Ingest",   icon: Sparkles },
      { path: "/knowledge-graph",   label: "Knowledge Graph", icon: Shield },
      { path: "/schengen-calculator",label: "Schengen 90/180", icon: Globe },
      { path: "/digital-safe",      label: "Digital Safe",   icon: Shield },
      { path: "/mos-2026",          label: "MOS 2026",       icon: FileCheck },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    color: "text-cyan-400",
    hoverBg: "hover:bg-cyan-500/10",
    activeBg: "bg-cyan-500/15 text-cyan-400",
    items: [
      { path: "/doc-workflow",       label: "Doc Workflow",   icon: FileCheck },
      { path: "/document-verify",    label: "Doc Verify",     icon: FileCheck },
      { path: "/document-templates",label: "Templates",      icon: FileText },
      { path: "/worker-upload-portal",label: "Upload",       icon: Users },
      { path: "/signature-tracking",label: "Signatures",     icon: FileCheck },
      { path: "/immigration-search",label: "Immigration AI", icon: Search },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    color: "text-emerald-400",
    hoverBg: "hover:bg-emerald-500/10",
    activeBg: "bg-emerald-500/15 text-emerald-400",
    items: [
      { path: "/payroll",           label: "Payroll",         icon: Calculator },
      { path: "/calculator",        label: "ZUS Calculator",  icon: Calculator },
      { path: "/invoices",          label: "Invoices",        icon: Receipt },
      { path: "/clients",           label: "Clients",         icon: Building2 },
      { path: "/margin-analysis",   label: "Margins",         icon: TrendingUp },
      { path: "/revenue",           label: "Revenue",         icon: TrendingUp },
      { path: "/salary-benchmark",  label: "Salary Bench",    icon: TrendingUp },
    ],
  },
  {
    id: "research",
    label: "Research",
    color: "text-rose-400",
    hoverBg: "hover:bg-rose-500/10",
    activeBg: "bg-rose-500/15 text-rose-400",
    items: [
      { path: "/ai-copilot-chat",   label: "AI Copilot",    icon: Sparkles },
      { path: "/regulatory",        label: "Regulatory",     icon: Shield },
      { path: "/analytics",         label: "Analytics",      icon: BarChart3 },
      { path: "/ai-audit",          label: "AI Audit",       icon: Shield },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    color: "text-slate-400",
    hoverBg: "hover:bg-slate-500/10",
    activeBg: "bg-slate-500/15 text-slate-300",
    items: [
      { path: "/admin-settings",    label: "Settings",   icon: Settings },
      { path: "/profile",           label: "Profile",    icon: Users },
      { path: "/agency-settings",   label: "Agency",     icon: Settings },
      { path: "/history",           label: "History",    icon: History },
      { path: "/system-logs",       label: "Logs",       icon: FileText },
      { path: "/updates",           label: "Updates",    icon: FileText },
      { path: "/system-test",       label: "System Test", icon: Settings },
    ],
  },
];

// Quick-access tabs shown directly in the top bar
const QUICK_TABS: NavItem[] = [
  { path: "/",                  label: "Dashboard",   icon: BarChart3 },
  { path: "/workers",           label: "Workers",     icon: Users },
  { path: "/candidates",       label: "Recruit",     icon: UserPlus },
  { path: "/payroll",           label: "Payroll",     icon: Calculator },
  { path: "/legal-dashboard",  label: "Compliance",  icon: Shield },
  { path: "/doc-workflow",     label: "Documents",   icon: FileCheck },
  { path: "/ai-copilot-chat",  label: "Research",    icon: Sparkles },
];

// Flat list for mobile bottom bar (top 7 most used)
const MOBILE_TABS: NavItem[] = [
  { path: "/",                  label: "Home",      icon: BarChart3 },
  { path: "/workers",           label: "Workers",   icon: Users },
  { path: "/payroll",           label: "Payroll",   icon: Calculator },
  { path: "/compliance-alerts", label: "Alerts",    icon: AlertTriangle },
  { path: "/immigration",       label: "Permits",   icon: Stamp },
  { path: "/contracts",         label: "Contracts", icon: FileSignature },
];

function findActiveGroup(location: string): NavGroup | undefined {
  return NAV_GROUPS.find(g =>
    g.items.some(item =>
      item.path === "/" ? location === "/" : location.startsWith(item.path)
    )
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith("pl") ? "pl" : "en";
  const toggleLang = () => i18n.changeLanguage(currentLang === "pl" ? "en" : "pl");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [adLinkCopied, setAdLinkCopied] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Track navigation history for back button
  useEffect(() => {
    setHistory(prev => {
      if (prev[prev.length - 1] === location) return prev;
      return [...prev.slice(-10), location]; // keep last 10
    });
  }, [location]);

  const goBack = () => {
    if (history.length > 1) {
      const prev = history[history.length - 2];
      setHistory(h => h.slice(0, -1));
      setLocation(prev);
    }
  };

  // Focus search when menu opens
  useEffect(() => {
    if (menuOpen) {
      setMenuSearch("");
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [menuOpen]);

  const isPublicRoute =
    location === "/login" ||
    location.startsWith("/apply") ||
    location.startsWith("/worker-upload") ||
    location === "/pricing";

  const showShell = isAuthenticated && !isPublicRoute;

  useEffect(() => {
    if (showShell) {
      document.body.classList.add("has-app-shell");
    } else {
      document.body.classList.remove("has-app-shell");
    }
    return () => document.body.classList.remove("has-app-shell");
  }, [showShell]);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Close menu on ESC
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menuOpen]);

  if (!showShell) return <>{children}</>;

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  const activeGroup = findActiveGroup(location);

  const navigate = (path: string) => {
    setLocation(path);
    setMenuOpen(false);
  };

  return (
    <div className="app-shell-root">
      {/* ─── Top Navigation Bar ───────────────────────────────────────── */}
      <header className="app-top-bar">
        {/* Brand */}
        <div className="app-top-brand cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate("/")}>
          <div
            className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
            style={{ background: "#d4e84b", boxShadow: "0 0 0 2px rgba(212,232,75,0.35)" }}
          >
            <span style={{ fontWeight: 900, fontSize: 12, color: "#0b101e", letterSpacing: -0.5 }}>EEJ</span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold tracking-widest uppercase leading-none" style={{ color: "#d4e84b" }}>EURO EDU JOBS</p>
            <p className="text-[9px] text-slate-400 font-mono tracking-widest uppercase leading-none mt-0.5">Recruitment &amp; Compliance</p>
          </div>
        </div>

        {/* Back button — shows only when not on home */}
        {location !== "/" && history.length > 1 && (
          <button onClick={goBack} title="Wróć" style={{
            display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
            borderRadius: 6, border: "none", background: "rgba(255,255,255,0.05)",
            color: "#7a8599", cursor: "pointer", fontSize: 11, fontWeight: 600,
            transition: "all 0.15s", flexShrink: 0, marginLeft: 4,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(212,232,75,0.1)"; e.currentTarget.style.color = "#d4e84b"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#7a8599"; }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            <span className="hidden md:inline">Wróć</span>
          </button>
        )}

        {/* Quick-access tabs */}
        <nav className="app-top-nav">
          {QUICK_TABS.map(({ path, label, icon: Icon }) => {
            const active = isActive(path);
            return (
              <button key={path} onClick={() => navigate(path)}
                className={`app-top-nav-item ${active ? "app-top-nav-item--active" : ""}`}>
                <Icon className="w-3 h-3" />
                <span>{label}</span>
              </button>
            );
          })}

          {/* All Modules dropdown trigger */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={`app-top-nav-item ${menuOpen ? "app-top-nav-item--active" : ""}`}
            >
              <LayoutGrid className="w-3 h-3" />
              <span>All</span>
              <ChevronDown className={`w-2.5 h-2.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* ─── Mega Menu ───────────────────────────────────────────── */}
            {menuOpen && (
              <div className="app-mega-menu">
                {/* Search + Close */}
                <div className="px-4 pt-4 pb-3 border-b border-slate-700/50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">All Modules</p>
                    <button onClick={() => setMenuOpen(false)} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      ref={searchRef}
                      value={menuSearch}
                      onChange={e => setMenuSearch(e.target.value)}
                      placeholder="Search modules..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#d4e84b]/40"
                      onKeyDown={e => {
                        if (e.key === "Escape") { setMenuOpen(false); }
                        if (e.key === "Enter") {
                          // Navigate to first visible result
                          const q = menuSearch.toLowerCase();
                          for (const g of NAV_GROUPS) {
                            const match = g.items.find(i => i.label.toLowerCase().includes(q));
                            if (match) { navigate(match.path); break; }
                          }
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="app-mega-menu-grid">
                  {NAV_GROUPS.map(group => {
                    const q = menuSearch.toLowerCase();
                    const filteredItems = q ? group.items.filter(i => i.label.toLowerCase().includes(q)) : group.items;
                    if (q && filteredItems.length === 0) return null;
                    return (
                    <div key={group.id} className="app-mega-menu-group">
                      <p className={`text-[10px] font-black uppercase tracking-[0.15em] mb-2 ${group.color}`}>
                        {group.label}
                      </p>
                      <div className="space-y-0.5">
                        {filteredItems.map(item => {
                          const active = isActive(item.path);
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.path}
                              onClick={() => navigate(item.path)}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all ${
                                active
                                  ? `${group.activeBg} font-bold`
                                  : `text-slate-400 ${group.hoverBg} hover:text-white`
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Right: current section badge + user chip */}
        <div className="app-top-right">
          {/* Active section indicator */}
          {activeGroup && !QUICK_TABS.some(t => isActive(t.path)) && (
            <span className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border border-white/10 ${activeGroup.color} bg-white/[0.03]`}>
              {activeGroup.label}
            </span>
          )}

          {/* Language toggle */}
          {/* Copy Recruitment Link — for Facebook Ads.
              Pre-fix #15: hardcoded https://eej-jobs-api.replit.app/apply
              (the dead Replit host, returns 404). Use window.location.origin
              so the button copies whatever host the dashboard is currently
              served from — staging → staging, prod → prod, robust across
              future host changes. */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/apply`).then(() => {
                setAdLinkCopied(true);
                setTimeout(() => setAdLinkCopied(false), 3000);
              });
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors"
            style={{
              background: adLinkCopied ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.1)",
              borderColor: adLinkCopied ? "rgba(34,197,94,0.3)" : "rgba(59,130,246,0.25)",
              color: adLinkCopied ? "#22c55e" : "#60A5FA",
            }}
            title="Copy recruitment form link for Facebook Ads"
          >
            {adLinkCopied ? <><Check className="w-3 h-3" /> Copied for Ads</> : <><Link2 className="w-3 h-3" /> Ad Link</>}
          </button>

          <button
            onClick={toggleLang}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-700 hover:border-[#d4e84b]/40 transition-colors"
            style={{ color: currentLang === "pl" ? "#d4e84b" : "#94a3b8" }}
            title={currentLang === "pl" ? "Switch to English" : "Przełącz na Polski"}
          >
            <span className={currentLang === "en" ? "text-[#d4e84b]" : "text-slate-500"}>EN</span>
            <span className="text-slate-600">|</span>
            <span className={currentLang === "pl" ? "text-[#d4e84b]" : "text-slate-500"}>PL</span>
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-700/60">
            <div className="w-7 h-7 rounded-full bg-[#d4e84b]/15 border border-[#d4e84b]/30 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-[#d4e84b] font-mono">
                {user?.name?.charAt(0)?.toUpperCase() ?? "A"}
              </span>
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-bold text-white leading-none">{user?.name}</p>
              <p className="text-[10px] text-[#d4e84b] font-mono leading-none mt-0.5">{user?.role}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/10 flex-shrink-0"
              title="Wyloguj"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ─── Page content ─────────────────────────────────────────────── */}
      <div className="app-content-wrapper">
        {children}
      </div>

      {/* ─── Mobile Bottom Bar ──────────────────────────────────────── */}
      <nav className="app-bottom-bar">
        {MOBILE_TABS.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => setLocation(path)}
              className="flex flex-col items-center justify-center gap-0.5 min-w-[60px] px-1 h-full transition-colors flex-shrink-0"
            >
              <div className={`p-1.5 rounded-xl transition-all ${active ? "bg-[#d4e84b]/15" : ""}`}>
                <Icon className={`w-5 h-5 ${active ? "text-[#d4e84b]" : "text-slate-500"}`} />
              </div>
              <span className={`text-[9px] font-mono font-bold uppercase tracking-wide leading-none whitespace-nowrap ${
                active ? "text-[#d4e84b]" : "text-slate-600"
              }`}>
                {label}
              </span>
            </button>
          );
        })}
        {/* All modules button on mobile */}
        <button
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[60px] px-1 h-full transition-colors flex-shrink-0"
        >
          <div className={`p-1.5 rounded-xl ${menuOpen ? "bg-[#d4e84b]/15" : ""}`}>
            <LayoutGrid className={`w-5 h-5 ${menuOpen ? "text-[#d4e84b]" : "text-slate-500"}`} />
          </div>
          <span className={`text-[9px] font-mono font-bold uppercase tracking-wide leading-none ${
            menuOpen ? "text-[#d4e84b]" : "text-slate-600"
          }`}>More</span>
        </button>
      </nav>

      {/* ─── Mobile mega menu overlay ──────────────────────────────── */}
      {menuOpen && (
        <div className="app-mega-menu-mobile-overlay md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="app-mega-menu-mobile" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-700/50">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">All Modules</p>
              <button onClick={() => setMenuOpen(false)} className="p-1.5 rounded-lg bg-white/5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-5 overflow-y-auto max-h-[70vh]">
              {NAV_GROUPS.map(group => (
                <div key={group.id}>
                  <p className={`text-[10px] font-black uppercase tracking-[0.15em] mb-2 ${group.color}`}>{group.label}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {group.items.map(item => {
                      const active = isActive(item.path);
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.path}
                          onClick={() => navigate(item.path)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs transition-all ${
                            active ? `${group.activeBg} font-bold` : `text-slate-400 active:bg-white/5`
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
