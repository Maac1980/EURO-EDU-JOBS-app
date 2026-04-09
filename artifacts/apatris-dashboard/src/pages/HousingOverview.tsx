import { useState, useEffect } from "react";
import { Home, Users, MapPin } from "lucide-react";
function getToken() { return localStorage.getItem("apatris_jwt") ?? sessionStorage.getItem("eej_token") ?? ""; }
export default function HousingOverview() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/housing/overview", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Home className="w-6 h-6 text-primary" /> Housing Overview</h1>
      <div className="bg-card border border-border rounded-xl p-4 mb-6"><span className="text-muted-foreground">Total workers housed:</span> <span className="text-white font-bold ml-2">{data?.totalWorkers ?? 0}</span></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data?.sites ?? []).map((s: any) => (
          <div key={s.site} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><MapPin className="w-4 h-4 text-primary" /><span className="text-sm font-bold text-white">{s.site}</span><span className="text-xs text-muted-foreground ml-auto">{s.workerCount} workers</span></div>
            <div className="space-y-1">{s.workers.map((w: any) => (
              <div key={w.id} className="flex justify-between text-sm py-1 border-b border-border/30">
                <span className="text-muted-foreground">{w.name}</span><span className="text-xs text-muted-foreground">{w.nationality}</span>
              </div>
            ))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
