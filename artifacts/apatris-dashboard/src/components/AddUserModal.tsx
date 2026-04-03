import { useState } from "react";
import { X, UserPlus, Shield, Trash2, RefreshCw } from "lucide-react";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";

interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string;
}

const ROLE_INFO = {
  T1: { label: "T1 — Executive",   desc: "Full access + financials",      color: "#6366F1" },
  T2: { label: "T2 — Legal",       desc: "Compliance + document approval", color: "#059669" },
  T3: { label: "T3 — Operations",  desc: "Candidates + pipeline",          color: "#D97706" },
  T4: { label: "T4 — Candidate",   desc: "Own profile only",               color: "#9CA3AF" },
};

export default function AddUserModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const { token } = useAuth();

  const [tab, setTab]           = useState<"add" | "list">("add");
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole]         = useState<"T1"|"T2"|"T3"|"T4">("T3");
  const [saving, setSaving]     = useState(false);

  const [users, setUsers]       = useState<SystemUser[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  async function handleAddUser() {
    if (!name.trim())    { showToast("Full name is required", "error"); return; }
    if (!email.trim())   { showToast("Work email is required", "error"); return; }
    if (password.length < 8) { showToast("Password must be at least 8 characters", "error"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/eej/auth/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });
      const data = await res.json() as { error?: string; user?: SystemUser };
      if (!res.ok) {
        showToast(data.error ?? "Failed to create user", "error");
      } else {
        showToast(`${data.user?.name} added as ${role}`, "success");
        setName(""); setEmail(""); setPassword(""); setRole("T3");
        loadUsers();
        setTab("list");
      }
    } catch {
      showToast("Network error — could not save user", "error");
    } finally {
      setSaving(false);
    }
  }

  async function loadUsers() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/eej/auth/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { users?: SystemUser[] };
      setUsers(data.users ?? []);
    } catch {
      showToast("Could not load users", "error");
    } finally {
      setLoadingList(false);
    }
  }

  async function handleDelete(user: SystemUser) {
    if (!confirm(`Remove ${user.name} (${user.email})? They will no longer be able to log in.`)) return;
    try {
      const res = await fetch(`/api/eej/auth/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showToast(`${user.name} removed`, "success");
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
      } else {
        showToast("Could not remove user", "error");
      }
    } catch {
      showToast("Network error", "error");
    }
  }

  function openList() {
    setTab("list");
    loadUsers();
  }

  const inp = { style: { width: "100%", padding: "10px 12px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, fontFamily: "inherit", color: "#111827", background: "#fff", boxSizing: "border-box" as const, outline: "none" } };

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet" style={{ maxHeight: "92%" }} onClick={(e) => e.stopPropagation()}>
        <div className="detail-handle" />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>User Management</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Manage Airtable staff accounts</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color="#9CA3AF" strokeWidth={2.5} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {(["add", "list"] as const).map((t) => (
            <button key={t}
              onClick={() => t === "list" ? openList() : setTab("add")}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                background: tab === t ? "#1B2A4A" : "#F3F4F6",
                color:      tab === t ? "#FFD600"  : "#6B7280" }}>
              {t === "add" ? "+ Add User" : "View All Users"}
            </button>
          ))}
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {tab === "add" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Full Name *</label>
                <input {...inp} type="text" placeholder="e.g. Jan Kowalski" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Work Email *</label>
                <input {...inp} type="email" placeholder="jan@euro-edu-jobs.eu" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Password * (min 8 chars)</label>
                <input {...inp} type="password" placeholder="Strong password" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>Access Role *</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(Object.entries(ROLE_INFO) as [keyof typeof ROLE_INFO, typeof ROLE_INFO[keyof typeof ROLE_INFO]][]).map(([key, info]) => (
                    <button key={key} onClick={() => setRole(key)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                        border: `2px solid ${role === key ? info.color : "#E5E7EB"}`,
                        background: role === key ? info.color + "10" : "#fff",
                        cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                      <Shield size={14} color={info.color} strokeWidth={2} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: info.color }}>{info.label}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{info.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "list" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <button onClick={loadUsers} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>
                  <RefreshCw size={12} strokeWidth={2} /> Refresh
                </button>
              </div>
              {loadingList ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
              ) : users.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: "#9CA3AF", fontSize: 13 }}>No users found</div>
              ) : (
                users.map((u) => {
                  const roleInfo = ROLE_INFO[u.role as keyof typeof ROLE_INFO] ?? ROLE_INFO.T3;
                  return (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{u.name}</div>
                        <div style={{ fontSize: 12, color: "#6B7280" }}>{u.email}</div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: roleInfo.color, background: roleInfo.color + "15", padding: "2px 7px", borderRadius: 4, display: "inline-block", marginTop: 3 }}>
                          {u.role}
                        </span>
                      </div>
                      <button onClick={() => handleDelete(u)} style={{ background: "none", border: "1px solid #FCA5A5", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#EF4444" }}>
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {tab === "add" && (
          <div style={{ paddingTop: 16, borderTop: "1px solid #F3F4F6", marginTop: 8 }}>
            <button
              onClick={handleAddUser}
              disabled={saving}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px 0",
                background: saving ? "#E5C000" : "#FFD600", border: "none", borderRadius: 10,
                fontWeight: 800, fontSize: 14, color: "#1B2A4A", cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: saving ? 0.8 : 1 }}>
              <UserPlus size={15} strokeWidth={2.5} />
              {saving ? "Creating in Airtable…" : "Create Staff Account"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
