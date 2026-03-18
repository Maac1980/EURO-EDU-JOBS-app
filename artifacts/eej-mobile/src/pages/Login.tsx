import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";

const DEMO_GROUPS = [
  {
    label: "Staff",
    accounts: [
      { tier: "T1", email: "ceo@euro-edu-jobs.eu",   name: "Anna Brzozowska",  role: "Executive" },
      { tier: "T2", email: "legal@euro-edu-jobs.eu",  name: "Marta Wiśniewska", role: "Legal" },
      { tier: "T3", email: "ops@euro-edu-jobs.eu",    name: "Piotr Nowak",      role: "Operations" },
    ],
  },
  {
    label: "Candidates",
    accounts: [
      { tier: "T4", email: "n.petrenko@eej.eu",   name: "Natalia Petrenko",  role: "Candidate" },
      { tier: "T4", email: "m.kowalski@eej.eu",   name: "Mariusz Kowalski",  role: "Candidate" },
      { tier: "T4", email: "d.shevchenko@eej.eu", name: "Daria Shevchenko",  role: "Candidate" },
      { tier: "T4", email: "a.alrashid@eej.eu",   name: "Ahmed Al-Rashid",   role: "Candidate" },
      { tier: "T4", email: "o.bondar@eej.eu",     name: "Oleksandr Bondar",  role: "Candidate" },
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
    <div className="lp2-bg">
      <div className="lp2-wrap">

        {/* ── Header bar ── */}
        <div className="lp2-topbar">
          <div className="lp2-topbar-logo">EEJ</div>
          <div className="lp2-topbar-label">SECURE PORTAL</div>
        </div>

        {/* ── Main card ── */}
        <div className="lp2-card">

          {/* Brand block */}
          <div className="lp2-brand">
            <div className="lp2-brand-icon">
              <span>EEJ</span>
            </div>
            <div className="lp2-brand-text">
              <div className="lp2-brand-name">EURO EDU JOBS</div>
              <div className="lp2-brand-sub">Enterprise Workforce Platform</div>
            </div>
          </div>

          <div className="lp2-divider" />

          {/* Form heading */}
          <div className="lp2-heading">Sign In to Your Account</div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>

            <div className="lp2-field">
              <label className="lp2-label">WORK EMAIL</label>
              <input
                className={"lp2-input" + (error ? " lp2-input--err" : "")}
                type="email"
                autoComplete="email"
                placeholder="you@euro-edu-jobs.eu"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                disabled={loading}
              />
            </div>

            <div className="lp2-field">
              <label className="lp2-label">PASSWORD</label>
              <div className="lp2-pw-wrap">
                <input
                  className={"lp2-input lp2-input--pw" + (error ? " lp2-input--err" : "")}
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null); }}
                  disabled={loading}
                />
                <button type="button" className="lp2-eye" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                  {showPw
                    ? <EyeOff size={18} color="#1B2A4A" strokeWidth={2} />
                    : <Eye    size={18} color="#1B2A4A" strokeWidth={2} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="lp2-error">
                <span className="lp2-error-bullet">&#9632;</span>
                {error}
              </div>
            )}

            <button type="submit" className="lp2-btn" disabled={loading}>
              {loading ? <span className="lp2-spinner" /> : "SIGN IN"}
            </button>

          </form>

          {/* Demo */}
          <div className="lp2-demo">
            <button type="button" className="lp2-demo-toggle" onClick={() => setShowDemo(v => !v)}>
              <span>Demo Accounts</span>
              {showDemo ? <ChevronUp size={13} strokeWidth={3} /> : <ChevronDown size={13} strokeWidth={3} />}
            </button>

            {showDemo && (
              <div className="lp2-demo-panel">
                <div className="lp2-demo-note">All passwords: <strong>EEJ2026!</strong></div>
                {DEMO_GROUPS.map(grp => (
                  <div key={grp.label} className="lp2-demo-group">
                    <div className="lp2-demo-group-label">{grp.label}</div>
                    {grp.accounts.map(acc => (
                      <button key={acc.email} type="button" className="lp2-demo-row" onClick={() => fillDemo(acc.email)}>
                        <span className="lp2-demo-tier">{acc.tier}</span>
                        <span className="lp2-demo-info">
                          <span className="lp2-demo-name">{acc.name}</span>
                          <span className="lp2-demo-email">{acc.email}</span>
                        </span>
                        <span className="lp2-demo-use">USE</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="lp2-footer">
          © 2026 Euro Edu Jobs &nbsp;·&nbsp; RBAC v3 &nbsp;·&nbsp; Secure Access
        </div>

      </div>
    </div>
  );
}
