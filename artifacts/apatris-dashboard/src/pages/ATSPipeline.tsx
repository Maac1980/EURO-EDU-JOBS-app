import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE, extractList } from "@/lib/api";
import { Columns3, ChevronRight, User, MapPin, Award, GripVertical } from "lucide-react";

const STAGES = ["New", "Screening", "Interview", "Offer", "Placed", "Active", "Released", "Blacklisted"] as const;
const STAGE_COLORS: Record<string, string> = {
  New: "border-blue-500/30 bg-blue-500/5", Screening: "border-violet-500/30 bg-violet-500/5",
  Interview: "border-cyan-500/30 bg-cyan-500/5", Offer: "border-amber-500/30 bg-amber-500/5",
  Placed: "border-emerald-500/30 bg-emerald-500/5", Active: "border-green-500/30 bg-green-500/5",
  Released: "border-slate-500/30 bg-slate-500/5", Blacklisted: "border-red-500/30 bg-red-500/5",
};
const STAGE_DOT: Record<string, string> = {
  New: "bg-blue-400", Screening: "bg-violet-400", Interview: "bg-cyan-400", Offer: "bg-amber-400",
  Placed: "bg-emerald-400", Active: "bg-green-400", Released: "bg-slate-400", Blacklisted: "bg-red-400",
};

interface Worker { id: string; full_name: string; specialization: string; assigned_site: string; status: string; nationality: string; }

function mapStage(status: string | undefined): string {
  if (!status) return "New";
  const s = status.toLowerCase();
  if (s === "active" || s === "compliant") return "Active";
  if (s === "warning") return "Screening";
  if (s === "critical" || s === "non-compliant") return "Released";
  return "New";
}

export default function ATSPipeline() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ats-workers"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/workers`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return extractList<Worker>(json, "workers");
    },
  });

  const workers = data ?? [];

  const byStage = useMemo(() => {
    const map: Record<string, Worker[]> = {};
    for (const s of STAGES) map[s] = [];
    for (const w of workers) {
      const stage = mapStage(w.status);
      if (map[stage]) map[stage].push(w);
      else map["New"].push(w);
    }
    return map;
  }, [workers]);

  const moveMutation = useMutation({
    mutationFn: async ({ workerId, newStatus }: { workerId: string; newStatus: string }) => {
      await fetch(`${BASE}/api/workers/${workerId}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ status: newStatus.toLowerCase() }),
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ats-workers"] }); toast({ description: "Worker moved" }); },
  });

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Columns3 className="w-6 h-6" /> ATS Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">{workers.length} candidates across 8 stages</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(stage => (
            <div key={stage} className={`min-w-[220px] border rounded-xl p-3 flex-shrink-0 ${STAGE_COLORS[stage]}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2.5 h-2.5 rounded-full ${STAGE_DOT[stage]}`} />
                <span className="text-xs font-bold text-white uppercase tracking-wider">{stage}</span>
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-bold">{byStage[stage].length}</span>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {byStage[stage].length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-6">Empty</p>
                ) : byStage[stage].slice(0, 20).map(w => (
                  <div key={w.id} className="bg-card border border-border rounded-lg p-2.5 hover:border-primary/30 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                        {(w.full_name ?? "?").charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{w.full_name ?? "Unknown"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{w.specialization || w.nationality || "—"}</p>
                      </div>
                    </div>
                    {w.assigned_site && (
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                        <MapPin className="w-3 h-3" />{w.assigned_site}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
