import { useEffect, useState } from "react";
import { MapPin, Clock, User, Navigation, CheckCircle, LogOut, Coffee } from "lucide-react";
import { fetchLatestCheckins } from "@/lib/api";

interface Checkin {
  id: string;
  workerId: string;
  workerName?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  siteId?: string;
  assignedSite?: string;
  checkType: string;
  timestamp: string;
}

const CHECK_TYPE_LABELS: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  check_in:    { label: "Checked In",  color: "#059669", bg: "#ECFDF5", Icon: CheckCircle },
  check_out:   { label: "Checked Out", color: "#DC2626", bg: "#FEF2F2", Icon: LogOut },
  break_start: { label: "On Break",    color: "#D97706", bg: "#FFFBEB", Icon: Coffee },
  break_end:   { label: "Break Over",  color: "#3B82F6", bg: "#EFF6FF", Icon: CheckCircle },
};

export default function GPSTrackingTab() {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLatestCheckins()
      .then(setCheckins)
      .catch(() => setCheckins([]))
      .finally(() => setLoading(false));
  }, []);

  const checkedIn = checkins.filter((c) => c.checkType === "check_in" || c.checkType === "break_end").length;
  const onBreak = checkins.filter((c) => c.checkType === "break_start").length;
  const checkedOut = checkins.filter((c) => c.checkType === "check_out").length;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Workforce</div>
          <div className="tab-greeting-name">GPS Tracking</div>
        </div>
        <div style={{ fontSize: 13, color: "#6B7280" }}>{checkins.length} workers</div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#ECFDF5", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>{checkedIn}</div>
          <div style={{ fontSize: 11, color: "#059669", fontWeight: 500 }}>Active</div>
        </div>
        <div style={{ flex: 1, background: "#FFFBEB", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#D97706" }}>{onBreak}</div>
          <div style={{ fontSize: 11, color: "#D97706", fontWeight: 500 }}>On Break</div>
        </div>
        <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#6B7280" }}>{checkedOut}</div>
          <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 500 }}>Off-site</div>
        </div>
      </div>

      {/* Map placeholder */}
      <div style={{
        background: "linear-gradient(135deg, #1B2A4A 0%, #2D4270 100%)",
        borderRadius: 14,
        padding: 20,
        marginBottom: 12,
        textAlign: "center",
        color: "#fff",
        minHeight: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <Navigation size={28} color="#FFD600" />
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>Live Map View</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
          {checkins.length > 0 ? `${checkins.length} workers tracked` : "No active check-ins"}
        </div>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Mapbox integration active</div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading check-ins...</div>}

      {!loading && checkins.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
          <MapPin size={28} />
          <div style={{ marginTop: 8, fontSize: 14 }}>No active check-ins</div>
        </div>
      )}

      <div className="section-label" style={{ marginTop: 4 }}>Worker Locations</div>

      {checkins.map((c) => {
        const typeInfo = CHECK_TYPE_LABELS[c.checkType] ?? CHECK_TYPE_LABELS.check_in;
        const TypeIcon = typeInfo.Icon;
        const ago = getTimeAgo(c.timestamp);

        return (
          <div key={c.id ?? c.workerId} style={cardStyle}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: typeInfo.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <TypeIcon size={18} color={typeInfo.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                    {c.workerName ?? `Worker ${c.workerId.slice(0, 6)}`}
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: typeInfo.bg,
                    color: typeInfo.color,
                  }}>
                    {typeInfo.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>
                  {c.assignedSite ?? c.siteId ?? "Unknown site"}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11, color: "#9CA3AF" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <MapPin size={11} /> {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                  </span>
                  {c.accuracy && (
                    <span>~{Math.round(c.accuracy)}m</span>
                  )}
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Clock size={11} /> {ago}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ height: 100 }} />
    </div>
  );
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1.5px solid #E5E7EB",
  borderRadius: 14,
  padding: 12,
  marginBottom: 8,
};
