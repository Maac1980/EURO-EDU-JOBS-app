import React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";

const LIME = "#E9FF70";
const LIME_BORDER = "rgba(233,255,112,0.25)";

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

interface ExpiryHit {
  workerId: string;
  workerName: string;
  site: string | null;
  doc: string;
  expiry: string;
  days: number;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  try {
    return differenceInCalendarDays(parseISO(dateStr), new Date());
  } catch { return null; }
}

function docLabel(key: string): string {
  const map: Record<string, string> = {
    trcExpiry: "TRC",
    workPermitExpiry: "Work Permit",
    contractEndDate: "Contract",
    badaniaLekExpiry: "Badania Lek.",
    oswiadczenieExpiry: "Oświadczenie",
    udtCertExpiry: "UDT Cert",
  };
  return map[key] ?? key;
}

const DOC_KEYS: Array<keyof Worker> = [
  "trcExpiry", "workPermitExpiry", "contractEndDate",
  "badaniaLekExpiry", "oswiadczenieExpiry", "udtCertExpiry",
];

interface Props {
  workers: Worker[];
  onSelectWorker?: (id: string) => void;
}

export function ExpiringThisWeekPanel({ workers, onSelectWorker }: Props) {
  const { t } = useTranslation();

  const hits: ExpiryHit[] = [];
  for (const w of workers) {
    for (const key of DOC_KEYS) {
      const dateStr = (w as any)[key] as string | null | undefined;
      const d = daysUntil(dateStr);
      if (d !== null && d >= 0 && d <= 7) {
        hits.push({
          workerId: w.id,
          workerName: w.name,
          site: (w as any).siteLocation ?? null,
          doc: docLabel(key as string),
          expiry: dateStr!,
          days: d,
        });
      }
    }
  }
  hits.sort((a, b) => a.days - b.days);

  if (hits.length === 0) {
    return (
      <div className="rounded-xl border p-5 flex items-center gap-3" style={{ background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.2)" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(16,185,129,0.15)" }}>
          <Clock className="w-4 h-4" style={{ color: "#34d399" }} />
        </div>
        <div>
          <p className="text-sm font-black text-white">All clear this week</p>
          <p className="text-[10px] font-mono text-gray-500 mt-0.5">No documents expire in the next 7 days</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "rgba(220,38,38,0.04)", borderColor: "rgba(220,38,38,0.25)" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "rgba(220,38,38,0.2)", background: "rgba(220,38,38,0.08)" }}>
        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
        <p className="text-xs font-black uppercase tracking-widest text-red-300">
          {hits.length} document{hits.length !== 1 ? "s" : ""} expiring this week
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {hits.map((h, i) => {
          const urgent = h.days <= 2;
          return (
            <button
              key={i}
              onClick={() => onSelectWorker?.(h.workerId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/3 transition-colors group"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0"
                style={{ background: urgent ? "rgba(220,38,38,0.2)" : "rgba(234,179,8,0.15)", color: urgent ? "#f87171" : "#fbbf24" }}
              >
                {h.days === 0 ? "!" : `${h.days}d`}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{h.workerName}</p>
                <p className="text-[10px] font-mono text-gray-400 truncate">
                  {h.doc} · expires {format(parseISO(h.expiry), "d MMM yyyy")}
                  {h.site && <span style={{ color: LIME }}> · {h.site}</span>}
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 group-hover:text-gray-400 transition-colors" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
