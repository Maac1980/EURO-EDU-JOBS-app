import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff, Fingerprint, Wifi } from "lucide-react";

const DEMO_ACCOUNTS = [
  { tier: "T1", email: "ceo@euro-edu-jobs.eu",   name: "Anna Brzozowska",  label: "Executive" },
  { tier: "T2", email: "legal@euro-edu-jobs.eu",  name: "Marta Wiśniewska", label: "Legal" },
  { tier: "T3", email: "ops@euro-edu-jobs.eu",    name: "Piotr Nowak",      label: "Operations" },
  { tier: "T4", email: "n.petrenko@eej.eu",       name: "Natalia Petrenko", label: "Candidate" },
  { tier: "T4", email: "m.kowalski@eej.eu",       name: "Mariusz Kowalski", label: "Candidate" },
  { tier: "T4", email: "d.shevchenko@eej.eu",     name: "Daria Shevchenko", label: "Candidate" },
  { tier: "T4", email: "a.alrashid@eej.eu",       name: "Ahmed Al-Rashid",  label: "Candidate" },
  { tier: "T4", email: "o.bondar@eej.eu",         name: "Oleksandr Bondar", label: "Candidate" },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [showAccounts, setShowAccounts] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Please enter your email and password."); return; }
    setError(null);
    setLoading(true);
    setTimeout(() => {
      const err = login(email, password);
      setLoading(false);
      if (err) setError(err);
    }, 700);
  }

  function fillAccount(acEmail: string) {
    setEmail(acEmail);
    setPassword("EEJ2026!");
    setError(null);
    setShowAccounts(false);
  }

  return (
    <div className="g3-root">

      {/* Geometric background nodes */}
      <div className="g3-geo" aria-hidden="true">
        <div className="g3-node" style={{ top: "8%",  left: "12%" }} />
        <div className="g3-node" style={{ top: "15%", left: "72%" }} />
        <div className="g3-node" style={{ top: "28%", left: "88%" }} />
        <div className="g3-node" style={{ top: "42%", left: "6%"  }} />
        <div className="g3-node" style={{ top: "58%", left: "82%" }} />
        <div className="g3-node" style={{ top: "72%", left: "18%" }} />
        <div className="g3-node" style={{ top: "85%", left: "60%" }} />
        <div className="g3-node g3-node--lg" style={{ top: "20%", left: "40%" }} />
        <div className="g3-node g3-node--lg" style={{ top: "65%", left: "55%" }} />
        <svg className="g3-lines" viewBox="0 0 430 900" preserveAspectRatio="none">
          <line x1="52"  y1="72"  x2="310" y2="135" />
          <line x1="310" y1="135" x2="378" y2="252" />
          <line x1="52"  y1="72"  x2="26"  y2="378" />
          <line x1="26"  y1="378" x2="172" y2="585" />
          <line x1="378" y1="252" x2="352" y2="522" />
          <line x1="352" y1="522" x2="258" y2="765" />
          <line x1="172" y1="585" x2="77"  y2="648" />
          <line x1="310" y1="135" x2="172" y2="585" />
          <line x1="77"  y1="648" x2="258" y2="765" />
        </svg>
      </div>

      {/* Top bar */}
      <div className="g3-topbar">
        <div className="g3-logo-block">
          <div className="g3-logo-box">
            <span className="g3-logo-eej">EEJ</span>
            <span className="g3-logo-sub">euro edu and jobs</span>
          </div>
        </div>
        <span className="g3-portal-label">SECURE WORKFORCE PORTAL</span>
      </div>

      {/* Glassmorphic card */}
      <div className="g3-card">

        {/* Brand cluster */}
        <div className="g3-brand">
          <h1 className="g3-brand-name">EURO EDU JOBS</h1>
          <p className="g3-brand-sub">Enterprise Workforce Platform</p>
        </div>

        <div className="g3-heading">SIGN IN TO YOUR ACCOUNT</div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="g3-field">
            <label className="g3-label">Work Email</label>
            <input
              className={"g3-input" + (error ? " g3-input--err" : "")}
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              disabled={loading}
            />
          </div>

          <div className="g3-field">
            <label className="g3-label">Password</label>
            <div className="g3-pw-wrap">
              <input
                className={"g3-input g3-input--pw" + (error ? " g3-input--err" : "")}
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                disabled={loading}
              />
              <button type="button" className="g3-eye" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                {showPw ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
              </button>
            </div>
          </div>

          {error && <div className="g3-error">{error}</div>}

          <button type="submit" className="g3-signin-btn" disabled={loading}>
            {loading ? <span className="g3-spinner" /> : "SIGN IN"}
          </button>
        </form>

        <div className="g3-forgot">Forgot Password?</div>

        <button type="button" className="g3-register-btn" onClick={() => setShowAccounts(v => !v)}>
          {showAccounts ? "HIDE DEMO ACCOUNTS" : "REGISTER NEW DEVICE / ACCOUNT"}
        </button>

        {showAccounts && (
          <div className="g3-accounts-panel">
            <div className="g3-accounts-note">Tap any account to auto-fill · Password: <strong>EEJ2026!</strong></div>
            {DEMO_ACCOUNTS.map(ac => (
              <button key={ac.email} type="button" className="g3-account-row" onClick={() => fillAccount(ac.email)}>
                <span className="g3-account-tier">{ac.tier}</span>
                <span className="g3-account-info">
                  <span className="g3-account-name">{ac.name}</span>
                  <span className="g3-account-email">{ac.email}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="g3-bio">
          <Fingerprint size={20} className="g3-bio-icon" strokeWidth={1.5} />
          <span>Use Biometrics</span>
        </div>

      </div>

      {/* Footer */}
      <div className="g3-footer">
        <span>© 2026 Euro Edu Jobs · RBAC v3 · Secure Access</span>
        <Wifi size={13} strokeWidth={1.5} style={{ opacity: 0.5 }} />
      </div>

    </div>
  );
}
