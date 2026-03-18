import { OWNER_STATS } from "@/data/mockData";

export default function OwnerHome() {
  return (
    <div className="tab-page">
      {/* Greeting */}
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Good morning</div>
          <div className="tab-greeting-name">Owner Dashboard</div>
        </div>
        <div className="tab-greeting-date">{formatDate()}</div>
      </div>

      {/* Primary KPI Row */}
      <div className="kpi-row">
        <div className="kpi-card kpi-navy">
          <div className="kpi-value">{OWNER_STATS.totalCandidates}</div>
          <div className="kpi-label">Total Candidates</div>
        </div>
        <div className="kpi-card kpi-yellow">
          <div className="kpi-value" style={{ color: "#1B2A4A" }}>{OWNER_STATS.placementPct}%</div>
          <div className="kpi-label" style={{ color: "#1B2A4A" }}>Placement Rate</div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="section-label">Overview</div>
      <div className="summary-grid">
        <SummaryCard
          icon="🕐"
          value={OWNER_STATS.pendingReviews}
          label="Pending Reviews"
          accent="#F59E0B"
          bg="#FFFBEB"
        />
        <SummaryCard
          icon="✈️"
          value={OWNER_STATS.activeDeployments}
          label="Active Deployments"
          accent="#10B981"
          bg="#ECFDF5"
        />
      </div>

      {/* Revenue Card */}
      <div className="section-label">Monthly Revenue</div>
      <div className="revenue-card">
        <div className="revenue-left">
          <div className="revenue-amount">zł {OWNER_STATS.monthlyRevenue}</div>
          <div className="revenue-sub">March 2026 · Projected</div>
        </div>
        <div className="revenue-badge">
          <span>▲ 12%</span>
        </div>
      </div>

      {/* Quick Status */}
      <div className="section-label">Document Health</div>
      <div className="health-bar-card">
        <div className="health-bar-row">
          <span className="health-bar-legend green-dot">Cleared</span>
          <span className="health-bar-pct">62%</span>
        </div>
        <div className="health-track">
          <div className="health-fill green-fill" style={{ width: "62%" }} />
        </div>
        <div className="health-bar-row" style={{ marginTop: 10 }}>
          <span className="health-bar-legend amber-dot">Expiring Soon</span>
          <span className="health-bar-pct">21%</span>
        </div>
        <div className="health-track">
          <div className="health-fill amber-fill" style={{ width: "21%" }} />
        </div>
        <div className="health-bar-row" style={{ marginTop: 10 }}>
          <span className="health-bar-legend red-dot">Action Required</span>
          <span className="health-bar-pct">17%</span>
        </div>
        <div className="health-track">
          <div className="health-fill red-fill" style={{ width: "17%" }} />
        </div>
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}

function SummaryCard({ icon, value, label, accent, bg }: {
  icon: string; value: number; label: string; accent: string; bg: string;
}) {
  return (
    <div className="summary-card" style={{ background: bg, borderColor: accent + "40" }}>
      <div className="summary-card-icon">{icon}</div>
      <div className="summary-card-value" style={{ color: accent }}>{value}</div>
      <div className="summary-card-label">{label}</div>
    </div>
  );
}

function formatDate() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
