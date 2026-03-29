import { useEffect, useState, useRef } from "react";
import { Users, ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { fetchApplications, updateApplicationStage } from "@/lib/api";
import { useToast } from "@/lib/toast";

const STAGES = ["New", "Screening", "Interview", "Offer", "Placed", "Active", "Released", "Blacklisted"];

const STAGE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  New:         { bg: "#EFF6FF", border: "#BFDBFE", dot: "#3B82F6" },
  Screening:   { bg: "#FFF7ED", border: "#FED7AA", dot: "#F97316" },
  Interview:   { bg: "#F5F3FF", border: "#DDD6FE", dot: "#8B5CF6" },
  Offer:       { bg: "#ECFDF5", border: "#A7F3D0", dot: "#10B981" },
  Placed:      { bg: "#F0FDF4", border: "#86EFAC", dot: "#22C55E" },
  Active:      { bg: "#F0F9FF", border: "#BAE6FD", dot: "#0EA5E9" },
  Released:    { bg: "#FEF2F2", border: "#FECACA", dot: "#EF4444" },
  Blacklisted: { bg: "#F9FAFB", border: "#D1D5DB", dot: "#6B7280" },
};

interface Application {
  id: string;
  stage: string;
  matchScore?: number;
  worker?: { name?: string; jobRole?: string };
  job?: { title?: string };
  appliedAt?: string;
}

export default function ATSPipelineTab() {
  const { showToast } = useToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchApplications()
      .then(setApps)
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  }, []);

  const stageApps = apps.filter((a) => a.stage === STAGES[activeStage]);

  async function moveStage(appId: string, direction: number) {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    const idx = STAGES.indexOf(app.stage);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= STAGES.length) return;
    const newStage = STAGES[newIdx];
    try {
      await updateApplicationStage(appId, newStage);
      setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, stage: newStage } : a)));
      showToast(`Moved to ${newStage}`, "success");
    } catch {
      showToast("Failed to move stage", "error");
    }
  }

  const sc = STAGE_COLORS[STAGES[activeStage]] ?? STAGE_COLORS.New;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Recruitment</div>
          <div className="tab-greeting-name">ATS Pipeline</div>
        </div>
        <div style={{ fontSize: 13, color: "#6B7280" }}>{apps.length} total</div>
      </div>

      {/* Stage tabs - horizontal scroll */}
      <div
        ref={scrollRef}
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 8,
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        {STAGES.map((stage, i) => {
          const count = apps.filter((a) => a.stage === stage).length;
          const active = i === activeStage;
          const c = STAGE_COLORS[stage];
          return (
            <button
              key={stage}
              onClick={() => setActiveStage(i)}
              style={{
                flexShrink: 0,
                padding: "6px 12px",
                borderRadius: 20,
                border: active ? `2px solid ${c.dot}` : "1.5px solid #E5E7EB",
                background: active ? c.bg : "#fff",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                color: active ? c.dot : "#6B7280",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
              {stage}
              <span style={{ fontWeight: 700, opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading pipeline...</div>}

      {!loading && stageApps.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
          <Users size={28} />
          <div style={{ marginTop: 8, fontSize: 14 }}>No candidates in {STAGES[activeStage]}</div>
        </div>
      )}

      {stageApps.map((app) => (
        <div key={app.id} style={{ background: sc.bg, border: `1.5px solid ${sc.border}`, borderRadius: 14, padding: 14, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                {app.worker?.name ?? "Unknown"}
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                {app.job?.title ?? "No job title"} {app.worker?.jobRole ? `· ${app.worker.jobRole}` : ""}
              </div>
            </div>
            {app.matchScore !== undefined && (
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: app.matchScore >= 70 ? "#ECFDF5" : app.matchScore >= 40 ? "#FFFBEB" : "#FEF2F2",
                border: `2px solid ${app.matchScore >= 70 ? "#10B981" : app.matchScore >= 40 ? "#F59E0B" : "#EF4444"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 800,
                color: app.matchScore >= 70 ? "#059669" : app.matchScore >= 40 ? "#D97706" : "#DC2626",
              }}>
                {app.matchScore}
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "#9CA3AF" }}>
              {app.appliedAt ? new Date(app.appliedAt).toLocaleDateString("en-GB") : ""}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {activeStage > 0 && (
                <button onClick={() => moveStage(app.id, -1)} style={moveBtnStyle}>
                  <ChevronLeft size={14} />
                </button>
              )}
              {activeStage < STAGES.length - 1 && (
                <button onClick={() => moveStage(app.id, 1)} style={{ ...moveBtnStyle, background: sc.dot, color: "#fff" }}>
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      <div style={{ height: 100 }} />
    </div>
  );
}

const moveBtnStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1.5px solid #E5E7EB",
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};
