import { useState, useEffect } from "react";
import { Globe, Clock, AlertTriangle } from "lucide-react";
function getToken() { return localStorage.getItem("apatris_jwt") ?? sessionStorage.getItem("eej_token") ?? ""; }
export default function PostedDeadlines() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/posted-workers/deadlines", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Globe className="w-6 h-6 text-primary" /> Posted Worker Deadlines</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Total Workers</div><div className="text-2xl font-bold text-white">{data?.totalWorkers ?? 0}</div></div>
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Upcoming Deadlines</div><div className="text-2xl font-bold text-amber-400">{data?.deadlinesCount ?? 0}</div></div>
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Critical</div><div className="text-2xl font-bold text-red-400">{data?.criticalCount ?? 0}</div></div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted/30">
          <th className="text-left p-3 text-muted-foreground">Worker</th><th className="text-left p-3 text-muted-foreground">Site</th>
          <th className="text-left p-3 text-muted-foreground">Type</th><th className="text-right p-3 text-muted-foreground">Days Left</th>
          <th className="text-left p-3 text-muted-foreground">Action</th><th className="text-center p-3 text-muted-foreground">Urgency</th>
        </tr></thead><tbody>
          {(data?.deadlines ?? []).map((d: any, i: number) => (
            <tr key={i} className="border-b border-border/50"><td className="p-3 text-white font-medium">{d.workerName}</td><td className="p-3 text-muted-foreground">{d.site}</td>
              <td className="p-3 text-muted-foreground">{d.type}</td><td className="p-3 text-right font-mono" style={{ color: d.daysLeft < 0 ? "#ef4444" : d.daysLeft < 14 ? "#f59e0b" : "#22c55e" }}>{d.daysLeft}d</td>
              <td className="p-3 text-xs text-muted-foreground">{d.action}</td>
              <td className="p-3 text-center"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: d.urgency === "CRITICAL" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)", color: d.urgency === "CRITICAL" ? "#ef4444" : "#f59e0b" }}>{d.urgency}</span></td></tr>
          ))}
          {(data?.deadlines ?? []).length === 0 && <tr><td colSpan={6} className="p-8 text-center text-green-400">No upcoming deadlines</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
