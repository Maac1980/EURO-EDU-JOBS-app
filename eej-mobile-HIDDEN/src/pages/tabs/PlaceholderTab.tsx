interface Props { emoji: string; title: string; description: string; }

export default function PlaceholderTab({ emoji, title, description }: Props) {
  return (
    <div className="tab-page" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: "0 32px" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>{emoji}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>{title}</div>
        <div style={{ fontSize: 14, color: "#6B7280", marginTop: 8, lineHeight: 1.6 }}>{description}</div>
        <div className="dash-coming-soon" style={{ margin: "20px auto 0", display: "inline-flex" }}>
          <span>⚡</span> Coming in next phase
        </div>
      </div>
    </div>
  );
}
