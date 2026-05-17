import { useState, useEffect, useMemo } from "react";
import { Shield, Sparkles, ChevronRight, FileSearch, X } from "lucide-react";
import { fetchAiReasoning, type AiReasoningEntry } from "@/lib/api";
import WorkerCockpit from "@/components/WorkerCockpit";

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("eej_token_v2");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}

interface AuditEntry {
  id: string;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  actor?: string;
  timestamp?: string;
  workerId?: string;
}

// Combined timeline of every AI decision + every state change, tenant-wide.
// Liza / Anna come here when a regulator asks "why did the system update X
// on date Y" — this is the legal evidence trail.
type CombinedEntry =
  | { kind: "audit"; at: Date; entry: AuditEntry }
  | { kind: "reasoning"; at: Date; entry: AiReasoningEntry };

export default function AiAuditTab() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [reasoning, setReasoning] = useState<AiReasoningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "ai" | "audit">("all");
  const [decisionTypeFilter, setDecisionTypeFilter] = useState<string>("all");
  // Worker filter — clicking a worker name in a reasoning row narrows the
  // timeline to that worker. Helpful when Liza needs to show inspector exactly
  // what AI did for one person across many decisions.
  const [workerFilter, setWorkerFilter] = useState<{ id: string; name: string } | null>(null);
  // Click-to-open cockpit from a worker name (separate gesture: long-press
  // equivalent here is just tapping the name twice — first tap filters, second
  // tap on the filter chip opens the cockpit). For simplicity: a small "view
  // cockpit" button next to the worker filter chip.
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/audit", { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : { entries: [] }))
        .then((d) => (d.entries ?? d.audit ?? []) as AuditEntry[])
        .catch(() => [] as AuditEntry[]),
      fetchAiReasoning({ limit: 200 }).catch(() => [] as AiReasoningEntry[]),
    ])
      .then(([a, r]) => {
        setAudit(a);
        setReasoning(r);
      })
      .finally(() => setLoading(false));
  }, []);

  const combined: CombinedEntry[] = useMemo(() => {
    const out: CombinedEntry[] = [];
    audit.forEach((e) =>
      out.push({ kind: "audit", at: new Date(e.timestamp ?? 0), entry: e }),
    );
    reasoning.forEach((e) =>
      out.push({ kind: "reasoning", at: new Date(e.created_at), entry: e }),
    );
    return out.sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [audit, reasoning]);

  const decisionTypes = useMemo(() => {
    const set = new Set<string>();
    reasoning.forEach((r) => set.add(r.decision_type));
    return Array.from(set).sort();
  }, [reasoning]);

  const filtered = useMemo(() => {
    return combined.filter((c) => {
      if (filter === "ai" && c.kind !== "reasoning") return false;
      if (filter === "audit" && c.kind !== "audit") return false;
      if (decisionTypeFilter !== "all" && c.kind === "reasoning" && c.entry.decision_type !== decisionTypeFilter) {
        return false;
      }
      // Worker filter applies to reasoning rows (worker_id) and audit rows
      // (workerId). Either match keeps the row.
      if (workerFilter) {
        if (c.kind === "reasoning" && c.entry.worker_id !== workerFilter.id) return false;
        if (c.kind === "audit" && c.entry.workerId !== workerFilter.id) return false;
      }
      return true;
    });
  }, [combined, filter, decisionTypeFilter, workerFilter]);

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Compliance</div>
          <div className="tab-greeting-name">AI & Audit Trail</div>
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{filtered.length} entries</div>
      </div>

      <div
        style={{
          background: "#EFF6FF",
          border: "1.5px solid #BFDBFE",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Shield size={16} color="#3B82F6" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1E40AF" }}>EU AI Act compliance</div>
          <div style={{ fontSize: 11, color: "#3B82F6" }}>
            Every AI decision is logged with input, reasoning, reviewer, model.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {(["all", "ai", "audit"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              border: filter === f ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB",
              background: filter === f ? "#1B2A4A" : "#fff",
              color: filter === f ? "#FFD600" : "#6B7280",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {f === "all" ? "Everything" : f === "ai" ? "AI decisions" : "State changes"}
          </button>
        ))}
      </div>

      {workerFilter && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: 10,
            marginBottom: 10,
            fontSize: 12,
            color: "#1B2A4A",
          }}
        >
          <Sparkles size={14} color="#3B82F6" strokeWidth={2.2} />
          <span style={{ flex: 1 }}>
            Filtering to <strong>{workerFilter.name}</strong>
          </span>
          <button
            onClick={() => setOpenWorkerId(workerFilter.id)}
            style={{
              background: "transparent",
              border: "1px solid #BFDBFE",
              borderRadius: 6,
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 600,
              color: "#3B82F6",
              cursor: "pointer",
            }}
          >
            Open cockpit
          </button>
          <button
            onClick={() => setWorkerFilter(null)}
            style={{
              background: "transparent",
              border: "1px solid #BFDBFE",
              borderRadius: 6,
              padding: "2px 6px",
              cursor: "pointer",
              color: "#3B82F6",
              display: "inline-flex",
              alignItems: "center",
            }}
            aria-label="Clear worker filter"
          >
            <X size={11} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {filter === "ai" && decisionTypes.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => setDecisionTypeFilter("all")}
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              border: decisionTypeFilter === "all" ? "1.5px solid #3B82F6" : "1px solid #E5E7EB",
              background: decisionTypeFilter === "all" ? "#EFF6FF" : "#fff",
              color: decisionTypeFilter === "all" ? "#3B82F6" : "#6B7280",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            All types
          </button>
          {decisionTypes.map((dt) => (
            <button
              key={dt}
              onClick={() => setDecisionTypeFilter(dt)}
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                border: decisionTypeFilter === dt ? "1.5px solid #3B82F6" : "1px solid #E5E7EB",
                background: decisionTypeFilter === dt ? "#EFF6FF" : "#fff",
                color: decisionTypeFilter === dt ? "#3B82F6" : "#6B7280",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {dt.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
          <FileSearch size={28} />
          <div style={{ marginTop: 8 }}>No entries match this filter.</div>
        </div>
      )}

      {filtered.slice(0, 100).map((c, i) => {
        if (c.kind === "reasoning") {
          const r = c.entry;
          const confidencePct =
            r.confidence !== null && r.confidence !== undefined
              ? Math.round(Number(r.confidence) * 100)
              : null;
          const fields = Array.isArray(r.output?.appliedFields) ? r.output.appliedFields.join(", ") : null;
          return (
            <div
              key={`r-${r.id ?? i}`}
              style={{
                background: "#FFFFFF",
                border: "1px solid #BFDBFE",
                borderLeft: "3px solid #3B82F6",
                borderRadius: 10,
                padding: 10,
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                <Sparkles size={12} color="#3B82F6" strokeWidth={2.2} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1B2A4A", textTransform: "capitalize" }}>
                  {r.decision_type.replace(/_/g, " ")}
                </span>
                {confidencePct !== null && (
                  <span
                    style={{
                      padding: "1px 6px",
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 999,
                      background: confidencePct >= 80 ? "#ECFDF5" : confidencePct >= 50 ? "#FFFBEB" : "#FEF2F2",
                      color: confidencePct >= 80 ? "#059669" : confidencePct >= 50 ? "#D97706" : "#DC2626",
                    }}
                  >
                    {confidencePct}%
                  </span>
                )}
                <span
                  style={{
                    padding: "1px 6px",
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 4,
                    textTransform: "uppercase",
                    letterSpacing: 0.04,
                    background:
                      r.decided_action === "applied"
                        ? "#ECFDF5"
                        : r.decided_action === "pending_review"
                          ? "#FFFBEB"
                          : r.decided_action === "rejected"
                            ? "#FEF2F2"
                            : "#F3F4F6",
                    color:
                      r.decided_action === "applied"
                        ? "#059669"
                        : r.decided_action === "pending_review"
                          ? "#D97706"
                          : r.decided_action === "rejected"
                            ? "#DC2626"
                            : "#6B7280",
                  }}
                >
                  {r.decided_action ?? "—"}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#9CA3AF" }}>
                  {new Date(r.created_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.4 }}>
                {r.worker_name && r.worker_id && (
                  <>
                    <button
                      onClick={() => setWorkerFilter({ id: r.worker_id!, name: r.worker_name! })}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        fontWeight: 700,
                        color: "#3B82F6",
                        cursor: "pointer",
                        textDecoration: "underline",
                        textDecorationStyle: "dotted",
                        fontSize: 11,
                      }}
                      title="Filter to this worker"
                    >
                      {r.worker_name}
                    </button>
                    {" · "}
                  </>
                )}
                {r.worker_name && !r.worker_id && (
                  <>
                    <strong>{r.worker_name}</strong>
                    {" · "}
                  </>
                )}
                {r.input_summary && <span>{r.input_summary}</span>}
                {fields && (
                  <>
                    {" "}· fields: <span style={{ color: "#1B2A4A", fontWeight: 600 }}>{fields}</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>
                Reviewer: {r.reviewed_by ?? "—"} · Model: {r.model ?? "—"}
              </div>
            </div>
          );
        }

        // audit entry
        const e = c.entry;
        return (
          <div
            key={`a-${e.id ?? i}`}
            style={{
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 10,
              padding: 10,
              marginBottom: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", textTransform: "capitalize" }}>
                  {e.action}
                </div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                  {e.field ? `Field: ${e.field}` : ""} {e.actor ? ` · by ${e.actor}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                {e.timestamp
                  ? new Date(e.timestamp).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""}
              </div>
            </div>
            {e.oldValue && (
              <div style={{ fontSize: 11, marginTop: 4 }}>
                <span style={{ color: "#DC2626" }}>Old: {e.oldValue}</span> →{" "}
                <span style={{ color: "#059669" }}>New: {e.newValue}</span>
              </div>
            )}
          </div>
        );
      })}

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
