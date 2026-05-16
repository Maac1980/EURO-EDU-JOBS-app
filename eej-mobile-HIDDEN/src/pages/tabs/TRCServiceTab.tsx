import { useState, useEffect, useMemo } from "react";
import {
  FileText, Plus, ChevronDown, ChevronUp, Send, Bell,
  Receipt, Sparkles, AlertTriangle, CheckCircle, Clock, X,
} from "lucide-react";
import { useToast } from "@/lib/toast";
import { useDeepLinkWorker, clearDeepLinkWorker } from "@/lib/navContext";

/* ── Types ────────────────────────────────────────────────── */
interface TRCCase {
  id: string;
  worker_id?: string | null;
  workerName: string;
  worker_name?: string;
  nationality: string;
  employer: string;
  status: string;
  serviceFee: number;
  paid: boolean;
  applicationDate?: string;
  expectedDecisionDate?: string;
  documentsUploaded: number;
  documentsRequired: number;
  missingDocuments: number;
  esspassStatus?: string;
  permitType?: string;
  voivodeship?: string;
}

interface Document {
  name: string;
  required: boolean;
  uploaded: boolean;
  verified: boolean;
}

interface Note { id: string; text: string; createdAt: string; author?: string }

interface Summary {
  total: number;
  byStatus: Record<string, number>;
  totalRevenue: number;
  paidRevenue: number;
  unpaidRevenue: number;
  missingDocumentsCount: number;
}

/* ── Helpers ──────────────────────────────────────────────── */
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

const api = (path: string, opts?: RequestInit) =>
  fetch(path, { ...opts, headers: { ...authHeaders(), ...opts?.headers } }).then((r) => {
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  });

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  documents_gathering: { bg: "#FFFBEB", text: "#D97706", label: "Documents Gathering" },
  submitted:           { bg: "#EFF6FF", text: "#3B82F6", label: "Submitted" },
  under_review:        { bg: "#F5F3FF", text: "#7C3AED", label: "Under Review" },
  approved:            { bg: "#ECFDF5", text: "#059669", label: "Approved" },
  rejected:            { bg: "#FEF2F2", text: "#DC2626", label: "Rejected" },
};

const PERMIT_TYPES = ["TRC", "Work Permit", "Blue Card", "Seasonal"];
const VOIVODESHIPS = [
  "Mazowieckie", "Dolnoslaskie", "Wielkopolskie", "Malopolskie",
  "Slaskie", "Lodzkie", "Pomorskie", "Lubelskie", "Podkarpackie",
  "Zachodniopomorskie", "Warminsko-Mazurskie", "Kujawsko-Pomorskie",
  "Swietokrzyskie", "Podlaskie", "Opolskie", "Lubuskie",
];

const STATUS_OPTIONS = Object.keys(STATUS_COLORS);

