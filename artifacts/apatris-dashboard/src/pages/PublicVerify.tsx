/**
 * EEJ Public Verification Page — /verify/:workerId
 *
 * Read-only compliance badge. No PII exposed.
 * Accessible without authentication.
 * EEJ Professional Blue/White branding.
 */
import React, { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Shield, CheckCircle2, AlertTriangle, XOctagon, Clock, QrCode, Copy, Check } from "lucide-react";
import { PublicLangToggle } from "@/components/PublicLangToggle";

interface VerifyResult {
  verified: boolean;
  workerId?: string;
  initials?: string;
  nationality?: string;
  zone?: string;
  riskLevel?: string;
  color?: string;
  art108Protected?: boolean;
  complianceStatus?: string;
  verifiedAt?: string;
  org_context?: string;
  disclaimer?: string;
  message?: string;
}

const ZONE_CONFIG: Record<string, { icon: typeof Shield; label: string; bg: string; border: string; text: string }> = {
  GREEN:   { icon: CheckCircle2,  label: "Compliant",        bg: "bg-green-500/10",  border: "border-green-500/30",  text: "text-green-400" },
  YELLOW:  { icon: Clock,         label: "Expiring Soon",    bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400" },
  RED:     { icon: AlertTriangle, label: "Urgent Renewal",   bg: "bg-red-500/10",    border: "border-red-500/30",    text: "text-red-400" },
  EXPIRED: { icon: XOctagon,      label: "Expired",          bg: "bg-red-500/10",    border: "border-red-500/30",    text: "text-red-400" },
  UNKNOWN: { icon: Shield,        label: "Status Unknown",   bg: "bg-slate-500/10",  border: "border-slate-500/30",  text: "text-slate-400" },
};

export default function PublicVerify() {
  const { t } = useTranslation();
  const [, params] = useRoute("/verify/:workerId");
  const workerId = params?.workerId ?? "";
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const verifyUrl = `${window.location.origin}/verify/${workerId}`;

  useEffect(() => {
    if (!workerId) return;
    setLoading(true);
    fetch(`${(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "")}/api/verify/${workerId}`)
      .then(r => r.json())
      .then(data => { setResult(data); setLoading(false); })
      .catch(() => { setResult({ verified: false, message: "Service unavailable" }); setLoading(false); });
  }, [workerId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(verifyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const zone = ZONE_CONFIG[result?.zone ?? "UNKNOWN"] ?? ZONE_CONFIG.UNKNOWN;
  const ZoneIcon = zone.icon;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <PublicLangToggle />
      <div className="max-w-sm w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3">
            <Shield className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-lg font-bold text-white">{t("public.verify.title")}</h1>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-1">{t("public.verify.subtitle")}</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 mt-3">Verifying...</p>
          </div>
        ) : result?.verified ? (
          <>
            {/* Compliance Badge */}
            <div className={`rounded-xl border-2 ${zone.border} ${zone.bg} p-6 text-center space-y-3`}>
              <ZoneIcon className={`w-10 h-10 mx-auto ${zone.text}`} />
              <div>
                <p className={`text-xl font-bold ${zone.text}`}>{zone.label}</p>
                <p className="text-xs text-slate-400 mt-1">Risk Level: {result.riskLevel}</p>
              </div>

              {/* Initials + Nationality (no PII) */}
              <div className="flex justify-center gap-4 pt-2">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto">
                    <span className="text-lg font-bold text-blue-400">{result.initials}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Initials</p>
                </div>
                {result.nationality && (
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-700/50 border border-slate-600 flex items-center justify-center mx-auto">
                      <span className="text-xs font-bold text-slate-300">{result.nationality.slice(0, 3).toUpperCase()}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Nationality</p>
                  </div>
                )}
              </div>

              {/* Art. 108 badge */}
              {result.art108Protected && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                  <Shield className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] font-bold text-blue-400">Art. 108 Protected</span>
                </div>
              )}
            </div>

            {/* QR Code */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 text-center space-y-3">
              <div className="bg-white rounded-lg p-3 inline-block">
                <QRCodeSVG value={verifyUrl} size={140} level="M" />
              </div>
              <p className="text-[10px] text-slate-500">Scan to verify this candidate's compliance status</p>

              <button onClick={handleCopy}
                className="w-full py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2">
                {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Verification Link</>}
              </button>
            </div>

            {/* Metadata */}
            <div className="text-center space-y-1">
              <p className="text-[10px] text-slate-600">Verified: {new Date(result.verifiedAt!).toLocaleString()}</p>
              <p className="text-[10px] text-slate-600">ID: {result.workerId}</p>
              <p className="text-[9px] text-slate-700 italic">{result.disclaimer}</p>
            </div>
          </>
        ) : (
          /* Not Found */
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-8 text-center space-y-3">
            <Shield className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm text-slate-400 font-semibold">{result?.message ?? "Verification ID not found"}</p>
            <p className="text-xs text-slate-600">The verification link may be expired or invalid.</p>
          </div>
        )}

        <p className="text-[10px] text-slate-700 text-center">EEJ Recruitment Platform &middot; org_context: EEJ</p>
      </div>
    </div>
  );
}

// ═══ QR CODE GENERATOR UTILITY ══════════════════════════════════════════════

export function generateVerifyUrl(workerId: string, baseUrl?: string): string {
  const base = baseUrl ?? window.location.origin;
  return `${base}/verify/${workerId}`;
}

export function VerifyQRCode({ workerId, size = 120 }: { workerId: string; size?: number }) {
  const url = generateVerifyUrl(workerId);
  return (
    <div className="bg-white rounded-lg p-2 inline-block">
      <QRCodeSVG value={url} size={size} level="M" />
    </div>
  );
}
