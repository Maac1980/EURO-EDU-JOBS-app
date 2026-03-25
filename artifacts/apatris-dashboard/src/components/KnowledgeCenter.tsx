import React, { useState, useMemo } from 'react';

function calculateStrictZus(hours: number, rate: number, applyPit2: boolean, includeSickness: boolean) {
  const gross = hours * rate;
  const social = gross * 0.1126;
  const sickness = includeSickness ? gross * 0.0245 : 0;
  const healthBase = gross - social - sickness;
  const health = healthBase * 0.09;
  const kup = healthBase * 0.20;
  const taxBase = Math.round(healthBase - kup);
  let rawTax = (taxBase * 0.12) - (applyPit2 ? 300 : 0);
  const pit = Math.round(Math.max(0, rawTax));
  const net = gross - social - sickness - health - pit;
  const employerZus = gross * 0.2048;
  const totalCost = gross + employerZus;
  return { gross, social, sickness, health, pit, net, employerZus, totalCost };
}

export function KnowledgeCenter() {
  const [hours, setHours] = useState<number>(160);
  const [rate, setRate] = useState<number>(31.40);
  const [applyPit2, setApplyPit2] = useState<boolean>(true);
  const [includeSickness, setIncludeSickness] = useState<boolean>(false);
  const sim = useMemo(() => calculateStrictZus(hours, rate, applyPit2, includeSickness), [hours, rate, applyPit2, includeSickness]);
  return (
    <div className="p-4 md:p-6 bg-slate-950 min-h-screen text-slate-200 font-sans pb-24 md:pb-6">
      <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
        <div className="flex items-center space-x-3 pb-4 border-b border-slate-800">
          <h1 className="text-xl md:text-2xl font-bold text-white">ZUS Calculator</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 space-y-5">
            <div>
              <label className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                <span>Worked Hours</span><span className="text-blue-400">{hours}h</span>
              </label>
              <input type="range" min="1" max="300" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full accent-blue-500 h-2 bg-slate-800 rounded-lg appearance-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Hourly Rate (PLN)</label>
              <input type="number" step="0.10" value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none" />
            </div>
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <label className="flex items-center justify-between"><span className="text-sm text-slate-300">Apply PIT-2 (300 PLN)</span><input type="checkbox" checked={applyPit2} onChange={(e) => setApplyPit2(e.target.checked)} className="w-5 h-5 accent-blue-500" /></label>
              <label className="flex items-center justify-between"><span className="text-sm text-slate-300">Sickness (2.45%)</span><input type="checkbox" checked={includeSickness} onChange={(e) => setIncludeSickness(e.target.checked)} className="w-5 h-5 accent-blue-500" /></label>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Worker Net</p>
                <p className="text-2xl font-black text-green-400">{sim.net.toFixed(2)} <span className="text-sm text-slate-500 font-normal">PLN</span></p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total Cost</p>
                <p className="text-2xl font-black text-rose-400">{sim.totalCost.toFixed(2)} <span className="text-sm text-slate-500 font-normal">PLN</span></p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Gross</p>
                <p className="text-2xl font-black text-blue-400">{sim.gross.toFixed(2)} <span className="text-sm text-slate-500 font-normal">PLN</span></p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">PIT Tax</p>
                <p className="text-2xl font-black text-amber-400">{sim.pit.toFixed(2)} <span className="text-sm text-slate-500 font-normal">PLN</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
