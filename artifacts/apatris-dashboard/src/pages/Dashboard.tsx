import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Shield, Calculator, MapPin, AlertTriangle, FileCheck, Settings,
  UserPlus, Upload, Sparkles, FileText, Download, Smartphone,
  Users, Briefcase, TrendingUp, Clock, Building2,
} from "lucide-react";

const Y = "#d4e84b";
const N = "#0b101e";
const C = "#101624";

interface Stat { label: string; value: string; sub: string; color: string }

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workers", { headers: { Authorization: `Bearer ${localStorage.getItem("apatris_jwt") ?? sessionStorage.getItem("eej_token") ?? ""}` } })
      .then(r => r.ok ? r.json() : { workers: [] })
      .then(d => setWorkers(d.workers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const compliant = workers.filter((w: any) => w.complianceStatus === "compliant").length;
  const warning = workers.filter((w: any) => w.complianceStatus === "warning" || w.complianceStatus === "critical").length;
  const nonCompliant = workers.filter((w: any) => w.complianceStatus === "non-compliant").length;

  const kpis: Stat[] = [
    { label: "Total Operators", value: String(workers.length), sub: "Active workforce", color: "#3b82f6" },
    { label: "Compliant", value: String(compliant), sub: `${workers.length ? Math.round(compliant / workers.length * 100) : 0}% of total`, color: "#22c55e" },
    { label: "Expiring Soon", value: String(warning), sub: "Needs attention", color: "#f59e0b" },
    { label: "Non-Compliant", value: String(nonCompliant), sub: "Immediate action", color: "#ef4444" },
  ];

  const modules = [
    { label: "Compliance", sub: "Track all documents", icon: Shield, color: "#ef4444", bg: "rgba(239,68,68,0.1)", path: "/compliance-alerts" },
    { label: "Payroll", sub: "ZUS & PIT ledger", icon: Calculator, color: "#22c55e", bg: "rgba(34,197,94,0.1)", path: "/payroll" },
    { label: "Deployment", sub: "GPS & site tracking", icon: MapPin, color: "#3b82f6", bg: "rgba(59,130,246,0.1)", path: "/gps-tracking" },
    { label: "Doc Alerts", sub: "Expiry notifications", icon: AlertTriangle, color: "#f59e0b", bg: "rgba(245,158,11,0.1)", path: "/doc-workflow" },
    { label: "Calculator", sub: "Net per hour ZUS", icon: Calculator, color: "#a855f7", bg: "rgba(168,85,247,0.1)", path: "/calculator" },
    { label: "Settings", sub: "Admin & config", icon: Settings, color: "#64748b", bg: "rgba(100,116,139,0.1)", path: "/admin-settings" },
  ];

  const actions = [
    { label: "Add Worker", icon: UserPlus, path: "/candidates" },
    { label: "Bulk Import", icon: Upload, path: "/bulk-upload" },
    { label: "AI Upload", icon: Sparkles, path: "/ai-copilot" },
    { label: "Reports", icon: FileText, path: "/analytics" },
    { label: "Export", icon: Download, path: "/pay-transparency" },
    { label: "PDF", icon: FileCheck, path: "/contracts" },
    { label: "Install App", icon: Smartphone, path: "#" },
  ];

  return (
    <div style={{ padding: 24, minHeight: "100%", overflowY: "auto", background: N, paddingBottom: 80 }}>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: C, borderRadius: 12, padding: "20px 18px", border: "1px solid rgba(212,232,75,0.06)" }}>
            <div style={{ fontSize: 11, color: "#7a8599", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: k.color, lineHeight: 1 }}>{loading ? "—" : k.value}</div>
            <div style={{ fontSize: 11, color: "#5a6577", marginTop: 6 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* 6 Module Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        {modules.map(m => (
          <div key={m.label} onClick={() => setLocation(m.path)} style={{
            background: C, borderRadius: 12, padding: 16, cursor: "pointer", border: "1px solid rgba(212,232,75,0.06)",
            transition: "all 0.15s",
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <m.icon style={{ width: 18, height: 18, color: m.color }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#dde4f0" }}>{m.label}</div>
            <div style={{ fontSize: 11, color: "#5a6577", marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {actions.map(a => (
          <button key={a.label} onClick={() => a.path !== "#" && setLocation(a.path)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
            background: Y, color: N, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.03em",
          }}>
            <a.icon style={{ width: 14, height: 14 }} /> {a.label}
          </button>
        ))}
      </div>

      {/* Operators Table */}
      <div style={{ background: C, borderRadius: 12, border: "1px solid rgba(212,232,75,0.06)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(212,232,75,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#dde4f0", margin: 0 }}>Operators</h2>
          <span style={{ fontSize: 11, color: "#5a6577" }}>{workers.length} total</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(212,232,75,0.06)" }}>
                {["Operator", "Job Role", "Badania Lek.", "Exp.", "Assigned Site", "Status", "Stage", "Score", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#5a6577", fontWeight: 600, fontSize: 10, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#5a6577" }}>Loading operators...</td></tr>
              ) : workers.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#5a6577" }}>No operators found</td></tr>
              ) : workers.slice(0, 20).map((w: any) => {
                const sc = w.complianceStatus;
                const scColor = sc === "compliant" ? "#22c55e" : sc === "warning" ? "#f59e0b" : sc === "critical" ? "#f59e0b" : "#ef4444";
                return (
                  <tr key={w.id} style={{ borderBottom: "1px solid rgba(212,232,75,0.04)" }}>
                    <td style={{ padding: "10px 14px", color: "#dde4f0", fontWeight: 600 }}>{w.name}</td>
                    <td style={{ padding: "10px 14px", color: "#7a8599" }}>{w.specialization ?? "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#7a8599" }}>{w.medicalExamExpiry?.slice(0, 10) ?? "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#7a8599" }}>{w.experience ?? "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#7a8599" }}>{w.assignedSite ?? "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${scColor}20`, color: scColor }}>{sc ?? "—"}</span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#7a8599" }}>{w.pipelineStage ?? "Active"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ color: scColor, fontWeight: 700 }}>{sc === "compliant" ? "100" : sc === "warning" ? "65" : "30"}</span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <button style={{ background: "rgba(212,232,75,0.1)", border: "1px solid rgba(212,232,75,0.2)", borderRadius: 6, padding: "4px 8px", color: Y, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
