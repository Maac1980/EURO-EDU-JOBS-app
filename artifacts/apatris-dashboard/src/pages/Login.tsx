import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";

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
    <div className="h-screen w-full flex bg-background overflow-hidden">

      {/* ── Left: Brand image ───────────────────────────────── */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80"
          alt="EURO EDU JOBS"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-background" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/20" />
        <div className="absolute bottom-10 left-10 right-16">
          <p className="text-white/30 font-mono text-xs tracking-widest uppercase">
            EURO EDU JOBS · INTERNATIONAL EDUCATION RECRUITMENT · EST. EUROPE
          </p>
        </div>
      </div>

      {/* ── Right: Login panel ──────────────────────────────── */}
      <div className="w-full lg:w-[460px] flex flex-col justify-center items-center h-full overflow-y-auto relative bg-background border-l border-white/5 px-8 py-10">

        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Card */}
        <div className="relative z-10 w-full max-w-sm">

          {/* Brand mark */}
          <div className="text-center mb-8">
            <div className="w-14 h-1 mx-auto mb-6 rounded-full" style={{ background: "#1e40af" }} />
            <div
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center mx-auto mb-4"
              style={{ boxShadow: "0 0 0 3px #1e40af, 0 0 20px rgba(30,64,175,0.25)" }}
            >
              <span
                className="text-2xl font-black tracking-tighter"
                style={{ color: "#1e40af", fontFamily: "Arial Black, Arial, sans-serif" }}
              >
                EEJ
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-[0.15em] uppercase leading-none">
              EURO EDU JOBS
            </h1>
            <p className="text-gray-400 text-sm tracking-wider uppercase mt-3 leading-snug">
              International Education Recruitment Portal
            </p>
            <div className="flex items-center gap-3 mt-5">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
              <span className="text-gray-500 font-mono text-xs tracking-widest uppercase">
                {t("login.terminal")}
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
            </div>
          </div>

          {/* Form card */}
          <div className="bg-gray-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-5">

              {error && (
                <div className="p-3 rounded-lg border text-sm text-center" style={{ background: "rgba(30,64,175,0.15)", borderColor: "rgba(30,64,175,0.4)", color: "#93c5fd" }}>
                  {error}
                </div>
              )}

              {/* Operator ID */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-300 tracking-widest uppercase">
                  {t("login.operatorId")}
                </label>
                <input
                  type="email"
                  required
                  className="w-full bg-gray-800 border border-gray-500 rounded-lg px-4 py-3 text-white text-sm transition-all placeholder:text-gray-500"
                  style={{ outline: "none" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#1e40af"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(30,64,175,0.3)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
                  placeholder="admin@euroedu.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {/* Passcode */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-300 tracking-widest uppercase">
                  {t("login.passcode")}
                </label>
                <input
                  type="password"
                  required
                  className="w-full bg-gray-800 border border-gray-500 rounded-lg px-4 py-3 text-white text-sm transition-all placeholder:text-gray-500"
                  style={{ outline: "none" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#1e40af"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(30,64,175,0.3)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 transition-all rounded-lg px-4 py-3 text-white font-bold uppercase tracking-widest text-sm mt-2 shadow-lg hover:opacity-90"
                style={{ background: "#1e40af", boxShadow: "0 4px 20px rgba(30,64,175,0.35)" }}
              >
                <Shield className="w-4 h-4" />
                <span>{t("login.submit")}</span>
              </button>
            </form>
          </div>

          {/* Default credentials hint */}
          <div className="mt-5 p-3 rounded-lg border border-white/5 bg-white/3 text-center space-y-1">
            <p className="text-xs font-mono text-gray-500">{t("login.defaultCredentials")}</p>
            <p className="text-xs font-mono" style={{ color: "rgba(147,197,253,0.8)" }}>admin@apatris.com &nbsp;/&nbsp; apatris2024</p>
          </div>

          <p className="text-center text-xs font-mono text-gray-600 mt-4">
            {t("login.unauthorized")}
          </p>
        </div>
      </div>
    </div>
  );
}
