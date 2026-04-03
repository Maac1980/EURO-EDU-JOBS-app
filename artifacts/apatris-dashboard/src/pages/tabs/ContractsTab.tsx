import { useEffect, useState } from "react";
import { FileText, Download, User, Calendar } from "lucide-react";
import { fetchWorkers } from "@/lib/api";
import { useToast } from "@/lib/toast";

interface Worker {
  id: string;
  name: string;
  contractType?: string;
  contractEndDate?: string;
  assignedSite?: string;
  jobRole?: string;
}

export default function ContractsTab() {
  const { showToast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkers()
      .then((w) => setWorkers(w.filter((x: Worker) => x.contractType)))
      .catch(() => setWorkers([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate(workerId: string, type: string) {
    setGenerating(workerId);
    try {
      const res = await fetch(`/api/contracts/generate/${workerId}?type=${type}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("eej_token")}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `contract-${workerId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Contract PDF generated", "success");
      } else {
        showToast("Failed to generate PDF", "error");
      }
    } catch {
      showToast("Failed to generate PDF", "error");
    }
    setGenerating(null);
  }

  const expiringCount = workers.filter((w) => {
    if (!w.contractEndDate) return false;
    const days = (new Date(w.contractEndDate).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 30;
  }).length;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Legal</div>
          <div className="tab-greeting-name">Contracts</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <StatCard label="Active" value={workers.length} color="#059669" bg="#ECFDF5" />
        <StatCard label="Expiring (30d)" value={expiringCount} color="#D97706" bg="#FFFBEB" />
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading contracts...</div>}

      {!loading && workers.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
          <FileText size={28} />
          <div style={{ marginTop: 8, fontSize: 14 }}>No contracts found</div>
        </div>
      )}

      {workers.map((w) => {
        const daysLeft = w.contractEndDate
          ? Math.ceil((new Date(w.contractEndDate).getTime() - Date.now()) / 86400000)
          : null;
        const urgent = daysLeft !== null && daysLeft <= 30;

        return (
          <div key={w.id} style={{ ...cardStyle, borderColor: urgent ? "#FED7AA" : "#E5E7EB" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{w.name}</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                  {w.jobRole ?? "No role"} {w.assignedSite ? `· ${w.assignedSite}` : ""}
                </div>
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 6,
                background: w.contractType === "umowa_o_prace" ? "#ECFDF5" : "#EFF6FF",
                color: w.contractType === "umowa_o_prace" ? "#059669" : "#3B82F6",
              }}>
                {w.contractType === "umowa_o_prace" ? "Umowa o Prace" : "Zlecenie"}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <div style={{ fontSize: 12, color: urgent ? "#D97706" : "#6B7280", display: "flex", alignItems: "center", gap: 4 }}>
                <Calendar size={12} />
                {w.contractEndDate
                  ? `Expires ${new Date(w.contractEndDate).toLocaleDateString("en-GB")}${daysLeft !== null ? ` (${daysLeft}d)` : ""}`
                  : "No end date"}
              </div>
              <button
                onClick={() => handleGenerate(w.id, w.contractType ?? "umowa_zlecenie")}
                disabled={generating === w.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: "1.5px solid #1B2A4A",
                  background: "#1B2A4A",
                  color: "#FFD600",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: generating === w.id ? 0.5 : 1,
                }}
              >
                <Download size={12} /> {generating === w.id ? "..." : "PDF"}
              </button>
            </div>
          </div>
        );
      })}
      <div style={{ height: 100 }} />
    </div>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, background: bg, borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1.5px solid #E5E7EB",
  borderRadius: 14,
  padding: 14,
  marginBottom: 8,
};
