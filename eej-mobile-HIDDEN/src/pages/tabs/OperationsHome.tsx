import { useState, useEffect, useMemo } from "react";
import { UserPlus, Upload, CheckCircle, Clock, Users, Building2, Sparkles, ChevronRight, CalendarClock, UserCheck } from "lucide-react";
import { OPS_PIPELINE, B2B_CONTRACTS } from "@/data/mockData";
import { useCandidates } from "@/lib/candidateContext";
import { fetchApplications, fetchClients, type ClientRow } from "@/lib/api";
import WorkerCockpit from "@/components/WorkerCockpit";
import DocumentScanFlow from "@/components/DocumentScanFlow";
import AddCandidateModal from "@/components/AddCandidateModal";
import type { Candidate } from "@/data/mockData";
import type { ActiveTab } from "@/types";

interface Props {
  onNavigate?: (tab: ActiveTab) => void;
}

export default function OperationsHome({ onNavigate }: Props = {}) {
  const { candidates, refresh } = useCandidates();
  const [selected, setSelected]       = useState<Candidate | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScanFlow, setShowScanFlow] = useState(false);
  const [pipeline, setPipeline] = useState(OPS_PIPELINE);
  const [clients, setClients] = useState<ClientRow[]>([]);

  useEffect(() => {
    fetchClients().then(setClients).catch(() => setClients([]));
  }, []);

  // Bench workers — placed-status candidates with no current site assignment.
  // High-leverage for Karan/Marj/Yana: these are paid + ready but not billing.
  const bench = useMemo(
    () =>
      candidates.filter(
        (c) =>
          c.status === "cleared" &&
          (!c.siteLocation || c.siteLocation.trim() === ""),
      ),
    [candidates],
  );

  // Contracts ending within 30 days — need replacement plans or renewals.
  const contractsEnding = useMemo(() => {
    const horizon = Date.now() + 30 * 86_400_000;
    return candidates
      .filter((c) => {
        if (!c.contractEndDate) return false;
        const t = new Date(c.contractEndDate).getTime();
        return !isNaN(t) && t > Date.now() - 86_400_000 && t <= horizon;
      })
      .sort(
        (a, b) =>
          new Date(a.contractEndDate!).getTime() - new Date(b.contractEndDate!).getTime(),
      );
  }, [candidates]);

  useEffect(() => {
    fetchApplications()
      .then((apps) => {
        if (apps.length === 0) return; // keep mock fallback
        const stageCounts: Record<string, number> = {};
        apps.forEach((a: any) => {
          const stage = a.stage ?? "New";
          stageCounts[stage] = (stageCounts[stage] || 0) + 1;
        });
        const STAGE_COLORS: Record<string, string> = {
          "New Applications": "#3B82F6", "New": "#3B82F6",
          "Docs Submitted": "#F59E0B", "Screening": "#F59E0B",
          "Under Review": "#8B5CF6", "Interview": "#8B5CF6",
          "Cleared to Deploy": "#10B981", "Offer": "#10B981",
          "On Assignment": "#1B2A4A", "Placed": "#1B2A4A",
        };
        const computed = Object.entries(stageCounts).map(([stage, count]) => ({
          stage,
          count,
          color: STAGE_COLORS[stage] ?? "#6B7280",
        }));
        if (computed.length > 0) setPipeline(computed);
      })
      .catch(() => {/* keep mock fallback */});
  }, []);

  const ready    = candidates.filter((c) => c.status === "cleared").length;
  const needsDoc = candidates.filter((c) => c.status === "missing" || c.status === "expiring").length;
  const total    = candidates.length;

  return (
    <div className="tab-page" style={{ position: "relative" }}>

      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 3 · Workforce & Commercial Ops</div>
          <div className="tab-greeting-name">Recruitment Hub</div>
        </div>
      </div>

      <div className="ops-kpi-strip">
        <div className="ops-kpi-item">
          <CheckCircle size={16} color="#10B981" strokeWidth={2} />
          <div className="ops-kpi-val" style={{ color: "#10B981" }}>{ready}</div>
          <div className="ops-kpi-label">Ready</div>
        </div>
        <div className="ops-kpi-divider" />
        <div className="ops-kpi-item">
          <Clock size={16} color="#F59E0B" strokeWidth={2} />
          <div className="ops-kpi-val" style={{ color: "#F59E0B" }}>{needsDoc}</div>
          <div className="ops-kpi-label">Needs Docs</div>
        </div>
        <div className="ops-kpi-divider" />
        <div className="ops-kpi-item">
          <Users size={16} color="#6366F1" strokeWidth={2} />
          <div className="ops-kpi-val" style={{ color: "#6366F1" }}>{total}</div>
          <div className="ops-kpi-label">Total Pool</div>
        </div>
      </div>

      <button className="ops-add-btn" onClick={() => setShowAddModal(true)}>
        <div className="ops-add-icon">
          <UserPlus size={20} color="#1B2A4A" strokeWidth={2.5} />
        </div>
        <div className="ops-add-text">
          <div className="ops-add-title">Add New Candidate</div>
          <div className="ops-add-sub">Register to the workforce pipeline</div>
        </div>
        <div className="ops-add-arrow">+</div>
      </button>

      <button className="lh-scan-btn" onClick={() => setShowScanFlow(true)}>
        <Sparkles size={16} strokeWidth={2.2} />
        <div className="lh-scan-text">
          <div className="lh-scan-title">Scan a document</div>
          <div className="lh-scan-sub">AI extracts fields and matches to a worker</div>
        </div>
        <ChevronRight size={14} strokeWidth={2.2} />
      </button>

      <button className="ops-upload-btn">
        <Upload size={15} color="#6B7280" strokeWidth={2} />
        <span>Bulk Upload Documents</span>
      </button>

      <div className="section-label" style={{ marginTop: 22 }}>
        Candidate Pipeline
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#6366F1" }}>
          {total} candidates
        </span>
      </div>
      <div className="pipeline-list">
        {pipeline.map((stage) => (
          <div key={stage.stage} className="pipeline-row">
            <div className="pipeline-dot" style={{ background: stage.color }} />
            <div className="pipeline-label">{stage.stage}</div>
            <div className="pipeline-bar-track">
              <div
                className="pipeline-bar-fill"
                style={{ width: `${Math.round((stage.count / 50) * 100)}%`, background: stage.color }}
              />
            </div>
            <div className="pipeline-count" style={{ color: stage.color }}>{stage.count}</div>
          </div>
        ))}
      </div>

      <div className="section-label" style={{ marginTop: 22 }}>
        All Candidates
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, color: "#10B981" }}>
          Tap to verify docs
        </span>
      </div>
      <div className="ops-candidate-list">
        {candidates.map((c) => {
          const isReady = c.status === "cleared";
          return (
            <button key={c.id} className="ops-candidate-row" onClick={() => setSelected(c)}>
              <div className="ops-cand-flag">{c.flag}</div>
              <div className="ops-cand-info">
                <div className="ops-cand-name">{c.name}</div>
                <div className="ops-cand-role">{c.role}</div>
              </div>
              <div className="ops-cand-right">
                <span className={`ops-ready-badge ${isReady ? "ops-ready" : "ops-pending"}`}>
                  {isReady ? "✓ Ready" : c.statusLabel}
                </span>
                <span className="ops-doc-count">{c.documents.length} docs</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bench — placed but unassigned workers. Karan/Marj's leverage zone. */}
      {bench.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 22 }}>
            <UserCheck size={13} color="#10B981" strokeWidth={2} />
            Bench — ready to place
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#10B981" }}>
              {bench.length} available
            </span>
          </div>
          <div className="ops-candidate-list">
            {bench.slice(0, 6).map((c) => (
              <button key={c.id} className="ops-candidate-row" onClick={() => setSelected(c)}>
                <div className="ops-cand-flag">{c.flag}</div>
                <div className="ops-cand-info">
                  <div className="ops-cand-name">{c.name}</div>
                  <div className="ops-cand-role">{c.role}</div>
                </div>
                <div className="ops-cand-right">
                  <span className="ops-ready-badge ops-ready">✓ Bench</span>
                  <span className="ops-doc-count">{c.documents.length} docs</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Contracts ending within 30 days — need plans for renewal or replacement. */}
      {contractsEnding.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 22 }}>
            <CalendarClock size={13} color="#D97706" strokeWidth={2} />
            Contracts ending soon
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#D97706" }}>
              {contractsEnding.length}
            </span>
          </div>
          <div className="ops-candidate-list">
            {contractsEnding.slice(0, 6).map((c) => {
              const days = c.contractEndDate
                ? Math.max(0, Math.ceil((new Date(c.contractEndDate).getTime() - Date.now()) / 86_400_000))
                : null;
              return (
                <button key={c.id} className="ops-candidate-row" onClick={() => setSelected(c)}>
                  <div className="ops-cand-flag">{c.flag}</div>
                  <div className="ops-cand-info">
                    <div className="ops-cand-name">{c.name}</div>
                    <div className="ops-cand-role">{c.siteLocation ?? c.role}</div>
                  </div>
                  <div className="ops-cand-right">
                    <span className={`ops-ready-badge ${days !== null && days <= 7 ? "ops-pending" : "ops-ready"}`}>
                      {days !== null ? `${days}d left` : "—"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="section-label" style={{ marginTop: 22 }}>
        <Building2 size={13} color="#9CA3AF" strokeWidth={2} />
        B2B Clients
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#6366F1" }}>
          {clients.length || B2B_CONTRACTS.length}
        </span>
      </div>
      <div className="contract-list">
        {clients.length > 0 ? (
          clients.map((c) => {
            // Compute how many of our candidates are placed at this client (by
            // string match on siteLocation — imperfect but useful directionally).
            const headcount = candidates.filter(
              (cand) =>
                cand.siteLocation &&
                cand.siteLocation.toLowerCase().includes(c.name.toLowerCase()),
            ).length;
            return (
              <div key={c.id} className="contract-card">
                <div className="contract-left">
                  <div className="contract-client">{c.name}</div>
                  <div className="contract-role">
                    {c.contactPerson ?? "—"}
                    {c.billingRate ? ` · ${c.billingRate} PLN/h` : ""}
                  </div>
                </div>
                <div className="contract-right">
                  <div className="contract-headcount">{headcount} worker{headcount === 1 ? "" : "s"}</div>
                  <div className={`contract-status ${headcount > 0 ? "green-badge" : "amber-badge"}`}>
                    {headcount > 0 ? "✓ Active" : "⏳ Idle"}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          // Fallback to mock data only if the API returned an empty array.
          B2B_CONTRACTS.map((c, i) => (
            <div key={i} className="contract-card">
              <div className="contract-left">
                <div className="contract-client">{c.client}</div>
                <div className="contract-role">{c.role}</div>
              </div>
              <div className="contract-right">
                <div className="contract-headcount">{c.headcount} workers</div>
                <div className={`contract-status ${c.status === "active" ? "green-badge" : "amber-badge"}`}>
                  {c.status === "active" ? "✓ Active" : "⏳ Pending"}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ height: 100 }} />

      {selected && (
        <WorkerCockpit
          workerId={selected.id}
          onClose={() => setSelected(null)}
          onOpenModule={
            onNavigate
              ? (module) => {
                  const tabMap: Record<string, ActiveTab> = {
                    trc: "trc",
                    permits: "permits",
                    payroll: "payroll",
                  };
                  const target = tabMap[module];
                  if (target) {
                    setSelected(null);
                    onNavigate(target);
                  }
                }
              : undefined
          }
        />
      )}

      {showAddModal && (
        <AddCandidateModal onClose={() => setShowAddModal(false)} />
      )}

      {showScanFlow && (
        <DocumentScanFlow
          onClose={() => setShowScanFlow(false)}
          onApplied={() => refresh()}
        />
      )}
    </div>
  );
}
