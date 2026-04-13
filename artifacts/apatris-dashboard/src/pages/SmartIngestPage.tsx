/**
 * Smart Document Ingest — upload document, AI reads and classifies it.
 * Includes Developer Feedback / Correct Data button for Anna to log OCR errors.
 */
import React, { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { Upload, Loader2, FileText, CheckCircle2, AlertTriangle, Eye, MessageSquareWarning, Send, X } from "lucide-react";

export default function SmartIngestPage() {
  const [workerId, setWorkerId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackField, setFeedbackField] = useState("");
  const [feedbackCorrection, setFeedbackCorrection] = useState("");
  const [feedbackErrorType, setFeedbackErrorType] = useState("extraction_error");
  const [feedbackSeverity, setFeedbackSeverity] = useState("medium");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: workers } = useQuery<any[]>({
    queryKey: ["workers-ingest"], queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      const j = await r.json(); return (j.workers ?? j ?? []).slice(0, 100);
    }, staleTime: 60000,
  });

  const handleUpload = async (file: File) => {
    if (!workerId) return;
    setUploading(true);
    setFeedbackSent(false);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch(`${BASE}api/documents/smart-ingest`, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ image: base64, mimeType: file.type, workerId, fileName: file.name }),
        });
        setResult(await res.json());
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch { setUploading(false); }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackField || !feedbackCorrection) return;
    setFeedbackSending(true);
    try {
      const ocrValue = result?.extractedData?.[feedbackField] ?? null;
      await fetch(`${BASE}api/first-contact/ocr-feedback`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          documentId: result?.id ?? null,
          workerId: workerId || null,
          docType: result?.docType ?? "UNKNOWN",
          fieldName: feedbackField,
          ocrValue: ocrValue != null ? String(ocrValue) : null,
          correctedValue: feedbackCorrection,
          errorType: feedbackErrorType,
          severity: feedbackSeverity,
          notes: feedbackNotes || null,
        }),
      });
      setFeedbackSent(true);
      setFeedbackField("");
      setFeedbackCorrection("");
      setFeedbackNotes("");
      setTimeout(() => setFeedbackSent(false), 3000);
    } catch { /* feedback is best-effort */ }
    setFeedbackSending(false);
  };

  const extractedFields = result?.extractedData
    ? Object.entries(result.extractedData).filter(([, v]) => v != null)
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div><h1 className="text-xl font-bold text-white">Smart Document Ingest</h1>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">AI Document Analysis &middot; OCR &middot; Classification</p></div>

        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
          <select value={workerId} onChange={e => setWorkerId(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
            <option value="">— Select Worker —</option>
            {(workers ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || !workerId}
            className="w-full py-3 rounded-lg border-2 border-dashed border-slate-600 hover:border-blue-500/50 text-sm font-bold text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Upload className="w-4 h-4" /> Drop or click to upload document</>}
          </button>
        </div>

        {result && (
          <div className="space-y-4">
            {/* Classification badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">{result.docType}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${(result.confidence ?? 0) >= 0.7 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{Math.round((result.confidence ?? 0) * 100)}%</span>
              {result.isRejection && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">REJECTION</span>}
              {result.mosRelevant && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">MOS 2026</span>}
            </div>

            {/* Rationale */}
            {result.rationale && <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3"><p className="text-xs text-slate-300">{result.rationale}</p></div>}

            {/* Extracted Data */}
            {extractedFields.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Extracted Data</h3>
                {extractedFields.map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs py-0.5"><span className="text-slate-500">{k}</span><span className="text-white font-mono">{String(typeof v === "object" ? (v as any)?.value ?? JSON.stringify(v) : v)}</span></div>
                ))}
              </div>
            )}

            {/* Draft */}
            {result.draft && <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
              <h3 className="text-xs font-bold text-purple-400 uppercase mb-2">Generated Draft</h3>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">{result.draft}</pre>
            </div>}

            {/* Legal Impact */}
            {result.legalImpact && <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Legal Impact</h3>
              <div className="text-xs space-y-0.5">
                <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="text-white">{result.legalImpact.currentStatus}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Risk</span><span className={result.legalImpact.riskLevel === "CRITICAL" ? "text-red-400" : "text-white"}>{result.legalImpact.riskLevel}</span></div>
              </div>
            </div>}

            {/* ═══ DEVELOPER FEEDBACK / CORRECT DATA ═══ */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareWarning className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-amber-400 uppercase">Developer Feedback</h3>
                </div>
                <button
                  onClick={() => { setFeedbackOpen(!feedbackOpen); setFeedbackSent(false); }}
                  className="px-3 py-1 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-colors flex items-center gap-1.5"
                >
                  {feedbackOpen ? <><X className="w-3 h-3" /> Close</> : <>Correct Data</>}
                </button>
              </div>

              {feedbackSent && (
                <div className="mt-2 flex items-center gap-2 text-xs text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Feedback logged — will improve OCR in next iteration
                </div>
              )}

              {feedbackOpen && !feedbackSent && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-slate-400">Log OCR errors so the extraction prompt can be tuned for better accuracy.</p>

                  {/* Field selector */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase block mb-0.5">Field with error</label>
                      <select
                        value={feedbackField}
                        onChange={e => setFeedbackField(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded px-2 py-1.5 text-xs"
                      >
                        <option value="">— Select field —</option>
                        {extractedFields.map(([k]) => <option key={k} value={k}>{k}</option>)}
                        <option value="doc_type">doc_type (classification)</option>
                        <option value="missing_field">missing field (not extracted)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase block mb-0.5">Error type</label>
                      <select
                        value={feedbackErrorType}
                        onChange={e => setFeedbackErrorType(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded px-2 py-1.5 text-xs"
                      >
                        <option value="extraction_error">Extraction error</option>
                        <option value="classification_error">Classification error</option>
                        <option value="date_format">Date format wrong</option>
                        <option value="name_mismatch">Name mismatch</option>
                        <option value="missing_field">Missing field</option>
                        <option value="wrong_field">Wrong field value</option>
                        <option value="confidence_too_high">Confidence too high</option>
                        <option value="mrz_parse_error">MRZ parse error</option>
                        <option value="language_error">Language/encoding error</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase block mb-0.5">Correct value</label>
                      <input
                        type="text"
                        value={feedbackCorrection}
                        onChange={e => setFeedbackCorrection(e.target.value)}
                        placeholder="What should the value be?"
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded px-2 py-1.5 text-xs placeholder-slate-600"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase block mb-0.5">Severity</label>
                      <select
                        value={feedbackSeverity}
                        onChange={e => setFeedbackSeverity(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded px-2 py-1.5 text-xs"
                      >
                        <option value="low">Low — minor formatting</option>
                        <option value="medium">Medium — wrong value</option>
                        <option value="high">High — critical field wrong</option>
                        <option value="critical">Critical — completely wrong</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 uppercase block mb-0.5">Notes (optional)</label>
                    <input
                      type="text"
                      value={feedbackNotes}
                      onChange={e => setFeedbackNotes(e.target.value)}
                      placeholder="Additional context for prompt tuning..."
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded px-2 py-1.5 text-xs placeholder-slate-600"
                    />
                  </div>

                  <button
                    onClick={handleFeedbackSubmit}
                    disabled={!feedbackField || !feedbackCorrection || feedbackSending}
                    className="w-full py-2 rounded-md text-xs font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {feedbackSending ? <><Loader2 className="w-3 h-3 animate-spin" /> Submitting...</> : <><Send className="w-3 h-3" /> Log OCR Feedback</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
