// My Legal Status — worker sees their own permit / TRC / compliance status.
// Pulls from the cockpit endpoint (worker + alerts + AI summary feed) so
// the worker sees the same picture EEJ team sees, formatted for self-view.
// Read-only — no filing, no drafting.
import { useEffect, useState } from "react";
import {
  Shield,
  CheckCircle2,
  CalendarClock,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useMyWorker } from "@/lib/useMyWorker";
import { fetchWorkerCockpit, type CockpitResponse } from "@/lib/api";

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export default function MyStatusTab() {
  const { worker, loading: workerLoading, error: workerError } = useMyWorker();
  const [cockpit, setCockpit] = useState<CockpitResponse | null>(null);
  const [cockpitLoading, setCockpitLoading] = useState(false);

  useEffect(() => {
    if (!worker) return;
    setCockpitLoading(true);
    fetchWorkerCockpit(worker.id)
      .then(setCockpit)
      .catch(() => setCockpit(null))
      .finally(() => setCockpitLoading(false));
  }, [worker?.id]);

  if (workerLoading || (worker && cockpitLoading)) {
    return (
      <div className="tab-page" style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
        Loading your status…
      </div>
    );
  }

  if (workerError || !worker) {
    return (
      <div className="tab-page" style={{ padding: 32, textAlign: "center", color: "#6B7280" }}>
        <Shield size={32} color="#9CA3AF" strokeWidth={1.5} style={{ margin: "0 auto 12px" }} />
        <div>{workerError ?? "Profile not found."}</div>
      </div>
    );
  }

  const redAlerts = cockpit?.alerts.filter((a) => a.level === "red") ?? [];
  const amberAlerts = cockpit?.alerts.filter((a) => a.level === "amber") ?? [];
  const isClear = (cockpit?.alerts.length ?? 0) === 0;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">My profile</div>
          <div className="tab-greeting-name">{worker.name}</div>
        </div>
      </div>

      {/* Status header — green / amber / red based on alerts */}
      <div
        className={
          isClear
            ? "wc-alert wc-alert-green-soft"
            : redAlerts.length > 0
              ? "wc-alert wc-alert-red"
              : "wc-alert wc-alert-amber"
        }
        style={{ marginBottom: 12, padding: 12 }}
      >
        {isClear ? (
          <CheckCircle2 size={16} strokeWidth={2.2} />
        ) : (
          <AlertTriangle size={16} strokeWidth={2.2} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
            {isClear
              ? "You are clear to work"
              : redAlerts.length > 0
                ? `${redAlerts.length} urgent item${redAlerts.length === 1 ? "" : "s"}`
                : `${amberAlerts.length} item${amberAlerts.length === 1 ? "" : "s"} need attention`}
          </div>
          {!isClear && (
            <div style={{ fontSize: 11, opacity: 0.85 }}>
              See the list below and tap your coordinator if anything is unclear.
            </div>
          )}
        </div>
      </div>

      {/* Alerts list — what specifically needs attention */}
      {(redAlerts.length > 0 || amberAlerts.length > 0) && (
        <>
          <div className="section-label" style={{ marginTop: 4 }}>
            <CalendarClock size={13} color="#9CA3AF" strokeWidth={2} />
            What needs attention
          </div>
          <div className="wc-alert-strip" style={{ marginBottom: 16 }}>
            {[...redAlerts, ...amberAlerts].map((a, i) => (
              <div key={i} className={`wc-alert wc-alert-${a.level}`}>
                <AlertTriangle size={14} strokeWidth={2.5} />
                <span className="wc-alert-msg">{a.message}</span>
                {a.date && <span className="wc-alert-date">{fmt(a.date)}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* My documents — expiry grid for worker self-awareness */}
      <div className="section-label">My documents</div>
      <div className="my-status-grid">
        {[
          { label: "TRC", date: worker.trcExpiry },
          { label: "Work permit", date: worker.workPermitExpiry },
          { label: "Medical exam", date: worker.badaniaLekExpiry },
          { label: "Contract", date: worker.contractEndDate },
        ]
          .map((d) => ({ ...d, days: daysUntil(d.date) }))
          .filter((d) => d.date)
          .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
          .map((d) => {
            const level: "red" | "amber" | "green" =
              d.days === null
                ? "green"
                : d.days < 30
                  ? "red"
                  : d.days <= 60
                    ? "amber"
                    : "green";
            return (
              <div key={d.label} className={`my-status-card my-status-${level}`}>
                <div className="my-status-label">{d.label}</div>
                <div className="my-status-days">
                  {d.days === null
                    ? "—"
                    : d.days < 0
                      ? `Expired ${Math.abs(d.days)}d ago`
                      : `${d.days}d left`}
                </div>
                <div className="my-status-date">{fmt(d.date)}</div>
              </div>
            );
          })}
      </div>

      {/* AI summary — if the cockpit generated one (driven by alerts) */}
      {cockpit && cockpit.alerts.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 20 }}>
            <Sparkles size={13} color="#3B82F6" strokeWidth={2} />
            What this means for me
          </div>
          <div className="wc-ai-summary">
            EEJ is monitoring your case. Tap any item above to learn more, or contact your coordinator directly.
          </div>
        </>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}
