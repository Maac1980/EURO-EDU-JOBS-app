import { useState, useEffect } from "react";
import { Clock, Plus, ChevronLeft, ChevronRight, Loader2, Users, MapPin } from "lucide-react";
import { useToast } from "@/lib/toast";

const NAVY = "#1B2A4A";
const YELLOW = "#FFD600";
const SLOTS = [
  { label: "Morning", range: "06:00 - 14:00", color: "#F59E0B", bg: "#FFFBEB" },
  { label: "Afternoon", range: "14:00 - 22:00", color: "#3B82F6", bg: "#EFF6FF" },
  { label: "Night", range: "22:00 - 06:00", color: "#6366F1", bg: "#EEF2FF" },
];
const SITES = ["Warsaw Factory A", "Krakow Warehouse", "Gdansk Port", "Wroclaw Site B"];
const SITE_COLORS: Record<string, string> = {
  "Warsaw Factory A": "#3B82F6", "Krakow Warehouse": "#10B981",
  "Gdansk Port": "#F59E0B", "Wroclaw Site B": "#8B5CF6",
};

interface Shift { id: string; site: string; slot: string; workers: string[]; date: string; }

function weekDates(offset: number): string[] {
  const d = new Date(); d.setDate(d.getDate() + offset * 7 - d.getDay() + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d); x.setDate(d.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

export default function ShiftScheduleTab() {
  const { toast } = useToast();
  const [weekOff, setWeekOff] = useState(0);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newSite, setNewSite] = useState(SITES[0]);
  const [newSlot, setNewSlot] = useState(SLOTS[0].label);
  const [newDate, setNewDate] = useState("");
  const dates = weekDates(weekOff);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    setLoading(true);
    fetch("/api/shifts")
      .then(r => r.ok ? r.json() : [])
      .then(d => setShifts(Array.isArray(d) ? d : []))
      .catch(() => setShifts([]))
      .finally(() => setLoading(false));
  }, [weekOff]);

  const createShift = () => {
    if (!newDate) { toast("Select a date"); return; }
    const s: Shift = { id: `s${Date.now()}`, site: newSite, slot: newSlot, workers: [], date: newDate };
    fetch("/api/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) })
      .catch(() => {});
    setShifts(prev => [...prev, s]);
    setShowCreate(false);
    toast("Shift created");
  };

  const todayShifts = shifts.filter(s => s.date === today);

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Operations</div>
          <div className="tab-greeting-name">Shift Schedule</div>
        </div>
        <Clock size={28} color={NAVY} />
      </div>

      {/* Today's active */}
      {todayShifts.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Today's Active Shifts</div>
          {todayShifts.map(s => (
            <div key={s.id} style={{ ...card, borderLeft: `4px solid ${SITE_COLORS[s.site] || NAVY}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{s.site}</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>{s.slot} | {SLOTS.find(x => x.label === s.slot)?.range}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#6B7280" }}>
                  <Users size={14} /> {s.workers.length}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Week nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={() => setWeekOff(w => w - 1)} style={navBtn}><ChevronLeft size={18} /></button>
        <span style={{ fontWeight: 700, fontSize: 13, color: NAVY }}>
          {dates[0]?.slice(5)} - {dates[6]?.slice(5)}
        </span>
        <button onClick={() => setWeekOff(w => w + 1)} style={navBtn}><ChevronRight size={18} /></button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={28} className="spin" color={NAVY} /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dates.map(date => {
            const dayShifts = shifts.filter(s => s.date === date);
            const dayLabel = new Date(date + "T12:00").toLocaleDateString("en", { weekday: "short", day: "numeric" });
            return (
              <div key={date} style={card}>
                <div style={{ fontWeight: 700, fontSize: 13, color: date === today ? YELLOW : NAVY, marginBottom: 6 }}>
                  {dayLabel} {date === today && <span style={{ fontSize: 10, color: "#10B981" }}> TODAY</span>}
                </div>
                {SLOTS.map(slot => {
                  const ss = dayShifts.filter(s => s.slot === slot.label);
                  return (
                    <div key={slot.label} style={{ background: slot.bg, borderRadius: 8, padding: "6px 10px", marginBottom: 4, fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: slot.color }}>{slot.label}</span>
                      <span style={{ color: "#6B7280", marginLeft: 6 }}>{slot.range}</span>
                      {ss.length > 0 ? ss.map(s => (
                        <div key={s.id} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                          <MapPin size={12} color={SITE_COLORS[s.site] || "#888"} />{s.site}
                          <Users size={12} color="#6B7280" />{s.workers.length}
                        </div>
                      )) : <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>No shifts</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Create shift */}
      <button onClick={() => { setShowCreate(true); setNewDate(dates[0]); }} style={fabStyle}>
        <Plus size={22} color="#fff" />
      </button>

      {showCreate && (
        /* Pass 3 architectural rule — use canonical .shell-overlay
           so the modal sits between header + bottom-nav within the
           430px frame. */
        <div className="shell-overlay" style={{ alignItems: "center" }}>
          <div style={{ ...card, maxWidth: 340, width: "90%" }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 12 }}>New Shift</div>
            <label style={lbl}>Site</label>
            <select value={newSite} onChange={e => setNewSite(e.target.value)} style={inp}>
              {SITES.map(s => <option key={s}>{s}</option>)}
            </select>
            <label style={lbl}>Slot</label>
            <select value={newSlot} onChange={e => setNewSlot(e.target.value)} style={inp}>
              {SLOTS.map(s => <option key={s.label}>{s.label}</option>)}
            </select>
            <label style={lbl}>Date</label>
            <select value={newDate} onChange={e => setNewDate(e.target.value)} style={inp}>
              {dates.map(d => <option key={d}>{d}</option>)}
            </select>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setShowCreate(false)} style={{ ...btnStyle, background: "#F3F4F6", color: "#374151" }}>Cancel</button>
              <button onClick={createShift} style={{ ...btnStyle, background: NAVY, color: "#fff" }}>Create</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ height: 100 }} />
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "12px 14px", marginBottom: 6 };
const navBtn: React.CSSProperties = { background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const fabStyle: React.CSSProperties = { position: "fixed", bottom: 80, right: 20, width: 48, height: 48, borderRadius: 24, background: NAVY, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" };
/* P2 — removed dead `overlay` const (legacy Pass-3 migration leftover). The
   create-shift modal renders via `<div className="shell-overlay">` above. */
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 2, display: "block", marginTop: 8 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none" };
const btnStyle: React.CSSProperties = { flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" };
