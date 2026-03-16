import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { PayrollTrendChart } from "./PayrollTrendChart";
import {
  Calculator, Save, Lock, Loader2, RefreshCcw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, DollarSign, Users, Clock, TrendingUp,
  Building2, Download, ToggleLeft, ToggleRight
} from "lucide-react";

const ZUS_RATE = 0.1126; // Emerytalne 9.76% + Rentowe 1.5% — no chorobowe, no PIT-2

const LIME = "#E9FF70";
const LIME_BORDER = "rgba(233,255,112,0.25)";
const LIME_BG = "rgba(233,255,112,0.06)";

// Polish statutory minimum gross wage (minimalne wynagrodzenie brutto) by year.
// Update this map each year when the government announces the new rate.
const POLISH_MIN_WAGE: Record<number, number> = {
  2022: 3010,
  2023: 3600,  // Jul 2023 rate (higher half-year)
  2024: 4300,  // Jul 2024 rate (higher half-year)
  2025: 4666,
  2026: 5082,  // announced — update if official rate differs
};

function getMinWage(monthYear: string): number {
  const year = parseInt(monthYear.split("-")[0], 10);
  if (POLISH_MIN_WAGE[year]) return POLISH_MIN_WAGE[year];
  // For future years not yet in the map: extrapolate ~9% annual increase from last known
  const years = Object.keys(POLISH_MIN_WAGE).map(Number).sort((a, b) => b - a);
  const lastYear = years[0];
  const lastWage = POLISH_MIN_WAGE[lastYear];
  return Math.round(lastWage * Math.pow(1.09, year - lastYear));
}

interface PayrollWorker {
  id: string;
  name: string;
  specialization: string | null;
  siteLocation: string | null;
  hourlyNettoRate: number;
  totalHours: number;
  advancePayment: number;
  penalties: number;
}

interface GridRow extends PayrollWorker {
  _hours: string;
  _advance: string;
  _penalties: string;
  _dirty: boolean;
}

function calcNetto(row: GridRow, withZus = false): number {
  const h = parseFloat(row._hours) || 0;
  const r = row.hourlyNettoRate || 0;
  const a = parseFloat(row._advance) || 0;
  const p = parseFloat(row._penalties) || 0;
  const gross = h * r;
  const zus = withZus ? gross * ZUS_RATE : 0;
  return gross - zus - a - p;
}

function getCurrentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function formatMonthYear(my: string): string {
  const [y, m] = my.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pl-PL", { year: "numeric", month: "long" });
}

