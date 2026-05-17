import React, { useState, useEffect } from "react";
import { UserPlus, Trash2, Pencil, X, Save, Loader2, ShieldAlert, Users, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

const LIME = "#E9FF70";
const LIME_BG = "rgba(233,255,112,0.08)";
const LIME_BORDER = "rgba(233,255,112,0.25)";

const inputCls = "w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-[#E9FF70]/60";

interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "coordinator" | "manager";
  site: string | null;
  // PENDING-5 aggregation (May 14): server now aggregates legacy `users` +
  // `system_users` tables. system_users rows are read-only from this card
  // (edit/delete via /eej/auth/* flows, not /admin/users/:id which only
  // operates on the legacy users table). Frontend hides edit/delete buttons
  // for system_users rows. Full CRUD across both tables = iteration N+1.
  sourceTable?: "users" | "system_users";
}

function getApiBase() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  coordinator: "Coordinator",
  manager: "Manager",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "#E9FF70",
  coordinator: "#60a5fa",
  manager: "#a78bfa",
};

export function TeamManagementCard() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const emptyForm = { email: "", name: "", role: "coordinator" as TeamUser["role"], site: "", password: "" };
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState<Partial<TeamUser & { password: string }>>({});
  const [error, setError] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { users: TeamUser[] };
        setUsers(data.users);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleAdd() {
    if (!form.email || !form.name || !form.password) { setError(t("roles.fieldsMissing")); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${getApiBase()}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, site: form.site || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t("roles.createFailed")); return; }
      setUsers((u) => [...u, data as TeamUser]);
      setForm(emptyForm);
      setShowAdd(false);
    } finally { setSaving(false); }
  }

  async function handleEdit(id: string) {
    if (!editForm.name && !editForm.email) { setEditingId(null); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${getApiBase()}/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...editForm, site: editForm.site || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t("roles.updateFailed")); return; }
      setUsers((u) => u.map((x) => (x.id === id ? { ...x, ...(data as TeamUser) } : x)));
      setEditingId(null);
      setEditForm({});
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${getApiBase()}/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setUsers((u) => u.filter((x) => x.id !== id)); }
      else { const d = await res.json(); setError(d.error ?? t("roles.deleteFailed")); }
    } finally { setSaving(false); setDeleteConfirmId(null); }
  }

  return (
    <div className="rounded-2xl border p-6 space-y-4" style={{ borderColor: LIME_BORDER, background: LIME_BG }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: LIME }}>
            <Users className="w-4 h-4" style={{ color: "#333" }} />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest">{t("roles.teamAccess")}</h3>
            <p className="text-[10px] font-mono text-gray-500">{t("roles.teamSubtitle")}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all hover:opacity-90"
          style={{ background: LIME, color: "#333" }}
        >
          <UserPlus className="w-3.5 h-3.5" />
          {t("roles.addUser")}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
          <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: LIME }} />
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded-xl border px-4 py-3 flex items-center gap-3" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
              {editingId === u.id ? (
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder={t("roles.name")} defaultValue={u.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                  <input className={inputCls} placeholder={t("roles.email")} defaultValue={u.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                  <select className={inputCls} defaultValue={u.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as TeamUser["role"] }))} disabled={u.role === "admin"}>
                    <option value="coordinator">Coordinator</option>
                    <option value="manager">Manager</option>
                    {u.role === "admin" && <option value="admin">Admin</option>}
                  </select>
                  <input className={inputCls} placeholder={t("roles.site") + " (" + t("roles.optional") + ")"} defaultValue={u.site ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, site: e.target.value }))} />
                  <input type="password" className={inputCls} placeholder={t("roles.newPassword") + " (" + t("roles.optional") + ")"} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} />
                  <div className="flex gap-2 col-span-2 justify-end">
                    <button onClick={() => { setEditingId(null); setEditForm({}); }} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition-colors border border-white/10">
                      <X className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleEdit(u.id)} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all hover:opacity-90 flex items-center gap-1" style={{ background: LIME, color: "#333" }}>
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {t("roles.save")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{u.name}</span>
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest" style={{ background: `${ROLE_COLORS[u.role]}22`, color: ROLE_COLORS[u.role], border: `1px solid ${ROLE_COLORS[u.role]}44` }}>
                        {ROLE_LABELS[u.role]}
                      </span>
                      {u.site && (
                        <span className="flex items-center gap-1 text-[9px] font-mono text-gray-400">
                          <MapPin className="w-2.5 h-2.5" />{u.site}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-gray-500 truncate">{u.email}</p>
                  </div>
                  {u.role !== "admin" && u.sourceTable !== "system_users" && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditingId(u.id); setEditForm({}); }} className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                      {deleteConfirmId === u.id ? (
                        <button onClick={() => handleDelete(u.id)} disabled={saving} className="p-1.5 rounded text-xs font-black animate-pulse" style={{ background: "#ef4444", color: "white" }}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      ) : (
                        <button onClick={() => setDeleteConfirmId(u.id)} className="p-1.5 rounded hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                  {u.sourceTable === "system_users" && u.role !== "admin" && (
                    <span
                      className="text-[9px] font-mono text-gray-500 italic"
                      title="System user — manage via mobile auth flow. Edit/delete from this card lands in iteration N+1."
                    >
                      managed
                    </span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add User Form */}
      {showAdd && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: `${LIME}44`, background: "rgba(233,255,112,0.04)" }}>
          <p className="text-xs font-black text-white uppercase tracking-widest">{t("roles.newMember")}</p>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder={t("roles.name")} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input className={inputCls} placeholder={t("roles.email")} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <select className={inputCls} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as TeamUser["role"] }))}>
              <option value="coordinator">Coordinator</option>
              <option value="manager">Manager</option>
            </select>
            <input className={inputCls} placeholder={t("roles.site") + " (" + t("roles.optional") + ")"} value={form.site} onChange={(e) => setForm((f) => ({ ...f, site: e.target.value }))} />
            <input type="password" className={`${inputCls} col-span-2`} placeholder={t("roles.password")} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); setError(null); setForm(emptyForm); }} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 border border-white/10 hover:text-white transition-colors">
              {t("roles.cancel")}
            </button>
            <button onClick={handleAdd} disabled={saving} className="px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all hover:opacity-90 flex items-center gap-1.5" style={{ background: LIME, color: "#333" }}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
              {t("roles.create")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
