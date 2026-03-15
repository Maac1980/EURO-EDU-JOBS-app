import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO, getDaysInMonth, startOfMonth, getDay, differenceInCalendarDays } from "date-fns";

const LIME = "#E9FF70";
const LIME_BORDER = "rgba(233,255,112,0.25)";
const LIME_BG = "rgba(233,255,112,0.06)";

interface Worker {
  id: string;
  name: string;
  trcExpiry?: string | null;
  workPermitExpiry?: string | null;
  contractEndDate?: string | null;
  badaniaLekExpiry?: string | null;
  oswiadczenieExpiry?: string | null;
  udtCertExpiry?: string | null;
  siteLocation?: string | null;
}

interface ExpiryEvent {
  workerId: string;
  workerName: string;
  doc: string;
  days: number;
  zone: "red" | "yellow" | "green";
}

const DOC_MAP: Record<string, string> = {
  trcExpiry: "TRC",
  workPermitExpiry: "Work Permit",
  contractEndDate: "Contract",
  badaniaLekExpiry: "Badania Lek.",
  oswiadczenieExpiry: "Oświadczenie",
  udtCertExpiry: "UDT Cert",
};

interface Props {
  workers: Worker[];
  onSelectWorker?: (id: string) => void;
}

export function ExpiryCalendar({ workers, onSelectWorker }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const daysInMonth = getDaysInMonth(new Date(viewYear, viewMonth, 1));
  const firstDayOfWeek = (getDay(startOfMonth(new Date(viewYear, viewMonth, 1))) + 6) % 7;

  const eventsByDay = new Map<number, ExpiryEvent[]>();
  for (const w of workers) {
    for (const [key, label] of Object.entries(DOC_MAP)) {
      const dateStr = (w as any)[key] as string | null | undefined;
      if (!dateStr) continue;
      try {
        const d = parseISO(dateStr);
        if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
          const day = d.getDate();
          const daysLeft = differenceInCalendarDays(d, today);
          const zone: "red" | "yellow" | "green" = daysLeft < 0 ? "red" : daysLeft <= 30 ? "red" : daysLeft <= 60 ? "yellow" : "green";
          if (!eventsByDay.has(day)) eventsByDay.set(day, []);
          eventsByDay.get(day)!.push({
            workerId: w.id, workerName: w.name, doc: label, days: daysLeft, zone,
          });
        }
      } catch {}
    }
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setHoveredDay(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setHoveredDay(null);
  };

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const monthName = format(new Date(viewYear, viewMonth, 1), "MMMM yyyy");

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const hoveredEvents = hoveredDay !== null ? (eventsByDay.get(hoveredDay) ?? []) : [];

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", borderColor: LIME_BORDER }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: LIME_BORDER, background: LIME_BG }}>
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        </button>
        <span className="text-sm font-black uppercase tracking-widest" style={{ color: LIME }}>{monthName}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-[9px] font-black uppercase tracking-widest text-gray-500">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`e-${idx}`} className="min-h-[52px] border-r border-b border-white/5 last:border-r-0" />;
          }
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          const events = eventsByDay.get(day) ?? [];
          const hasRed = events.some(e => e.zone === "red");
          const hasYellow = events.some(e => e.zone === "yellow");
          const hasGreen = events.some(e => e.zone === "green");
          const isHovered = hoveredDay === day;

          return (
            <div
              key={day}
              onMouseEnter={() => events.length > 0 ? setHoveredDay(day) : undefined}
              onMouseLeave={() => setHoveredDay(null)}
              className="relative min-h-[52px] border-r border-b border-white/5 last:border-r-0 p-1.5 cursor-default transition-colors"
              style={{ background: isHovered && events.length > 0 ? "rgba(233,255,112,0.04)" : undefined }}
            >
              <span
                className="text-[10px] font-mono w-5 h-5 flex items-center justify-center rounded-full"
                style={{
                  background: isToday ? LIME : "transparent",
                  color: isToday ? "#333333" : events.length > 0 ? "white" : "rgba(255,255,255,0.3)",
                  fontWeight: isToday || events.length > 0 ? "900" : "400",
                }}
              >
                {day}
              </span>

              {/* Event dots */}
              {events.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {hasRed && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                  {hasYellow && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                  {hasGreen && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                  {events.length > 3 && (
                    <span className="text-[8px] font-black text-gray-500">+{events.length - 3}</span>
                  )}
                </div>
              )}

              {/* Tooltip on hover */}
              {isHovered && hoveredEvents.length > 0 && (
                <div
                  className="absolute z-50 left-0 top-full mt-1 w-52 rounded-xl border shadow-2xl p-2.5 space-y-1.5"
                  style={{ background: "#1a1f2e", borderColor: LIME_BORDER, minWidth: "200px" }}
                >
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">
                    {format(new Date(viewYear, viewMonth, day), "d MMMM yyyy")}
                  </p>
                  {hoveredEvents.map((e, i) => (
                    <button
                      key={i}
                      onClick={() => onSelectWorker?.(e.workerId)}
                      className="w-full text-left flex items-start gap-2 hover:bg-white/5 rounded-lg px-2 py-1.5 transition-colors"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                        style={{ background: e.zone === "red" ? "#f87171" : e.zone === "yellow" ? "#fbbf24" : "#4ade80" }}
                      />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">{e.workerName}</p>
                        <p className="text-[9px] font-mono text-gray-400 truncate">
                          {e.doc} · {e.days < 0 ? `${Math.abs(e.days)}d overdue` : e.days === 0 ? "TODAY" : `${e.days}d left`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        {[
          { color: "#f87171", label: "Critical / Expired" },
          { color: "#fbbf24", label: "Warning (30-60d)" },
          { color: "#4ade80", label: "OK (60d+)" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-[9px] font-mono text-gray-500">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-[9px] font-mono text-gray-600">Hover date to see workers</span>
      </div>
    </div>
  );
}
