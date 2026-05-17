import { useEffect, useState } from "react";
import { FileText, Loader2, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

/**
 * Tier 1 closeout #25 — list of smart_documents for one worker.
 *
 * Pre-fix: documents went into Postgres via smart-ingest but didn't appear
 * in the worker profile's Documents section. End-to-end retrieval was
 * broken at the UI. This component closes that loop — queries the existing
 * `GET /api/documents/smart-ingest/:workerId` and renders the list with
 * loading / error / empty / populated states distinguished.
 *
 * Renders: doc type, file name, upload date, status, AI confidence.
 * Ordered by upload date descending. Empty state is honest-empty.
 */

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("eej_token");
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

const STATUS_CFG: Record<string, { Icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
  analyzed:           { Icon: Clock,         cls: "text-amber-400 bg-amber-900/30",   label: "Awaiting review" },
  verified:           { Icon: CheckCircle2,  cls: "text-emerald-400 bg-emerald-900/30", label: "Approved" },
  rejected:           { Icon: XCircle,       cls: "text-red-400 bg-red-900/30",       label: "Rejected" },
  resubmit_requested: { Icon: AlertTriangle, cls: "text-orange-400 bg-orange-900/30", label: "Resubmit" },
};

export function WorkerDocumentsList({ workerId, refreshKey }: { workerId: string; refreshKey?: number }) {
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
  }, [workerId, refreshKey]);

  return (
    <div>
      <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3 flex items-center gap-2">
        <FileText className="w-3.5 h-3.5" />
        Submitted Documents
      </h3>
      {loading ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800 border border-slate-700">
          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
          <span className="text-xs text-gray-400">Loading documents…</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-900/20 border border-red-500/40">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-xs text-red-300">Could not load documents: {error}</span>
        </div>
      ) : !docs || docs.length === 0 ? (
        <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 text-center">
          <FileText className="w-5 h-5 text-gray-600 mx-auto mb-1.5" />
          <p className="text-xs font-medium text-gray-400">No documents on file</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Upload via Document Workflow or worker self-upload</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => {
            const cfg = STATUS_CFG[d.status ?? "analyzed"] ?? STATUS_CFG.analyzed;
            const conf = d.confidence != null ? Math.round(d.confidence * 100) : null;
            return (
              <div key={d.id} className="p-3 rounded-lg bg-slate-800 border border-slate-700">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">
                      {(d.doc_type ?? "UNKNOWN").replace(/_/g, " ")}
                    </p>
                    <p className="text-[11px] text-gray-500 font-mono truncate">
                      {d.file_name ?? "(no file name)"}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${cfg.cls}`}>
                    <cfg.Icon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <span>{new Date(d.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  {conf != null && <span className="font-mono">AI {conf}%</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
