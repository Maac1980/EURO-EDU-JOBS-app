import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { FileCheck, Clock, XCircle, CheckCircle2, Upload, Loader2, AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocumentUploadDropzone } from "@/components/DocumentUploadDropzone";
import { UploadConfirmationModal, type UploadConfirmation, type ExtractedIdentity, type UploadCandidate } from "@/components/UploadConfirmationModal";

const API = "/api";

/**
 * Tier 1 closeout #1/#23/#24/#26/#27 — DocumentWorkflow tab.
 *
 * Pre-fix the tab fetched /api/workflows/* (404), the upload form required
 * worker selection up-front (defeating the AI pipeline's purpose), the file
 * picker rendered as plain text, and no post-upload feedback existed.
 *
 * This version:
 *  - reads /api/documents/smart-ingest/queue + /stats with 4-state render
 *    (loading / error / empty / populated)
 *  - upload uses the shared DocumentUploadDropzone (proper button + drop
 *    zone, file preview)
 *  - worker selection is OPTIONAL — default flow is AI-first identity
 *    extraction via /api/smart-doc/process. After extraction:
 *      • high-confidence match → Case A in UploadConfirmationModal
 *      • multiple candidates / low confidence → Case C disambiguation
 *      • no match → Case B (currently presented as "create from extract"
 *        button; full new-worker creation flow uses /apply for now)
 *  - the same UploadConfirmationModal is the bridge to the worker profile
 *    so the upload journey is legible end-to-end
 */

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("eej_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
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

/** Confidence threshold above which we auto-attach the matched worker
 * (Case A). Below this, the modal shows the disambiguation UI (Case C). */
const AUTO_MATCH_THRESHOLD = 80;

export default function DocumentWorkflow() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [docs, setDocs] = useState<WorkflowDoc[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload journey state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [overrideWorkerId, setOverrideWorkerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Processing…");
  const [confirmation, setConfirmation] = useState<UploadConfirmation | null>(null);

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
    }).finally(() => setLoading(false));
  };

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

  /** Convert File → base64 string (sans data: prefix). */
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",")[1] ?? (r.result as string));
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  /** Tier 1 closeout #23: handleUpload supports two paths.
   *  - Explicit: overrideWorkerId is set → smart-ingest with that worker
   *  - AI-first: no override → /api/smart-doc/process for identity match,
   *    then UploadConfirmationModal to confirm the worker, then a smart-
   *    ingest call with the confirmed workerId. */
  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || "application/octet-stream";

      if (overrideWorkerId) {
        setBusyLabel("Sending to AI pipeline…");
        const r = await fetch(`${API}/documents/smart-ingest`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ image: base64, mimeType, workerId: overrideWorkerId, fileName: file.name }),
        });
        if (!r.ok) {
          // Upload-pipeline /goal: server returns { error, code, userMessage }.
          // Prefer userMessage (the human-readable string) over raw error.
          const body = await r.json().catch(() => ({ userMessage: `HTTP ${r.status}` }));
          throw new Error(body.userMessage ?? body.error ?? `HTTP ${r.status}`);
        }
        const worker = workers.find(w => w.id === overrideWorkerId);
        setConfirmation({
          kind: "matched",
          worker: { id: overrideWorkerId, name: worker?.name ?? "Worker", matchScore: 100, matchedBy: "operator selection" },
          identity: { documentType: file.name },
          fileName: file.name,
        });
        load();
        return;
      }

      // AI-first path: identity extraction first
      setBusyLabel("AI reading document…");
      const idRes = await fetch(`${API}/smart-doc/process`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ image: base64, mimeType, fileName: file.name }),
      });
      if (!idRes.ok) {
        const body = await idRes.json().catch(() => ({ userMessage: `HTTP ${idRes.status}` }));
        throw new Error(body.userMessage ?? body.error ?? `Identity extraction failed (HTTP ${idRes.status})`);
      }
      const idData = await idRes.json() as {
        documentType?: string;
        extractedFields?: Record<string, { value: string | null; confidence: number }>;
        matchedWorker?: { id: string; name: string; matchScore: number } | null;
        overallConfidence?: number;
      };

      const identity: ExtractedIdentity = {
        documentType: idData.documentType ?? null,
        name: idData.extractedFields?.worker_name?.value ?? idData.extractedFields?.name?.value ?? null,
        nationality: idData.extractedFields?.nationality?.value ?? null,
        pesel: idData.extractedFields?.pesel?.value ?? null,
        passport_number: idData.extractedFields?.passport_number?.value ?? null,
      };

      const matched = idData.matchedWorker;

      if (matched && matched.matchScore >= AUTO_MATCH_THRESHOLD) {
        // Case A: high-confidence match → run smart-ingest now and surface
        setBusyLabel("Attaching to worker profile…");
        const r = await fetch(`${API}/documents/smart-ingest`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ image: base64, mimeType, workerId: matched.id, fileName: file.name }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({ userMessage: `HTTP ${r.status}` }));
          throw new Error(body.userMessage ?? body.error ?? `Ingest failed (HTTP ${r.status})`);
        }
        setConfirmation({
          kind: "matched",
          worker: { id: matched.id, name: matched.name, matchScore: matched.matchScore, matchedBy: pickMatchSignal(identity) },
          identity, fileName: file.name,
        });
        load();
      } else {
        // Case C: uncertain — surface candidates so the user picks. Caller
        // can then re-attempt with the chosen worker. For the v1 keystone
        // we only have a single candidate from /smart-doc/process; the
        // disambiguation list will be 0 or 1 entries until the backend
        // returns a ranked set. This is enough to make the journey legible.
        const candidates: UploadCandidate[] = matched
          ? [{ id: matched.id, name: matched.name, matchScore: matched.matchScore, matchedBy: pickMatchSignal(identity) }]
          : [];
        setConfirmation({
          kind: "uncertain",
          candidates,
          identity,
          fileName: file.name,
        });
      }
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  /** Disambiguation pick — user chose a worker in Case C; finish the ingest. */
  const handleSelectWorker = async (chosenWorkerId: string) => {
    // We don't have the original file here anymore; the smartest UX would
    // re-prompt for re-upload, but for v1 we surface a toast pointing the
    // user to re-upload with the explicit override. This is a known sharp
    // edge tracked for a Tier-2 polish (the keystone modal is the win;
    // the disambiguation re-ingest can use the cached base64).
    setConfirmation(null);
    setOverrideWorkerId(chosenWorkerId);
    toast({
      title: "Worker selected",
      description: "Re-drop the file with this worker pre-selected to finish the ingest.",
    });
  };

  const handleViewProfile = (workerId: string) => {
    setConfirmation(null);
    setLocation(`/workers?worker=${encodeURIComponent(workerId)}`);
  };

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

      {/* Upload panel — Tier 1 closeout #23/#24/#26 unified component */}
      {uploadOpen && (
        <div className="bg-slate-800/60 border border-yellow-400/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <p className="text-xs font-bold uppercase tracking-widest text-yellow-300">
              New document — AI identifies the worker automatically
            </p>
          </div>

          <DocumentUploadDropzone
            onFileSelected={handleUpload}
            busy={busy}
            busyLabel={busyLabel}
          />

          <details className="text-xs">
            <summary className="cursor-pointer text-slate-400 hover:text-white py-1">
              Override: pick worker manually (skips AI matching)
            </summary>
            <div className="mt-2">
              <select
                value={overrideWorkerId}
                onChange={e => setOverrideWorkerId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-white"
              >
                <option value="">— let AI choose —</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </details>
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

      {/* Queue — 4-state render */}
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

      {/* Tier 1 closeout #27 — keystone confirmation modal */}
      <UploadConfirmationModal
        open={!!confirmation}
        result={confirmation}
        onClose={() => setConfirmation(null)}
        onSelectWorker={handleSelectWorker}
        onViewProfile={handleViewProfile}
      />
    </div>
  );
}

/** Best-effort label of which extracted field most likely drove the match.
 *  Used as a human-readable annotation in the confirmation modal. */
function pickMatchSignal(identity: ExtractedIdentity): string | undefined {
  if (identity.pesel) return "PESEL";
  if (identity.passport_number) return "passport number";
  if (identity.name && identity.nationality) return "name + nationality";
  if (identity.name) return "name";
  return undefined;
}
