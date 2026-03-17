import React, { useState } from "react";
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    background: "#f7f7f7",
    border: "2px solid #e8e8e8",
    color: DARK,
    opacity: loading ? 0.6 : 1,
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = LIME;
    e.currentTarget.style.boxShadow = `0 0 0 3px ${LIME}40`;
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#e8e8e8";
    e.currentTarget.style.boxShadow = "none";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password, requires2FA ? totpToken : undefined);
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
    } else {
      setError(result.error ?? t("login.invalidCredentials"));
    }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden" style={{ background: "#ffffff" }}>

      {/* ── Left: Lime brand panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between flex-1 relative overflow-hidden"
        style={{ background: LIME }}
      >
        {/* Grid texture */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, ${DARK} 0px, transparent 1px, transparent 40px),
                              repeating-linear-gradient(90deg, ${DARK} 0px, transparent 1px, transparent 40px)`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Centre content */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-16 text-center select-none">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center mb-8 shadow-2xl"
            style={{ background: DARK }}
          >
            <span
              className="text-3xl font-black tracking-tighter"
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
            className="text-base font-bold mt-5 uppercase tracking-widest leading-relaxed"
            style={{ color: DARK, opacity: 0.7 }}
          >
            Your Reliable Partners<br />In Europe
          </p>
        </div>

        {/* Bottom tag */}
        <div className="relative z-10 px-10 py-8">
          <p className="text-xs font-mono uppercase tracking-widest" style={{ color: DARK, opacity: 0.35 }}>
            Est. Europe · Global Talent Solutions
          </p>
        </div>
      </div>

      {/* ── Right: Login form ── */}
      <div
        className="w-full lg:w-[460px] flex flex-col justify-center items-center h-full px-10 py-10"
        style={{ background: "#ffffff" }}
      >
        <div className="w-full max-w-[340px]">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: LIME }}
            >
              <span className="text-xl font-black tracking-tighter" style={{ color: DARK }}>EEJ</span>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight" style={{ color: DARK }}>
              EURO EDU JOBS
            </h1>
            <p className="text-xs font-bold uppercase tracking-widest mt-1" style={{ color: "#aaa" }}>
              Your Reliable Partners In Europe
            </p>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl font-black uppercase tracking-tight" style={{ color: DARK }}>
              Sign In
            </h2>
            <div className="mt-3 h-1 w-10 rounded-full" style={{ background: LIME }} />
          </div>

          {/* Error */}
          {error && (
            <div
              className="p-3 rounded-xl text-sm font-medium mb-5"
              style={{ background: "#fff0f0", border: "1px solid #ffd0d0", color: "#c0392b" }}
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: "#999" }}>
                {t("login.operatorId")}
              </label>
              <input
                type="email"
                required
                autoComplete="username"
                disabled={loading}
                className="w-full rounded-xl px-4 py-3 text-sm transition-all outline-none"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="you@euro-edu-jobs.eu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: "#999" }}>
                {t("login.passcode")}
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                disabled={loading}
                className="w-full rounded-xl px-4 py-3 text-sm transition-all outline-none"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {/* 2FA TOTP — only shown when required */}
            {requires2FA && (
              <div className="space-y-1.5">
                <div
                  className="p-3 rounded-xl text-xs font-medium"
                  style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}
                >
                  Enter the 6-digit code from your Authenticator app.
                </div>
                <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: "#999" }}>
                  Authenticator Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  disabled={loading}
                  className="w-full rounded-xl px-4 py-3 text-center font-mono tracking-[0.4em] text-xl transition-all outline-none"
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
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
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-black uppercase tracking-widest text-sm transition-all hover:opacity-90 mt-2"
              style={{
                background: loading ? "#d0d0d0" : LIME,
                color: DARK,
                boxShadow: loading ? "none" : `0 4px 24px ${LIME}66`,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke={DARK} strokeWidth="4" />
                    <path className="opacity-75" fill={DARK} d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Verifying…
                </>
              ) : (
                t("login.submit")
              )}
            </button>

          </form>

          <p className="text-center text-[10px] font-mono mt-8" style={{ color: "#ccc" }}>
            {t("login.unauthorized")}
          </p>

        </div>
      </div>
    </div>
  );
}
