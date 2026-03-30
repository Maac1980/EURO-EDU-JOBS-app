import { useState, useEffect } from "react";
import { Building2, Plus, Trash2, Edit, X, Check } from "lucide-react";
import { useToast } from "@/lib/toast";
function authHeaders(): Record<string, string> { const t = localStorage.getItem("eej_token_v2"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
interface Client { id: string; name: string; contactPerson?: string; email?: string; phone?: string; nip?: string; billingRate?: number; }
export default function ClientsTab() {
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", contactPerson: "", email: "", phone: "", nip: "", billingRate: "" });
  useEffect(() => { fetch("/api/clients", { headers: authHeaders() }).then(r => r.json()).then(d => setClients(d.clients ?? [])).catch(() => setClients([])).finally(() => setLoading(false)); }, []);
  async function addClient() {
    if (!form.name.trim()) { showToast("Name required", "error"); return; }
    try { const r = await fetch("/api/clients", { method: "POST", headers: authHeaders(), body: JSON.stringify({ ...form, billingRate: Number(form.billingRate) || 0 }) }); const d = await r.json(); if (d.client) setClients([...clients, d.client]); showToast("Client added", "success"); setShowForm(false); setForm({ name: "", contactPerson: "", email: "", phone: "", nip: "", billingRate: "" }); } catch { showToast("Failed to add client", "error"); }
  }
  async function deleteClient(id: string) {
    try { await fetch(`/api/clients/${id}`, { method: "DELETE", headers: authHeaders() }); setClients(clients.filter(c => c.id !== id)); showToast("Client deleted", "success"); } catch { showToast("Failed", "error"); }
  }
  return (
    <div className="tab-page">
      <div className="tab-greeting"><div><div className="tab-greeting-label">Management</div><div className="tab-greeting-name">Clients</div></div>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#1B2A4A", color: "#FFD600", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Plus size={13} style={{ display: "inline", marginRight: 4 }} />Add Client</button>
      </div>
      {showForm && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 14, marginBottom: 12 }}>
          {["name","contactPerson","email","phone","nip","billingRate"].map(f => (
            <div key={f} style={{ marginBottom: 8 }}><label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 2 }}>{f === "billingRate" ? "Billing Rate (PLN/h)" : f === "nip" ? "NIP" : f.replace(/([A-Z])/g, " $1").trim()}</label>
              <input type={f === "billingRate" ? "number" : "text"} value={(form as any)[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13 }} /></div>
          ))}
          <div style={{ display: "flex", gap: 8 }}><button onClick={addClient} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontWeight: 700, cursor: "pointer" }}><Check size={13} /> Save</button><button onClick={() => setShowForm(false)} style={{ padding: 10, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}><X size={13} /></button></div>
        </div>
      )}
      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading clients...</div>}
      {!loading && clients.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}><Building2 size={28} /><div style={{ marginTop: 8 }}>No clients yet</div></div>}
      {clients.map(c => (
        <div key={c.id} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 14, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div><div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{c.contactPerson} · {c.email}</div></div>
            <button onClick={() => deleteClient(c.id)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer" }}><Trash2 size={14} /></button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 11, color: "#6B7280" }}>
            {c.phone && <span>{c.phone}</span>}{c.nip && <span>NIP: {c.nip}</span>}{c.billingRate && <span style={{ color: "#059669", fontWeight: 600 }}>{c.billingRate} PLN/h</span>}
          </div>
        </div>
      ))}
      <div style={{ height: 100 }} />
    </div>
  );
}
