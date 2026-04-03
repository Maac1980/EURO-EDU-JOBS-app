import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import {
  Users, Calculator, AlertTriangle, History, Settings, LogOut,
  FileSignature, FileCheck, MapPin, BarChart3, Sparkles,
  Shield, Search, CalendarDays, Clock, Award, TrendingUp,
  Globe, Building2, UserPlus, Briefcase, Receipt, FileText, DollarSign, Stamp,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/payroll",            label: "Payroll",     icon: Calculator },
  { path: "/compliance-alerts",  label: "Alerts",      icon: AlertTriangle },
  { path: "/contracts",          label: "Contracts",   icon: FileSignature },
  { path: "/doc-workflow",       label: "Docs",        icon: FileCheck },
  { path: "/gps-tracking",      label: "GPS",         icon: MapPin },
  { path: "/analytics",         label: "Analytics",   icon: BarChart3 },
  { path: "/ai-copilot",        label: "AI",          icon: Sparkles },
  { path: "/regulatory",        label: "Regulatory",  icon: Shield },
  { path: "/immigration-search",label: "Immigration", icon: Search },
  { path: "/trc-service",       label: "TRC",         icon: FileCheck },
  { path: "/availability",      label: "Avail",       icon: CalendarDays },
  { path: "/shift-schedule",    label: "Shifts",      icon: Clock },
  { path: "/skills-matrix",     label: "Skills",      icon: Award },
  { path: "/salary-benchmark",  label: "Bench",       icon: TrendingUp },
  { path: "/ai-audit",          label: "Audit",       icon: Shield },
  { path: "/history",            label: "History",     icon: History },
  { path: "/admin-settings",    label: "Admin",       icon: Settings },
  { path: "/calculator",        label: "ZUS",         icon: Calculator },
  { path: "/gdpr",              label: "GDPR",        icon: Shield },
  { path: "/posted-workers",    label: "Posted",      icon: Globe },
  { path: "/country-compliance",label: "Countries",   icon: Globe },
  { path: "/hours",             label: "Hours",       icon: Clock },
  { path: "/system-logs",       label: "Logs",        icon: FileText },
  { path: "/clients",           label: "Clients",     icon: Building2 },
  { path: "/pay-transparency",  label: "PayRpt",      icon: BarChart3 },
  { path: "/applications",      label: "Apps",        icon: UserPlus },
  { path: "/job-board",         label: "Jobs",        icon: Briefcase },
  { path: "/invoices",          label: "Invoices",    icon: Receipt },
  { path: "/immigration",       label: "Permits",     icon: Stamp },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();

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

  if (!showShell) return <>{children}</>;

  const isAdmin = user?.role === "Admin";

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  return (
    <div className="app-shell-root">
      {/* ─── Top Navigation Bar ───────────────────────────────────────── */}
      <header className="app-top-bar">
        {/* Brand — click to go home */}
        <div className="app-top-brand cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLocation("/")}>
          <div
            className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #E9FF70, #c8e050)", boxShadow: "0 0 0 2px rgba(233,255,112,0.35), 0 0 10px rgba(233,255,112,0.2)" }}
          >
            <span style={{ fontWeight: 900, fontSize: 11, color: "#111", letterSpacing: -0.5 }}>EEJ</span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold tracking-widest uppercase leading-none" style={{ color: "#E9FF70" }}>Euro Edu Jobs</p>
            <p className="text-[9px] text-slate-400 font-mono tracking-widest uppercase leading-none mt-0.5">Recruitment &amp; Compliance</p>
          </div>
        </div>

        {/* Flat nav pills — horizontal scroll */}
        <nav className="app-top-nav">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = isActive(path);
            return (
              <button key={path} onClick={() => setLocation(path)}
                className={`app-top-nav-item ${active ? "app-top-nav-item--active" : ""}`}>
                <Icon className="w-3 h-3" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: admin settings + user chip */}
        <div className="app-top-right">
          {isAdmin && (
            <button
              onClick={() => setLocation("/admin-settings")}
              title="Ustawienia"
              className={`p-1.5 rounded-lg transition-colors ${
                isActive("/admin-settings")
                  ? "text-white bg-slate-700"
                  : "text-slate-500 hover:text-white hover:bg-white/10"
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-2 pl-2 border-l border-slate-700/60">
            <div className="w-7 h-7 rounded-full bg-lime-400/50 border border-lime-400/30 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-lime-300 font-mono">
                {user?.name?.charAt(0)?.toUpperCase() ?? "A"}
              </span>
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-bold text-white leading-none">{user?.name}</p>
              <p className="text-[10px] text-lime-300 font-mono leading-none mt-0.5">{user?.role}</p>
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

      {/* ─── Mobile Bottom Bar (scrollable for many tabs) ──────────────── */}
      <nav className="app-bottom-bar">
        {NAV_ITEMS.map(({ path, labelKey, icon: Icon }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => setLocation(path)}
              className="flex flex-col items-center justify-center gap-0.5 min-w-[60px] px-1 h-full transition-colors flex-shrink-0"
            >
              <div className={`p-1.5 rounded-xl transition-all ${active ? "bg-lime-400/15" : ""}`}>
                <Icon className={`w-5 h-5 ${active ? "text-[#E9FF70]" : "text-slate-500"}`} />
              </div>
              <span className={`text-[9px] font-mono font-bold uppercase tracking-wide leading-none whitespace-nowrap ${
                active ? "text-[#E9FF70]" : "text-slate-600"
              }`}>
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
