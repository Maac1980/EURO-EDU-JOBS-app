/**
 * My Legal Status — worker sees their own permit status, risk, next action.
 * Read-only. No filing, no drafting.
 */
import { useState, useEffect } from "react";
import { Shield, AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";

const API = "/api";

export default function MyStatusTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("eej_mobile_token") ?? sessionStorage.getItem("eej_token") ?? "";
    fetch(`${API}/workers`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } })
      .then(r => r.json())
      .then(json => {
        const workers = json.workers ?? json ?? [];
        if (workers.length > 0) {
          const w = workers[0];
          // Try to get intelligence
          fetch(`${API}/legal-intelligence/worker/${w.id}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } })
            .then(r => r.ok ? r.json() : null)
            .then(intel => { setData({ worker: w, intel: intel?.intelligence }); setLoading(false); })
            .catch(() => { setData({ worker: w, intel: null }); setLoading(false); });
        } else { setError("No worker profile linked to your account. Contact HR to set up your profile."); setLoading(false); }
      })
      .catch(() => { setError("Cannot connect to server. Check your internet connection and try again."); setLoading(false); });
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  if (error) return <div className="p-4 text-center text-red-500 text-sm">{error}</div>;

  const w = data?.worker;
  const intel = data?.intel;
  const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
  const permitDays = daysUntil(w?.trc_expiry ?? w?.work_permit_expiry);

  return (
    <div className="p-4 space-y-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <Shield className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">My Legal Status</h1>
        <p className="text-xs text-gray-500 mt-1">{w?.name}</p>
      </div>

      {/* Status card */}
      <div className={`rounded-2xl p-4 ${
        intel?.riskLevel === "CRITICAL" ? "bg-red-50 border-2 border-red-200" :
        intel?.riskLevel === "HIGH" ? "bg-orange-50 border-2 border-orange-200" :
        "bg-green-50 border-2 border-green-200"
      }`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase text-gray-500">Status</span>
          <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
            intel?.riskLevel === "CRITICAL" ? "bg-red-100 text-red-700" :
            intel?.riskLevel === "HIGH" ? "bg-orange-100 text-orange-700" :
            "bg-green-100 text-green-700"
          }`}>{intel?.riskLevel ?? "CHECKING"}</span>
        </div>
        {intel?.primaryAction && intel.primaryAction !== "No immediate action required" && (
          <p className="text-sm font-medium text-gray-800">{intel.primaryAction}</p>
        )}
        {!intel?.primaryAction || intel.primaryAction === "No immediate action required" ? (
          <p className="text-sm text-green-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> You are clear to work</p>
        ) : null}
      </div>

      {/* Permit expiry */}
      {permitDays !== null && (
        <div className={`rounded-2xl p-4 ${permitDays < 0 ? "bg-red-50 border border-red-200" : permitDays < 30 ? "bg-yellow-50 border border-yellow-200" : "bg-white border border-gray-200"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className={`w-5 h-5 ${permitDays < 0 ? "text-red-500" : permitDays < 30 ? "text-yellow-500" : "text-blue-500"}`} />
              <span className="text-sm font-medium text-gray-700">Permit</span>
            </div>
            <span className={`text-lg font-black ${permitDays < 0 ? "text-red-600" : permitDays < 30 ? "text-yellow-600" : "text-blue-600"}`}>
              {permitDays < 0 ? `${Math.abs(permitDays)}d overdue` : `${permitDays}d left`}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Expires: {w?.trc_expiry ?? w?.work_permit_expiry ?? "N/A"}</p>
        </div>
      )}

      {/* Deadlines */}
      {intel?.deadlines?.filter((d: any) => d.status !== "ok").length > 0 && (
        <div className="rounded-2xl border border-gray-200 p-4 bg-white">
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Deadlines</h3>
          {intel.deadlines.filter((d: any) => d.status !== "ok").slice(0, 4).map((d: any, i: number) => (
            <div key={i} className={`flex items-center justify-between py-1.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
              <span className="text-sm text-gray-700">{d.label}</span>
              <span className={`text-sm font-bold ${d.status === "expired" ? "text-red-600" : "text-yellow-600"}`}>
                {d.daysLeft < 0 ? `${Math.abs(d.daysLeft)}d overdue` : `${d.daysLeft}d`}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center">Last checked: {new Date().toLocaleString()}</p>
    </div>
  );
}
