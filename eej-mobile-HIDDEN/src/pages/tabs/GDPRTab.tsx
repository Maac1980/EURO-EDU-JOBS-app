import { useEffect, useState } from "react";
import { Lock, ShieldCheck, Download, Trash2, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/lib/toast";

const API_BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };
}

type GDPRSubTab = "consent" | "requests" | "export";

interface ConsentRecord {
  workerId: string;
  name: string;
  consentDate: string;
  status: "active" | "withdrawn" | "pending";
}

interface DataRequest {
  id: string;
  workerId: string;
  workerName: string;
  type: "export" | "erasure";
  status: "pending" | "completed";
  requestedAt: string;
  completedAt?: string;
}

interface Worker {
  id: string;
  name: string;
}

export default function GDPRTab() {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<GDPRSubTab>("consent");
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [workersRes, requestsRes] = await Promise.all([
        fetch(`${API_BASE}/payroll/workers`, { headers: authHeaders() }),
        fetch(`${API_BASE}/audit?actionType=gdpr`, { headers: authHeaders() }),
      ]);
      const workersData = await workersRes.json();
      const workerList: Worker[] = (workersData.workers || workersData || []).map((w: any) => ({
        id: w.id || w._id, name: w.name || w.fullName || "Unknown",
      }));
      setWorkers(workerList);

      // Build consent records from workers
      const consentList: ConsentRecord[] = workerList.map((w: Worker) => ({
        workerId: w.id,
        name: w.name,
        consentDate: "-",
        status: "pending" as const,
      }));
      // Try to fetch real consent data for each worker
      const consentPromises = workerList.slice(0, 20).map(async (w: Worker) => {
        try {
          const res = await fetch(`${API_BASE}/gdpr/consent/${w.id}`, { headers: authHeaders() });
          if (res.ok) {
            const data = await res.json();
            return {
              workerId: w.id,
              name: w.name,
              consentDate: data.consentDate || data.date || "-",
              status: (data.status || "active") as "active" | "withdrawn" | "pending",
            };
          }
        } catch { /* ignore */ }
        return { workerId: w.id, name: w.name, consentDate: "-", status: "pending" as const };
      });
      const resolvedConsents = await Promise.all(consentPromises);
      setConsents(resolvedConsents.length > 0 ? resolvedConsents : consentList);

      const requestsData = await requestsRes.json();
      const reqList = (requestsData.entries || requestsData.data || requestsData || []).map((r: any) => ({
        id: r.id || r._id || String(Math.random()),
        workerId: r.workerId || "",
        workerName: r.workerName || r.name || "Unknown",
        type: r.type || "export",
        status: r.status || "pending",
        requestedAt: r.requestedAt || r.createdAt || r.timestamp || "",
        completedAt: r.completedAt || null,
      }));
      setRequests(Array.isArray(reqList) ? reqList : []);
    } catch {
      setConsents([]);
      setRequests([]);
      setWorkers([]);
    } finally {
      setLoading(false);
    }
  }

  async function exportWorkerData() {
    if (!selectedWorker) { showToast("Select a worker first", "error"); return; }
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/gdpr/export/${selectedWorker}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gdpr-export-${selectedWorker}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Data exported", "success");
    } catch {
      showToast("Failed to export data", "error");
    } finally {
      setExporting(false);
    }
  }

  async function requestDeletion(workerId: string) {
    setDeleting(workerId);
    try {
      const res = await fetch(`${API_BASE}/gdpr/delete/${workerId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed");
      showToast("Deletion request submitted", "success");
      setDeleting(null);
    } catch {
      showToast("Failed to submit deletion request", "error");
      setDeleting(null);
    }
  }

  function statusBadge(status: string) {
    const colors: Record<string, { bg: string; color: string }> = {
      active: { bg: "#ECFDF5", color: "#059669" },
      completed: { bg: "#ECFDF5", color: "#059669" },
      pending: { bg: "#FFFBEB", color: "#D97706" },
      withdrawn: { bg: "#FEF2F2", color: "#DC2626" },
    };
    const c = colors[status] || colors.pending;
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
        background: c.bg, color: c.color, textTransform: "capitalize",
      }}>{status}</span>
    );
  }

  const tabStyle = (t: GDPRSubTab): React.CSSProperties => ({
    flex: 1, padding: "8px 4px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700,
    cursor: "pointer", background: subTab === t ? "#7C3AED" : "#F3F4F6",
    color: subTab === t ? "#fff" : "#6B7280",
  });

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Compliance</div>
          <div className="tab-greeting-name">GDPR</div>
        </div>
      </div>

      {/* Compliance Badge */}
      <div style={{
        background: "#F5F3FF", borderRadius: 10, padding: "8px 12px", marginBottom: 12,
        display: "flex", alignItems: "center", gap: 8, border: "1.5px solid #DDD6FE",
      }}>
        <ShieldCheck size={18} color="#7C3AED" />
        <span style={{ fontSize: 12, color: "#5B21B6", fontWeight: 600 }}>
          GDPR Compliant - RODO Art. 6(1)(a) & Art. 15-17
        </span>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={() => setSubTab("consent")} style={tabStyle("consent")}>Consent Records</button>
        <button onClick={() => setSubTab("requests")} style={tabStyle("requests")}>Data Requests</button>
        <button onClick={() => setSubTab("export")} style={tabStyle("export")}>Export Data</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading GDPR data...</div>
      ) : (
        <>
          {/* Consent Records */}
          {subTab === "consent" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {consents.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "#9CA3AF" }}>No consent records found.</div>
              ) : consents.map((c) => (
                <div key={c.workerId} style={{
                  background: "#fff", borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "10px 12px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#6B7280" }}>RODO Consent: {c.consentDate}</div>
                  </div>
                  {statusBadge(c.status)}
                </div>
              ))}
            </div>
          )}

          {/* Data Requests */}
          {subTab === "requests" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {requests.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "#9CA3AF" }}>No data requests found.</div>
              ) : requests.map((r) => (
                <div key={r.id} style={{
                  background: "#fff", borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "10px 12px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{r.workerName}</span>
                    {statusBadge(r.status)}
                  </div>
                  <div style={{ fontSize: 11, color: "#6B7280", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      background: r.type === "erasure" ? "#FEF2F2" : "#EEF2FF",
                      color: r.type === "erasure" ? "#DC2626" : "#6366F1",
                      padding: "1px 6px", borderRadius: 4, fontWeight: 700, fontSize: 10,
                    }}>{r.type === "erasure" ? "Erasure" : "Export"}</span>
                    {r.status === "pending" ? <Clock size={12} /> : <CheckCircle size={12} color="#059669" />}
                    <span>Requested: {r.requestedAt ? new Date(r.requestedAt).toLocaleDateString() : "-"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Export Data */}
          {subTab === "export" && (
            <div style={{
              background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: 16,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 12 }}>Export Worker Data</div>
              <select
                value={selectedWorker}
                onChange={(e) => setSelectedWorker(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
                  fontSize: 13, background: "#fff", color: "#111827", marginBottom: 10,
                }}
              >
                <option value="">Select a worker...</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={exportWorkerData}
                  disabled={!selectedWorker || exporting}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "10px 16px", borderRadius: 10, border: "none",
                    background: !selectedWorker ? "#E5E7EB" : "#6366F1", color: !selectedWorker ? "#9CA3AF" : "#fff",
                    fontWeight: 700, fontSize: 13, cursor: !selectedWorker ? "not-allowed" : "pointer",
                  }}
                >
                  <Download size={14} /> {exporting ? "Exporting..." : "Export JSON"}
                </button>
                <button
                  onClick={() => selectedWorker && requestDeletion(selectedWorker)}
                  disabled={!selectedWorker || deleting === selectedWorker}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "10px 16px", borderRadius: 10, border: "none",
                    background: !selectedWorker ? "#E5E7EB" : "#DC2626", color: !selectedWorker ? "#9CA3AF" : "#fff",
                    fontWeight: 700, fontSize: 13, cursor: !selectedWorker ? "not-allowed" : "pointer",
                  }}
                >
                  <Trash2 size={14} /> {deleting === selectedWorker ? "Requesting..." : "Request Deletion"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}
