import React, { useState } from "react";
import { Printer, X, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";

interface PrintQRSheetProps {
  workers: any[];
}

export function PrintQRSheet({ workers }: PrintQRSheetProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string>("__all__");

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const origin = window.location.origin;

  const sites = Array.from(
    new Set(
      workers
        .map((w) => (w.siteLocation && w.siteLocation !== "Available" ? w.siteLocation : null))
        .filter(Boolean) as string[]
    )
  ).sort();

  const filtered =
    selectedSite === "__all__"
      ? workers
      : selectedSite === "__bench__"
      ? workers.filter((w) => !w.siteLocation || w.siteLocation === "Available")
      : workers.filter((w) => w.siteLocation === selectedSite);

  const handlePrint = () => {
    const printContent = document.getElementById("eej-qr-print-content");
    if (!printContent) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>EEJ QR Sheet — ${selectedSite === "__all__" ? "All Workers" : selectedSite}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; background: #fff; color: #222; padding: 24px; }
          h1 { font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
          .subtitle { font-size: 11px; color: #888; margin-bottom: 20px; font-family: monospace; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
          .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; page-break-inside: avoid; }
          .card svg { display: block; margin: 0 auto 8px; }
          .name { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
          .meta { font-size: 9px; color: #888; font-family: monospace; margin-top: 2px; }
          .badge { display: inline-block; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; padding: 1px 6px; border-radius: 10px; margin-top: 4px; }
          .badge-green { background: #dcfce7; color: #16a34a; }
          .badge-yellow { background: #fef9c3; color: #a16207; }
          .badge-red { background: #fee2e2; color: #dc2626; }
          @media print { body { padding: 12px; } .grid { gap: 10px; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <h1>EURO EDU JOBS — QR Sheet</h1>
        <div class="subtitle">Site: ${selectedSite === "__all__" ? "All Workers" : selectedSite === "__bench__" ? "Bench" : selectedSite} · Generated: ${new Date().toLocaleDateString("pl-PL")}</div>
        ${printContent.innerHTML}
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all hover:opacity-90 whitespace-nowrap"
        style={{ background: "rgba(233,255,112,0.12)", color: "#E9FF70", border: "1px solid rgba(233,255,112,0.25)" }}
      >
        <Printer className="w-3.5 h-3.5" />
        Print QR Sheet
      </button>

      {open && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            className="relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col"
            style={{ background: "#1a1a1a", border: "1px solid rgba(233,255,112,0.2)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-3">
                <QrCode className="w-4 h-4" style={{ color: "#E9FF70" }} />
                <span className="text-sm font-black uppercase tracking-widest text-white">Print QR Sheet</span>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            {/* Controls */}
            <div className="px-5 py-3 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-black/30 border text-white focus:outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)" }}
              >
                <option value="__all__">{t("qr.allWorkers", { count: workers.length })}</option>
                <option value="__bench__">{t("qr.bench")}</option>
                {sites.map((s) => (
                  <option key={s} value={s}>{s} ({workers.filter((w) => w.siteLocation === s).length})</option>
                ))}
              </select>
              <button
                onClick={handlePrint}
                disabled={filtered.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40"
                style={{ background: "#E9FF70", color: "#333333" }}
              >
                <Printer className="w-3.5 h-3.5" />
                {t("qr.print", { count: filtered.length })}
              </button>
            </div>

            {/* Preview grid */}
            <div className="overflow-y-auto flex-1 p-5">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-xs font-mono text-white/30">{t("qr.noWorkers")}</div>
              ) : (
                <div id="eej-qr-print-content">
                  <div className="grid grid-cols-4 gap-3">
                    {filtered.map((w) => {
                      const url = `${origin}${base}/?worker=${w.id}`;
                      const st = w.complianceStatus;
                      const badgeClass = st === "compliant" ? "badge-green" : st === "warning" ? "badge-yellow" : "badge-red";
                      const badgeLabel = st === "compliant" ? "OK" : st === "warning" ? "WARN" : "EXP";
                      return (
                        <div
                          key={w.id}
                          className="rounded-xl p-3 text-center"
                          style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)" }}
                        >
                          <div className="flex justify-center mb-2">
                            <div className="p-1.5 rounded-lg bg-white">
                              <QRCodeSVG value={url} size={80} bgColor="#fff" fgColor="#111" level="M" />
                            </div>
                          </div>
                          <p className="text-[10px] font-black text-white uppercase leading-tight">{w.name}</p>
                          <p className="text-[9px] font-mono text-white/40 mt-0.5 truncate">{w.specialization || "—"}</p>
                          <span className={`inline-block mt-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full class ${badgeClass}`}
                            style={{
                              background: st === "compliant" ? "rgba(74,222,128,0.15)" : st === "warning" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                              color: st === "compliant" ? "#4ade80" : st === "warning" ? "#f59e0b" : "#ef4444"
                            }}
                          >
                            {badgeLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
