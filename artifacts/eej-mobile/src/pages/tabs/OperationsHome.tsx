import { useState } from "react";
import { UserPlus, Upload, CheckCircle, Clock, Users, Building2 } from "lucide-react";
import { OPS_PIPELINE, B2B_CONTRACTS, MOCK_CANDIDATES } from "@/data/mockData";
import CandidateDetail from "./CandidateDetail";
import type { Candidate } from "@/data/mockData";

const READY     = MOCK_CANDIDATES.filter((c) => c.status === "cleared").length;
const NEEDS_DOC = MOCK_CANDIDATES.filter((c) => c.status === "missing" || c.status === "expiring").length;
const TOTAL     = MOCK_CANDIDATES.length;

export default function OperationsHome() {
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="tab-page" style={{ position: "relative" }}>

      {/* Header */}
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Tier 3 · Workforce & Commercial Ops</div>
          <div className="tab-greeting-name">Recruitment Hub</div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="ops-kpi-strip">
        <div className="ops-kpi-item">
          <CheckCircle size={16} color="#10B981" strokeWidth={2} />
          <div className="ops-kpi-val" style={{ color: "#10B981" }}>{READY}</div>
          <div className="ops-kpi-label">Ready</div>
        </div>
        <div className="ops-kpi-divider" />
        <div className="ops-kpi-item">
          <Clock size={16} color="#F59E0B" strokeWidth={2} />
          <div className="ops-kpi-val" style={{ color: "#F59E0B" }}>{NEEDS_DOC}</div>
          <div className="ops-kpi-label">Needs Docs</div>
        </div>
        <div className="ops-kpi-divider" />
        <div className="ops-kpi-item">
          <Users size={16} color="#6366F1" strokeWidth={2} />
          <div className="ops-kpi-val" style={{ color: "#6366F1" }}>{TOTAL}</div>
          <div className="ops-kpi-label">Total Pool</div>
        </div>
      </div>

      {/* ── PRIMARY: Add New Candidate ── */}
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

      {/* Secondary action */}
      <button className="ops-upload-btn">
        <Upload size={15} color="#6B7280" strokeWidth={2} />
        <span>Bulk Upload Documents</span>
      </button>

      {/* ── PRIMARY SECTION: Candidate Pipeline ── */}
      <div className="section-label" style={{ marginTop: 22 }}>
        Candidate Pipeline
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#6366F1" }}>
          {TOTAL} candidates
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

      {/* Candidates ready for deployment — tap to view docs */}
      <div className="section-label" style={{ marginTop: 22 }}>
        Deployment-Ready Candidates
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, color: "#10B981" }}>
          Tap to verify docs
        </span>
      </div>
      <div className="ops-candidate-list">
        {MOCK_CANDIDATES.map((c) => {
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

      {/* B2B Contracts */}
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

      {/* Candidate Detail Sheet — T3 doc verification */}
      {selected && (
        <CandidateDetail candidate={selected} onClose={() => setSelected(null)} />
      )}

      {/* Add Candidate Modal (placeholder) */}
      {showAddModal && (
        <div className="detail-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="detail-handle" />
            <div style={{ padding: "0 4px 8px" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#111827", marginBottom: 6 }}>
                Add New Candidate
              </div>
              <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
                Full candidate registration form goes here — name, nationality, role, document upload, and client assignment.
              </div>
              <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
                <button
                  style={{ flex: 1, padding: "13px 0", background: "#FFD600", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, color: "#1B2A4A", cursor: "pointer", fontFamily: "inherit" }}
                  onClick={() => setShowAddModal(false)}
                >
                  Save Candidate
                </button>
                <button
                  style={{ flex: 1, padding: "13px 0", background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
