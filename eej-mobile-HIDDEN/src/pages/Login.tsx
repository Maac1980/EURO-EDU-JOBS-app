import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LangToggle } from "@/components/LangToggle";
import { Eye, EyeOff, Fingerprint, Wifi } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(t("auth.emailPasswordRequired"));
      return;
    }
    setError(null);
    setLoading(true);
    const err = await login(email, password);
    setLoading(false);
    if (err) setError(err);
  }

  return (
    <div className="g3-root">

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

      <div className="g3-topbar" style={{ position: "relative" }}>
        <div className="g3-logo-block">
          <div className="g3-logo-box">
            <span className="g3-logo-eej">EEJ</span>
            <span className="g3-logo-sub">euro edu and jobs</span>
          </div>
        </div>
        <span className="g3-portal-label">{t("auth.portalLabel")}</span>
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <LangToggle />
        </div>
      </div>

      <div className="g3-card">
        <div className="g3-brand">
          <h1 className="g3-brand-name">EURO EDU JOBS</h1>
          <p className="g3-brand-sub">{t("auth.brandSubtitle")}</p>
        </div>

        <div className="g3-heading">{t("auth.signInHeading")}</div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="g3-field">
            <label className="g3-label">{t("auth.workEmailLabel")}</label>
            <input
              className={"g3-input" + (error ? " g3-input--err" : "")}
              type="email"
              name="email"
              autoComplete="username"
              placeholder="name@company.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              disabled={loading}
            />
          </div>

          <div className="g3-field">
            <label className="g3-label">{t("auth.password")}</label>
            <div className="g3-pw-wrap">
              <input
                className={"g3-input g3-input--pw" + (error ? " g3-input--err" : "")}
                type={showPw ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder={t("auth.passwordPlaceholder")}
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
            {loading ? <span className="g3-spinner" /> : t("auth.signInButton")}
          </button>
        </form>

        <div className="g3-forgot">{t("auth.forgotPassword")}</div>

        <div className="g3-bio">
          <Fingerprint size={20} className="g3-bio-icon" strokeWidth={1.5} />
          <span>{t("auth.useBiometrics")}</span>
        </div>
      </div>

      <div className="g3-footer">
        <span>© 2026 Euro Edu Jobs · RBAC v3 · Secure Access</span>
        <Wifi size={13} strokeWidth={1.5} style={{ opacity: 0.5 }} />
      </div>

    </div>
  );
}
