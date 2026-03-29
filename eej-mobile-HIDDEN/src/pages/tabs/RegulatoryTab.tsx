import { useEffect, useState } from "react";
import { Scale, AlertTriangle, Info, Shield, RefreshCw, ExternalLink, CheckCircle } from "lucide-react";
import { fetchRegulatoryUpdates, triggerRegulatoryScan, markUpdateRead } from "@/lib/api";
import { useToast } from "@/lib/toast";

interface RegulatoryUpdate {
  id: string;
  source: string;
  title: string;
  summary: string;
  category: string;
  severity: string;
  fineAmount?: string;
  workersAffected?: number;
  costImpact?: string;
  deadlineChange?: string;
  actionRequired?: string[];
  sourceUrls?: { url: string; title?: string }[];
  fetchedAt?: string;
  readByAdmin?: boolean;
}

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "work_permits", label: "Work Permits" },
  { id: "zus", label: "ZUS" },
  { id: "labor_law", label: "Labor Law" },
  { id: "eu_law", label: "EU Law" },
  { id: "fines", label: "Fines" },
  { id: "reporting", label: "Reporting" },
];

export default function RegulatoryTab() {
  const { showToast } = useToast();
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [category, setCategory] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadUpdates();
  }, [category]);

  function loadUpdates() {
    setLoading(true);
    fetchRegulatoryUpdates(category === "all" ? undefined : category)
      .then(setUpdates)
      .catch(() => setUpdates([]))
      .finally(() => setLoading(false));
  }

  async function handleScan() {
    setScanning(true);
    try {
      await triggerRegulatoryScan();
      showToast("Regulatory scan complete", "success");
      loadUpdates();
    } catch {
      showToast("Scan failed", "error");
    }
    setScanning(false);
  }

  async function handleRead(id: string) {
    try {
      await markUpdateRead(id);
      setUpdates((prev) => prev.map((u) => (u.id === id ? { ...u, readByAdmin: true } : u)));
      showToast("Marked as read", "info");
    } catch {
      showToast("Failed to mark as read", "error");
    }
  }

  const criticalCount = updates.filter((u) => u.severity === "critical").length;
  const warningCount = updates.filter((u) => u.severity === "warning").length;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Compliance</div>
          <div className="tab-greeting-name">Regulatory Intelligence</div>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1.5px solid #1B2A4A",
            background: "#1B2A4A",
            color: "#FFD600",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            opacity: scanning ? 0.5 : 1,
          }}
        >
          <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning..." : "Scan Now"}
        </button>
      </div>

      {/* Severity summary */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#FEF2F2", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#DC2626" }}>{criticalCount}</div>
          <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 500 }}>Critical</div>
        </div>
        <div style={{ flex: 1, background: "#FFFBEB", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#D97706" }}>{warningCount}</div>
          <div style={{ fontSize: 11, color: "#D97706", fontWeight: 500 }}>Warnings</div>
        </div>
        <div style={{ flex: 1, background: "#EFF6FF", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#3B82F6" }}>{updates.length}</div>
          <div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 500 }}>Total</div>
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            style={{
              flexShrink: 0,
              padding: "5px 12px",
              borderRadius: 20,
              border: category === c.id ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB",
              background: category === c.id ? "#1B2A4A" : "#fff",
              color: category === c.id ? "#FFD600" : "#6B7280",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading updates...</div>}

      {!loading && updates.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
          <Scale size={28} />
          <div style={{ marginTop: 8, fontSize: 14 }}>No regulatory updates</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Tap "Scan Now" to check for changes</div>
        </div>
      )}

      {updates.map((u) => {
        const expanded = expandedId === u.id;
        return (
          <div
            key={u.id}
            onClick={() => {
              setExpandedId(expanded ? null : u.id);
              if (!u.readByAdmin) handleRead(u.id);
            }}
            style={{
              background: "#fff",
              border: `1.5px solid ${u.severity === "critical" ? "#FECACA" : u.severity === "warning" ? "#FED7AA" : "#E5E7EB"}`,
              borderRadius: 14,
              padding: 14,
              marginBottom: 8,
              cursor: "pointer",
              opacity: u.readByAdmin ? 0.75 : 1,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <SeverityIcon severity={u.severity} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{u.title}</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{u.source} · {u.category?.replace("_", " ")}</div>
              </div>
              {u.readByAdmin && <CheckCircle size={14} color="#9CA3AF" />}
            </div>

            <div style={{ fontSize: 13, color: "#374151", marginTop: 8, lineHeight: 1.5 }}>
              {expanded ? (u.summary ?? "") : ((u.summary ?? "").slice(0, 120) + ((u.summary ?? "").length > 120 ? "..." : ""))}
            </div>

            {expanded && (
              <div style={{ marginTop: 10 }}>
                {u.fineAmount && (
                  <div style={detailStyle}>
                    <span style={{ color: "#DC2626", fontWeight: 600 }}>Fine:</span> {u.fineAmount}
                  </div>
                )}
                {u.workersAffected !== undefined && u.workersAffected > 0 && (
                  <div style={detailStyle}>
                    <span style={{ fontWeight: 600 }}>Workers Affected:</span> {u.workersAffected}
                  </div>
                )}
                {u.costImpact && (
                  <div style={detailStyle}>
                    <span style={{ fontWeight: 600 }}>Cost Impact:</span> {u.costImpact}
                  </div>
                )}
                {u.actionRequired && u.actionRequired.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginBottom: 4 }}>Action Required:</div>
                    {u.actionRequired.map((a, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#374151", paddingLeft: 8, borderLeft: "2px solid #FFD600", marginBottom: 4 }}>
                        {a}
                      </div>
                    ))}
                  </div>
                )}
                {u.sourceUrls && u.sourceUrls.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {u.sourceUrls.map((s, i) => (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noopener"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 11, color: "#3B82F6", display: "inline-flex", alignItems: "center", gap: 2 }}
                      >
                        <ExternalLink size={10} /> {s.title ?? "Source"}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
              {u.fetchedAt ? new Date(u.fetchedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
            </div>
          </div>
        );
      })}
      <div style={{ height: 100 }} />
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical")
    return <div style={{ width: 28, height: 28, borderRadius: 8, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <AlertTriangle size={15} color="#DC2626" />
    </div>;
  if (severity === "warning")
    return <div style={{ width: 28, height: 28, borderRadius: 8, background: "#FFFBEB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <AlertTriangle size={15} color="#D97706" />
    </div>;
  return <div style={{ width: 28, height: 28, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <Info size={15} color="#3B82F6" />
  </div>;
}

const detailStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#374151",
  marginTop: 4,
};
