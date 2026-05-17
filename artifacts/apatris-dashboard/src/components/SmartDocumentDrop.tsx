/**
 * SmartDocumentDrop — reusable drop zone for document processing.
 * Drop PDF/JPG/PNG → Claude Vision extracts fields → fuzzy matches worker.
 * Used by: RejectionIntelligence, Evidence Upload, TRC Service, etc.
 */
import { useState, useRef } from "react";
import { Upload, FileText, Loader2, CheckCircle, AlertTriangle, User, X } from "lucide-react";

function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }

interface SmartDocResult {
  documentType: string;
  extractedFields: Record<string, { value: string | null; confidence: number }>;
  matchedWorker: { id: string; name: string; matchScore: number } | null;
  rawText: string;
  overallConfidence: number;
  [key: string]: any;
}

interface Props {
  endpoint?: string;  // default: /api/smart-doc/process
  onResult: (result: SmartDocResult) => void;
  label?: string;
  acceptTypes?: string;
}

export default function SmartDocumentDrop({ endpoint, onResult, label, acceptTypes }: Props) {
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<SmartDocResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setStatus("processing");
    setError("");

    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || "image/jpeg";

      const res = await fetch(endpoint ?? "/api/smart-doc/process", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setStatus("error");
        setError(data.error ?? "Processing failed");
        return;
      }

      setResult(data);
      setStatus("done");
      onResult(data);
    } catch (err: any) {
      setStatus("error");
      setError(err.message ?? "Failed to process document");
    }
  };

  const reset = () => {
    setStatus("idle");
    setResult(null);
    setError("");
  };

  return (
    <div>
      {status === "idle" || status === "error" ? (
        <div
          className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all hover:border-primary/50"
          style={{ borderColor: status === "error" ? "#ef4444" : "rgba(255,255,255,0.1)" }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#d4e84b"; }}
          onDragLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
          onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
        >
          <input ref={fileRef} type="file" accept={acceptTypes ?? ".pdf,.jpg,.jpeg,.png,.webp"} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm font-bold text-white">{label ?? "Drop document here"}</p>
          <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG — AI reads and extracts data automatically</p>
          {error && <p className="text-xs text-red-400 mt-3"><AlertTriangle className="w-3 h-3 inline mr-1" />{error}</p>}
        </div>
      ) : status === "processing" ? (
        <div className="border border-border rounded-xl p-8 text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-3 text-primary animate-spin" />
          <p className="text-sm font-bold text-white">Reading document with AI...</p>
          <p className="text-xs text-muted-foreground mt-1">Extracting fields, matching worker</p>
        </div>
      ) : result ? (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <span className="text-sm font-bold text-white capitalize">{result.documentType?.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground ml-2">Confidence: {result.overallConfidence}%</span>
              </div>
            </div>
            <button onClick={reset} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>

          {/* Worker match */}
          {result.matchedWorker && (
            <div className="flex items-center gap-3 p-4 border-b border-border" style={{
              background: result.matchedWorker.matchScore >= 80 ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
            }}>
              <User className="w-5 h-5" style={{ color: result.matchedWorker.matchScore >= 80 ? "#22c55e" : "#f59e0b" }} />
              <div>
                <span className="text-sm font-bold text-white">{result.matchedWorker.name}</span>
                <span className="text-xs ml-2" style={{ color: result.matchedWorker.matchScore >= 80 ? "#22c55e" : "#f59e0b" }}>
                  {result.matchedWorker.matchScore}% match
                </span>
              </div>
              {result.matchedWorker.matchScore < 70 && (
                <span className="text-[10px] text-amber-400 ml-auto">⚠ Low confidence — verify</span>
              )}
            </div>
          )}

          {/* Extracted fields */}
          <div className="p-4">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(result.extractedFields ?? {}).filter(([_, v]: [string, any]) => v.value).map(([key, val]: [string, any]) => (
                <div key={key} className="flex justify-between text-sm p-2 rounded-lg bg-muted/20">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="text-white font-medium" style={{
                    color: val.confidence >= 80 ? "#e5e7eb" : val.confidence >= 50 ? "#f59e0b" : "#ef4444",
                  }}>
                    {val.value}
                    {val.confidence < 70 && <span className="text-[9px] text-amber-400 ml-1">({val.confidence}%)</span>}
                  </span>
                </div>
              ))}
            </div>
            {result.rawText && (
              <div className="mt-3 p-3 rounded-lg bg-muted/10 text-xs text-muted-foreground">{result.rawText}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
