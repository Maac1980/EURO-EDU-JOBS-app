/**
 * Schengen 90/180 Calculator — manual border crossing entry + calculation.
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { Globe, Plus, Loader2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

export default function SchengenCalculatorPage() {
  const [workerId, setWorkerId] = useState("");
  const [date, setDate] = useState("");
  const [direction, setDirection] = useState<"entry" | "exit">("entry");
  const qc = useQueryClient();

  const { data: workers } = useQuery<any[]>({
    queryKey: ["workers-sch"], queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      const j = await r.json(); return (j.workers ?? j ?? []).slice(0, 100);
    }, staleTime: 60000,
  });

  const { data: calcData } = useQuery<any>({
    queryKey: ["schengen", workerId], queryFn: () => fetch(`${BASE}api/schengen/worker/${workerId}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!workerId,
  });

  const addCrossing = useMutation({
    mutationFn: async () => {
      await fetch(`${BASE}api/schengen/worker/${workerId}/crossing`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ date, direction }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schengen", workerId] }); setDate(""); },
  });

  const calc = calcData?.calculation;
  const pct = calc ? Math.min(100, Math.round((calc.daysUsed / 90) * 100)) : 0;
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div><h1 className="text-xl font-bold text-white">Schengen 90/180 Calculator</h1>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Border Crossings · Days Remaining · Art. 108 Aware</p></div>

        <select value={workerId} onChange={e => setWorkerId(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
          <option value="">— Select Worker —</option>
          {(workers ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}{w.nationality ? ` (${w.nationality})` : ""}</option>)}
        </select>

        {workerId && calc && (
          <>
            {calcData.art108Active && <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Art. 108 protection active — 90/180 rule does not apply</div>}

            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <div className="flex justify-between mb-2">
                <span className="text-xs text-slate-400">{calc.daysUsed} / 90 days used</span>
                <span className={`text-xs font-bold ${calc.daysRemaining < 15 ? "text-red-400" : "text-green-400"}`}>{calc.daysRemaining} days remaining</span>
              </div>
              <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-slate-500">
                <span>Latest legal exit: {calc.latestLegalExitDate}</span>
                {calc.isOverstay && <span className="text-red-400 font-bold">OVERSTAY</span>}
                {calc.isWarning && <span className="text-yellow-400 font-bold">WARNING — &lt;15 days</span>}
              </div>
            </div>

            {/* Add crossing */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Add Border Crossing</h3>
              <div className="flex gap-2">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm flex-1" />
                <select value={direction} onChange={e => setDirection(e.target.value as any)} className="bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm">
                  <option value="entry">Entry</option><option value="exit">Exit</option>
                </select>
                <button onClick={() => addCrossing.mutate()} disabled={!date || addCrossing.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-sm font-bold flex items-center gap-1">
                  {addCrossing.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Crossings list */}
            {(calcData.crossings ?? []).length > 0 && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Recorded Crossings</h3>
                <div className="space-y-1">
                  {(calcData.crossings as any[]).map((c: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs p-1.5 rounded bg-slate-900">
                      <span className="text-slate-300">{c.crossing_date?.toString().slice(0, 10)}</span>
                      <span className={c.direction === "entry" ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{c.direction.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stay periods */}
            {calc.periods?.length > 0 && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Stay Periods</h3>
                {calc.periods.map((p: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span className="text-slate-300">{p.entry} → {p.exit}</span>
                    <span className="text-white font-mono">{p.days} days</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
