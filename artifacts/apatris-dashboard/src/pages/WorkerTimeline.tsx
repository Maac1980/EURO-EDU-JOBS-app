import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Shield, FileText, MapPin, DollarSign, Bell, AlertTriangle, CheckCircle, Search } from "lucide-react";

function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }

const ICONS: Record<string, any> = { hire: CheckCircle, document: FileText, legal: Shield, payroll: DollarSign, site_change: MapPin, alert: Bell, case: AlertTriangle, notification: Bell };
const COLORS: Record<string, string> = { info: "#3b82f6", warning: "#f59e0b", critical: "#ef4444", success: "#22c55e" };

export default function WorkerTimeline() {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [timeline, setTimeline] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/workers", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setWorkers(d.workers ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/workers/${selectedId}/timeline`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(setTimeline).catch(() => setTimeline(null)).finally(() => setLoading(false));
  }, [selectedId]);

  const filtered = workers.filter(w => !search || w.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Clock className="w-6 h-6 text-primary" /> Worker Timeline</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Worker selector */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search worker..."
              className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
          </div>
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {filtered.slice(0, 30).map((w: any) => (
              <button key={w.id} onClick={() => setSelectedId(w.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${selectedId === w.id ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:bg-muted/50"}`}>
                {w.name}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="lg:col-span-2">
          {!selectedId ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">Select a worker to view their timeline</div>
          ) : loading ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">Loading timeline...</div>
          ) : timeline ? (
            <div className="space-y-4">
              {/* Expiry alerts */}
              {timeline.expiryAlerts?.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">Document Expiry</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {timeline.expiryAlerts.map((a: any) => (
                      <div key={a.field} className="flex justify-between text-sm p-2 rounded-lg bg-muted/30">
                        <span className="text-muted-foreground">{a.label}</span>
                        <span className="font-mono font-bold" style={{ color: (a.daysLeft ?? 999) < 0 ? "#ef4444" : (a.daysLeft ?? 999) < 30 ? "#f59e0b" : "#22c55e" }}>
                          {a.daysLeft !== null ? (a.daysLeft < 0 ? `${Math.abs(a.daysLeft)}d overdue` : `${a.daysLeft}d`) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Events */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">{timeline.totalEvents} Events</h3>
                <div className="space-y-3 relative before:absolute before:left-4 before:top-0 before:bottom-0 before:w-px before:bg-border">
                  {(timeline.timeline ?? []).slice(0, 30).map((e: any) => {
                    const Icon = ICONS[e.type] ?? Clock;
                    const color = COLORS[e.severity ?? "info"];
                    return (
                      <div key={e.id} className="flex gap-4 pl-2 relative">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
                          <Icon style={{ width: 12, height: 12, color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white">{e.title}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{new Date(e.date).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">No timeline data</div>
          )}
        </div>
      </div>
    </div>
  );
}
