import { useEffect, useState } from "react";
import { Building2, Plus, Trash2, Pencil, X } from "lucide-react";
import { useToast } from "@/lib/toast";

const API_BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };
}

interface Client {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  nip: string;
  billingRate: number;
}

const EMPTY_CLIENT: Omit<Client, "id"> = {
  name: "", contactPerson: "", email: "", phone: "", nip: "", billingRate: 0,
};

export default function ClientsTab() {
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Client, "id">>(EMPTY_CLIENT);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/clients`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setClients(data.clients || data || []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setForm(EMPTY_CLIENT);
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(c: Client) {
    setForm({ name: c.name, contactPerson: c.contactPerson, email: c.email, phone: c.phone, nip: c.nip, billingRate: c.billingRate });
    setEditId(c.id);
    setShowForm(true);
  }

  async function saveClient() {
    try {
      if (editId) {
        const res = await fetch(`${API_BASE}/clients/${editId}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("Failed");
        setClients((prev) => prev.map((c) => (c.id === editId ? { ...c, ...form } : c)));
        showToast("Client updated", "success");
      } else {
        const res = await fetch(`${API_BASE}/clients`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setClients((prev) => [...prev, data.client || data]);
        showToast("Client added", "success");
      }
      setShowForm(false);
      setEditId(null);
    } catch {
      showToast("Failed to save client", "error");
    }
  }

  async function deleteClient(id: string) {
    try {
      await fetch(`${API_BASE}/clients/${id}`, { method: "DELETE", headers: authHeaders() });
      setClients((prev) => prev.filter((c) => c.id !== id));
      showToast("Client deleted", "success");
    } catch {
      showToast("Failed to delete client", "error");
    }
    setDeleteConfirm(null);
  }

  function setField(key: keyof Omit<Client, "id">, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB",
    fontSize: 13, color: "#111827", background: "#fff", boxSizing: "border-box",
  };

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Management</div>
          <div className="tab-greeting-name">Clients</div>
        </div>
      </div>

      <button
        onClick={openAdd}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", marginBottom: 12,
          borderRadius: 10, border: "none", background: "#6366F1", color: "#fff",
          fontWeight: 700, fontSize: 13, cursor: "pointer", width: "100%", justifyContent: "center",
        }}
      >
        <Plus size={16} /> Add Client
      </button>

      {/* Form Modal */}
      {showForm && (
        <div style={{
          background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: 16,
          marginBottom: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{editId ? "Edit Client" : "New Client"}</span>
            <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={18} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input placeholder="Company Name" value={form.name} onChange={(e) => setField("name", e.target.value)} style={inputStyle} />
            <input placeholder="Contact Person" value={form.contactPerson} onChange={(e) => setField("contactPerson", e.target.value)} style={inputStyle} />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} style={inputStyle} />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setField("phone", e.target.value)} style={inputStyle} />
            <input placeholder="NIP" value={form.nip} onChange={(e) => setField("nip", e.target.value)} style={inputStyle} />
            <input placeholder="Billing Rate (PLN/hr)" type="number" value={form.billingRate || ""} onChange={(e) => setField("billingRate", parseFloat(e.target.value) || 0)} style={inputStyle} />
            <button onClick={saveClient} style={{
              padding: "10px 16px", borderRadius: 10, border: "none", background: "#059669",
              color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 4,
            }}>
              {editId ? "Update Client" : "Add Client"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading clients...</div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>No clients yet. Add your first client above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clients.map((c) => (
            <div key={c.id} style={{
              background: "#fff", borderRadius: 12, border: "1.5px solid #E5E7EB", padding: "12px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Building2 size={16} color="#6366F1" />
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{c.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
                    <div>{c.contactPerson}</div>
                    <div>{c.email} &middot; {c.phone}</div>
                    <div>NIP: {c.nip}</div>
                    <div style={{ fontWeight: 600, color: "#059669" }}>Rate: {c.billingRate?.toFixed(2)} PLN/hr</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => openEdit(c)} style={{
                    background: "#EEF2FF", border: "none", borderRadius: 8, padding: 6, cursor: "pointer",
                  }}>
                    <Pencil size={14} color="#6366F1" />
                  </button>
                  {deleteConfirm === c.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => deleteClient(c.id)} style={{
                        background: "#DC2626", border: "none", borderRadius: 8, padding: "4px 8px",
                        color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer",
                      }}>Confirm</button>
                      <button onClick={() => setDeleteConfirm(null)} style={{
                        background: "#E5E7EB", border: "none", borderRadius: 8, padding: "4px 8px",
                        color: "#374151", fontSize: 10, fontWeight: 700, cursor: "pointer",
                      }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(c.id)} style={{
                      background: "#FEF2F2", border: "none", borderRadius: 8, padding: 6, cursor: "pointer",
                    }}>
                      <Trash2 size={14} color="#DC2626" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}
