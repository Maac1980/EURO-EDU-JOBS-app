import { useState } from "react";
import { AlertTriangle, ShieldAlert, FileCheck2, Bell, Clock, CheckCircle2, DollarSign, Search, X, Stethoscope, HardHat } from "lucide-react";
import { COMPLIANCE_ALERTS } from "@/data/mockData";
import { useCandidates } from "@/lib/candidateContext";
import type { Candidate } from "@/data/mockData";
import type { Role } from "@/types";
import WorkerCockpit from "@/components/WorkerCockpit";

const TODAY = new Date();

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - TODAY.getTime()) / 86_400_000);
}

interface Props { role: Role; }

export default function AlertsTab({ role }: Props) {
  const { candidates } = useCandidates();
  const data = candidates.length > 0 ? candidates : [] as Candidate[];
  if (role === "executive")  return <ExecutiveAlerts candidates={data} />;
  if (role === "legal")      return <LegalAlerts candidates={data} />;
  if (role === "operations") return <OpsAlerts candidates={data} />;
  return null;
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="alert-search-wrap">
      <Search size={14} color="#9CA3AF" strokeWidth={2} style={{ flexShrink: 0 }} />
      <input
        className="alert-search-input"
        type="text"
        placeholder="Search alerts…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="alert-search-clear" onClick={() => onChange("")}>
          <X size={13} color="#9CA3AF" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

/* ── T1 Executive Alerts ── */
function ExecutiveAlerts({ candidates }: { candidates: Candidate[] }) {
  const [query, setQuery] = useState("");
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);

  const financialAlerts = candidates.filter(c =>
    c.zusStatus?.toLowerCase().includes("pending") || c.zusStatus?.toLowerCase().includes("incomplete")
  );
  const expiringDocs = candidates.flatMap(c => {
    const items: { id: string; name: string; doc: string; days: number }[] = [];
    const d1 = daysUntil(c.trcExpiry);
    const d2 = daysUntil(c.workPermitExpiry);
    if (d1 !== null && d1 < 60) items.push({ id: c.id, name: c.name, doc: "TRC Residence Card", days: d1 });
    if (d2 !== null && d2 < 60) items.push({ id: c.id, name: c.name, doc: "Work Permit", days: d2 });
    return items;
  });

  // Live candidate data carries the worker id so each alert card can deep-link
  // into the cockpit. Mock-data fallback rows have no id; their cards click
  // through to nothing (cursor stays default).
  const visaExpiring = candidates.length > 0
    ? candidates
        .filter(c => c.visaDaysLeft !== undefined && c.visaDaysLeft > 0 && c.visaDaysLeft <= 60)
        .map(c => ({ id: c.id, name: c.name, daysLeft: c.visaDaysLeft!, type: c.visaType ?? "Visa" }))
    : (COMPLIANCE_ALERTS.visaExpiring as Array<{ id?: string; name: string; daysLeft: number; type: string }>);
  const missingPassports = candidates.length > 0
    ? candidates
        .filter(c => c.documents.some(d => d.name.toLowerCase().includes("passport") && (d.status === "missing" || d.status === "rejected")))
        .map(c => ({ id: c.id, name: c.name, missing: "Passport / ID" }))
    : (COMPLIANCE_ALERTS.missingPassports as Array<{ id?: string; name: string; missing: string }>);

  const q = query.toLowerCase();
  const filteredVisa    = visaExpiring.filter(a => !q || a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q));
  const filteredMissing = missingPassports.filter(a => !q || a.name.toLowerCase().includes(q) || a.missing.toLowerCase().includes(q));
  const filteredFin     = financialAlerts.filter(c => !q || c.name.toLowerCase().includes(q));
  const filteredExpiry  = expiringDocs.filter(i => !q || i.name.toLowerCase().includes(q) || i.doc.toLowerCase().includes(q));

  const totalAlerts = visaExpiring.length + missingPassports.length + financialAlerts.length;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 1 · Executive</div>
          <div className="tab-greeting-name">Compliance Alerts</div>
        </div>
        <div className="alert-total-badge">{totalAlerts} Active</div>
      </div>

      <SearchBar value={query} onChange={setQuery} />

      <div className="alert-section-header amber">
        <AlertTriangle size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span>Visa / TRC Expiring</span>
        <span className="alert-count amber-count">{filteredVisa.length}</span>
      </div>
      <div className="alert-list">
        {filteredVisa.length === 0 ? <div className="alert-empty">No matches.</div> : filteredVisa.map((a, i) => (
          <div
            key={i}
            className="alert-card amber-card"
            style={a.id ? { cursor: "pointer" } : undefined}
            onClick={() => a.id && setOpenWorkerId(a.id)}
          >
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
        <span className="alert-count red-count">{filteredMissing.length}</span>
      </div>
      <div className="alert-list">
        {filteredMissing.length === 0 ? <div className="alert-empty">No matches.</div> : filteredMissing.map((a, i) => (
          <div
            key={i}
            className="alert-card red-card"
            style={a.id ? { cursor: "pointer" } : undefined}
            onClick={() => a.id && setOpenWorkerId(a.id)}
          >
            <div className="alert-card-left">
              <div className="alert-card-name">{a.name}</div>
              <div className="alert-card-meta">{a.missing}</div>
            </div>
            <div className="alert-action-btn">Chase →</div>
          </div>
        ))}
      </div>

      <div className="alert-section-header" style={{ marginTop: 20, background: "#EEF2FF", color: "#4338CA", borderColor: "#C7D2FE" }}>
        <DollarSign size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span>ZUS Registration Incomplete</span>
        <span className="alert-count" style={{ background: "#EEF2FF", color: "#4338CA", border: "1.5px solid #A5B4FC" }}>{filteredFin.length}</span>
      </div>
      <div className="alert-list">
        {filteredFin.length === 0 ? (
          <div className="alert-card" style={{ background: "#ECFDF5", border: "1.5px solid #6EE7B7" }}>
            <div className="alert-card-left">
              <div className="alert-card-name" style={{ color: "#059669" }}>All ZUS registrations current</div>
            </div>
            <CheckCircle2 size={16} color="#059669" strokeWidth={2.5} />
          </div>
        ) : filteredFin.map((c) => (
          <div
            key={c.id}
            className="alert-card"
            style={{ background: "#EEF2FF", border: "1.5px solid #C7D2FE", cursor: "pointer" }}
            onClick={() => setOpenWorkerId(c.id)}
          >
            <div className="alert-card-left">
              <div className="alert-card-name">{c.name}</div>
              <div className="alert-card-meta">{c.zusStatus}</div>
            </div>
            <div className="alert-action-btn" style={{ background: "#EEF2FF", color: "#4338CA", border: "1.5px solid #A5B4FC" }}>Review</div>
          </div>
        ))}
      </div>

      {filteredExpiry.length > 0 && (
        <>
          <div className="alert-section-header" style={{ marginTop: 20, background: "#F9FAFB", color: "#6B7280", borderColor: "#E5E7EB" }}>
            <Clock size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span>Document Expiry Timeline</span>
            <span className="alert-count" style={{ background: "#F9FAFB", color: "#6B7280", border: "1.5px solid #E5E7EB" }}>{filteredExpiry.length}</span>
          </div>
          <div className="alert-list">
            {filteredExpiry.sort((a, b) => a.days - b.days).map((item, i) => (
              <div
                key={i}
                className="alert-card"
                style={{ background: "#FAFAFA", border: "1.5px solid #E5E7EB", cursor: "pointer" }}
                onClick={() => setOpenWorkerId(item.id)}
              >
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

      {openWorkerId && (
        <WorkerCockpit
          workerId={openWorkerId}
          onClose={() => setOpenWorkerId(null)}
        />
      )}
    </div>
  );
}

/* ── T2 Legal Alerts — DIFFERENTIATED from LegalHome ── */
function LegalAlerts({ candidates }: { candidates: Candidate[] }) {
  const [query, setQuery] = useState("");
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);

  const q = query.toLowerCase();

  // Each issue carries the candidate id when sourced from real data so the
  // card can deep-link to the cockpit. Mock-data fallback rows lack an id;
  // their cards are inert (no cursor change).
  const allIssues: { id?: string; name: string; issue: string; days: number | null; severity: "critical" | "warning" | "pending" }[] = [];

  if (candidates.length > 0) {
    candidates.forEach(c => {
      if (c.visaDaysLeft !== undefined && c.visaDaysLeft > 0 && c.visaDaysLeft <= 60) {
        allIssues.push({ id: c.id, name: c.name, issue: `${c.visaType ?? "Visa"} expiring`, days: c.visaDaysLeft, severity: c.visaDaysLeft <= 10 ? "critical" : "warning" });
      }
      if (c.documents.some(d => d.name.toLowerCase().includes("passport") && (d.status === "missing" || d.status === "rejected"))) {
        allIssues.push({ id: c.id, name: c.name, issue: "Passport / ID missing", days: null, severity: "critical" });
      }
      const wp = c.documents.find(d => d.name.toLowerCase().includes("work permit"));
      if (wp && wp.status !== "approved") {
        allIssues.push({ id: c.id, name: c.name, issue: "Work permit pending", days: null, severity: "pending" });
      }
    });
  } else {
    COMPLIANCE_ALERTS.visaExpiring.forEach(a => {
      allIssues.push({ name: a.name, issue: `${a.type} expiring`, days: a.daysLeft, severity: a.daysLeft <= 10 ? "critical" : "warning" });
    });
    COMPLIANCE_ALERTS.missingPassports.forEach(a => {
      allIssues.push({ name: a.name, issue: a.missing, days: null, severity: "critical" });
    });
    COMPLIANCE_ALERTS.workPermits.filter(p => p.status === "pending").forEach(a => {
      allIssues.push({ name: a.name, issue: "Work permit pending", days: null, severity: "pending" });
    });
  }

  candidates.forEach(c => {
    const d1 = daysUntil(c.bhpExpiry);
    const d2 = daysUntil(c.badaniaLekExpiry);
    const d3 = daysUntil(c.oswiadczenieExpiry);
    if (d1 !== null && d1 < 90) allIssues.push({ id: c.id, name: c.name, issue: "BHP Certificate expiring", days: d1, severity: d1 <= 30 ? "critical" : "warning" });
    if (d2 !== null && d2 < 90) allIssues.push({ id: c.id, name: c.name, issue: "Medical Certificate expiring", days: d2, severity: d2 <= 30 ? "critical" : "warning" });
    if (d3 !== null && d3 < 60) allIssues.push({ id: c.id, name: c.name, issue: "Oświadczenie expiring", days: d3, severity: d3 <= 14 ? "critical" : "warning" });
  });

  allIssues.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (b.severity === "critical" && a.severity !== "critical") return 1;
    if (a.days !== null && b.days !== null) return a.days - b.days;
    if (a.days !== null) return -1;
    if (b.days !== null) return 1;
    return 0;
  });

  const filtered = allIssues.filter(i => !q || i.name.toLowerCase().includes(q) || i.issue.toLowerCase().includes(q));

  const criticalCount = allIssues.filter(i => i.severity === "critical").length;
  const warningCount  = allIssues.filter(i => i.severity === "warning").length;
  const pendingCount  = allIssues.filter(i => i.severity === "pending").length;

  const bhpExpiries = candidates.map(c => ({ name: c.name, flag: c.flag, days: daysUntil(c.bhpExpiry) }))
    .filter(x => x.days !== null && x.days < 120)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  const medExpiries = candidates.map(c => ({ name: c.name, flag: c.flag, days: daysUntil(c.badaniaLekExpiry) }))
    .filter(x => x.days !== null && x.days < 120)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 2 · Legal</div>
          <div className="tab-greeting-name">Priority Issue Queue</div>
        </div>
        <div className="alert-total-badge">{allIssues.length} Issues</div>
      </div>

      <div className="legal-alert-stats-row">
        <div className="legal-stat-chip red-chip">🔴 {criticalCount} Critical</div>
        <div className="legal-stat-chip amber-chip">🟡 {warningCount} Warning</div>
        <div className="legal-stat-chip blue-chip">🔵 {pendingCount} Pending</div>
      </div>

      <SearchBar value={query} onChange={setQuery} />

      <div className="alert-section-header" style={{ background: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA" }}>
        <AlertTriangle size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span>All Issues — Priority Order</span>
        <span className="alert-count" style={{ background: "#FEE2E2", color: "#DC2626", border: "1.5px solid #FCA5A5" }}>{filtered.length}</span>
      </div>
      <div className="alert-list">
        {filtered.length === 0 ? <div className="alert-empty">No matches.</div> : filtered.map((item, i) => (
          <div
            key={i}
            className={"alert-card " + (item.severity === "critical" ? "red-card" : item.severity === "warning" ? "amber-card" : "")}
            style={item.id ? { cursor: "pointer" } : undefined}
            onClick={() => item.id && setOpenWorkerId(item.id)}
          >
            <div className="alert-card-left">
              <div className="alert-card-name">{item.name}</div>
              <div className="alert-card-meta">{item.issue}</div>
            </div>
            {item.days !== null ? (
              <div className={`alert-days-badge ${item.days <= 10 ? "red-badge" : item.days <= 30 ? "amber-badge" : "blue-badge"}`}>
                {item.days < 0 ? "EXPIRED" : `${item.days}d`}
              </div>
            ) : (
              <div className={`alert-days-badge ${item.severity === "critical" ? "red-badge" : "blue-badge"}`}>
                {item.severity === "critical" ? "Urgent" : "Pending"}
              </div>
            )}
          </div>
        ))}
      </div>

      {!query && (
        <>
          <div className="alert-section-header" style={{ marginTop: 20, background: "#F0FDF4", color: "#166534", borderColor: "#BBF7D0" }}>
            <HardHat size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span>BHP Certificate Expiry Watch</span>
            <span className="alert-count" style={{ background: "#DCFCE7", color: "#16A34A", border: "1.5px solid #86EFAC" }}>{bhpExpiries.length}</span>
          </div>
          <div className="alert-list">
            {bhpExpiries.map((item, i) => (
              <div key={i} className="alert-card" style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0" }}>
                <div className="alert-card-left">
                  <div className="alert-card-name">{item.flag} {item.name}</div>
                  <div className="alert-card-meta">BHP Certificate</div>
                </div>
                <div className={`alert-days-badge ${(item.days ?? 999) <= 30 ? "red-badge" : (item.days ?? 999) <= 60 ? "amber-badge" : "green-badge"}`}>
                  {(item.days ?? 0) < 0 ? "EXPIRED" : `${item.days}d`}
                </div>
              </div>
            ))}
          </div>

          <div className="alert-section-header" style={{ marginTop: 20, background: "#EFF6FF", color: "#1E40AF", borderColor: "#BFDBFE" }}>
            <Stethoscope size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span>Medical Certificate Expiry Watch</span>
            <span className="alert-count" style={{ background: "#DBEAFE", color: "#2563EB", border: "1.5px solid #93C5FD" }}>{medExpiries.length}</span>
          </div>
          <div className="alert-list">
            {medExpiries.map((item, i) => (
              <div key={i} className="alert-card" style={{ background: "#EFF6FF", border: "1.5px solid #BFDBFE" }}>
                <div className="alert-card-left">
                  <div className="alert-card-name">{item.flag} {item.name}</div>
                  <div className="alert-card-meta">Badania Lekarskie</div>
                </div>
                <div className={`alert-days-badge ${(item.days ?? 999) <= 30 ? "red-badge" : (item.days ?? 999) <= 60 ? "amber-badge" : "blue-badge"}`}>
                  {(item.days ?? 0) < 0 ? "EXPIRED" : `${item.days}d`}
                </div>
              </div>
            ))}
          </div>

          <div className="alert-section-header green" style={{ marginTop: 20 }}>
            <CheckCircle2 size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span>Recently Resolved</span>
            <span className="alert-count green-count">3</span>
          </div>
          <div className="alert-list">
            {[
              { name: "Andreea Moldovan",  action: "Work Permit approved", date: "15 Mar 2026" },
              { name: "Nguyen Thi Lan",    action: "TRC Residence renewed", date: "08 Nov 2025" },
              { name: "Lasha Beridze",     action: "Passport scan approved", date: "28 Jan 2026" },
            ].map((r, i) => (
              <div key={i} className="alert-card" style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", opacity: 0.85 }}>
                <div className="alert-card-left">
                  <div className="alert-card-name">{r.name}</div>
                  <div className="alert-card-meta">{r.action}</div>
                </div>
                <div className="alert-days-badge green-badge">✓ {r.date}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 100 }} />

      {openWorkerId && (
        <WorkerCockpit
          workerId={openWorkerId}
          onClose={() => setOpenWorkerId(null)}
        />
      )}
    </div>
  );
}

/* ── T3 Operations Alerts ── */
function OpsAlerts({ candidates }: { candidates: Candidate[] }) {
  const [query, setQuery] = useState("");
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);
  const needsDocs = candidates.filter(c => c.status === "missing" || c.status === "expiring");
  const q = query.toLowerCase();
  const filtered = needsDocs.filter(c => !q || c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q) || c.statusLabel.toLowerCase().includes(q));

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 3 · Operations</div>
          <div className="tab-greeting-name">Action Required</div>
        </div>
        <div className="alert-total-badge">{needsDocs.length} Pending</div>
      </div>

      <SearchBar value={query} onChange={setQuery} />

      <div className="alert-section-header amber">
        <Bell size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span>Candidates Needing Attention</span>
        <span className="alert-count amber-count">{filtered.length}</span>
      </div>
      <div className="alert-list">
        {filtered.length === 0
          ? <div className="alert-empty">No matches.</div>
          : filtered.map((c) => (
          <div
            key={c.id}
            className="alert-card amber-card"
            style={{ cursor: "pointer" }}
            onClick={() => setOpenWorkerId(c.id)}
          >
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

      {openWorkerId && (
        <WorkerCockpit
          workerId={openWorkerId}
          onClose={() => setOpenWorkerId(null)}
        />
      )}
    </div>
  );
}
