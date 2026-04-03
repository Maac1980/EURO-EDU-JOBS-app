import { useState, useEffect } from "react";
import { Shield, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useToast } from "@/lib/toast";
function authHeaders(): Record<string, string> { const t = sessionStorage.getItem("eej_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
interface AuditEntry { id: string; action: string; field?: string; oldValue?: string; newValue?: string; actor?: string; timestamp?: string; }
export default function AiAuditTab() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  useEffect(() => { fetch("/api/audit", { headers: authHeaders() }).then(r => r.json()).then(d => setEntries(d.entries ?? d.audit ?? [])).catch(() => setEntries([])).finally(() => setLoading(false)); }, []);
  const filtered = filter === "all" ? entries : entries.filter(e => e.action?.includes(filter));
  return (
    <div className="tab-page">
      <div className="tab-greeting"><div><div className="tab-greeting-label">Compliance</div><div className="tab-greeting-name">AI Audit Trail</div></div></div>
      <div style={{ background: "#EFF6FF", border: "1.5px solid #BFDBFE", borderRadius: 12, padding: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Shield size={16} color="#3B82F6" /><div><div style={{ fontSize: 13, fontWeight: 700, color: "#1E40AF" }}>EU AI Act Compliance</div><div style={{ fontSize: 11, color: "#3B82F6" }}>All AI decisions are logged with transparency</div></div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {["all", "create", "update", "stage_change", "scan"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "4px 10px", borderRadius: 20, border: filter === f ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB", background: filter === f ? "#1B2A4A" : "#fff", color: filter === f ? "#FFD600" : "#6B7280", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>{f}</button>
        ))}
      </div>
      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading audit log...</div>}
      {!loading && filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}><Shield size={28} /><div style={{ marginTop: 8 }}>No audit entries</div></div>}
      {filtered.slice(0, 50).map((e, i) => (
        <div key={e.id ?? i} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: 12, marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{e.action}</div><div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{e.field ? `Field: ${e.field}` : ""} {e.actor ? `by ${e.actor}` : ""}</div></div>
            <div style={{ fontSize: 10, color: "#9CA3AF" }}>{e.timestamp ? new Date(e.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</div>
          </div>
          {e.oldValue && <div style={{ fontSize: 11, marginTop: 4 }}><span style={{ color: "#DC2626" }}>Old: {e.oldValue}</span> → <span style={{ color: "#059669" }}>New: {e.newValue}</span></div>}
        </div>
      ))}
      <div style={{ height: 100 }} />
    </div>
  );
}
