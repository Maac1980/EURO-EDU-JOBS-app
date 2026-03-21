import { useState } from "react";
import { UserPlus, Upload, CheckCircle, Clock, Users, Building2 } from "lucide-react";
import { OPS_PIPELINE, B2B_CONTRACTS } from "@/data/mockData";
import { useCandidates } from "@/lib/candidateContext";
import CandidateDetail from "./CandidateDetail";
import AddCandidateModal from "@/components/AddCandidateModal";
import type { Candidate } from "@/data/mockData";

export default function OperationsHome() {
  const { candidates } = useCandidates();
  const [selected, setSelected]       = useState<Candidate | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

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
        {OPS_PIPELINE.map((stage) => (
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

      <div className="section-label" style={{ marginTop: 22 }}>
        <Building2 size={13} color="#9CA3AF" strokeWidth={2} />
        B2B Client Contracts
      </div>
      <div className="contract-list">
        {B2B_CONTRACTS.map((c, i) => (
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
        ))}
      </div>

      <div style={{ height: 100 }} />

      {selected && (
        <CandidateDetail
          candidate={selected}
          onClose={() => setSelected(null)}
          seeFinancials={false}
          canViewFullProfile={true}
          canEdit={true}
        />
      )}

      {showAddModal && (
        <AddCandidateModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}
