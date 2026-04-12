/**
 * My UPO — show worker's digital UPO receipt (replaces passport stamp).
 * Read-only proof of legal stay under Art. 108.
 */
import { useState, useEffect } from "react";
import { Shield, FileText, Loader2, CheckCircle2 } from "lucide-react";

const API = "/api";

export default function MyUPOTab() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
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
          fetch(`${API}/mos2026/upo/${w.id}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } })
            .then(r => r.ok ? r.json() : { records: [] })
            .then(data => { setRecords(data.records ?? []); setLoading(false); })
            .catch(() => setLoading(false));
        } else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  return (
    <div className="p-4 space-y-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
          <Shield className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">My UPO Certificate</h1>
        <p className="text-xs text-gray-500 mt-1">Digital proof of legal stay (replaces passport stamp)</p>
        <p className="text-xs text-gray-400">{workerName}</p>
      </div>

      {records.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No UPO registered yet</p>
          <p className="text-xs text-gray-400 mt-1">Contact your coordinator to register your UPO</p>
        </div>
      ) : (
        records.map((r: any) => (
          <div key={r.id} className={`rounded-2xl p-5 ${r.art108_locked ? "bg-green-50 border-2 border-green-300" : "bg-white border border-gray-200"}`}>
            {r.art108_locked && (
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm font-bold text-green-700">Art. 108 — Legal Stay Confirmed</span>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Submission Number</span>
                <span className="text-sm font-mono font-bold text-gray-900">{r.submission_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Filing Date</span>
                <span className="text-sm font-bold text-gray-900">{r.submission_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Case Type</span>
                <span className="text-sm text-gray-700">{r.case_type}</span>
              </div>
              {r.authority && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Authority</span>
                  <span className="text-sm text-gray-700">{r.authority}</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-green-600 mt-3 text-center font-medium">
              Show this screen to border guards or PIP inspectors as proof of legal stay
            </p>
          </div>
        ))
      )}
    </div>
  );
}
