import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileText, Shield, Clock, CheckCircle, User } from "lucide-react";
import SmartDocumentDrop from "@/components/SmartDocumentDrop";

export default function RejectionIntelligence() {
  const { t } = useTranslation();
  const [result, setResult] = useState<any>(null);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-2">
        <AlertTriangle className="w-6 h-6 text-red-400" /> Rejection Intelligence
      </h1>
      <p className="text-sm text-muted-foreground mb-6">Drop a rejection letter — AI reads it, matches the worker, classifies the rejection, and suggests next steps</p>

      <div className="mb-6">
        <SmartDocumentDrop
          endpoint="/api/smart-doc/rejection"
          label="Drop rejection letter here (PDF or photo)"
          onResult={setResult}
        />
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1"><User className="w-3 h-3" /> Worker</div>
              {result.matchedWorker ? (
                <div>
                  <div className="text-lg font-bold text-white">{result.matchedWorker.name}</div>
                  <div className="text-xs mt-1" style={{ color: result.matchedWorker.matchScore >= 80 ? "#22c55e" : "#f59e0b" }}>
                    {result.matchedWorker.matchScore}% match{result.matchedWorker.matchScore < 70 && " — verify manually"}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No match — {result.extractedFields?.worker_name?.value ?? "name not found"}</div>
              )}
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1"><FileText className="w-3 h-3" /> Case</div>
              <div className="text-sm text-white">{result.voivodeship ?? "—"}</div>
              <div className="text-xs text-muted-foreground mt-1">Ref: {result.caseRef ?? "—"}</div>
              <div className="text-xs text-muted-foreground">Decision: {result.decisionDate ?? "—"}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Appeal Deadline</div>
              <div className="text-lg font-bold text-red-400">{result.appealDeadline ?? "14 days"}</div>
              {result.caseCreated && <div className="text-xs text-green-400 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Case created</div>}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-amber-400" /> Classification</h2>
            <div className="flex gap-2 flex-wrap mb-4">
              {(result.classification ?? []).map((c: any, i: number) => (
                <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{
                  background: c.confidence >= 80 ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                  color: c.confidence >= 80 ? "#ef4444" : "#f59e0b",
                }}>{c.category.replace(/_/g, " ")} ({c.confidence}%)</span>
              ))}
            </div>
            {result.extractedFields?.rejection_reasons?.value && (
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10 text-sm text-muted-foreground">
                <span className="text-xs text-red-400 font-bold uppercase block mb-1">Rejection reasons:</span>
                {result.extractedFields.rejection_reasons.value}
              </div>
            )}
          </div>

          {result.aiExplanation && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-xs text-amber-400 font-bold uppercase tracking-wider mb-3">AI Analysis — DRAFT</div>
              <div className="text-sm text-foreground whitespace-pre-wrap">{result.aiExplanation}</div>
            </div>
          )}

          <div className="text-xs text-muted-foreground text-right">Confidence: {result.overallConfidence ?? 0}%</div>
        </div>
      )}

      {!result && (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Drop a rejection letter above to start analysis</p>
        </div>
      )}
    </div>
  );
}
