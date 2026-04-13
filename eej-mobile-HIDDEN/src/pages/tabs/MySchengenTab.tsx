/**
 * My Schengen Days — simple counter showing 90/180 day status.
 * Read-only for workers.
 */
import { useState, useEffect } from "react";
import { Globe, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

const API = "/api";

export default function MySchengenTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [workerName, setWorkerName] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("eej_mobile_token") ?? sessionStorage.getItem("eej_token") ?? "";
    fetch(`${API}/workers`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } })
      .then(r => r.json())
      .then(json => {
        const workers = json.workers ?? json ?? [];
        if (workers.length > 0) {
          const w = workers[0];
          setWorkerName(w.name);
          fetch(`${API}/schengen/worker/${w.id}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
        } else { setLoading(false); };
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  const calc = data?.calculation;
  const pct = calc ? Math.min(100, Math.round((calc.daysUsed / 90) * 100)) : 0;

  return (
    <div className="p-4 space-y-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <Globe className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">Schengen Days</h1>
        <p className="text-xs text-gray-500 mt-1">90/180 day rule tracker</p>
        <p className="text-xs text-gray-400">{workerName}</p>
      </div>

      {data?.art108Active && (
        <div className="rounded-2xl p-4 bg-green-50 border-2 border-green-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm font-bold text-green-700">Art. 108 Protection Active</p>
              <p className="text-xs text-green-600">Your TRC application is pending — Schengen 90/180 rule does not apply to you</p>
            </div>
          </div>
        </div>
      )}

      {calc && !data?.art108Active && (
        <>
          {/* Big number */}
          <div className="rounded-2xl bg-white border-2 border-gray-200 p-6 text-center">
            <p className={`text-5xl font-black ${calc.daysRemaining < 10 ? "text-red-600" : calc.daysRemaining < 20 ? "text-yellow-600" : "text-blue-600"}`}>
              {calc.daysRemaining}
            </p>
            <p className="text-sm text-gray-500 mt-1">days remaining</p>
          </div>

          {/* Progress bar */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{calc.daysUsed} days used</span>
              <span>90 day limit</span>
            </div>
            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Warnings */}
          {calc.isOverstay && (
            <div className="rounded-2xl p-4 bg-red-50 border-2 border-red-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <div>
                  <p className="text-sm font-bold text-red-700">OVERSTAY</p>
                  <p className="text-xs text-red-600">You have exceeded the 90-day Schengen limit. Contact your coordinator immediately.</p>
                </div>
              </div>
            </div>
          )}

          {calc.isWarning && !calc.isOverstay && (
            <div className="rounded-2xl p-4 bg-yellow-50 border-2 border-yellow-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="text-sm font-bold text-yellow-700">Less than 15 days remaining</p>
                  <p className="text-xs text-yellow-600">Talk to your coordinator about filing a residence application.</p>
                </div>
              </div>
            </div>
          )}

          {/* Exit date */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Latest legal exit</span>
              <span className="text-sm font-bold text-gray-900">{calc.latestLegalExitDate}</span>
            </div>
          </div>
        </>
      )}

      {!calc && !data?.art108Active && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center">
          <Globe className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No border crossings recorded</p>
          <p className="text-xs text-gray-400 mt-1">Your coordinator will enter your travel dates</p>
        </div>
      )}
    </div>
  );
}
