import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import {
  Users, Calculator, AlertTriangle, History, Settings, LogOut,
  FileSignature, FileCheck, MapPin, BarChart3, Sparkles,
  Shield, Search, CalendarDays, Clock, Award, TrendingUp,
  Globe, Building2, UserPlus, Briefcase, Receipt, FileText, Stamp,
  LayoutGrid, ChevronDown, X,
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

const NAV_GROUPS: NavGroup[] = [
  {
    id: "workforce",
    label: "Workforce",
    color: "text-blue-400",
    hoverBg: "hover:bg-blue-500/10",
    activeBg: "bg-blue-500/15 text-blue-400",
    items: [
      { path: "/",                  label: "Workers",       icon: Users },
      { path: "/candidates",       label: "Candidates",    icon: UserPlus },
      { path: "/hours",             label: "Hours",         icon: Clock },
      { path: "/availability",      label: "Availability",  icon: CalendarDays },
      { path: "/shift-schedule",    label: "Shifts",        icon: Clock },
      { path: "/skills-matrix",     label: "Skills Matrix", icon: Award },
      { path: "/gps-tracking",      label: "GPS Tracking",  icon: MapPin },
      { path: "/bulk-upload",       label: "Bulk Upload",   icon: Users },
      { path: "/self-service",     label: "Self Service",  icon: Users },
      { path: "/mood",             label: "Mood Tracker",  icon: Users },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    color: "text-amber-400",
    hoverBg: "hover:bg-amber-500/10",
    activeBg: "bg-amber-500/15 text-amber-400",
    items: [
      { path: "/compliance-alerts",  label: "Alerts",             icon: AlertTriangle },
      { path: "/immigration",        label: "Permits",            icon: Stamp },
      { path: "/immigration-search", label: "Immigration Search", icon: Search },
      { path: "/trc-service",        label: "TRC Service",        icon: FileCheck },
      { path: "/posted-workers",     label: "Posted Workers",     icon: Globe },
      { path: "/country-compliance", label: "Country Rules",      icon: Globe },
      { path: "/gdpr",              label: "GDPR",               icon: Shield },
      { path: "/legal-kb",          label: "Legal KB",           icon: Shield },
      { path: "/pip-readiness",    label: "PIP Readiness",      icon: Shield },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    color: "text-emerald-400",
    hoverBg: "hover:bg-emerald-500/10",
    activeBg: "bg-emerald-500/15 text-emerald-400",
    items: [
      { path: "/payroll",           label: "Payroll",          icon: Calculator },
      { path: "/calculator",        label: "ZUS Calculator",   icon: Calculator },
      { path: "/salary-benchmark",  label: "Salary Benchmark", icon: TrendingUp },
      { path: "/pay-transparency",  label: "Pay Reports",      icon: BarChart3 },
      { path: "/invoices",          label: "Invoices",         icon: Receipt },
      { path: "/clients",          label: "Clients",          icon: Building2 },
      { path: "/advances",         label: "Advances",         icon: Calculator },
      { path: "/revenue",          label: "Revenue",          icon: TrendingUp },
      { path: "/zus",              label: "ZUS Filings",      icon: Receipt },
    ],
  },
  {
    id: "recruitment",
    label: "Recruitment",
    color: "text-violet-400",
    hoverBg: "hover:bg-violet-500/10",
    activeBg: "bg-violet-500/15 text-violet-400",
    items: [
      { path: "/job-board",     label: "Job Board",     icon: Briefcase },
      { path: "/applications",  label: "Applications",  icon: UserPlus },
      { path: "/ats-pipeline",  label: "ATS Pipeline",  icon: Users },
      { path: "/interviews",    label: "Interviews",    icon: CalendarDays },
      { path: "/contracts",      label: "Contracts",     icon: FileSignature },
      { path: "/doc-workflow",   label: "Doc Workflow",  icon: FileCheck },
      { path: "/matching",      label: "Worker Match",  icon: Sparkles },
      { path: "/contract-gen",  label: "Contract Gen",  icon: FileSignature },
      { path: "/onboarding",    label: "Onboarding",    icon: UserPlus },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    color: "text-rose-400",
    hoverBg: "hover:bg-rose-500/10",
    activeBg: "bg-rose-500/15 text-rose-400",
    items: [
      { path: "/analytics",    label: "Analytics",     icon: BarChart3 },
      { path: "/ai-copilot",   label: "AI Copilot",    icon: Sparkles },
      { path: "/regulatory",   label: "Regulatory",    icon: Shield },
      { path: "/ai-audit",     label: "AI Audit",      icon: Shield },
    ],
  },
  {
    id: "system",
    label: "System",
    color: "text-slate-400",
    hoverBg: "hover:bg-slate-500/10",
    activeBg: "bg-slate-500/15 text-slate-300",
    items: [
      { path: "/history",         label: "History",    icon: History },
      { path: "/system-logs",     label: "Logs",       icon: FileText },
      { path: "/admin-settings",  label: "Settings",   icon: Settings },
      { path: "/profile",         label: "Profile",    icon: Users },
      { path: "/agency-settings", label: "Agency",     icon: Settings },
      { path: "/crm",            label: "CRM",        icon: Building2 },
      { path: "/messages",       label: "Messaging",  icon: FileText },
      { path: "/google",         label: "Google",     icon: Globe },
    ],
  },
];

// Quick-access tabs shown directly in the top bar
const QUICK_TABS: NavItem[] = [
  { path: "/",                  label: "Workers",    icon: Users },
  { path: "/payroll",           label: "Payroll",    icon: Calculator },
  { path: "/compliance-alerts", label: "Alerts",     icon: AlertTriangle },
  { path: "/contracts",         label: "Contracts",  icon: FileSignature },
  { path: "/analytics",         label: "Analytics",  icon: BarChart3 },
  { path: "/immigration",       label: "Permits",    icon: Stamp },
];

// Flat list for mobile bottom bar (top 7 most used)
const MOBILE_TABS: NavItem[] = [
  { path: "/",                  label: "Workers",   icon: Users },
  { path: "/payroll",           label: "Payroll",   icon: Calculator },
  { path: "/compliance-alerts", label: "Alerts",    icon: AlertTriangle },
  { path: "/immigration",       label: "Permits",   icon: Stamp },
  { path: "/contracts",         label: "Contracts", icon: FileSignature },
  { path: "/analytics",         label: "Analytics", icon: BarChart3 },
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
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
                {/* Close button */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-700/50">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">All Modules</p>
                  <button onClick={() => setMenuOpen(false)} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="app-mega-menu-grid">
                  {NAV_GROUPS.map(group => (
                    <div key={group.id} className="app-mega-menu-group">
                      <p className={`text-[10px] font-black uppercase tracking-[0.15em] mb-2 ${group.color}`}>
                        {group.label}
                      </p>
                      <div className="space-y-0.5">
                        {group.items.map(item => {
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
                  ))}
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
