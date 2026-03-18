import { useState } from "react";
import { UserPlus, Upload, CheckCircle, Clock, Users, Building2, X, Save } from "lucide-react";
import { OPS_PIPELINE, B2B_CONTRACTS, MOCK_CANDIDATES } from "@/data/mockData";
import CandidateDetail from "./CandidateDetail";
import type { Candidate } from "@/data/mockData";
import { useToast } from "@/lib/toast";

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

      {/* Candidate Detail Sheet — T3 doc verification only, no full profile access */}
      {selected && (
        <CandidateDetail
          candidate={selected}
          onClose={() => setSelected(null)}
          seeFinancials={false}
          canViewFullProfile={false}
        />
      )}

      {/* Add Candidate Modal — real form */}
      {showAddModal && (
        <AddCandidateModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

const JOB_ROLES = ["TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR", "Teacher", "Nurse", "Engineer", "IT Specialist", "Logistics", "Other"];
const NATIONALITIES = ["Polish", "Ukrainian", "Georgian", "Belarusian", "Russian", "Romanian", "Moldovan", "Azerbaijani", "Turkish", "Other"];
const PIPELINE_STAGES = ["New Applications", "Docs Submitted", "Under Review", "Cleared to Deploy", "On Assignment"];
const SITES = ["BuildPro Sp. z o.o.", "MediCare PL", "LogiTrans Wrocław", "Other"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="add-cand-field">
      <label className="add-cand-label">{label}</label>
      {children}
    </div>
  );
}

function AddCandidateModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [name,        setName]        = useState("");
  const [email,       setEmail]       = useState("");
  const [phone,       setPhone]       = useState("");
  const [nationality, setNationality] = useState("");
  const [role,        setRole]        = useState("");
  const [site,        setSite]        = useState("");
  const [stage,       setStage]       = useState("New Applications");

  function handleSave() {
    if (!name.trim()) { showToast("Full name is required", "error"); return; }
    if (!role)        { showToast("Job role is required",  "error"); return; }
    showToast(`Candidate "${name}" added to pipeline`, "success");
    onClose();
  }

  const inp = "add-cand-input";
  const sel = "add-cand-input add-cand-select";

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet" style={{ maxHeight: "90%" }} onClick={(e) => e.stopPropagation()}>
        <div className="detail-handle" />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 14px" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>Add New Candidate</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Register to the workforce pipeline</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color="#9CA3AF" strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          <Field label="Full Name *">
            <input className={inp} type="text"  placeholder="e.g. Mariusz Kowalski" value={name}  onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Email Address">
            <input className={inp} type="email" placeholder="candidate@email.com"   value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone Number">
            <input className={inp} type="tel"   placeholder="+48 600 000 000"       value={phone} onChange={e => setPhone(e.target.value)} />
          </Field>
          <Field label="Nationality">
            <select className={sel} value={nationality} onChange={e => setNationality(e.target.value)}>
              <option value="">— select —</option>
              {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Job Role *">
            <select className={sel} value={role} onChange={e => setRole(e.target.value)}>
              <option value="">— select —</option>
              {JOB_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Assigned Client / Site">
            <select className={sel} value={site} onChange={e => setSite(e.target.value)}>
              <option value="">— select —</option>
              {SITES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Pipeline Stage">
            <select className={sel} value={stage} onChange={e => setStage(e.target.value)}>
              {PIPELINE_STAGES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid #F3F4F6", marginTop: 8 }}>
          <button
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "13px 0", background: "#FFD600", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, color: "#1B2A4A", cursor: "pointer", fontFamily: "inherit" }}
            onClick={handleSave}
          >
            <Save size={15} strokeWidth={2.5} /> Save Candidate
          </button>
          <button
            style={{ flex: 1, padding: "13px 0", background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
