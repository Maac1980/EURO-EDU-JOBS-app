import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Shield, ChevronRight } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
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
      setError("Invalid security credentials. Access denied.");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background">
      {/* Background Image & Effects */}
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/login-bg.png`}
          alt="Command Center Background"
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
      </div>

      {/* Grid dot pattern */}
      <div
        className="absolute inset-0 z-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="w-full max-w-md z-10 p-8 animate-fadeIn">
        <div className="mb-10 text-center">
          <div className="mx-auto w-20 h-20 bg-black/50 border border-primary/30 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,240,255,0.2)]">
            <img
              src={`${import.meta.env.BASE_URL}images/logo.png`}
              alt="Apatris Logo"
              className="w-12 h-12 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-widest uppercase">
            Apatris <span className="text-primary">Compliance</span>
          </h1>
          <p className="text-muted-foreground font-mono text-sm mt-2">
            SECURE COMPLIANCE TERMINAL
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl"
        >
          {error && (
            <div className="p-3 rounded bg-destructive/10 border border-destructive/30 text-destructive text-sm font-mono text-center">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground tracking-widest uppercase">
              Operator ID
            </label>
            <input
              type="email"
              required
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-white/20"
              placeholder="admin@apatris.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground tracking-widest uppercase">
              Passcode
            </label>
            <input
              type="password"
              required
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-white/20"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="w-full relative group overflow-hidden rounded-lg bg-primary/10 border border-primary text-primary px-4 py-3 font-bold uppercase tracking-widest transition-all hover:bg-primary hover:text-black mt-4"
          >
            <div className="flex items-center justify-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Initialize Session</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </form>

        <p className="text-center text-xs font-mono text-muted-foreground mt-8 opacity-50">
          UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED
        </p>
      </div>
    </div>
  );
}
