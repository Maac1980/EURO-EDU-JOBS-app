import { MANAGER_ALERTS } from "@/data/mockData";

export default function ManagerHome() {
  return (
    <div className="tab-page">
      {/* Greeting */}
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Legality & Deployment</div>
          <div className="tab-greeting-name">Alert Centre</div>
        </div>
        <div className="alert-total-badge">
          {MANAGER_ALERTS.visaExpiring.length + MANAGER_ALERTS.missingPassports.length} Active
        </div>
      </div>

      {/* SECTION: Visa / TRC Expiring */}
      <div className="alert-section-header amber">
        <span className="alert-section-icon">🕐</span>
        <span>Visa / TRC Expiring</span>
        <span className="alert-count amber-count">{MANAGER_ALERTS.visaExpiring.length}</span>
      </div>
      <div className="alert-list">
        {MANAGER_ALERTS.visaExpiring.map((a, i) => (
          <div key={i} className="alert-card amber-card">
            <div className="alert-card-left">
              <div className="alert-card-name">{a.name}</div>
              <div className="alert-card-meta">{a.type}</div>
            </div>
            <div className={`alert-days-badge ${a.daysLeft <= 10 ? "red-badge" : "amber-badge"}`}>
              {a.daysLeft}d left
            </div>
          </div>
        ))}
      </div>

      {/* SECTION: Missing Passports */}
      <div className="alert-section-header red" style={{ marginTop: 20 }}>
        <span className="alert-section-icon">🚨</span>
        <span>Missing Passports / IDs</span>
        <span className="alert-count red-count">{MANAGER_ALERTS.missingPassports.length}</span>
      </div>
      <div className="alert-list">
        {MANAGER_ALERTS.missingPassports.map((a, i) => (
          <div key={i} className="alert-card red-card">
            <div className="alert-card-left">
              <div className="alert-card-name">{a.name}</div>
              <div className="alert-card-meta">{a.missing}</div>
            </div>
            <div className="alert-action-btn">Chase →</div>
          </div>
        ))}
      </div>

      {/* SECTION: Work Permit Status */}
      <div className="alert-section-header green" style={{ marginTop: 20 }}>
        <span className="alert-section-icon">📋</span>
        <span>Work Permit Status</span>
        <span className="alert-count green-count">{MANAGER_ALERTS.workPermits.length}</span>
      </div>
      <div className="alert-list">
        {MANAGER_ALERTS.workPermits.map((a, i) => (
          <div key={i} className="alert-card permit-card">
            <div className="alert-card-name">{a.name}</div>
            <div className={`permit-status-badge ${a.status === "approved" ? "green-badge" : "amber-badge"}`}>
              {a.status === "approved" ? "✓ Approved" : "⏳ Pending"}
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}
