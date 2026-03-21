import { X, BookMarked, Clock, ClipboardList, Building2, HeartPulse, Users, TrendingUp, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { ModuleId } from "./PlatformModules";
import { useCandidates } from "@/lib/candidateContext";
import { OPS_PIPELINE, B2B_CONTRACTS } from "@/data/mockData";

interface Props {
  moduleId: ModuleId;
  onClose: () => void;
}

const MODULE_META: Record<ModuleId, { label: string; sublabel: string; color: string; bg: string; Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }> }> = {
  "zus-ledger":         { label: "ZUS & Ledger",        sublabel: "Payroll · Social Insurance",  color: "#1B2A4A", bg: "#E8EDF5",  Icon: BookMarked    },
  "timesheets":         { label: "Timesheets & Hours",  sublabel: "Attendance · Overtime",       color: "#6366F1", bg: "#EEF2FF",  Icon: Clock         },
  "pip-compliance":     { label: "PIP / Compliance",    sublabel: "Dossiers · PIPs",             color: "#D97706", bg: "#FFFBEB",  Icon: ClipboardList },
  "b2b-contracts":      { label: "B2B Contracts",       sublabel: "Client Agreements",           color: "#0EA5E9", bg: "#F0F9FF",  Icon: Building2     },
  "bhp-medical":        { label: "BHP / Medical",       sublabel: "H&S · Certificates",         color: "#10B981", bg: "#ECFDF5",  Icon: HeartPulse    },
  "candidate-pipeline": { label: "Candidate Pipeline",  sublabel: "Stages · Placement",          color: "#8B5CF6", bg: "#F5F3FF",  Icon: Users         },
};

export default function ModuleSheet({ moduleId, onClose }: Props) {
  const meta = MODULE_META[moduleId];

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet" style={{ maxHeight: "92%" }} onClick={(e) => e.stopPropagation()}>
        <div className="detail-handle" />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, borderBottom: "1px solid #F3F4F6" }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <meta.Icon size={20} color={meta.color} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>{meta.label}</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 1 }}>{meta.sublabel}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color="#9CA3AF" strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ overflowY: "auto", marginTop: 16 }}>
          <ModuleBody moduleId={moduleId} />
        </div>

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
}

function ModuleBody({ moduleId }: { moduleId: ModuleId }) {
  switch (moduleId) {
    case "zus-ledger":         return <ZusLedger />;
    case "timesheets":         return <Timesheets />;
    case "pip-compliance":     return <PipCompliance />;
    case "b2b-contracts":      return <B2bContracts />;
    case "bhp-medical":        return <BhpMedical />;
    case "candidate-pipeline": return <CandidatePipeline />;
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: "#9CA3AF", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8, marginTop: 18 }}>{text}</div>;
}

function InfoRow({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #F9FAFB" }}>
      <span style={{ fontSize: 13, color: "#6B7280" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: valueColor ?? "#111827" }}>{value}</span>
    </div>
  );
}

