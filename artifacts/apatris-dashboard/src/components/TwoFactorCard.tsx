import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldCheck, ShieldOff, Loader2, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const LIME = "#E9FF70";
const DARK = "#333333";

function getBase() {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

export function TwoFactorCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [setupStep, setSetupStep] = useState<"idle" | "qr" | "verify" | "disable">("idle");
  const [qrData, setQrData] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  const { data: statusData, isLoading } = useQuery({
    queryKey: ["2fa-status"],
    queryFn: async () => {
      const res = await fetch(`${getBase()}/api/2fa/status`);
      if (!res.ok) throw new Error("Failed to load 2FA status");
      return res.json() as Promise<{ enabled: boolean }>;
    },
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${getBase()}/api/2fa/setup`, { method: "POST" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Setup failed"); }
      return res.json() as Promise<{ qrDataUrl: string; secret: string }>;
    },
    onSuccess: (data) => { setQrData(data); setSetupStep("qr"); },
    onError: (e: Error) => toast({ title: "Błąd 2FA", description: e.message, variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(`${getBase()}/api/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Verify failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
      setSetupStep("idle"); setCode(""); setQrData(null);
      toast({ title: "✓ 2FA włączone", description: "Uwierzytelnianie dwuskładnikowe zostało aktywowane.", variant: "success" as any });
    },
    onError: (e: Error) => toast({ title: "Błąd", description: e.message, variant: "destructive" }),
  });

  const disableMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(`${getBase()}/api/2fa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Disable failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
      setSetupStep("idle"); setCode("");
      toast({ title: "✓ 2FA wyłączone", variant: "success" as any });
    },
    onError: (e: Error) => toast({ title: "Błąd", description: e.message, variant: "destructive" }),
  });

  const inputCls = "w-full rounded-lg px-3 py-2 text-sm font-mono tracking-[0.3em] text-center bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#E9FF70] transition-colors";

  const enabled = statusData?.enabled ?? false;

  return (
    <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center gap-3">
        {enabled ? (
          <ShieldCheck className="w-5 h-5 text-green-400" />
        ) : (
          <Shield className="w-5 h-5" style={{ color: LIME }} />
        )}
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Uwierzytelnianie Dwuskładnikowe (2FA)</h3>
          <p className="text-[10px] font-mono text-gray-500 mt-0.5">TOTP via Google Authenticator / Authy</p>
        </div>
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-500 ml-auto" />
        ) : (
          <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${enabled ? "bg-green-900/40 text-green-300" : "bg-red-900/30 text-red-400"}`}>
            {enabled ? "AKTYWNE" : "WYŁĄCZONE"}
          </span>
        )}
      </div>

      {setupStep === "idle" && (
        <div>
          {!enabled ? (
            <button
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
              className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all hover:brightness-110 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: LIME, color: DARK }}
            >
              {setupMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
              Aktywuj 2FA
            </button>
          ) : (
            <button
              onClick={() => setSetupStep("disable")}
              className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border text-red-400 hover:bg-red-900/20 transition-all flex items-center justify-center gap-2"
              style={{ borderColor: "rgba(239,68,68,0.3)" }}
            >
              <ShieldOff className="w-3.5 h-3.5" /> Wyłącz 2FA
            </button>
          )}
        </div>
      )}

      {setupStep === "qr" && qrData && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Zeskanuj kod QR w aplikacji <strong className="text-white">Google Authenticator</strong> lub <strong className="text-white">Authy</strong>, a następnie wpisz 6-cyfrowy kod.</p>
          <div className="flex justify-center">
            <img src={qrData.qrDataUrl} alt="2FA QR Code" className="rounded-xl border border-white/10 w-40 h-40" />
          </div>
          <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-center">
            <p className="text-[9px] text-gray-500 mb-1 uppercase font-bold tracking-widest">Backup Secret</p>
            <code className="text-[10px] text-gray-300 font-mono break-all">{qrData.secret}</code>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setSetupStep("idle"); setQrData(null); }} className="flex-1 py-2 rounded-lg text-xs font-bold text-gray-400 bg-white/5 hover:bg-white/10 transition-all">Anuluj</button>
            <button onClick={() => setSetupStep("verify")} className="flex-1 py-2 rounded-lg text-xs font-black uppercase" style={{ background: LIME, color: DARK }}>Dalej →</button>
          </div>
        </div>
      )}

      {setupStep === "verify" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Wpisz 6-cyfrowy kod z aplikacji Authenticator aby potwierdzić aktywację.</p>
          <input className={inputCls} type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          <div className="flex gap-2">
            <button onClick={() => setSetupStep("qr")} className="flex-1 py-2 rounded-lg text-xs font-bold text-gray-400 bg-white/5">← Wstecz</button>
            <button onClick={() => verifyMutation.mutate(code)} disabled={code.length !== 6 || verifyMutation.isPending} className="flex-1 py-2 rounded-lg text-xs font-black uppercase disabled:opacity-60 flex items-center justify-center gap-1" style={{ background: LIME, color: DARK }}>
              {verifyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Aktywuj
            </button>
          </div>
        </div>
      )}

      {setupStep === "disable" && (
        <div className="space-y-3 p-3 rounded-xl border" style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
          <p className="text-xs text-red-300">Wpisz aktualny kod 2FA aby wyłączyć uwierzytelnianie dwuskładnikowe.</p>
          <input className={inputCls} type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          <div className="flex gap-2">
            <button onClick={() => { setSetupStep("idle"); setCode(""); }} className="flex-1 py-2 rounded-lg text-xs font-bold text-gray-400 bg-white/5">Anuluj</button>
            <button onClick={() => disableMutation.mutate(code)} disabled={code.length !== 6 || disableMutation.isPending} className="flex-1 py-2 rounded-lg text-xs font-black uppercase bg-red-700 hover:bg-red-600 text-white disabled:opacity-60 flex items-center justify-center gap-1">
              {disableMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Wyłącz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
