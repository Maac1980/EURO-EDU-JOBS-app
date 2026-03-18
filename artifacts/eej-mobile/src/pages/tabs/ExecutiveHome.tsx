import { useState } from "react";
import {
  Users,
  TrendingUp,
  Clock,
  Plane,
  FileText,
  ArrowUpRight,
  UserPlus,
  ShieldCheck,
} from "lucide-react";
import { EXEC_STATS } from "@/data/mockData";
import PlatformModules from "@/components/PlatformModules";
import AddCandidateModal from "@/components/AddCandidateModal";
import AddUserModal from "@/components/AddUserModal";

export default function ExecutiveHome() {
  const [showAdd,     setShowAdd]     = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 1 · Full Access</div>
          <div className="tab-greeting-name">Executive Overview</div>
        </div>
        <div className="tab-greeting-date">{formatDate()}</div>
      </div>

      {/* Quick Actions Row */}
      <button className="ops-add-btn" style={{ margin: "0 0 8px" }} onClick={() => setShowAdd(true)}>
        <div className="ops-add-icon">
          <UserPlus size={20} color="#1B2A4A" strokeWidth={2.5} />
        </div>
        <div className="ops-add-text">
          <div className="ops-add-title">Add New Candidate</div>
          <div className="ops-add-sub">Register to the workforce pipeline</div>
        </div>
        <div className="ops-add-arrow">+</div>
      </button>

      {/* ── Add User button — T1 only ── */}
      <button className="ops-add-btn" style={{ margin: "0 0 4px", background: "#F0F4FF", border: "1.5px solid #C7D2FE" }} onClick={() => setShowAddUser(true)}>
        <div className="ops-add-icon" style={{ background: "#EEF2FF" }}>
          <ShieldCheck size={20} color="#6366F1" strokeWidth={2.5} />
        </div>
        <div className="ops-add-text">
          <div className="ops-add-title" style={{ color: "#4338CA" }}>Manage Staff Accounts</div>
          <div className="ops-add-sub">Add / remove system users via Airtable</div>
        </div>
        <div className="ops-add-arrow" style={{ color: "#6366F1" }}>+</div>
      </button>

      {/* KPI Row */}
      <div className="kpi-row">
        <div className="kpi-card kpi-navy">
          <div className="kpi-icon-row">
            <Users size={16} color="rgba(255,255,255,0.5)" strokeWidth={2} />
          </div>
          <div className="kpi-value">{EXEC_STATS.totalCandidates}</div>
          <div className="kpi-label">Total Candidates</div>
        </div>
        <div className="kpi-card kpi-yellow">
          <div className="kpi-icon-row">
            <TrendingUp size={16} color="rgba(27,42,74,0.5)" strokeWidth={2} />
          </div>
          <div className="kpi-value" style={{ color: "#1B2A4A" }}>{EXEC_STATS.placementPct}%</div>
          <div className="kpi-label" style={{ color: "#1B2A4A" }}>Placement Rate</div>
        </div>
      </div>

      {/* Ops Summary */}
      <div className="section-label">Operations at a Glance</div>
      <div className="summary-grid">
        <SummaryCard Icon={Clock}    value={EXEC_STATS.pendingReviews}    label="Pending Reviews"    accent="#F59E0B" bg="#FFFBEB" />
        <SummaryCard Icon={Plane}    value={EXEC_STATS.activeDeployments} label="Active Deployments" accent="#10B981" bg="#ECFDF5" />
        <SummaryCard Icon={FileText} value={EXEC_STATS.b2bContracts}      label="B2B Contracts"      accent="#6366F1" bg="#EEF2FF" />
        <SummaryCard Icon={Users}    value={EXEC_STATS.totalCandidates}   label="Workforce Pool"     accent="#1B2A4A" bg="#F0F4FF" />
      </div>

      {/* 🔒 FINANCIAL — Tier 1 Only */}
      <div className="section-label">
        Monthly Revenue
        <span className="access-badge access-t1">Tier 1 Only</span>
      </div>
      <div className="revenue-card">
        <div className="revenue-left">
          <div className="revenue-amount">zł {EXEC_STATS.monthlyRevenue}</div>
          <div className="revenue-sub">March 2026 · Projected</div>
        </div>
        <div className="revenue-badge">
          <ArrowUpRight size={12} />
          <span>12%</span>
        </div>
      </div>

      <div className="section-label">
        ZUS & Payroll Exposure
        <span className="access-badge access-t1">Tier 1 Only</span>
      </div>
      <div className="zus-row">
        <div className="zus-card">
          <div className="zus-label">ZUS Liability</div>
          <div className="zus-value">zł {EXEC_STATS.zusLiability}</div>
          <div className="zus-sub">Mar 2026 · 47 workers</div>
        </div>
        <div className="zus-card zus-card-alt">
          <div className="zus-label">Rate (Zlecenie)</div>
          <div className="zus-value">11.26%</div>
          <div className="zus-sub">Social + pension</div>
        </div>
      </div>

      {/* Document Health */}
      <div className="section-label">Document Health</div>
      <div className="health-bar-card">
        <HealthBar label="Cleared"         pct={62} cls="green-dot" fillCls="green-fill" />
        <HealthBar label="Expiring Soon"   pct={21} cls="amber-dot" fillCls="amber-fill" />
        <HealthBar label="Action Required" pct={17} cls="red-dot"   fillCls="red-fill"   />
      </div>

      {/* ── PLATFORM MODULES — Tier 1 (ZUS included) ── */}
      <div className="section-label">
        Platform Modules
        <span className="access-badge access-t1">Tier 1 Only</span>
      </div>
      <PlatformModules
        modules={["zus-ledger", "timesheets", "pip-compliance", "b2b-contracts", "bhp-medical"]}
      />

      <div style={{ height: 100 }} />
      {showAdd     && <AddCandidateModal onClose={() => setShowAdd(false)} />}
      {showAddUser && <AddUserModal      onClose={() => setShowAddUser(false)} />}
    </div>
  );
}

function SummaryCard({ Icon, value, label, accent, bg }: {
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  value: number; label: string; accent: string; bg: string;
}) {
  return (
    <div className="summary-card" style={{ background: bg, borderColor: accent + "40" }}>
      <Icon size={18} color={accent} strokeWidth={2} />
      <div className="summary-card-value" style={{ color: accent }}>{value}</div>
      <div className="summary-card-label">{label}</div>
    </div>
  );
}

function HealthBar({ label, pct, cls, fillCls }: { label: string; pct: number; cls: string; fillCls: string }) {
  return (
    <>
      <div className="health-bar-row" style={{ marginTop: 10 }}>
        <span className={`health-bar-legend ${cls}`}>{label}</span>
        <span className="health-bar-pct">{pct}%</span>
      </div>
      <div className="health-track">
        <div className={`health-fill ${fillCls}`} style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

function formatDate() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
