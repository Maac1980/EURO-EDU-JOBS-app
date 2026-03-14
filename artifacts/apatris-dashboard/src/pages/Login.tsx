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
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const success = login(email, password);
    if (success) {
      setLocation("/");
    } else {
      setError(t("login.invalidCredentials"));
    }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden" style={{ background: "#f5f5f5" }}>

      {/* ── Left: Lime brand panel ───────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-center items-center flex-1 relative"
        style={{ background: LIME }}
      >
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, ${DARK} 0px, transparent 1px, transparent 40px),
                              repeating-linear-gradient(90deg, ${DARK} 0px, transparent 1px, transparent 40px)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative z-10 text-center px-12 select-none">
          {/* Logo square */}
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
        {/* Bottom tagline */}
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

          {/* Mobile logo (shown on small screens) */}
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
            {/* Lime accent bar */}
            <div className="mt-3 h-1 w-12 rounded-full" style={{ background: LIME }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {error && (
              <div
                className="p-3 rounded-lg text-sm font-medium"
                style={{ background: `${LIME}22`, border: `1px solid ${LIME}88`, color: DARK }}
              >
                {error}
              </div>
            )}

            {/* Operator ID */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "#888" }}>
                {t("login.operatorId")}
              </label>
              <input
                type="email"
                required
                className="w-full rounded-xl px-4 py-3 text-sm transition-all outline-none"
                style={{
                  background: "#f5f5f5",
                  border: "2px solid #e5e5e5",
                  color: DARK,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = LIME;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${LIME}40`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e5e5";
                  e.currentTarget.style.boxShadow = "none";
                }}
                placeholder="admin@euro-edu-jobs.eu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Passcode */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "#888" }}>
                {t("login.passcode")}
              </label>
              <input
                type="password"
                required
                className="w-full rounded-xl px-4 py-3 text-sm transition-all outline-none"
                style={{
                  background: "#f5f5f5",
                  border: "2px solid #e5e5e5",
                  color: DARK,
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

            {/* Submit */}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-black uppercase tracking-widest text-sm transition-all hover:opacity-90 shadow-lg mt-2"
              style={{
                background: LIME,
                color: DARK,
                boxShadow: `0 4px 20px ${LIME}55`,
              }}
            >
              <span>{t("login.submit")}</span>
            </button>
          </form>

          {/* Credentials hint */}
          <div
            className="mt-6 p-3 rounded-xl text-center space-y-1"
            style={{ background: "#f5f5f5", border: "1px solid #e5e5e5" }}
          >
            <p className="text-xs font-mono" style={{ color: "#aaa" }}>
              {t("login.defaultCredentials")}
            </p>
            <p className="text-xs font-mono font-bold" style={{ color: DARK }}>
              {(import.meta.env.VITE_ADMIN_EMAIL as string | undefined) ?? "admin@euro-edu-jobs.eu"} &nbsp;/&nbsp; ••••••
            </p>
          </div>

          <p className="text-center text-[10px] font-mono mt-5" style={{ color: "#ccc" }}>
            {t("login.unauthorized")}
          </p>
        </div>
      </div>
    </div>
  );
}
