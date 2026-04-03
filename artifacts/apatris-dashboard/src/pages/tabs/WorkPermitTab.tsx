import { useEffect, useState } from "react";
import { FileCheck, Clock, AlertTriangle, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import { fetchPermits, fetchPermitDeadlines } from "@/lib/api";

interface Permit {
  id: string;
  permitType: string;
  status: string;
  applicationNumber?: string;
  portal?: string;
  governmentFee?: number;
  reportingDeadline?: string;
  submittedAt?: string;
  decisionDate?: string;
  expiryDate?: string;
  notes?: string;
  documents?: { name: string; required: boolean; uploaded: boolean; verified: boolean }[];
  worker?: { name?: string; nationality?: string };
}

interface Deadline {
  type: string;
  date: string;
  workerId: string;
  workerName?: string;
  description: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#F3F4F6", text: "#6B7280" },
  submitted: { bg: "#EFF6FF", text: "#3B82F6" },
  approved: { bg: "#ECFDF5", text: "#059669" },
  rejected: { bg: "#FEF2F2", text: "#DC2626" },
  pending: { bg: "#FFFBEB", text: "#D97706" },
};

const PERMIT_LABELS: Record<string, string> = {
  type_a: "Type A",
  type_b: "Type B",
  type_c: "Type C",
  seasonal: "Seasonal",
  oswiadczenie: "Oswiadczenie",
};

export default function WorkPermitTab() {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  useEffect(() => {
    Promise.all([fetchPermits(), fetchPermitDeadlines()])
      .then(([p, d]) => {
        setPermits(p);
        setDeadlines(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? permits : permits.filter((p) => p.status === filter);

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Immigration</div>
          <div className="tab-greeting-name">Work Permit Tracker</div>
        </div>
        <div style={{ fontSize: 13, color: "#6B7280" }}>{permits.length} permits</div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <StatCard label="Pending" value={permits.filter((p) => p.status === "pending" || p.status === "submitted").length} color="#D97706" bg="#FFFBEB" />
        <StatCard label="Approved" value={permits.filter((p) => p.status === "approved").length} color="#059669" bg="#ECFDF5" />
        <StatCard label="Deadlines" value={deadlines.length} color="#DC2626" bg="#FEF2F2" />
      </div>

      {/* Upcoming deadlines */}
      {deadlines.length > 0 && (
        <>
          <div className="section-label">
            Upcoming Deadlines
            <span style={{ background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 6, marginLeft: 6 }}>
              {deadlines.length}
            </span>
          </div>
          <div style={{ marginBottom: 12 }}>
            {deadlines.slice(0, 3).map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", background: "#FEF2F2", borderRadius: 10, marginBottom: 4 }}>
                <AlertTriangle size={14} color="#DC2626" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#991B1B" }}>{d.workerName ?? d.workerId}</div>
                  <div style={{ fontSize: 11, color: "#DC2626" }}>{d.description}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626" }}>
                  {new Date(d.date).toLocaleDateString("en-GB")}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["all", "pending", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "5px 10px",
              borderRadius: 20,
              border: filter === f ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB",
              background: filter === f ? "#1B2A4A" : "#fff",
              color: filter === f ? "#FFD600" : "#6B7280",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading permits...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
          <FileCheck size={28} />
          <div style={{ marginTop: 8, fontSize: 14 }}>No permit applications found</div>
        </div>
      )}

      {filtered.map((p) => {
        const expanded = expandedId === p.id;
        const sc = STATUS_COLORS[p.status] ?? STATUS_COLORS.draft;
        const docsReady = p.documents?.filter((d) => d.uploaded).length ?? 0;
        const docsTotal = p.documents?.length ?? 0;

        return (
          <div
            key={p.id}
            onClick={() => setExpandedId(expanded ? null : p.id)}
            style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 14, marginBottom: 8, cursor: "pointer" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                  {p.worker?.name ?? "Unknown"} · {PERMIT_LABELS[p.permitType] ?? p.permitType}
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                  {p.applicationNumber ?? "No app number"} · {p.portal ?? ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: sc.bg, color: sc.text }}>
                  {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                </span>
                {expanded ? <ChevronUp size={14} color="#9CA3AF" /> : <ChevronDown size={14} color="#9CA3AF" />}
              </div>
            </div>

            {/* Document progress bar */}
            {docsTotal > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginBottom: 3 }}>
                  <span>Documents</span>
                  <span>{docsReady}/{docsTotal}</span>
                </div>
                <div style={{ height: 4, background: "#E5E7EB", borderRadius: 2 }}>
                  <div style={{ height: 4, background: docsReady === docsTotal ? "#10B981" : "#F59E0B", borderRadius: 2, width: `${(docsReady / docsTotal) * 100}%` }} />
                </div>
              </div>
            )}

            {expanded && (
              <div style={{ marginTop: 10, borderTop: "1px solid #F3F4F6", paddingTop: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
                  <div><span style={{ color: "#9CA3AF" }}>Fee:</span> <span style={{ color: "#111827", fontWeight: 600 }}>{p.governmentFee ?? 0} PLN</span></div>
                  <div><span style={{ color: "#9CA3AF" }}>Nationality:</span> <span style={{ color: "#111827" }}>{p.worker?.nationality ?? "N/A"}</span></div>
                  {p.reportingDeadline && (
                    <div><span style={{ color: "#9CA3AF" }}>7-day deadline:</span> <span style={{ color: "#DC2626", fontWeight: 600 }}>{new Date(p.reportingDeadline).toLocaleDateString("en-GB")}</span></div>
                  )}
                  {p.submittedAt && (
                    <div><span style={{ color: "#9CA3AF" }}>Submitted:</span> <span style={{ color: "#111827" }}>{new Date(p.submittedAt).toLocaleDateString("en-GB")}</span></div>
                  )}
                  {p.expiryDate && (
                    <div><span style={{ color: "#9CA3AF" }}>Expires:</span> <span style={{ color: "#111827" }}>{new Date(p.expiryDate).toLocaleDateString("en-GB")}</span></div>
                  )}
                </div>

                {/* Document checklist */}
                {p.documents && p.documents.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginBottom: 4 }}>Document Checklist:</div>
                    {p.documents.map((d, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", marginBottom: 3 }}>
                        {d.uploaded && d.verified ? (
                          <CheckCircle size={13} color="#10B981" />
                        ) : d.uploaded ? (
                          <Clock size={13} color="#F59E0B" />
                        ) : (
                          <div style={{ width: 13, height: 13, borderRadius: "50%", border: "1.5px solid #D1D5DB" }} />
                        )}
                        <span style={{ opacity: d.uploaded ? 1 : 0.5 }}>{d.name}</span>
                        {d.required && !d.uploaded && <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 600 }}>Required</span>}
                      </div>
                    ))}
                  </div>
                )}

                {p.notes && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#6B7280", fontStyle: "italic" }}>{p.notes}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ height: 100 }} />
    </div>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, background: bg, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color, fontWeight: 500 }}>{label}</div>
    </div>
  );
}
