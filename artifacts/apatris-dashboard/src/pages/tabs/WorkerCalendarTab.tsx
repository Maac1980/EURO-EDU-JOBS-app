import { useState, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NAVY = "#1B2A4A";

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function startDay(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday = 0
}
function fmt(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
function fmtDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function WorkerCalendarTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isStaff = user?.role !== "candidate";
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [available, setAvailable] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/workers/availability?month=${fmt(year, month)}`)
      .then(r => r.ok ? r.json() : { dates: [] })
      .then(d => setAvailable(new Set(d.dates || [])))
      .catch(() => setAvailable(new Set()))
      .finally(() => setLoading(false));
  }, [year, month]);

  const toggle = (dateStr: string) => {
    if (isStaff) return;
    const next = new Set(available);
    if (next.has(dateStr)) next.delete(dateStr); else next.add(dateStr);
    setAvailable(next);
    fetch("/api/workers/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId: user?.candidateId, dates: Array.from(next) }),
    }).catch(() => toast("Failed to save availability"));
  };

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const total = daysInMonth(year, month);
  const offset = startDay(year, month);
  const availCount = Array.from(available).filter(d => d.startsWith(fmt(year, month))).length;
  const monthLabel = new Date(year, month).toLocaleString("en", { month: "long", year: "numeric" });

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">{isStaff ? "Team Availability" : "My Availability"}</div>
          <div className="tab-greeting-name">Worker Calendar</div>
        </div>
        <CalendarDays size={28} color={NAVY} />
      </div>

      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={prev} style={navBtn}><ChevronLeft size={18} /></button>
        <span style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{monthLabel}</span>
        <button onClick={next} style={navBtn}><ChevronRight size={18} /></button>
      </div>

      {/* Summary */}
      <div style={cardStyle}>
        <span style={{ fontSize: 24, fontWeight: 800, color: "#10B981" }}>{availCount}</span>
        <span style={{ fontSize: 13, color: "#6B7280", marginLeft: 8 }}>days available this month</span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={28} className="spin" color={NAVY} /></div>
      ) : (
        <>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
            {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9CA3AF" }}>{d}</div>)}
          </div>
          {/* Calendar grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
            {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: total }).map((_, i) => {
              const day = i + 1;
              const ds = fmtDate(year, month, day);
              const isAvail = available.has(ds);
              const bg = isAvail ? "#D1FAE5" : "#FEE2E2";
              const border = isAvail ? "#10B981" : "#EF4444";
              const color = isAvail ? "#065F46" : "#991B1B";
              const isSet = available.has(ds);
              return (
                <button
                  key={day}
                  onClick={() => toggle(ds)}
                  style={{
                    width: "100%", aspectRatio: "1", borderRadius: 10,
                    background: isSet ? bg : "#F3F4F6",
                    border: `1.5px solid ${isSet ? border : "#E5E7EB"}`,
                    color: isSet ? color : "#9CA3AF",
                    fontWeight: 700, fontSize: 13, cursor: isStaff ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center" }}>
            {[["#D1FAE5", "Available"], ["#FEE2E2", "Unavailable"], ["#F3F4F6", "Unset"]].map(([c, l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6B7280" }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: c }} />{l}
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ height: 100 }} />
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: 6, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "14px 16px",
  display: "flex", alignItems: "center", marginBottom: 14,
};
