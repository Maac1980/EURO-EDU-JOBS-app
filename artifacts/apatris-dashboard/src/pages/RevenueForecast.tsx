import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp, DollarSign, Users, AlertTriangle, Building2, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

const Y = "#d4e84b";
const G = "#22c55e";
const R = "#ef4444";
const A = "#f59e0b";

function getToken(): string {
  return localStorage.getItem("apatris_jwt") ?? sessionStorage.getItem("eej_token") ?? "";
}

function fmt(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface ForecastMonth { month: number; year: number; label: string; projected: number; workers: number; atRisk: number }
interface Summary { currentMonth: number; nextMonth: number; sixMonthTotal: number; activeWorkers: number; avgRate: number; revenueAtRisk: number; contractsEndingSoon: number; topClients: { name: string; total: number }[] }
interface Comparison { month: string; projected: number; invoiced: number; paid: number; outstanding: number }

export default function RevenueForecast() {
  const { t } = useTranslation();
  const [forecast, setForecast] = useState<ForecastMonth[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [comparison, setComparison] = useState<Comparison[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${getToken()}` };
    Promise.all([
      fetch("/api/revenue/forecast", { headers }).then(r => r.json()),
      fetch("/api/revenue/summary", { headers }).then(r => r.json()),
      fetch("/api/revenue/actual", { headers }).then(r => r.json()),
    ]).then(([f, s, a]) => {
      setForecast(f.forecast ?? []);
      setSummary(s);
      setComparison(a.comparison ?? []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading revenue data...</div>;

  const kpis = summary ? [
    { label: "Current Month", value: `${fmt(summary.currentMonth)} PLN`, icon: DollarSign, color: G },
    { label: "Next Month", value: `${fmt(summary.nextMonth)} PLN`, icon: Calendar, color: "#3b82f6" },
    { label: "6-Month Total", value: `${fmt(summary.sixMonthTotal)} PLN`, icon: TrendingUp, color: Y },
    { label: "Active Workers", value: String(summary.activeWorkers), icon: Users, color: "#8b5cf6" },
    { label: "Avg Rate/h", value: `${fmt(summary.avgRate)} PLN`, icon: DollarSign, color: "#0ea5e9" },
    { label: "Revenue at Risk", value: `${fmt(summary.revenueAtRisk)} PLN`, icon: AlertTriangle, color: R },
  ] : [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6" style={{ color: Y }} /> Revenue Forecasting
          </h1>
          <p className="text-sm text-muted-foreground mt-1">6-month forward projection based on active workers and contracts</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {kpis.map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <k.icon className="w-4 h-4" style={{ color: k.color }} />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{k.label}</span>
            </div>
            <div className="text-lg font-black" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 6-Month Forecast Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">6-Month Revenue Forecast</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={forecast}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" tick={{ fill: "#7a8599", fontSize: 11 }} />
              <YAxis tick={{ fill: "#7a8599", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#101624", border: "1px solid rgba(212,232,75,0.2)", borderRadius: 8, color: "#dde4f0" }}
                formatter={(v: number) => [`${fmt(v)} PLN`, "Projected"]}
              />
              <Bar dataKey="projected" fill={Y} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Actual vs Projected */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">Actual vs Projected</h2>
          {comparison.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={comparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" tick={{ fill: "#7a8599", fontSize: 11 }} />
                <YAxis tick={{ fill: "#7a8599", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "#101624", border: "1px solid rgba(212,232,75,0.2)", borderRadius: 8, color: "#dde4f0" }} />
                <Legend />
                <Line type="monotone" dataKey="projected" stroke={Y} strokeWidth={2} dot={false} name="Projected" />
                <Line type="monotone" dataKey="paid" stroke={G} strokeWidth={2} dot={false} name="Paid" />
                <Line type="monotone" dataKey="outstanding" stroke={A} strokeWidth={2} dot={false} name="Outstanding" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">No invoice data yet</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue at Risk */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: R }} /> Revenue at Risk
          </h2>
          {summary && summary.contractsEndingSoon > 0 ? (
            <div>
              <div className="text-3xl font-black" style={{ color: R }}>{fmt(summary.revenueAtRisk)} PLN</div>
              <p className="text-sm text-muted-foreground mt-1">{summary.contractsEndingSoon} contracts ending within 30 days with no renewal</p>
              <div className="mt-4 space-y-2">
                {forecast.map(m => m.atRisk > 0 ? (
                  <div key={m.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span style={{ color: R }}>{m.atRisk} workers at risk</span>
                  </div>
                ) : null)}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm py-4">No contracts ending within 30 days</div>
          )}
        </div>

        {/* Top 5 Revenue Clients */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4" style={{ color: "#3b82f6" }} /> Top Revenue Clients
          </h2>
          {summary && summary.topClients.length > 0 ? (
            <div className="space-y-3">
              {summary.topClients.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: `${Y}20`, color: Y }}>{i + 1}</span>
                    <span className="text-sm text-white font-medium">{c.name}</span>
                  </div>
                  <span className="text-sm font-mono font-bold" style={{ color: Y }}>{fmt(c.total)} PLN</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm py-4">No client revenue data</div>
          )}
        </div>
      </div>
    </div>
  );
}
