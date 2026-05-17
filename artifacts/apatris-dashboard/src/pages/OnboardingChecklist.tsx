import { useState, useEffect } from "react";
import { ClipboardCheck, CheckCircle, Circle, Search } from "lucide-react";
function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
export default function OnboardingChecklist() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [checklist, setChecklist] = useState<any>(null);
  const [search, setSearch] = useState("");
  useEffect(() => { fetch("/api/workers", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(d => setWorkers(d.workers ?? [])).catch(() => {}); }, []);
  useEffect(() => { if (!selectedId) return; fetch(`/api/onboarding/${selectedId}`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(setChecklist).catch(() => setChecklist(null)); }, [selectedId]);
  const createChecklist = async () => { if (!selectedId) return; await fetch(`/api/onboarding/create/${selectedId}`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } }); fetch(`/api/onboarding/${selectedId}`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(setChecklist); };
  const toggleStep = async (stepId: string, completed: boolean) => { await fetch(`/api/onboarding/step/${stepId}`, { method: "PATCH", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ completed }) }); fetch(`/api/onboarding/${selectedId}`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(setChecklist); };
  const filtered = workers.filter(w => !search || w.name?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><ClipboardCheck className="w-6 h-6 text-primary" /> Worker Onboarding</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="relative mb-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground" /></div>
          <div className="space-y-1 max-h-[500px] overflow-y-auto">{filtered.slice(0, 25).map((w: any) => (<button key={w.id} onClick={() => setSelectedId(w.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedId === w.id ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:bg-muted/50"}`}>{w.name}</button>))}</div>
        </div>
        <div className="lg:col-span-2">
          {!selectedId ? <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">Select a worker</div>
          : !checklist || !checklist.steps?.length ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <p className="text-muted-foreground mb-4">No checklist created yet</p>
              <button onClick={createChecklist} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold text-sm">Create Onboarding Checklist</button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold text-white">{checklist.completed}/{checklist.total} steps completed ({checklist.percentage}%)</h2>
                <div className="w-32 h-2 bg-muted rounded-full"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${checklist.percentage}%` }} /></div>
              </div>
              <div className="space-y-2">{(checklist.steps ?? []).map((s: any) => (
                <button key={s.id} onClick={() => toggleStep(s.id, !s.completed)} className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-all text-left">
                  {s.completed ? <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" /> : <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                  <span className={`text-sm ${s.completed ? "text-muted-foreground line-through" : "text-white"}`}>{s.step_name}</span>
                </button>
              ))}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
