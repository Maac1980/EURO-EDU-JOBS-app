import type { ActiveTab } from "@/types";
import {
  LayoutDashboard, Users, Briefcase, Columns3, UserPlus, Calendar,
  FileText, Receipt, Scale, Search, FileCheck, MapPin, Calculator,
  DollarSign, Clock, BarChart3, Award, TrendingUp, Building2,
  CreditCard, Shield, Lock, Settings, User, ChevronLeft, ChevronRight,
  Bell, LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface SidebarProps {
  active: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: typeof LayoutDashboard;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { id: "home", label: "Dashboard", icon: LayoutDashboard },
      { id: "alerts", label: "Alerts", icon: Bell },
    ],
  },
  {
    title: "Recruitment",
    items: [
      { id: "jobs", label: "Job Board", icon: Briefcase },
      { id: "ats", label: "ATS Pipeline", icon: Columns3 },
      { id: "applications", label: "Applications", icon: UserPlus },
      { id: "interviews", label: "Interviews", icon: Calendar },
    ],
  },
  {
    title: "Workers",
    items: [
      { id: "candidates", label: "Candidates", icon: Users },
      { id: "trc", label: "TRC Service", icon: FileCheck },
      { id: "permits", label: "Work Permits", icon: Scale },
      { id: "gps", label: "GPS Tracking", icon: MapPin },
      { id: "availability", label: "Availability", icon: Clock },
      { id: "shifts", label: "Shift Schedule", icon: Clock },
    ],
  },
  {
    title: "Finance",
    items: [
      { id: "netperhour", label: "Net Per Hour", icon: DollarSign },
      { id: "calculator", label: "ZUS Calculator", icon: Calculator },
      { id: "payroll", label: "Payroll Ledger", icon: Calculator },
      { id: "invoices", label: "Invoices", icon: Receipt },
      { id: "clients", label: "Clients", icon: Building2 },
    ],
  },
  {
    title: "Compliance",
    items: [
      { id: "regulatory", label: "Regulatory Intel", icon: Scale },
      { id: "immigration", label: "Immigration Search", icon: Search },
      { id: "gdpr", label: "GDPR", icon: Lock },
      { id: "aiaudit", label: "AI Audit Trail", icon: Shield },
    ],
  },
  {
    title: "Reports",
    items: [
      { id: "contracts", label: "Contracts", icon: FileText },
      { id: "paytransparency", label: "Pay Report", icon: BarChart3 },
      { id: "skills", label: "Skills Assessment", icon: Award },
      { id: "benchmark", label: "Salary Benchmark", icon: TrendingUp },
    ],
  },
  {
    title: "Settings",
    items: [
      { id: "pricing", label: "Pricing & Plans", icon: CreditCard },
      { id: "agency", label: "Agency Settings", icon: Settings },
      { id: "profile", label: "Profile", icon: User },
    ],
  },
];

export default function Sidebar({ active, onNavigate, collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth();

  return (
    <aside
      style={{
        width: collapsed ? 64 : 250,
        minWidth: collapsed ? 64 : 250,
        height: "100vh",
        background: "#0a0c10",
        borderRight: "1px solid rgba(233,255,112,0.08)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s, min-width 0.2s",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: collapsed ? "16px 12px" : "20px 16px",
          borderBottom: "1px solid rgba(233,255,112,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 64,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #E9FF70, #c8e050)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 14,
            color: "#111",
            flexShrink: 0,
          }}
        >
          EEJ
        </div>
        {!collapsed && (
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#E9FF70", whiteSpace: "nowrap" }}>Euro Edu Jobs</div>
            <div style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{user?.designation ?? "Portal"}</div>
          </div>
        )}
      </div>

      {/* User info */}
      {!collapsed && user && (
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(233,255,112,0.05)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#1a1d24",
              border: "1px solid rgba(233,255,112,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "#E9FF70",
            }}
          >
            {user.shortName?.charAt(0) ?? "U"}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{user.shortName}</div>
            <div style={{ fontSize: 11, color: "#6B7280" }}>T{user.tier} {user.role}</div>
          </div>
        </div>
      )}

      {/* Nav sections */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "8px 0",
        }}
      >
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: 4 }}>
            {!collapsed && (
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#4B5563",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                {section.title}
              </div>
            )}
            {section.items.map(({ id, label, icon: Icon }) => {
              const isActive = active === id;
              return (
                <button
                  key={id}
                  onClick={() => onNavigate(id)}
                  title={collapsed ? label : undefined}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: collapsed ? "8px 0" : "7px 16px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    background: isActive ? "rgba(233,255,112,0.08)" : "transparent",
                    border: "none",
                    borderLeft: isActive ? "3px solid #E9FF70" : "3px solid transparent",
                    color: isActive ? "#E9FF70" : "#9CA3AF",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    transition: "all 0.15s",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                      e.currentTarget.style.color = "#e5e7eb";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#9CA3AF";
                    }
                  }}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  {!collapsed && label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: collapse toggle + logout */}
      <div
        style={{
          borderTop: "1px solid rgba(233,255,112,0.08)",
          padding: "8px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <button
          onClick={onToggle}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10,
            padding: "8px",
            background: "transparent",
            border: "none",
            color: "#6B7280",
            cursor: "pointer",
            fontSize: 12,
            width: "100%",
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> Collapse</>}
        </button>
        <button
          onClick={logout}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10,
            padding: "8px",
            background: "transparent",
            border: "none",
            color: "#EF4444",
            cursor: "pointer",
            fontSize: 12,
            width: "100%",
          }}
        >
          <LogOut size={16} />
          {!collapsed && "Logout"}
        </button>
      </div>
    </aside>
  );
}
