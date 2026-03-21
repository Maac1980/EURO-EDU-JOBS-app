import { useToast } from "@/lib/toast";

const TOAST_CONFIG = {
  success: { bg: "#ECFDF5", border: "#6EE7B7", text: "#065F46", icon: "✓" },
  error:   { bg: "#FEF2F2", border: "#FCA5A5", text: "#991B1B", icon: "✕" },
  info:    { bg: "#EFF6FF", border: "#93C5FD", text: "#1E3A8A", icon: "ℹ" },
};

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => {
        const cfg = TOAST_CONFIG[t.type];
        return (
          <div
            key={t.id}
            className="toast-item"
            style={{
              background: cfg.bg,
              border: `1.5px solid ${cfg.border}`,
              color: cfg.text,
            }}
            onClick={() => dismiss(t.id)}
          >
            <span className="toast-icon"
              style={{ background: cfg.border, color: cfg.text }}>
              {cfg.icon}
            </span>
            <span className="toast-message">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
