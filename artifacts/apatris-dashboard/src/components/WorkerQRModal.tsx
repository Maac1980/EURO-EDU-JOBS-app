import React, { useRef } from "react";
import { X, Download, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { parseISO, differenceInDays } from "date-fns";

interface WorkerQRModalProps {
  worker: any;
  isOpen: boolean;
  onClose: () => void;
}

function daysInfo(dateStr?: string | null): { label: string; color: string } | null {
  if (!dateStr) return null;
  const days = differenceInDays(parseISO(dateStr), new Date());
  if (days < 0) return { label: "EXPIRED", color: "#ef4444" };
  if (days < 30) return { label: `${days}d`, color: "#ef4444" };
  if (days < 60) return { label: `${days}d`, color: "#f59e0b" };
  return { label: `${days}d`, color: "#4ade80" };
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  compliant: { label: "COMPLIANT", color: "#4ade80" },
  warning: { label: "WARNING", color: "#f59e0b" },
  expired: { label: "EXPIRED", color: "#ef4444" },
  critical: { label: "CRITICAL", color: "#ef4444" },
};

export function WorkerQRModal({ worker, isOpen, onClose }: WorkerQRModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const profileUrl = `${window.location.origin}${base}/?worker=${worker?.id ?? ""}`;

  const st = STATUS_MAP[worker?.complianceStatus] ?? { label: (worker?.complianceStatus ?? "UNKNOWN").toUpperCase(), color: "#9ca3af" };

  const docs = [
    { label: "TRC", date: worker?.trcExpiry },
    { label: "Work Permit", date: worker?.workPermitExpiry },
    { label: "Medical", date: worker?.badaniaLekExpiry },
    { label: "BHP", date: worker?.bhpExpiry },
  ];

  const handleDownload = () => {
    const svgEl = containerRef.current?.querySelector("svg");
    if (!svgEl) return;
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eej-qr-${(worker?.name ?? "worker").replace(/\s+/g, "-").toLowerCase()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen || !worker) return null;

  // z-[300] sits above WorkerProfilePanel's z-[210]. Pre-fix the QR modal
  // opened at z-[60] which rendered it BEHIND the open WorkerProfilePanel
  // slide-over — click registered, modal mounted, but invisible (walkthrough
  // finding #10).
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-xs rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "#1a1a1a", border: "1px solid rgba(233,255,112,0.25)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4" style={{ color: "#E9FF70" }} />
            <span className="text-xs font-black uppercase tracking-widest text-white">
              Worker QR
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Worker info */}
          <div className="text-center space-y-1.5">
            <p className="text-base font-black text-white leading-tight">{worker.name}</p>
            <p className="text-[11px] font-mono text-white/45">
              {worker.specialization || "—"}
              {(worker.siteLocation && worker.siteLocation !== "Available")
                ? ` · ${worker.siteLocation}`
                : " · Bench"}
            </p>
            <span
              className="inline-block text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
              style={{
                background: `${st.color}18`,
                color: st.color,
                border: `1px solid ${st.color}40`,
              }}
            >
              {st.label}
            </span>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            <div
              ref={containerRef}
              className="p-3 rounded-xl"
              style={{ background: "#ffffff" }}
            >
              <QRCodeSVG
                value={profileUrl}
                size={168}
                bgColor="#ffffff"
                fgColor="#1a1a1a"
                level="M"
                includeMargin={false}
              />
            </div>
          </div>

          {/* Scan hint */}
          <p className="text-center text-[10px] font-mono text-white/25 -mt-1">
            scan → opens full worker profile
          </p>

          {/* Document countdown grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {docs.map((doc) => {
              const info = daysInfo(doc.date);
              return (
                <div
                  key={doc.label}
                  className="rounded-lg py-2 px-1 text-center"
                  style={{
                    background: "#111",
                    border: `1px solid ${info ? `${info.color}28` : "rgba(255,255,255,0.05)"}`,
                  }}
                >
                  <p className="text-[8px] font-bold uppercase tracking-wider text-white/35 mb-0.5">
                    {doc.label}
                  </p>
                  <p
                    className="text-xs font-black font-mono leading-none"
                    style={{ color: info ? info.color : "#374151" }}
                  >
                    {info ? info.label : "N/A"}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#E9FF70", color: "#333333" }}
          >
            <Download className="w-3.5 h-3.5" />
            Download QR (SVG)
          </button>
        </div>
      </div>
    </div>
  );
}
