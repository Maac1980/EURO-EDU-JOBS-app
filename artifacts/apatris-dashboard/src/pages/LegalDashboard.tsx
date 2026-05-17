import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Shield, AlertTriangle, CheckCircle, Clock, Users, FileText, TrendingUp } from "lucide-react";

const TOKEN_KEY = "eej_token";
function getToken() { return sessionStorage.getItem(TOKEN_KEY) ?? ""; }
function headers() { return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }; }

export default function LegalDashboard() {
  const { t } = useTranslation();
  const [scanResults, setScanResults] = useState<any>(null);
  const [pipReport, setPipReport] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/legal/scan", { headers: headers() }).then(r => r.json()).catch(() => null),
      fetch("/api/legal/pip-report", { headers: headers() }).then(r => r.json()).catch(() => null),
      fetch("/api/legal/suggestions", { headers: headers() }).then(r => r.json()).catch(() => ({ suggestions: [] })),
    ]).then(([scan, pip, sug]) => {
      setScanResults(scan);
      setPipReport(pip);
      setSuggestions(sug?.suggestions ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading legal dashboard...</div>;

  const statusColors: Record<string, string> = { CRITICAL: "#ef4444", HIGH: "#f59e0b", MEDIUM: "#3b82f6", LOW: "#22c55e" };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Shield className="w-6 h-6 text-primary" /> Legal Operations Dashboard</h1>

      {/* PIP Score */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5 col-span-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">PIP Readiness</div>
          <div className="text-4xl font-black" style={{ color: (pipReport?.score ?? 0) >= 80 ? "#22c55e" : (pipReport?.score ?? 0) >= 50 ? "#f59e0b" : "#ef4444" }}>
            {pipReport?.score ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{pipReport?.readiness ?? "—"}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Total Workers</div>
          <div className="text-2xl font-bold text-white">{pipReport?.totalWorkers ?? 0}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Open Cases</div>
          <div className="text-2xl font-bold text-amber-400">{pipReport?.openCases ?? 0}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Verified Evidence</div>
          <div className="text-2xl font-bold text-green-400">{pipReport?.verifiedEvidence ?? 0}</div>
        </div>
      </div>

      {/* Compliance Scan Results */}
      {scanResults && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Compliance Scan — {scanResults.issuesFound} issues in {scanResults.totalWorkers} workers</h2>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {(scanResults.results ?? []).slice(0, 20).map((r: any) => (
              <div key={r.workerId} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div>
                  <span className="text-sm font-bold text-white">{r.workerName}</span>
                  <span className="text-xs text-muted-foreground ml-2">{r.site ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.issues.map((i: any, idx: number) => (
                    <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                      background: `${statusColors[i.severity === "expired" ? "CRITICAL" : i.severity === "critical" ? "HIGH" : "MEDIUM"]}20`,
                      color: statusColors[i.severity === "expired" ? "CRITICAL" : i.severity === "critical" ? "HIGH" : "MEDIUM"],
                    }}>{i.label}: {i.severity}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Suggested Actions</h2>
          <div className="space-y-2">
            {suggestions.slice(0, 10).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <span className="text-xs font-bold text-primary uppercase">{s.suggestionType?.replace(/_/g, " ")}</span>
                  <p className="text-sm text-muted-foreground mt-1">{s.reason}</p>
                </div>
                <span className="text-xs font-mono text-muted-foreground">P{s.priority}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
