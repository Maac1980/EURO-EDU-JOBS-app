import { useState, useEffect } from "react";
import { Shield, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
export default function SafetyMonitor() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/safety/report", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  const colors = { compliant: "#22c55e", expiring: "#f59e0b", non_compliant: "#ef4444", missing: "#6b7280" };
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Shield className="w-6 h-6 text-green-400" /> Safety Monitor — BHP & Medical</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Total</div><div className="text-2xl font-bold text-white">{data?.totalWorkers ?? 0}</div></div>
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Compliant</div><div className="text-2xl font-bold text-green-400">{data?.compliant ?? 0}</div></div>
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Expiring</div><div className="text-2xl font-bold text-amber-400">{data?.expiringSoon ?? 0}</div></div>
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Expired</div><div className="text-2xl font-bold text-red-400">{data?.expired ?? 0}</div></div>
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Compliance %</div><div className="text-2xl font-bold" style={{ color: (data?.complianceRate ?? 0) >= 80 ? "#22c55e" : "#ef4444" }}>{data?.complianceRate ?? 0}%</div></div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted/30">
          <th className="text-left p-3 text-muted-foreground">Worker</th><th className="text-left p-3 text-muted-foreground">Site</th>
          <th className="text-center p-3 text-muted-foreground">BHP</th><th className="text-center p-3 text-muted-foreground">Medical</th>
          <th className="text-center p-3 text-muted-foreground">Status</th>
        </tr></thead><tbody>
          {(data?.workers ?? []).slice(0, 30).map((w: any) => (
            <tr key={w.workerId} className="border-b border-border/50">
              <td className="p-3 text-white font-medium">{w.workerName}</td><td className="p-3 text-muted-foreground">{w.site ?? "—"}</td>
              <td className="p-3 text-center"><span className="font-mono text-xs" style={{ color: colors[w.bhp.status as keyof typeof colors] ?? "#6b7280" }}>{w.bhp.daysLeft !== null ? `${w.bhp.daysLeft}d` : "—"}</span></td>
              <td className="p-3 text-center"><span className="font-mono text-xs" style={{ color: colors[w.medical.status as keyof typeof colors] ?? "#6b7280" }}>{w.medical.daysLeft !== null ? `${w.medical.daysLeft}d` : "—"}</span></td>
              <td className="p-3 text-center"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${colors[w.overallStatus as keyof typeof colors] ?? "#6b7280"}20`, color: colors[w.overallStatus as keyof typeof colors] ?? "#6b7280" }}>{w.overallStatus}</span></td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
