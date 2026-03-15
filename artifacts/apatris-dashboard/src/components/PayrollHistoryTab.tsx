import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { Printer, Loader2, AlertTriangle, FileText } from "lucide-react";
import { SettlementPrintModal } from "./SettlementPrintModal";

const LIME = "#E9FF70";
const LIME_BORDER = "rgba(233,255,112,0.25)";

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

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => {
    if (!workerId) return;
    setLoading(true);
    setError(null);
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

  const totalHours = history.reduce((s, r) => s + r.totalHours, 0);
  const totalNetto = history.reduce((s, r) => s + r.finalNettoPayout, 0);
  const totalAdvances = history.reduce((s, r) => s + r.advancesDeducted, 0);

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
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "rgba(233,255,112,0.06)", borderBottom: `1px solid ${LIME_BORDER}` }}>
                  {[t("payroll.history.month"), t("payroll.history.hours"), t("payroll.history.rate"), t("payroll.history.advance"), t("payroll.history.netto")].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-left" style={{ color: "rgba(255,255,255,0.4)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((r) => (
                  <tr key={r.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-bold text-white">{formatMonthYear(r.monthYear)}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-300">{r.totalHours.toFixed(1)}h</td>
                    <td className="px-3 py-2.5 font-mono text-gray-400">zł{r.hourlyRate.toFixed(2)}/h</td>
                    <td className="px-3 py-2.5 font-mono text-gray-500">
                      {r.advancesDeducted > 0 ? `−zł${r.advancesDeducted.toFixed(2)}` : "—"}
                      {r.penaltiesDeducted > 0 && <span className="text-red-400 ml-1">{` −zł${r.penaltiesDeducted.toFixed(2)}`}</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-black" style={{ color: r.finalNettoPayout >= 0 ? LIME : "#ef4444" }}>
                      zł{r.finalNettoPayout.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Footer total */}
              <tfoot>
                <tr style={{ background: "rgba(233,255,112,0.06)", borderTop: `1px solid ${LIME_BORDER}` }}>
                  <td className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-500">{t("payroll.totals")}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-300">{totalHours.toFixed(1)}h</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 font-mono text-gray-500">zł{totalAdvances.toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono font-black" style={{ color: LIME }}>zł{totalNetto.toFixed(2)}</td>
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
