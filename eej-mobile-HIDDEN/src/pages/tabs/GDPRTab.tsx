// GDPR / RODO management tab.
// The platform implements the request-and-process pattern:
//   1. Anyone with auth can POST /gdpr/requests with type = export | erasure |
//      consent_withdrawal — this creates a pending request, no side effects.
//   2. An admin reviews the queue and POSTs /gdpr/requests/:id/process to
//      execute the request (data export downloads JSON; erasure anonymises +
//      cascades-deletes related rows; withdrawal clears consent flags).
// This UI lets staff see pending requests, file new ones, and (admin only)
// process them. The previous scaffold called a nonexistent endpoint.
import { useEffect, useState } from "react";
import { Shield, Download, Trash2, CheckCircle, Clock, AlertTriangle, FileText } from "lucide-react";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { fetchWorkers } from "@/lib/api";

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("eej_token_v2");
  return t
    ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
    : { "Content-Type": "application/json" };
}

interface GdprRequest {
  id: string;
  workerId: string;
  requestType: "export" | "erasure" | "consent_withdrawal";
  status: "pending" | "in_progress" | "completed" | "rejected";
  reason?: string;
  requestedBy?: string;
  processedBy?: string;
  createdAt?: string;
  completedAt?: string;
}

type WorkerRow = { id: string; name: string; email?: string | null; rodoConsentDate?: string | null };

