import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { PayrollTrendChart } from "./PayrollTrendChart";
import {
  Calculator, Save, Lock, Loader2, RefreshCcw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, DollarSign, Users, Clock, TrendingUp,
  Building2, Download, ToggleLeft, ToggleRight, Pencil, Eye, X, Check,
  FileText, Edit2, Search
} from "lucide-react";

// 2026 Polish ZUS/PIT constants for umowa zlecenie (full mandatory contributions)
const SOCIAL_ZUS_RATE       = 0.1126; // Emerytalne 9.76% + Rentowe 1.50% (no chorobowe)
const HEALTH_RATE           = 0.09;   // Zdrowotna — 9% of (gross − social ZUS)
const KUP_RATE              = 0.20;   // Koszty uzyskania przychodu — 20% of przychód (gross − ZUS)
const PIT_RATE              = 0.12;   // First tax bracket 2026
const MONTHLY_RELIEF        = 300;    // Miesięczna kwota zmniejszająca podatek (30 000 zł / year × 12%)
// Employer-side ZUS on top of gross: emerytalne 9.76% + rentowe 6.5% + wypadkowe 1.67% + FP 2.45% + FGŚP 0.10%
const EMPLOYER_ZUS_RATE = 0.0976 + 0.065 + 0.0167 + 0.0245 + 0.001; // ≈ 20.48%

const LIME = "#E9FF70";
const LIME_BORDER = "rgba(233,255,112,0.25)";
const LIME_BG = "rgba(233,255,112,0.06)";

