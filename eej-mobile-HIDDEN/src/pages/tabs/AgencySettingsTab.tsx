import { useState, useEffect } from "react";
import { Settings, Save, ExternalLink } from "lucide-react";
import { useToast } from "@/lib/toast";
function authHeaders(): Record<string, string> { const t = localStorage.getItem("eej_token_v2"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
export default function AgencySettingsTab() {
  const { showToast } = useToast();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", role: "" });
  const [billing, setBilling] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/admin/profile", { headers: authHeaders() }).then(r => r.json()).then(d => setForm({ fullName: d.fullName ?? "", email: d.email ?? "", phone: d.phone ?? "", role: d.role ?? "" })).catch(() => {}).finally(() => setLoading(false));
    fetch("/api/billing/status", { headers: authHeaders() }).then(r => r.json()).then(setBilling).catch(() => {});
  }, []);
  async function save() {
    try { await fetch("/api/admin/profile", { method: "PATCH", headers: authHeaders(), body: JSON.stringify(form) }); showToast("Saved", "success"); setEditing(false); } catch { showToast("Failed", "error"); }
  }
  async function openPortal() {
    try { const r = await fetch("/api/billing/portal", { method: "POST", headers: authHeaders() }); const d = await r.json(); if (d.url) window.open(d.url, "_blank"); } catch { showToast("Portal unavailable", "error"); }
  }
  return (
    <div className="tab-page">
      <div className="tab-greeting"><div><div className="tab-greeting-label">Admin</div><div className="tab-greeting-name">Agency Settings</div></div>
        <button onClick={() => editing ? save() : setEditing(true)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#1B2A4A", color: "#FFD600", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{editing ? <><Save size={12} style={{ display: "inline", marginRight: 4 }} />Save</> : <><Settings size={12} style={{ display: "inline", marginRight: 4 }} />Edit</>}</button>
      </div>
      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading...</div>}
      {!loading && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Agency Profile</div>
          {["fullName", "email", "phone", "role"].map(f => (
            <div key={f} style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 2 }}>{f === "fullName" ? "Full Name" : f.charAt(0).toUpperCase() + f.slice(1)}</label>
              {editing ? <input value={(form as any)[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13 }} /> : <div style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{(form as any)[f] || "—"}</div>}
            </div>
          ))}
        </div>
      )}
      {billing && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Subscription</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ color: "#6B7280" }}>Plan:</span><span style={{ fontWeight: 700 }}>{billing.plan ?? "None"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ color: "#6B7280" }}>Status:</span><span style={{ fontWeight: 600, color: billing.billingStatus === "active" ? "#059669" : "#D97706" }}>{billing.billingStatus ?? "—"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}><span style={{ color: "#6B7280" }}>Worker Limit:</span><span style={{ fontWeight: 600 }}>{billing.workerLimit ?? "—"}</span></div>
          <button onClick={openPortal} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1.5px solid #1B2A4A", background: "#fff", color: "#1B2A4A", fontWeight: 600, cursor: "pointer", fontSize: 13 }}><ExternalLink size={12} style={{ display: "inline", marginRight: 4 }} />Manage Billing</button>
        </div>
      )}
      <div style={{ height: 100 }} />
    </div>
  );
}
