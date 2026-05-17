import { useEffect, useState } from "react";
import { UserPlus, Mail, Phone, Globe, Briefcase, ChevronRight, Clock, FileText } from "lucide-react";
import { fetchApplications, fetchWorkers, updateApplicationStage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import WorkerCockpit from "@/components/WorkerCockpit";

interface Application {
  id: string;
  stage: string;
  matchScore?: number;
  appliedAt?: string;
  worker?: { id?: string; name?: string; email?: string; phone?: string; nationality?: string; jobRole?: string };
  job?: { title?: string };
}

export default function ApplicationsTab() {
  const { showToast } = useToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [newWorkers, setNewWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pipeline" | "recent">("recent");
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchApplications().catch(() => []),
      fetchWorkers().catch(() => []),
    ]).then(([appData, workerData]) => {
      setApps(appData);
      setNewWorkers(workerData.filter((w: any) => w.pipelineStage === "New" || !w.pipelineStage));
    }).finally(() => setLoading(false));
  }, []);

  const newApps = apps.filter((a) => a.stage === "New");
  const todayApps = newWorkers.filter((w: any) => {
    if (!w.createdAt) return false;
    const d = new Date(w.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  async function moveToScreening(appId: string) {
    try {
      await updateApplicationStage(appId, "Screening");
      setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, stage: "Screening" } : a)));
      showToast("Moved to Screening", "success");
    } catch {
      showToast("Failed to update stage", "error");
    }
  }

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Recruitment</div>
          <div className="tab-greeting-name">Applications</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ background: "#ECFDF5", color: "#059669", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            {todayApps.length} today
          </span>
          <span style={{ background: "#EFF6FF", color: "#3B82F6", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            {newApps.length + newWorkers.length} total new
          </span>
        </div>
      </div>

      {/* Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["recent", "pipeline"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
            border: tab === t ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB",
            background: tab === t ? "#1B2A4A" : "#fff",
            color: tab === t ? "#FFD600" : "#6B7280",
          }}>
            {t === "recent" ? `New Candidates (${newWorkers.length})` : `Pipeline (${newApps.length})`}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading applications...</div>}

      {/* Recent tab — workers who applied via /apply */}
      {!loading && tab === "recent" && (
        <>
          {newWorkers.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
              <UserPlus size={28} />
              <div style={{ marginTop: 8, fontSize: 14 }}>No new applications</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Candidates who apply through the website will appear here</div>
            </div>
          )}
          {newWorkers.map((w: any) => (
            <div key={w.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{w.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4, fontSize: 12, color: "#6B7280" }}>
                    {w.email && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Mail size={11} /> {w.email}</span>}
                    {w.phone && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Phone size={11} /> {w.phone}</span>}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "#ECFDF5", color: "#059669" }}>New</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {w.nationality && <span style={tagStyle}><Globe size={11} /> {w.nationality}</span>}
                {w.jobRole && <span style={{ ...tagStyle, background: "#EFF6FF", color: "#3B82F6" }}><Briefcase size={11} /> {w.jobRole}</span>}
                {w.experience && <span style={tagStyle}>{w.experience} exp</span>}
                {w.qualification && <span style={tagStyle}>{w.qualification}</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={11} /> {w.createdAt ? new Date(w.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                </div>
                <button style={actionBtn} onClick={() => setOpenWorkerId(w.id)}>
                  Review <ChevronRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Pipeline tab — formal job applications */}
      {!loading && tab === "pipeline" && (
        <>
          {newApps.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
              <FileText size={28} />
              <div style={{ marginTop: 8, fontSize: 14 }}>No applications in pipeline</div>
            </div>
          )}
          {newApps.map((app) => (
            <div
              key={app.id}
              style={{ ...cardStyle, cursor: app.worker?.id ? "pointer" : "default" }}
              onClick={() => app.worker?.id && setOpenWorkerId(app.worker.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{app.worker?.name ?? "Unknown"}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    {app.job?.title ?? "General Application"}
                    {app.worker?.email ? ` · ${app.worker.email}` : ""}
                  </div>
                </div>
                {app.matchScore !== undefined && app.matchScore > 0 && (
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: app.matchScore >= 70 ? "#ECFDF5" : "#FFFBEB",
                    border: `2px solid ${app.matchScore >= 70 ? "#10B981" : "#F59E0B"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800,
                    color: app.matchScore >= 70 ? "#059669" : "#D97706",
                  }}>
                    {app.matchScore}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                  {app.appliedAt ? new Date(app.appliedAt).toLocaleDateString("en-GB") : ""}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    moveToScreening(app.id);
                  }}
                  style={{ ...actionBtn, background: "#059669", borderColor: "#059669" }}
                >
                  Move to Screening <ChevronRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </>
      )}
      <div style={{ height: 100 }} />

      {openWorkerId && (
        <WorkerCockpit
          workerId={openWorkerId}
          onClose={() => setOpenWorkerId(null)}
        />
      )}
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
const tagStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  padding: "2px 8px",
  borderRadius: 6,
  background: "#F3F4F6",
  fontSize: 12,
  fontWeight: 500,
  color: "#374151",
};
const actionBtn: React.CSSProperties = {
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
};
