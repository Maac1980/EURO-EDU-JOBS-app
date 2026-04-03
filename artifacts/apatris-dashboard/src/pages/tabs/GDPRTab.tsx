import { useState, useEffect } from "react";
import { Shield, Download, Trash2, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/lib/toast";
function authHeaders(): Record<string, string> { const t = sessionStorage.getItem("eej_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
export default function GDPRTab() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"consent" | "requests" | "export">("consent");
  const [workers, setWorkers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportId, setExportId] = useState("");
  useEffect(() => { fetch("/api/eej/candidates", { headers: authHeaders() }).then(r => r.json()).then(d => setWorkers(d.candidates ?? [])).catch(() => setWorkers([])).finally(() => setLoading(false)); }, []);
  async function exportData() {
    if (!exportId) { showToast("Select a worker", "error"); return; }
    try { const r = await fetch(`/api/gdpr/export/${exportId}`, { headers: authHeaders() }); const d = await r.json(); const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `gdpr-export-${exportId}.json`; a.click(); showToast("Data exported", "success"); } catch { showToast("Export failed", "error"); }
  }
  return (
    <div className="tab-page">
      <div className="tab-greeting"><div><div className="tab-greeting-label">Compliance</div><div className="tab-greeting-name">GDPR Management</div></div></div>
      <div style={{ background: "#F5F3FF", border: "1.5px solid #DDD6FE", borderRadius: 12, padding: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Shield size={16} color="#7C3AED" /><div style={{ fontSize: 12, color: "#6D28D9" }}>GDPR / RODO Compliant — All data processing logged</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["consent", "requests", "export"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: 8, borderRadius: 10, border: tab === t ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB", background: tab === t ? "#1B2A4A" : "#fff", color: tab === t ? "#FFD600" : "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>{t === "consent" ? "Consent Records" : t === "requests" ? "Data Requests" : "Export Data"}</button>
        ))}
      </div>
      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading...</div>}
      {tab === "consent" && !loading && (
        <>{workers.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>No consent records</div> : workers.map((w: any) => (
          <div key={w.id} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: 12, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontWeight: 600, fontSize: 13 }}>{w.name}</div><div style={{ fontSize: 11, color: "#6B7280" }}>{w.email}</div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>{w.rodoConsentDate ? <><CheckCircle size={12} color="#059669" /><span style={{ color: "#059669" }}>{w.rodoConsentDate}</span></> : <><Clock size={12} color="#D97706" /><span style={{ color: "#D97706" }}>Pending</span></>}</div>
          </div>
        ))}</>
      )}
      {tab === "requests" && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>No pending GDPR requests</div>}
      {tab === "export" && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Export Worker Data</div>
          <select value={exportId} onChange={e => setExportId(e.target.value)} style={{ width: "100%", padding: 10, border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
            <option value="">Select worker...</option>{workers.map((w: any) => <option key={w.id} value={w.id}>{w.name} — {w.email}</option>)}
          </select>
          <button onClick={exportData} style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 700, cursor: "pointer" }}><Download size={14} style={{ display: "inline", marginRight: 4 }} />Export JSON</button>
        </div>
      )}
      <div style={{ height: 100 }} />
    </div>
  );
}
