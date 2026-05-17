import { useState, useEffect } from "react";
import { Calendar, Clock } from "lucide-react";
function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
export default function Interviews() {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/interviews", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(d => setInterviews(d.interviews ?? d ?? [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Calendar className="w-6 h-6" /> Interviews</h1>
      <div className="bg-card border border-border rounded-xl p-5">
        {loading ? <p className="text-muted-foreground text-center py-8">Loading...</p>
        : !Array.isArray(interviews) || interviews.length === 0 ? (
          <div className="text-center py-12"><Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" /><p className="text-sm text-muted-foreground">No interviews scheduled</p><p className="text-xs text-muted-foreground mt-1">Interviews will appear here when scheduled via the ATS pipeline</p></div>
        ) : (
          <div className="space-y-2">{interviews.map((iv: any, i: number) => (
            <div key={iv.id ?? i} className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
              <div><div className="text-sm text-white font-medium">{iv.worker_name ?? iv.workerName ?? "Candidate"}</div><div className="text-xs text-muted-foreground">{iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleDateString() : "—"} · {iv.location ?? "—"}</div></div>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: iv.status === "completed" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)", color: iv.status === "completed" ? "#22c55e" : "#f59e0b" }}>{iv.status ?? "scheduled"}</span>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
