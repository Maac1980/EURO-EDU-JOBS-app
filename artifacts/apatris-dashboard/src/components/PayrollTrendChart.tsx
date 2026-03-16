import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp } from "lucide-react";

interface TrendPoint {
  monthYear: string;
  totalGross: number;
  totalNetto: number;
  count: number;
}

function fmt(val: number) {
  return `${val.toLocaleString("pl-PL", { minimumFractionDigits: 0 })} zł`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TrendPoint;
  return (
    <div className="rounded-xl px-4 py-3 text-xs shadow-xl" style={{ background: "#1a1a1a", border: "1px solid rgba(233,255,112,0.25)" }}>
      <p className="font-black text-white mb-1">{label}</p>
      <p className="text-white/60">Brutto: <span className="text-white font-bold">{fmt(d.totalGross)}</span></p>
      <p style={{ color: "#E9FF70" }}>Netto: <span className="font-black">{fmt(d.totalNetto)}</span></p>
      <p className="text-white/40 mt-1">{d.count} pracowników</p>
    </div>
  );
};

export function PayrollTrendChart({ token }: { token: string | null }) {
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/payroll/trend?months=6`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => { setTrend(d.trend ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="rounded-2xl p-6 flex items-center justify-center" style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", height: 180 }}>
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#E9FF70", borderTopColor: "transparent" }} />
    </div>
  );

  if (trend.length === 0) return (
    <div className="rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-center" style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", height: 180 }}>
      <TrendingUp className="w-8 h-8 text-white/10" />
      <p className="text-xs font-bold uppercase tracking-widest text-white/30">Brak danych historycznych</p>
      <p className="text-[10px] font-mono text-white/20">Wykres pojawi się po zamknięciu pierwszego miesiąca</p>
    </div>
  );

  const maxVal = Math.max(...trend.map((t) => t.totalGross));

  return (
    <div className="rounded-2xl p-5" style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: "#E9FF70" }} />
          <span className="text-xs font-black uppercase tracking-widest text-white">Trend Wypłat (6 miesięcy)</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[10px] text-white/40">
            <span className="w-3 h-3 rounded-sm opacity-40" style={{ background: "#E9FF70" }} />Brutto
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-white/40">
            <span className="w-3 h-3 rounded-sm" style={{ background: "#E9FF70" }} />Netto
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={trend} barGap={2} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="monthYear"
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "monospace" }}
            axisLine={false} tickLine={false}
          />
          <YAxis hide domain={[0, maxVal * 1.15]} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="totalGross" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {trend.map((_, i) => (
              <Cell key={i} fill="rgba(233,255,112,0.3)" />
            ))}
          </Bar>
          <Bar dataKey="totalNetto" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {trend.map((_, i) => (
              <Cell key={i} fill="#E9FF70" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
