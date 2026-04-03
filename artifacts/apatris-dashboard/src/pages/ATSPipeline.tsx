import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Columns3, Plus, ChevronRight } from "lucide-react";

const STAGES = ["New", "Screening", "Interview", "Offer", "Placed", "Active", "Released", "Blacklisted"];
const STAGE_COLORS: Record<string, string> = {
  New: "#3B82F6", Screening: "#8B5CF6", Interview: "#0EA5E9", Offer: "#F59E0B",
  Placed: "#10B981", Active: "#22C55E", Released: "#6B7280", Blacklisted: "#EF4444",
};

export default function ATSPipeline() {
  const { t } = useTranslation();
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Columns3 className="w-6 h-6" /> ATS Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">8-stage Kanban recruitment pipeline</p>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <div key={stage} className="min-w-[200px] bg-card border border-border rounded-xl p-3 flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full" style={{ background: STAGE_COLORS[stage] }} />
              <span className="text-sm font-bold text-white">{stage}</span>
              <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">0</span>
            </div>
            <div className="space-y-2 min-h-[100px]">
              <p className="text-xs text-muted-foreground text-center py-8">No candidates</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
