import { CheckCircle2, AlertTriangle, UserPlus, ArrowRight, X, FileText, Sparkles } from "lucide-react";

/**
 * Tier 1 closeout #27 (THE KEYSTONE).
 *
 * Renders the three-case post-upload confirmation modal:
 *
 *   Case A — matched: AI identity extraction matched an existing worker
 *                     above the confidence threshold. Show name + matched-by
 *                     field. CTA: "View profile →".
 *
 *   Case B — new:     No match found. New worker row was created (or will
 *                     be created on confirm). Show extracted identity.
 *                     CTA: "View new profile →".
 *
 *   Case C — uncertain: Multiple candidate matches OR low-confidence single
 *                       match. Show ranked candidates with a "Pick this one"
 *                       per row, plus "Create new with this extracted data"
 *                       as the bottom button.
 *
 * This modal is the bridge between an upload finishing and the user
 * understanding what happened to the document. Pre-fix, uploads completed
 * silently — the worker had no visible result, no path to find what was
 * uploaded, no AI feedback. This is the legibility layer.
 */

export interface UploadCandidate {
  id: string;
  name: string;
  matchScore: number;          // 0-100
  matchedBy?: string;          // human-readable: "PESEL", "passport_number", "name+nationality"
}

export interface ExtractedIdentity {
  name?: string | null;
  nationality?: string | null;
  documentType?: string | null;
  pesel?: string | null;
  passport_number?: string | null;
  [k: string]: unknown;
}

export type UploadConfirmation =
  | { kind: "matched"; worker: UploadCandidate; identity: ExtractedIdentity; fileName: string }
  | { kind: "new"; createdWorker: { id: string; name: string }; identity: ExtractedIdentity; fileName: string }
  | { kind: "uncertain"; candidates: UploadCandidate[]; identity: ExtractedIdentity; fileName: string };

interface Props {
  open: boolean;
  result: UploadConfirmation | null;
  onClose: () => void;
  onSelectWorker: (workerId: string) => void;
  /** Called when the user picks "Create new worker with this data" in Case C. */
  onCreateNew?: (identity: ExtractedIdentity) => void;
  /** Called when the user clicks "View profile →" in Case A or B. */
  onViewProfile: (workerId: string) => void;
}

const SCORE_HIGH = 80;
const SCORE_MED  = 60;

export function UploadConfirmationModal({ open, result, onClose, onSelectWorker, onCreateNew, onViewProfile }: Props) {
  if (!open || !result) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(11,16,30,0.78)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0f172a", borderRadius: 16, maxWidth: 480, width: "100%",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-black uppercase tracking-widest text-white">
              AI Document Result
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FileText className="w-3.5 h-3.5" />
            <span className="font-mono truncate">{result.fileName}</span>
          </div>

          {result.kind === "matched" && <MatchedBody result={result} onViewProfile={onViewProfile} />}
          {result.kind === "new"     && <NewBody result={result} onViewProfile={onViewProfile} />}
          {result.kind === "uncertain" && (
            <UncertainBody
              result={result}
              onSelectWorker={onSelectWorker}
              onCreateNew={onCreateNew}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MatchedBody({ result, onViewProfile }: { result: Extract<UploadConfirmation, { kind: "matched" }>; onViewProfile: (id: string) => void }) {
  const { worker, identity } = result;
  return (
    <>
      <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/30">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-300">Document attached to {worker.name}</p>
          <p className="text-xs text-emerald-200/70 mt-0.5">
            Identified as <span className="font-mono">{identity.documentType ?? "document"}</span>
            {worker.matchedBy && <> · matched by <span className="font-bold">{worker.matchedBy}</span></>}
            {worker.matchScore > 0 && <> · {worker.matchScore}% confidence</>}
          </p>
        </div>
      </div>

      <ExtractedSummary identity={identity} />

      <button
        onClick={() => onViewProfile(worker.id)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-500 transition-all"
      >
        View {worker.name}'s profile <ArrowRight className="w-4 h-4" />
      </button>
    </>
  );
}

function NewBody({ result, onViewProfile }: { result: Extract<UploadConfirmation, { kind: "new" }>; onViewProfile: (id: string) => void }) {
  const { createdWorker, identity } = result;
  return (
    <>
      <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/8 border border-blue-500/30">
        <UserPlus className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-blue-300">New worker profile created: {createdWorker.name}</p>
          <p className="text-xs text-blue-200/70 mt-0.5">
            No existing match found — the AI extracted identity is the seed for this new record.
          </p>
        </div>
      </div>

      <ExtractedSummary identity={identity} />

      <button
        onClick={() => onViewProfile(createdWorker.id)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-500 transition-all"
      >
        View new profile <ArrowRight className="w-4 h-4" />
      </button>
    </>
  );
}

function UncertainBody({ result, onSelectWorker, onCreateNew }: { result: Extract<UploadConfirmation, { kind: "uncertain" }>; onSelectWorker: (id: string) => void; onCreateNew?: (identity: ExtractedIdentity) => void }) {
  const { candidates, identity } = result;
  return (
    <>
      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/8 border border-amber-500/30">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-300">AI couldn't confidently identify the worker</p>
          <p className="text-xs text-amber-200/70 mt-0.5">
            Please pick the right match below, or create a new worker with the extracted data.
          </p>
        </div>
      </div>

      <ExtractedSummary identity={identity} />

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Likely matches</p>
        {candidates.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No candidate matches in the database.</p>
        ) : candidates.map((c) => {
          const color = c.matchScore >= SCORE_HIGH ? "#22c55e" : c.matchScore >= SCORE_MED ? "#f59e0b" : "#94a3b8";
          return (
            <button
              key={c.id}
              onClick={() => onSelectWorker(c.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{c.name}</p>
                {c.matchedBy && <p className="text-[10px] text-slate-500 mt-0.5">matched by {c.matchedBy}</p>}
              </div>
              <span
                className="text-xs font-mono font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
              >
                {c.matchScore}%
              </span>
            </button>
          );
        })}
      </div>

      {onCreateNew && (
        <button
          onClick={() => onCreateNew(identity)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold uppercase tracking-wider text-blue-300 bg-blue-500/10 border border-blue-500/40 hover:bg-blue-500/20 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Create new worker with this data
        </button>
      )}
    </>
  );
}

function ExtractedSummary({ identity }: { identity: ExtractedIdentity }) {
  const rows: [string, string | null | undefined][] = [
    ["Name",        identity.name],
    ["Nationality", identity.nationality],
    ["Doc type",    identity.documentType],
    ["PESEL",       identity.pesel],
    ["Passport #",  identity.passport_number],
  ].filter(([, v]) => v != null && v !== "") as [string, string | null | undefined][];

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Extracted by AI</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <span className="text-slate-500">{k}</span>
            <span className="font-mono text-slate-200 text-right truncate">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