function StatCard({ label, value, sub, color, bg }: { label: string; value: string | number; sub?: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, background: bg, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── ZUS & Ledger ─────────────────────────────────────────────────────────────

function ZusLedger() {
  const { candidates } = useCandidates();
  const active = candidates.filter((c) => c.status === "cleared" || c.status === "expiring");

  const totalHours   = active.reduce((s, c) => s + (c.totalHours ?? 0), 0);
  const avgRate      = active.filter(c => c.hourlyNettoRate).length > 0
    ? (active.reduce((s, c) => s + (c.hourlyNettoRate ?? 0), 0) / active.filter(c => c.hourlyNettoRate).length).toFixed(2)
    : "—";
  const zusRate      = 0.1126;
  const totalGross   = active.reduce((s, c) => s + ((c.hourlyNettoRate ?? 0) * (c.totalHours ?? 0)), 0);
  const zusLiability = (totalGross * zusRate).toFixed(2);

  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Active Workers" value={active.length}          sub="on assignment"   color="#1B2A4A" bg="#F0F4FF" />
        <StatCard label="ZUS Liability"  value={`zł ${Number(zusLiability).toLocaleString()}`} sub="this month" color="#DC2626" bg="#FEF2F2" />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <StatCard label="Total Hours"   value={totalHours}  sub="logged hours"  color="#059669" bg="#ECFDF5" />
        <StatCard label="Avg Rate"      value={`zł ${avgRate}/h`}  sub="netto rate"   color="#6366F1" bg="#EEF2FF" />
      </div>

      <SectionLabel text="ZUS Rate Breakdown (Zlecenie)" />
      <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px" }}>
        <InfoRow label="Social Insurance (ubezp. społ.)"   value="9.76%" />
        <InfoRow label="Pension Contribution (emerytura)"  value="1.50%" />
        <InfoRow label="Total ZUS Rate"                    value="11.26%" valueColor="#DC2626" />
        <InfoRow label="Monthly Gross Base"                value={`zł ${totalGross.toFixed(2)}`} />
        <InfoRow label="Estimated ZUS Liability"           value={`zł ${Number(zusLiability).toLocaleString()}`} valueColor="#DC2626" />
      </div>

      {active.length > 0 && (
        <>
          <SectionLabel text="Per-Worker Summary" />
          {active.slice(0, 8).map((c) => {
            const hours    = c.totalHours ?? 0;
            const rate     = c.hourlyNettoRate ?? 0;
            const gross    = (hours * rate).toFixed(2);
            const zus      = (hours * rate * zusRate).toFixed(2);
            return (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #F3F4F6" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{hours}h · zł {rate}/h</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>zł {Number(gross).toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: "#DC2626" }}>ZUS: zł {zus}</div>
                </div>
              </div>
            );
          })}
          {active.length > 8 && <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 10 }}>+{active.length - 8} more workers — see full report in admin portal</div>}
        </>
      )}

      <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "10px 12px", marginTop: 16, display: "flex", gap: 8 }}>
        <AlertTriangle size={14} color="#D97706" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>Full ZUS declarations and payroll ledger are managed in the desktop admin portal for audit compliance.</span>
      </div>
    </>
  );
}

// ── Timesheets & Hours ────────────────────────────────────────────────────────

function Timesheets() {
  const { candidates } = useCandidates();
  const workers = candidates.filter(c => (c.totalHours ?? 0) > 0 || c.status === "cleared" || c.status === "expiring");
  const totalHours   = workers.reduce((s, c) => s + (c.totalHours ?? 0), 0);
  const avgHours     = workers.length > 0 ? (totalHours / workers.length).toFixed(0) : 0;
  const overtime     = workers.filter(c => (c.totalHours ?? 0) > 160).length;

  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Total Hours"   value={totalHours}  sub="all workers"   color="#6366F1" bg="#EEF2FF" />
        <StatCard label="Avg Hours"     value={`${avgHours}h`} sub="per worker" color="#059669" bg="#ECFDF5" />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <StatCard label="Overtime"      value={overtime}    sub=">160h/month"   color="#D97706" bg="#FFFBEB" />
        <StatCard label="Active"        value={workers.length} sub="workers logged" color="#1B2A4A" bg="#F0F4FF" />
      </div>

      <SectionLabel text="Worker Hours Log" />
      {workers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#9CA3AF", fontSize: 13 }}>
          No hours data yet. Update workers in Airtable to see totals here.
        </div>
      ) : (
        workers.slice(0, 10).map((c) => {
          const hours = c.totalHours ?? 0;
          const isOver = hours > 160;
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{c.role} · {c.siteLocation ?? c.location}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isOver && <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", background: "#FFFBEB", padding: "2px 6px", borderRadius: 4 }}>OT</span>}
                <span style={{ fontSize: 14, fontWeight: 800, color: isOver ? "#D97706" : "#374151" }}>{hours}h</span>
              </div>
            </div>
          );
        })
      )}
      {workers.length > 10 && <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 8 }}>+{workers.length - 10} more — full export in admin portal</div>}
    </>
  );
}

// ── PIP / Compliance ──────────────────────────────────────────────────────────

