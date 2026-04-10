import SmartDocumentDrop from "@/components/SmartDocumentDrop";
import { useState } from "react";
import { Upload } from "lucide-react";
export default function WorkerUploadPage() {
  const [result, setResult] = useState<any>(null);
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Upload className="w-6 h-6" /> Document Upload</h1>
      <div className="max-w-2xl">
        <SmartDocumentDrop endpoint="/api/intake/full-pipeline" label="Drop document — AI reads, classifies, and matches to worker" onResult={setResult} />
        {result && (
          <div className="mt-4 bg-card border border-border rounded-xl p-5">
            <div className="text-xs text-primary font-bold uppercase mb-2">Result: {result.recommendation ?? "—"}</div>
            {result.matching?.matchedWorker && <div className="text-sm text-white">Matched: {result.matching.matchedWorker.name} ({result.matching.matchedWorker.matchScore}%)</div>}
            {result.extraction?.documentType && <div className="text-sm text-muted-foreground mt-1">Type: {result.extraction.documentType}</div>}
            {result.suggestions?.length > 0 && <div className="text-sm text-muted-foreground mt-1">Suggested: {result.suggestions.join(", ")}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
