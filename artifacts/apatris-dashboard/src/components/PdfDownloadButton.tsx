import React, { useRef, useState } from "react";
import { FileDown, ChevronDown, Building2, Users, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PdfDownloadButtonProps {
  sites: string[];
}

export function PdfDownloadButton({ sites }: PdfDownloadButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const download = async (site?: string) => {
    setOpen(false);
    setDownloading(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const url = site
        ? `${base}/api/compliance/report/pdf?site=${encodeURIComponent(site)}`
        : `${base}/api/compliance/report/pdf`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `EEJ_Compliance_${site ? site.replace(/\s+/g, "_") : "All"}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error("PDF download failed", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="relative" ref={dropRef}>
      <div className="flex items-stretch rounded-xl overflow-hidden border" style={{ borderColor: "rgba(233,255,112,0.35)" }}>
        {/* Main download button */}
        <button
          onClick={() => download()}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold uppercase tracking-wide transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: "rgba(233,255,112,0.08)", color: "#E9FF70" }}
          title={t("pdf.downloadAll")}
        >
          {downloading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <FileDown className="w-4 h-4" />
          }
          <span className="hidden sm:inline">{downloading ? t("pdf.generating") : t("pdf.download")}</span>
        </button>

        {/* Site filter dropdown toggle */}
        {sites.length > 0 && (
          <button
            onClick={() => setOpen((o) => !o)}
            disabled={downloading}
            className="flex items-center px-2 py-2.5 transition-all hover:opacity-90 disabled:opacity-50 border-l"
            style={{ background: "rgba(233,255,112,0.08)", color: "#E9FF70", borderColor: "rgba(233,255,112,0.2)" }}
            title={t("pdf.bySite")}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border shadow-2xl z-50 overflow-hidden"
          style={{ background: "#1e2130", borderColor: "rgba(233,255,112,0.2)" }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t("pdf.chooseSite")}</p>
          </div>

          {/* All workers option */}
          <button
            onClick={() => download()}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/5 transition-colors"
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(233,255,112,0.12)" }}>
              <Users className="w-3.5 h-3.5" style={{ color: "#E9FF70" }} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{t("pdf.allWorkers")}</p>
              <p className="text-[10px] font-mono text-gray-500">{t("pdf.fullReport")}</p>
            </div>
          </button>

          <div className="mx-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }} />

          {/* Per-site options */}
          {sites.map((site) => (
            <button
              key={site}
              onClick={() => download(site)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-700">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white truncate">{site}</p>
                <p className="text-[10px] font-mono text-gray-500">{t("pdf.siteOnly")}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}
