import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  User, Mail, Shield, ShieldCheck, ShieldOff, KeyRound, Copy, AlertTriangle,
  Loader2, Check, X,
} from "lucide-react";

function getApiBase(): string {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
}

type SetupStage = "idle" | "qr-shown" | "verifying" | "done" | "disabling" | "error";

interface SetupState {
  stage: SetupStage;
  secret: string | null;
  qrDataUrl: string | null;
  totp: string;
  error: string | null;
}

const emptySetup: SetupState = {
  stage: "idle", secret: null, qrDataUrl: null, totp: "", error: null,
};

export default function Profile() {
  const { user, token } = useAuth();
  const [twoFAEnabled, setTwoFAEnabled] = useState<boolean | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [setup, setSetup] = useState<SetupState>(emptySetup);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  async function loadStatus() {
    setStatusLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/2fa/status`, { headers: authHeader });
      if (res.ok) {
        const data = await res.json() as { enabled: boolean };
        setTwoFAEnabled(data.enabled);
      } else {
        setTwoFAEnabled(false);
      }
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

  async function startSetup() {
    setSetup({ ...emptySetup, stage: "qr-shown" });
    try {
      const res = await fetch(`${getApiBase()}/2fa/setup`, {
        method: "POST", headers: authHeader,
      });
      if (!res.ok) {
        const data = await res.json();
        setSetup({ ...emptySetup, stage: "error", error: data.error ?? "Setup failed." });
        return;
      }
      const data = await res.json() as { secret: string; qrDataUrl: string };
      setSetup({ stage: "qr-shown", secret: data.secret, qrDataUrl: data.qrDataUrl, totp: "", error: null });
    } catch (e) {
      setSetup({ ...emptySetup, stage: "error", error: e instanceof Error ? e.message : "Network error." });
    }
  }

  async function verifySetup() {
    if (!setup.totp || setup.totp.length < 6) {
      setSetup((s) => ({ ...s, error: "Enter the 6-digit code from your authenticator." }));
      return;
    }
    setSetup((s) => ({ ...s, stage: "verifying", error: null }));
    try {
      const res = await fetch(`${getApiBase()}/2fa/verify`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ token: setup.totp }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSetup((s) => ({ ...s, stage: "qr-shown", error: data.error ?? "Invalid code." }));
        return;
      }
      setSetup({ ...emptySetup, stage: "done" });
      setTwoFAEnabled(true);
    } catch (e) {
      setSetup((s) => ({ ...s, stage: "qr-shown", error: e instanceof Error ? e.message : "Network error." }));
    }
  }

  async function disable2FA() {
    if (!setup.totp || setup.totp.length < 6) {
      setSetup((s) => ({ ...s, error: "Enter your authenticator code to confirm." }));
      return;
    }
    setSetup((s) => ({ ...s, stage: "verifying", error: null }));
    try {
      const res = await fetch(`${getApiBase()}/2fa/disable`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ token: setup.totp }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSetup((s) => ({ ...s, stage: "disabling", error: data.error ?? "Invalid code." }));
        return;
      }
      setSetup(emptySetup);
      setTwoFAEnabled(false);
      setRecoveryCodes(null);
    } catch (e) {
      setSetup((s) => ({ ...s, stage: "disabling", error: e instanceof Error ? e.message : "Network error." }));
    }
  }

  async function generateRecoveryCodes() {
    setRecoveryLoading(true);
    setRecoveryError(null);
    try {
      const res = await fetch(`${getApiBase()}/2fa/recovery-codes/generate`, {
        method: "POST", headers: authHeader,
      });
      if (!res.ok) {
        const data = await res.json();
        setRecoveryError(data.error ?? "Failed to generate codes.");
        return;
      }
      const data = await res.json() as { codes: string[] };
      setRecoveryCodes(data.codes);
    } catch (e) {
      setRecoveryError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setRecoveryLoading(false);
    }
  }

  function copyAllCodes() {
    if (!recoveryCodes) return;
    navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    });
  }

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6">
        <User className="w-6 h-6" /> Profile
      </h1>

      {/* Identity card */}
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">{user?.name?.charAt(0) ?? "U"}</span>
          </div>
          <div>
            <p className="text-lg font-bold text-white">{user?.name ?? "User"}</p>
            <p className="text-sm text-muted-foreground">{user?.role ?? "—"}</p>
          </div>
        </div>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span className="text-white">{user?.email ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-white">Role: {user?.role ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* 2FA card */}
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Two-Factor Authentication
          </h2>
          {statusLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : twoFAEnabled ? (
            <span className="px-2 py-1 rounded text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">Enabled</span>
          ) : (
            <span className="px-2 py-1 rounded text-xs font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">Disabled</span>
          )}
        </div>

        {!statusLoading && !twoFAEnabled && setup.stage === "idle" && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Add a second authentication step using an authenticator app (Google Authenticator, Authy, 1Password).
              {user?.role === "admin" && (
                <span className="block mt-2 text-yellow-400">Admin accounts are required to enable 2FA on next login.</span>
              )}
            </p>
            <button
              onClick={startSetup}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity"
            >
              Set up 2FA
            </button>
          </>
        )}

        {setup.stage === "qr-shown" && setup.qrDataUrl && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app, then enter the 6-digit code below.
            </p>
            <div className="flex items-center justify-center bg-white p-4 rounded-lg">
              <img src={setup.qrDataUrl} alt="2FA QR code" className="w-40 h-40" />
            </div>
            <div className="text-xs font-mono text-muted-foreground bg-slate-800/60 rounded p-2 break-all">
              Manual entry: {setup.secret}
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={setup.totp}
              onChange={(e) => setSetup((s) => ({ ...s, totp: e.target.value.replace(/\D/g, "") }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-white/10 text-white text-center font-mono tracking-widest text-lg focus:outline-none focus:border-primary"
            />
            {setup.error && <p className="text-xs text-red-400 flex items-center gap-1"><X className="w-3 h-3" /> {setup.error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSetup(emptySetup)} className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-white border border-white/10">
                Cancel
              </button>
              <button
                onClick={verifySetup}
                disabled={setup.totp.length < 6}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Verify & Enable
              </button>
            </div>
          </div>
        )}

        {setup.stage === "verifying" && (
          <div className="flex items-center justify-center py-6 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Verifying...</span>
          </div>
        )}

        {!statusLoading && twoFAEnabled && setup.stage !== "disabling" && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Your account is protected by two-factor authentication. You can disable it or regenerate recovery codes below.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSetup({ ...emptySetup, stage: "disabling" })}
                className="px-3 py-2 rounded-lg text-sm text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors flex items-center gap-1"
              >
                <ShieldOff className="w-4 h-4" /> Disable 2FA
              </button>
              <button
                onClick={generateRecoveryCodes}
                disabled={recoveryLoading}
                className="px-3 py-2 rounded-lg text-sm text-white border border-white/10 hover:bg-white/5 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                {recoveryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {recoveryCodes ? "Regenerate Recovery Codes" : "Generate Recovery Codes"}
              </button>
            </div>
          </>
        )}

        {setup.stage === "disabling" && (
          <div className="space-y-3">
            <p className="text-sm text-yellow-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              Enter your authenticator code to confirm disabling 2FA.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={setup.totp}
              onChange={(e) => setSetup((s) => ({ ...s, totp: e.target.value.replace(/\D/g, "") }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-white/10 text-white text-center font-mono tracking-widest text-lg focus:outline-none focus:border-red-500"
            />
            {setup.error && <p className="text-xs text-red-400 flex items-center gap-1"><X className="w-3 h-3" /> {setup.error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSetup(emptySetup)} className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-white border border-white/10">
                Cancel
              </button>
              <button
                onClick={disable2FA}
                disabled={setup.totp.length < 6}
                className="px-4 py-2 rounded-lg bg-red-500 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Disable 2FA
              </button>
            </div>
          </div>
        )}

        {recoveryError && (
          <div className="mt-4 px-3 py-2 rounded-lg text-xs bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
            <X className="w-3 h-3" /> {recoveryError}
          </div>
        )}

        {recoveryCodes && (
          <div className="mt-4 space-y-3">
            <div className="px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-yellow-400" />
              <div className="text-xs text-yellow-100">
                <strong>Save these codes now.</strong> They will not be shown again. Each code can be used once if you lose access to your authenticator. Generating new codes invalidates the old set.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((code, i) => (
                <div key={i} className="px-3 py-2 rounded bg-slate-800/60 border border-white/10 text-white text-center tracking-wider">
                  {code}
                </div>
              ))}
            </div>
            <button
              onClick={copyAllCodes}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm hover:bg-white/5 flex items-center justify-center gap-2 transition-colors"
            >
              {copiedAll ? <><Check className="w-4 h-4 text-green-400" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy all codes</>}
            </button>
          </div>
        )}

        {setup.stage === "done" && (
          <div className="mt-4 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4" /> 2FA enabled successfully.
          </div>
        )}
      </div>
    </div>
  );
}
