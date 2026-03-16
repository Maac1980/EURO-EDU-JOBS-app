import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { PayrollTrendChart } from "./PayrollTrendChart";
import {
  Calculator, Save, Lock, Loader2, RefreshCcw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, DollarSign, Users, Clock, TrendingUp,
  Building2, Download, ToggleLeft, ToggleRight, Pencil, Eye, X, Check,
  FileText, Edit2
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
  iban: string | null;
}

interface GridRow extends PayrollWorker {
  _hours: string;
  _rate: string;
  _advance: string;
  _penalties: string;
  _dirty: boolean;
  _iban: string;
}

interface ZusRates {
  emerytalne: number;
  rentowe: number;
  zdrowotne: number;
  kup: number;
  pitFlat: number;
}

const DEFAULT_RATES: ZusRates = {
  emerytalne: 9.76,
  rentowe: 1.5,
  zdrowotne: 9,
  kup: 20,
  pitFlat: 12,
};

function calcNetto(row: GridRow, withZus = false): number {
  const h = parseFloat(row._hours) || 0;
  const r = parseFloat(row._rate) || row.hourlyNettoRate || 0;
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
  const [payrollView, setPayrollView] = useState<"run" | "zus">("run");
  const [rates, setRates] = useState<ZusRates>(DEFAULT_RATES);
  const [editRatesOpen, setEditRatesOpen] = useState(false);
  const [ibanEditId, setIbanEditId] = useState<string | null>(null);
  const [ibanEditValue, setIbanEditValue] = useState("");
  const [ibanSaving, setIbanSaving] = useState(false);

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
        _rate: w.hourlyNettoRate > 0 ? String(w.hourlyNettoRate) : "",
        _advance: w.advancePayment > 0 ? String(w.advancePayment) : "",
        _penalties: w.penalties > 0 ? String(w.penalties) : "",
        _dirty: false,
        _iban: w.iban ?? "",
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [base, token]);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  const updateRow = (id: string, field: "_hours" | "_rate" | "_advance" | "_penalties", val: string) => {
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
        hourlyNettoRate: parseFloat(r._rate) || r.hourlyNettoRate,
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
          hourlyNettoRate: parseFloat(r._rate) || r.hourlyNettoRate,
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
  const totalGross = rows.reduce((s, r) => s + ((parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate)), 0);
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

  const handleIbanSave = async (workerId: string) => {
    setIbanSaving(true);
    try {
      const res = await fetch(`${base}/api/payroll/workers/${workerId}/iban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ iban: ibanEditValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "IBAN save failed");
      setRows((prev) => prev.map((r) => r.id === workerId ? { ...r, _iban: ibanEditValue, iban: ibanEditValue } : r));
      setIbanEditId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "IBAN save failed");
    } finally {
      setIbanSaving(false);
    }
  };

  const handlePdfExport = () => {
    window.print();
  };

  const empZusRate = (rates.emerytalne + rates.rentowe) / 100;

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

      {/* ── ZUS/PIT Rates Panel ── */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: LIME_BORDER, background: "rgba(233,255,112,0.03)" }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: LIME }}>
              ZUS / PIT RATES — {monthYear.split("-")[0]}
            </p>
            <p className="text-[9px] text-gray-500 font-mono mt-0.5">
              Last updated: {new Date().toISOString().slice(0, 10)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditRatesOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all"
              style={{ background: "rgba(139,92,246,0.15)", borderColor: "rgba(139,92,246,0.4)", color: "#a78bfa" }}
            >
              <Edit2 className="w-3 h-3" />
              Edit Rates
            </button>
            <button
              onClick={() => setPayrollSubTab("zus")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all"
              style={{ background: "rgba(59,130,246,0.12)", borderColor: "rgba(59,130,246,0.35)", color: "#60a5fa" }}
            >
              <Calculator className="w-3 h-3" />
              2nd Employer Split
            </button>
          </div>
        </div>

        {/* Rate badges */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Emerytalne", value: rates.emerytalne, key: "emerytalne" as const },
            { label: "Rentowe", value: rates.rentowe, key: "rentowe" as const },
            { label: "Zdrowotne", value: rates.zdrowotne, key: "zdrowotne" as const, note: "net base" },
            { label: "KUP", value: rates.kup, key: "kup" as const },
            { label: "PIT Flat", value: rates.pitFlat, key: "pitFlat" as const },
          ].map(({ label, value, key, note }) => (
            <div key={key} className="px-3 py-2 rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
              <div className="text-[8px] font-bold uppercase tracking-widest text-gray-500">{label}</div>
              {editRatesOpen ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    step="0.01"
                    value={value}
                    onChange={(e) => setRates((r) => ({ ...r, [key]: parseFloat(e.target.value) || 0 }))}
                    className="w-16 bg-slate-900 text-white rounded px-1 py-0.5 text-xs font-mono focus:outline-none"
                    style={{ border: `1px solid ${LIME_BORDER}` }}
                  />
                  <span className="text-[9px] text-gray-500">%</span>
                </div>
              ) : (
                <div className="text-sm font-black tabular-nums mt-0.5" style={{ color: LIME }}>
                  {value}%{note && <span className="text-[8px] font-normal text-gray-500 ml-1">({note})</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1 text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
          <span>Effective ZUS: {(rates.emerytalne + rates.rentowe).toFixed(2)}%</span>
          <span className="mx-1">·</span>
          <span>Chorobowe excluded (voluntary)</span>
          <span className="mx-1">·</span>
          <span>ZUS base = Gross Salary (Rate × Hours)</span>
        </div>

        {editRatesOpen && (
          <div className="flex justify-end">
            <button
              onClick={() => setEditRatesOpen(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide"
              style={{ background: LIME, color: "#333" }}
            >
              <Check className="w-3 h-3" />
              Save Rates
            </button>
          </div>
        )}
      </div>

      {/* ── View switcher + actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPayrollView((v) => v === "zus" ? "run" : "zus")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all"
          style={payrollView === "zus"
            ? { background: "rgba(233,255,112,0.12)", borderColor: LIME_BORDER, color: LIME }
            : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
        >
          <Eye className="w-3.5 h-3.5" />
          ZUS View
        </button>
        <button
          onClick={handleBankExport}
          disabled={bankExporting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
          title="Eksport CSV dla banku (przelewy masowe)"
        >
          {bankExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Bank CSV
        </button>
        <button
          onClick={handlePdfExport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
        >
          <FileText className="w-3.5 h-3.5" />
          PDF
        </button>
        {payrollView === "run" && (
          <button
            onClick={() => setWithZus((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all ml-auto"
            style={withZus
              ? { background: "rgba(233,255,112,0.08)", borderColor: LIME_BORDER, color: LIME }
              : { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
          >
            {withZus ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            ZUS pracownika
          </button>
        )}
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

      {/* ── ZUS VIEW GRID ── */}
      {payrollView === "zus" && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: LIME_BORDER }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "900px" }}>
              <thead>
                <tr style={{ background: "rgba(233,255,112,0.06)", borderBottom: `1px solid ${LIME_BORDER}` }}>
                  {[
                    { label: "Worker", col: "w-36" },
                    { label: "Spec / Site", col: "w-28" },
                    { label: "Bank IBAN", col: "w-52" },
                    { label: "Rate (PLN/H)", col: "w-24" },
                    { label: "Hours ↑", col: "w-20" },
                    { label: "Gross (PLN)", col: "w-24" },
                    { label: "Emp. ZUS", col: "w-24", blue: true },
                    { label: "Net Pay", col: "w-24", lime: true },
                  ].map((c: any) => (
                    <th key={c.label} className={`px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-left whitespace-nowrap ${c.col}`}
                      style={{ color: c.lime ? LIME : c.blue ? "#60a5fa" : "rgba(255,255,255,0.5)" }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div className="h-3.5 bg-white/5 rounded animate-pulse" style={{ width: j === 0 ? "100px" : "64px" }} />
                      </td>
                    ))}</tr>
                  ))
                ) : displayed.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-500 font-mono text-sm">No workers found.</td></tr>
                ) : (
                  displayed.map((row) => {
                    const gross = (parseFloat(row._hours) || 0) * (parseFloat(row._rate) || row.hourlyNettoRate);
                    const empZus = gross * empZusRate;
                    const netPay = gross - empZus;
                    const isEditingIban = ibanEditId === row.id;
                    return (
                      <tr key={row.id} className="hover:bg-white/3 transition-colors">
                        {/* Worker */}
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-white text-xs">{row.name}</div>
                        </td>
                        {/* Spec / Site */}
                        <td className="px-3 py-2.5">
                          <div className="text-[9px] text-gray-400 font-mono">{row.specialization ?? "—"}</div>
                          {row.siteLocation && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: LIME, color: "#333" }}>{row.siteLocation}</span>
                          )}
                        </td>
                        {/* Bank IBAN */}
                        <td className="px-3 py-2.5">
                          {isEditingIban ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                type="text"
                                value={ibanEditValue}
                                onChange={(e) => setIbanEditValue(e.target.value.toUpperCase())}
                                placeholder="PL61 1090 1014..."
                                className="w-44 bg-slate-800 text-white rounded px-2 py-1 text-[10px] font-mono focus:outline-none"
                                style={{ border: `1px solid ${LIME_BORDER}` }}
                                onKeyDown={(e) => { if (e.key === "Enter") handleIbanSave(row.id); if (e.key === "Escape") setIbanEditId(null); }}
                              />
                              <button onClick={() => handleIbanSave(row.id)} disabled={ibanSaving}
                                className="p-1 rounded" style={{ color: LIME }}>
                                {ibanSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => setIbanEditId(null)} className="p-1 rounded text-gray-500 hover:text-white">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : row._iban ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-gray-300">{row._iban}</span>
                              <button onClick={() => { setIbanEditId(row.id); setIbanEditValue(row._iban); }}
                                className="p-0.5 text-gray-600 hover:text-white transition-colors">
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setIbanEditId(row.id); setIbanEditValue(""); }}
                              className="flex items-center gap-1 text-[10px] font-mono hover:text-white transition-colors"
                              style={{ color: "rgba(255,255,255,0.35)" }}
                            >
                              <Pencil className="w-3 h-3" /> Add IBAN
                            </button>
                          )}
                        </td>
                        {/* Rate (editable) */}
                        <td className="px-3 py-2">
                          <div className="relative">
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-500">zł</span>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={row._rate}
                              onChange={(e) => updateRow(row.id, "_rate", e.target.value)}
                              placeholder="0.00"
                              className="w-20 bg-slate-800 text-white rounded px-1.5 py-1 text-xs font-mono focus:outline-none text-right pr-4"
                              style={{ border: `1px solid ${row._dirty ? LIME_BORDER : "rgba(255,255,255,0.08)"}` }}
                            />
                          </div>
                        </td>
                        {/* Hours */}
                        <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: LIME }}>{(parseFloat(row._hours) || 0).toFixed(2)}</td>
                        {/* Gross */}
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-300">{gross.toFixed(2)}</td>
                        {/* Emp. ZUS */}
                        <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#60a5fa" }}>
                          {gross > 0 ? `– ${empZus.toFixed(2)}` : "– 0,00"}
                        </td>
                        {/* Net Pay */}
                        <td className="px-3 py-2.5 font-mono text-sm font-black" style={{ color: netPay >= 0 ? LIME : "#ef4444" }}>
                          {netPay.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {!loading && displayed.length > 0 && (
                <tfoot>
                  <tr style={{ background: "rgba(233,255,112,0.06)", borderTop: `1px solid ${LIME_BORDER}` }}>
                    <td colSpan={3} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-500">Totals</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: LIME }}>
                      {displayed.reduce((s, r) => s + (parseFloat(r._hours) || 0), 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-300">
                      {displayed.reduce((s, r) => s + (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate), 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#60a5fa" }}>
                      – {displayed.reduce((s, r) => s + (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate) * empZusRate, 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm font-black" style={{ color: LIME }}>
                      {displayed.reduce((s, r) => {
                        const g = (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate);
                        return s + g - g * empZusRate;
                      }, 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── NORMAL RUN GRID ── */}
      {payrollView === "run" && (
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
                  const gross = (parseFloat(row._hours) || 0) * (parseFloat(row._rate) || row.hourlyNettoRate);
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
                      {/* Rate (editable) */}
                      <td className="px-2 py-1.5" style={{ minWidth: "82px" }}>
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-500">zł</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={row._rate}
                            onChange={(e) => updateRow(row.id, "_rate", e.target.value)}
                            placeholder="0.00"
                            className="w-20 bg-slate-800 text-white rounded px-1.5 py-1 text-xs font-mono focus:outline-none text-right pr-5"
                            style={{ border: `1px solid ${row._dirty ? LIME_BORDER : "rgba(255,255,255,0.08)"}` }}
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-500">/h</span>
                        </div>
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
                    zł{displayed.reduce((s, r) => s + (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate), 0).toFixed(2)}
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
      )}

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
  const [liveWorkers, setLiveWorkers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const currentMonthYear = getCurrentMonthYear();

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${base}/api/payroll/summary`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`${base}/api/payroll/workers`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([summary, workers]) => {
        if (summary.error) throw new Error(summary.error);
        setRecords(summary.records ?? []);
        setLiveWorkers(workers.workers ?? []);
      })
      .catch((e) => setError(e.message ?? "Failed to load ledger"))
      .finally(() => setLoading(false));
  }, [base, token]);

  // Build synthetic "draft" rows from live workers for the current month
  // (only for workers not already in a closed record for this month)
  const closedThisMonth = new Set(records.filter((r) => r.monthYear === currentMonthYear).map((r) => r.workerId));
  const draftRows = liveWorkers
    .filter((w) => !closedThisMonth.has(w.id) && (w.totalHours > 0 || w.hourlyNettoRate > 0))
    .map((w) => ({
      id: `draft-${w.id}`,
      workerId: w.id,
      workerName: w.name,
      monthYear: currentMonthYear,
      totalHours: w.totalHours ?? 0,
      hourlyRate: w.hourlyNettoRate ?? 0,
      grossPay: (w.totalHours ?? 0) * (w.hourlyNettoRate ?? 0),
      zusBaseSalary: (w.totalHours ?? 0) * (w.hourlyNettoRate ?? 0) * ZUS_RATE,
      advancesDeducted: w.advancePayment ?? 0,
      penaltiesDeducted: w.penalties ?? 0,
      finalNettoPayout: (w.totalHours ?? 0) * (w.hourlyNettoRate ?? 0) - (w.advancePayment ?? 0) - (w.penalties ?? 0),
      siteLocation: w.siteLocation ?? "",
      _draft: true,
    }));

  const allRows = [...draftRows, ...records];

  const filtered = allRows
    .filter((r) => !search || r.workerName?.toLowerCase().includes(search.toLowerCase()) || r.siteLocation?.toLowerCase().includes(search.toLowerCase()) || r.monthYear?.includes(search))
    .sort((a, b) => {
      // Current month drafts first, then closed records newest-first
      if (a._draft && !b._draft) return -1;
      if (!a._draft && b._draft) return 1;
      return (b.monthYear ?? "").localeCompare(a.monthYear ?? "");
    });

  const totalPayout = filtered.filter((r) => !r._draft).reduce((s, r) => s + (r.finalNettoPayout ?? 0), 0);

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
                  <tr key={r.id}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      background: r._draft ? "rgba(233,255,112,0.025)" : undefined,
                    }}
                    className="hover:bg-white/3 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-mono font-bold text-xs" style={{ color: LIME }}>{r.monthYear}</div>
                      {r._draft && (
                        <span className="text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded" style={{ background: "rgba(233,255,112,0.15)", color: LIME }}>
                          DRAFT
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-white text-xs">{r.workerName}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs">{r.siteLocation || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums text-white text-xs">{Number(r.totalHours).toFixed(1)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-white text-xs">zł{(r.hourlyRate ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-white text-xs">zł{(r.grossPay ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-red-400 text-xs">zł{(r.zusBaseSalary ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-amber-400 text-xs">zł{(r.advancesDeducted ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-black text-xs" style={{ color: r._draft ? "rgba(233,255,112,0.65)" : LIME }}>
                      zł{(r.finalNettoPayout ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: "rgba(233,255,112,0.05)", borderTop: `1px solid ${LIME_BORDER}` }}>
                    <td colSpan={8} className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest" style={{ color: LIME }}>
                      Closed: {filtered.filter((r) => !r._draft).length} records
                      {draftRows.length > 0 && <span className="ml-3 opacity-50">· {draftRows.length} draft (current month)</span>}
                    </td>
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
/* ── shared ZUS math helpers ─────────────────────────────────────────── */
function calcSingleZUS(grossNum: number, inclChorobowe: boolean) {
  const emerytalne_e = grossNum * 0.0976;
  const rentowe_e    = grossNum * 0.015;
  const chorobowe_e  = inclChorobowe ? grossNum * 0.0245 : 0;
  const totalZusEmp  = emerytalne_e + rentowe_e + chorobowe_e;
  const emerytalne_er = grossNum * 0.0976;
  const rentowe_er   = grossNum * 0.065;
  const wypadkowe    = grossNum * 0.0167;
  const fp           = grossNum * 0.0245;
  const fgsb         = grossNum * 0.001;
  const totalZusEr   = emerytalne_er + rentowe_er + wypadkowe + fp + fgsb;
  const zdrowotnaBase = grossNum - totalZusEmp;
  const zdrowotna    = zdrowotnaBase * 0.09;
  const taxBase      = Math.max(0, zdrowotnaBase - 300);
  const pit          = taxBase * 0.12;
  const netto        = grossNum - totalZusEmp - zdrowotna - pit;
  return { emerytalne_e, rentowe_e, chorobowe_e, totalZusEmp, emerytalne_er, rentowe_er, wypadkowe, fp, fgsb, totalZusEr, zdrowotnaBase, zdrowotna, pit, netto };
}

/* ── shared row component defined outside render to avoid hook issue ─── */
const CalcRow = ({ label, value, sub, highlight, saving }: { label: string; value: string; sub?: string; highlight?: boolean; saving?: boolean }) => (
  <div className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
    <div>
      <div className="text-xs font-bold text-white">{label}</div>
      {sub && <div className="text-[10px] text-gray-500 font-mono mt-0.5">{sub}</div>}
    </div>
    <div className="text-sm font-black tabular-nums" style={{ color: highlight ? LIME : saving ? "#4ade80" : "white" }}>{value}</div>
  </div>
);

function ZUSCalculatorPanel({ t }: { t: (k: string, opts?: any) => string }) {
  const [zusTab, setZusTab]             = React.useState<"single" | "dual">("single");

  /* single contract state */
  const [gross, setGross]               = React.useState("5082");
  const [inclChorob, setInclChorob]     = React.useState(true);

  /* dual contract state */
  const [gross1, setGross1]             = React.useState("5082");
  const [inclChorob1, setInclChorob1]   = React.useState(true);
  const [rate2, setRate2]               = React.useState("25");
  const [hours2, setHours2]             = React.useState("80");
  const [inclChorob2, setInclChorob2]   = React.useState(false);

  /* ── SINGLE calculations ─────────────────────────────────────────── */
  const s = calcSingleZUS(parseFloat(gross) || 0, inclChorob);

  /* ── DUAL calculations ───────────────────────────────────────────── */
  const MIN_WAGE_2026 = 5082;
  const g1 = parseFloat(gross1) || 0;
  const c1 = calcSingleZUS(g1, inclChorob1);

  const grossRaw2 = (parseFloat(rate2) || 0) * (parseFloat(hours2) || 0);
  // Company 2 ZUS rules (zbieg tytułów):
  // If Company 1 gross ≥ min wage → emerytalne + rentowe EXEMPT from Company 2
  const c1QualifiesExemption = g1 >= MIN_WAGE_2026;
  // Employee side Company 2
  const em2_e  = c1QualifiesExemption ? 0 : grossRaw2 * 0.0976;
  const re2_e  = c1QualifiesExemption ? 0 : grossRaw2 * 0.015;
  const ch2_e  = inclChorob2 ? grossRaw2 * 0.0245 : 0;
  const zusEmp2 = em2_e + re2_e + ch2_e;
  // Employer side Company 2
  const em2_er = c1QualifiesExemption ? 0 : grossRaw2 * 0.0976;
  const re2_er = c1QualifiesExemption ? 0 : grossRaw2 * 0.065;
  const wy2    = grossRaw2 * 0.0167; // wypadkowe always applies
  const fp2    = grossRaw2 * 0.0245; // FP always applies
  const fg2    = grossRaw2 * 0.001;
  const zusEr2 = em2_er + re2_er + wy2 + fp2 + fg2;
  // Zdrowotna mandatory regardless
  const zdBase2 = grossRaw2 - zusEmp2;
  const zdr2    = zdBase2 * 0.09;
  // PIT — no tax-free allowance if already used at Company 1
  const pit2    = Math.max(0, (zdBase2 - 250) * 0.12);
  const netto2  = grossRaw2 - zusEmp2 - zdr2 - pit2;

  // Savings vs if Company 2 had full ZUS
  const fullZusEmp2   = grossRaw2 * 0.0976 + grossRaw2 * 0.015 + (inclChorob2 ? grossRaw2 * 0.0245 : 0);
  const empSaving     = c1QualifiesExemption ? (grossRaw2 * 0.0976 + grossRaw2 * 0.015) : 0;
  const erSaving      = c1QualifiesExemption ? (grossRaw2 * 0.0976 + grossRaw2 * 0.065) : 0;

  const combinedGross = g1 + grossRaw2;
  const combinedNetto = c1.netto + netto2;
  const combinedErCost = (g1 + c1.totalZusEr) + (grossRaw2 + zusEr2);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-wide">{t("payroll.zusCalc")}</h2>
          <p className="text-xs font-mono mt-1" style={{ color: LIME, opacity: 0.7 }}>{t("payroll.zusCalcSubtitle")}</p>
        </div>
        {/* Inner tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {([["single", t("payroll.zusSingle")], ["dual", t("payroll.zusDual")]] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setZusTab(tab)}
              className="px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all"
              style={zusTab === tab ? { background: LIME, color: "#333333" } : { color: "rgba(255,255,255,0.45)" }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ════════════════════ SINGLE CONTRACT ════════════════════ */}
      {zusTab === "single" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-panel rounded-xl p-5 space-y-5">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">{t("payroll.zusGross")}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black" style={{ color: LIME }}>zł</span>
                <input type="number" value={gross} onChange={(e) => setGross(e.target.value)} min={0}
                  className="w-full pl-8 pr-4 py-3 rounded-xl bg-slate-900 text-white text-lg font-black tabular-nums focus:outline-none"
                  style={{ border: `1.5px solid ${LIME_BORDER}`, caretColor: LIME }} />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">{t("payroll.zusChorobowe")}</label>
              <button onClick={() => setInclChorob((v) => !v)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all text-xs font-black uppercase tracking-wide"
                style={inclChorob ? { background: "rgba(233,255,112,0.12)", borderColor: LIME_BORDER, color: LIME } : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
                {inclChorob ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                {inclChorob ? t("payroll.zusIncluded") : t("payroll.zusExcluded")}
              </button>
            </div>
            <div className="rounded-xl p-4 space-y-1" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Employee ZUS Contributions</div>
              <CalcRow label="Emerytalne" sub="9.76%" value={`- zł${s.emerytalne_e.toFixed(2)}`} />
              <CalcRow label="Rentowe" sub="1.50%" value={`- zł${s.rentowe_e.toFixed(2)}`} />
              {inclChorob && <CalcRow label="Chorobowe" sub="2.45%" value={`- zł${s.chorobowe_e.toFixed(2)}`} />}
              <CalcRow label="Zdrowotna" sub={`9% × zł${s.zdrowotnaBase.toFixed(0)}`} value={`- zł${s.zdrowotna.toFixed(2)}`} />
              <CalcRow label="PIT-17 advance" sub="12% – KUP 300 zł" value={`- zł${s.pit.toFixed(2)}`} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="glass-panel rounded-xl p-5" style={{ border: `1px solid ${LIME_BORDER}` }}>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Net Take-Home</div>
              <div className="text-4xl font-black tabular-nums" style={{ color: LIME }}>zł{s.netto.toFixed(2)}</div>
              <div className="text-xs text-gray-500 font-mono mt-1">from gross zł{(parseFloat(gross) || 0).toFixed(2)}</div>
            </div>
            <div className="glass-panel rounded-xl p-5 space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Employer Total Cost</div>
              <CalcRow label="Gross Salary" value={`zł${(parseFloat(gross)||0).toFixed(2)}`} />
              <CalcRow label="Emerytalne" sub="9.76%" value={`+ zł${s.emerytalne_er.toFixed(2)}`} />
              <CalcRow label="Rentowe" sub="6.50%" value={`+ zł${s.rentowe_er.toFixed(2)}`} />
              <CalcRow label="Wypadkowe" sub="1.67%" value={`+ zł${s.wypadkowe.toFixed(2)}`} />
              <CalcRow label="FP" sub="2.45%" value={`+ zł${s.fp.toFixed(2)}`} />
              <CalcRow label="FGŚP" sub="0.10%" value={`+ zł${s.fgsb.toFixed(2)}`} />
              <div className="flex items-center justify-between pt-3 mt-1 border-t" style={{ borderColor: LIME_BORDER }}>
                <div className="text-xs font-black uppercase tracking-widest" style={{ color: LIME }}>Total Employer Cost</div>
                <div className="text-lg font-black tabular-nums" style={{ color: LIME }}>zł{((parseFloat(gross)||0) + s.totalZusEr).toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ DUAL EMPLOYMENT ════════════════════ */}
      {zusTab === "dual" && (
        <div className="space-y-5">
          {/* Legal note banner */}
          <div className="rounded-xl px-4 py-3 text-xs font-mono leading-relaxed" style={{ background: "rgba(233,255,112,0.06)", border: `1px solid ${LIME_BORDER}`, color: "rgba(233,255,112,0.8)" }}>
            <span className="font-black uppercase tracking-widest mr-2" style={{ color: LIME }}>⚖ Zbieg Tytułów (Art. 9 Ustawa o SUS)</span>
            If Company 1 gross ≥ min. wage (zł{MIN_WAGE_2026.toLocaleString()}), then Company 2 (umowa zlecenia) is <strong>exempt from emerytalne + rentowe ZUS</strong>. Only zdrowotna (9%) is mandatory. This is legal and common practice in Poland.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* ── Company 1 inputs ── */}
            <div className="glass-panel rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black" style={{ background: LIME, color: "#333" }}>1</div>
                <span className="text-xs font-black uppercase tracking-widest text-white">{t("payroll.zusCompany1")}</span>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">{t("payroll.zusGross")} (zł/month)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black" style={{ color: LIME }}>zł</span>
                  <input type="number" value={gross1} onChange={(e) => setGross1(e.target.value)} min={0}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-slate-900 text-white text-base font-black tabular-nums focus:outline-none"
                    style={{ border: `1.5px solid ${c1QualifiesExemption ? LIME_BORDER : "rgba(239,68,68,0.4)"}`, caretColor: LIME }} />
                </div>
                {!c1QualifiesExemption && (
                  <p className="text-[10px] text-red-400 font-mono mt-1">⚠ Below min. wage — Company 2 full ZUS applies</p>
                )}
                {c1QualifiesExemption && (
                  <p className="text-[10px] font-mono mt-1" style={{ color: LIME }}>✓ Qualifies — Company 2 exempt from emerytalne + rentowe</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">{t("payroll.zusChorobowe")}</label>
                <button onClick={() => setInclChorob1((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-xs font-black uppercase tracking-wide"
                  style={inclChorob1 ? { background: "rgba(233,255,112,0.12)", borderColor: LIME_BORDER, color: LIME } : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
                  {inclChorob1 ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {inclChorob1 ? t("payroll.zusIncluded") : t("payroll.zusExcluded")}
                </button>
              </div>
              <div className="rounded-xl p-3 space-y-1 text-xs" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <CalcRow label="Emerytalne 9.76%" value={`- zł${c1.emerytalne_e.toFixed(2)}`} />
                <CalcRow label="Rentowe 1.50%" value={`- zł${c1.rentowe_e.toFixed(2)}`} />
                {inclChorob1 && <CalcRow label="Chorobowe 2.45%" value={`- zł${c1.chorobowe_e.toFixed(2)}`} />}
                <CalcRow label="Zdrowotna 9%" value={`- zł${c1.zdrowotna.toFixed(2)}`} />
                <CalcRow label="PIT-17" value={`- zł${c1.pit.toFixed(2)}`} />
                <div className="flex justify-between pt-2 mt-1 border-t" style={{ borderColor: LIME_BORDER }}>
                  <span className="font-black" style={{ color: LIME }}>Net Company 1</span>
                  <span className="font-black" style={{ color: LIME }}>zł{c1.netto.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* ── Company 2 inputs ── */}
            <div className="glass-panel rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black" style={{ background: "rgba(233,255,112,0.2)", color: LIME, border: `1px solid ${LIME_BORDER}` }}>2</div>
                <span className="text-xs font-black uppercase tracking-widest text-white">{t("payroll.zusCompany2")}</span>
                {c1QualifiesExemption && (
                  <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ml-auto" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>ZUS Exempt</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Rate (zł/h)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black" style={{ color: LIME }}>zł</span>
                    <input type="number" value={rate2} onChange={(e) => setRate2(e.target.value)} min={0}
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-slate-900 text-white font-black tabular-nums focus:outline-none"
                      style={{ border: `1.5px solid ${LIME_BORDER}`, caretColor: LIME }} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">{t("payroll.zusHours")}</label>
                  <input type="number" value={hours2} onChange={(e) => setHours2(e.target.value)} min={0}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 text-white font-black tabular-nums focus:outline-none"
                    style={{ border: `1.5px solid ${LIME_BORDER}`, caretColor: LIME }} />
                </div>
              </div>
              <div className="text-xs font-mono text-gray-400">
                Gross Company 2: <span className="font-black text-white">zł{grossRaw2.toFixed(2)}</span>
                <span className="ml-2 text-gray-600">({parseFloat(rate2)||0} × {parseFloat(hours2)||0}h)</span>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">{t("payroll.zusChorobowe")} (Company 2)</label>
                <button onClick={() => setInclChorob2((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-xs font-black uppercase tracking-wide"
                  style={inclChorob2 ? { background: "rgba(233,255,112,0.12)", borderColor: LIME_BORDER, color: LIME } : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
                  {inclChorob2 ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {inclChorob2 ? t("payroll.zusIncluded") : t("payroll.zusExcluded")}
                </button>
              </div>
              <div className="rounded-xl p-3 space-y-1" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-[9px] font-black uppercase tracking-widest text-gray-600 mb-2">Company 2 Deductions</div>
                <CalcRow label="Emerytalne 9.76%" sub={c1QualifiesExemption ? "EXEMPT" : undefined} value={c1QualifiesExemption ? "zł0.00" : `- zł${em2_e.toFixed(2)}`} saving={c1QualifiesExemption} />
                <CalcRow label="Rentowe 1.50%" sub={c1QualifiesExemption ? "EXEMPT" : undefined} value={c1QualifiesExemption ? "zł0.00" : `- zł${re2_e.toFixed(2)}`} saving={c1QualifiesExemption} />
                {inclChorob2 && <CalcRow label="Chorobowe 2.45%" value={`- zł${ch2_e.toFixed(2)}`} />}
                <CalcRow label={`Zdrowotna 9%`} sub="Mandatory" value={`- zł${zdr2.toFixed(2)}`} />
                <CalcRow label="PIT-17" sub="No allowance" value={`- zł${pit2.toFixed(2)}`} />
                <div className="flex justify-between pt-2 mt-1 border-t" style={{ borderColor: LIME_BORDER }}>
                  <span className="font-black" style={{ color: LIME }}>Net Company 2</span>
                  <span className="font-black" style={{ color: LIME }}>zł{netto2.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Combined summary ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-panel rounded-xl p-5" style={{ border: `1px solid ${LIME_BORDER}` }}>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Combined Net Take-Home</div>
              <div className="text-3xl font-black tabular-nums" style={{ color: LIME }}>zł{combinedNetto.toFixed(2)}</div>
              <div className="text-xs text-gray-500 font-mono mt-1">from combined gross zł{combinedGross.toFixed(2)}</div>
            </div>
            {c1QualifiesExemption && (
              <div className="glass-panel rounded-xl p-5" style={{ border: "1px solid rgba(74,222,128,0.3)" }}>
                <div className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "#4ade80" }}>Worker Saves (monthly)</div>
                <div className="text-3xl font-black tabular-nums" style={{ color: "#4ade80" }}>+ zł{empSaving.toFixed(2)}</div>
                <div className="text-xs font-mono mt-1" style={{ color: "rgba(74,222,128,0.6)" }}>vs single-company full ZUS</div>
              </div>
            )}
            {c1QualifiesExemption && (
              <div className="glass-panel rounded-xl p-5" style={{ border: "1px solid rgba(251,191,36,0.3)" }}>
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">Employer 2 Saves (monthly)</div>
                <div className="text-3xl font-black tabular-nums text-amber-400">+ zł{erSaving.toFixed(2)}</div>
                <div className="text-xs font-mono text-amber-600 mt-1">emerytalne + rentowe not due</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
