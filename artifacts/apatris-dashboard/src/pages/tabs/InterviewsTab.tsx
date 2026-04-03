import { useEffect, useState } from "react";
import { Calendar, Clock, MapPin, User, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { fetchInterviews } from "@/lib/api";

interface Interview {
  id: string;
  scheduledAt: string;
  duration?: number;
  location?: string;
  interviewerName?: string;
  status?: string;
  result?: string;
  feedback?: string;
  worker?: { name?: string };
  job?: { title?: string };
}

export default function InterviewsTab() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    fetchInterviews()
      .then(setInterviews)
      .catch(() => setInterviews([]))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const upcoming = interviews.filter((i) => new Date(i.scheduledAt) >= now || i.status === "scheduled");
  const past = interviews.filter((i) => new Date(i.scheduledAt) < now && i.status !== "scheduled");

  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Recruitment</div>
          <div className="tab-greeting-name">Interviews</div>
        </div>
        <div style={{ fontSize: 13, color: "#6B7280" }}>{interviews.length} total</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 10,
              border: tab === t ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB",
              background: tab === t ? "#1B2A4A" : "#fff",
              color: tab === t ? "#FFD600" : "#6B7280",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t === "upcoming" ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading interviews...</div>}

      {!loading && list.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
          <Calendar size={28} />
          <div style={{ marginTop: 8, fontSize: 14 }}>No {tab} interviews</div>
        </div>
      )}

      {list.map((iv) => {
        const dt = new Date(iv.scheduledAt);
        return (
          <div key={iv.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                  {iv.worker?.name ?? "Unknown Candidate"}
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                  {iv.job?.title ?? "Position TBD"}
                </div>
              </div>
              <ResultBadge status={iv.status} result={iv.result} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, fontSize: 12, color: "#6B7280" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Calendar size={12} /> {dt.toLocaleDateString("en-GB")}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={12} /> {dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                {iv.duration ? ` (${iv.duration}min)` : ""}
              </span>
              {iv.location && (
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <MapPin size={12} /> {iv.location}
                </span>
              )}
              {iv.interviewerName && (
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <User size={12} /> {iv.interviewerName}
                </span>
              )}
            </div>

            {iv.feedback && (
              <div style={{ marginTop: 8, padding: 8, background: "#F9FAFB", borderRadius: 8, fontSize: 12, color: "#374151" }}>
                {iv.feedback}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ height: 100 }} />
    </div>
  );
}

function ResultBadge({ status, result }: { status?: string; result?: string }) {
  if (result === "pass") return <span style={badgeStyle("#ECFDF5", "#059669")}><CheckCircle size={11} /> Pass</span>;
  if (result === "fail") return <span style={badgeStyle("#FEF2F2", "#DC2626")}><XCircle size={11} /> Fail</span>;
  if (status === "cancelled") return <span style={badgeStyle("#F3F4F6", "#6B7280")}>Cancelled</span>;
  return <span style={badgeStyle("#EFF6FF", "#3B82F6")}><AlertCircle size={11} /> Scheduled</span>;
}

function badgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 6,
    background: bg,
    color,
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
  };
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1.5px solid #E5E7EB",
  borderRadius: 14,
  padding: 14,
  marginBottom: 8,
};