function PipCompliance() {
  const { candidates } = useCandidates();
  const critical = candidates.filter(c => c.status === "expiring" || c.status === "missing");
  const cleared  = candidates.filter(c => c.status === "cleared");
  const pending  = candidates.filter(c => c.status === "pending");

  const PIP_ITEMS = [
    { name: "Performance Improvement Plans",    value: 2,  color: "#DC2626", bg: "#FEF2F2" },
    { name: "Documents Pending Chase",          value: critical.length, color: "#D97706", bg: "#FFFBEB" },
    { name: "RODO Consent Overdue",             value: 1,  color: "#DC2626", bg: "#FEF2F2" },
    { name: "Contract Renewal Required",        value: 3,  color: "#2563EB", bg: "#EFF6FF" },
    { name: "ZUS Registration Incomplete",      value: 2,  color: "#D97706", bg: "#FFFBEB" },
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Action Required" value={critical.length} sub="candidates"     color="#DC2626" bg="#FEF2F2" />
        <StatCard label="Cleared"         value={cleared.length}  sub="fully compliant" color="#059669" bg="#ECFDF5" />
      </div>

      <SectionLabel text="Open Dossier Items" />
      {PIP_ITEMS.map((item, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
          <span style={{ fontSize: 13, color: "#374151", flex: 1, paddingRight: 12 }}>{item.name}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: item.color, background: item.bg, padding: "3px 10px", borderRadius: 6 }}>{item.value}</span>
        </div>
      ))}

      <SectionLabel text="Compliance Snapshot" />
      <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px" }}>
        <InfoRow label="Cleared to Deploy"    value={cleared.length}              valueColor="#059669" />
        <InfoRow label="Docs Missing / Expiring" value={critical.length}          valueColor="#DC2626" />
        <InfoRow label="In Pending Review"    value={pending.length}              valueColor="#2563EB" />
        <InfoRow label="Total in System"      value={candidates.length} />
      </div>

      {critical.length > 0 && (
        <>
          <SectionLabel text="Workers Requiring Action" />
          {critical.slice(0, 6).map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{c.nationality}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.status === "missing" ? "#DC2626" : "#D97706", background: c.status === "missing" ? "#FEF2F2" : "#FFFBEB", padding: "3px 8px", borderRadius: 5, alignSelf: "center" }}>
                {c.statusLabel}
              </span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

// ── B2B Contracts ─────────────────────────────────────────────────────────────

function B2bContracts() {
  const active  = B2B_CONTRACTS.filter(c => c.status === "active").length;
  const pending = B2B_CONTRACTS.filter(c => c.status !== "active").length;
  const totalWorkers = B2B_CONTRACTS.reduce((s, c) => s + c.headcount, 0);

  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Active Contracts" value={active}       sub="live agreements"  color="#0EA5E9" bg="#F0F9FF" />
        <StatCard label="Workers Placed"   value={totalWorkers} sub="across contracts" color="#059669" bg="#ECFDF5" />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <StatCard label="Pending"          value={pending}      sub="awaiting sign-off" color="#D97706" bg="#FFFBEB" />
        <StatCard label="Total Clients"    value={B2B_CONTRACTS.length} sub="on-boarded" color="#8B5CF6" bg="#F5F3FF" />
      </div>

      <SectionLabel text="Contract Register" />
      {B2B_CONTRACTS.map((c, i) => (
        <div key={i} style={{ background: "#F9FAFB", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>{c.client}</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{c.role}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: c.status === "active" ? "#059669" : "#D97706", background: c.status === "active" ? "#ECFDF5" : "#FFFBEB", border: `1.5px solid ${c.status === "active" ? "#6EE7B7" : "#FCD34D"}`, padding: "3px 9px", borderRadius: 5 }}>
              {c.status === "active" ? "✓ Active" : "⏳ Pending"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <div style={{ fontSize: 12, color: "#6B7280" }}>
              <span style={{ fontWeight: 700, color: "#0EA5E9" }}>{c.headcount}</span> workers
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// ── BHP / Medical ─────────────────────────────────────────────────────────────

function BhpMedical() {
  const { candidates } = useCandidates();

  function bhpStatus(c: typeof candidates[0]): { label: string; color: string; bg: string } {
    const bhp = c.bhpExpiry;
    if (!bhp) return { label: "Missing",    color: "#DC2626", bg: "#FEF2F2" };
    const days = Math.ceil((new Date(bhp).getTime() - Date.now()) / 86_400_000);
    if (days < 0)  return { label: "Expired",    color: "#DC2626", bg: "#FEF2F2" };
    if (days < 30) return { label: `${days}d left`, color: "#D97706", bg: "#FFFBEB" };
    return { label: "Valid",      color: "#059669", bg: "#ECFDF5" };
  }

  const expired = candidates.filter(c => { const s = bhpStatus(c); return s.label === "Expired" || s.label === "Missing"; }).length;
  const expiring = candidates.filter(c => { const s = bhpStatus(c); return s.label.includes("d left"); }).length;
  const valid   = candidates.filter(c => bhpStatus(c).label === "Valid").length;

  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Valid"    value={valid}   sub="BHP cleared"  color="#059669" bg="#ECFDF5" />
        <StatCard label="Expiring" value={expiring} sub="within 30d"  color="#D97706" bg="#FFFBEB" />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <StatCard label="Expired/Missing" value={expired} sub="action needed"  color="#DC2626" bg="#FEF2F2" />
        <StatCard label="Total Checked"   value={candidates.length} sub="workers" color="#1B2A4A" bg="#F0F4FF" />
      </div>

      <SectionLabel text="BHP Certificate Status" />
      {candidates.slice(0, 12).map((c) => {
        const s = bhpStatus(c);
        return (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #F3F4F6" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{c.bhpExpiry ?? "No date on file"}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, padding: "3px 9px", borderRadius: 5 }}>{s.label}</span>
          </div>
        );
      })}
      {candidates.length > 12 && <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 8 }}>+{candidates.length - 12} more in admin portal</div>}

      <SectionLabel text="Medical Badania Lekarskie" />
      {candidates.filter(c => c.badaniaLekExpiry).slice(0, 5).map((c) => {
        const days = Math.ceil((new Date(c.badaniaLekExpiry!).getTime() - Date.now()) / 86_400_000);
        const color = days < 0 ? "#DC2626" : days < 30 ? "#D97706" : "#059669";
        const bg    = days < 0 ? "#FEF2F2" : days < 30 ? "#FFFBEB" : "#ECFDF5";
        return (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #F3F4F6" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>Expires: {c.badaniaLekExpiry}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: "3px 9px", borderRadius: 5 }}>
              {days < 0 ? "Expired" : days < 30 ? `${days}d left` : "Valid"}
            </span>
          </div>
        );
      })}
      {candidates.filter(c => c.badaniaLekExpiry).length === 0 && (
        <div style={{ fontSize: 12, color: "#9CA3AF", padding: "12px 0" }}>No badania dates recorded yet.</div>
      )}
    </>
  );
}

// ── Candidate Pipeline ────────────────────────────────────────────────────────

function CandidatePipeline() {
  const { candidates } = useCandidates();

  const stageOrder = ["New Applications", "Docs Submitted", "Under Review", "Cleared to Deploy", "On Assignment"];

  const byStage = stageOrder.map((stage) => ({
    stage,
    count: OPS_PIPELINE.find(p => p.stage === stage)?.count ?? 0,
    color: OPS_PIPELINE.find(p => p.stage === stage)?.color ?? "#9CA3AF",
  }));

  const statusGroups = [
    { label: "Cleared",           count: candidates.filter(c => c.status === "cleared").length,   color: "#059669", bg: "#ECFDF5" },
    { label: "Expiring / Review", count: candidates.filter(c => c.status === "expiring").length,  color: "#D97706", bg: "#FFFBEB" },
    { label: "Missing Docs",      count: candidates.filter(c => c.status === "missing").length,   color: "#DC2626", bg: "#FEF2F2" },
    { label: "Pending",           count: candidates.filter(c => c.status === "pending").length,   color: "#2563EB", bg: "#EFF6FF" },
  ];

  const total = candidates.length;

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {statusGroups.map((g) => (
          <div key={g.label} style={{ flex: "1 1 calc(50% - 5px)", minWidth: 120, background: g.bg, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: g.color }}>{g.count}</div>
            <div style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{g.label}</div>
          </div>
        ))}
      </div>

      <SectionLabel text="Pipeline Stage Funnel" />
      {byStage.map((s) => (
        <div key={s.stage} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{s.stage}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.count}</span>
          </div>
          <div style={{ height: 7, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((s.count / 50) * 100)}%`, background: s.color, borderRadius: 4, transition: "width 0.4s ease" }} />
          </div>
        </div>
      ))}

      <SectionLabel text="Recent Candidates" />
      {candidates.slice(0, 8).map((c) => {
        const isReady = c.status === "cleared";
        return (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #F3F4F6" }}>
            <span style={{ fontSize: 20 }}>{c.flag}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{c.role}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {isReady
                ? <CheckCircle2 size={14} color="#059669" strokeWidth={2.5} />
                : <XCircle     size={14} color="#D97706" strokeWidth={2.5} />}
              <span style={{ fontSize: 11, fontWeight: 700, color: isReady ? "#059669" : "#D97706" }}>
                {isReady ? "Ready" : c.statusLabel}
              </span>
            </div>
          </div>
        );
      })}
      {total > 8 && <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 8 }}>+{total - 8} more candidates total</div>}
    </>
  );
}
