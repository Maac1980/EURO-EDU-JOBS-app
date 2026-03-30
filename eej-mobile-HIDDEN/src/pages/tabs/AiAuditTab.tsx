import { useEffect, useState } from "react";
import { Shield, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useToast } from "@/lib/toast";

const API_BASE = "/api";
const PAGE_SIZE = 20;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };
}

interface AuditEntry {
  id: string;
  timestamp: string;
  actionType: string;
  inputSummary: string;
  outputSummary: string;
  model: string;
  confidence: number;
  humanOverride: boolean;
}

const ACTION_TYPES = [
  "All",
  "document_analysis",
  "compliance_check",
  "risk_assessment",
  "candidate_screening",
  "contract_generation",
  "translation",
];

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  let bg = "#FEF2F2";
  let color = "#DC2626";
  let label = "Low";
  if (pct >= 80) { bg = "#ECFDF5"; color = "#059669"; label = "High"; }
  else if (pct >= 50) { bg = "#FFFBEB"; color = "#D97706"; label = "Medium"; }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px",
      borderRadius: 20, background: bg, color, fontSize: 10, fontWeight: 700,
    }}>
      {label} ({pct}%)
    </span>
  );
}

export default function AiAuditTab() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchAudit();
  }, [filter, page]);

  async function fetchAudit() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filter !== "All") params.set("actionType", filter);
      const res = await fetch(`${API_BASE}/audit?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const items = data.entries || data.audits || data.data || data || [];
      setEntries(Array.isArray(items) ? items.map((e: any) => ({
        id: e.id || e._id || String(Math.random()),
        timestamp: e.timestamp || e.createdAt || e.date || "",
        actionType: e.actionType || e.action || e.type || "unknown",
        inputSummary: e.inputSummary || e.input || e.description || "",
        outputSummary: e.outputSummary || e.output || e.result || "",
        model: e.model || e.modelUsed || "claude-3",
        confidence: typeof e.confidence === "number" ? e.confidence : (e.confidence ? parseFloat(e.confidence) : 0.5),
        humanOverride: !!e.humanOverride,
      })) : []);
      setTotalPages(data.totalPages || Math.ceil((data.total || items.length) / PAGE_SIZE) || 1);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(ts: string) {
    if (!ts) return "-";
    try { return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return ts; }
  }

  function formatActionType(t: string) {
    return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Compliance</div>
          <div className="tab-greeting-name">AI Audit Trail</div>
        </div>
      </div>

      {/* EU AI Act Notice */}
      <div style={{
        background: "#FEF2F2", borderRadius: 10, padding: "10px 12px", marginBottom: 12,
        display: "flex", alignItems: "flex-start", gap: 8, border: "1.5px solid #FECACA",
      }}>
        <AlertTriangle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, color: "#991B1B", lineHeight: 1.4 }}>
          <strong>EU AI Act Compliance:</strong> All AI-assisted decisions are logged in this audit trail
          per Article 14 (Human Oversight) and Article 13 (Transparency). Records are retained for 5 years.
        </div>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 12 }}>
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(1); }}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
            fontSize: 13, fontWeight: 600, background: "#fff", color: "#111827",
          }}
        >
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>{t === "All" ? "All Action Types" : formatActionType(t)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading audit log...</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>No audit entries found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => (
            <div key={e.id} style={{
              background: "#fff", borderRadius: 12, border: "1.5px solid #E5E7EB", padding: "12px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#6B7280" }}>{formatDate(e.timestamp)}</span>
                <ConfidenceBadge confidence={e.confidence} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Shield size={14} color="#DC2626" />
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#374151", background: "#F3F4F6",
                  padding: "2px 8px", borderRadius: 6,
                }}>{formatActionType(e.actionType)}</span>
                <span style={{
                  fontSize: 10, color: "#6B7280", background: "#F9FAFB",
                  padding: "2px 6px", borderRadius: 4,
                }}>{e.model}</span>
              </div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>
                <strong>Input:</strong> {e.inputSummary || "-"}
              </div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
                <strong>Output:</strong> {e.outputSummary || "-"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 11, color: "#6B7280", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={e.humanOverride} readOnly style={{ accentColor: "#DC2626" }} />
                  Human Override
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center", gap: 12,
          marginTop: 16, paddingBottom: 12,
        }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              background: page <= 1 ? "#F3F4F6" : "#fff", border: "1.5px solid #E5E7EB",
              borderRadius: 8, padding: "6px 10px", cursor: page <= 1 ? "not-allowed" : "pointer",
            }}
          >
            <ChevronLeft size={16} color={page <= 1 ? "#D1D5DB" : "#374151"} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              background: page >= totalPages ? "#F3F4F6" : "#fff", border: "1.5px solid #E5E7EB",
              borderRadius: 8, padding: "6px 10px", cursor: page >= totalPages ? "not-allowed" : "pointer",
            }}
          >
            <ChevronRight size={16} color={page >= totalPages ? "#D1D5DB" : "#374151"} />
          </button>
        </div>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}
