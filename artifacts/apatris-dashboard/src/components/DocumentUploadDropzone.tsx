import { useRef, useState } from "react";
import { Upload, FileText, Loader2, X } from "lucide-react";

/**
 * Tier 1 closeout #23/#24 — unified document-upload dropzone.
 *
 * #23 — AI-first matching: workerId is OPTIONAL. When the user provides one,
 * smart-ingest uses it directly. When omitted, the caller runs identity
 * extraction first (POST /api/smart-doc/process) and shows the
 * UploadConfirmationModal so the user can confirm the matched worker or
 * create a new one. This dropzone is intentionally agnostic about that
 * resolution — it just emits the chosen File via onFileSelected and lets
 * the parent run the journey.
 *
 * #24 — affordance: replaced the prior "plain text" file input with a
 * proper button + drag-and-drop dashed border zone. Visible interactive
 * state, hover/dragover highlight, post-selection preview.
 *
 * Used by:
 *   - pages/DocumentWorkflow.tsx (the review-queue upload control)
 *   - pages/SmartIngestPage.tsx  (the AI-ingest dev tool)
 * Both wire to the same backend (`/api/documents/smart-ingest`) — this
 * component centralizes the picker + dropzone UI so there's a single
 * source of truth for the upload affordance.
 */

interface Props {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  accept?: string;
  label?: string;
  hint?: string;
}

export function DocumentUploadDropzone({
  onFileSelected,
  disabled = false,
  busy = false,
  busyLabel = "Processing…",
  accept = ".pdf,.jpg,.jpeg,.png,.webp",
  label = "Drop a document or click to choose",
  hint = "PDF, JPG, PNG — AI reads identity automatically",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [chosen, setChosen] = useState<File | null>(null);

  const pick = () => {
    if (disabled || busy) return;
    fileRef.current?.click();
  };

  const handleFile = (file: File) => {
    setChosen(file);
    onFileSelected(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const reset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setChosen(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (busy) {
    return (
      <div className="rounded-xl border-2 border-blue-500/40 bg-blue-500/5 p-8 text-center">
        <Loader2 className="w-8 h-8 mx-auto mb-3 text-blue-400 animate-spin" />
        <p className="text-sm font-bold text-blue-300">{busyLabel}</p>
        {chosen && <p className="text-xs text-slate-400 mt-1">{chosen.name}</p>}
      </div>
    );
  }

  return (
    <div
      onClick={pick}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className="rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all text-center"
      style={{
        borderColor: dragOver ? "#60a5fa" : disabled ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.15)",
        background: dragOver ? "rgba(59,130,246,0.08)" : "rgba(15,23,42,0.4)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {chosen ? (
        <div className="flex items-center justify-center gap-3">
          <FileText className="w-6 h-6 text-blue-400" />
          <div className="text-left">
            <p className="text-sm font-bold text-white">{chosen.name}</p>
            <p className="text-xs text-slate-500">{(chosen.size / 1024).toFixed(1)} KB · click to replace</p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="ml-2 p-1.5 rounded-md hover:bg-slate-700 text-slate-400"
            title="Clear"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3" style={{ background: "rgba(59,130,246,0.12)" }}>
            <Upload className="w-6 h-6" style={{ color: "#60a5fa" }} />
          </div>
          <p className="text-sm font-bold text-white">{label}</p>
          <p className="text-xs text-slate-500 mt-1">{hint}</p>
        </>
      )}
    </div>
  );
}
