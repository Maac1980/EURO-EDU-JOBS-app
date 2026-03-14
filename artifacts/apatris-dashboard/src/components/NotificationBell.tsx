import React, { useEffect, useRef, useState } from "react";
import { Bell, AlertTriangle, ShieldAlert } from "lucide-react";
import { useGetWorkers } from "@workspace/api-client-react";
import { format, parseISO, differenceInDays } from "date-fns";

interface AlertWorker {
  id: string;
  name: string;
  status: "critical" | "non-compliant";
  reason: string;
  daysLeft: number | null;
}

function getAlerts(workers: any[]): AlertWorker[] {
  const alerts: AlertWorker[] = [];
  const now = new Date();

  for (const w of workers) {
    if (w.complianceStatus !== "critical" && w.complianceStatus !== "non-compliant") continue;

    const checks: { label: string; date: string | null }[] = [
      { label: "TRC", date: w.trcExpiry },
      { label: "BHP", date: w.bhpStatus?.includes("-") ? w.bhpStatus : null },
    ];

    let reason = "";
    let daysLeft: number | null = null;

    for (const { label, date } of checks) {
      if (!date) continue;
      try {
        const d = parseISO(date);
        const days = differenceInDays(d, now);
        if (days <= 30) {
          reason = days < 0
            ? `${label} expired ${Math.abs(days)}d ago`
            : `${label} expires in ${days}d`;
          daysLeft = days;
          break;
        }
      } catch {}
    }

    if (!reason) {
      reason = w.complianceStatus === "non-compliant" ? "Non-compliant" : "Critical";
    }

    alerts.push({
      id: w.id,
      name: w.name,
      status: w.complianceStatus as "critical" | "non-compliant",
      reason,
      daysLeft,
    });
  }

  return alerts;
}

export function NotificationBell({ onSelectWorker }: { onSelectWorker: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useGetWorkers({});
  const workers = data?.workers ?? [];
  const alerts = getAlerts(workers);
  const hasAlerts = alerts.length > 0;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
        title="Expiry Alerts"
      >
        <Bell className="w-5 h-5 text-gray-300" />
        {hasAlerts && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background animate-pulse" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-800">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-red-400" />
              <span className="text-sm font-bold text-white tracking-wide">EXPIRY ALERTS</span>
            </div>
            {hasAlerts && (
              <span className="px-2 py-0.5 bg-blue-700/30 text-blue-400 text-xs font-bold rounded-full border border-blue-600/30">
                {alerts.length}
              </span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-6 text-center">
                <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-2">
                  <Bell className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-sm text-gray-400 font-mono">All workers compliant</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <button
                  key={alert.id}
                  onClick={() => { onSelectWorker(alert.id); setOpen(false); }}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 text-left"
                >
                  <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    alert.status === "non-compliant"
                      ? "bg-red-500/20 border border-red-500/30"
                      : "bg-orange-500/20 border border-orange-500/30"
                  }`}>
                    {alert.status === "non-compliant"
                      ? <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{alert.name}</p>
                    <p className={`text-xs font-mono mt-0.5 ${
                      alert.daysLeft !== null && alert.daysLeft < 0
                        ? "text-red-400"
                        : alert.status === "non-compliant"
                          ? "text-red-400"
                          : "text-orange-400"
                    }`}>
                      {alert.reason}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${
                    alert.status === "non-compliant"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-orange-500/20 text-orange-400"
                  }`}>
                    {alert.status === "non-compliant" ? "NON-COMP" : "CRITICAL"}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
