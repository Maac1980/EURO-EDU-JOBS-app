import { useState, useMemo } from "react";
import { MOCK_CANDIDATES, type DocStatus, type Candidate } from "@/data/mockData";
import CandidateDetail from "./CandidateDetail";
import type { Role } from "@/types";
import { ROLE_PERMISSIONS } from "@/types";

type Filter = "all" | DocStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all",      label: "All" },
  { id: "cleared",  label: "Ready to Deploy" },
  { id: "expiring", label: "Expiring Soon" },
  { id: "missing",  label: "Missing Docs" },
  { id: "pending",  label: "Permit Pending" },
];

const STATUS_COLORS: Record<DocStatus, { bg: string; text: string; border: string; dot: string }> = {
  cleared:  { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7", dot: "#10B981" },
  expiring: { bg: "#FFFBEB", text: "#D97706", border: "#FCD34D", dot: "#F59E0B" },
  missing:  { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5", dot: "#EF4444" },
  pending:  { bg: "#EFF6FF", text: "#2563EB", border: "#93C5FD", dot: "#3B82F6" },
};

interface Props { role: Role; }

export default function CandidatesList({ role }: Props) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const perms = ROLE_PERMISSIONS[role];

  const filtered = useMemo(() => MOCK_CANDIDATES.filter((c) => {
    const matchesFilter = activeFilter === "all" || c.status === activeFilter;
    const matchesSearch =
      query === "" ||
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.role.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesSearch;
  }), [query, activeFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Sticky Search + Filters */}
      <div className="candidates-sticky">
        <div className="search-wrapper">
          <SearchIcon />
          <input
            className="search-input"
            type="search"
            placeholder="Search candidates or roles…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && <button className="search-clear" onClick={() => setQuery("")}>✕</button>}
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
      </div>

      {/* List */}
      <div className="candidates-list">
        {filtered.length === 0 ? (
          <div className="candidates-empty">
            <div style={{ fontSize: 36 }}>🔍</div>
            <div>No candidates match your search</div>
          </div>
        ) : (
          filtered.map((c) => {
            const colors = STATUS_COLORS[c.status];
            const clickable = perms.approveDocs;
            return (
              <div
                key={c.id}
                className={`candidate-card${clickable ? " clickable" : ""}`}
                onClick={() => clickable && setSelected(c)}
              >
                <div className="candidate-avatar" style={{ background: colors.bg, border: `2px solid ${colors.border}` }}>
                  <span style={{ fontSize: 20 }}>{c.flag}</span>
                </div>
                <div className="candidate-info">
                  <div className="candidate-name">{c.name}</div>
                  <div className="candidate-role">{c.role}</div>
                  <div className="candidate-location">
                    <LocationIcon />
                    {c.location}
                  </div>
                </div>
                <div className="candidate-status-col">
                  <span className="candidate-badge" style={{ background: colors.bg, color: colors.text, border: `1.5px solid ${colors.border}` }}>
                    <span className="status-dot" style={{ background: colors.dot }} />
                    {c.statusLabel}
                  </span>
                  {c.visaDaysLeft !== undefined && (
                    <span className="candidate-days" style={{ color: colors.text }}>{c.visaDaysLeft}d remaining</span>
                  )}
                  {clickable && <span className="candidate-tap-hint">Tap to review →</span>}
                </div>
              </div>
            );
          })
        )}
        <div style={{ height: 100 }} />
      </div>

      {/* Detail Sheet */}
      {selected && (
        <CandidateDetail candidate={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}
function LocationIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
}
