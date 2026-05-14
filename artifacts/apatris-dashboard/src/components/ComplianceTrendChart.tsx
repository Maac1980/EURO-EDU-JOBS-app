import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authHeaders } from "@/lib/api";

interface Snapshot {
  week: string;
  date: string;
  red: number;
  yellow: number;
  green: number;
  total: number;
}

const LIME = "#E9FF70";

function TrendBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  const diff = current - previous;
  const isGoodMetric = label === "green";

  const isImproving = isGoodMetric ? diff > 0 : diff < 0;
  const isWorsening = isGoodMetric ? diff < 0 : diff > 0;

  return (
    <div className="flex items-center gap-1">
      {diff === 0 ? (
        <Minus className="w-3 h-3 text-gray-500" />
      ) : isImproving ? (
        <TrendingUp className="w-3 h-3 text-green-400" />
      ) : (
        <TrendingDown className="w-3 h-3 text-red-400" />
      )}
      <span className={`text-[10px] font-mono font-bold ${
        diff === 0 ? "text-gray-500" : isImproving ? "text-green-400" : "text-red-400"
      }`}>
        {diff > 0 ? `+${diff}` : diff}
      </span>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  dateMap: Record<string, string>;
}

function CustomTooltip({ active, payload, label, dateMap }: CustomTooltipProps) {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;

  const dateStr = dateMap[label ?? ""] ?? label;
  const total = payload.reduce((s, p) => s + p.value, 0);

  const nameMap: Record<string, string> = {
    green: t("trend.compliant"),
    yellow: t("trend.warning"),
    red: t("trend.critical"),
  };

  return (
    <div className="rounded-xl border shadow-2xl px-4 py-3 text-xs font-mono" style={{ background: "#1e2130", borderColor: "rgba(233,255,112,0.2)" }}>
      <p className="font-black text-white mb-2 uppercase tracking-widest">{dateStr}</p>
      {[...payload].reverse().map((p) => (
        <div key={p.name} className="flex justify-between gap-6 mb-1">
          <span style={{ color: p.color }}>{nameMap[p.name] ?? p.name}</span>
          <span className="font-bold text-white">{p.value} / {total}</span>
        </div>
      ))}
    </div>
  );
}

export function ComplianceTrendChart() {
  const { t } = useTranslation();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      // /api/compliance/trend is gated by authenticateToken (compliance.ts:95).
      // Without the Bearer header the fetch 401s and the panel renders the
      // "Failed to load trend data" error state. Walkthrough finding #3.
      const res = await fetch(`${base}/api/compliance/trend`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load trend data");
      const data = await res.json();
      setSnapshots(data.snapshots ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const dateMap: Record<string, string> = {};
  snapshots.forEach((s) => { dateMap[s.week] = s.date; });

  // Trend direction — compare first 4 weeks avg vs last 4 weeks avg for "red"
  const firstHalf = snapshots.slice(0, 4);
  const secondHalf = snapshots.slice(4);
  const avgRed1 = firstHalf.length ? firstHalf.reduce((s, x) => s + x.red, 0) / firstHalf.length : 0;
  const avgRed2 = secondHalf.length ? secondHalf.reduce((s, x) => s + x.red, 0) / secondHalf.length : 0;
  const trendDelta = Math.round(avgRed2 - avgRed1);
  const trendImproving = trendDelta < 0;
  const trendNeutral = trendDelta === 0;

  const last = snapshots[snapshots.length - 1];
  const prev = snapshots[snapshots.length - 2];

  return (
    <div className="glass-panel rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(233,255,112,0.15)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(233,255,112,0.03)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(233,255,112,0.12)", border: "1px solid rgba(233,255,112,0.25)" }}>
            <TrendingUp className="w-4 h-4" style={{ color: LIME }} />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">{t("trend.title")}</h3>
            <p className="text-[10px] font-mono text-gray-500">{t("trend.subtitle")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Overall trend pill */}
          {!loading && snapshots.length > 1 && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
              trendNeutral
                ? "bg-gray-700/50 text-gray-400"
                : trendImproving
                  ? "bg-green-500/15 text-green-400 border border-green-500/30"
                  : "bg-red-500/15 text-red-400 border border-red-500/30"
            }`}>
              {trendNeutral
                ? <><Minus className="w-3 h-3" /> {t("trend.stable")}</>
                : trendImproving
                  ? <><TrendingUp className="w-3 h-3" /> {t("trend.improving")}</>
                  : <><TrendingDown className="w-3 h-3" /> {t("trend.worsening")}</>
              }
            </div>
          )}

          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            title={t("trend.refresh")}
          >
            <RefreshCcw className={`w-3.5 h-3.5 text-gray-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        {loading ? (
          <div className="h-52 flex items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: LIME, borderTopColor: "transparent" }} />
            <span className="text-xs font-mono text-gray-500">{t("trend.loading")}</span>
          </div>
        ) : error ? (
          <div className="h-52 flex items-center justify-center text-xs font-mono text-red-400">{error}</div>
        ) : snapshots.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-xs font-mono text-gray-500">{t("trend.noData")}</div>
        ) : (
          <>
            {/* Stat pills — this week vs last week */}
            {last && prev && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                {([
                  { key: "red",    label: t("trend.critical"), color: "#f87171", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.25)" },
                  { key: "yellow", label: t("trend.warning"),  color: "#fbbf24", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.25)" },
                  { key: "green",  label: t("trend.compliant"), color: "#4ade80", bg: "rgba(74,222,128,0.10)", border: "rgba(74,222,128,0.25)" },
                ] as const).map(({ key, label, color, bg, border }) => (
                  <div key={key} className="rounded-xl p-3" style={{ background: bg, border: `1px solid ${border}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</span>
                      <TrendBadge current={last[key]} previous={prev[key]} label={key} />
                    </div>
                    <p className="text-2xl font-black" style={{ color }}>{last[key]}</p>
                    <p className="text-[9px] font-mono text-gray-600 mt-0.5">{t("trend.thisWeek")}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Chart */}
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={snapshots} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ade80" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="gradYellow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => dateMap[val] ?? val}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip dateMap={dateMap} />} />
                <Legend
                  wrapperStyle={{ paddingTop: "12px", fontSize: "10px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}
                  formatter={(value) => {
                    const map: Record<string, string> = { green: t("trend.compliant"), yellow: t("trend.warning"), red: t("trend.critical") };
                    return <span style={{ color: "#9ca3af" }}>{map[value] ?? value}</span>;
                  }}
                />
                {/* Stack from bottom: green → yellow → red (red on top = most visible) */}
                <Area type="monotone" dataKey="green" stackId="1" stroke="#4ade80" strokeWidth={2} fill="url(#gradGreen)" dot={false} activeDot={{ r: 4, fill: "#4ade80" }} />
                <Area type="monotone" dataKey="yellow" stackId="1" stroke="#fbbf24" strokeWidth={2} fill="url(#gradYellow)" dot={false} activeDot={{ r: 4, fill: "#fbbf24" }} />
                <Area type="monotone" dataKey="red" stackId="1" stroke="#f87171" strokeWidth={2} fill="url(#gradRed)" dot={false} activeDot={{ r: 4, fill: "#f87171" }} />
              </AreaChart>
            </ResponsiveContainer>

            <p className="text-[9px] font-mono text-gray-600 text-center mt-3">
              {t("trend.note")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
