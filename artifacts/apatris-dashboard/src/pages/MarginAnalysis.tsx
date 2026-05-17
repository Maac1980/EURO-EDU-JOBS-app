import { useState, useEffect } from "react";
import { TrendingUp, DollarSign, Building2 } from "lucide-react";
function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
function fmt(n: number) { return n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
export default function MarginAnalysis() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/margins/analysis", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><TrendingUp className="w-6 h-6 text-primary" /> Margin Analysis</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Monthly Revenue</div><div className="text-xl font-bold text-primary">{fmt(data?.totals?.revenue ?? 0)} PLN</div></div>
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Monthly Cost</div><div className="text-xl font-bold text-red-400">{fmt(data?.totals?.cost ?? 0)} PLN</div></div>
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Monthly Margin</div><div className="text-xl font-bold text-green-400">{fmt(data?.totals?.margin ?? 0)} PLN</div></div>
        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Margin %</div><div className="text-xl font-bold" style={{ color: (data?.totals?.marginPercent ?? 0) >= 20 ? "#22c55e" : "#f59e0b" }}>{data?.totals?.marginPercent ?? 0}%</div></div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted/30">
          <th className="text-left p-3 text-muted-foreground">Site</th><th className="text-right p-3 text-muted-foreground">Workers</th>
          <th className="text-right p-3 text-muted-foreground">Revenue</th><th className="text-right p-3 text-muted-foreground">Cost</th>
          <th className="text-right p-3 text-muted-foreground">Margin</th><th className="text-right p-3 text-muted-foreground">%</th>
        </tr></thead><tbody>
          {(data?.sites ?? []).map((s: any) => (
            <tr key={s.site} className="border-b border-border/50">
              <td className="p-3 text-white font-medium">{s.site}</td><td className="p-3 text-right text-muted-foreground">{s.workers}</td>
              <td className="p-3 text-right font-mono text-primary">{fmt(s.totalRevenue)}</td><td className="p-3 text-right font-mono text-red-400">{fmt(s.totalCost)}</td>
              <td className="p-3 text-right font-mono text-green-400">{fmt(s.totalMargin)}</td>
              <td className="p-3 text-right font-bold" style={{ color: s.marginPercent >= 20 ? "#22c55e" : "#f59e0b" }}>{s.marginPercent}%</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
