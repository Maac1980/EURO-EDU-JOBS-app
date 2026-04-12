/**
 * Smart Document Ingest — upload document, AI reads and classifies it.
 */
import React, { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { Upload, Loader2, FileText, CheckCircle2, AlertTriangle, Eye } from "lucide-react";

export default function SmartIngestPage() {
  const [workerId, setWorkerId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div><h1 className="text-xl font-bold text-white">Smart Document Ingest</h1>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">AI Document Analysis · OCR · Classification</p></div>

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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">{result.docType}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${(result.confidence ?? 0) >= 0.7 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{Math.round((result.confidence ?? 0) * 100)}%</span>
              {result.isRejection && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">REJECTION</span>}
              {result.mosRelevant && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">MOS 2026</span>}
            </div>
            {result.rationale && <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3"><p className="text-xs text-slate-300">{result.rationale}</p></div>}
            {result.extractedData && Object.keys(result.extractedData).length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Extracted Data</h3>
                {Object.entries(result.extractedData).filter(([,v]) => v != null).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs py-0.5"><span className="text-slate-500">{k}</span><span className="text-white font-mono">{String(typeof v === "object" ? (v as any)?.value ?? JSON.stringify(v) : v)}</span></div>
                ))}
              </div>
            )}
            {result.draft && <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
              <h3 className="text-xs font-bold text-purple-400 uppercase mb-2">Generated Draft</h3>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">{result.draft}</pre>
            </div>}
            {result.legalImpact && <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Legal Impact</h3>
              <div className="text-xs space-y-0.5">
                <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="text-white">{result.legalImpact.currentStatus}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Risk</span><span className={result.legalImpact.riskLevel === "CRITICAL" ? "text-red-400" : "text-white"}>{result.legalImpact.riskLevel}</span></div>
              </div>
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}
