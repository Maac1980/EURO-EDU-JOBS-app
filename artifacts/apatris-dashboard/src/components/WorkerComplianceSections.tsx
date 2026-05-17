import { useEffect, useState } from "react";
import { Shield, Globe, FileText, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

/**
 * Tier 1 closeout #20 — owner-side UPO + Schengen viewer.
 *
 * Pre-fix: the backend routes /api/mos2026/upo/:workerId and
 * /api/schengen/worker/:workerId existed and were correctly auth-scoped
 * (commit 07def30), but NO admin-side UI rendered the data. Manish/Anna
 * had zero ability to inspect any worker's UPO or Schengen status from
 * the dashboard.
 *
 * This component is a drop-in section pair (UPO + Schengen) for the
 * WorkerProfilePanel. It queries the same two routes a worker uses on
 * mobile — the auth-scope helper at lib/worker-scope.ts allows
 * admin/coordinator/manager/legal/operations roles to read any worker's
 * data. Empty result is honest-empty (real query returned zero rows).
 *
 * State handling: explicit loading / error / empty / populated branches
 * for each section (no error-masks-as-empty).
 */

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("eej_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface UPORecord {
  id: string;
  submission_number: string;
  submission_date: string;
  case_type: string | null;
  authority: string | null;
  art108_locked: boolean | null;
}

interface SchengenData {
  art108Active?: boolean;
  calculation?: {
    daysUsed: number;
    daysRemaining: number;
    latestLegalExitDate: string;
    isOverstay?: boolean;
    isWarning?: boolean;
  } | null;
}

export function WorkerComplianceSections({ workerId }: { workerId: string }) {
  return (
    <>
      <UPOSection workerId={workerId} />
      <SchengenSection workerId={workerId} />
    </>
  );
}

function UPOSection({ workerId }: { workerId: string }) {
  const [records, setRecords] = useState<UPORecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/mos2026/upo/${encodeURIComponent(workerId)}`, { headers: authHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRecords((data?.records ?? []) as UPORecord[]);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [workerId]);

  return (
    <div>
      <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3 flex items-center gap-2">
        <Shield className="w-3.5 h-3.5" />
        UPO Vault (Art. 108)
      </h3>
      {loading ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800 border border-slate-700">
          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
          <span className="text-xs text-gray-400">Loading UPO records…</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-900/20 border border-red-500/40">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-xs text-red-300">Could not load UPO records: {error}</span>
        </div>
      ) : !records || records.length === 0 ? (
        <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 text-center">
          <FileText className="w-5 h-5 text-gray-600 mx-auto mb-1.5" />
          <p className="text-xs font-medium text-gray-400">No UPO submissions on file</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Add via /mos-2026 or worker self-upload</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div
              key={r.id}
              className="p-3 rounded-lg border"
              style={{
                background: r.art108_locked ? "rgba(34,197,94,0.06)" : "rgba(30,41,59,0.6)",
                borderColor: r.art108_locked ? "rgba(34,197,94,0.3)" : "rgba(51,65,85,0.6)",
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  {r.art108_locked ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                  )}
                  <span className="text-xs font-bold text-white">
                    {r.art108_locked ? "Art. 108 — Legal Stay Confirmed" : "UPO Receipt"}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-gray-500">
                  {r.submission_date?.slice(0, 10)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                <span className="text-gray-500">Submission #</span>
                <span className="font-mono text-gray-300 text-right">{r.submission_number}</span>
                <span className="text-gray-500">Case type</span>
                <span className="text-gray-300 text-right">{r.case_type ?? "—"}</span>
                {r.authority && (
                  <>
                    <span className="text-gray-500">Authority</span>
                    <span className="text-gray-300 text-right">{r.authority}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SchengenSection({ workerId }: { workerId: string }) {
  const [data, setData] = useState<SchengenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/schengen/worker/${encodeURIComponent(workerId)}`, { headers: authHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setData(d as SchengenData);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [workerId]);

  const calc = data?.calculation;

  return (
    <div>
      <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3 flex items-center gap-2">
        <Globe className="w-3.5 h-3.5" />
        Schengen 90/180
      </h3>
      {loading ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800 border border-slate-700">
          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
          <span className="text-xs text-gray-400">Calculating Schengen status…</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-900/20 border border-red-500/40">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-xs text-red-300">Could not compute Schengen: {error}</span>
        </div>
      ) : data?.art108Active ? (
        <div className="p-3 rounded-lg bg-green-900/15 border border-green-500/30">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs font-bold text-green-300">Art. 108 protection active</span>
          </div>
          <p className="text-[10px] text-green-200/70 mt-1.5">
            The TRC application is pending — the Schengen 90/180 rule does not apply while Art. 108
            is in force.
          </p>
        </div>
      ) : !calc ? (
        <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 text-center">
          <Globe className="w-5 h-5 text-gray-600 mx-auto mb-1.5" />
          <p className="text-xs font-medium text-gray-400">No border crossings recorded</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Add via /border-crossings or worker self-entry</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className="p-3 rounded-lg border"
            style={{
              background: calc.isOverstay ? "rgba(239,68,68,0.08)" : calc.isWarning ? "rgba(245,158,11,0.08)" : "rgba(30,41,59,0.6)",
              borderColor: calc.isOverstay ? "rgba(239,68,68,0.4)" : calc.isWarning ? "rgba(245,158,11,0.4)" : "rgba(51,65,85,0.6)",
            }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-white">Days remaining</span>
              <span
                className="text-2xl font-black font-mono"
                style={{
                  color: calc.isOverstay ? "#ef4444" : calc.isWarning ? "#f59e0b" : "#60a5fa",
                }}
              >
                {calc.daysRemaining}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
              <span className="text-gray-500">Days used (180-day window)</span>
              <span className="font-mono text-gray-300 text-right">{calc.daysUsed} / 90</span>
              <span className="text-gray-500">Latest legal exit</span>
              <span className="font-mono text-gray-300 text-right">{calc.latestLegalExitDate}</span>
            </div>
            {calc.isOverstay && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-red-500/20">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-[10px] font-bold text-red-300">Overstay — file residence application immediately</span>
              </div>
            )}
            {calc.isWarning && !calc.isOverstay && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-amber-500/20">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-300">Less than 15 days remaining — plan filing</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
