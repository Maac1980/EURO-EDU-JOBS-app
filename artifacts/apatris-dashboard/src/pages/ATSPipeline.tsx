import { useState, useEffect } from "react";
import { Columns3 } from "lucide-react";
function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
const STAGES = ["New", "Screening", "Interview", "Offer", "Placed", "Active", "Released", "Blacklisted"];
const COLORS: Record<string, string> = { New: "#3b82f6", Screening: "#8b5cf6", Interview: "#0ea5e9", Offer: "#f59e0b", Placed: "#10b981", Active: "#22c55e", Released: "#6b7280", Blacklisted: "#ef4444" };
export default function ATSPipeline() {
  const [workers, setWorkers] = useState<any[]>([]);
  useEffect(() => { fetch("/api/workers", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(d => setWorkers(d.workers ?? [])).catch(() => {}); }, []);
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Columns3 className="w-6 h-6" /> ATS Pipeline</h1>
      <div className="flex gap-3 overflow-x-auto pb-4">{STAGES.map(stage => {
        const stageWorkers = workers.filter(w => (w.pipelineStage ?? "Active") === stage);
        return (
          <div key={stage} className="min-w-[200px] bg-card border border-border rounded-xl p-3 flex-shrink-0">
            <div className="flex items-center gap-2 mb-3"><div className="w-3 h-3 rounded-full" style={{ background: COLORS[stage] }} /><span className="text-sm font-bold text-white">{stage}</span><span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{stageWorkers.length}</span></div>
            <div className="space-y-2">{stageWorkers.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">—</p> : stageWorkers.slice(0, 10).map(w => (
              <div key={w.id} className="p-2 rounded-lg bg-muted/30 text-xs"><div className="text-white font-medium">{w.name}</div><div className="text-muted-foreground">{w.specialization ?? w.jobRole ?? "—"}</div></div>
            ))}</div>
          </div>
        );
      })}</div>
    </div>
  );
}
