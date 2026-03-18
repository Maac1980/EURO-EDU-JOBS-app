import { useAuth } from "@/lib/auth";
import type { Role } from "@/types";

const TIERS: {
  role: Role;
  tier: number;
  label: string;
  subtitle: string;
  icon: string;
  accent: string;
}[] = [
  {
    role: "executive",
    tier: 1,
    label: "Executive Board & Finance",
    subtitle: "Full platform · Revenue · ZUS · Payroll",
    icon: "👑",
    accent: "#FFD600",
  },
  {
    role: "legal",
    tier: 2,
    label: "Head of Legal & Client Relations",
    subtitle: "Compliance · TRC · BHP · B2B Contracts",
    icon: "⚖️",
    accent: "#1B2A4A",
  },
  {
    role: "operations",
    tier: 3,
    label: "Workforce & Commercial Operations",
    subtitle: "Pipeline · Add Candidates · Contracts",
    icon: "⚙️",
    accent: "#2D6A9F",
  },
  {
    role: "candidate",
    tier: 4,
    label: "Candidate",
    subtitle: "My Profile · My Documents",
    icon: "👤",
    accent: "#1A6B4A",
  },
];

export default function Login() {
  const { login } = useAuth();

  return (
    <div className="eej-screen">
      <div className="eej-container">

        {/* Brand Header */}
        <div className="login-hero">
          <div className="eej-logo-mark">
            <span>EEJ</span>
          </div>
          <h1 className="login-title">Euro Edu Jobs</h1>
          <p className="login-subtitle">Enterprise Workforce Platform</p>
          <div className="login-divider" />
        </div>

        {/* Designation Buttons */}
        <div className="login-roles">
          <p className="login-hint">Select your designation to continue</p>
          <div className="login-role-grid">
            {TIERS.map(({ role, tier, label, subtitle, icon, accent }) => (
              <button
                key={role}
                className="role-btn"
                style={{ borderLeftColor: accent }}
                onClick={() => login(role)}
              >
                <span className="role-btn-icon">{icon}</span>
                <span className="role-btn-content">
                  <span className="role-btn-label">{label}</span>
                  <span className="role-btn-sub">{subtitle}</span>
                </span>
                <span className="tier-chip" style={{ background: accent === "#FFD600" ? "#1B2A4A" : accent, color: accent === "#FFD600" ? "#FFD600" : "#fff" }}>
                  T{tier}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="login-footer">
          © 2026 Euro Edu Jobs · Secure Access Portal · RBAC v3
        </p>
      </div>
    </div>
  );
}
