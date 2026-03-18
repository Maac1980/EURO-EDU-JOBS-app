import { useState, useMemo } from "react";
import { Search, MapPin, SlidersHorizontal, ChevronRight } from "lucide-react";
import { MOCK_CANDIDATES, type DocStatus, type Candidate } from "@/data/mockData";
import CandidateDetail from "./CandidateDetail";
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
          <Search size={15} color="#9CA3AF" strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <input
            className="search-input"
            type="search"
            placeholder="Search name or role…"
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
          {perms.approveDocs && (
            <span className="candidates-hint">Tap a card to review documents</span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="candidates-list">
        {filtered.length === 0 ? (
          <div className="candidates-empty">
            <Search size={32} color="#D1D5DB" strokeWidth={1.5} />
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
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{c.flag}</span>
                </div>
                <div className="candidate-info">
                  <div className="candidate-name">{c.name}</div>
                  <div className="candidate-role">{c.role}</div>
                  <div className="candidate-location">
                    <MapPin size={10} color="#9CA3AF" strokeWidth={2} style={{ flexShrink: 0 }} />
                    <span>{c.location}</span>
                  </div>
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
        <CandidateDetail candidate={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