export function PayrollRunPage() {
  const { t } = useTranslation();
  const { token } = useAuth();

  const [rows, setRows] = useState<GridRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
  const [confirmClose, setConfirmClose] = useState(false);
  const [sortField, setSortField] = useState<"name" | "netto" | "site">("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [searchQ, setSearchQ] = useState("");
  const [withZus, setWithZus] = useState(false);
  const [bankExporting, setBankExporting] = useState(false);
  const [payrollSubTab, setPayrollSubTab] = useState<"run" | "ledger" | "zus">("run");

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/api/payroll/workers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const workers: PayrollWorker[] = data.workers;
      setRows(workers.map((w) => ({
        ...w,
        _hours: w.totalHours > 0 ? String(w.totalHours) : "",
        _advance: w.advancePayment > 0 ? String(w.advancePayment) : "",
        _penalties: w.penalties > 0 ? String(w.penalties) : "",
        _dirty: false,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [base, token]);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  const updateRow = (id: string, field: "_hours" | "_advance" | "_penalties", val: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val, _dirty: true } : r));
  };

  const handleSave = async () => {
    const dirty = rows.filter((r) => r._dirty);
    if (!dirty.length) return;
    setSaving(true);
    setError(null);
    try {
      const updates = dirty.map((r) => ({
        workerId: r.id,
        totalHours: parseFloat(r._hours) || 0,
        advancePayment: parseFloat(r._advance) || 0,
        penalties: parseFloat(r._penalties) || 0,
      }));
      const res = await fetch(`${base}/api/payroll/workers/batch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setRows((prev) => prev.map((r) => ({ ...r, _dirty: false })));
      setSuccessMsg(`✓ ${t("payroll.savedChanges")} (${dirty.length} ${t("payroll.workers")})`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseMonth = async () => {
    if (!confirmClose) { setConfirmClose(true); return; }
    setClosing(true);
    setConfirmClose(false);
    setError(null);
    try {
      // First save any unsaved changes
      const dirty = rows.filter((r) => r._dirty);
      if (dirty.length > 0) {
        const updates = dirty.map((r) => ({
          workerId: r.id,
          totalHours: parseFloat(r._hours) || 0,
          advancePayment: parseFloat(r._advance) || 0,
          penalties: parseFloat(r._penalties) || 0,
        }));
        const saveRes = await fetch(`${base}/api/payroll/workers/batch`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ updates }),
        });
        if (!saveRes.ok) { const d = await saveRes.json(); throw new Error(d.error ?? "Save failed before close"); }
      }
      // Then close month
      const res = await fetch(`${base}/api/payroll/close-month`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monthYear }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Close month failed");
      const totalPayout = data.totalPayout ?? 0;
      setSuccessMsg(`✓ ${t("payroll.monthClosed")} ${formatMonthYear(monthYear)} · ${data.recordsCreated} ${t("payroll.records")} · zł${totalPayout.toFixed(2)}`);
      setTimeout(() => setSuccessMsg(null), 8000);
      await loadWorkers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Close month failed");
    } finally {
      setClosing(false);
    }
  };

  // Totals
  const totalGross = rows.reduce((s, r) => s + ((parseFloat(r._hours) || 0) * r.hourlyNettoRate), 0);
  const totalAdvances = rows.reduce((s, r) => s + (parseFloat(r._advance) || 0), 0);
  const totalPenalties = rows.reduce((s, r) => s + (parseFloat(r._penalties) || 0), 0);
  const totalZus = withZus ? totalGross * ZUS_RATE : 0;
  const totalNetto = rows.reduce((s, r) => s + calcNetto(r, withZus), 0);

  const handleBankExport = async () => {
    setBankExporting(true);
    try {
      const res = await fetch(`${base}/api/payroll/bank-export?monthYear=${monthYear}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Export failed"); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `EEJ_Przelewy_${monthYear}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bank export failed");
    } finally {
      setBankExporting(false);
    }
  };
  const dirtyCount = rows.filter((r) => r._dirty).length;

  // Filtered + sorted rows
  const displayed = rows
    .filter((r) => !searchQ || r.name.toLowerCase().includes(searchQ.toLowerCase()) || (r.siteLocation ?? "").toLowerCase().includes(searchQ.toLowerCase()))
    .sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortField === "netto") { va = calcNetto(a, withZus); vb = calcNetto(b, withZus); }
      else if (sortField === "site") { va = a.siteLocation ?? ""; vb = b.siteLocation ?? ""; }
      else { va = a.name; vb = b.name; }
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });

  const toggleSort = (f: typeof sortField) => {
    if (sortField === f) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortField(f); setSortDir(1); }
  };
  const SortIcon = ({ f }: { f: typeof sortField }) =>
    sortField === f ? (sortDir === 1 ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />) : null;

  return (
    <div className="space-y-4">
      {/* Sub-tab nav */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {([["run", t("payroll.title")], ["ledger", t("payroll.ledger") ], ["zus", t("payroll.zusCalc")]] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setPayrollSubTab(tab)}
            className="px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all"
            style={payrollSubTab === tab
              ? { background: LIME, color: "#333333" }
              : { color: "rgba(255,255,255,0.45)" }}
          >{label}</button>
        ))}
      </div>

      {payrollSubTab === "run" && (<div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-wide">{t("payroll.title")}</h2>
          <p className="text-xs font-mono mt-1" style={{ color: LIME, opacity: 0.7 }}>{t("payroll.subtitle")}</p>
        </div>
        {/* Month selector */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t("payroll.closingMonth")}</label>
          <input
            type="month"
            value={monthYear}
            onChange={(e) => setMonthYear(e.target.value)}
            className="bg-slate-800 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
            style={{ border: `1px solid ${LIME_BORDER}`, colorScheme: "dark" }}
          />
          <button onClick={loadWorkers} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title={t("payroll.refresh")}>
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ZUS toggle + Bank export */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setWithZus((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all"
          style={withZus
            ? { background: "rgba(233,255,112,0.12)", borderColor: LIME_BORDER, color: LIME }
            : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
        >
          {withZus ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          ZUS pracownika 11,26%
          {withZus && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-lime-900/40 text-lime-300">AKTYWNE</span>}
        </button>
        {!withZus && <p className="text-[10px] text-gray-600 font-mono">Emerytalne 9,76% + Rentowe 1,5% · bez chorobowego · bez PIT-2</p>}
        <button
          onClick={handleBankExport}
          disabled={bankExporting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all ml-auto"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
          title="Eksport CSV dla banku (przelewy masowe)"
        >
          {bankExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Eksport przelewów CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t("payroll.totalWorkers"), value: String(rows.length), icon: Users, highlight: false },
          { label: t("payroll.totalGross"), value: `zł${totalGross.toFixed(2)}`, icon: DollarSign, highlight: false },
          { label: withZus ? "ZUS pracownika (11,26%)" : t("payroll.totalDeductions"), value: withZus ? `- zł${totalZus.toFixed(2)}` : `zł${(totalAdvances + totalPenalties).toFixed(2)}`, icon: TrendingUp, highlight: false, warn: withZus },
          { label: t("payroll.totalNetto"), value: `zł${totalNetto.toFixed(2)}`, icon: Calculator, highlight: true },
        ].map((c) => (
          <div key={c.label} className="rounded-xl p-4 border flex items-center gap-3" style={{ background: c.highlight ? LIME_BG : "rgba(255,255,255,0.02)", borderColor: c.highlight ? LIME_BORDER : "rgba(255,255,255,0.06)" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: LIME_BG, border: `1px solid ${LIME_BORDER}` }}>
              <c.icon className="w-4 h-4" style={{ color: LIME }} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{c.label}</p>
              <p className="text-lg font-black tabular-nums" style={{ color: c.highlight ? LIME : c.warn ? "#f87171" : "white" }}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-destructive/40 bg-destructive/10">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-sm text-destructive font-mono">{error}</p>
        </div>
      )}
      {successMsg && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border" style={{ borderColor: "rgba(74,222,128,0.4)", background: "rgba(74,222,128,0.08)" }}>
          <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
          <p className="text-sm text-success font-mono">{successMsg}</p>
        </div>
      )}

      {/* Search + save bar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder={t("payroll.searchWorkers")}
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          className="flex-1 bg-slate-800 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none placeholder:text-gray-600"
          style={{ border: `1px solid ${LIME_BORDER}` }}
        />
        {dirtyCount > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black uppercase tracking-wide transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "rgba(233,255,112,0.12)", color: LIME, border: `1px solid ${LIME_BORDER}` }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t("payroll.saveChanges")} ({dirtyCount})
          </button>
        )}
      </div>

      {/* Payroll grid */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: LIME_BORDER }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: "860px" }}>
            <thead>
              <tr style={{ background: "rgba(233,255,112,0.06)", borderBottom: `1px solid ${LIME_BORDER}` }}>
                {[
                  { label: t("payroll.col.name"), f: "name" as const },
                  { label: t("payroll.col.site"), f: "site" as const },
                  { label: t("payroll.col.rate"), f: null },
                  { label: t("payroll.col.hours"), f: null },
                  { label: t("payroll.col.advance"), f: null },
                  { label: t("payroll.col.penalties"), f: null },
                  { label: t("payroll.col.gross"), f: null },
                  { label: "Min. Płaca", f: null, dim: true },
                  { label: t("payroll.col.netto"), f: "netto" as const, highlight: true },
                ].map((c: any) => (
                  <th
                    key={c.label}
                    className={`px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-left whitespace-nowrap ${c.f ? "cursor-pointer select-none hover:opacity-80" : ""}`}
                    style={{ color: c.highlight ? LIME : c.dim ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.5)" }}
                    onClick={() => c.f && toggleSort(c.f)}
                  >
                    {c.label} {c.f && <SortIcon f={c.f} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-2 py-2">
                        <div className="h-3.5 bg-white/5 rounded animate-pulse" style={{ width: j === 0 ? "100px" : "56px" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500 font-mono text-sm">
                    {t("payroll.noWorkers")}
                  </td>
                </tr>
              ) : (
                displayed.map((row) => {
                  const netto = calcNetto(row, withZus);
                  const gross = (parseFloat(row._hours) || 0) * row.hourlyNettoRate;
                  const minWage = getMinWage(monthYear);
                  const belowMin = gross > 0 && gross < minWage;
                  const aboveMin = gross >= minWage;
                  return (
                    <tr key={row.id} className="hover:bg-white/3 transition-colors" style={{ background: row._dirty ? "rgba(233,255,112,0.03)" : "" }}>
                      {/* Name */}
                      <td className="px-2 py-2" style={{ minWidth: "120px" }}>
                        <div className="font-sans font-bold text-white text-xs leading-tight">{row.name}</div>
                        {row.specialization && <div className="text-[9px] text-gray-500 font-mono mt-0.5">{row.specialization}</div>}
                        {row._dirty && <div className="text-[8px] font-bold uppercase tracking-wider mt-0.5" style={{ color: LIME }}>● {t("payroll.unsaved")}</div>}
                      </td>
                      {/* Site */}
                      <td className="px-2 py-2" style={{ minWidth: "80px" }}>
                        {row.siteLocation ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap" style={{ background: LIME, color: "#333" }}>{row.siteLocation}</span>
                        ) : (
                          <span className="text-gray-600 text-[10px]">—</span>
                        )}
                      </td>
                      {/* Rate (read-only) */}
                      <td className="px-2 py-2 font-mono whitespace-nowrap" style={{ minWidth: "70px" }}>
                        <span className="text-gray-300 text-xs">zł{row.hourlyNettoRate.toFixed(2)}</span>
                        <span className="text-gray-600 text-[9px]">/h</span>
                      </td>
                      {/* Hours */}
                      <td className="px-2 py-1.5" style={{ minWidth: "72px" }}>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={row._hours}
                            onChange={(e) => updateRow(row.id, "_hours", e.target.value)}
                            placeholder="0"
                            className="w-16 bg-slate-800 text-white rounded px-1.5 py-1 text-xs font-mono focus:outline-none text-right pr-5"
                            style={{ border: `1px solid ${row._dirty ? LIME_BORDER : "rgba(255,255,255,0.08)"}` }}
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-500">h</span>
                        </div>
                      </td>
                      {/* Advance */}
                      <td className="px-2 py-1.5" style={{ minWidth: "84px" }}>
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-500">zł</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row._advance}
                            onChange={(e) => updateRow(row.id, "_advance", e.target.value)}
                            placeholder="0"
                            className="w-20 bg-slate-800 text-white rounded px-1.5 py-1 text-xs font-mono focus:outline-none text-right pl-6"
                            style={{ border: `1px solid ${row._dirty ? LIME_BORDER : "rgba(255,255,255,0.08)"}` }}
                          />
                        </div>
                      </td>
                      {/* Penalties */}
                      <td className="px-2 py-1.5" style={{ minWidth: "84px" }}>
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-500">zł</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row._penalties}
                            onChange={(e) => updateRow(row.id, "_penalties", e.target.value)}
                            placeholder="0"
                            className="w-20 bg-slate-800 text-white rounded px-1.5 py-1 text-xs font-mono focus:outline-none text-right pl-6"
                            style={{ border: `1px solid ${row._dirty ? LIME_BORDER : "rgba(255,255,255,0.08)"}` }}
                          />
                        </div>
                      </td>
                      {/* Gross */}
                      <td className="px-2 py-2 font-mono whitespace-nowrap" style={{ minWidth: "80px" }}>
                        <span className="text-gray-400 text-xs">zł{gross.toFixed(2)}</span>
                      </td>
                      {/* Min. Płaca — statutory minimum wage for this payroll year */}
                      <td className="px-2 py-2 font-mono whitespace-nowrap" style={{ minWidth: "90px" }}>
                        {gross === 0 ? (
                          <span className="text-gray-600 text-[10px]">—</span>
                        ) : (
                          <div>
                            <span
                              className="text-xs font-bold tabular-nums"
                              style={{ color: aboveMin ? "#4ade80" : "#f59e0b" }}
                            >
                              zł{minWage.toLocaleString("pl-PL")}
                            </span>
                            {belowMin && (
                              <div className="text-[8px] font-black uppercase tracking-wide mt-0.5 flex items-center gap-0.5" style={{ color: "#f59e0b" }}>
                                ⚠ poniżej min
                              </div>
                            )}
                            {aboveMin && (
                              <div className="text-[8px] font-black uppercase tracking-wide mt-0.5" style={{ color: "#4ade80" }}>
                                ✓ powyżej
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Netto — live calculated */}
                      <td className="px-2 py-2 font-mono whitespace-nowrap" style={{ minWidth: "90px" }}>
                        <span
                          className="font-black text-sm tabular-nums"
                          style={{ color: netto >= 0 ? LIME : "#ef4444" }}
                        >
                          zł{netto.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Totals footer */}
            {!loading && displayed.length > 0 && (
              <tfoot>
                <tr style={{ background: "rgba(233,255,112,0.06)", borderTop: `1px solid ${LIME_BORDER}` }}>
                  <td colSpan={2} className="px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-500">{t("payroll.totals")}</td>
                  <td className="px-2 py-2.5" />
                  <td className="px-2 py-2.5 font-mono text-xs text-gray-300">
                    {displayed.reduce((s, r) => s + (parseFloat(r._hours) || 0), 0).toFixed(1)}h
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs text-gray-300">
                    zł{displayed.reduce((s, r) => s + (parseFloat(r._advance) || 0), 0).toFixed(2)}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs text-gray-300">
                    zł{displayed.reduce((s, r) => s + (parseFloat(r._penalties) || 0), 0).toFixed(2)}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs text-gray-400">
                    zł{displayed.reduce((s, r) => s + (parseFloat(r._hours) || 0) * r.hourlyNettoRate, 0).toFixed(2)}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-[10px] text-gray-500">
                    <div className="text-[9px] text-gray-600">{new Date(monthYear).getFullYear()}</div>
                    <div>min. zł{getMinWage(monthYear).toLocaleString("pl-PL")}</div>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-sm font-black tabular-nums" style={{ color: LIME }}>
                    zł{displayed.reduce((s, r) => s + calcNetto(r, withZus), 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Close Month button */}
      <div className="flex flex-col items-end gap-3 pt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <p className="text-[10px] font-mono text-gray-500 text-right max-w-sm">
          {t("payroll.closeMonthNote")}
        </p>
        <div className="flex items-center gap-3">
          {confirmClose && (
            <button onClick={() => setConfirmClose(false)} className="px-4 py-2.5 rounded-xl border text-sm font-bold text-gray-300 hover:text-white transition-all hover:bg-white/5" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              {t("payroll.cancel")}
            </button>
          )}
          <button
            onClick={handleCloseMonth}
            disabled={closing || loading}
            className="flex items-center gap-2.5 px-8 py-3 rounded-2xl text-sm font-black uppercase tracking-wider transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
            style={{
              background: confirmClose ? "#ef4444" : LIME,
              color: confirmClose ? "white" : "#333333",
              boxShadow: `0 4px 24px ${confirmClose ? "rgba(239,68,68,0.4)" : "rgba(233,255,112,0.35)"}`,
            }}
          >
            {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {confirmClose ? t("payroll.confirmClose") : t("payroll.closeMonth")} — {formatMonthYear(monthYear)}
          </button>
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <PayrollTrendChart token={token} />
      </div>)}

      {/* ── LEDGER ── */}
      {payrollSubTab === "ledger" && <LedgerView base={base} token={token} t={t} />}

      {/* ── ZUS CALCULATOR ── */}
      {payrollSubTab === "zus" && <ZUSCalculatorPanel t={t} />}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  LEDGER VIEW                                                               */
/* ────────────────────────────────────────────────────────────────────────── */
function LedgerView({ base, token, t }: { base: string; token: string | null; t: (k: string, opts?: any) => string }) {
  const [records, setRecords] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    setLoading(true);
    fetch(`${base}/api/payroll/summary`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setRecords(d.records ?? []); })
      .catch((e) => setError(e.message ?? "Failed to load ledger"))
      .finally(() => setLoading(false));
  }, [base, token]);

  const filtered = records
    .filter((r) => !search || r.workerName?.toLowerCase().includes(search.toLowerCase()) || r.siteLocation?.toLowerCase().includes(search.toLowerCase()) || r.monthYear?.includes(search))
    .sort((a, b) => b.monthYear?.localeCompare(a.monthYear ?? "") ?? 0);

  const totalPayout = filtered.reduce((s, r) => s + (r.finalNettoPayout ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-wide">{t("payroll.ledger")}</h2>
          <p className="text-xs font-mono mt-1" style={{ color: LIME, opacity: 0.7 }}>{t("payroll.ledgerSubtitle")}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t("payroll.totalPayout")}</div>
          <div className="text-2xl font-black tabular-nums" style={{ color: LIME }}>zł{totalPayout.toFixed(2)}</div>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("payroll.searchWorkers")}
            className="w-full sm:w-72 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm font-mono text-white focus:outline-none"
            style={{ caretColor: LIME }}
          />
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400 font-mono">{t("payroll.loading")}</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-400 font-mono">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "760px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.25)" }}>
                  {["Month", "Worker", "Site", "Hours", "Rate (zł/h)", "Gross", "ZUS", "Advances", "Net Payout"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500 font-mono">{t("payroll.noWorkers")}</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }} className="hover:bg-white/3 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-bold" style={{ color: LIME }}>{r.monthYear}</td>
                    <td className="px-3 py-2.5 font-bold text-white">{r.workerName}</td>
                    <td className="px-3 py-2.5 text-gray-400">{r.siteLocation || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums text-white">{r.totalHours}</td>
                    <td className="px-3 py-2.5 tabular-nums text-white">zł{(r.hourlyRate ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-white">zł{(r.grossPay ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-red-400">zł{(r.zusBaseSalary ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-amber-400">zł{(r.advancesDeducted ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-black" style={{ color: LIME }}>zł{(r.finalNettoPayout ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: "rgba(233,255,112,0.05)", borderTop: `1px solid ${LIME_BORDER}` }}>
                    <td colSpan={8} className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest" style={{ color: LIME }}>Total ({filtered.length} records)</td>
                    <td className="px-3 py-2.5 font-black tabular-nums" style={{ color: LIME }}>zł{totalPayout.toFixed(2)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  ZUS CALCULATOR                                                            */
/* ────────────────────────────────────────────────────────────────────────── */
function ZUSCalculatorPanel({ t }: { t: (k: string, opts?: any) => string }) {
  const [gross, setGross] = React.useState("5000");
  const [includeChorobowe, setIncludeChorobowe] = React.useState(true);

  const grossNum = parseFloat(gross) || 0;

  const emerytalne_e  = grossNum * 0.0976;
  const rentowe_e     = grossNum * 0.015;
  const chorobowe_e   = includeChorobowe ? grossNum * 0.0245 : 0;
  const totalZusEmp   = emerytalne_e + rentowe_e + chorobowe_e;

  const emerytalne_er = grossNum * 0.0976;
  const rentowe_er    = grossNum * 0.065;
  const wypadkowe     = grossNum * 0.0167;
  const fp            = grossNum * 0.0245;
  const fgsb          = grossNum * 0.001;
  const totalZusEr    = emerytalne_er + rentowe_er + wypadkowe + fp + fgsb;

  const zdrowotnaBase = grossNum - totalZusEmp;
  const zdrowotna     = zdrowotnaBase * 0.09;
  const taxBase       = zdrowotnaBase - 300; // 300 PLN/month KUP approx
  const pit           = Math.max(0, taxBase * 0.12);
  const netto         = grossNum - totalZusEmp - zdrowotna - pit;

  const Row = ({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) => (
    <div className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div>
        <div className="text-xs font-bold text-white">{label}</div>
        {sub && <div className="text-[10px] text-gray-500 font-mono mt-0.5">{sub}</div>}
      </div>
      <div className={`text-sm font-black tabular-nums ${highlight ? "" : "text-white"}`} style={highlight ? { color: LIME } : {}}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white uppercase tracking-wide">{t("payroll.zusCalc")}</h2>
        <p className="text-xs font-mono mt-1" style={{ color: LIME, opacity: 0.7 }}>{t("payroll.zusCalcSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input panel */}
        <div className="glass-panel rounded-xl p-5 space-y-5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">{t("payroll.zusGross")}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black" style={{ color: LIME }}>zł</span>
              <input
                type="number"
                value={gross}
                onChange={(e) => setGross(e.target.value)}
                min={0}
                className="w-full pl-8 pr-4 py-3 rounded-xl bg-slate-900 text-white text-lg font-black tabular-nums focus:outline-none"
                style={{ border: `1.5px solid ${LIME_BORDER}`, caretColor: LIME }}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">{t("payroll.zusChorobowe")}</label>
            <button
              onClick={() => setIncludeChorobowe((v) => !v)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all text-xs font-black uppercase tracking-wide"
              style={includeChorobowe
                ? { background: "rgba(233,255,112,0.12)", borderColor: LIME_BORDER, color: LIME }
                : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
            >
              {includeChorobowe ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              {includeChorobowe ? t("payroll.zusIncluded") : t("payroll.zusExcluded")}
            </button>
          </div>

          <div className="rounded-xl p-4 space-y-1" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Employee ZUS Contributions</div>
            <Row label="Emerytalne" sub="9.76%" value={`- zł${emerytalne_e.toFixed(2)}`} />
            <Row label="Rentowe" sub="1.50%" value={`- zł${rentowe_e.toFixed(2)}`} />
            {includeChorobowe && <Row label="Chorobowe" sub="2.45%" value={`- zł${chorobowe_e.toFixed(2)}`} />}
            <Row label="Zdrowotna" sub={`9% × zł${zdrowotnaBase.toFixed(0)}`} value={`- zł${zdrowotna.toFixed(2)}`} />
            <Row label="PIT-17 advance" sub="12% – KUP 300 zł" value={`- zł${pit.toFixed(2)}`} />
          </div>
        </div>

        {/* Result panel */}
        <div className="space-y-4">
          <div className="glass-panel rounded-xl p-5" style={{ border: `1px solid ${LIME_BORDER}` }}>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Net Take-Home</div>
            <div className="text-4xl font-black tabular-nums" style={{ color: LIME }}>zł{netto.toFixed(2)}</div>
            <div className="text-xs text-gray-500 font-mono mt-1">from gross zł{grossNum.toFixed(2)}</div>
          </div>

          <div className="glass-panel rounded-xl p-5 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Employer Total Cost</div>
            <Row label="Gross Salary" value={`zł${grossNum.toFixed(2)}`} />
            <Row label="Emerytalne" sub="9.76%" value={`+ zł${emerytalne_er.toFixed(2)}`} />
            <Row label="Rentowe" sub="6.50%" value={`+ zł${rentowe_er.toFixed(2)}`} />
            <Row label="Wypadkowe" sub="1.67%" value={`+ zł${wypadkowe.toFixed(2)}`} />
            <Row label="FP" sub="2.45%" value={`+ zł${fp.toFixed(2)}`} />
            <Row label="FGŚP" sub="0.10%" value={`+ zł${fgsb.toFixed(2)}`} />
            <div className="flex items-center justify-between pt-3 mt-1 border-t" style={{ borderColor: LIME_BORDER }}>
              <div className="text-xs font-black uppercase tracking-widest" style={{ color: LIME }}>Total Employer Cost</div>
              <div className="text-lg font-black tabular-nums" style={{ color: LIME }}>zł{(grossNum + totalZusEr).toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