export default function GDPRTab() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "executive" || user?.role === "legal";

  const [tab, setTab] = useState<"consent" | "requests" | "new">("requests");
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [requests, setRequests] = useState<GdprRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  // New-request form state
  const [reqWorkerId, setReqWorkerId] = useState("");
  const [reqType, setReqType] = useState<"export" | "erasure" | "consent_withdrawal">("export");
  const [reqReason, setReqReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [ws, rRes] = await Promise.all([
        fetchWorkers() as Promise<WorkerRow[]>,
        fetch("/api/gdpr/requests", { headers: authHeaders() }).then((r) => r.ok ? r.json() : { requests: [] }),
      ]);
      setWorkers(ws);
      setRequests((rRes.requests as GdprRequest[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function submitRequest() {
    if (!reqWorkerId) {
      showToast("Select a worker first", "error");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/gdpr/requests", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ workerId: reqWorkerId, requestType: reqType, reason: reqReason }),
      });
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      showToast("GDPR request filed — pending admin review", "success");
      setReqWorkerId("");
      setReqReason("");
      setTab("requests");
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not file request", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function processRequest(req: GdprRequest) {
    if (!isAdmin) {
      showToast("Admin role required to process GDPR requests", "error");
      return;
    }
    if (req.requestType === "erasure" && !confirm(`Erase worker data for request ${req.id}? This is irreversible.`)) return;
    setProcessing(req.id);
    try {
      const r = await fetch(`/api/gdpr/requests/${req.id}/process`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      const data = await r.json();
      // For export requests, the response carries the data — offer a download.
      if (req.requestType === "export" && data.exportData) {
        const blob = new Blob([JSON.stringify(data.exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `gdpr-export-${req.workerId}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Export downloaded", "success");
      } else {
        showToast(data.message ?? "Request processed", "success");
      }
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Processing failed", "error");
    } finally {
      setProcessing(null);
    }
  }

  function workerName(id: string): string {
    return workers.find((w) => w.id === id)?.name ?? id.slice(0, 8);
  }

  const pendingRequests = requests.filter((r) => r.status === "pending" || r.status === "in_progress");
  const completedRequests = requests.filter((r) => r.status === "completed");

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Compliance</div>
          <div className="tab-greeting-name">GDPR / RODO Management</div>
        </div>
      </div>

      <div
        style={{
          background: "#F5F3FF",
          border: "1.5px solid #DDD6FE",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Shield size={16} color="#7C3AED" />
        <div style={{ fontSize: 12, color: "#6D28D9", lineHeight: 1.4 }}>
          GDPR / RODO compliant. Requests are queued, reviewed, and executed by an admin — full audit trail per Art. 30.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["requests", "consent", "new"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: 8,
              borderRadius: 10,
              border: tab === t ? "2px solid #1B2A4A" : "1.5px solid #E5E7EB",
              background: tab === t ? "#1B2A4A" : "#fff",
              color: tab === t ? "#FFD600" : "#6B7280",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t === "requests" ? `Requests (${pendingRequests.length})` : t === "consent" ? "Consent Records" : "File New Request"}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading…</div>}

      {/* Requests queue */}
      {tab === "requests" && !loading && (
        <>
          {pendingRequests.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "#9CA3AF", border: "2px dashed #E5E7EB", borderRadius: 12, marginBottom: 12 }}>
              <FileText size={28} color="#D1D5DB" strokeWidth={1.5} style={{ margin: "0 auto 8px" }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: "#6B7280" }}>No pending requests</div>
            </div>
          ) : (
            pendingRequests.map((req) => (
              <div key={req.id} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1B2A4A", textTransform: "capitalize" }}>
                      {req.requestType.replace(/_/g, " ")}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                      {workerName(req.workerId)}
                      {req.requestedBy && ` · by ${req.requestedBy}`}
                    </div>
                    {req.reason && (
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2, fontStyle: "italic" }}>
                        "{req.reason}"
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      background: req.status === "pending" ? "#FFFBEB" : "#EFF6FF",
                      color: req.status === "pending" ? "#D97706" : "#3B82F6",
                    }}
                  >
                    {req.status}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                    <button
                      onClick={() => processRequest(req)}
                      disabled={processing === req.id}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: req.requestType === "erasure" ? "#DC2626" : "#3B82F6",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {processing === req.id ? "Processing…" : req.requestType === "erasure" ? (
                        <><Trash2 size={12} /> Erase data</>
                      ) : req.requestType === "export" ? (
                        <><Download size={12} /> Export & download</>
                      ) : (
                        <><CheckCircle size={12} /> Process</>
                      )}
                    </button>
                  </div>
                )}
                {!isAdmin && (
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6, fontStyle: "italic" }}>
                    Admin review required — file new requests in the "File New Request" tab.
                  </div>
                )}
              </div>
            ))
          )}

          {completedRequests.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 16, color: "#6B7280" }}>Recently completed</div>
              {completedRequests.slice(0, 5).map((req) => (
                <div key={req.id} style={{ background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 10, padding: 10, marginBottom: 6, opacity: 0.85 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: "#1B2A4A", textTransform: "capitalize" }}>
                        {req.requestType.replace(/_/g, " ")} — {workerName(req.workerId)}
                      </div>
                      {req.processedBy && (
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>
                          by {req.processedBy} · {req.completedAt ? new Date(req.completedAt).toLocaleDateString("en-GB") : ""}
                        </div>
                      )}
                    </div>
                    <CheckCircle size={14} color="#059669" />
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* Consent records */}
      {tab === "consent" && !loading && (
        <>
          {workers.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>No worker records</div>
          ) : (
            workers.map((w) => (
              <div
                key={w.id}
                style={{
                  background: "#fff",
                  border: "1.5px solid #E5E7EB",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>{w.email}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                  {w.rodoConsentDate ? (
                    <>
                      <CheckCircle size={12} color="#059669" />
                      <span style={{ color: "#059669" }}>{w.rodoConsentDate}</span>
                    </>
                  ) : (
                    <>
                      <Clock size={12} color="#D97706" />
                      <span style={{ color: "#D97706" }}>Pending</span>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* File a new GDPR request */}
      {tab === "new" && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "#1B2A4A" }}>File a GDPR request</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 12, lineHeight: 1.4 }}>
            Once filed, a tenant admin reviews and executes the request. Export delivers a JSON of all worker data. Erasure anonymises the worker and cascade-deletes related rows (irreversible). Consent withdrawal clears the worker's RODO consent.
          </div>

          <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 4 }}>Worker</label>
          <select
            value={reqWorkerId}
            onChange={(e) => setReqWorkerId(e.target.value)}
            style={{ width: "100%", padding: 10, border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, marginBottom: 10 }}
          >
            <option value="">Select worker…</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}{w.email ? ` — ${w.email}` : ""}
              </option>
            ))}
          </select>

          <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 4 }}>Request type</label>
          <select
            value={reqType}
            onChange={(e) => setReqType(e.target.value as "export" | "erasure" | "consent_withdrawal")}
            style={{ width: "100%", padding: 10, border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, marginBottom: 10 }}
          >
            <option value="export">Export data (Art. 15)</option>
            <option value="erasure">Erasure / right to be forgotten (Art. 17)</option>
            <option value="consent_withdrawal">Consent withdrawal (Art. 7)</option>
          </select>

          <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 4 }}>Reason (optional)</label>
          <textarea
            value={reqReason}
            onChange={(e) => setReqReason(e.target.value)}
            rows={3}
            placeholder="Why is this request being filed?"
            style={{ width: "100%", padding: 10, border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, marginBottom: 12, fontFamily: "inherit", resize: "vertical" }}
          />

          {reqType === "erasure" && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 11, color: "#991B1B", display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={13} strokeWidth={2.2} />
              Erasure is irreversible. The worker row will be anonymised; payroll records are retained for legal compliance, but notes, daily logs, and file attachments are deleted.
            </div>
          )}

          <button
            onClick={submitRequest}
            disabled={submitting || !reqWorkerId}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: submitting || !reqWorkerId ? "#9CA3AF" : "#7C3AED",
              color: "#fff",
              fontWeight: 700,
              cursor: submitting || !reqWorkerId ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Filing…" : "File request"}
          </button>
        </div>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}
