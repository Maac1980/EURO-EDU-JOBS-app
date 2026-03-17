import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { Printer, Loader2, AlertTriangle, FileText, Check } from "lucide-react";
import { SettlementPrintModal } from "./SettlementPrintModal";

const LIME = "#E9FF70";
const LIME_BORDER = "rgba(233,255,112,0.25)";
const ZUS_RATE = 0.1126;

export interface PayrollRecord {
  id: string;
  workerId: string;
  workerName: string;
  monthYear: string;
  totalHours: number;
  hourlyRate: number;
  advancesDeducted: number;
  penaltiesDeducted: number;
  grossPay: number;
  finalNettoPayout: number;
  zusBaseSalary: number;
  siteLocation: string;
  createdAt: string;
}

type RowEdit = { hours: string; rate: string; advance: string; dirty: boolean; saving: boolean };

function formatMonthYear(my: string): string {
  const [y, m] = my.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pl-PL", { year: "numeric", month: "long" });
}

interface PayrollHistoryTabProps {
  workerId: string;
  workerName: string;
}

export function PayrollHistoryTab({ workerId, workerName }: PayrollHistoryTabProps) {
  const { t } = useTranslation();
  const { token } = useAuth();

  const [history, setHistory] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const load = useCallback(() => {
    if (!workerId) return;
    setLoading(true);
    setError(null);
    setEdits({});
    fetch(`${base}/api/payroll/history/${workerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setHistory(d.history ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load payroll history"))
      .finally(() => setLoading(false));
  }, [workerId, base, token]);

  useEffect(() => { load(); }, [load]);

  const getEdit = (r: PayrollRecord): RowEdit =>
    edits[r.id] ?? {
      hours: String(r.totalHours),
      rate: String(r.hourlyRate),
      advance: String(r.advancesDeducted),
      dirty: false,
      saving: false,
    };

  const setField = (id: string, rec: PayrollRecord, field: keyof RowEdit, val: string) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...getEdit(rec), ...prev[id], [field]: val, dirty: true, saving: false },
    }));
  };

  const saveRow = async (r: PayrollRecord) => {
    const e = edits[r.id];
    if (!e?.dirty) return;
    setEdits((prev) => ({ ...prev, [r.id]: { ...e, saving: true } }));

    const hours = parseFloat(e.hours) || 0;
    const rate = parseFloat(e.rate) || 0;
    const advance = parseFloat(e.advance) || 0;
    const gross = hours * rate;
    const zus = gross * ZUS_RATE;
    const healthBase = gross - zus;
    const zdrowotna = healthBase * 0.09;
    const taxBase = Math.max(0, Math.round(healthBase * 0.80));
    const pit = Math.max(0, Math.round(taxBase * 0.12 - 300));
    const netto = gross - zus - zdrowotna - pit - advance - (r.penaltiesDeducted ?? 0);

    try {
      await fetch(`${base}/api/payroll/records/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ totalHours: hours, hourlyRate: rate, advancesDeducted: advance }),
      });
      setHistory((prev) => prev.map((rec) =>
        rec.id === r.id
          ? { ...rec, totalHours: hours, hourlyRate: rate, advancesDeducted: advance, grossPay: gross, zusBaseSalary: zus, finalNettoPayout: netto }
          : rec
      ));
      setEdits((prev) => { const next = { ...prev }; delete next[r.id]; return next; });
    } catch {
      setEdits((prev) => ({ ...prev, [r.id]: { ...e, saving: false } }));
    }
  };

  const calcNetto = (r: PayrollRecord) => {
    const e = edits[r.id];
    if (!e) return r.finalNettoPayout;
    const h = parseFloat(e.hours) || 0;
    const rt = parseFloat(e.rate) || 0;
    const adv = parseFloat(e.advance) || 0;
    const gross = h * rt;
    const zus = gross * ZUS_RATE;
    const healthBase = gross - zus;
    const zdrowotna = healthBase * 0.09;
    const taxBase = Math.max(0, Math.round(healthBase * 0.80));
    const pit = Math.max(0, Math.round(taxBase * 0.12 - 300));
    return gross - zus - zdrowotna - pit - adv - (r.penaltiesDeducted ?? 0);
  };

  const totalHours = history.reduce((s, r) => s + (parseFloat(edits[r.id]?.hours ?? String(r.totalHours)) || 0), 0);
  const totalNetto = history.reduce((s, r) => s + calcNetto(r), 0);
  const totalAdvances = history.reduce((s, r) => s + (parseFloat(edits[r.id]?.advance ?? String(r.advancesDeducted)) || 0), 0);

  const inputCls = "bg-slate-900 text-white rounded px-1.5 py-1 text-xs font-mono focus:outline-none tabular-nums";
  const inputStyle = { border: `1px solid ${LIME_BORDER}`, width: "68px" };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: LIME }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-destructive/40 bg-destructive/10 m-4">
        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
        <p className="text-sm text-destructive font-mono">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 space-y-4">
        {/* Stats */}
        {history.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t("payroll.history.months"), value: history.length },
              { label: t("payroll.history.totalHours"), value: `${totalHours.toFixed(1)}h` },
              { label: t("payroll.history.totalNetto"), value: `zł${totalNetto.toFixed(2)}` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-3 text-center border" style={{ background: "rgba(233,255,112,0.05)", borderColor: LIME_BORDER }}>
                <p className="text-base font-black" style={{ color: LIME }}>{s.value}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Print button */}
        {history.length > 0 && (
          <button
            onClick={() => setPrintOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all hover:brightness-110"
            style={{ background: LIME, color: "#333333" }}
          >
            <Printer className="w-4 h-4" />
            {t("payroll.history.printSettlement")}
          </button>
        )}

        {/* History table */}
        {history.length === 0 ? (
          <div className="py-10 text-center">
            <FileText className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-mono">{t("payroll.history.empty")}</p>
            <p className="text-[10px] text-gray-600 font-mono mt-1">{t("payroll.history.emptyNote")}</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: LIME_BORDER }}>
            <table className="w-full text-xs" style={{ minWidth: "380px" }}>
              <thead>
                <tr style={{ background: "rgba(233,255,112,0.06)", borderBottom: `1px solid ${LIME_BORDER}` }}>
                  {[t("payroll.history.month"), t("payroll.history.hours"), t("payroll.history.rate"), t("payroll.history.advance"), t("payroll.history.netto"), ""].map((h) => (
                    <th key={h} className="px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-left" style={{ color: "rgba(255,255,255,0.4)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((r) => {
                  const e = getEdit(r);
                  const isDirty = !!edits[r.id]?.dirty;
                  const netto = calcNetto(r);

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-white/[0.02] transition-colors"
                      style={{
                        background: isDirty ? "rgba(233,255,112,0.04)" : undefined,
                        outline: isDirty ? `1px solid ${LIME_BORDER}` : undefined,
                      }}
                    >
                      <td className="px-2 py-2 font-mono font-bold text-white whitespace-nowrap">{formatMonthYear(r.monthYear)}</td>

                      {/* Hours — editable */}
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          className={inputCls}
                          style={inputStyle}
                          value={e.hours}
                          onChange={(ev) => setField(r.id, r, "hours", ev.target.value)}
                        />
                      </td>

                      {/* Rate — editable */}
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-0.5">
                          <span className="text-[9px] text-gray-600">zł</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className={inputCls}
                            style={inputStyle}
                            value={e.rate}
                            onChange={(ev) => setField(r.id, r, "rate", ev.target.value)}
                          />
                          <span className="text-[9px] text-gray-600">/h</span>
                        </div>
                      </td>

                      {/* Advance — editable */}
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className={inputCls}
                          style={inputStyle}
                          value={e.advance}
                          onChange={(ev) => setField(r.id, r, "advance", ev.target.value)}
                        />
                        {r.penaltiesDeducted > 0 && (
                          <div className="text-[8px] text-red-400 mt-0.5">−zł{r.penaltiesDeducted.toFixed(2)} pen.</div>
                        )}
                      </td>

                      {/* Netto — recalculated live */}
                      <td className="px-2 py-2 font-mono font-black" style={{ color: netto >= 0 ? LIME : "#ef4444" }}>
                        zł{netto.toFixed(2)}
                      </td>

                      {/* Save button */}
                      <td className="px-2 py-2">
                        {isDirty && (
                          <button
                            onClick={() => saveRow(r)}
                            disabled={e.saving}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-black transition-all"
                            style={{ background: LIME, color: "#333" }}
                            title="Save"
                          >
                            {e.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer total */}
              <tfoot>
                <tr style={{ background: "rgba(233,255,112,0.06)", borderTop: `1px solid ${LIME_BORDER}` }}>
                  <td className="px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-500">{t("payroll.totals")}</td>
                  <td className="px-2 py-2.5 font-mono text-gray-300">{totalHours.toFixed(1)}h</td>
                  <td className="px-2 py-2.5" />
                  <td className="px-2 py-2.5 font-mono text-gray-500">zł{totalAdvances.toFixed(2)}</td>
                  <td className="px-2 py-2.5 font-mono font-black" style={{ color: LIME }}>zł{totalNetto.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <SettlementPrintModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        workerName={workerName}
        history={history}
      />
    </>
  );
}
