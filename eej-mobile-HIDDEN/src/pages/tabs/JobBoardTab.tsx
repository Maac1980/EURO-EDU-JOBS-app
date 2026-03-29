import { useEffect, useState } from "react";
import { Briefcase, MapPin, Clock, Users, ChevronRight } from "lucide-react";
import { fetchJobs } from "@/lib/api";
import { useToast } from "@/lib/toast";

interface Job {
  id: string;
  title: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  contractType?: string;
  status?: string;
  createdAt?: string;
  applicationCount?: number;
}

export default function JobBoardTab() {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetchJobs()
      .then(setJobs)
      .catch(() => {
        setJobs([]);
        showToast("Failed to load jobs", "error");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter(
    (j) =>
      j.title?.toLowerCase().includes(filter.toLowerCase()) ||
      j.location?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Recruitment</div>
          <div className="tab-greeting-name">Job Board</div>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search jobs..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 12,
          border: "1.5px solid #E5E7EB",
          fontSize: 14,
          outline: "none",
          marginBottom: 12,
          background: "#F9FAFB",
        }}
      />

      {loading && <LoadingCard />}

      {!loading && filtered.length === 0 && (
        <EmptyState icon={<Briefcase size={32} color="#9CA3AF" />} text="No jobs posted yet" />
      )}

      {filtered.map((job) => (
        <div key={job.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{job.title}</div>
              {job.location && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#6B7280", fontSize: 13, marginTop: 4 }}>
                  <MapPin size={13} /> {job.location}
                </div>
              )}
            </div>
            <StatusBadge status={job.status} />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 12, color: "#6B7280" }}>
            {job.salaryMin && (
              <span style={tagStyle}>
                {job.salaryMin}–{job.salaryMax} PLN/h
              </span>
            )}
            {job.contractType && <span style={tagStyle}>{job.contractType}</span>}
            {job.applicationCount !== undefined && (
              <span style={{ ...tagStyle, background: "#EEF2FF", color: "#4338CA" }}>
                <Users size={11} /> {job.applicationCount} applied
              </span>
            )}
          </div>
          {job.createdAt && (
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={11} /> Posted {new Date(job.createdAt).toLocaleDateString("en-GB")}
            </div>
          )}
        </div>
      ))}
      <div style={{ height: 100 }} />
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = status ?? "draft";
  const colors: Record<string, { bg: string; text: string }> = {
    published: { bg: "#ECFDF5", text: "#059669" },
    draft: { bg: "#F3F4F6", text: "#6B7280" },
    closed: { bg: "#FEF2F2", text: "#DC2626" },
  };
  const c = colors[s] ?? colors.draft;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: c.bg, color: c.text }}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}

function LoadingCard() {
  return (
    <div style={{ ...cardStyle, textAlign: "center", color: "#9CA3AF" }}>
      Loading jobs...
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "#9CA3AF" }}>
      {icon}
      <div style={{ marginTop: 8, fontSize: 14 }}>{text}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1.5px solid #E5E7EB",
  borderRadius: 14,
  padding: 16,
  marginBottom: 10,
};

const tagStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  padding: "2px 8px",
  borderRadius: 6,
  background: "#F3F4F6",
  fontWeight: 500,
};
