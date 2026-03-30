import { useEffect, useState } from "react";
import { Settings, Save, Pencil, X, ExternalLink, Building2 } from "lucide-react";
import { useToast } from "@/lib/toast";

const API_BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };
}

interface AgencyInfo {
  name: string;
  email: string;
  phone: string;
  nip: string;
  address: string;
  plan: string;
  workerCount: number;
  workerLimit: number;
}

const DEFAULT_INFO: AgencyInfo = {
  name: "", email: "", phone: "", nip: "", address: "",
  plan: "starter", workerCount: 0, workerLimit: 25,
};

export default function AgencySettingsTab() {
  const { showToast } = useToast();
  const [info, setInfo] = useState<AgencyInfo>(DEFAULT_INFO);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AgencyInfo>(DEFAULT_INFO);

  useEffect(() => {
    fetchInfo();
  }, []);

  async function fetchInfo() {
    setLoading(true);
    try {
      const [agencyRes, billingRes] = await Promise.all([
        fetch(`${API_BASE}/agency/info`, { headers: authHeaders() }),
        fetch(`${API_BASE}/billing/status`, { headers: authHeaders() }),
      ]);
      const agencyData = agencyRes.ok ? await agencyRes.json() : {};
      const billingData = billingRes.ok ? await billingRes.json() : {};
      const merged: AgencyInfo = {
        name: agencyData.name || agencyData.agencyName || "",
        email: agencyData.email || "",
        phone: agencyData.phone || "",
        nip: agencyData.nip || "",
        address: agencyData.address || "",
        plan: billingData.plan || billingData.planId || "starter",
        workerCount: billingData.workerCount ?? agencyData.workerCount ?? 0,
        workerLimit: billingData.workerLimit ?? agencyData.workerLimit ?? 25,
      };
      setInfo(merged);
      setDraft(merged);
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false);
    }
  }

  function startEdit() {
    setDraft({ ...info });
    setEditing(true);
  }

  function cancelEdit() {
    setDraft({ ...info });
    setEditing(false);
  }

  async function saveInfo() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/agency/info`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          name: draft.name, email: draft.email, phone: draft.phone,
          nip: draft.nip, address: draft.address,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setInfo({ ...info, name: draft.name, email: draft.email, phone: draft.phone, nip: draft.nip, address: draft.address });
      setEditing(false);
      showToast("Agency info updated", "success");
    } catch {
      showToast("Failed to save changes", "error");
    } finally {
      setSaving(false);
    }
  }

  async function openBillingPortal() {
    try {
      const res = await fetch(`${API_BASE}/billing/portal`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch {
      showToast("Failed to open billing portal", "error");
    }
  }

  function setField(key: keyof AgencyInfo, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const planColors: Record<string, { bg: string; color: string }> = {
    starter: { bg: "#F3F4F6", color: "#374151" },
    professional: { bg: "#EEF2FF", color: "#6366F1" },
    enterprise: { bg: "#FFFBEB", color: "#D97706" },
  };
  const pc = planColors[info.plan] || planColors.starter;
  const usagePct = info.workerLimit > 0 ? Math.round((info.workerCount / info.workerLimit) * 100) : 0;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB",
    fontSize: 13, color: "#111827", background: "#fff", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 2 };
  const valueStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: "#111827", padding: "6px 0" };

  if (loading) {
    return (
      <div className="tab-page">
        <div style={{ textAlign: "center", padding: 60, color: "#9CA3AF" }}>Loading agency settings...</div>
      </div>
    );
  }

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Settings</div>
          <div className="tab-greeting-name">Agency Profile</div>
        </div>
      </div>

      {/* Subscription & Usage */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, background: pc.bg, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: pc.color, fontWeight: 500 }}>Current Plan</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: pc.color, textTransform: "capitalize" }}>{info.plan}</div>
        </div>
        <div style={{ flex: 1, background: usagePct > 90 ? "#FEF2F2" : "#ECFDF5", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: usagePct > 90 ? "#DC2626" : "#059669", fontWeight: 500 }}>Workers</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: usagePct > 90 ? "#DC2626" : "#059669" }}>
            {info.workerCount} / {info.workerLimit === 0 ? "\u221e" : info.workerLimit}
          </div>
          <div style={{
            height: 4, borderRadius: 2, background: "#E5E7EB", marginTop: 6, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 2, width: `${Math.min(usagePct, 100)}%`,
              background: usagePct > 90 ? "#DC2626" : "#059669",
            }} />
          </div>
        </div>
      </div>

      {/* Billing Portal Link */}
      <button
        onClick={openBillingPortal}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", marginBottom: 16,
          borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151",
          fontWeight: 600, fontSize: 13, cursor: "pointer", width: "100%", justifyContent: "center",
        }}
      >
        <ExternalLink size={14} /> Manage Billing & Subscription
      </button>

      {/* Agency Info */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Building2 size={18} color="#6B7280" />
            <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Agency Information</span>
          </div>
          {editing ? (
            <button onClick={cancelEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}>
              <X size={18} />
            </button>
          ) : (
            <button onClick={startEdit} style={{
              display: "flex", alignItems: "center", gap: 4, background: "#EEF2FF", border: "none",
              borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#6366F1", fontWeight: 700, fontSize: 12,
            }}>
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { key: "name" as const, label: "Agency Name" },
            { key: "email" as const, label: "Email" },
            { key: "phone" as const, label: "Phone" },
            { key: "nip" as const, label: "NIP (Tax ID)" },
            { key: "address" as const, label: "Address" },
          ].map(({ key, label }) => (
            <div key={key}>
              <div style={labelStyle}>{label}</div>
              {editing ? (
                <input
                  value={draft[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  style={inputStyle}
                />
              ) : (
                <div style={valueStyle}>{info[key] || "-"}</div>
              )}
            </div>
          ))}
        </div>

        {editing && (
          <button
            onClick={saveInfo}
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              width: "100%", padding: "10px 16px", borderRadius: 10, border: "none",
              background: saving ? "#D1D5DB" : "#059669", color: "#fff",
              fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", marginTop: 14,
            }}
          >
            <Save size={14} /> {saving ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}
