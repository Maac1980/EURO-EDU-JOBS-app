import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, DollarSign, MapPin, Shield } from "lucide-react";

function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
function fmt(n: number) { return n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

export default function FinesRiskReport() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/fines/risk-report", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading fines report...</div>;
  if (!data) return <div className="p-8 text-center text-muted-foreground">Failed to load report</div>;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><AlertTriangle className="w-6 h-6 text-red-400" /> PIP Fines Risk Report</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground uppercase mb-2">Total Violations</div>
          <div className="text-3xl font-black" style={{ color: data.totalViolations > 0 ? "#ef4444" : "#22c55e" }}>{data.totalViolations}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground uppercase mb-2">Immediate Action</div>
          <div className="text-3xl font-black text-red-400">{data.immediateCount}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground uppercase mb-2">Min Exposure</div>
          <div className="text-2xl font-black text-amber-400">{fmt(data.totalMinExposure)} PLN</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground uppercase mb-2">Max Exposure</div>
          <div className="text-2xl font-black text-red-400">{fmt(data.totalMaxExposure)} PLN</div>
        </div>
      </div>

      {/* By Site */}
      {data.bySite?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Exposure by Site</h2>
          <div className="space-y-2">
            {data.bySite.map((s: any) => (
              <div key={s.site} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <span className="text-sm font-bold text-white">{s.site}</span>
                  <span className="text-xs text-muted-foreground ml-2">{s.count} violations</span>
                </div>
                <span className="text-sm font-mono font-bold text-red-400">{fmt(s.minExposure)} — {fmt(s.maxExposure)} PLN</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Violations table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th className="text-left p-3 text-muted-foreground font-medium">Worker</th>
            <th className="text-left p-3 text-muted-foreground font-medium">Site</th>
            <th className="text-left p-3 text-muted-foreground font-medium">Violation</th>
            <th className="text-right p-3 text-muted-foreground font-medium">Fine Range</th>
            <th className="text-center p-3 text-muted-foreground font-medium">Urgency</th>
          </tr></thead>
          <tbody>
            {(data.risks ?? []).slice(0, 30).map((r: any, i: number) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                <td className="p-3 text-white font-medium">{r.workerName}</td>
                <td className="p-3 text-muted-foreground">{r.site}</td>
                <td className="p-3 text-muted-foreground text-xs">{r.fineLabel}</td>
                <td className="p-3 text-right font-mono text-red-400">{fmt(r.fineMin)} — {fmt(r.fineMax)}</td>
                <td className="p-3 text-center">
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{
                    background: r.urgency === "IMMEDIATE" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                    color: r.urgency === "IMMEDIATE" ? "#ef4444" : "#f59e0b",
                  }}>{r.urgency}</span>
                </td>
              </tr>
            ))}
            {(data.risks ?? []).length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-green-400 font-bold">No violations found — all workers compliant</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
