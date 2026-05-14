import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileCheck, Clock, XCircle, CheckCircle2, Upload, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

/**
 * Tier 1 #1: dashboard document workflow tab — re-wired to the existing
 * smart-ingest pipeline (artifacts/api-server/src/services/smart-ingest.ts).
 *
 * Pre-fix the tab fetched /api/workflows/* — never built server-side. The
 * 404 was caught and the "All documents reviewed" empty panel rendered
 * alongside a "Failed to load documents" toast. Compliance fiction.
 *
 * Now:
 *  - reads /api/documents/smart-ingest/queue + /stats (queue is the cross-
 *    worker pending list joined against workers.name)
 *  - approve/reject POST /documents/smart-ingest/:id/{approve,reject}
 *  - explicit four-state render: loading / error / empty / populated
 *  - upload button posts to /api/documents/smart-ingest with worker picker
 */

function authHeaders(): Record<string, string> {
  // Reads from the canonical dashboard token key. The other legacy keys
  // (eej_jwt, apatris_jwt) are queued for Tier 2 unification — this surface
  // is fixed to eej_token now so the wire-up doesn't drift.
  const token = sessionStorage.getItem("eej_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function authHeadersNoContentType(): Record<string, string> {
  const token = sessionStorage.getItem("eej_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface WorkflowDoc {
  id: string; workerName: string; documentType: string; status: string;
  fileName: string | null; uploadedBy: string; uploadedAt: string;
  reviewerName: string | null; reviewedAt: string | null; reviewComment: string | null;
  rejectionReason: string | null; version: number; expiryDate: string | null;
}

interface Stats { uploaded: number; under_review: number; approved: number; rejected: number; resubmit_requested: number }

interface WorkerOption { id: string; name: string }

const EMPTY_STATS: Stats = { uploaded: 0, under_review: 0, approved: 0, rejected: 0, resubmit_requested: 0 };

export default function DocumentWorkflow() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [docs, setDocs] = useState<WorkflowDoc[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  // Explicit error state — pre-fix this didn't exist and the empty branch
  // rendered as success even when the fetch failed.
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${API}/documents/smart-ingest/queue`, { headers: authHeaders() }).then(async r => {
        if (!r.ok) throw new Error(`Queue: HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`${API}/documents/smart-ingest/stats`, { headers: authHeaders() }).then(async r => {
        if (!r.ok) throw new Error(`Stats: HTTP ${r.status}`);
        return r.json();
      }),
    ]).then(([q, s]) => {
      setDocs(q.documents ?? []);
      setStats(s.stats ?? EMPTY_STATS);
    }).catch((e: Error) => {
      setError(e.message);
      // Intentionally NOT clearing docs/stats here — leaving last-known
      // values in place if a refresh fails is less misleading than wiping
      // the screen to zeroes that look like "all reviewed."
    }).finally(() => setLoading(false));
  };

  // Worker list for the upload picker — uses the existing /workers endpoint.
  const loadWorkers = () => {
    fetch(`${API}/workers`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { workers: [] })
      .then(d => {
        const list = (d.workers ?? []) as Array<{ id: string; name: string }>;
        setWorkers(list.map(w => ({ id: w.id, name: w.name })));
      })
      .catch(() => setWorkers([]));
  };

  useEffect(() => { load(); loadWorkers(); }, []);

  const approve = async (id: string) => {
    try {
      const r = await fetch(`${API}/documents/smart-ingest/${id}/approve`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ comment: "Approved" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast({ title: "Approved", description: "Document marked as approved." });
      load();
    } catch (e) {
      toast({ title: "Approve failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const reject = async (id: string) => {
    const reason = prompt(t("docWorkflow.rejectReason") || "Reason for rejection?");
    if (!reason || !reason.trim()) return;
    try {
      const r = await fetch(`${API}/documents/smart-ingest/${id}/reject`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ reason }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast({ title: "Rejected", description: "Document marked as rejected." });
      load();
    } catch (e) {
      toast({ title: "Reject failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !selectedWorkerId) {
      toast({ title: "Upload error", description: "Choose a worker and a file first.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      // smart-ingest expects base64-encoded payload.
      const arrayBuf = await uploadFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const r = await fetch(`${API}/documents/smart-ingest`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          image: base64,
          mimeType: uploadFile.type || "application/octet-stream",
          workerId: selectedWorkerId,
          fileName: uploadFile.name,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      toast({ title: "Uploaded", description: `${uploadFile.name} sent to smart-ingest.` });
      setUploadFile(null);
      setSelectedWorkerId("");
      setUploadOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const statusIcon: Record<string, React.ReactNode> = {
    uploaded: <Upload className="w-4 h-4 text-blue-400" />,
    under_review: <Clock className="w-4 h-4 text-amber-400" />,
    approved: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    rejected: <XCircle className="w-4 h-4 text-lime-300" />,
  };

  const statusColor: Record<string, string> = {
    uploaded: "bg-blue-900/50 text-blue-400",
    under_review: "bg-amber-900/50 text-amber-400",
    approved: "bg-emerald-900/50 text-emerald-400",
    rejected: "bg-lime-400/50 text-lime-300",
    resubmit_requested: "bg-orange-900/50 text-orange-400",
  };

  const statusLabel = (s: string): string =>
    ({
      uploaded: t("docWorkflow.statusUploaded") || "Uploaded",
      under_review: t("docWorkflow.statusUnderReview") || "Under Review",
      approved: t("docWorkflow.statusApproved") || "Approved",
      rejected: t("docWorkflow.statusRejected") || "Rejected",
      resubmit_requested: t("docWorkflow.statusResubmit") || "Resubmit",
    })[s] ?? s.replace(/_/g, " ").toUpperCase();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-red-500" /> {t("docWorkflow.title")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t("docWorkflow.subtitle")}</p>
        </div>
        <button
          onClick={() => setUploadOpen(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-400/15 text-yellow-300 border border-yellow-400/40 hover:bg-yellow-400/25 text-xs font-bold uppercase tracking-wider"
        >
          <Upload className="w-4 h-4" /> {uploadOpen ? "Cancel upload" : "Upload document"}
        </button>
      </div>

      {/* Upload panel — wired to POST /api/documents/smart-ingest. Worker
          selection is required so the AI pipeline has context for legal-
          impact assessment. */}
      {uploadOpen && (
        <div className="bg-slate-800/60 border border-yellow-400/30 rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest text-yellow-300">
            New document → smart-ingest pipeline
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Worker</label>
              <select
                value={selectedWorkerId}
                onChange={e => setSelectedWorkerId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-white"
              >
                <option value="">— select worker —</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,image/*"
                onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate-300"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setUploadFile(null); setSelectedWorkerId(""); setUploadOpen(false); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              className="px-3 py-2 text-xs font-bold uppercase text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadFile || !selectedWorkerId}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-400 text-slate-900 text-xs font-black uppercase tracking-wider hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Uploading…" : "Send to AI pipeline"}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: t("docWorkflow.uploaded") || "Uploaded", count: stats.uploaded, color: "text-blue-400" },
          { label: t("docWorkflow.underReview") || "Under Review", count: stats.under_review, color: "text-amber-400" },
          { label: t("docWorkflow.approved") || "Approved", count: stats.approved, color: "text-emerald-400" },
          { label: t("docWorkflow.rejected") || "Rejected", count: stats.rejected, color: "text-lime-300" },
          { label: t("docWorkflow.resubmit") || "Resubmit", count: stats.resubmit_requested, color: "text-orange-400" },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/50 rounded-xl p-3 text-center border border-slate-700/50">
            <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
            <div className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Queue — four distinct states: loading / error / empty / populated.
          Pre-fix only loading + empty + populated existed; error fell into
          empty and rendered "All documents reviewed." */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : error ? (
        <div className="bg-red-900/20 rounded-xl p-6 border border-red-500/40 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
          <div>
            <div className="text-sm font-bold text-red-300">Could not load document queue</div>
            <div className="text-xs text-red-400/80 mt-1 font-mono">{error}</div>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 text-xs font-bold uppercase tracking-wider"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700/50">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-bold text-white">{t("docWorkflow.allReviewed") || "All documents reviewed"}</p>
          <p className="text-xs text-slate-400 mt-1">{t("docWorkflow.noPending") || "No pending items in the queue."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{statusIcon[doc.status] ?? <FileCheck className="w-4 h-4 text-slate-400" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{doc.workerName}</span>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-xs font-semibold text-slate-300">{doc.documentType}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ml-auto ${statusColor[doc.status] ?? ""}`}>
                      {statusLabel(doc.status)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {doc.fileName ?? (t("docWorkflow.noFile") || "(no file name)")} · v{doc.version} · {t("docWorkflow.uploadedBy") || "by"} {doc.uploadedBy} · {new Date(doc.uploadedAt).toLocaleDateString("en-GB")}
                    {doc.expiryDate ? ` · ${t("docWorkflow.expires") || "expires"} ${new Date(doc.expiryDate).toLocaleDateString("en-GB")}` : ""}
                  </div>
                </div>
              </div>
              {(doc.status === "uploaded" || doc.status === "under_review") && (
                <div className="flex gap-2 mt-3 pl-7">
                  <button onClick={() => approve(doc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/40 text-emerald-400 text-xs font-bold hover:bg-emerald-900/60 transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {t("docWorkflow.approveBtn") || "Approve"}
                  </button>
                  <button onClick={() => reject(doc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-400/40 text-lime-300 text-xs font-bold hover:bg-lime-400/60 transition-colors">
                    <XCircle className="w-3.5 h-3.5" /> {t("docWorkflow.rejectBtn") || "Reject"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
