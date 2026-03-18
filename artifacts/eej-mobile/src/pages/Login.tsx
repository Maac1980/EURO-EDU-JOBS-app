import { useAuth } from "@/lib/auth";
import type { Role } from "@/types";

const ROLES: { role: Role; label: string; subtitle: string }[] = [
  { role: "owner",   label: "Login as Owner",        subtitle: "Full platform access" },
  { role: "manager", label: "Login as Manager",       subtitle: "Team & compliance overview" },
  { role: "office",  label: "Login as Office Staff",  subtitle: "Recruitment & candidate ops" },
  { role: "worker",  label: "Login as Worker",        subtitle: "My documents & timesheets" },
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
          <p className="login-subtitle">Workforce Management Portal</p>
          <div className="login-divider" />
        </div>

        {/* Role Buttons */}
        <div className="login-roles">
          <p className="login-hint">Select your role to continue</p>
          <div className="login-role-grid">
            {ROLES.map(({ role, label, subtitle }) => (
              <button
                key={role}
                className="role-btn"
                onClick={() => login(role)}
              >
                <span className="role-btn-icon">{roleIcon(role)}</span>
                <span className="role-btn-content">
                  <span className="role-btn-label">{label}</span>
                  <span className="role-btn-sub">{subtitle}</span>
                </span>
                <span className="role-btn-arrow">›</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="login-footer">
          © 2026 Euro Edu Jobs · Secure Access Portal
        </p>
      </div>
    </div>
  );
}

function roleIcon(role: Role) {
  if (role === "owner")   return "👑";
  if (role === "manager") return "📊";
  if (role === "office")  return "🗂️";
  return "👤";
}
