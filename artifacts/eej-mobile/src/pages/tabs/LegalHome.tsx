import { useState } from "react";
import { AlertTriangle, ShieldAlert, FileCheck2, UserPlus } from "lucide-react";
import { COMPLIANCE_ALERTS } from "@/data/mockData";
import PlatformModules from "@/components/PlatformModules";
import AddCandidateModal from "@/components/AddCandidateModal";

export default function LegalHome() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 2 · Legal & Compliance</div>
          <div className="tab-greeting-name">Alert Centre</div>
        </div>
        <div className="alert-total-badge">
          {COMPLIANCE_ALERTS.visaExpiring.length + COMPLIANCE_ALERTS.missingPassports.length} Active
        </div>
      </div>

      {/* Quick Action — Add Candidate */}
      <button className="ops-add-btn" style={{ margin: "0 0 12px" }} onClick={() => setShowAdd(true)}>
        <div className="ops-add-icon">
          <UserPlus size={20} color="#1B2A4A" strokeWidth={2.5} />
        </div>
        <div className="ops-add-text">
          <div className="ops-add-title">Add New Candidate</div>
          <div className="ops-add-sub">Register to the workforce pipeline</div>
        </div>
        <div className="ops-add-arrow">+</div>
      </button>

      {/* Visa / TRC Expiring */}
      <div className="alert-section-header amber">
        <AlertTriangle size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span>Visa / TRC Expiring</span>
        <span className="alert-count amber-count">{COMPLIANCE_ALERTS.visaExpiring.length}</span>
      </div>
      <div className="alert-list">
        {COMPLIANCE_ALERTS.visaExpiring.map((a, i) => (
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

      {/* Missing Passports */}
      <div className="alert-section-header red" style={{ marginTop: 20 }}>
        <ShieldAlert size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span>Missing Passports / IDs</span>
        <span className="alert-count red-count">{COMPLIANCE_ALERTS.missingPassports.length}</span>
      </div>
      <div className="alert-list">
        {COMPLIANCE_ALERTS.missingPassports.map((a, i) => (
          <div key={i} className="alert-card red-card">
            <div className="alert-card-left">
              <div className="alert-card-name">{a.name}</div>
              <div className="alert-card-meta">{a.missing}</div>
            </div>
            <div className="alert-action-btn">Chase →</div>
          </div>
        ))}
      </div>

      {/* Work Permit Status */}
      <div className="alert-section-header green" style={{ marginTop: 20 }}>
        <FileCheck2 size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span>Work Permit Status</span>
        <span className="alert-count green-count">{COMPLIANCE_ALERTS.workPermits.length}</span>
      </div>
      <div className="alert-list">
        {COMPLIANCE_ALERTS.workPermits.map((a, i) => (
          <div key={i} className="alert-card permit-card">
            <div className="alert-card-name">{a.name}</div>
            <div className={`permit-status-badge ${a.status === "approved" ? "green-badge" : "amber-badge"}`}>
              {a.status === "approved" ? "✓ Approved" : "⏳ Pending"}
            </div>
          </div>
        ))}
      </div>

      {/* ── PLATFORM MODULES — Tier 2 (NO ZUS & Ledger) ── */}
      <div className="section-label" style={{ marginTop: 20 }}>Platform Modules</div>
      <PlatformModules
        modules={["timesheets", "pip-compliance", "b2b-contracts", "bhp-medical", "candidate-pipeline"]}
      />

      <div style={{ height: 100 }} />
      {showAdd && <AddCandidateModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
