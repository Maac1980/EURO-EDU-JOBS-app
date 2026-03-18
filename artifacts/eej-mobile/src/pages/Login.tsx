import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";

const DEMO_GROUPS = [
  {
    label: "Staff",
    color: "#1B2A4A",
    accounts: [
      { tier: "T1", email: "ceo@euro-edu-jobs.eu",   name: "Anna Brzozowska",    role: "Executive" },
      { tier: "T2", email: "legal@euro-edu-jobs.eu",  name: "Marta Wiśniewska",   role: "Legal" },
      { tier: "T3", email: "ops@euro-edu-jobs.eu",    name: "Piotr Nowak",        role: "Operations" },
    ],
  },
  {
    label: "Candidates",
    color: "#1A6B4A",
    accounts: [
      { tier: "T4", email: "n.petrenko@eej.eu",   name: "Natalia Petrenko",   role: "Candidate" },
      { tier: "T4", email: "m.kowalski@eej.eu",   name: "Mariusz Kowalski",   role: "Candidate" },
      { tier: "T4", email: "d.shevchenko@eej.eu", name: "Daria Shevchenko",   role: "Candidate" },
      { tier: "T4", email: "a.alrashid@eej.eu",   name: "Ahmed Al-Rashid",    role: "Candidate" },
      { tier: "T4", email: "o.bondar@eej.eu",     name: "Oleksandr Bondar",   role: "Candidate" },
    ],
  },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);

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
    }, 700);
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("EEJ2026!");
    setError(null);
    setShowDemo(false);
  }

  return (
    <div className="lp-root">

      {/* ── TOP BRAND AREA ── */}
      <div className="lp-brand">
        <div className="lp-logo">
          <span>EEJ</span>
        </div>
        <h1 className="lp-name">Euro Edu Jobs</h1>
        <p className="lp-tagline">Enterprise Workforce Platform</p>
        <div className="lp-dots">
          <span /><span /><span />
        </div>
      </div>

      {/* ── BOTTOM FORM CARD ── */}
      <div className="lp-card">
        <p className="lp-card-heading">Welcome back</p>
        <p className="lp-card-sub">Sign in to your account</p>

        <form onSubmit={handleSubmit} noValidate>

          {/* Email */}
          <div className="lp-field">
            <label className="lp-label">Work Email</label>
            <input
              className={"lp-input" + (error ? " lp-input--err" : "")}
              type="email"
              autoComplete="email"
              placeholder="you@euro-edu-jobs.eu"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="lp-field" style={{ marginTop: 14 }}>
            <label className="lp-label">Password</label>
            <div className="lp-pw-wrap">
              <input
                className={"lp-input lp-input--pw" + (error ? " lp-input--err" : "")}
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                disabled={loading}
              />
              <button
                type="button"
                className="lp-eye"
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
              >
                {showPw
                  ? <EyeOff size={17} color="#9CA3AF" strokeWidth={2} />
                  : <Eye    size={17} color="#9CA3AF" strokeWidth={2} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="lp-error">
              <span className="lp-error-icon">!</span>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="lp-btn"
            disabled={loading}
          >
            {loading
              ? <span className="lp-spinner" />
              : "Sign In"}
          </button>
        </form>

        {/* Demo credentials */}
        <div className="lp-demo">
          <button
            type="button"
            className="lp-demo-toggle"
            onClick={() => setShowDemo(v => !v)}
          >
            <span>Demo accounts</span>
            {showDemo
              ? <ChevronUp  size={14} strokeWidth={2.5} />
              : <ChevronDown size={14} strokeWidth={2.5} />}
          </button>

          {showDemo && (
            <div className="lp-demo-panel">
              <p className="lp-demo-note">Password for all: <strong>EEJ2026!</strong></p>

              {DEMO_GROUPS.map(grp => (
                <div key={grp.label} className="lp-demo-group">
                  <div className="lp-demo-group-label" style={{ color: grp.color }}>
                    {grp.label}
                  </div>
                  {grp.accounts.map(acc => (
                    <button
                      key={acc.email}
                      type="button"
                      className="lp-demo-row"
                      onClick={() => fillDemo(acc.email)}
                    >
                      <span className="lp-demo-badge" style={{ background: grp.color }}>
                        {acc.tier}
                      </span>
                      <span className="lp-demo-info">
                        <span className="lp-demo-name">{acc.name}</span>
                        <span className="lp-demo-email">{acc.email}</span>
                      </span>
                      <span className="lp-demo-fill">Use →</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="lp-footer">© 2026 Euro Edu Jobs · RBAC v3</p>
      </div>
    </div>
  );
}
