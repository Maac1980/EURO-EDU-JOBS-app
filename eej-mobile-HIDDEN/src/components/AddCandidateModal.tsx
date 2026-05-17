import { useEffect, useState } from "react";
import { X, Save } from "lucide-react";
import { useToast } from "@/lib/toast";
import { useCandidates } from "@/lib/candidateContext";
import { fetchClients, type ClientRow } from "@/lib/api";
import type { Candidate } from "@/data/mockData";

const FLAG_MAP: Record<string, string> = {
  Polish: "🇵🇱", Ukrainian: "🇺🇦", Georgian: "🇬🇪", Belarusian: "🇧🇾",
  Romanian: "🇷🇴", Moldovan: "🇲🇩", Turkish: "🇹🇷", Russian: "🇷🇺",
  Azerbaijani: "🇦🇿", Filipino: "🇵🇭", Indian: "🇮🇳", Vietnamese: "🇻🇳", Other: "🌐",
};

const JOB_ROLES     = ["TIG Welder", "MIG Welder", "MAG Welder", "MMA / ARC Welder", "Fabricator", "Teacher", "Nurse", "Healthcare Assistant", "Caregiver", "Engineer", "IT Specialist", "Logistics Coordinator", "Warehouse Operative", "Machine Operator", "Construction Worker", "Other"];
const NATIONALITIES = ["Polish", "Ukrainian", "Georgian", "Belarusian", "Russian", "Romanian", "Moldovan", "Azerbaijani", "Turkish", "Filipino", "Indian", "Vietnamese", "Other"];
const PIPELINE      = ["New Applications", "Docs Submitted", "Under Review", "Cleared to Deploy", "On Assignment"];
// Fallback site list — used only if /clients returns empty. Real clients are
// fetched on mount so Karan/Marj see actual options, not hardcoded mocks.
const FALLBACK_SITES = ["Other"];
const LOCATIONS     = ["Warsaw, PL", "Kraków, PL", "Wrocław, PL", "Łódź, PL", "Gdańsk, PL", "Poznań, PL", "Katowice, PL", "Lublin, PL", "Szczecin, PL", "Other"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="add-cand-field">
      <label className="add-cand-label">{label}</label>
      {children}
    </div>
  );
}

export default function AddCandidateModal({ onClose }: { onClose: () => void }) {
  const { showToast }  = useToast();
  const { addCandidate } = useCandidates();

  const [name,        setName]        = useState("");
  const [email,       setEmail]       = useState("");
  const [phone,       setPhone]       = useState("");
  const [nationality, setNationality] = useState("");
  const [role,        setRole]        = useState("");
  const [site,        setSite]        = useState("");
  const [location,    setLocation]    = useState("");
  const [stage,       setStage]       = useState("New Applications");
  const [saving,      setSaving]      = useState(false);
  const [clients,     setClients]     = useState<ClientRow[]>([]);

  useEffect(() => {
    fetchClients().then(setClients).catch(() => setClients([]));
  }, []);

  // Site dropdown options: real clients from /clients, plus "Other".
  // Falls back to FALLBACK_SITES if no clients returned (fresh tenant).
  const siteOptions = clients.length > 0
    ? [...clients.map((c) => c.name), "Other"]
    : FALLBACK_SITES;

  async function handleSave() {
    if (!name.trim()) { showToast("Full name is required", "error"); return; }
    if (!role)        { showToast("Job role is required",  "error"); return; }

    const flag = FLAG_MAP[nationality] ?? "🌐";
    const newCandidate: Candidate = {
      id:          `new_${Date.now()}`,
      name:        name.trim(),
      role,
      location:    location || "Poland",
      status:      "pending",
      statusLabel: "New Application",
      flag,
      nationality: nationality || "Unknown",
      phone:       phone || "",
      email:       email || "",
      siteLocation: site || undefined,
      pipelineStage: stage,
      documents:   [],
      zusStatus:   "Not registered",
    };

    setSaving(true);
    try {
      await addCandidate(newCandidate);
      showToast(`"${name}" added to your worker pipeline.`, "success");
      onClose();
    } catch (err) {
      // Surface real errors — don't claim success on failure (the previous
      // "saved locally — will sync when online" was misleading; there's no
      // offline-sync mechanism, the save just failed).
      showToast(
        err instanceof Error
          ? `Could not save: ${err.message}`
          : "Could not save candidate. Try again.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  const inp = "add-cand-input";
  const sel = "add-cand-input add-cand-select";

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet" style={{ maxHeight: "92%" }} onClick={(e) => e.stopPropagation()}>
        <div className="detail-handle" />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 14px" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>Add New Candidate</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Register to the workforce pipeline</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color="#9CA3AF" strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          <Field label="Full Name *">
            <input className={inp} type="text"  placeholder="e.g. Mariusz Kowalski" value={name}  onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Email Address">
            <input className={inp} type="email" placeholder="candidate@email.com"   value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone Number">
            <input className={inp} type="tel"   placeholder="+48 600 000 000"       value={phone} onChange={e => setPhone(e.target.value)} />
          </Field>
          <Field label="Nationality">
            <select className={sel} value={nationality} onChange={e => setNationality(e.target.value)}>
              <option value="">— select —</option>
              {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Job Role *">
            <select className={sel} value={role} onChange={e => setRole(e.target.value)}>
              <option value="">— select —</option>
              {JOB_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="City / Location">
            <select className={sel} value={location} onChange={e => setLocation(e.target.value)}>
              <option value="">— select —</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Assigned Client / Site">
            <select className={sel} value={site} onChange={e => setSite(e.target.value)}>
              <option value="">— select —</option>
              {siteOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Pipeline Stage">
            <select className={sel} value={stage} onChange={e => setStage(e.target.value)}>
              {PIPELINE.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid #F3F4F6", marginTop: 8 }}>
          <button
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "13px 0", background: saving ? "#E5C000" : "#FFD600", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, color: "#1B2A4A", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.8 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={15} strokeWidth={2.5} /> {saving ? "Saving…" : "Save Candidate"}
          </button>
          <button
            style={{ flex: 1, padding: "13px 0", background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
