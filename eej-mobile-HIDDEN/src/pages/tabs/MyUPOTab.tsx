// My UPO — worker sees their digital UPO receipts (replaces passport stamp).
// Art. 108 confirmation of legal stay during a pending TRC application.
// Read-only proof — workers show this to border guards or PIP inspectors.
import { useEffect, useState } from "react";
import { Shield, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { useMyWorker } from "@/lib/useMyWorker";

interface UPORecord {
  id: string;
  submission_number: string;
  submission_date: string;
  case_type: string;
  authority?: string;
  art108_locked?: boolean;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export default function MyUPOTab() {
  const { worker, loading: workerLoading, error: workerError } = useMyWorker();
  const [records, setRecords] = useState<UPORecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!worker) return;
    setRecordsLoading(true);
    setFetchError(null);
    fetch(`/api/mos2026/upo/${encodeURIComponent(worker.id)}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((d) => setRecords((d?.records as UPORecord[]) ?? []))
      .catch(() => setFetchError("Could not load UPO records."))
      .finally(() => setRecordsLoading(false));
  }, [worker?.id]);

  if (workerLoading || (worker && recordsLoading)) {
    return (
      <div className="tab-page" style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
        Loading your UPO records…
      </div>
    );
  }

  if (workerError || !worker) {
    return (
      <div className="tab-page" style={{ padding: 32, textAlign: "center", color: "#6B7280" }}>
        <Shield size={32} color="#9CA3AF" strokeWidth={1.5} style={{ margin: "0 auto 12px" }} />
        <div>{workerError ?? "Profile not found."}</div>
      </div>
    );
  }

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">My UPO</div>
          <div className="tab-greeting-name">Digital proof of legal stay</div>
        </div>
      </div>

      <div className="wc-alert wc-alert-green-soft" style={{ marginBottom: 12, padding: 10 }}>
        <Shield size={14} strokeWidth={2.2} />
        <div style={{ flex: 1, fontSize: 12 }}>
          UPO replaces the old passport stamp under Art. 108. Show this screen to border
          guards or PIP inspectors as proof of legal stay during a pending case.
        </div>
      </div>

      {fetchError && (
        <div className="wc-alert wc-alert-amber" style={{ marginBottom: 12, padding: 10 }}>
          <AlertTriangle size={14} strokeWidth={2.2} />
          <span className="wc-alert-msg">{fetchError}</span>
        </div>
      )}

      {records.length === 0 ? (
        <div
          style={{
            padding: 30,
            textAlign: "center",
            border: "2px dashed #E5E7EB",
            borderRadius: 12,
            color: "#9CA3AF",
            background: "#FAFAFA",
          }}
        >
          <FileText size={28} color="#D1D5DB" strokeWidth={1.5} style={{ margin: "0 auto 8px" }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6B7280" }}>No UPO registered yet</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            Your coordinator will register the UPO once your MOS case is filed.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {records.map((r) => (
            <div
              key={r.id}
              className="wc-panel"
              style={
                r.art108_locked
                  ? { borderColor: "#6EE7B7", background: "#ECFDF5" }
                  : undefined
              }
            >
              <div className="wc-panel-header">
                <div className="wc-panel-title">
                  {r.art108_locked ? (
                    <>
                      <CheckCircle2 size={14} color="#059669" strokeWidth={2.2} />
                      <span style={{ color: "#059669" }}>Art. 108 — Legal Stay Confirmed</span>
                    </>
                  ) : (
                    <>
                      <FileText size={14} strokeWidth={2.2} />
                      <span>UPO Receipt</span>
                    </>
                  )}
                </div>
              </div>
              <div className="wc-panel-body">
                <div className="wc-row">
                  <div className="wc-row-label">Submission #</div>
                  <div className="wc-row-value wc-mono">{r.submission_number}</div>
                </div>
                <div className="wc-row">
                  <div className="wc-row-label">Filed</div>
                  <div className="wc-row-value">{r.submission_date}</div>
                </div>
                <div className="wc-row">
                  <div className="wc-row-label">Case type</div>
                  <div className="wc-row-value">{r.case_type}</div>
                </div>
                {r.authority && (
                  <div className="wc-row">
                    <div className="wc-row-label">Authority</div>
                    <div className="wc-row-value">{r.authority}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}
