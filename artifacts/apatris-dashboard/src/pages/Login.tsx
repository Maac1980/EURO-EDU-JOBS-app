import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";

const LIME = "#E9FF70";
const DARK = "#333333";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [requires2FA, setRequires2FA] = useState(false);
  const [requiresEmailOtp, setRequiresEmailOtp] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hintEmail, setHintEmail] = useState("");

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/auth/whoami`)
      .then((r) => r.json())
      .then((d) => { if (d?.allowedEmail) setHintEmail(d.allowedEmail); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(
      email,
      password,
      requires2FA ? totpToken : undefined,
      requiresEmailOtp ? emailOtp : undefined
    );
    setLoading(false);
    if (result.success) {
      const returnTo = sessionStorage.getItem("eej_return_to");
      if (returnTo) {
        sessionStorage.removeItem("eej_return_to");
        window.location.href = window.location.pathname + returnTo;
      } else {
        setLocation("/");
      }
    } else if (result.requires2FA) {
      setRequires2FA(true);
      setError("");
    } else if (result.requiresEmailOtp) {
      setRequiresEmailOtp(true);
      setError("");
    } else {
      setError(result.error ?? t("login.invalidCredentials"));
    }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden" style={{ background: "#f5f5f5" }}>

      {/* ── Left: Lime brand panel ───────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-center items-center flex-1 relative"
        style={{ background: LIME }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, ${DARK} 0px, transparent 1px, transparent 40px),
                              repeating-linear-gradient(90deg, ${DARK} 0px, transparent 1px, transparent 40px)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative z-10 text-center px-12 select-none">
          <div
            className="w-28 h-28 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl"
            style={{ background: DARK }}
          >
            <span
              className="text-4xl font-black tracking-tighter"
              style={{ color: LIME, fontFamily: "Arial Black, Arial, sans-serif" }}
            >
              EEJ
            </span>
          </div>
          <h1
            className="text-5xl font-black uppercase tracking-tight leading-none"
            style={{ color: DARK }}
          >
            EURO EDU JOBS
          </h1>
          <p
            className="text-sm font-bold mt-4 uppercase tracking-widest leading-relaxed text-center"
            style={{ color: DARK, opacity: 0.65 }}
          >
            Your reliable HR partner in Europe.<br />We make hiring simple.
          </p>
          <div className="mt-10 flex items-center gap-4 justify-center">
            <div className="h-px w-16" style={{ background: DARK, opacity: 0.2 }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: DARK, opacity: 0.5 }}>
              International Recruitment Portal
            </span>
            <div className="h-px w-16" style={{ background: DARK, opacity: 0.2 }} />
          </div>
        </div>
        <div className="absolute bottom-8 left-8">
          <p className="text-xs font-mono uppercase tracking-widest" style={{ color: DARK, opacity: 0.4 }}>
            Est. Europe · Global Talent Solutions
          </p>
        </div>
      </div>

      {/* ── Right: Login form ───────────────────────────────── */}
      <div
        className="w-full lg:w-[480px] flex flex-col justify-center items-center h-full overflow-y-auto px-10 py-10"
        style={{ background: "#ffffff" }}
      >
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: LIME }}
            >
              <span
                className="text-xl font-black tracking-tighter"
                style={{ color: DARK, fontFamily: "Arial Black, Arial, sans-serif" }}
              >
                EEJ
              </span>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight" style={{ color: DARK }}>
              EURO EDU JOBS
            </h1>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-black uppercase tracking-tight" style={{ color: DARK }}>
              Sign In
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {t("login.terminal")}
            </p>
            <div className="mt-3 h-1 w-12 rounded-full" style={{ background: LIME }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {error && (
              <div
                className="p-3 rounded-lg text-sm font-medium"
                style={{ background: "#fff0f0", border: "1px solid #ffcccc", color: "#c0392b" }}
              >
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "#888" }}>
                {t("login.operatorId")}
              </label>
              <input
                type="email"
                required
                autoComplete="username"
                disabled={loading}
                className="w-full rounded-xl px-4 py-3 text-sm transition-all outline-none"
                style={{
                  background: "#f5f5f5",
                  border: "2px solid #e5e5e5",
                  color: DARK,
                  opacity: loading ? 0.6 : 1,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = LIME;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${LIME}40`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e5e5";
                  e.currentTarget.style.boxShadow = "none";
                }}
                placeholder={hintEmail || "you@euro-edu-jobs.eu"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {hintEmail && (
                <p className="text-[10px] mt-1.5 px-1" style={{ color: "#aaa" }}>
                  Registered operator: <span style={{ color: DARK, fontWeight: 700 }}>{hintEmail}</span>
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "#888" }}>
                {t("login.passcode")}
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                disabled={loading}
                className="w-full rounded-xl px-4 py-3 text-sm transition-all outline-none"
                style={{
                  background: "#f5f5f5",
                  border: "2px solid #e5e5e5",
                  color: DARK,
                  opacity: loading ? 0.6 : 1,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = LIME;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${LIME}40`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e5e5";
                  e.currentTarget.style.boxShadow = "none";
                }}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {/* Email OTP step */}
            {requiresEmailOtp && (
              <div className="space-y-1.5">
                <div className="p-3 rounded-lg text-sm font-medium mb-2" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534" }}>
                  Kod jednorazowy (OTP) został wysłany na Twój adres email. Wpisz go poniżej. Kod wygasa po 10 minutach.
                </div>
                <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "#888" }}>
                  Kod jednorazowy (OTP)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  disabled={loading}
                  className="w-full rounded-xl px-4 py-3 text-sm font-mono tracking-[0.3em] transition-all outline-none text-center"
                  style={{ background: "#f5f5f5", border: "2px solid #e5e5e5", color: DARK, opacity: loading ? 0.6 : 1, fontSize: "24px", letterSpacing: "0.4em" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = LIME; e.currentTarget.style.boxShadow = `0 0 0 3px ${LIME}40`; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.boxShadow = "none"; }}
                  placeholder="000000"
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <button
                  type="button"
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                  onClick={() => { setRequiresEmailOtp(false); setEmailOtp(""); setError(""); }}
                >
                  ← Wróć do logowania
                </button>
              </div>
            )}

            {/* 2FA TOTP (for non-admin users with TOTP enabled) */}
            {requires2FA && (
              <div className="space-y-1.5">
                <div className="p-3 rounded-lg text-sm font-medium mb-2" style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                  Uwierzytelnianie dwuskładnikowe (2FA) jest włączone. Wpisz kod z aplikacji Authenticator.
                </div>
                <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "#888" }}>
                  Kod Authenticator (TOTP)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  disabled={loading}
                  className="w-full rounded-xl px-4 py-3 text-sm font-mono tracking-[0.3em] transition-all outline-none text-center"
                  style={{ background: "#f5f5f5", border: "2px solid #e5e5e5", color: DARK, opacity: loading ? 0.6 : 1 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = LIME; e.currentTarget.style.boxShadow = `0 0 0 3px ${LIME}40`; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.boxShadow = "none"; }}
                  placeholder="000000"
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-black uppercase tracking-widest text-sm transition-all hover:opacity-90 shadow-lg mt-2"
              style={{
                background: loading ? "#ccc" : LIME,
                color: DARK,
                boxShadow: loading ? "none" : `0 4px 20px ${LIME}55`,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke={DARK} strokeWidth="4" />
                    <path className="opacity-75" fill={DARK} d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span>Verifying…</span>
                </>
              ) : (
                <span>{t("login.submit")}</span>
              )}
            </button>
          </form>

          <p className="text-center text-[10px] font-mono mt-6" style={{ color: "#ccc" }}>
            {t("login.unauthorized")}
          </p>
        </div>
      </div>
    </div>
  );
}
