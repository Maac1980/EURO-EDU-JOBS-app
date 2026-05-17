import { useState, useEffect } from "react";
import { Users, Search } from "lucide-react";
function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
export default function Candidates() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/workers", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(d => setWorkers(d.workers ?? [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  const filtered = workers.filter(w => !search || w.name?.toLowerCase().includes(search.toLowerCase()) || (w.specialization ?? "").toLowerCase().includes(search.toLowerCase()) || (w.nationality ?? "").toLowerCase().includes(search.toLowerCase()));
  const statusColor = (s: string) => s === "compliant" ? "#22c55e" : s === "warning" ? "#f59e0b" : s === "critical" || s === "non-compliant" ? "#ef4444" : "#6b7280";
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center justify-between mb-6"><div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Users className="w-6 h-6" /> Candidates</h1><p className="text-sm text-muted-foreground mt-1">{workers.length} workers in database</p></div></div>
      <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, specialization, nationality..." className="w-full pl-9 pr-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground" /></div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm"><thead><tr className="border-b border-border text-muted-foreground"><th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Nationality</th><th className="text-left p-3 font-medium">Specialization</th><th className="text-left p-3 font-medium">Site</th><th className="text-left p-3 font-medium">Status</th><th className="text-left p-3 font-medium">Stage</th><th className="text-right p-3 font-medium">Rate</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading...</td></tr> : filtered.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No results</td></tr> : filtered.map((w: any) => (
          <tr key={w.id} className="border-b border-border/50 hover:bg-muted/20"><td className="p-3 text-white font-medium">{w.name}</td><td className="p-3 text-muted-foreground">{w.nationality ?? "—"}</td><td className="p-3 text-muted-foreground">{w.specialization ?? w.jobRole ?? "—"}</td><td className="p-3 text-muted-foreground">{w.assignedSite ?? w.siteLocation ?? "—"}</td>
          <td className="p-3"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${statusColor(w.complianceStatus ?? "")}20`, color: statusColor(w.complianceStatus ?? "") }}>{w.complianceStatus ?? "—"}</span></td>
          <td className="p-3 text-muted-foreground">{w.pipelineStage ?? "—"}</td><td className="p-3 text-right font-mono text-primary">{w.hourlyNettoRate ?? w.hourlyRate ?? "—"}</td></tr>
        ))}</tbody></table>
      </div>
    </div>
  );
}
