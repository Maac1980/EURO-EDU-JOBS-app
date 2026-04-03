import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, ShieldAlert, FileCheck2, UserPlus } from "lucide-react";
import { COMPLIANCE_ALERTS } from "@/data/mockData";
import { useCandidates } from "@/lib/candidateContext";
import PlatformModules from "@/components/PlatformModules";
import AddCandidateModal from "@/components/AddCandidateModal";
import ModuleSheet from "@/components/ModuleSheet";
import type { ModuleId } from "@/components/PlatformModules";

export default function LegalHome() {
  const [showAdd,    setShowAdd]    = useState(false);
  const [openModule, setOpenModule] = useState<ModuleId | null>(null);
  const { candidates, loading } = useCandidates();

  const alerts = useMemo(() => {
    if (candidates.length === 0) return COMPLIANCE_ALERTS;
    const today = new Date();
    const visaExpiring = candidates
      .filter(c => c.visaDaysLeft !== undefined && c.visaDaysLeft > 0 && c.visaDaysLeft <= 60)
      .map(c => ({ name: c.name, daysLeft: c.visaDaysLeft!, type: c.visaType ?? "Visa" }));
    // Also check TRC expiry
    candidates.forEach(c => {
      if (c.trcExpiry) {
        const days = Math.ceil((new Date(c.trcExpiry).getTime() - today.getTime()) / 86_400_000);
        if (days > 0 && days <= 60 && !visaExpiring.find(v => v.name === c.name)) {
          visaExpiring.push({ name: c.name, daysLeft: days, type: "TRC Residence" });
        }
      }
    });
    const missingPassports = candidates
      .filter(c => c.documents.some(d => d.name.toLowerCase().includes("passport") && (d.status === "missing" || d.status === "rejected")))
      .map(c => ({ name: c.name, missing: "Passport / ID" }));
    const workPermits = candidates
      .filter(c => c.documents.some(d => d.name.toLowerCase().includes("work permit")))
      .map(c => {
        const wp = c.documents.find(d => d.name.toLowerCase().includes("work permit"));
        return { name: c.name, status: (wp?.status === "approved" ? "approved" : "pending") as "approved" | "pending" };
      });
    return { visaExpiring, missingPassports, workPermits };
  }, [candidates]);

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 2 · Legal & Compliance</div>
          <div className="tab-greeting-name">Alert Centre</div>
        </div>
        <div className="alert-total-badge">
          {alerts.visaExpiring.length + COMPLIANCE_ALERTS.missingPassports.length} Active
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
        <span className="alert-count amber-count">{alerts.visaExpiring.length}</span>
      </div>
      <div className="alert-list">
        {alerts.visaExpiring.map((a, i) => (
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
        <span className="alert-count red-count">{alerts.missingPassports.length}</span>
      </div>
      <div className="alert-list">
        {alerts.missingPassports.map((a, i) => (
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
        <span className="alert-count green-count">{alerts.workPermits.length}</span>
      </div>
      <div className="alert-list">
        {alerts.workPermits.map((a, i) => (
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
        onOpen={setOpenModule}
      />

      <div style={{ height: 100 }} />
      {showAdd    && <AddCandidateModal onClose={() => setShowAdd(false)} />}
      {openModule && <ModuleSheet moduleId={openModule} onClose={() => setOpenModule(null)} />}
    </div>
  );
}
