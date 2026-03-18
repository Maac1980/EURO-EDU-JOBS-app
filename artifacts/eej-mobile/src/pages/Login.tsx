import { useState } from "react";
import { useAuth, CREDENTIALS } from "@/lib/auth";
import { Eye, EyeOff, ChevronDown, ChevronUp, LogIn } from "lucide-react";

const DEMO_GROUPS = [
  {
    label: "Staff Access",
    color: "#1B2A4A",
    accounts: [
      { tier: "T1", email: "ceo@euro-edu-jobs.eu",   role: "Executive Board & Finance" },
      { tier: "T2", email: "legal@euro-edu-jobs.eu",  role: "Head of Legal & Compliance" },
      { tier: "T3", email: "ops@euro-edu-jobs.eu",    role: "Workforce & Operations" },
    ],
  },
  {
    label: "Candidate Portals",
    color: "#1A6B4A",
    accounts: [
      { tier: "T4", email: "n.petrenko@eej.eu",   role: "Natalia Petrenko" },
      { tier: "T4", email: "m.kowalski@eej.eu",   role: "Mariusz Kowalski" },
      { tier: "T4", email: "d.shevchenko@eej.eu", role: "Daria Shevchenko" },
      { tier: "T4", email: "a.alrashid@eej.eu",   role: "Ahmed Al-Rashid" },
      { tier: "T4", email: "o.bondar@eej.eu",     role: "Oleksandr Bondar" },
    ],
  },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [showDemo, setShowDemo]   = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    setTimeout(() => {
      const err = login(email, password);
      setLoading(false);
      if (err) setError(err);
    }, 600);
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("EEJ2026!");
    setError(null);
    setShowDemo(false);
  }

  return (
    <div className="eej-screen">
      <div className="eej-container">

        <div className="login-hero">
          <div className="eej-logo-mark"><span>EEJ</span></div>
          <h1 className="login-title">Euro Edu Jobs</h1>
          <p className="login-subtitle">Enterprise Workforce Platform</p>
          <div className="login-divider" />
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field-group">
            <label className="login-label">Work Email</label>
            <input
              className={"login-input" + (error ? " login-input--error" : "")}
              type="email"
              autoComplete="email"
              placeholder="you@euro-edu-jobs.eu"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              disabled={loading}
            />
          </div>

          <div className="login-field-group" style={{ marginTop: 14 }}>
            <label className="login-label">Password</label>
            <div className="login-pw-wrap">
              <input
                className={"login-input login-input--pw" + (error ? " login-input--error" : "")}
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                disabled={loading}
              />
              <button
                type="button"
                className="login-pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                tabIndex={-1}
              >
                {showPw
                  ? <EyeOff size={16} color="#9CA3AF" strokeWidth={2} />
                  : <Eye    size={16} color="#9CA3AF" strokeWidth={2} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error-msg">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="login-spinner" />
            ) : (
              <>
                <LogIn size={17} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="login-demo-section">
          <button
            className="login-demo-toggle"
            onClick={() => setShowDemo((v) => !v)}
          >
            <span>Demo Credentials</span>
            {showDemo
              ? <ChevronUp size={15} strokeWidth={2.5} />
              : <ChevronDown size={15} strokeWidth={2.5} />}
          </button>

          {showDemo && (
            <div className="login-demo-panel">
              <div className="login-demo-pw-note">All accounts use password: <strong>EEJ2026!</strong></div>
              {DEMO_GROUPS.map((grp) => (
                <div key={grp.label} className="login-demo-group">
                  <div className="login-demo-group-label" style={{ color: grp.color }}>{grp.label}</div>
                  {grp.accounts.map((acc) => (
                    <button
                      key={acc.email}
                      className="login-demo-row"
                      onClick={() => fillDemo(acc.email)}
                    >
                      <span className="login-demo-tier" style={{ background: grp.color }}>{acc.tier}</span>
                      <span className="login-demo-info">
                        <span className="login-demo-name">{acc.role}</span>
                        <span className="login-demo-email">{acc.email}</span>
                      </span>
                      <span className="login-demo-fill">Fill →</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="login-footer">
          © 2026 Euro Edu Jobs · Secure Access Portal · RBAC v3
        </p>
      </div>
    </div>
  );
}
