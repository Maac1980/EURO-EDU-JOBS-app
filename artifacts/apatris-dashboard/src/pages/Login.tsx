import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      setLocation("/");
    } else {
      setError(result.error ?? "Login failed");
    }
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
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0b101e", letterSpacing: "0.08em", marginBottom: 6 }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="anna.b@edu-jobs.eu"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "2px solid #e5e7eb", fontSize: 14, color: "#0b101e", marginBottom: 20, outline: "none" }}
              onFocus={e => e.currentTarget.style.borderColor = "#d4e84b"}
              onBlur={e => e.currentTarget.style.borderColor = "#e5e7eb"} />

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0b101e", letterSpacing: "0.08em", marginBottom: 6 }}>PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "2px solid #e5e7eb", fontSize: 14, color: "#0b101e", marginBottom: 28, outline: "none" }}
              onFocus={e => e.currentTarget.style.borderColor = "#d4e84b"}
              onBlur={e => e.currentTarget.style.borderColor = "#e5e7eb"} />

            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: "#d4e84b", color: "#0b101e",
                fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(212,232,75,0.3)", opacity: loading ? 0.7 : 1 }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? "AUTHENTICATING..." : "INITIALIZE SESSION"}
            </button>
          </form>

          <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 24 }}>
            Euro Edu Jobs Sp. z o.o. · Warsaw, Poland
          </p>
        </div>
      </div>
    </div>
  );
}
