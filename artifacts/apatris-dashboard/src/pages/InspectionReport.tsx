import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Shield, FileText, Users, Clock, AlertTriangle, CheckCircle } from "lucide-react";

const TOKEN_KEY = "eej_token";
function getToken() { return sessionStorage.getItem(TOKEN_KEY) ?? ""; }
function headers() { return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }; }

const ENDPOINTS: Record<string, string> = {
  CaseManagement: "/api/legal/cases",
  DocumentTemplates: "/api/legal/documents",
  ClientPortal: "/api/legal/notifications",
  LegalQueue: "/api/legal/queue",
  RejectionIntelligence: "/api/legal/cases?status=REJECTED",
  InspectionReport: "/api/legal/pip-report",
};

const TITLES: Record<string, string> = {
  CaseManagement: "Case Management",
  DocumentTemplates: "Document Templates",
  ClientPortal: "Client Portal",
  LegalQueue: "Legal Priority Queue",
  RejectionIntelligence: "Rejection Intelligence",
  InspectionReport: "PIP Inspection Report",
};

const ICONS: Record<string, any> = {
  CaseManagement: FileText,
  DocumentTemplates: FileText,
  ClientPortal: Users,
  LegalQueue: Clock,
  RejectionIntelligence: AlertTriangle,
  InspectionReport: Shield,
};

export default function InspectionReport() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const pageName = "InspectionReport";
  const Icon = ICONS[pageName] ?? Shield;

  useEffect(() => {
    fetch(ENDPOINTS[pageName] ?? "/api/healthz", { headers: headers() })
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const items = data?.cases ?? data?.documents ?? data?.queue ?? data?.notifications ?? (data?.score !== undefined ? [data] : []);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6">
        <Icon className="w-6 h-6 text-primary" /> {TITLES[pageName]}
      </h1>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading...</div>
      ) : !data ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No data available. Run a legal scan first.
        </div>
      ) : pageName === "InspectionReport" && data.score !== undefined ? (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="text-xs text-muted-foreground uppercase mb-2">PIP Readiness Score</div>
            <div className="text-5xl font-black" style={{ color: data.score >= 80 ? "#22c55e" : data.score >= 50 ? "#f59e0b" : "#ef4444" }}>{data.score}/100</div>
            <div className="text-sm text-muted-foreground mt-2">{data.readiness} — {data.totalWorkers} workers, {data.openCases} open cases</div>
          </div>
          {(data.issues ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">Issues Found</h2>
              {data.issues.map((i: any, idx: number) => (
                <div key={idx} className="flex justify-between py-2 border-b border-border/50 text-sm">
                  <span className="text-white">{i.worker}</span>
                  <span className="text-muted-foreground">{i.issue}</span>
                  <span className="text-xs font-bold" style={{ color: i.severity === "CRITICAL" ? "#ef4444" : "#f59e0b" }}>{i.severity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30">
              <th className="text-left p-3 text-muted-foreground font-medium">ID</th>
              <th className="text-left p-3 text-muted-foreground font-medium">Type / Title</th>
              <th className="text-left p-3 text-muted-foreground font-medium">Status</th>
              <th className="text-left p-3 text-muted-foreground font-medium">Created</th>
            </tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No records found</td></tr>
              ) : items.slice(0, 50).map((item: any, idx: number) => (
                <tr key={item.id ?? idx} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="p-3 font-mono text-xs text-muted-foreground">{(item.id ?? "").slice(0, 8)}</td>
                  <td className="p-3 text-white font-medium">{item.title ?? item.case_type ?? item.doc_type ?? item.message_type ?? item.worker_name ?? "—"}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{
                    background: (item.status === "approved" || item.status === "resolved") ? "rgba(34,197,94,0.15)" : item.status === "REJECTED" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                    color: (item.status === "approved" || item.status === "resolved") ? "#22c55e" : item.status === "REJECTED" ? "#ef4444" : "#f59e0b",
                  }}>{item.status ?? "—"}</span></td>
                  <td className="p-3 text-xs text-muted-foreground">{item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
