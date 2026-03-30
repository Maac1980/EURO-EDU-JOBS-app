import {
  Briefcase, Columns3, Calendar, FileText, Receipt,
  Scale, Search, FileCheck, MapPin, Calculator,
  User, Settings, UserPlus,
  CalendarDays, Clock, BarChart3, Award, TrendingUp,
} from "lucide-react";
import type { ActiveTab } from "@/types";

interface Props {
  onNavigate: (tab: ActiveTab) => void;
}

const MODULES: { id: ActiveTab; label: string; sub: string; Icon: any; color: string; bg: string }[] = [
  { id: "applications",label: "Applications",           sub: "New candidate applications", Icon: UserPlus,   color: "#059669", bg: "#ECFDF5" },
  { id: "jobs",        label: "Job Board",              sub: "Browse & post jobs",         Icon: Briefcase,  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "ats",         label: "ATS Pipeline",           sub: "Kanban recruitment",         Icon: Columns3,   color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "interviews",  label: "Interviews",             sub: "Schedule & track",           Icon: Calendar,   color: "#0EA5E9", bg: "#F0F9FF" },
  { id: "contracts",   label: "Contracts",              sub: "Generate Polish contracts",  Icon: FileText,   color: "#059669", bg: "#ECFDF5" },
  { id: "invoices",    label: "Invoices",               sub: "Billing & Faktura VAT",      Icon: Receipt,    color: "#D97706", bg: "#FFFBEB" },
  { id: "regulatory",  label: "Regulatory Intel",       sub: "Law changes & fines",        Icon: Scale,      color: "#DC2626", bg: "#FEF2F2" },
  { id: "immigration", label: "Immigration Search",     sub: "AI-powered legal search",    Icon: Search,     color: "#1B2A4A", bg: "#F0F4FF" },
  { id: "permits",     label: "Work Permits",           sub: "Track applications",         Icon: FileCheck,  color: "#7C3AED", bg: "#F5F3FF" },
  { id: "trc",         label: "TRC Service",             sub: "Residence card management",  Icon: Scale,      color: "#7C3AED", bg: "#F5F3FF" },
  { id: "gps",         label: "GPS Tracking",           sub: "Worker locations",           Icon: MapPin,     color: "#10B981", bg: "#ECFDF5" },
  { id: "calculator",  label: "ZUS Calculator",         sub: "Salary & tax calc",          Icon: Calculator, color: "#6366F1", bg: "#EEF2FF" },
  { id: "availability",label: "Availability",             sub: "Worker calendar",            Icon: CalendarDays,color: "#0EA5E9", bg: "#F0F9FF" },
  { id: "shifts",      label: "Shifts",                   sub: "Schedule workers",           Icon: Clock,      color: "#F59E0B", bg: "#FFFBEB" },
  { id: "paytransparency",label: "Pay Report",             sub: "Transparency compliance",    Icon: BarChart3,  color: "#10B981", bg: "#ECFDF5" },
  { id: "skills",      label: "Skills",                   sub: "Worker assessments",         Icon: Award,      color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "benchmark",   label: "Salary Benchmark",         sub: "Market rate comparison",     Icon: TrendingUp, color: "#DC2626", bg: "#FEF2F2" },
  { id: "profile",     label: "Profile & Settings",     sub: "Account & permissions",      Icon: User,       color: "#1B2A4A", bg: "#F0F4FF" },
];

export default function MoreTab({ onNavigate }: Props) {
  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">All Features</div>
          <div className="tab-greeting-name">Platform Modules</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {MODULES.map(({ id, label, sub, Icon, color, bg }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            style={{
              background: bg,
              border: `1.5px solid ${color}20`,
              borderRadius: 14,
              padding: "16px 12px",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              transition: "transform 0.1s",
            }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={20} color={color} strokeWidth={2} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{label}</div>
            <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.3 }}>{sub}</div>
          </button>
        ))}
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}
