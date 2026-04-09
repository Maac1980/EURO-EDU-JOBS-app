import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Search, FileText, Shield } from "lucide-react";
function getToken() { return localStorage.getItem("apatris_jwt") ?? sessionStorage.getItem("eej_token") ?? ""; }
export default function LinkedCases() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [cases, setCases] = useState<any>(null);
  const [search, setSearch] = useState("");
  useEffect(() => { fetch("/api/workers", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(d => setWorkers(d.workers ?? [])).catch(() => {}); }, []);
  useEffect(() => { if (!selectedId) return; fetch(`/api/legal/linked-cases/${selectedId}`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(setCases).catch(() => {}); }, [selectedId]);
  const filtered = workers.filter(w => !search || w.name?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Link2 className="w-6 h-6 text-primary" /> Linked Cases</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search worker..." className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground mb-3" />
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {filtered.slice(0, 25).map((w: any) => (
              <button key={w.id} onClick={() => setSelectedId(w.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedId === w.id ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:bg-muted/50"}`}>{w.name}</button>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2">
          {!cases ? <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">Select a worker to see linked cases</div> : (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-3">{cases.workerName} — {cases.totalCases} cases</h3>
                {Object.entries(cases.grouped ?? {}).map(([type, items]: [string, any]) => (
                  <div key={type} className="mb-4">
                    <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">{type}</div>
                    {items.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg mb-1">
                        <div><span className="text-sm text-white font-medium">{c.title}</span><span className="text-xs text-muted-foreground ml-2">{c.status}</span></div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText className="w-3 h-3" />{c.document_count} <Shield className="w-3 h-3 ml-2" />{c.evidence_count}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
