import { useEffect, useState } from "react";
import { FileText, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

/**
 * Mobile sibling of dashboard WorkerDocumentsList (Tier 1 closeout #25).
 * Lists smart_documents rows for a worker inside CandidateDetail.
 */

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("eej_token_v2");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface Doc {
  id: string;
  worker_id: string;
  file_name: string | null;
  doc_type: string | null;
  confidence: number | null;
  status: string | null;
  created_at: string;
}

const STATUS_CFG: Record<string, { Icon: React.ComponentType<{ size?: number; color?: string }>; color: string; bg: string; label: string }> = {
  analyzed:           { Icon: Clock,         color: "#D97706", bg: "#FFFBEB", label: "Awaiting review" },
  verified:           { Icon: CheckCircle2,  color: "#059669", bg: "#ECFDF5", label: "Approved" },
  rejected:           { Icon: XCircle,       color: "#DC2626", bg: "#FEF2F2", label: "Rejected" },
  resubmit_requested: { Icon: AlertTriangle, color: "#EA580C", bg: "#FFF7ED", label: "Resubmit" },
};

export default function WorkerDocumentsList({ workerId }: { workerId: string }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`/api/documents/smart-ingest/${encodeURIComponent(workerId)}`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (!cancelled) setDocs((d?.documents ?? []) as Doc[]); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workerId]);

  return (
    <div style={{ marginTop: 12 }}>
      <div className="detail-section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <FileText size={11} color="#9CA3AF" />
        Smart Documents
      </div>
      {loading ? (
        <div style={{ padding: 12, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#FEF2F2", border: "1px solid #FCA5A5", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} color="#DC2626" />
          <span style={{ fontSize: 12, color: "#991B1B" }}>Could not load: {error}</span>
        </div>
      ) : !docs || docs.length === 0 ? (
        <div style={{ padding: 16, borderRadius: 10, background: "#FAFAFA", border: "1px dashed #E5E7EB", textAlign: "center" }}>
          <FileText size={20} color="#D1D5DB" style={{ margin: "0 auto 6px", display: "block" }} />
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>No documents on file</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {docs.map(d => {
            const cfg = STATUS_CFG[d.status ?? "analyzed"] ?? STATUS_CFG.analyzed;
            const conf = d.confidence != null ? Math.round(d.confidence * 100) : null;
            return (
              <div key={d.id} style={{ padding: 12, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{(d.doc_type ?? "UNKNOWN").replace(/_/g, " ")}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.file_name ?? "(no file name)"}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                    background: cfg.bg, color: cfg.color,
                    display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
                  }}>
                    <cfg.Icon size={10} color={cfg.color} />
                    {cfg.label}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF" }}>
                  <span>{new Date(d.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  {conf != null && <span style={{ fontFamily: "monospace" }}>AI {conf}%</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
