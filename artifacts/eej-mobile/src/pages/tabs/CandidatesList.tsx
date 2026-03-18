import { useState, useMemo } from "react";
import { Search, SlidersHorizontal, MapPin, ChevronRight, UserPlus, Building2 } from "lucide-react";
import { OPS_PIPELINE, B2B_CONTRACTS, type DocStatus, type Candidate } from "@/data/mockData";
import { useCandidates } from "@/lib/candidateContext";
import CandidateDetail from "./CandidateDetail";
import AddCandidateModal from "@/components/AddCandidateModal";
import type { Role } from "@/types";
import { ROLE_PERMISSIONS } from "@/types";

type Filter = "all" | DocStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all",      label: "All" },
  { id: "cleared",  label: "Ready" },
  { id: "expiring", label: "Expiring" },
  { id: "missing",  label: "Missing" },
  { id: "pending",  label: "Pending" },
];

const STATUS_COLORS: Record<DocStatus, { bg: string; text: string; border: string; dot: string }> = {
  cleared:  { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7", dot: "#10B981" },
  expiring: { bg: "#FFFBEB", text: "#D97706", border: "#FCD34D", dot: "#F59E0B" },
  missing:  { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5", dot: "#EF4444" },
  pending:  { bg: "#EFF6FF", text: "#2563EB", border: "#93C5FD", dot: "#3B82F6" },
};

const STAGE_COLORS: Record<string, string> = {
  "New Applications":  "#3B82F6",
  "Docs Submitted":    "#F59E0B",
  "Under Review":      "#8B5CF6",
  "Cleared to Deploy": "#10B981",
  "On Assignment":     "#1B2A4A",
};

interface Props { role: Role; }

export default function CandidatesList({ role }: Props) {
  const { candidates } = useCandidates();
  const [query, setQuery]               = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [selected, setSelected]         = useState<Candidate | null>(null);
  const [showAdd, setShowAdd]           = useState(false);
  const [showRecruit, setShowRecruit]   = useState(false);
  const perms = ROLE_PERMISSIONS[role];

  const filtered = useMemo(() => candidates.filter((c) => {
    const matchesFilter = activeFilter === "all" || c.status === activeFilter;
    const matchesSearch =
      query === "" ||
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.role.toLowerCase().includes(query.toLowerCase()) ||
      c.location.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesSearch;
  }), [candidates, query, activeFilter]);

  const canViewFullProfile = perms.seeGlobalCandidates && role !== "candidate";
  const canEdit            = role === "executive" || role === "legal" || role === "operations";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      <div className="candidates-sticky">
        <div className="search-wrapper">
          <Search size={15} color="#9CA3AF" strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <input
            className="search-input"
            type="search"
            placeholder="Search name, role or city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query
            ? <button className="search-clear" onClick={() => setQuery("")}>✕</button>
            : <SlidersHorizontal size={14} color="#D1D5DB" strokeWidth={2} style={{ flexShrink: 0 }} />
          }
        </div>
        <div className="filter-pills">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-pill${activeFilter === f.id ? " active" : ""}`}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="candidates-count-row">
          <span className="candidates-count">{filtered.length} candidate{filtered.length !== 1 ? "s" : ""}</span>
          {perms.addCandidates && (
            <button className="clist-add-btn" onClick={() => setShowAdd(true)}>
              <UserPlus size={13} strokeWidth={2.5} />
              Add Candidate
            </button>
          )}
        </div>
      </div>

      <div className="candidates-list" style={{ flex: 1 }}>

        {perms.addCandidates && (
          <div className="clist-recruit-bar">
            <button
              className="clist-recruit-toggle"
              onClick={() => setShowRecruit((v) => !v)}
            >
              <Building2 size={13} color="#6366F1" strokeWidth={2} />
              <span>Recruitment Overview</span>
              <span className="clist-recruit-chevron">{showRecruit ? "▲" : "▼"}</span>
            </button>

            {showRecruit && (
              <div className="clist-recruit-body">
                <div className="clist-recruit-section-label">Pipeline</div>
                <div className="pipeline-list" style={{ marginBottom: 12 }}>
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

                <div className="clist-recruit-section-label">B2B Contracts</div>
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
              </div>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="candidates-empty">
            <Search size={32} color="#D1D5DB" strokeWidth={1.5} />
            <div>No candidates match your search</div>
          </div>
        ) : (
          filtered.map((c) => {
            const colors     = STATUS_COLORS[c.status];
            const clickable  = perms.approveDocs;
            const stageColor = c.pipelineStage ? (STAGE_COLORS[c.pipelineStage] ?? "#9CA3AF") : null;
            return (
              <div
                key={c.id}
                className={`candidate-card${clickable ? " clickable" : ""}`}
                onClick={() => clickable && setSelected(c)}
              >
                <div className="candidate-avatar" style={{ background: colors.bg, border: `2px solid ${colors.border}` }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{c.flag}</span>
                </div>
                <div className="candidate-info">
                  <div className="candidate-name">{c.name}</div>
                  <div className="candidate-role">{c.role}</div>
                  <div className="candidate-location">
                    <MapPin size={10} color="#9CA3AF" strokeWidth={2} style={{ flexShrink: 0 }} />
                    <span>{c.location}</span>
                  </div>
                  {stageColor && c.pipelineStage && (
                    <div
                      className="candidate-stage-pill"
                      style={{ background: stageColor + "18", color: stageColor, border: `1px solid ${stageColor}40` }}
                    >
                      {c.pipelineStage}
                    </div>
                  )}
                </div>
                <div className="candidate-status-col">
                  <span
                    className="candidate-badge"
                    style={{ background: colors.bg, color: colors.text, border: `1.5px solid ${colors.border}` }}
                  >
                    <span className="status-dot" style={{ background: colors.dot }} />
                    {c.statusLabel}
                  </span>
                  {c.visaDaysLeft !== undefined && (
                    <span className="candidate-days" style={{ color: colors.text }}>{c.visaDaysLeft}d left</span>
                  )}
                  {clickable && (
                    <ChevronRight size={13} color="#D1D5DB" strokeWidth={2} />
                  )}
                </div>
              </div>
            );
          })
        )}
        <div style={{ height: 100 }} />
      </div>

      {selected && (
        <CandidateDetail
          candidate={selected}
          onClose={() => setSelected(null)}
          seeFinancials={perms.seeFinancials}
          canViewFullProfile={canViewFullProfile}
          canEdit={canEdit}
        />
      )}

      {showAdd && <AddCandidateModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