// Monthly gross minimum wage (zł). Divided by 160h → minimum hourly rate.
// Compliance check: worker's gross must be ≥ (minMonthly/160) × hoursWorked.
const POLISH_MIN_WAGE: Record<number, number> = {
  2022: 3010,
  2023: 3600,  // Jul 2023 rate (higher half-year)
  2024: 4300,  // Jul 2024 rate (higher half-year)
  2025: 4666,
  2026: 5024,  // brutto 5024 zł/month → 31.40 zł/h (÷160h)
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
  pesel: string | null;
  nip: string | null;
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

function calcDeductions(gross: number): { socialZus: number; zdrowotna: number; pit: number; total: number } {
  const socialZus = gross * SOCIAL_ZUS_RATE;
  const healthBase = gross - socialZus;           // przychód podatkowy
  const zdrowotna  = healthBase * HEALTH_RATE;
  const kup        = healthBase * KUP_RATE;       // 20% of przychód (gross − ZUS), not of gross
  const taxBase    = Math.max(0, Math.round(healthBase - kup));
  const pit        = Math.max(0, Math.round(taxBase * PIT_RATE - MONTHLY_RELIEF));
  return { socialZus, zdrowotna, pit, total: socialZus + zdrowotna + pit };
}

function calcNetto(row: GridRow, withZus = false): number {
  const h = parseFloat(row._hours) || 0;
  const r = parseFloat(row._rate) || row.hourlyNettoRate || 0;
  const a = parseFloat(row._advance) || 0;
  const p = parseFloat(row._penalties) || 0;
  const gross = h * r;
  if (!withZus) return gross - a - p;
  const { total } = calcDeductions(gross);
  return gross - total - a - p;
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
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [payrollView, setPayrollView] = useState<"run" | "zus">("run");
  const [rates, setRates] = useState<ZusRates>(DEFAULT_RATES);
  const [editRatesOpen, setEditRatesOpen] = useState(false);
  const [ibanEditId, setIbanEditId] = useState<string | null>(null);
  const [ibanEditValue, setIbanEditValue] = useState("");
  const [ibanSaving, setIbanSaving] = useState(false);
  const [bulkHours, setBulkHours] = useState("160");

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
        pesel: w.pesel ?? null,
        nip: w.nip ?? null,
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
  const totalHours = rows.reduce((s, r) => s + (parseFloat(r._hours) || 0), 0);
  const totalGross = rows.reduce((s, r) => s + ((parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate)), 0);
  const totalAdvances = rows.reduce((s, r) => s + (parseFloat(r._advance) || 0), 0);
  const totalPenalties = rows.reduce((s, r) => s + (parseFloat(r._penalties) || 0), 0);
  const totalZus = withZus ? rows.reduce((s, r) => {
    const gross = (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate || 0);
    return s + (gross > 0 ? calcDeductions(gross).socialZus : 0);
  }, 0) : 0;
  const totalNetto = rows.reduce((s, r) => s + calcNetto(r, withZus), 0);
  const totalEejCost = totalGross * (1 + EMPLOYER_ZUS_RATE);

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

  const handleBulkSetHours = (h: string) => {
    const val = h.trim();
    if (!val || isNaN(Number(val))) return;
    setRows((prev) => prev.map((r) => ({ ...r, _hours: val, _dirty: true })));
  };

  const handlePlatnikExport = () => {
    const BOM = "\uFEFF";
    const headers = [
      "Nazwisko i Imię", "PESEL", "NIP", "Miesiąc",
      "Brutto (zł)", "ZUS Emerytalny Prac. (zł)", "ZUS Rentowy Prac. (zł)", "ZUS Chorobowy Prac. (zł)",
      "ZUS Emerytalny Praz. (zł)", "ZUS Rentowy Praz. (zł)", "Wypadkowe (zł)", "FP (zł)", "FGŚP (zł)",
      "Zdrowotna (zł)", "PIT (zł)", "Netto (zł)", "Koszt Pracodawcy Łącznie (zł)",
    ].join(";");
    const lines: string[] = [headers];
    displayed.forEach((r) => {
      const h = parseFloat(r._hours) || 0;
      const rate = parseFloat(r._rate) || r.hourlyNettoRate;
      const gross = h * rate;
      if (gross === 0) return;
      const em_e = gross * 0.0976;
      const re_e = gross * 0.0150;
      const ch_e = 0; // chorobowe not applicable
      const totalEmp = em_e + re_e; // 11.26% — pension + disability only
      const zdBase = gross - totalEmp;
      const zdr = zdBase * 0.09;
      const kup = zdBase * 0.20;  // 20% of przychód (gross − ZUS)
      const taxBase = Math.max(0, Math.round(zdBase - kup));
      const pit = Math.max(0, Math.round(taxBase * 0.12 - 300));
      const netto = gross - totalEmp - zdr - pit;
      const em_er = gross * 0.0976;
      const re_er = gross * 0.065;
      const wy = gross * 0.0167;
      const fp = gross * 0.0245;
      const fg = gross * 0.001;
      const totalEr = em_er + re_er + wy + fp + fg;
      lines.push([
        r.name, r.pesel ?? "", r.nip ?? "", monthYear,
        gross.toFixed(2), em_e.toFixed(2), re_e.toFixed(2), ch_e.toFixed(2),
        em_er.toFixed(2), re_er.toFixed(2), wy.toFixed(2), fp.toFixed(2), fg.toFixed(2),
        zdr.toFixed(2), pit.toFixed(2), netto.toFixed(2), (gross + totalEr).toFixed(2),
      ].join(";"));
    });
    const csv = BOM + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `EEJ_Platnik_${monthYear}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const empZusRate = (rates.emerytalne + rates.rentowe) / 100;

  // Unique sites with worker counts (for filter pills)
  const siteCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const site = r.siteLocation ?? "";
    if (site) acc[site] = (acc[site] ?? 0) + 1;
    return acc;
  }, {});
  const sites = Object.entries(siteCounts).sort((a, b) => b[1] - a[1]);

  // Filtered + sorted rows
  const displayed = rows
    .filter((r) => {
      if (siteFilter && (r.siteLocation ?? "") !== siteFilter) return false;
      if (searchQ && !r.name.toLowerCase().includes(searchQ.toLowerCase()) && !(r.siteLocation ?? "").toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    })
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
              ZUS/PIT RATES — {monthYear.split("-")[0]}
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
              {t("payroll.editRates")}
            </button>
            <button
              onClick={() => setPayrollSubTab("zus")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all"
              style={{ background: "rgba(59,130,246,0.12)", borderColor: "rgba(59,130,246,0.35)", color: "#60a5fa" }}
            >
              <Calculator className="w-3 h-3" />
              {t("payroll.dualSplit")}
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

        <div className="flex flex-wrap items-center gap-1 text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
          <span>Effective ZUS: {(rates.emerytalne + rates.rentowe).toFixed(2)}%</span>
          <span className="mx-1">·</span>
          <span style={{ color: "#f59e0b" }}>Chorobowe excluded — KUP &amp; PIT shown for ZUS breakdown reference only (workers on zwolnienia)</span>
          <span className="mx-1">·</span>
          <span>ZUS base = Gross (Rate × Hours)</span>
        </div>

        {editRatesOpen && (
          <div className="flex justify-end">
            <button
              onClick={() => setEditRatesOpen(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide"
              style={{ background: LIME, color: "#333" }}
            >
              <Check className="w-3 h-3" />
              {t("payroll.saveRates")}
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
          {t("payroll.zusView")}
        </button>
        <button
          onClick={handleBankExport}
          disabled={bankExporting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
          title={t("payroll.bankCsv")}
        >
          {bankExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {t("payroll.bankCsv")}
        </button>
        <button
          onClick={handlePdfExport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
        >
          <FileText className="w-3.5 h-3.5" />
          PDF
        </button>
        <button
          onClick={handlePlatnikExport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
          title="Export CSV compatible with Polish payroll / Płatnik format"
        >
          <Download className="w-3.5 h-3.5" />
          {t("payroll.platnikExport")}
        </button>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}>
          <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">{t("payroll.setAllHours")}:</span>
          <input
            type="number"
            min={0}
            max={999}
            value={bulkHours}
            onChange={(e) => setBulkHours(e.target.value)}
            className="w-14 bg-slate-800 text-white rounded px-2 py-1 text-xs font-mono focus:outline-none text-center"
            style={{ border: `1px solid ${LIME_BORDER}` }}
          />
          <button
            onClick={() => handleBulkSetHours(bulkHours)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all"
            style={{ background: LIME, color: "#333333" }}
            title={`Set all workers to ${bulkHours} hours`}
          >
            ✓ Apply
          </button>
        </div>
        {payrollView === "run" && (
          <button
            onClick={() => setWithZus((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all ml-auto"
            style={withZus
              ? { background: "rgba(233,255,112,0.08)", borderColor: LIME_BORDER, color: LIME }
              : { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
          >
            {withZus ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {t("payroll.workerZus")}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: t("payroll.activeWorkers"), value: String(rows.length), icon: Users, color: "#a78bfa" },
          { label: t("payroll.history.totalHours"), value: totalHours.toFixed(2), icon: TrendingUp, color: "#fbbf24" },
          { label: t("payroll.totalGross"), value: `${totalGross.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`, icon: DollarSign, color: "#34d399" },
          { label: t("payroll.totalDeductions"), value: `${(totalAdvances + totalPenalties).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`, icon: Calculator, color: "#f97316" },
          { label: t("payroll.totalNetto"), value: `${totalNetto.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`, icon: Building2, color: "#4ade80", highlight: true },
          { label: t("payroll.eejCost"), value: `${totalEejCost.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`, icon: AlertTriangle, color: "#fb923c", highlight2: true },
        ].map((c: any) => (
          <div key={c.label} className="rounded-xl p-4 border flex items-center gap-3" style={{ background: c.highlight ? "rgba(74,222,128,0.06)" : c.highlight2 ? "rgba(251,146,60,0.06)" : "rgba(255,255,255,0.02)", borderColor: c.highlight ? "rgba(74,222,128,0.25)" : c.highlight2 ? "rgba(251,146,60,0.25)" : "rgba(255,255,255,0.06)" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${c.color}18`, border: `1px solid ${c.color}40` }}>
              <c.icon className="w-4 h-4" style={{ color: c.color }} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{c.label}</p>
              <p className="text-base font-black tabular-nums" style={{ color: c.color }}>{c.value}</p>
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

      {/* ── Site filter pills ── */}
      {sites.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-600 mr-1">Site:</span>
          {/* All pill */}
          <button
            onClick={() => setSiteFilter(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide transition-all"
            style={siteFilter === null
              ? { background: LIME, color: "#333333" }
              : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {t("payroll.allSites")}
            <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black"
              style={{ background: siteFilter === null ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.1)" }}>
              {rows.length}
            </span>
          </button>
          {/* Per-site pills */}
          {sites.map(([site, count]) => (
            <button
              key={site}
              onClick={() => setSiteFilter(siteFilter === site ? null : site)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide transition-all"
              style={siteFilter === site
                ? { background: LIME, color: "#333333" }
                : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {site}
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black"
                style={{ background: siteFilter === site ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.1)" }}>
                {count}
              </span>
            </button>
          ))}
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
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: LIME_BORDER, background: "rgba(233,255,112,0.04)" }}>
            <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: LIME }}>{t("payroll.gridZusTitle")}</span>
          </div>
          <div className="eej-table-scroll overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "1100px" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {[
                    { label: t("payroll.col.worker") },
                    { label: t("payroll.col.specSite") },
                    { label: t("payroll.col.bankIban") },
                    { label: t("payroll.col.ratePlnH") },
                    { label: t("payroll.col.hours"), clr: "#fbbf24" },
                    { label: t("payroll.col.gross") },
                    { label: t("payroll.col.empZus"), clr: "#fb923c" },
                    { label: t("payroll.col.healthIns"), clr: "#fb923c" },
                    { label: t("payroll.col.estPit"), clr: "#f87171" },
                    { label: t("payroll.col.netAfterTax"), clr: "#4ade80" },
                    { label: t("payroll.col.eejCost"), clr: "#fb923c" },
                    { label: "Total Employer Cost", clr: "#e879f9" },
                    { label: t("payroll.col.advance"), clr: "#f97316" },
                  ].map((c: any) => (
                    <th key={c.label} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-left whitespace-nowrap"
                      style={{ color: c.clr ?? "rgba(255,255,255,0.45)" }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div className="h-3.5 bg-white/5 rounded animate-pulse" style={{ width: j === 0 ? "100px" : "64px" }} />
                      </td>
                    ))}</tr>
                  ))
                ) : displayed.length === 0 ? (
                  <tr><td colSpan={11} className="px-6 py-12 text-center text-gray-500 font-mono text-sm">No workers found.</td></tr>
                ) : (
                  displayed.map((row) => {
                    const hours = parseFloat(row._hours) || 0;
                    const gross = hours * (parseFloat(row._rate) || row.hourlyNettoRate);
                    const empZus = gross * empZusRate;
                    const healthIns = (gross - empZus) * (rates.zdrowotne / 100);
                    const _taxBase = Math.round((gross - empZus) * (1 - rates.kup / 100));
                    const estPit = Math.max(0, Math.round(_taxBase * (rates.pitFlat / 100) - MONTHLY_RELIEF));
                    const netAfterTax = gross - empZus - healthIns - estPit;
                    const advance = parseFloat(row._advance) || 0;
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
                        {/* Hours (editable, yellow) */}
                        <td className="px-2 py-2">
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={row._hours}
                              onChange={(e) => updateRow(row.id, "_hours", e.target.value)}
                              placeholder="0"
                              className="w-16 bg-slate-800 rounded px-1.5 py-1 text-xs font-mono focus:outline-none text-right pr-5 font-bold"
                              style={{ border: `1px solid ${hours > 0 ? "#fbbf24" : "rgba(255,255,255,0.08)"}`, color: hours > 0 ? "#fbbf24" : "rgba(255,255,255,0.4)" }}
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-500">h</span>
                          </div>
                        </td>
                        {/* Gross */}
                        <td className="px-3 py-2.5 font-mono text-sm font-bold text-white">
                          {gross > 0 ? gross.toFixed(2) : "—"}
                        </td>
                        {/* Emp. ZUS */}
                        <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "#fb923c" }}>
                          {gross > 0 ? `– ${empZus.toFixed(2)}` : "—"}
                        </td>
                        {/* Health Ins. */}
                        <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "#fb923c" }}>
                          {gross > 0 ? `– ${healthIns.toFixed(2)}` : "—"}
                        </td>
                        {/* Est. PIT */}
                        <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "#f87171" }}>
                          {gross > 0 ? `– ${estPit.toFixed(2)}` : "—"}
                        </td>
                        {/* Net After Tax */}
                        <td className="px-3 py-2.5 font-mono text-sm font-black" style={{ color: netAfterTax >= 0 ? "#4ade80" : "#ef4444" }}>
                          {gross > 0 ? netAfterTax.toFixed(2) : "—"}
                        </td>
                        {/* EEJ (Employer) Cost */}
                        <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "#fb923c" }}>
                          {gross > 0 ? `+ ${(gross * EMPLOYER_ZUS_RATE).toFixed(2)}` : "—"}
                        </td>
                        {/* Total Employer Cost */}
                        <td className="px-3 py-2.5 font-mono text-xs font-black" style={{ color: "#e879f9" }}>
                          {gross > 0 ? (gross + gross * EMPLOYER_ZUS_RATE).toFixed(2) : "—"}
                        </td>
                        {/* Advances */}
                        <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: advance > 0 ? "#f97316" : "rgba(255,255,255,0.3)" }}>
                          {advance > 0 ? `– ${advance.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {!loading && displayed.length > 0 && (
                <tfoot>
                  <tr style={{ background: "rgba(74,222,128,0.04)", borderTop: "1px solid rgba(74,222,128,0.2)" }}>
                    <td colSpan={3} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-500">Totals</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "#fbbf24" }}>
                      {displayed.reduce((s, r) => s + (parseFloat(r._hours) || 0), 0).toFixed(1)}h
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm font-bold text-white">
                      {displayed.reduce((s, r) => s + (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate), 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "#fb923c" }}>
                      – {displayed.reduce((s, r) => {
                        const g = (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate);
                        return s + g * empZusRate;
                      }, 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "#fb923c" }}>
                      – {displayed.reduce((s, r) => {
                        const g = (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate);
                        const ez = g * empZusRate;
                        return s + (g - ez) * (rates.zdrowotne / 100);
                      }, 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "#f87171" }}>
                      – {displayed.reduce((s, r) => {
                        const g = (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate);
                        const ez = g * empZusRate;
                        const tb = Math.round((g - ez) * (1 - rates.kup / 100));
                        return s + Math.max(0, Math.round(tb * (rates.pitFlat / 100) - MONTHLY_RELIEF));
                      }, 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm font-black" style={{ color: "#4ade80" }}>
                      {displayed.reduce((s, r) => {
                        const g = (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate);
                        const ez = g * empZusRate;
                        const hi = (g - ez) * (rates.zdrowotne / 100);
                        const tb = Math.round((g - ez) * (1 - rates.kup / 100));
                        const pit = Math.max(0, Math.round(tb * (rates.pitFlat / 100) - MONTHLY_RELIEF));
                        return s + g - ez - hi - pit;
                      }, 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "#fb923c" }}>
                      + {displayed.reduce((s, r) => {
                        const g = (parseFloat(r._hours) || 0) * (parseFloat(r._rate) || r.hourlyNettoRate);
                        return s + g * EMPLOYER_ZUS_RATE;
                      }, 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "#f97316" }}>
                      – {displayed.reduce((s, r) => s + (parseFloat(r._advance) || 0), 0).toFixed(2)}
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
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: LIME_BORDER, background: "rgba(233,255,112,0.04)" }}>
          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: LIME }}>{t("payroll.gridRunTitle")}</span>
        </div>
        <div className="eej-table-scroll overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: "1000px" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {[
                  { label: t("payroll.col.worker"), f: "name" as const },
                  { label: t("payroll.col.specSite"), f: "site" as const },
                  { label: t("payroll.col.bankIban"), f: null },
                  { label: t("payroll.col.ratePlnH"), f: null },
                  { label: t("payroll.col.hours"), f: null, clr: "#fbbf24" },
                  { label: t("payroll.col.advance"), f: null, clr: "#f97316" },
                  { label: t("payroll.col.penalties"), f: null, clr: "#f87171" },
                  { label: t("payroll.col.finalNet"), f: "netto" as const, clr: "#4ade80" },
                ].map((c: any) => (
                  <th
                    key={c.label}
                    className={`px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-left whitespace-nowrap ${c.f ? "cursor-pointer select-none hover:opacity-80" : ""}`}
                    style={{ color: c.clr ?? "rgba(255,255,255,0.45)" }}
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
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-2 py-2">
                        <div className="h-3.5 bg-white/5 rounded animate-pulse" style={{ width: j === 0 ? "100px" : "56px" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500 font-mono text-sm">
                    {t("payroll.noWorkers")}
                  </td>
                </tr>
              ) : (
                displayed.map((row) => {
                  const netto = calcNetto(row, withZus);
                  const hours = parseFloat(row._hours) || 0;
                  const gross = hours * (parseFloat(row._rate) || row.hourlyNettoRate);
                  const advance = parseFloat(row._advance) || 0;
                  const penalties = parseFloat(row._penalties) || 0;
                  const isEditingIban = ibanEditId === row.id;
                  return (
                    <tr key={row.id} className="hover:bg-white/[0.03] transition-colors" style={{ background: row._dirty ? "rgba(233,255,112,0.03)" : "" }}>
                      {/* Worker */}
                      <td className="px-2 py-2" style={{ minWidth: "120px" }}>
                        <div className="font-sans font-bold text-white text-xs leading-tight">{row.name}</div>
                        {row._dirty && <div className="text-[8px] font-bold uppercase tracking-wider mt-0.5" style={{ color: LIME }}>● unsaved</div>}
                      </td>
                      {/* Spec / Site */}
                      <td className="px-2 py-2" style={{ minWidth: "90px" }}>
                        {row.specialization && <div className="text-[9px] text-gray-400 font-mono mb-0.5">{row.specialization}</div>}
                        {row.siteLocation ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap" style={{ background: LIME, color: "#333" }}>{row.siteLocation}</span>
                        ) : (
                          <span className="text-gray-600 text-[10px]">—</span>
                        )}
                      </td>
                      {/* Bank IBAN */}
                      <td className="px-2 py-2" style={{ minWidth: "170px" }}>
                        {isEditingIban ? (
                          <div className="flex items-center gap-1">
                            <input autoFocus value={ibanEditValue} onChange={(e) => setIbanEditValue(e.target.value)}
                              className="w-36 bg-slate-800 text-white rounded px-1.5 py-1 text-[10px] font-mono focus:outline-none"
                              style={{ border: `1px solid ${LIME_BORDER}` }}
                              onKeyDown={(e) => { if (e.key === "Enter") handleIbanSave(row.id); if (e.key === "Escape") setIbanEditId(null); }}
                            />
                            <button onClick={() => handleIbanSave(row.id)} disabled={ibanSaving}
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: LIME, color: "#333" }}>
                              {ibanSaving ? "…" : "✓"}
                            </button>
                          </div>
                        ) : row._iban ? (
                          <div className="flex items-center gap-1.5 group">
                            <span className="font-mono text-[10px] text-gray-300">{row._iban}</span>
                            <button onClick={() => { setIbanEditId(row.id); setIbanEditValue(row._iban); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-gray-500 hover:text-white">✏</button>
                          </div>
                        ) : (
                          <button onClick={() => { setIbanEditId(row.id); setIbanEditValue(""); }}
                            className="text-[9px] font-mono text-gray-600 hover:text-gray-400 transition-colors border border-dashed border-white/10 px-2 py-0.5 rounded">
                            + add IBAN
                          </button>
                        )}
                      </td>
                      {/* Rate (editable) */}
                      <td className="px-2 py-1.5" style={{ minWidth: "84px" }}>
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-500">zł</span>
                          <input type="number" min="0" step="0.1" value={row._rate}
                            onChange={(e) => updateRow(row.id, "_rate", e.target.value)} placeholder="0.00"
                            className="w-20 bg-slate-800 text-cyan-300 rounded px-1.5 py-1 text-xs font-mono focus:outline-none text-right pr-5"
                            style={{ border: `1px solid ${row._dirty ? LIME_BORDER : "rgba(255,255,255,0.08)"}` }}
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-500">/h</span>
                        </div>
                      </td>
                      {/* Hours (yellow) */}
                      <td className="px-2 py-1.5" style={{ minWidth: "72px" }}>
                        <div className="relative">
                          <input type="number" min="0" step="0.5" value={row._hours}
                            onChange={(e) => updateRow(row.id, "_hours", e.target.value)} placeholder="0"
                            className="w-16 bg-slate-800 rounded px-1.5 py-1 text-xs font-mono focus:outline-none text-right pr-5 font-bold"
                            style={{ border: `1px solid ${hours > 0 ? "#fbbf24" : "rgba(255,255,255,0.08)"}`, color: hours > 0 ? "#fbbf24" : "rgba(255,255,255,0.4)" }}
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-500">h</span>
                        </div>
                      </td>
                      {/* Advances (orange) */}
                      <td className="px-2 py-1.5" style={{ minWidth: "84px" }}>
                        <div className="relative">
                          <input type="number" min="0" step="1" value={row._advance}
                            onChange={(e) => updateRow(row.id, "_advance", e.target.value)} placeholder="0"
                            className="w-20 bg-slate-800 rounded px-1.5 py-1 text-xs font-mono focus:outline-none text-right font-bold"
                            style={{ border: `1px solid ${advance > 0 ? "#f97316" : "rgba(255,255,255,0.08)"}`, color: advance > 0 ? "#f97316" : "rgba(255,255,255,0.4)" }}
                          />
                        </div>
                      </td>
                      {/* Penalties (red) */}
                      <td className="px-2 py-1.5" style={{ minWidth: "84px" }}>
                        <div className="relative">
                          <input type="number" min="0" step="1" value={row._penalties}
                            onChange={(e) => updateRow(row.id, "_penalties", e.target.value)} placeholder="0"
                            className="w-20 bg-slate-800 rounded px-1.5 py-1 text-xs font-mono focus:outline-none text-right font-bold"
                            style={{ border: `1px solid ${penalties > 0 ? "#f87171" : "rgba(255,255,255,0.08)"}`, color: penalties > 0 ? "#f87171" : "rgba(255,255,255,0.4)" }}
                          />
                        </div>
                      </td>
                      {/* Final Net (green + PLN) */}
                      <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ minWidth: "110px" }}>
                        <span className="font-black text-sm tabular-nums" style={{ color: netto >= 0 ? "#4ade80" : "#ef4444" }}>
                          {netto.toFixed(2)}
                        </span>
                        <span className="ml-1 text-[9px] font-bold" style={{ color: netto >= 0 ? "#4ade8080" : "#ef444480" }}>PLN</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Totals footer */}
            {!loading && displayed.length > 0 && (
              <tfoot>
                <tr style={{ background: "rgba(74,222,128,0.04)", borderTop: "1px solid rgba(74,222,128,0.2)" }}>
                  <td colSpan={3} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-500">Totals</td>
                  <td className="px-2 py-2.5" />
                  <td className="px-2 py-2.5 font-mono text-xs font-bold" style={{ color: "#fbbf24" }}>
                    {displayed.reduce((s, r) => s + (parseFloat(r._hours) || 0), 0).toFixed(1)}h
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs font-bold" style={{ color: "#f97316" }}>
                    {displayed.reduce((s, r) => s + (parseFloat(r._advance) || 0), 0).toFixed(2)}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs font-bold" style={{ color: "#f87171" }}>
                    {displayed.reduce((s, r) => s + (parseFloat(r._penalties) || 0), 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-sm font-black tabular-nums">
                    <span style={{ color: "#4ade80" }}>{displayed.reduce((s, r) => s + calcNetto(r, withZus), 0).toFixed(2)}</span>
                    <span className="ml-1 text-[9px]" style={{ color: "#4ade8080" }}>PLN</span>
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
type LedgerEdit = { hours: string; rate: string; advance: string; site: string; dirty: boolean; saving: boolean };

function LedgerView({ base, token, t }: { base: string; token: string | null; t: (k: string, opts?: any) => string }) {
  const [records, setRecords] = React.useState<any[]>([]);
  const [liveWorkers, setLiveWorkers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [edits, setEdits] = React.useState<Record<string, LedgerEdit>>({});

  const currentMonthYear = getCurrentMonthYear();

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${base}/api/payroll/summary`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`${base}/api/payroll/workers`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([summary, workers]) => {
        if (summary.error) throw new Error(summary.error);
        setRecords(summary.records ?? []);
        setLiveWorkers(workers.workers ?? []);
        setEdits({});
      })
      .catch((e) => setError(e.message ?? "Failed to load ledger"))
      .finally(() => setLoading(false));
  }, [base, token]);

  React.useEffect(() => { load(); }, [load]);

  const getEdit = (r: any): LedgerEdit =>
    edits[r.id] ?? {
      hours: String(r.totalHours ?? ""),
      rate: String(r.hourlyRate ?? ""),
      advance: String(r.advancesDeducted ?? ""),
      site: r.siteLocation ?? "",
      dirty: false,
      saving: false,
    };

  const setField = (id: string, row: any, field: keyof LedgerEdit, val: string) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...getEdit(row), ...prev[id], [field]: val, dirty: true, saving: false },
    }));
  };

  const saveRow = async (r: any) => {
    const e = edits[r.id];
    if (!e || !e.dirty) return;
    setEdits((prev) => ({ ...prev, [r.id]: { ...e, saving: true } }));

    const hours = parseFloat(e.hours) || 0;
    const rate = parseFloat(e.rate) || 0;
    const advance = parseFloat(e.advance) || 0;
    const gross = hours * rate;
    const { total: totalDeductions } = gross > 0 ? calcDeductions(gross) : { total: 0 };
    const netto = gross - totalDeductions - advance;

    try {
      if (r._draft) {
        await fetch(`${base}/api/payroll/workers/batch`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            updates: [{
              workerId: r.workerId,
              totalHours: hours,
              hourlyNettoRate: rate,
              advancePayment: advance,
              siteLocation: e.site,
            }],
          }),
        });
        setLiveWorkers((prev) => prev.map((w) =>
          w.id === r.workerId
            ? { ...w, totalHours: hours, hourlyNettoRate: rate, advancePayment: advance, siteLocation: e.site }
            : w
        ));
      } else {
        await fetch(`${base}/api/payroll/records/${r.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ totalHours: hours, hourlyRate: rate, advancesDeducted: advance, siteLocation: e.site }),
        });
        setRecords((prev) => prev.map((rec) =>
          rec.id === r.id
            ? { ...rec, totalHours: hours, hourlyRate: rate, advancesDeducted: advance, siteLocation: e.site, grossPay: gross, zusBaseSalary: gross * SOCIAL_ZUS_RATE, finalNettoPayout: netto }
            : rec
        ));
      }
      setEdits((prev) => { const next = { ...prev }; delete next[r.id]; return next; });
    } catch {
      setEdits((prev) => ({ ...prev, [r.id]: { ...e, saving: false } }));
    }
  };

  // Build synthetic "draft" rows from live workers for the current month
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
      zusBaseSalary: (w.totalHours ?? 0) * (w.hourlyNettoRate ?? 0) * SOCIAL_ZUS_RATE,
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
      if (a._draft && !b._draft) return -1;
      if (!a._draft && b._draft) return 1;
      return (b.monthYear ?? "").localeCompare(a.monthYear ?? "");
    });

  const totalPayout = filtered.filter((r) => !r._draft).reduce((s, r) => s + (r.finalNettoPayout ?? 0), 0);

  // ── KPI aggregates ────────────────────────────────────────────────────
  const calcRow = (r: any) => {
    const h  = parseFloat(edits[r.id]?.hours ?? String(r.totalHours)) || 0;
    const rt = parseFloat(edits[r.id]?.rate  ?? String(r.hourlyRate))  || 0;
    const g  = h * rt;
    const sz = g * 0.1126;                         // 11.26% — pension 9.76% + disability 1.50%
    const hb = g - sz;                              // health base = przychód podatkowy
    const zd = hb * 0.09;
    const tb = Math.max(0, Math.round(hb * 0.80)); // taxBase = round(przychód × 80%)
    const pt = Math.max(0, Math.round(tb * 0.12 - 300));
    return { h, g, deductions: sz + zd + pt, netto: g - sz - zd - pt };
  };
  const closedRows  = filtered.filter((r) => !r._draft);
  const kpiNet      = closedRows.reduce((s, r) => s + calcRow(r).netto, 0);
  const kpiGross    = filtered.reduce((s, r) => s + calcRow(r).g, 0);
  const kpiDeduct   = filtered.reduce((s, r) => s + calcRow(r).deductions, 0);
  const kpiHours    = filtered.reduce((s, r) => s + calcRow(r).h, 0);
  const kpiWorkers  = new Set(filtered.map((r) => r.workerName)).size;

  const KpiCard = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) => (
    <div className="rounded-xl px-4 py-3.5 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">{label}</div>
      <div className="text-lg font-black tabular-nums leading-none" style={{ color: accent ?? "white" }}>{value}</div>
      {sub && <div className="text-[9px] font-mono text-gray-600">{sub}</div>}
    </div>
  );

  // ── Editable input styles ──────────────────────────────────────────────
  const editInput = (accent: string) => ({
    background: "rgba(0,0,0,0.35)",
    border: `1px solid ${accent}33`,
    borderRadius: "6px",
    color: accent,
    fontFamily: "monospace",
    fontSize: "11px",
    fontWeight: 700,
    padding: "3px 6px",
    outline: "none",
    width: "70px",
    textAlign: "right" as const,
  });
  const siteEdit = {
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
    color: "rgba(255,255,255,0.7)",
    fontFamily: "monospace",
    fontSize: "11px",
    padding: "3px 7px",
    outline: "none",
    width: "96px",
  };

  const initials = (name: string) =>
    name.split(" ").map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">

      {/* ── Title ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-black text-white uppercase tracking-wide">{t("payroll.ledger")}</h2>
        <p className="text-xs font-mono mt-0.5" style={{ color: LIME, opacity: 0.6 }}>{t("payroll.ledgerSubtitle")}</p>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="Net Payout (closed)" value={`zł${kpiNet.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub={`${closedRows.length} records`} accent={LIME} />
        <KpiCard label="Gross Billed" value={`zł${kpiGross.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="all rows" accent="#fbbf24" />
        <KpiCard label="Total Deductions" value={`zł${kpiDeduct.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="ZUS + PIT" accent="#fb923c" />
        <KpiCard label="Total Hours" value={`${kpiHours.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`} sub="all rows" accent="white" />
        <KpiCard label="Workers" value={String(kpiWorkers)} sub={draftRows.length > 0 ? `${draftRows.length} draft` : "in view"} accent="#a78bfa" />
      </div>

      {/* ── Panel ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>

        {/* Toolbar */}
        <div className="px-5 py-3.5 flex flex-wrap items-center gap-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("payroll.searchWorkers")}
              className="pl-8 pr-4 py-2 rounded-lg text-xs font-mono text-white focus:outline-none"
              style={{ background: "rgba(0,0,0,0.4)", border: `1px solid rgba(255,255,255,0.1)`, width: "220px", caretColor: LIME }}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {filtered.length > 0 && (
              <span className="text-[10px] font-black px-2 py-1 rounded-full tabular-nums"
                style={{ background: "rgba(233,255,112,0.1)", color: LIME, border: `1px solid ${LIME_BORDER}` }}>
                {filtered.length} rows
              </span>
            )}
            <button onClick={load}
              className="p-2 rounded-lg transition-colors text-gray-500 hover:text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              title="Refresh">
              <RefreshCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-500 mb-3" />
            <p className="text-xs font-mono text-gray-500">{t("payroll.loading")}</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm text-red-400 font-mono">{error}</div>
        ) : (
          <div className="eej-table-scroll overflow-x-auto">
            <table className="w-full" style={{ minWidth: "880px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {[
                    { label: "Period",           w: "100px", color: "rgba(255,255,255,0.35)" },
                    { label: "Worker",           w: "160px", color: "rgba(255,255,255,0.35)" },
                    { label: "Site",             w: "110px", color: "rgba(255,255,255,0.35)" },
                    { label: "Hours",            w: "80px",  color: "#fbbf24" },
                    { label: "Gross Rate /h",    w: "96px",  color: "#fbbf24" },
                    { label: "Deductions",       w: "160px", color: "#fb923c" },
                    { label: "Net Payout",       w: "120px", color: LIME },
                    { label: "",                 w: "48px",  color: "" },
                  ].map((c) => (
                    <th key={c.label} className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest whitespace-nowrap"
                      style={{ color: c.color, width: c.w }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-14 text-center">
                      <p className="text-sm text-gray-500 font-mono">{t("payroll.noWorkers")}</p>
                    </td>
                  </tr>
                ) : filtered.map((r, idx) => {
                  const e        = getEdit(r);
                  const hours    = parseFloat(e.hours) || 0;
                  const rate     = parseFloat(e.rate) || 0;
                  const gross    = hours * rate;
                  const socialZus  = gross * 0.1126;      // 11.26% pension + disability
                  const healthBase = gross - socialZus;   // przychód podatkowy
                  const zdrowotna  = healthBase * 0.09;
                  const kup        = healthBase * 0.20;
                  const taxBase    = Math.max(0, Math.round(healthBase - kup));
                  const pitGross   = taxBase * 0.12;
                  const pit        = Math.max(0, Math.round(pitGross - 300));
                  const netto      = gross - socialZus - zdrowotna - pit;
                  const totalDeduct = socialZus + zdrowotna + pit;
                  const isDirty   = !!edits[r.id]?.dirty;
                  const isCurrentMonth = r.monthYear === currentMonthYear;

                  return (
                    <tr key={r.id}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        background: isDirty
                          ? "rgba(233,255,112,0.03)"
                          : idx % 2 === 0 ? "rgba(255,255,255,0.008)" : "transparent",
                        borderLeft: isDirty ? `3px solid ${LIME}` : "3px solid transparent",
                        transition: "background 0.15s",
                      }}
                      className="hover:bg-white/[0.025]"
                    >
                      {/* Period */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black tabular-nums font-mono"
                            style={{ color: isCurrentMonth ? LIME : "rgba(255,255,255,0.5)" }}>
                            {r.monthYear}
                          </span>
                          <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full w-fit"
                            style={r._draft
                              ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }
                              : { background: "rgba(74,222,128,0.08)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }}>
                            {r._draft ? "DRAFT" : "CLOSED"}
                          </span>
                        </div>
                      </td>

                      {/* Worker */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-black"
                            style={{ background: "rgba(233,255,112,0.15)", color: LIME, border: `1px solid ${LIME_BORDER}` }}>
                            {initials(r.workerName ?? "?")}
                          </div>
                          <span className="text-xs font-bold text-white whitespace-nowrap leading-tight">{r.workerName}</span>
                        </div>
                      </td>

                      {/* Site */}
                      <td className="px-3 py-3">
                        <input
                          style={siteEdit}
                          value={e.site}
                          onChange={(ev) => setField(r.id, r, "site", ev.target.value)}
                          placeholder="Site…"
                        />
                      </td>

                      {/* Hours */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min={0} step={0.5}
                            style={editInput("#fbbf24")}
                            value={e.hours}
                            onChange={(ev) => setField(r.id, r, "hours", ev.target.value)}
                          />
                          <span className="text-[9px] text-gray-600 font-mono">h</span>
                        </div>
                      </td>

                      {/* Gross Rate */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-gray-600 font-mono">zł</span>
                          <input
                            type="number" min={0} step={0.01}
                            style={editInput("#fbbf24")}
                            value={e.rate}
                            onChange={(ev) => setField(r.id, r, "rate", ev.target.value)}
                          />
                          <span className="text-[9px] text-gray-600 font-mono">/h</span>
                        </div>
                      </td>

                      {/* Deductions breakdown */}
                      <td className="px-3 py-3">
                        {gross === 0 ? (
                          <span className="text-gray-700 text-xs font-mono">—</span>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[9px] text-gray-500 font-mono">ZUS 11.26%</span>
                              <span className="text-[9px] font-mono tabular-nums" style={{ color: "#fb923c" }}>−{socialZus.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[9px] text-gray-500 font-mono">Zdrow. 9%</span>
                              <span className="text-[9px] font-mono tabular-nums" style={{ color: "#fb923c" }}>−{zdrowotna.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[9px] text-gray-500 font-mono">PIT+PIT-2</span>
                              <span className="text-[9px] font-mono tabular-nums" style={{ color: "#fb923c" }}>−{pit.toFixed(2)}</span>
                            </div>
                            <div className="pt-0.5 mt-0.5 flex items-center justify-between" style={{ borderTop: "1px solid rgba(251,146,60,0.2)" }}>
                              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total</span>
                              <span className="text-[10px] font-black tabular-nums" style={{ color: "#fb923c" }}>−zł{totalDeduct.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Net Payout */}
                      <td className="px-4 py-3">
                        {gross === 0 ? (
                          <span className="text-gray-700 font-mono text-xs">—</span>
                        ) : (
                          <div className="rounded-lg px-3 py-2 text-right"
                            style={{ background: r._draft ? "rgba(233,255,112,0.05)" : "rgba(233,255,112,0.08)", border: `1px solid ${LIME_BORDER}` }}>
                            <div className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: LIME, opacity: 0.6 }}>NET PLN</div>
                            <div className="text-sm font-black tabular-nums leading-none"
                              style={{ color: r._draft ? "rgba(233,255,112,0.65)" : LIME }}>
                              {netto.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Save */}
                      <td className="px-3 py-3">
                        {isDirty && (
                          <button onClick={() => saveRow(r)} disabled={e.saving}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                            style={{ background: LIME, color: "#333" }}>
                            {e.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            {e.saving ? "" : "Save"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* ── Footer totals ─────────────────────────────────────────── */}
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: "rgba(233,255,112,0.04)", borderTop: `1px solid ${LIME_BORDER}` }}>
                    <td className="px-4 py-3">
                      <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: LIME }}>
                        {closedRows.length} closed
                        {draftRows.length > 0 && <span className="ml-1.5 text-gray-600">· {draftRows.length} draft</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Totals</td>
                    <td />
                    <td className="px-3 py-3 font-mono font-black text-xs tabular-nums" style={{ color: "#fbbf24" }}>
                      {kpiHours.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
                    </td>
                    <td />
                    <td className="px-3 py-3 font-mono font-black text-xs tabular-nums" style={{ color: "#fb923c" }}>
                      −zł{kpiDeduct.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="rounded-lg px-3 py-2 text-right"
                        style={{ background: "rgba(233,255,112,0.1)", border: `1px solid ${LIME_BORDER}` }}>
                        <div className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: LIME, opacity: 0.6 }}>TOTAL NET</div>
                        <div className="text-sm font-black tabular-nums" style={{ color: LIME }}>
                          {kpiNet.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </td>
                    <td />
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
function calcSingleZUS(grossNum: number, inclChorobowe: boolean, inclPit2 = false) {
  // Employee social ZUS
  const emerytalne_e  = grossNum * 0.0976;
  const rentowe_e     = grossNum * 0.015;
  const chorobowe_e   = inclChorobowe ? grossNum * 0.0245 : 0;
  const totalZusEmp   = emerytalne_e + rentowe_e + chorobowe_e;
  // Employer social ZUS
  const emerytalne_er = grossNum * 0.0976;
  const rentowe_er    = grossNum * 0.065;
  const wypadkowe     = grossNum * 0.0167;
  const fp            = grossNum * 0.0245;
  const fgsb          = grossNum * 0.001;
  const totalZusEr    = emerytalne_er + rentowe_er + wypadkowe + fp + fgsb;
  // Zdrowotna (health) — 9% of (gross − social ZUS)
  const zdrowotnaBase = grossNum - totalZusEmp;
  const zdrowotna     = zdrowotnaBase * 0.09;
  // PIT for zlecenie: KUP = 20% of przychód (gross − ZUS), taxBase = przychód × 80%
  // PIT-2: if filed, reduces monthly advance tax by 300 zł (kwota zmniejszająca)
  const kup       = zdrowotnaBase * 0.20;   // 20% of przychód (gross − ZUS), not of gross
  const taxBase   = Math.max(0, Math.round(zdrowotnaBase - kup));
  const pitGross  = taxBase * 0.12;
  const pit       = inclPit2 ? Math.max(0, Math.round(pitGross - 300)) : Math.round(pitGross);
  const netto     = grossNum - totalZusEmp - zdrowotna - pit;
  return { emerytalne_e, rentowe_e, chorobowe_e, totalZusEmp, emerytalne_er, rentowe_er, wypadkowe, fp, fgsb, totalZusEr, zdrowotnaBase, zdrowotna, kup, taxBase, pitGross, pit, netto };
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

/* ── Brutto → Netto quick-calculator (11.26% ZUS, no chorobowe, PIT-2 filed) ── */
function BruttoNettoCalc() {
  const [brutto, setBrutto] = React.useState("5024");
  const g = parseFloat(brutto) || 0;

  /* ── 13-step calculation (2026 Umowa Zlecenie, PIT-2 filed) ── */
  const pension    = g * 0.0976;                         // step 2
  const disability = g * 0.0150;                         // step 3
  const sickness   = 0;                                  // step 4 — chorobowe unchecked
  const totalZUS   = pension + disability + sickness;    // step 5
  const healthBase = g - totalZUS;                       // step 6
  const healthTax  = healthBase * 0.09;                  // step 7
  const kup        = healthBase * 0.20;                  // step 8
  const taxBase    = Math.round(healthBase - kup);       // step 9
  const grossTax   = taxBase * 0.12;                     // step 10
  const pitReduc   = 300;                                // step 11 — PIT-2 (1 employer)
  const incomeTax  = Math.max(0, Math.round(grossTax - pitReduc)); // step 12
  const netto      = g - totalZUS - healthTax - incomeTax;         // step 13

  type RowType = "base" | "deduct" | "info" | "subtotal" | "result";
  const Step = ({
    n, desc, formula, amount, type = "base",
  }: { n: number; desc: string; formula: string; amount: number; type?: RowType }) => {
    const isDeduct  = type === "deduct";
    const isResult  = type === "result";
    const isSubtotal = type === "subtotal";
    const isInfo    = type === "info";
    const amtColor  = isResult ? LIME : isDeduct ? "#f87171" : isInfo ? "#94a3b8" : isSubtotal ? "#fbbf24" : "rgba(255,255,255,0.85)";
    const sign      = isDeduct ? "−" : isResult || isSubtotal ? "" : "";
    return (
      <div className={`grid grid-cols-[28px_1fr_auto] gap-x-3 items-start py-2 ${isResult ? "" : "border-b"}`}
           style={{ borderColor: "rgba(255,255,255,0.06)", background: isResult ? "rgba(233,255,112,0.05)" : "transparent", borderRadius: isResult ? "8px" : 0, padding: isResult ? "10px 8px" : undefined }}>
        {/* Step number */}
        <span className="text-[10px] font-black tabular-nums mt-0.5 text-center rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0"
              style={{ background: isResult ? LIME : "rgba(255,255,255,0.07)", color: isResult ? "#333" : "rgba(255,255,255,0.35)", fontSize: "9px" }}>
          {n}
        </span>
        {/* Description + formula */}
        <div className="min-w-0">
          <div className={`text-xs font-bold leading-tight ${isResult ? "text-white" : "text-gray-200"}`}>{desc}</div>
          <div className="text-[10px] font-mono text-gray-500 mt-0.5 truncate">{formula}</div>
        </div>
        {/* Amount */}
        <span className={`font-mono font-black tabular-nums text-right whitespace-nowrap ${isResult ? "text-base" : "text-xs"}`}
              style={{ color: amtColor }}>
          {isDeduct ? "− " : ""}{sign}zł {Math.abs(amount).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
    );
  };

  return (
    <div className="glass-panel rounded-2xl p-6" style={{ border: `1.5px solid ${LIME_BORDER}` }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2 flex-shrink-0" style={{ background: "rgba(233,255,112,0.12)" }}>
            <Calculator className="w-4 h-4" style={{ color: LIME }} />
          </div>
          <div>
            <div className="text-sm font-black uppercase tracking-widest text-white">Brutto → Netto Calculator</div>
            <div className="text-[10px] font-mono mt-0.5" style={{ color: LIME, opacity: 0.7 }}>
              Umowa Zlecenie 2026 · No Chorobowe · PIT-2 Filed (1 Employer)
            </div>
          </div>
        </div>
        {/* Live netto badge */}
        <div className="text-right flex-shrink-0">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">Net Take-Home</div>
          <div className="text-2xl font-black tabular-nums" style={{ color: LIME }}>
            zł {netto.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Gross input */}
      <div className="mb-5">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
          Gross Amount (Brutto) — zł
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-black" style={{ color: LIME }}>zł</span>
          <input
            type="number" value={brutto} onChange={(e) => setBrutto(e.target.value)} min={0}
            className="w-full pl-8 pr-4 py-3 rounded-xl bg-slate-900 text-white text-xl font-black tabular-nums focus:outline-none"
            style={{ border: `1.5px solid ${LIME_BORDER}`, caretColor: LIME }}
          />
        </div>
      </div>

      {/* 13-step breakdown */}
      <div className="rounded-xl p-4 space-y-0" style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="grid grid-cols-[28px_1fr_auto] gap-x-3 pb-2 mb-1 border-b" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
          <span className="text-[9px] font-black uppercase text-gray-600">#</span>
          <span className="text-[9px] font-black uppercase text-gray-600">Description</span>
          <span className="text-[9px] font-black uppercase text-gray-600 text-right">Amount (PLN)</span>
        </div>

        <Step n={1}  desc="Contract Gross (Brutto)"
              formula="Starting base amount"
              amount={g} />
        <Step n={2}  desc="Pension Contribution (Emerytalna)"
              formula={`9.76% of Gross (${g.toFixed(0)} × 0.0976)`}
              amount={pension} type="deduct" />
        <Step n={3}  desc="Disability Contribution (Rentowa)"
              formula={`1.50% of Gross (${g.toFixed(0)} × 0.0150)`}
              amount={disability} type="deduct" />
        <Step n={4}  desc="Sickness Contribution (Chorobowa)"
              formula="0.00% — unchecked / not applicable"
              amount={sickness} type="info" />
        <Step n={5}  desc="Total Worker ZUS Deducted"
              formula="Pension + Disability + Sickness"
              amount={totalZUS} type="subtotal" />
        <Step n={6}  desc="Base for Health Tax"
              formula={`Gross − Total Worker ZUS (${g.toFixed(2)} − ${totalZUS.toFixed(2)})`}
              amount={healthBase} />
        <Step n={7}  desc="Health Insurance (Zdrowotna)"
              formula={`9% of Health Base (${healthBase.toFixed(2)} × 0.09)`}
              amount={healthTax} type="deduct" />
        <Step n={8}  desc="Tax Deductible Costs (KUP)"
              formula={`20% of Health Base (${healthBase.toFixed(2)} × 0.20)`}
              amount={kup} type="info" />
        <Step n={9}  desc="Taxable Base (Podstawa Opodatkowania)"
              formula={`round(Health Base − KUP) = round(${(healthBase - kup).toFixed(2)})`}
              amount={taxBase} />
        <Step n={10} desc="Gross Income Tax"
              formula={`12% of Taxable Base (${taxBase} × 0.12)`}
              amount={grossTax} />
        <Step n={11} desc="PIT Reduction (Kwota Zmniejszająca)"
              formula="1 Employer Selected — PIT-2 filed"
              amount={pitReduc} type="deduct" />
        <Step n={12} desc="Final Income Tax (Zaliczka PIT)"
              formula={`round(Gross Tax − Reduction) = round(${grossTax.toFixed(2)} − ${pitReduc})`}
              amount={incomeTax} type="deduct" />

        <div className="pt-1">
          <Step n={13} desc="Final Netto Payout"
                formula="Gross − ZUS (5) − Health (7) − Income Tax (12)"
                amount={netto} type="result" />
        </div>
      </div>

      {/* Footer badge */}
      <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-gray-500">
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
              style={{ background: "rgba(233,255,112,0.1)", color: LIME }}>2026</span>
        Min. wage reference: 160h × zł 31.40 = zł 5,024 brutto → zł 3,929.05 netto
      </div>
    </div>
  );
}

function ZUSCalculatorPanel({ t }: { t: (k: string, opts?: any) => string }) {
  const [zusTab, setZusTab]             = React.useState<"single" | "dual">("single");

  /* single contract state */
  const [gross, setGross]               = React.useState("5024");
  const [inclChorob, setInclChorob]     = React.useState(false);
  const [inclPit2, setInclPit2]         = React.useState(true);

  /* dual contract state */
  const [gross1, setGross1]             = React.useState("5024");
  const [inclChorob1, setInclChorob1]   = React.useState(false);
  const [rate2, setRate2]               = React.useState("25");
  const [hours2, setHours2]             = React.useState("80");
  const [inclChorob2, setInclChorob2]   = React.useState(false);

  /* ── SINGLE calculations ─────────────────────────────────────────── */
  const s = calcSingleZUS(parseFloat(gross) || 0, inclChorob, inclPit2);

  /* ── DUAL calculations ───────────────────────────────────────────── */
  const MIN_WAGE_2026 = 5024;
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
  // PIT — KUP 20% applies, but NO 300 zł PIT-2 relief at Company 2 (already used at Company 1)
  const kup2      = zdBase2 * 0.20;
  const taxBase2  = Math.max(0, Math.round(zdBase2 - kup2));
  const pit2      = Math.round(taxBase2 * 0.12);
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
      {/* ════ BRUTTO → NETTO QUICK CALCULATOR ════ */}
      <BruttoNettoCalc />

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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">{t("payroll.zusChorobowe")}</label>
                <button onClick={() => setInclChorob((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-xs font-black uppercase tracking-wide"
                  style={inclChorob ? { background: "rgba(233,255,112,0.12)", borderColor: LIME_BORDER, color: LIME } : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
                  {inclChorob ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {inclChorob ? t("payroll.zusIncluded") : t("payroll.zusExcluded")}
                </button>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">PIT-2 Filed</label>
                <button onClick={() => setInclPit2((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-xs font-black uppercase tracking-wide"
                  style={inclPit2 ? { background: "rgba(233,255,112,0.12)", borderColor: LIME_BORDER, color: LIME } : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
                  {inclPit2 ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {inclPit2 ? "−300 zł/mo" : "No reduction"}
                </button>
              </div>
            </div>
            <div className="rounded-xl p-4 space-y-1" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Employee Deductions (Zlecenia)</div>
              <CalcRow label="Emerytalne" sub="9.76%" value={`- zł${s.emerytalne_e.toFixed(2)}`} />
              <CalcRow label="Rentowe" sub="1.50%" value={`- zł${s.rentowe_e.toFixed(2)}`} />
              {inclChorob && <CalcRow label="Chorobowe" sub="2.45%" value={`- zł${s.chorobowe_e.toFixed(2)}`} />}
              <CalcRow label="Zdrowotna" sub={`9% × zł${s.zdrowotnaBase.toFixed(2)}`} value={`- zł${s.zdrowotna.toFixed(2)}`} />
              <CalcRow label="KUP (zlecenie)" sub={`20% × przychód zł${s.zdrowotnaBase.toFixed(2)} = zł${s.kup.toFixed(2)}`} value="tax deduction" />
              <CalcRow label="PIT-12 advance" sub={inclPit2 ? `(zł${s.pitGross.toFixed(2)} − PIT-2 300 zł)` : `12% × zł${s.taxBase.toFixed(2)}`} value={`- zł${s.pit.toFixed(2)}`} />
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
