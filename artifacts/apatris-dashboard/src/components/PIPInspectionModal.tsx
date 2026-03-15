import React from "react";
import { X, ClipboardList, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";

interface PIPInspectionModalProps {
  worker: any;
  isOpen: boolean;
  onClose: () => void;
}

function daysLeft(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface DocCardProps {
  label: string;
  value?: string | null;
  isDate?: boolean;
  mandatory?: boolean;
  customBadge?: React.ReactNode;
}

function DocCard({ label, value, isDate = false, mandatory = false, customBadge }: DocCardProps) {
  let status: "ok" | "warn" | "critical" | "missing" = "missing";
  let days: number | null = null;

  if (isDate && value) {
    days = daysLeft(value);
    if (days === null) status = "missing";
    else if (days < 0) status = "critical";
    else if (days < 30) status = "critical";
    else if (days < 60) status = "warn";
    else status = "ok";
  } else if (!isDate && value) {
    status = "ok";
  }

  const colors = {
    ok:       { bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.25)",  text: "#22C55E" },
    warn:     { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: "#F59E0B" },
    critical: { bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)",  text: "#EF4444" },
    missing:  { bg: "rgba(75,85,99,0.08)",   border: "rgba(75,85,99,0.25)",   text: "#6B7280" },
  };
  const c = colors[status];

  const Icon = status === "ok" ? CheckCircle2 : status === "missing" ? XCircle : AlertTriangle;

  return (
    <div className="rounded-xl border p-3 flex items-start justify-between gap-3" style={{ background: c.bg, borderColor: c.border }}>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: c.text }}>
          {label}
          {mandatory && <span className="ml-1 text-red-400">*</span>}
        </p>
        {customBadge ? customBadge : (
          <>
            <p className="text-sm font-mono font-bold text-white">{isDate ? fmtDate(value) : (value || "—")}</p>
            {isDate && days !== null && (
              <p className="text-[10px] font-mono mt-0.5" style={{ color: c.text }}>
                {days < 0 ? `EXPIRED ${Math.abs(days)}d ago` : `${days} days remaining`}
              </p>
            )}
          </>
        )}
      </div>
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: c.text }} />
    </div>
  );
}

export function PIPInspectionModal({ worker, isOpen, onClose }: PIPInspectionModalProps) {
  if (!isOpen) return null;

  const today = new Date().toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });

  const zusColor = worker.zusStatus === "Registered" ? "#22C55E" : worker.zusStatus === "Unregistered" ? "#EF4444" : "#F59E0B";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ background: "#0f1218", borderColor: "rgba(233,255,112,0.25)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(233,255,112,0.15)", background: "rgba(233,255,112,0.04)" }}>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#E9FF70" }}>
              <ClipboardList className="w-6 h-6" style={{ color: "#333333" }} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">PIP Inspection View · Euro Edu Jobs</p>
              <h2 className="text-xl font-black text-white">{worker.name}</h2>
              <p className="text-sm font-mono mt-0.5" style={{ color: "#E9FF70" }}>
                {worker.specialization || "—"} {worker.siteLocation ? `· ${worker.siteLocation}` : ""}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-600 font-mono">Generated</p>
            <p className="text-xs font-mono text-gray-400">{today}</p>
            <button onClick={onClose} className="mt-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Section 1: Identity */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#E9FF70" }}>1. Identyfikacja pracownika</p>
            <div className="grid grid-cols-2 gap-3">
              <DocCard label="PESEL" value={worker.pesel} mandatory />
              <DocCard label="NIP" value={worker.nip} />
              <DocCard label="Typ wizy / pozwolenia" value={worker.visaType} mandatory />
              <DocCard label="ZUS Status" customBadge={
                <span className="text-sm font-black" style={{ color: zusColor }}>
                  {worker.zusStatus || "—"}
                </span>
              } mandatory />
            </div>
          </div>

          {/* Section 2: Mandatory documents */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#E9FF70" }}>2. Dokumenty obowiązkowe</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DocCard label="Badania Lekarskie" value={worker.badaniaLekExpiry} isDate mandatory />
              <DocCard label="Oświadczenie (PUP)" value={worker.oswiadczenieExpiry} isDate mandatory />
              <DocCard label="Karta Pobytu / TRC" value={worker.trcExpiry} isDate mandatory />
              <DocCard label="Pozwolenie na pracę / Paszport" value={worker.workPermitExpiry} isDate mandatory />
              <DocCard label="BHP Certyfikat" value={worker.bhpStatus && /\d{4}/.test(worker.bhpStatus) ? worker.bhpStatus : null} isDate mandatory />
              <DocCard label="Koniec umowy" value={worker.contractEndDate} isDate mandatory />
            </div>
          </div>

          {/* Section 3: Optional / Equipment */}
          {(worker.udtCertExpiry) && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#E9FF70" }}>3. Certyfikaty UDT (jeśli dotyczy)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DocCard label="UDT Certyfikat" value={worker.udtCertExpiry} isDate />
              </div>
            </div>
          )}

          {/* Section 4: Welding certs */}
          {worker.iso9606Process && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#E9FF70" }}>4. EN ISO 9606 — Kwalifikacja spawacza</p>
              <div className="rounded-xl border p-4" style={{ borderColor: "rgba(233,255,112,0.18)", background: "rgba(233,255,112,0.03)" }}>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Process</p>
                    <p className="text-sm font-mono font-bold text-white">{worker.iso9606Process || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Material</p>
                    <p className="text-sm font-mono font-bold text-white">{worker.iso9606Material || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Thickness</p>
                    <p className="text-sm font-mono font-bold text-white">{worker.iso9606Thickness || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Position</p>
                    <p className="text-sm font-mono font-bold text-white">{worker.iso9606Position || "—"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 5: RODO */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#E9FF70" }}>5. RODO / Zgoda na przetwarzanie danych</p>
            <DocCard label="Data zgody RODO" value={worker.rodoConsentDate} isDate={false} mandatory
              customBadge={
                worker.rodoConsentDate
                  ? <p className="text-sm font-mono font-bold text-green-400">✓ Zgoda złożona: {fmtDate(worker.rodoConsentDate)}</p>
                  : <p className="text-sm font-mono font-bold text-red-400">⚠ Brak zgody RODO</p>
              }
            />
          </div>

          {/* Footer */}
          <div className="pt-2 pb-2 flex items-center justify-between border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <p className="text-[10px] font-mono text-gray-600">
              EURO EDU JOBS · Compliance Engine · Dokument wygenerowany automatycznie
            </p>
            <div className="flex items-center gap-1 text-gray-600">
              <Clock className="w-3 h-3" />
              <span className="text-[10px] font-mono">{today}</span>
            </div>
          </div>

          <p className="text-[9px] text-gray-700 text-center font-mono">
            * Oznacza dokument wymagany przez polskie prawo pracy (Kodeks Pracy). Widok przeznaczony dla inspektorów PIP.
          </p>
        </div>
      </div>
    </div>
  );
}
