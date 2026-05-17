import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FileText, AlertTriangle, CheckCircle, Clock, Shield, ChevronRight, XCircle, Package, Upload, Eye } from "lucide-react";

function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
function headers() { return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }; }

const STATUS_COLORS: Record<string, string> = {
  NEW: "#3b82f6", DOCUMENTS_PENDING: "#f59e0b", READY_TO_FILE: "#22c55e",
  FILED: "#8b5cf6", UNDER_REVIEW: "#6366f1", DEFECT_NOTICE: "#ef4444",
  DECISION_RECEIVED: "#f59e0b", APPROVED: "#22c55e", REJECTED: "#ef4444",
  open: "#f59e0b", critical: "#ef4444",
};

const ITEM_ICONS: Record<string, string> = {
  can_generate: "🟢", present: "✅", valid: "✅", missing: "❌", expired: "🔴", blocked: "⛔", manual: "📝",
};

export default function CaseActionCenter() {
  const { t } = useTranslation();
  const [cases, setCases] = useState<any>(null);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cases/dashboard", { headers: headers() })
      .then(r => r.json()).then(setCases).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadActionCenter = (caseId: string) => {
    fetch(`/api/cases/${caseId}/action-center`, { headers: headers() })
      .then(r => r.json()).then(setSelectedCase).catch(() => {});
  };

  const transition = async (caseId: string, newStatus: string) => {
    const res = await fetch(`/api/cases/${caseId}/transition`, {
      method: "PATCH", headers: headers(), body: JSON.stringify({ newStatus }),
    });
    const data = await res.json();
    if (data.success) {
      loadActionCenter(caseId);
      fetch("/api/cases/dashboard", { headers: headers() }).then(r => r.json()).then(setCases);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading cases...</div>;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6">
        <Package className="w-6 h-6 text-primary" /> Case Action Center
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Case list */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-bold text-white mb-3">{cases?.totalActive ?? 0} Active Cases</h2>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {(cases?.cases ?? []).map((c: any) => (
              <button key={c.id} onClick={() => loadActionCenter(c.id)}
                className={`w-full text-left p-3 rounded-lg transition-all ${selectedCase?.case?.id === c.id ? "bg-primary/10 border border-primary/30" : "bg-muted/20 hover:bg-muted/40"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-white">{c.workerName}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                    background: `${STATUS_COLORS[c.status] ?? "#6b7280"}20`,
                    color: STATUS_COLORS[c.status] ?? "#6b7280",
                  }}>{c.status}</span>
                </div>
                <div className="text-xs text-muted-foreground">{c.caseType} · {c.site ?? "—"}</div>
                {c.nextAction && <div className="text-[10px] text-primary mt-1 truncate">{c.nextAction}</div>}
              </button>
            ))}
            {(cases?.cases ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">No active cases</div>
            )}
          </div>
        </div>

        {/* Action Center */}
        <div className="lg:col-span-2">
          {!selectedCase ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a case to view its action center</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Case header */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-white">{selectedCase.case.workerName}</h2>
                    <div className="text-sm text-muted-foreground">{selectedCase.case.caseType} · {selectedCase.case.nationality} · {selectedCase.case.site ?? "—"}</div>
                  </div>
                  <span className="text-sm px-3 py-1.5 rounded-lg font-bold" style={{
                    background: `${STATUS_COLORS[selectedCase.case.status] ?? "#6b7280"}20`,
                    color: STATUS_COLORS[selectedCase.case.status] ?? "#6b7280",
                  }}>{selectedCase.case.status.replace(/_/g, " ")}</span>
                </div>

                {/* Next action */}
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mb-3">
                  <div className="text-xs text-primary font-bold uppercase mb-1">Next Action</div>
                  <div className="text-sm text-white">{selectedCase.lifecycle.nextAction}</div>
                </div>

                {/* Transitions */}
                {selectedCase.lifecycle.allowedTransitions.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {selectedCase.lifecycle.allowedTransitions.map((t: string) => (
                      <button key={t} onClick={() => transition(selectedCase.case.id, t)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 bg-muted hover:bg-muted/80 text-white">
                        <ChevronRight className="w-3 h-3" /> {t.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                )}

                {/* Appeal deadline */}
                {selectedCase.case.appealDeadline && (
                  <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-bold">
                    ⚠ Appeal deadline: {selectedCase.case.appealDeadline}
                  </div>
                )}
              </div>

              {/* Blockers */}
              {selectedCase.lifecycle.blockers.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    {selectedCase.lifecycle.hardBlockerCount} Hard Blocker{selectedCase.lifecycle.hardBlockerCount !== 1 ? "s" : ""}
                  </h3>
                  <div className="space-y-2">
                    {selectedCase.lifecycle.blockers.map((b: any) => (
                      <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg" style={{
                        background: b.severity === "hard" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                      }}>
                        {b.severity === "hard" ? <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                        <span className="text-sm text-muted-foreground">{b.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Package */}
              {selectedCase.suggestedPackage && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" /> {selectedCase.suggestedPackage.type}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{
                      background: selectedCase.suggestedPackage.status === "READY" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                      color: selectedCase.suggestedPackage.status === "READY" ? "#22c55e" : "#ef4444",
                    }}>{selectedCase.suggestedPackage.status}</span>
                  </div>
                  <div className="space-y-1.5">
                    {selectedCase.suggestedPackage.items.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span>{ITEM_ICONS[item.status] ?? "⬜"}</span>
                        <span className={item.status === "missing" || item.status === "expired" || item.status === "blocked" ? "text-muted-foreground line-through" : "text-white"}>{item.name}</span>
                      </div>
                    ))}
                  </div>
                  {selectedCase.suggestedPackage.blockedBy.length > 0 && (
                    <div className="mt-3 text-xs text-red-400">Blocked by: {selectedCase.suggestedPackage.blockedBy.join(", ")}</div>
                  )}
                </div>
              )}

              {/* Evidence + Documents */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1"><Upload className="w-3 h-3" /> Evidence ({selectedCase.evidence.count})</h3>
                  {selectedCase.evidence.count === 0 ? <p className="text-xs text-muted-foreground">No evidence uploaded</p> : (
                    <div className="space-y-1">{(selectedCase.evidence.items as any[]).slice(0, 5).map((e: any) => (
                      <div key={e.id} className="text-xs flex justify-between">
                        <span className="text-muted-foreground">{e.evidence_type}</span>
                        <span style={{ color: e.verified ? "#22c55e" : "#f59e0b" }}>{e.verified ? "✓" : "pending"}</span>
                      </div>
                    ))}</div>
                  )}
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1"><FileText className="w-3 h-3" /> Documents ({selectedCase.documents.count})</h3>
                  {selectedCase.documents.count === 0 ? <p className="text-xs text-muted-foreground">No documents generated</p> : (
                    <div className="space-y-1">{(selectedCase.documents.items as any[]).slice(0, 5).map((d: any) => (
                      <div key={d.id} className="text-xs flex justify-between">
                        <span className="text-muted-foreground">{d.doc_type}</span>
                        <span style={{ color: d.status === "approved" ? "#22c55e" : "#f59e0b" }}>{d.status}</span>
                      </div>
                    ))}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
