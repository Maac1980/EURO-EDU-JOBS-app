import { useState, useRef } from "react";
import {
  X,
  Upload,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  Camera,
} from "lucide-react";
import {
  scanDocument,
  applyScannedDocument,
  type ScanResponse,
  type ScanApplyResponse,
} from "@/lib/api";

interface Props {
  onClose: () => void;
  onApplied?: (result: ScanApplyResponse) => void;
  // When set, the flow skips the worker-matching step and applies the scan
  // directly to this worker. Used by the cockpit's "scan for this worker"
  // entry point — saves Liza/Anna a click when they already know whose
  // document they're filing.
  preselectedWorkerId?: string;
  preselectedWorkerName?: string;
}

type Step = "upload" | "scanning" | "review" | "applying" | "done" | "error";

const DOC_TYPE_LABELS: Record<string, string> = {
  passport: "Passport",
  trc: "TRC residence card",
  work_permit: "Work permit",
  bhp: "BHP / Medical",
  contract: "Employment contract",
  cv: "CV / Resume",
  medical: "Medical certificate",
  other: "Document",
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DocumentScanFlow({ onClose, onApplied, preselectedWorkerId, preselectedWorkerName }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [result, setResult] = useState<ScanApplyResponse | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFile(f: File) {
    setFile(f);
    setError(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }

  async function runScan() {
    if (!file) return;
    setStep("scanning");
    setError(null);
    try {
      const res = await scanDocument(file);
      setScan(res);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setStep("error");
    }
  }

  async function applyTo(workerId: string | null, createNew: boolean) {
    if (!scan) return;
    setStep("applying");
    setError(null);
    try {
      const res = await applyScannedDocument({
        entities: scan.entities,
        workerId,
        createNew,
        allowOverwrite,
        inputHash: scan.inputHash,
        filename: file?.name,
      });
      setResult(res);
      setStep("done");
      onApplied?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
      setStep("error");
    }
  }

  const confidencePct = scan ? Math.round(scan.entities.confidence * 100) : 0;

  return (
    <div className="ds-overlay" onClick={onClose}>
      <div className="ds-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="ds-header">
          <div className="ds-header-info">
            <h2 className="ds-title">
              <Sparkles size={16} strokeWidth={2.2} /> Scan a document
            </h2>
            <div className="ds-subtitle">
              AI extracts the fields and matches to a worker. You confirm.
            </div>
          </div>
          <button className="ds-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2.5} />
          </button>
        </header>

        {/* Step 1 — Upload */}
        {step === "upload" && (
          <div className="ds-body">
            <button className="ds-drop" onClick={() => inputRef.current?.click()}>
              {preview ? (
                <img src={preview} alt="Document preview" className="ds-preview" />
              ) : (
                <>
                  <Upload size={28} strokeWidth={1.8} />
                  <div className="ds-drop-title">Choose a document image</div>
                  <div className="ds-drop-sub">JPEG, PNG, WebP · up to 20 MB</div>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="ds-actions">
              <button
                className="ds-secondary"
                onClick={() => inputRef.current?.click()}
              >
                <Camera size={14} strokeWidth={2.2} /> Re-pick
              </button>
              <button
                className="ds-primary"
                disabled={!file}
                onClick={runScan}
              >
                <Sparkles size={14} strokeWidth={2.2} /> Extract entities
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Scanning */}
        {step === "scanning" && (
          <div className="ds-body ds-center">
            <Sparkles size={32} strokeWidth={1.5} className="ds-spin" />
            <div className="ds-status">Asking Claude to read this document…</div>
          </div>
        )}

        {/* Step 3 — Review */}
        {step === "review" && scan && (
          <div className="ds-body">
            <div className="ds-doc-type">
              <span className="ds-doc-type-label">Document type</span>
              <span className="ds-doc-type-value">
                {DOC_TYPE_LABELS[scan.entities.docType] ?? scan.entities.docType}
              </span>
              <span
                className={`ds-confidence ${
                  confidencePct >= 80 ? "ds-c-high" : confidencePct >= 50 ? "ds-c-mid" : "ds-c-low"
                }`}
              >
                {confidencePct}% confident
              </span>
            </div>

            <div className="ds-section-label">Extracted fields</div>
            <div className="ds-fields">
              <Row label="Person name" value={scan.entities.personName} />
              <Row label="Document number" value={scan.entities.documentNumber} mono />
              <Row label="Date of birth" value={fmtDate(scan.entities.dateOfBirth)} />
              <Row label="Nationality" value={scan.entities.nationality} />
              <Row label="Issued" value={fmtDate(scan.entities.issueDate)} />
              <Row label="Expires" value={fmtDate(scan.entities.expiryDate)} />
              {scan.entities.issuingAuthority && (
                <Row label="Issuing authority" value={scan.entities.issuingAuthority} />
              )}
            </div>

            {/* When preselected (cockpit "scan for THIS worker"), skip matching
                entirely — there's only one target. Otherwise show the match list. */}
            {preselectedWorkerId ? (
              <>
                <div className="ds-section-label">Apply to</div>
                <button
                  className="ds-match"
                  onClick={() => applyTo(preselectedWorkerId, false)}
                >
                  <div className="ds-match-info">
                    <div className="ds-match-name">{preselectedWorkerName ?? "Current worker"}</div>
                    <div className="ds-match-meta">Pre-selected from cockpit · skipping AI match</div>
                  </div>
                  <div className="ds-match-right">
                    <ChevronRight size={14} strokeWidth={2.2} />
                  </div>
                </button>
              </>
            ) : (
              <>
                <div className="ds-section-label">Worker matches</div>
                {scan.matches.length === 0 ? (
                  <div className="ds-no-match">
                    <AlertTriangle size={14} strokeWidth={2.2} />
                    <span>No matching worker found in this tenant.</span>
                  </div>
                ) : (
                  <div className="ds-matches">
                    {scan.matches.map((m) => (
                      <button
                        key={m.id}
                        className="ds-match"
                        onClick={() => applyTo(m.id, false)}
                      >
                        <div className="ds-match-info">
                          <div className="ds-match-name">{m.name}</div>
                          <div className="ds-match-meta">
                            {m.nationality ?? "—"} · {m.jobRole ?? "no role"} · {m.pipelineStage ?? "—"}
                          </div>
                        </div>
                        <div className="ds-match-right">
                          <span
                            className={`ds-match-score ${
                              m.score >= 0.7 ? "ds-c-high" : m.score >= 0.4 ? "ds-c-mid" : "ds-c-low"
                            }`}
                          >
                            {Math.round(m.score * 100)}%
                          </span>
                          <ChevronRight size={14} strokeWidth={2.2} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="ds-overwrite-toggle">
              <input
                type="checkbox"
                id="ds-overwrite"
                checked={allowOverwrite}
                onChange={(e) => setAllowOverwrite(e.target.checked)}
              />
              <label htmlFor="ds-overwrite">Allow overwriting existing values</label>
            </div>

            <div className="ds-actions">
              <button
                className="ds-secondary"
                onClick={() => {
                  setStep("upload");
                  setScan(null);
                }}
              >
                Re-scan
              </button>
              {!preselectedWorkerId && (
                <button
                  className="ds-primary"
                  disabled={!scan.entities.personName}
                  onClick={() => applyTo(null, true)}
                >
                  <UserPlus size={14} strokeWidth={2.2} /> Create new worker
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 4 — Applying */}
        {step === "applying" && (
          <div className="ds-body ds-center">
            <Sparkles size={32} strokeWidth={1.5} className="ds-spin" />
            <div className="ds-status">Updating worker record…</div>
          </div>
        )}

        {/* Step 5 — Done */}
        {step === "done" && result && (
          <div className="ds-body ds-center">
            <CheckCircle2 size={40} strokeWidth={1.8} color="#10B981" />
            <div className="ds-done-title">
              {result.created ? "Worker created" : "Fields updated"}
            </div>
            <div className="ds-done-sub">
              {result.appliedFields.length > 0
                ? `Updated: ${result.appliedFields.join(", ")}`
                : "No fields changed (existing values already set; toggle “Allow overwriting” to replace)."}
            </div>
            <button className="ds-primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}

        {/* Error state */}
        {step === "error" && (
          <div className="ds-body ds-center">
            <AlertTriangle size={32} strokeWidth={1.5} color="#DC2626" />
            <div className="ds-error">{error}</div>
            <button className="ds-secondary" onClick={() => setStep("upload")}>
              Try again
            </button>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="ds-row">
      <div className="ds-row-label">{label}</div>
      <div className={"ds-row-value" + (mono ? " ds-mono" : "")}>
        {value === undefined || value === null || String(value) === "" ? "—" : String(value)}
      </div>
    </div>
  );
}
