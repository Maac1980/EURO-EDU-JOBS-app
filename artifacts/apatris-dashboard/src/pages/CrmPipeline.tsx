import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Shield, Users, MapPin, Sparkles, ClipboardCheck, Briefcase } from "lucide-react";

function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
function headers() { return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }; }

const PAGE_CONFIG: Record<string, { title: string; endpoint: string; icon: any }> = {
  CrmPipeline: { title: "CRM Deal Pipeline", endpoint: "/api/crm/deals", icon: Briefcase },
  OnboardingChecklist: { title: "Worker Onboarding", endpoint: "/api/healthz", icon: ClipboardCheck },
  WorkerUploadPage: { title: "Worker Document Upload", endpoint: "/api/healthz", icon: Users },
  GeofenceMap: { title: "GPS Geofence Sites", endpoint: "/api/gps/geofence", icon: MapPin },
  AiCopilotChat: { title: "AI Compliance Copilot", endpoint: "/api/healthz", icon: Sparkles },
};

export default function CrmPipeline() {
  const { t } = useTranslation();
  // Item 2.16 — widen literal to `string` so shared-template comparisons
  // typecheck (see twin in AiCopilotChat.tsx / GeofenceMap.tsx).
  const pageName: string = "CrmPipeline";
  const config = PAGE_CONFIG[pageName];
  const Icon = config?.icon ?? Shield;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    fetch(config?.endpoint ?? "/api/healthz", { headers: headers() })
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const askCopilot = async () => {
    if (!question.trim()) return;
    setAsking(true);
    try {
      const res = await fetch("/api/ai/copilot", { method: "POST", headers: headers(), body: JSON.stringify({ question }) });
      const d = await res.json();
      setAnswer(d.answer ?? d.error ?? "No response");
    } catch { setAnswer("Error connecting to AI"); }
    setAsking(false);
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6">
        <Icon className="w-6 h-6 text-primary" /> {config?.title ?? "CrmPipeline"}
      </h1>

      {pageName === "AiCopilotChat" ? (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex gap-3">
              <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about Polish labor law, immigration, ZUS..."
                className="flex-1 bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={e => e.key === "Enter" && askCopilot()} />
              <button onClick={askCopilot} disabled={asking}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-bold text-sm">
                {asking ? "Thinking..." : "Ask AI"}
              </button>
            </div>
          </div>
          {answer && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-xs text-amber-400 font-bold uppercase mb-3">AI Guidance — Verify with legal team</div>
              <div className="text-sm text-foreground whitespace-pre-wrap">{answer}</div>
            </div>
          )}
        </div>
      ) : pageName === "CrmPipeline" ? (
        <div className="grid grid-cols-5 gap-3">
          {["lead", "proposal", "negotiation", "won", "active"].map(stage => (
            <div key={stage} className="bg-card border border-border rounded-xl p-3">
              <div className="text-xs font-bold text-primary uppercase tracking-wider mb-3">{stage}</div>
              {(data?.deals ?? []).filter((d: any) => d.stage === stage).map((d: any) => (
                <div key={d.id} className="bg-muted/30 rounded-lg p-3 mb-2 text-sm">
                  <div className="font-bold text-white">{d.title}</div>
                  <div className="text-muted-foreground text-xs">{d.client_name ?? "—"}</div>
                  <div className="text-primary font-mono text-xs mt-1">{d.value ? d.value.toLocaleString() + " PLN" : "—"}</div>
                </div>
              ))}
              {(data?.deals ?? []).filter((d: any) => d.stage === stage).length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">No deals</div>
              )}
            </div>
          ))}
        </div>
      ) : pageName === "GeofenceMap" ? (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="space-y-3">
            {(data?.sites ?? []).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <div className="text-sm font-bold text-white">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.latitude?.toFixed(4)}, {s.longitude?.toFixed(4)} — {s.radius_meters}m radius</div>
                </div>
                <MapPin className="w-5 h-5 text-primary" />
              </div>
            ))}
            {(data?.sites ?? []).length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No geofence sites configured</div>}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          {loading ? "Loading..." : "Feature ready — data will populate as workers are added"}
        </div>
      )}
    </div>
  );
}
