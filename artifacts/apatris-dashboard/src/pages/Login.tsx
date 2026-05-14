import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Loader2, Eye, EyeOff, Fingerprint, ShieldCheck } from "lucide-react";

type Step = "creds" | "totp";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // 2FA step state — Commit 25 Part B. Pre-fix, the server's 202 +
  // requires2FASetup response landed in the !data.token branch of auth.tsx
  // and surfaced as "Invalid credentials." Now Login.tsx renders a second
  // step with the QR (for first-time setup) or just a TOTP input (for users
  // who already have 2FA enabled).
  const [step, setStep] = useState<Step>("creds");
  const [totpToken, setTotpToken] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isSetupMode, setIsSetupMode] = useState(false);

  useEffect(() => {
    if (window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
        .then(available => setBiometricAvailable(available))
        .catch(() => {});
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password, step === "totp" ? totpToken : undefined);
    setLoading(false);
    if (result.success) {
      setLocation("/");
      return;
    }
    if (result.requires2FASetup) {
      setQrDataUrl(result.qrDataUrl ?? null);
      setIsSetupMode(true);
      setStep("totp");
      return;
    }
    if (result.requires2FA) {
      setIsSetupMode(false);
      setStep("totp");
      return;
    }
    setError(result.error ?? "Login failed");
  };

  const handleBackToCreds = () => {
    setStep("creds");
    setTotpToken("");
    setQrDataUrl(null);
    setError("");
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Left — Yellow-green brand panel */}
      <div style={{
        flex: "0 0 60%", background: "#d4e84b", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 48, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.04, background: "repeating-linear-gradient(45deg, #0b101e 0, #0b101e 1px, transparent 1px, transparent 12px)" }} />
        <div style={{ position: "relative", textAlign: "center" }}>
          <div style={{
            width: 80, height: 80, borderRadius: 16, background: "#0b101e", display: "flex",
            alignItems: "center", justifyContent: "center", margin: "0 auto 24px",
            boxShadow: "0 8px 32px rgba(11,16,30,0.3)",
          }}>
            <span style={{ color: "#d4e84b", fontWeight: 900, fontSize: 28, letterSpacing: -1 }}>EEJ</span>
          </div>
          <h1 style={{ fontSize: 42, fontWeight: 800, color: "#0b101e", letterSpacing: "0.15em", lineHeight: 1.1, margin: 0 }}>
            EURO EDU JOBS
          </h1>
          <div style={{ width: 60, height: 3, background: "#0b101e", margin: "16px auto", borderRadius: 2 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: "#0b101e", letterSpacing: "0.25em", opacity: 0.7 }}>
            YOUR RELIABLE PARTNERS IN EUROPE
          </p>
        </div>
      </div>

      {/* Right — White sign-in panel */}
      <div style={{
        flex: "0 0 40%", background: "#ffffff", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 48,
      }}>
        <div style={{ width: "100%", maxWidth: 360 }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0b101e", letterSpacing: "0.1em", marginBottom: 8 }}>
            SIGN IN
          </h2>
          <p style={{ fontSize: 13, color: "#7a8599", marginBottom: 32 }}>
            Access the EEJ management portal
          </p>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {step === "creds" && (
              <>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0b101e", letterSpacing: "0.08em", marginBottom: 6 }}>EMAIL</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="anna.b@edu-jobs.eu"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "2px solid #e5e7eb", fontSize: 14, color: "#0b101e", marginBottom: 20, outline: "none" }}
                  onFocus={e => e.currentTarget.style.borderColor = "#d4e84b"}
                  onBlur={e => e.currentTarget.style.borderColor = "#e5e7eb"} />

                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0b101e", letterSpacing: "0.08em", marginBottom: 6 }}>PASSWORD</label>
                <div style={{ position: "relative", marginBottom: 28 }}>
                  <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                    style={{ width: "100%", padding: "12px 42px 12px 14px", borderRadius: 8, border: "2px solid #e5e7eb", fontSize: 14, color: "#0b101e", outline: "none" }}
                    onFocus={e => e.currentTarget.style.borderColor = "#d4e84b"}
                    onBlur={e => e.currentTarget.style.borderColor = "#e5e7eb"} />
                  <button type="button" onClick={() => setShowPassword(p => !p)} tabIndex={-1}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9ca3af" }}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <button type="submit" disabled={loading}
                  style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: "#d4e84b", color: "#0b101e",
                    fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(212,232,75,0.3)", opacity: loading ? 0.7 : 1 }}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? "AUTHENTICATING..." : "INITIALIZE SESSION"}
                </button>

                {biometricAvailable && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
                      <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                      <span style={{ fontSize: 11, color: "#9ca3af", letterSpacing: "0.1em" }}>OR</span>
                      <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                    </div>
                    <button type="button"
                      style={{ width: "100%", padding: 14, borderRadius: 10, border: "2px solid #e5e7eb", background: "#f9fafb", color: "#0b101e",
                        fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer", display: "flex", alignItems: "center",
                        justifyContent: "center", gap: 10 }}
                      onClick={() => setError("Enter email + password first, then use biometric to register for next time.")}>
                      <Fingerprint size={20} />
                      SIGN IN WITH BIOMETRICS
                    </button>
                  </>
                )}
              </>
            )}

            {step === "totp" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                  <ShieldCheck size={18} color="#15803d" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#15803d" }}>
                      {isSetupMode ? "Two-factor setup required" : "Two-factor authentication"}
                    </div>
                    <div style={{ fontSize: 11, color: "#166534", marginTop: 2 }}>
                      Signed in as <b>{email}</b>
                    </div>
                  </div>
                </div>

                {isSetupMode && qrDataUrl && (
                  <div style={{ marginBottom: 18, textAlign: "center" }}>
                    <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, marginBottom: 12 }}>
                      Scan this QR code with your authenticator app
                      (Google Authenticator, 1Password, Authy), then enter the
                      6-digit code below.
                    </p>
                    <img src={qrDataUrl} alt="2FA QR code" style={{ width: 180, height: 180, border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#fff" }} />
                  </div>
                )}

                {!isSetupMode && (
                  <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5, marginBottom: 18 }}>
                    Open your authenticator app and enter the current 6-digit
                    code for this account.
                  </p>
                )}

                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0b101e", letterSpacing: "0.08em", marginBottom: 6 }}>AUTHENTICATOR CODE</label>
                <input
                  type="text"
                  value={totpToken}
                  onChange={e => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="123456"
                  maxLength={6}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "2px solid #e5e7eb", fontSize: 18, fontFamily: "monospace", letterSpacing: "0.4em", textAlign: "center", color: "#0b101e", marginBottom: 20, outline: "none" }}
                  onFocus={e => e.currentTarget.style.borderColor = "#d4e84b"}
                  onBlur={e => e.currentTarget.style.borderColor = "#e5e7eb"}
                />

                <button type="submit" disabled={loading || totpToken.length !== 6}
                  style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: "#d4e84b", color: "#0b101e",
                    fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(212,232,75,0.3)",
                    opacity: (loading || totpToken.length !== 6) ? 0.6 : 1 }}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? "VERIFYING..." : isSetupMode ? "COMPLETE SETUP" : "VERIFY"}
                </button>

                <button type="button" onClick={handleBackToCreds}
                  style={{ width: "100%", padding: 10, marginTop: 12, borderRadius: 8, border: "none", background: "transparent", color: "#6b7280", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", cursor: "pointer" }}>
                  ← Back to sign in
                </button>
              </>
            )}
          </form>

          <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 24 }}>
            Euro Edu Jobs Sp. z o.o. · Warsaw, Poland
          </p>
        </div>
      </div>
    </div>
  );
}
