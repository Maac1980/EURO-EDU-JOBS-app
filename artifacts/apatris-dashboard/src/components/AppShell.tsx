import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Users, Calculator, AlertTriangle, History, Settings, LogOut, Bell,
  FileSignature, FileCheck, MapPin, BarChart3, Sparkles,
  Shield, Search, CalendarDays, Clock, Award, TrendingUp,
  Globe, Building2, UserPlus, Briefcase, Receipt, FileText, Stamp, Upload,
} from "lucide-react";

const NAV = [
  { path: "/",                   label: "Home",        icon: BarChart3 },
  { path: "/candidates",        label: "Candidates",  icon: Users },
  { path: "/job-board",         label: "Jobs",        icon: Briefcase },
  { path: "/ats-pipeline",      label: "ATS",         icon: UserPlus },
  { path: "/applications",      label: "Apps",        icon: UserPlus },
  { path: "/interviews",        label: "Interviews",  icon: CalendarDays },
  { path: "/clients",           label: "Clients",     icon: Building2 },
  { path: "/payroll",            label: "Payroll",    icon: Calculator },
  { path: "/calculator",        label: "ZUS Calc",    icon: Calculator },
  { path: "/invoices",          label: "Invoices",    icon: Receipt },
  { path: "/contracts",          label: "Contracts",  icon: FileSignature },
  { path: "/compliance-alerts",  label: "Alerts",     icon: AlertTriangle },
  { path: "/doc-workflow",       label: "Docs",       icon: FileCheck },
  { path: "/regulatory",        label: "Regulatory",  icon: Shield },
  { path: "/immigration-search",label: "Immigration", icon: Search },
  { path: "/immigration",       label: "Permits",     icon: Stamp },
  { path: "/trc-service",       label: "TRC",         icon: FileCheck },
  { path: "/gps-tracking",      label: "GPS",         icon: MapPin },
  { path: "/availability",      label: "Avail",       icon: CalendarDays },
  { path: "/shift-schedule",    label: "Shifts",      icon: Clock },
  { path: "/skills-matrix",     label: "Skills",      icon: Award },
  { path: "/salary-benchmark",  label: "Bench",       icon: TrendingUp },
  { path: "/analytics",         label: "Analytics",   icon: BarChart3 },
  { path: "/ai-copilot",        label: "AI",          icon: Sparkles },
  { path: "/ai-audit",          label: "Audit",       icon: Shield },
  { path: "/gdpr",              label: "GDPR",        icon: Shield },
  { path: "/pay-transparency",  label: "PayRpt",      icon: BarChart3 },
  { path: "/hours",             label: "Hours",       icon: Clock },
  { path: "/bulk-upload",       label: "Upload",      icon: Upload },
  { path: "/history",            label: "History",    icon: History },
  { path: "/posted-workers",    label: "Posted",      icon: Globe },
  { path: "/country-compliance",label: "Countries",   icon: Globe },
  { path: "/system-logs",       label: "Logs",        icon: FileText },
  { path: "/profile",           label: "Profile",     icon: Users },
  { path: "/agency-settings",   label: "Agency",      icon: Settings },
  { path: "/admin-settings",    label: "Admin",       icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  const isPublicRoute = location === "/login" || location.startsWith("/apply") || location.startsWith("/worker-upload") || location === "/pricing";
  const showShell = isAuthenticated && !isPublicRoute;

  useEffect(() => {
    if (showShell) document.body.classList.add("has-app-shell");
    else document.body.classList.remove("has-app-shell");
    return () => document.body.classList.remove("has-app-shell");
  }, [showShell]);

  if (!showShell) return <>{children}</>;

  const isActive = (path: string) => path === "/" ? location === "/" : location.startsWith(path);

  return (
    <div className="app-shell-root">
      <header className="app-top-bar">
        {/* Brand */}
        <div className="app-top-brand cursor-pointer" onClick={() => setLocation("/")}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#d4e84b", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontWeight: 900, fontSize: 12, color: "#0b101e", letterSpacing: -0.5 }}>EEJ</span>
          </div>
          <div className="hidden sm:block">
            <p style={{ fontSize: 12, fontWeight: 700, color: "#d4e84b", letterSpacing: "0.1em", lineHeight: 1, margin: 0 }}>EURO EDU JOBS</p>
            <p style={{ fontSize: 9, color: "#7a8599", letterSpacing: "0.08em", lineHeight: 1, marginTop: 3 }}>Recruitment & Compliance</p>
          </div>
        </div>

        {/* Nav pills */}
        <nav className="app-top-nav">
          {NAV.map(({ path, label, icon: Icon }) => (
            <button key={path} onClick={() => setLocation(path)}
              className={`app-top-nav-item ${isActive(path) ? "app-top-nav-item--active" : ""}`}>
              <Icon style={{ width: 13, height: 13 }} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Right — user + logout */}
        <div className="app-top-right">
          <button onClick={() => setLocation("/compliance-alerts")} style={{ background: "none", border: "none", color: "#7a8599", cursor: "pointer", padding: 4, position: "relative" }}>
            <Bell style={{ width: 16, height: 16 }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 8, borderLeft: "1px solid rgba(212,232,75,0.1)" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(212,232,75,0.15)", border: "1px solid rgba(212,232,75,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#d4e84b" }}>{user?.name?.charAt(0) ?? "A"}</span>
            </div>
            <div className="hidden md:block">
              <p style={{ fontSize: 11, fontWeight: 700, color: "#dde4f0", lineHeight: 1, margin: 0 }}>Anna Bondarenko</p>
              <p style={{ fontSize: 9, color: "#d4e84b", fontWeight: 600, lineHeight: 1, marginTop: 2 }}>ADMIN</p>
            </div>
            <button onClick={logout} style={{ background: "none", border: "none", color: "#7a8599", cursor: "pointer", padding: 4 }} title="Logout">
              <LogOut style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>
      </header>

      <div className="app-content-wrapper">{children}</div>
    </div>
  );
}
