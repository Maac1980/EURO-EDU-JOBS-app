import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE, extractList } from "@/lib/api";
import { Calendar, Plus, Clock, X, User, Video, MapPin, CheckCircle2, AlertTriangle } from "lucide-react";

interface Interview {
  id: string;
  candidateName: string;
  date: string;
  time: string;
  type: "in-person" | "video" | "phone";
  status: "scheduled" | "completed" | "cancelled" | "no-show";
  notes: string;
  interviewer: string;
}

// Demo data until API exists
const DEMO: Interview[] = [
  { id: "1", candidateName: "Oleksandr Petrov", date: "2026-04-08", time: "10:00", type: "video", status: "scheduled", notes: "TIG welder, 5yr experience", interviewer: "Anna B." },
  { id: "2", candidateName: "Dmytro Kovalenko", date: "2026-04-08", time: "14:00", type: "in-person", notes: "MIG certified, needs housing", interviewer: "Anna B.", status: "scheduled" },
  { id: "3", candidateName: "Raj Patel", date: "2026-04-07", time: "09:00", type: "phone", status: "completed", notes: "Pipe fitter, India. Good English.", interviewer: "Manish S." },
];

const TYPE_ICON = { "in-person": MapPin, video: Video, phone: User };
const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-slate-700/50 text-slate-400 border-slate-600",
  "no-show": "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function Interviews() {
  const { toast } = useToast();
  const [interviews] = useState<Interview[]>(DEMO);
  const [showAdd, setShowAdd] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = interviews.filter(i => i.date >= today && i.status === "scheduled");
  const past = interviews.filter(i => i.date < today || i.status !== "scheduled");

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Calendar className="w-6 h-6" /> Interviews</h1>
          <p className="text-sm text-muted-foreground mt-1">{upcoming.length} upcoming, {past.length} past</p>
        </div>
        <button onClick={() => toast({ description: "Interview scheduling coming soon" })}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold">
          <Plus className="w-4 h-4" /> Schedule
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Today</p>
          <p className="text-xl font-bold text-white">{interviews.filter(i => i.date === today).length}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Scheduled</p>
          <p className="text-xl font-bold text-blue-400">{interviews.filter(i => i.status === "scheduled").length}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Completed</p>
          <p className="text-xl font-bold text-emerald-400">{interviews.filter(i => i.status === "completed").length}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">No-Show</p>
          <p className="text-xl font-bold text-red-400">{interviews.filter(i => i.status === "no-show").length}</p>
        </div>
      </div>

      {/* Upcoming */}
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Upcoming</h2>
      <div className="space-y-2 mb-6">
        {upcoming.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">No upcoming interviews</div>
        ) : upcoming.map(i => {
          const TypeIcon = TYPE_ICON[i.type];
          return (
            <div key={i.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{i.candidateName.charAt(0)}</div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">{i.candidateName}</p>
                <p className="text-xs text-muted-foreground">{i.notes}</p>
              </div>
              <div className="text-right text-xs">
                <div className="flex items-center gap-1 text-white font-mono"><Clock className="w-3 h-3" />{i.date} {i.time}</div>
                <div className="flex items-center gap-1 text-muted-foreground mt-1"><TypeIcon className="w-3 h-3" />{i.type} — {i.interviewer}</div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLE[i.status]}`}>{i.status}</span>
            </div>
          );
        })}
      </div>

      {/* Past */}
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Past</h2>
      <div className="space-y-2">
        {past.map(i => {
          const TypeIcon = TYPE_ICON[i.type];
          return (
            <div key={i.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 opacity-70">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">{i.candidateName.charAt(0)}</div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">{i.candidateName}</p>
                <p className="text-xs text-muted-foreground">{i.notes}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground font-mono">{i.date} {i.time}</div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLE[i.status]}`}>{i.status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
