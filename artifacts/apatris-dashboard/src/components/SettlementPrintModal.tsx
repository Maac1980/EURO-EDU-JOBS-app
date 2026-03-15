import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Printer } from "lucide-react";
import type { PayrollRecord } from "./PayrollHistoryTab";

const LIME = "#E9FF70";
const LIME_BORDER = "rgba(233,255,112,0.25)";

interface SettlementPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  workerName: string;
  history: PayrollRecord[];
}

function formatMonthYear(my: string): string {
  const [y, m] = my.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pl-PL", { year: "numeric", month: "long" });
}

export function SettlementPrintModal({ isOpen, onClose, workerName, history }: SettlementPrintModalProps) {
  const { t } = useTranslation();
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const totalHours = history.reduce((s, r) => s + r.totalHours, 0);
  const totalGross = history.reduce((s, r) => s + r.grossPay, 0);
  const totalAdvances = history.reduce((s, r) => s + r.advancesDeducted, 0);
  const totalPenalties = history.reduce((s, r) => s + r.penaltiesDeducted, 0);
  const totalNetto = history.reduce((s, r) => s + r.finalNettoPayout, 0);
  const siteLocation = history[0]?.siteLocation ?? "—";
  const printedOn = new Date().toLocaleDateString("pl-PL", { year: "numeric", month: "long", day: "numeric" });

  const handlePrint = () => {
    const content = printRef.current?.innerHTML ?? "";
    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <title>Rozliczenie Końcowe — ${workerName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; background: white; }
    @page { size: A4 portrait; margin: 20mm 18mm 24mm 18mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    .header { border-bottom: 3px solid #333333; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .brand { font-size: 22pt; font-weight: 900; letter-spacing: -0.5px; color: #333333; }
    .brand span { background: #E9FF70; padding: 1px 8px; border-radius: 4px; }
    .title-block { text-align: right; }
    .doc-title { font-size: 13pt; font-weight: 700; color: #333; text-transform: uppercase; letter-spacing: 1px; }
    .doc-sub { font-size: 9pt; color: #666; margin-top: 3px; font-style: italic; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .meta-box { border: 1.5px solid #e0e0e0; border-radius: 8px; padding: 12px 14px; }
    .meta-label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
    .meta-value { font-size: 12pt; font-weight: 700; color: #1a1a1a; }
    .meta-sub { font-size: 9pt; color: #555; margin-top: 2px; }
    .section-title { font-size: 8pt; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #555; margin-bottom: 10px; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th { background: #f5f5f5; border: 1px solid #ddd; padding: 7px 10px; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #555; font-weight: 700; }
    td { border: 1px solid #e8e8e8; padding: 7px 10px; color: #1a1a1a; }
    tr:nth-child(even) td { background: #fafafa; }
    .num { text-align: right; font-variant-numeric: tabular-nums; font-family: monospace; }
    .highlight { background: #E9FF70 !important; font-weight: 700; }
    .total-row td { background: #333333 !important; color: white !important; font-weight: 700; border-color: #222 !important; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 16px 0; }
    .sum-box { border: 1.5px solid #e0e0e0; border-radius: 8px; padding: 12px; text-align: center; }
    .sum-val { font-size: 14pt; font-weight: 900; color: #1a1a1a; font-variant-numeric: tabular-nums; font-family: monospace; }
    .sum-label { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 3px; }
    .final-box { border: 3px solid #333; border-radius: 10px; padding: 16px 20px; margin: 20px 0 24px; display: flex; justify-content: space-between; align-items: center; }
    .final-label { font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .final-val { font-size: 22pt; font-weight: 900; font-family: monospace; color: #333; }
    .sig-block { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .sig-line { border-top: 1.5px solid #333; padding-top: 8px; }
    .sig-label { font-size: 9pt; color: #555; }
    .sig-sub { font-size: 8pt; color: #999; margin-top: 2px; font-style: italic; }
    .footer { margin-top: 28px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 8pt; color: #999; display: flex; justify-content: space-between; }
    .legal-note { font-size: 8pt; color: #aaa; margin-top: 8px; font-style: italic; }
  </style>
</head>
<body>
${content}
</body>
</html>`);
    win.document.close();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border shadow-2xl flex flex-col" style={{ background: "#0f1218", borderColor: LIME_BORDER }}>
        {/* Modal header */}
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: LIME_BORDER, background: "rgba(233,255,112,0.04)" }}>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wide">{t("payroll.settlement.title")}</h3>
            <p className="text-[10px] font-mono mt-0.5 text-gray-500">{workerName} · {history.length} {t("payroll.history.months")}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wide transition-all hover:opacity-90"
              style={{ background: LIME, color: "#333333" }}
            >
              <Printer className="w-4 h-4" />
              {t("payroll.settlement.print")}
            </button>
            <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Document preview (scrollable) */}
        <div className="overflow-y-auto flex-1 p-6">
          <div
            ref={printRef}
            className="bg-white rounded-xl text-gray-900 shadow-inner"
            style={{ padding: "32px", fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: "11pt" }}
          >
            {/* Header */}
            <div className="header">
              <div className="brand">EURO EDU <span>JOBS</span></div>
              <div className="title-block">
                <div className="doc-title">Rozliczenie Końcowe</div>
                <div className="doc-sub">Final Settlement Statement · Konfidencjalny</div>
              </div>
            </div>

            {/* Meta grid */}
            <div className="meta-grid">
              <div className="meta-box">
                <div className="meta-label">Pracownik / Worker</div>
                <div className="meta-value">{workerName}</div>
                <div className="meta-sub">Miejsce pracy: {siteLocation}</div>
              </div>
              <div className="meta-box">
                <div className="meta-label">Data sporządzenia / Date Issued</div>
                <div className="meta-value">{printedOn}</div>
                <div className="meta-sub">Okres: {history.length > 0 ? `${formatMonthYear(history[history.length - 1].monthYear)} – ${formatMonthYear(history[0].monthYear)}` : "—"}</div>
              </div>
            </div>

            {/* Summary boxes */}
            <div className="section-title">Podsumowanie / Summary</div>
            <div className="summary-grid">
              <div className="sum-box">
                <div className="sum-val">{totalHours.toFixed(1)}h</div>
                <div className="sum-label">Łączne godziny</div>
              </div>
              <div className="sum-box">
                <div className="sum-val">zł{totalGross.toFixed(2)}</div>
                <div className="sum-label">Brutto łącznie</div>
              </div>
              <div className="sum-box">
                <div className="sum-val">zł{(totalAdvances + totalPenalties).toFixed(2)}</div>
                <div className="sum-label">Potrącenia łącznie</div>
              </div>
            </div>

            {/* Final netto */}
            <div className="final-box">
              <div className="final-label">Do wypłaty netto (łącznie) / Total Net Payout</div>
              <div className="final-val">zł{totalNetto.toFixed(2)}</div>
            </div>

            {/* Monthly breakdown table */}
            <div className="section-title">Miesięczne rozliczenia / Monthly Breakdown</div>
            <table>
              <thead>
                <tr>
                  <th>Miesiąc</th>
                  <th className="num">Godziny</th>
                  <th className="num">Stawka</th>
                  <th className="num">Brutto</th>
                  <th className="num">Zaliczki</th>
                  <th className="num">Kary</th>
                  <th className="num">Netto</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{formatMonthYear(r.monthYear)}</td>
                    <td className="num">{r.totalHours.toFixed(1)}h</td>
                    <td className="num">zł{r.hourlyRate.toFixed(2)}/h</td>
                    <td className="num">zł{r.grossPay.toFixed(2)}</td>
                    <td className="num">{r.advancesDeducted > 0 ? `zł${r.advancesDeducted.toFixed(2)}` : "—"}</td>
                    <td className="num">{r.penaltiesDeducted > 0 ? `zł${r.penaltiesDeducted.toFixed(2)}` : "—"}</td>
                    <td className="num highlight">zł{r.finalNettoPayout.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tbody>
                <tr className="total-row">
                  <td style={{ color: "white", fontWeight: 700 }}>RAZEM / TOTAL</td>
                  <td className="num" style={{ color: "white" }}>{totalHours.toFixed(1)}h</td>
                  <td></td>
                  <td className="num" style={{ color: "white" }}>zł{totalGross.toFixed(2)}</td>
                  <td className="num" style={{ color: "white" }}>zł{totalAdvances.toFixed(2)}</td>
                  <td className="num" style={{ color: "white" }}>zł{totalPenalties.toFixed(2)}</td>
                  <td className="num" style={{ color: "#E9FF70" }}>zł{totalNetto.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            {/* ZUS note */}
            <div className="legal-note" style={{ marginTop: "12px" }}>
              Podstawa wymiaru składek ZUS (suma brutto): zł{totalGross.toFixed(2)} · Dokument sporządzony przez EURO EDU JOBS zgodnie z obowiązującymi przepisami prawa pracy.
            </div>

            {/* Signature block */}
            <div className="sig-block">
              <div>
                <div className="sig-line">
                  <div className="sig-label">Podpis pracownika / Worker Signature</div>
                  <div className="sig-sub">{workerName}</div>
                </div>
              </div>
              <div>
                <div className="sig-line">
                  <div className="sig-label">Podpis pracodawcy / Employer Signature</div>
                  <div className="sig-sub">EURO EDU JOBS · Authorized Representative</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="footer">
              <span>EURO EDU JOBS · International Recruitment &amp; Compliance Portal</span>
              <span>Wydrukowano: {printedOn}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
