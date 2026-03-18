import { AlertTriangle, ShieldAlert, FileCheck2, Bell, Clock, CheckCircle2, DollarSign } from "lucide-react";
import { COMPLIANCE_ALERTS, MOCK_CANDIDATES } from "@/data/mockData";
import type { Role } from "@/types";

const TODAY = new Date();
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - TODAY.getTime()) / 86_400_000);
}

interface Props { role: Role; }

export default function AlertsTab({ role }: Props) {
  if (role === "executive") return <ExecutiveAlerts />;
  if (role === "legal")     return <LegalAlerts />;
  if (role === "operations") return <OpsAlerts />;
  return null;
}

/* ── T1 Executive Alerts ── */
function ExecutiveAlerts() {
  const financialAlerts = MOCK_CANDIDATES.filter(c =>
    c.zusStatus?.toLowerCase().includes("pending") || c.zusStatus?.toLowerCase().includes("incomplete")
  );
  const expiringDocs = MOCK_CANDIDATES.flatMap(c => {
    const alerts: { name: string; doc: string; days: number }[] = [];
    const d1 = daysUntil(c.trcExpiry);
    const d2 = daysUntil(c.workPermitExpiry);
    if (d1 !== null && d1 < 60)  alerts.push({ name: c.name, doc: "TRC Residence Card", days: d1 });
    if (d2 !== null && d2 < 60)  alerts.push({ name: c.name, doc: "Work Permit",         days: d2 });
    return alerts;
  });

  const totalAlerts = COMPLIANCE_ALERTS.visaExpiring.length + COMPLIANCE_ALERTS.missingPassports.length + financialAlerts.length;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 1 · Executive</div>
          <div className="tab-greeting-name">Compliance Alerts</div>
        </div>
        <div className="alert-total-badge">{totalAlerts} Active</div>
      </div>

      {/* Document Expiry Alerts */}
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

      {/* Missing Documents */}
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

      {/* ZUS / Financial Alerts (T1 only) */}
      <div className="alert-section-header" style={{ marginTop: 20, background: "#EEF2FF", color: "#4338CA", borderColor: "#C7D2FE" }}>
        <DollarSign size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span>ZUS Registration Incomplete</span>
        <span className="alert-count" style={{ background: "#EEF2FF", color: "#4338CA", border: "1.5px solid #A5B4FC" }}>{financialAlerts.length}</span>
      </div>
      <div className="alert-list">
        {financialAlerts.length === 0 ? (
          <div className="alert-card" style={{ background: "#ECFDF5", border: "1.5px solid #6EE7B7" }}>
            <div className="alert-card-left">
              <div className="alert-card-name" style={{ color: "#059669" }}>All ZUS registrations current</div>
            </div>
            <CheckCircle2 size={16} color="#059669" strokeWidth={2.5} />
          </div>
        ) : financialAlerts.map((c, i) => (
          <div key={i} className="alert-card" style={{ background: "#EEF2FF", border: "1.5px solid #C7D2FE" }}>
            <div className="alert-card-left">
              <div className="alert-card-name">{c.name}</div>
              <div className="alert-card-meta">{c.zusStatus}</div>
            </div>
            <div className="alert-action-btn" style={{ background: "#EEF2FF", color: "#4338CA", border: "1.5px solid #A5B4FC" }}>Review</div>
          </div>
        ))}
      </div>

      {/* Expiry Timeline */}
      {expiringDocs.length > 0 && (
        <>
          <div className="alert-section-header" style={{ marginTop: 20, background: "#F9FAFB", color: "#6B7280", borderColor: "#E5E7EB" }}>
            <Clock size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span>Document Expiry Timeline</span>
            <span className="alert-count" style={{ background: "#F9FAFB", color: "#6B7280", border: "1.5px solid #E5E7EB" }}>{expiringDocs.length}</span>
          </div>
          <div className="alert-list">
            {expiringDocs.map((item, i) => (
              <div key={i} className="alert-card" style={{ background: "#FAFAFA", border: "1.5px solid #E5E7EB" }}>
                <div className="alert-card-left">
                  <div className="alert-card-name">{item.name}</div>
                  <div className="alert-card-meta">{item.doc}</div>
                </div>
                <div className={`alert-days-badge ${item.days < 0 ? "red-badge" : item.days <= 14 ? "red-badge" : "amber-badge"}`}>
                  {item.days < 0 ? "EXPIRED" : `${item.days}d`}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}

/* ── T2 Legal Alerts — same data as LegalHome ── */
function LegalAlerts() {
  const total = COMPLIANCE_ALERTS.visaExpiring.length + COMPLIANCE_ALERTS.missingPassports.length;
  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 2 · Legal & Compliance</div>
          <div className="tab-greeting-name">Alert Centre</div>
        </div>
        <div className="alert-total-badge">{total} Active</div>
      </div>

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
      <div style={{ height: 100 }} />
    </div>
  );
}

/* ── T3 Operations Alerts ── */
function OpsAlerts() {
  const needsDocs = MOCK_CANDIDATES.filter(c => c.status === "missing" || c.status === "expiring");
  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 3 · Operations</div>
          <div className="tab-greeting-name">Action Required</div>
        </div>
        <div className="alert-total-badge">{needsDocs.length} Pending</div>
      </div>

      <div className="alert-section-header amber">
        <Bell size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span>Candidates Needing Attention</span>
        <span className="alert-count amber-count">{needsDocs.length}</span>
      </div>
      <div className="alert-list">
        {needsDocs.map((c) => (
          <div key={c.id} className="alert-card amber-card">
            <div className="alert-card-left">
              <div className="alert-card-name">{c.flag} {c.name}</div>
              <div className="alert-card-meta">{c.role} · {c.statusLabel}</div>
            </div>
            <div className={`alert-days-badge ${c.status === "missing" ? "red-badge" : "amber-badge"}`}>
              {c.status === "missing" ? "Missing" : "Expiring"}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 100 }} />
    </div>
  );
}