/* ── Component ────────────────────────────────────────────── */
export default function TRCServiceTab() {
  const { showToast } = useToast();
  const [cases, setCases] = useState<TRCCase[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState("all");

  // Deep-link from cockpit: when set, the tab opens pre-filtered to that
  // worker's cases. User can clear via the banner's "Show all" button.
  const deepLink = useDeepLinkWorker();

  const loadData = () => {
    setLoading(true);
    Promise.all([api("/api/trc/cases"), api("/api/trc/summary")])
      .then(([c, s]) => {
        const normalised = ((c.cases ?? c) as TRCCase[]).map((row) => ({
          ...row,
          workerName: row.workerName ?? row.worker_name ?? "",
        }));
        setCases(normalised);
        setSummary(s);
      })
      .catch(() => showToast("Failed to load TRC data", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    let rows = cases;
    if (deepLink) {
      rows = rows.filter((c) => c.worker_id === deepLink.id);
    }
    if (filter !== "all") {
      rows = rows.filter((c) => c.status === filter);
    }
    return rows;
  }, [cases, filter, deepLink]);

  return (
    <div className="tab-page">
      {/* Header */}
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Immigration Services</div>
          <div className="tab-greeting-name">TRC Case Management</div>
        </div>
        <button onClick={() => setShowCreate(true)} style={btnPrimary}>
          <Plus size={14} /> New Case
        </button>
      </div>

      {/* Deep-link banner: when the cockpit deep-linked into this tab with
          a worker, show a clear-able filter chip. */}
      {deepLink && (
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
          <Sparkles size={14} strokeWidth={2.2} />
          <span style={{ flex: 1 }}>
            Showing cases for <strong>{deepLink.name ?? "selected worker"}</strong>
          </span>
          <button
            onClick={clearDeepLinkWorker}
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
            Show all
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && <SummaryHeader summary={summary} />}

      {/* Filter Row */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {["all", ...STATUS_OPTIONS].map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: filter === s ? "1.5px solid #1B2A4A" : "1.5px solid #E5E7EB",
            background: filter === s ? "#1B2A4A" : "#fff",
            color: filter === s ? "#fff" : "#374151",
          }}>
            {s === "all" ? "All" : STATUS_COLORS[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading cases...</div>}

      {/* Cases */}
      {!loading && filtered.map((c) => (
        <CaseCard
          key={c.id}
          trcCase={c}
          expanded={expandedId === c.id}
          onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
          onRefresh={loadData}
        />
      ))}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>No cases found</div>
      )}

      {/* Create Modal */}
      {showCreate && <CreateCaseModal onClose={() => setShowCreate(false)} onCreated={loadData} />}
    </div>
  );
}

/* ── Summary Header ───────────────────────────────────────── */
function SummaryHeader({ summary }: { summary: Summary }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
      <StatCard label="Total Cases" value={summary.total} color="#1B2A4A" bg="#F0F4FF" />
      <StatCard label="Paid" value={`${((summary.paidRevenue / 100) || 0).toFixed(0)} PLN`} color="#059669" bg="#ECFDF5" />
      <StatCard label="Missing Docs" value={summary.missingDocumentsCount} color="#DC2626" bg="#FEF2F2"
        icon={summary.missingDocumentsCount > 0 ? <AlertTriangle size={14} color="#DC2626" /> : undefined} />
    </div>
  );
}

function StatCard({ label, value, color, bg, icon }: { label: string; value: string | number; color: string; bg: string; icon?: React.ReactNode }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        {icon}{value}
      </div>
      <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ── Case Card ────────────────────────────────────────────── */
function CaseCard({ trcCase: c, expanded, onToggle, onRefresh }: {
  trcCase: TRCCase; expanded: boolean; onToggle: () => void; onRefresh: () => void;
}) {
  const sc = STATUS_COLORS[c.status] || { bg: "#F3F4F6", text: "#6B7280", label: c.status };
  const pct = c.documentsRequired > 0 ? Math.round((c.documentsUploaded / c.documentsRequired) * 100) : 0;

  return (
    <div style={cardStyle}>
      <div onClick={onToggle} style={{ cursor: "pointer" }}>
        {/* Top row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{c.workerName}</div>
            <div style={{ fontSize: 11, color: "#6B7280" }}>{c.nationality} &middot; {c.employer}</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ ...badgeBase, background: sc.bg, color: sc.text }}>{sc.label}</span>
            {expanded ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ ...badgeBase, background: c.paid ? "#ECFDF5" : "#FEF2F2", color: c.paid ? "#059669" : "#DC2626" }}>
            {c.paid ? "Paid" : "Unpaid"} &middot; {c.serviceFee} PLN
          </span>
          {c.esspassStatus && (
            <span style={{ ...badgeBase, background: "#EFF6FF", color: "#3B82F6" }}>ESSPASS: {c.esspassStatus}</span>
          )}
          {c.missingDocuments > 0 && (
            <span style={{ ...badgeBase, background: "#FEF2F2", color: "#DC2626" }}>
              <AlertTriangle size={10} /> {c.missingDocuments} missing
            </span>
          )}
        </div>

        {/* Dates */}
        <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 11, color: "#9CA3AF" }}>
          {c.applicationDate && <span>Applied: {c.applicationDate}</span>}
          {c.expectedDecisionDate && <span>Decision: {c.expectedDecisionDate}</span>}
        </div>

        {/* Document progress bar */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6B7280", marginBottom: 3 }}>
            <span>Documents {c.documentsUploaded}/{c.documentsRequired}</span>
            <span>{pct}%</span>
          </div>
          <div style={{ height: 6, background: "#E5E7EB", borderRadius: 3 }}>
            <div style={{ height: 6, borderRadius: 3, width: `${pct}%`, background: pct === 100 ? "#059669" : "#3B82F6", transition: "width .3s" }} />
          </div>
        </div>
      </div>

      {expanded && <CaseDetail caseId={c.id} status={c.status} onRefresh={onRefresh} />}
    </div>
  );
}

/* ── Case Detail (expanded) ───────────────────────────────── */
function CaseDetail({ caseId, status, onRefresh }: { caseId: string; status: string; onRefresh: () => void }) {
  const { showToast } = useToast();
  const [docs, setDocs] = useState<Document[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [newStatus, setNewStatus] = useState(status);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api(`/api/trc/cases/${caseId}/documents`).then(setDocs).catch(() => {});
    api(`/api/trc/cases/${caseId}/notes`).then(setNotes).catch(() => {});
  }, [caseId]);

  const action = async (label: string, path: string, method = "POST") => {
    setBusy(label);
    try {
      await api(`/api/trc/cases/${caseId}/${path}`, { method });
      showToast(`${label} successful`, "success");
      onRefresh();
    } catch { showToast(`${label} failed`, "error"); }
    finally { setBusy(""); }
  };

  const updateStatus = async () => {
    setBusy("status");
    try {
      await api(`/api/trc/cases/${caseId}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
      showToast("Status updated", "success");
      onRefresh();
    } catch { showToast("Update failed", "error"); }
    finally { setBusy(""); }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    try {
      const n = await api(`/api/trc/cases/${caseId}/notes`, { method: "POST", body: JSON.stringify({ text: newNote }) });
      setNotes((prev) => [...prev, n]);
      setNewNote("");
      showToast("Note added", "success");
    } catch { showToast("Failed to add note", "error"); }
  };

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #E5E7EB", paddingTop: 12 }}>
      {/* Document checklist */}
      <div style={{ fontWeight: 700, fontSize: 12, color: "#374151", marginBottom: 6 }}>Document Checklist</div>
      {docs.length === 0 && <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8 }}>No documents yet</div>}
      {docs.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 12 }}>
          {d.verified ? <CheckCircle size={14} color="#059669" /> : d.uploaded ? <Clock size={14} color="#D97706" /> : <X size={14} color="#DC2626" />}
          <span style={{ color: "#374151", flex: 1 }}>{d.name}</span>
          <span style={{ fontSize: 10, color: d.verified ? "#059669" : d.uploaded ? "#D97706" : "#DC2626" }}>
            {d.verified ? "Verified" : d.uploaded ? "Uploaded" : "Missing"}
          </span>
        </div>
      ))}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} style={selectStyle}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_COLORS[s].label}</option>)}
        </select>
        <button disabled={busy === "status"} onClick={updateStatus} style={btnSmall}>Update Status</button>
        <button disabled={!!busy} onClick={() => action("Send Checklist", "send-checklist")} style={btnSmall}><Send size={12} /> Checklist</button>
        <button disabled={!!busy} onClick={() => action("Notify Worker", "notify")} style={btnSmall}><Bell size={12} /> Notify</button>
        <button disabled={!!busy} onClick={() => action("Generate Invoice", "generate-checklist")} style={btnSmall}><Receipt size={12} /> Invoice</button>
        <button disabled={!!busy} onClick={() => action("AI Checklist", "generate-checklist")} style={{ ...btnSmall, background: "#7C3AED", color: "#fff" }}>
          <Sparkles size={12} /> AI Checklist
        </button>
      </div>

      {/* Notes */}
      <div style={{ fontWeight: 700, fontSize: 12, color: "#374151", marginTop: 12, marginBottom: 4 }}>Notes</div>
      {notes.map((n) => (
        <div key={n.id} style={{ background: "#F9FAFB", borderRadius: 8, padding: "6px 8px", marginBottom: 4, fontSize: 11, color: "#374151" }}>
          {n.text}
          <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 2 }}>{n.author && `${n.author} - `}{n.createdAt}</div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note..."
          style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "6px 10px", fontSize: 12, outline: "none" }} />
        <button onClick={addNote} style={btnSmall}>Add</button>
      </div>
    </div>
  );
}

/* ── Create Case Modal ────────────────────────────────────── */
function CreateCaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ workerName: "", nationality: "", employer: "", permitType: "TRC", voivodeship: "Mazowieckie", serviceFee: "" });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.workerName || !form.employer) { showToast("Name and employer required", "error"); return; }
    setSaving(true);
    try {
      await api("/api/trc/cases", { method: "POST", body: JSON.stringify({ ...form, serviceFee: Number(form.serviceFee) || 0 }) });
      showToast("Case created", "success");
      onCreated();
      onClose();
    } catch { showToast("Failed to create case", "error"); }
    finally { setSaving(false); }
  };

  return (
    /* Pass 3 architectural rule — use canonical .shell-overlay
       so the modal sits between header + bottom-nav within the
       430px frame. */
    <div className="shell-overlay" style={{ alignItems: "center" }}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#1B2A4A" }}>New TRC Case</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color="#6B7280" /></button>
        </div>
        <label style={labelStyle}>Worker Name</label>
        <input style={inputStyle} value={form.workerName} onChange={(e) => set("workerName", e.target.value)} />
        <label style={labelStyle}>Nationality</label>
        <input style={inputStyle} value={form.nationality} onChange={(e) => set("nationality", e.target.value)} placeholder="e.g. Ukrainian" />
        <label style={labelStyle}>Employer</label>
        <input style={inputStyle} value={form.employer} onChange={(e) => set("employer", e.target.value)} />
        <label style={labelStyle}>Permit Type</label>
        <select style={inputStyle} value={form.permitType} onChange={(e) => set("permitType", e.target.value)}>
          {PERMIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={labelStyle}>Voivodeship</label>
        <select style={inputStyle} value={form.voivodeship} onChange={(e) => set("voivodeship", e.target.value)}>
          {VOIVODESHIPS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <label style={labelStyle}>Service Fee (PLN)</label>
        <input style={inputStyle} type="number" value={form.serviceFee} onChange={(e) => set("serviceFee", e.target.value)} placeholder="0" />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ ...btnSmall, flex: 1 }}>Cancel</button>
          <button disabled={saving} onClick={submit} style={{ ...btnPrimary, flex: 1 }}>{saving ? "Saving..." : "Create Case"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Shared Styles ────────────────────────────────────────── */
const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB",
  padding: 14, marginBottom: 10,
};
const badgeBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
  display: "inline-flex", alignItems: "center", gap: 3,
};
const btnPrimary: React.CSSProperties = {
  background: "#1B2A4A", color: "#fff", border: "none", borderRadius: 10,
  padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", gap: 4,
};
const btnSmall: React.CSSProperties = {
  background: "#F3F4F6", color: "#374151", border: "1.5px solid #E5E7EB",
  borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 600,
  cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
};
const selectStyle: React.CSSProperties = {
  border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "5px 8px",
  fontSize: 11, background: "#fff", outline: "none", cursor: "pointer",
};
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 10,
  padding: "8px 12px", fontSize: 13, outline: "none", marginBottom: 10,
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 3, display: "block",
};
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
};
const modalStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 400,
  maxHeight: "85vh", overflowY: "auto",
};
