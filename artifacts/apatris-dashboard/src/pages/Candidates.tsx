import { Users, Search, Filter, Plus } from "lucide-react";
import { useState, useEffect } from "react";

export default function Candidates() {
  const [search, setSearch] = useState("");
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workers", { headers: { Authorization: `Bearer ${sessionStorage.getItem("eej_token") ?? ""}` } })
      .then(r => r.ok ? r.json() : { workers: [] })
      .then(d => setWorkers(d.workers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = workers.filter((w: any) =>
    !search || (w.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Users className="w-6 h-6" /> Candidates</h1>
          <p className="text-sm text-muted-foreground mt-1">{workers.length} workers in database</p>
        </div>
      </div>
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search candidates..."
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-muted-foreground">
            <th className="text-left p-3 font-medium">Name</th>
            <th className="text-left p-3 font-medium">Status</th>
            <th className="text-left p-3 font-medium">Site</th>
            <th className="text-left p-3 font-medium">Specialization</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No candidates found</td></tr>
            ) : filtered.map((w: any) => (
              <tr key={w.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 text-white font-medium">{w.name}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${w.complianceStatus === "compliant" ? "bg-green-500/20 text-green-400" : w.complianceStatus === "warning" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>{w.complianceStatus ?? "—"}</span></td>
                <td className="p-3 text-muted-foreground">{w.assignedSite ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{w.specialization ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
