/**
 * EEJ Worker Self-Upload — /worker/:workerId/update
 *
 * Mobile-first upload interface. Worker takes a photo or uploads PDF
 * of a newly received document (renewed TRC, new visa, etc.).
 * Routes through Smart Ingest → appends to existing Verification_Log.
 * No auth required (public link shared with worker).
 * EEJ Blue branding.
 */
import React, { useState, useRef, useEffect } from "react";
import { useRoute } from "wouter";
import { Upload, Camera, FileText, CheckCircle2, Loader2, Shield, AlertTriangle } from "lucide-react";

export default function WorkerSelfUpload() {
  const [, params] = useRoute("/worker/:workerId/update");
  const workerId = params?.workerId ?? "";
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/";

  // Fetch worker name for display
  useEffect(() => {
    if (!workerId) return;
    fetch(`${BASE}api/verify/${workerId}`)
      .then(r => r.json())
      .then(d => { if (d.verified) setWorkerName(d.initials ?? "Worker"); })
      .catch(() => {});
  }, [workerId]);

  const handleUpload = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          const res = await fetch(`${BASE}api/worker/${workerId}/upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image: base64,
              mimeType: selectedFile.type,
              fileName: selectedFile.name,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Upload failed");
          setResult(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed");
        }
        setUploading(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch {
      setError("Failed to read file");
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-sm w-full space-y-5">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3">
            <Upload className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-lg font-bold text-white">Upload Document</h1>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-1">EEJ &middot; Worker Self-Service</p>
          {workerName && <p className="text-xs text-blue-400 mt-2">Worker: {workerName}</p>}
        </div>

        {result ? (
          /* ── Success State ──────────────────────────────────── */
          <div className="rounded-xl border-2 border-green-500/30 bg-green-500/5 p-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <div>
              <h2 className="text-lg font-bold text-white">Document Sent to EEJ for Verification</h2>
              <p className="text-xs text-slate-400 mt-2">Our team will review and verify your document. You will be notified once it is processed.</p>
            </div>

            {result.ingest && result.ingest.docType && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-blue-400 uppercase">AI Detection</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">{result.ingest.docType}</span>
                  {result.ingest.confidence != null && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${(result.ingest.confidence ?? 0) >= 0.7 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                      {Math.round((result.ingest.confidence ?? 0) * 100)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            <button onClick={() => { setResult(null); setFile(null); setError(null); }}
              className="w-full py-2.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold hover:bg-blue-500/30 transition-colors">
              Upload Another Document
            </button>
          </div>
        ) : (
          /* ── Upload Interface ───────────────────────────────── */
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
              <p className="text-xs text-slate-400 text-center">Take a photo or upload a scan of your document (TRC, Visa, Work Permit, Medical, BHP, etc.)</p>

              {/* Camera button — mobile-first */}
              <button onClick={() => cameraRef.current?.click()} disabled={uploading}
                className="w-full py-4 rounded-xl bg-blue-500/10 border-2 border-blue-500/30 text-blue-400 font-bold text-sm flex items-center justify-center gap-3 hover:bg-blue-500/20 transition-colors disabled:opacity-40 active:scale-[0.98]">
                <Camera className="w-5 h-5" />
                Take Photo
              </button>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-700" />
                <span className="text-[10px] text-slate-600 uppercase">or</span>
                <div className="flex-1 h-px bg-slate-700" />
              </div>

              {/* File upload button */}
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full py-4 rounded-xl border-2 border-dashed border-slate-600 text-slate-400 font-bold text-sm flex items-center justify-center gap-3 hover:border-blue-500/40 hover:text-blue-400 transition-colors disabled:opacity-40 active:scale-[0.98]">
                <Upload className="w-5 h-5" />
                Upload PDF or Image
              </button>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />

              <p className="text-[10px] text-slate-600 text-center">PDF, JPG, PNG, or WebP &middot; max 20MB</p>
            </div>

            {/* Upload progress */}
            {uploading && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-center space-y-2">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin mx-auto" />
                <p className="text-xs text-blue-400 font-semibold">Uploading and analyzing...</p>
                <p className="text-[10px] text-slate-500">AI is reading your document</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* File selected indicator */}
            {file && !uploading && !result && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-300 font-mono truncate flex-1">{file.name}</span>
                <span className="text-[10px] text-slate-500">{(file.size / 1024).toFixed(0)} KB</span>
              </div>
            )}
          </div>
        )}

        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-600">
            <Shield className="w-3 h-3" />
            <span>Your data is protected under GDPR</span>
          </div>
          <p className="text-[10px] text-slate-700">EEJ Recruitment Platform &middot; org_context: EEJ</p>
        </div>
      </div>
    </div>
  );
}
