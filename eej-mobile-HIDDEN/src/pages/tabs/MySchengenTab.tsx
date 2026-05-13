// My Schengen — 90/180 day rule tracker for non-visa-free workers.
// Read-only. Workers see how many days they've used and when their next
// legal exit falls. If Art. 108 is active (TRC application pending), the
// 90/180 rule doesn't apply and we show that explicitly.
import { useEffect, useState } from "react";
import { Globe, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMyWorker } from "@/lib/useMyWorker";

interface SchengenData {
  art108Active?: boolean;
  calculation?: {
    daysUsed: number;
    daysRemaining: number;
    latestLegalExitDate: string;
    isOverstay?: boolean;
    isWarning?: boolean;
  };
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export default function MySchengenTab() {
  const { worker, loading: workerLoading, error: workerError } = useMyWorker();
  const [data, setData] = useState<SchengenData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    if (!worker) return;
    setDataLoading(true);
    fetch(`/api/schengen/worker/${encodeURIComponent(worker.id)}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d as SchengenData | null))
      .catch(() => setData(null))
      .finally(() => setDataLoading(false));
  }, [worker?.id]);

  if (workerLoading || (worker && dataLoading)) {
    return (
      <div className="tab-page" style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
        Calculating your Schengen days…
      </div>
    );
  }

  if (workerError || !worker) {
    return (
      <div className="tab-page" style={{ padding: 32, textAlign: "center", color: "#6B7280" }}>
        <Globe size={32} color="#9CA3AF" strokeWidth={1.5} style={{ margin: "0 auto 12px" }} />
        <div>{workerError ?? "Profile not found."}</div>
      </div>
    );
  }

  const calc = data?.calculation;
  const pct = calc ? Math.min(100, Math.round((calc.daysUsed / 90) * 100)) : 0;
  const bigNumberColor =
    !calc
      ? "#9CA3AF"
      : calc.daysRemaining < 10
        ? "#DC2626"
        : calc.daysRemaining < 20
          ? "#D97706"
          : "#3B82F6";

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">My Schengen status</div>
          <div className="tab-greeting-name">90/180 day rule</div>
        </div>
      </div>

      {data?.art108Active && (
        <div className="wc-alert wc-alert-green-soft" style={{ marginBottom: 12, padding: 12 }}>
          <CheckCircle2 size={16} strokeWidth={2.2} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
              Art. 108 protection active
            </div>
            <div style={{ fontSize: 11 }}>
              Your TRC application is pending — the Schengen 90/180 rule doesn't apply while you're under Art. 108.
            </div>
          </div>
        </div>
      )}

      {calc && !data?.art108Active && (
        <>
          {/* Big number */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1.5px solid #E5E7EB",
              borderRadius: 14,
              padding: 24,
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 52, fontWeight: 800, color: bigNumberColor, lineHeight: 1 }}>
              {calc.daysRemaining}
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>days remaining</div>
          </div>

          {/* Progress bar */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginBottom: 6 }}>
              <span>{calc.daysUsed} days used</span>
              <span>90 day limit</span>
            </div>
            <div
              style={{
                height: 8,
                background: "#F3F4F6",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: pct >= 90 ? "#DC2626" : pct >= 70 ? "#D97706" : "#3B82F6",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>

          {calc.isOverstay && (
            <div className="wc-alert wc-alert-red" style={{ marginBottom: 10, padding: 12 }}>
              <AlertTriangle size={16} strokeWidth={2.2} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Overstay detected</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  You have exceeded the 90-day limit. Contact your coordinator immediately.
                </div>
              </div>
            </div>
          )}
          {calc.isWarning && !calc.isOverstay && (
            <div className="wc-alert wc-alert-amber" style={{ marginBottom: 10, padding: 12 }}>
              <AlertTriangle size={16} strokeWidth={2.2} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Less than 15 days remaining</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  Talk to your coordinator about filing a residence application.
                </div>
              </div>
            </div>
          )}

          {/* Exit date */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#6B7280" }}>Latest legal exit</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1B2A4A" }}>
                {calc.latestLegalExitDate}
              </span>
            </div>
          </div>
        </>
      )}

      {!calc && !data?.art108Active && (
        <div
          style={{
            padding: 30,
            textAlign: "center",
            border: "2px dashed #E5E7EB",
            borderRadius: 12,
            color: "#9CA3AF",
            background: "#FAFAFA",
          }}
        >
          <Globe size={28} color="#D1D5DB" strokeWidth={1.5} style={{ margin: "0 auto 8px" }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6B7280" }}>
            No border crossings recorded
          </div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            Your coordinator will enter your travel dates so this tracker can calculate days.
          </div>
        </div>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}
