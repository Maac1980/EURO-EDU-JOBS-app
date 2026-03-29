import { useState, useMemo } from "react";

type ContractType = "zlecenie" | "praca";

function calculate(hours: number, rate: number, contract: ContractType, applyPit2: boolean, includeSickness: boolean) {
  const gross = Math.round(hours * rate * 100) / 100;

  // Employee ZUS
  const pension = Math.round(gross * 0.0976 * 100) / 100;
  const disability = Math.round(gross * 0.015 * 100) / 100;
  const sickness = includeSickness ? Math.round(gross * 0.0245 * 100) / 100 : 0;
  const employeeZus = pension + disability + sickness;

  // Health insurance - different rate per contract
  const healthRate = contract === "zlecenie" ? 0.079866 : 0.077661;
  const health = Math.round(gross * healthRate * 100) / 100;

  // Tax base
  let taxBase: number;
  if (contract === "zlecenie") {
    const kup = Math.round((gross - employeeZus) * 0.20 * 100) / 100;
    taxBase = Math.round(gross - employeeZus - kup);
  } else {
    taxBase = Math.round(gross - employeeZus - 250); // gross - ZUS - KUP
  }

  // PIT
  const rawPit = Math.round(taxBase * 0.12) - (applyPit2 ? 300 : 0);
  const pit = Math.max(0, rawPit);

  // Net
  const net = Math.round((gross - employeeZus - health - pit) * 100) / 100;

  // Employer ZUS
  const empPension = Math.round(gross * 0.0976 * 100) / 100;
  const empDisability = Math.round(gross * 0.065 * 100) / 100;
  const empAccident = contract === "praca" ? Math.round(gross * 0.0167 * 100) / 100 : 0;
  const empFP = Math.round(gross * 0.0245 * 100) / 100;
  const empFGSP = Math.round(gross * 0.001 * 100) / 100;
  const employerZus = empPension + empDisability + empAccident + empFP + empFGSP;
  const totalCost = Math.round((gross + employerZus) * 100) / 100;

  return { gross, employeeZus, health, pit, net, employerZus, totalCost, taxBase };
}

export function KnowledgeCenter() {
  const [hours, setHours] = useState(160);
  const [rate, setRate] = useState(31.40);
  const [contract, setContract] = useState<ContractType>("zlecenie");
  const [applyPit2, setApplyPit2] = useState(true);
  const [includeSickness, setIncludeSickness] = useState(false);

  const r = useMemo(() => calculate(hours, rate, contract, applyPit2, includeSickness), [hours, rate, contract, applyPit2, includeSickness]);

  return (
    <div className="tab-page" style={{ background: "#0f172a", padding: 0 }}>
    <div className="p-4 text-slate-200 pb-24">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-bold text-white">ZUS Calculator</h1>

        {/* Contract Toggle */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button onClick={() => setContract("zlecenie")} className={`flex-1 py-2 text-sm font-bold transition-colors ${contract === "zlecenie" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400"}`}>
            Umowa Zlecenie
          </button>
          <button onClick={() => setContract("praca")} className={`flex-1 py-2 text-sm font-bold transition-colors ${contract === "praca" ? "bg-green-600 text-white" : "bg-slate-900 text-slate-400"}`}>
            Umowa o Pracę
          </button>
        </div>

        {/* Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Hours</span><span className="text-blue-400 font-bold">{hours}h</span>
            </div>
            <input type="range" min={1} max={300} value={hours} onChange={e => setHours(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Hourly Rate (PLN)</label>
            <input type="number" step="0.10" value={rate} onChange={e => setRate(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none" />
          </div>
          <div className="flex gap-4 pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={applyPit2} onChange={e => setApplyPit2(e.target.checked)} className="accent-blue-500" />
              PIT-2 (300 PLN)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={includeSickness} onChange={e => setIncludeSickness(e.target.checked)} className="accent-blue-500" />
              Sickness (2.45%)
            </label>
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">Gross</p>
            <p className="text-xl font-black text-blue-400">{r.gross.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">Net Take-Home</p>
            <p className="text-xl font-black text-green-400">{r.net.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">Employee ZUS</p>
            <p className="text-xl font-black text-red-400">-{r.employeeZus.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">Health</p>
            <p className="text-xl font-black text-red-400">-{r.health.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">PIT Tax</p>
            <p className="text-xl font-black text-amber-400">-{r.pit.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">Total Employer Cost</p>
            <p className="text-xl font-black text-rose-400">{r.totalCost.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
        </div>

        {/* Tax Base Info */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-400">
          <div className="flex justify-between"><span>Tax Base (Podstawa)</span><span className="text-white">{r.taxBase.toFixed(2)} PLN</span></div>
          <div className="flex justify-between mt-1"><span>Employer ZUS</span><span className="text-white">{r.employerZus.toFixed(2)} PLN</span></div>
          <div className="flex justify-between mt-1"><span>Contract Type</span><span className="text-white">{contract === "zlecenie" ? "Umowa Zlecenie" : "Umowa o Pracę"}</span></div>
        </div>
      </div>
    </div>
    </div>
  );
}
