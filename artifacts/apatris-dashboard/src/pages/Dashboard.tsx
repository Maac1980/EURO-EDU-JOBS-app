import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useGetWorkers, useGetWorkerStats, getGetWorkersQueryKey } from "@workspace/api-client-react";
import {
  Users, AlertTriangle, ShieldAlert, Clock,
  LogOut, RefreshCcw, Pencil, MapPin, UserCheck, UserMinus, Building2,
  Settings, Database, CheckCircle, XCircle, AlertOctagon, Mail, Bell,
  Shield, Calculator, Download, KeyRound, Lock, Wifi, WifiOff, Loader2,
  X, Copy, Check as CheckIcon, Smartphone, Zap, FileText
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";

import { StatCard } from "@/components/StatCard";
import { RecruitmentLinkShare } from "@/components/RecruitmentLinkShare";
import { ComplianceTrendChart } from "@/components/ComplianceTrendChart";
import { AuditTrailPanel } from "@/components/AuditTrailPanel";
import { PayrollRunPage } from "@/components/PayrollRunPage";
import { TeamManagementCard } from "@/components/TeamManagementCard";
import { ClientManagementCard } from "@/components/ClientManagementCard";
import { TwoFactorCard } from "@/components/TwoFactorCard";
import { ExpiringThisWeekPanel } from "@/components/ExpiringThisWeekPanel";
import { ExpiryCalendar } from "@/components/ExpiryCalendar";
import { NotificationHistoryCard } from "@/components/NotificationHistoryCard";
import { KnowledgeCenter as KnowledgeCenterComponent } from "@/components/KnowledgeCenter";

export default function Dashboard() {
  const { user, logout, isAdmin, isCoordinator, isManager } = useAuth();
  const { t } = useTranslation();
  
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [appInstalled, setAppInstalled] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => { setAppInstalled(true); setInstallPrompt(null); });
    if (window.matchMedia("(display-mode: standalone)").matches) setAppInstalled(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") { setAppInstalled(true); setInstallPrompt(null); }
    } else {
      setShowInstallModal(true);
    }
  };

  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"compliance" | "payroll" | "deployment" | "alerts" | "calculator" | "settings">("compliance");

  const [schemaSyncing, setSchemaSyncing] = useState(false);
  const [schemaSyncResult, setSchemaSyncResult] = useState<{
    created: string[]; existing: string[]; errors: string[]; message: string;
  } | null>(null);
  const [schemaSyncError, setSchemaSyncError] = useState<string | null>(null);

  // Admin profile state
  const [adminProfile, setAdminProfile] = useState<{ fullName: string; email: string; phone: string; role: string } | null>(null);
  const [adminEditing, setAdminEditing] = useState(false);
  const [adminEditEmail, setAdminEditEmail] = useState("");
  const [adminEditPhone, setAdminEditPhone] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminSaveMsg, setAdminSaveMsg] = useState<string | null>(null);

  const [changePwOpen, setChangePwOpen] = useState(false);
  const [changePwCurrent, setChangePwCurrent] = useState("");
  const [changePwNew, setChangePwNew] = useState("");
  const [changePwConfirm, setChangePwConfirm] = useState("");
  const [changePwSaving, setChangePwSaving] = useState(false);
  const [changePwMsg, setChangePwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [systemStatus, setSystemStatus] = useState<{ smtpConfigured: boolean; smtpHost: string; smtpPort: string; smtpUser: string | null; jwtIsDefault: boolean } | null>(null);

  // Legacy QR back-compat: pre-commit-23, worker QR codes encoded /?worker=ID
  // because the grid + WorkerProfilePanel lived on Dashboard. Commit 23 moved
  // the grid to /workers — redirect old deep-links so existing printed QR
  // codes still resolve to the worker profile.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const workerId = params.get("worker");
    if (workerId) {
      setLocation(`/workers?worker=${encodeURIComponent(workerId)}`);
    }
  }, [setLocation]);

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/admin/profile`)
      .then((r) => r.json())
      .then((data) => {
        setAdminProfile(data);
        setAdminEditEmail(data.email ?? "");
        setAdminEditPhone(data.phone ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const tkn = sessionStorage.getItem("eej_token");
    fetch(`${base}/api/admin/system-status`, { headers: { Authorization: `Bearer ${tkn}` } })
      .then((r) => r.json())
      .then((data) => setSystemStatus(data))
      .catch(() => {});
  }, [isAdmin]);

  const handleChangePassword = async () => {
    if (!changePwNew || !changePwCurrent) { setChangePwMsg({ ok: false, text: "All fields are required." }); return; }
    if (changePwNew !== changePwConfirm) { setChangePwMsg({ ok: false, text: "New passwords do not match." }); return; }
    if (changePwNew.length < 8) { setChangePwMsg({ ok: false, text: "New password must be at least 8 characters." }); return; }
    setChangePwSaving(true); setChangePwMsg(null);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const tkn = sessionStorage.getItem("eej_token");
      const res = await fetch(`${base}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tkn}` },
        body: JSON.stringify({ currentPassword: changePwCurrent, newPassword: changePwNew }),
      });
      const data = await res.json();
      if (!res.ok) { setChangePwMsg({ ok: false, text: data.error ?? "Failed to change password." }); return; }
      setChangePwMsg({ ok: true, text: "Password changed successfully." });
      setChangePwCurrent(""); setChangePwNew(""); setChangePwConfirm("");
    } finally { setChangePwSaving(false); }
  };

  // Compliance documents state
  const [complianceDocs, setComplianceDocs] = useState<any[]>([]);
  const [complianceSummary, setComplianceSummary] = useState<{ total: number; expired: number; red: number; yellow: number; green: number } | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [alertTriggering, setAlertTriggering] = useState(false);
  const [alertResult, setAlertResult] = useState<any | null>(null);

  const fetchCompliance = async () => {
    setComplianceLoading(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/compliance/documents`);
      const data = await res.json();
      setComplianceDocs(data.documents ?? []);
      setComplianceSummary(data.summary ?? null);
    } catch {}
    setComplianceLoading(false);
  };

  const triggerTestAlert = async () => {
    setAlertTriggering(true);
    setAlertResult(null);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/compliance/trigger-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testMode: true }),
      });
      const data = await res.json();
      setAlertResult(data);
    } catch (e) {
      setAlertResult({ error: (e as Error).message });
    }
    setAlertTriggering(false);
  };

  useEffect(() => {
    if (activeTab === "alerts") fetchCompliance();
  }, [activeTab]);

  const saveAdminProfile = async () => {
    setAdminSaving(true);
    setAdminSaveMsg(null);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEditEmail, phone: adminEditPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setAdminProfile(data);
      setAdminEditing(false);
      setAdminSaveMsg(t("settings.savedSuccess"));
    } catch (e) {
      setAdminSaveMsg((e as Error).message);
    } finally {
      setAdminSaving(false);
    }
  };

  const syncSchema = async () => {
    setSchemaSyncing(true);
    setSchemaSyncResult(null);
    setSchemaSyncError(null);
    try {
      const res = await fetch("/api/workers/admin/ensure-schema", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Schema sync failed");
      setSchemaSyncResult(json);
    } catch (e) {
      setSchemaSyncError((e as Error).message);
    } finally {
      setSchemaSyncing(false);
    }
  };

  // useGetWorkers is shared with the alerts/deployment tabs (ExpiringThisWeekPanel,
  // ExpiryCalendar, deployment site breakdown). The /workers grid moved to
  // WorkersPage.tsx in commit 23 — TanStack Query dedupes the request across pages.
  const { data: workersData } = useGetWorkers({}, {
    // Item 2.16 — TanStack Query options type requires queryKey alongside
    // refetchInterval; use the generated getGetWorkersQueryKey helper
    // (same one used by invalidateQueries in WorkersPage:227 for cache
    // identity).
    query: { queryKey: getGetWorkersQueryKey({}), refetchInterval: 15_000 },
  });

  const { data: stats } = useGetWorkerStats();

  return (
    <div className="eej-app-shell bg-slate-900 text-foreground">
      {/* Ambient glow — decorative, pointer-events none */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/8 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[30%] bg-destructive/3 blur-[160px] rounded-full" />
      </div>


      {/* ═══════════════════════════════════════════
          MAIN COLUMN  —  header + scrollable area
      ═══════════════════════════════════════════ */}
      <div className="eej-main">

      {/* ── Scrollable content area (header is in AppShell) ── */}
      <div className="app-content-scroll">

      {/* ═══════════ MODULE NAV CARDS ═══════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, margin: "28px 40px 0" }}>
        {(([
          { tab: "compliance", icon: ShieldAlert, label: t("tabs.compliance"), hide: false,                        color: "#ff6b6b", glow: "rgba(239,68,68,0.3)",  grad: "linear-gradient(135deg,#c0392b,#7b241c)" },
          { tab: "payroll",    icon: Calculator,  label: t("tabs.payroll"),    hide: !isAdmin && !isCoordinator,   color: "#4ade80", glow: "rgba(34,197,94,0.3)",  grad: "linear-gradient(135deg,#1a5e38,#0e3d23)" },
          { tab: "deployment", icon: MapPin,       label: t("tabs.deployment"), hide: false,                        color: "#93c5fd", glow: "rgba(59,130,246,0.3)", grad: "linear-gradient(135deg,#1a3a6e,#0f2550)" },
          { tab: "alerts",     icon: AlertOctagon, label: t("tabs.alerts"),    hide: false,                        color: "#fb923c", glow: "rgba(245,158,11,0.3)", grad: "linear-gradient(135deg,#4a2500,#2d1700)" },
          { tab: "calculator", icon: Zap,          label: "Calculator",         hide: !isAdmin && !isCoordinator,   color: "#c084fc", glow: "rgba(168,85,247,0.3)", grad: "linear-gradient(135deg,#2d1060,#1a0940)" },
        ] as { tab: "compliance"|"payroll"|"deployment"|"alerts"|"calculator"|"settings"; icon: React.ElementType; label: string; hide: boolean; color: string; glow: string; grad: string }[]).filter((c) => !c.hide).map(({ tab, icon: Icon, label, color, glow, grad }) => {
          const isActive = activeTab === tab;
          return (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            style={{
              padding: "22px 16px",
              background: isActive ? grad : grad,
              border: `2px solid ${isActive ? color : "rgba(255,255,255,0.08)"}`,
              borderRadius: 14,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: isActive ? `0 0 36px ${glow}, 0 8px 24px rgba(0,0,0,0.4)` : "0 4px 20px rgba(0,0,0,0.35)",
              transform: isActive ? "translateY(-3px)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = color + "22";
                el.style.borderColor = color;
                el.style.transform = "translateY(-3px)";
                el.style.boxShadow = `0 0 28px ${glow}, 0 8px 24px rgba(0,0,0,0.4)`;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = "#1e293b";
                el.style.borderColor = "rgba(255,255,255,0.08)";
                el.style.transform = "none";
                el.style.boxShadow = "0 4px 20px rgba(0,0,0,0.35)";
              }
            }}
          >
            <Icon size={46} color={isActive ? "#ffffff" : color} strokeWidth={1.8} />
            <span style={{
              color: isActive ? "#ffffff" : "rgba(255,255,255,0.9)",
              fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.13em", fontFamily: "Montserrat, sans-serif",
            }}>{label}</span>
          </button>
        );}))}
      </div>

      {/* Action buttons row — page-level utilities only. Worker-CRUD buttons
          (AddWorker, BulkCsv, BulkUpload, Report, Export, PdfDownload) moved
          to /workers in commit 23 alongside the grid. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "20px 40px" }}>
        <button onClick={() => setLocation("/workers")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 6, background: "#3B82F6", color: "#ffffff", border: "none", fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", boxShadow: "0 2px 12px rgba(59,130,246,0.35)" }}>
          <Users size={14} /> Workers →
        </button>
        {/* Tier 1 closeout #21: visible Recruitment Link tile on home — was
            previously only the small corner button in AppShell. Opens the
            shared Share dialog (Copy / WhatsApp / SMS / Email). */}
        <RecruitmentLinkShare variant="tile" />
        {!appInstalled && (
          <button onClick={handleInstallApp} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 6, background: "#1e2028", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", cursor: "pointer" }}>
            <Smartphone size={14} /> Install App
          </button>
        )}
        {!isAdmin && (
          <button onClick={() => { setChangePwOpen(true); setChangePwMsg(null); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 6, background: "#1e2028", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", cursor: "pointer" }}>
            <KeyRound size={14} /> Change Password
          </button>
        )}
      </div>

      {/* Calculator gets its own full-screen layout — skip main wrapper */}
      {activeTab === "calculator" && (
        <div className="flex-1">
          <KnowledgeCenterComponent />
        </div>
      )}

      <main className={`px-10 pb-6 z-10 max-w-[1600px] mx-auto w-full space-y-4 ${activeTab === "calculator" ? "hidden" : ""}`}>

        {/* ── Tab Bar — hidden via CSS; bottom bar handles mobile ── */}
        <div className="eej-tab-bar overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-800/60 border border-white/8 w-fit min-w-max">
          {(["compliance", "payroll", "deployment", "alerts", "calculator"] as const)
            .filter((tab) => {
              if (tab === "payroll") return isAdmin || isCoordinator;
              if (tab === "calculator") return isAdmin || isCoordinator;
              return true;
            })
            .map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all"
              style={
                activeTab === tab
                  ? { background: "#d4e84b", color: "#0b101e", boxShadow: "0 0 14px rgba(212,232,75,0.25)" }
                  : { color: "rgba(255,255,255,0.45)" }
              }
            >
              {tab === "compliance" && <ShieldAlert className="w-3.5 h-3.5" />}
              {tab === "payroll" && <Calculator className="w-3.5 h-3.5" />}
              {tab === "deployment" && <MapPin className="w-3.5 h-3.5" />}
              {tab === "alerts" && <AlertOctagon className="w-3.5 h-3.5" />}
              {tab === "calculator" && <Zap className="w-3.5 h-3.5" />}
              {tab === "compliance" ? t("tabs.compliance") : tab === "payroll" ? t("tabs.payroll") : tab === "deployment" ? t("tabs.deployment") : tab === "alerts" ? t("tabs.alerts") : "Calculator"}
            </button>
          ))}
        </div>
        </div>

        {/* Site-restriction badge for managers */}
        {isManager && user?.site && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest w-fit" style={{ background: "rgba(233,255,112,0.12)", border: "1px solid rgba(233,255,112,0.3)", color: "#E9FF70" }}>
            <MapPin className="w-3.5 h-3.5" />
            {t("roles.siteView")}: {user.site}
          </div>
        )}

        {/* Stats Grid — Compliance view */}
        {activeTab === "compliance" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title={t("stats.totalWorkforce")} value={stats?.total || "0"} icon={Users} />
              <StatCard title={t("stats.critical")} value={stats?.critical || "0"} icon={ShieldAlert} variant="critical" />
              <StatCard title={t("stats.upcomingRenewals")} value={stats?.warning || "0"} icon={Clock} variant="warning" />
              <StatCard title={t("stats.nonCompliant")} value={stats?.nonCompliant || "0"} icon={AlertTriangle} variant="critical" />
            </div>
            <ExpiringThisWeekPanel
              workers={workersData?.workers ?? []}
              onSelectWorker={(id) => setLocation(`/workers?worker=${encodeURIComponent(id)}`)}
            />
            <ComplianceTrendChart />
          </div>
        )}

        {/* Deployment summary cards */}
        {activeTab === "deployment" && (() => {
          const all = workersData?.workers ?? [];
          const deployed = all.filter((w) => (w as any).siteLocation && (w as any).siteLocation !== "Available");
          const bench = all.filter((w) => !(w as any).siteLocation || (w as any).siteLocation === "Available");
          const sites = Array.from(new Set(deployed.map((w) => (w as any).siteLocation as string))).filter(Boolean);
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Deployed */}
                <div className="glass-panel rounded-xl p-5 border" style={{ borderColor: "rgba(233,255,112,0.25)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t("deployment.totalDeployed")}</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#E9FF70" }}>
                      <UserCheck className="w-4 h-4" style={{ color: "#333333" }} />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-white">{deployed.length}</p>
                  <p className="text-xs font-mono text-gray-500 mt-1">{t("deployment.activeSites")}</p>
                </div>

                {/* Bench / Available */}
                <div className="glass-panel rounded-xl p-5 border border-white/8">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t("deployment.bench")}</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-700">
                      <UserMinus className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-white">{bench.length}</p>
                  <p className="text-xs font-mono text-gray-500 mt-1">{t("deployment.noSite")}</p>
                </div>

                {/* Total Candidates */}
                <div className="glass-panel rounded-xl p-5 border border-white/8">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t("deployment.totalCandidates")}</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-700">
                      <Users className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-white">{all.length}</p>
                  <p className="text-xs font-mono text-gray-500 mt-1">{t("deployment.allStatuses")}</p>
                </div>

                {/* Active Sites */}
                <div className="glass-panel rounded-xl p-5 border border-white/8">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t("deployment.activeSiteCount")}</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-700">
                      <Building2 className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-white">{sites.length}</p>
                  <p className="text-xs font-mono text-gray-500 mt-1">{t("deployment.distinctLocations")}</p>
                </div>
              </div>

              {/* Per-site breakdown — clicking a chip deep-links to /workers?site=X.
                  Pre-commit-23 the chip toggled an in-page siteFilter that scoped
                  the workers grid rendered below. After the grid moved to
                  WorkersPage, the chip navigates instead. */}
              {sites.length > 0 && (
                <div className="glass-panel rounded-xl p-5 border" style={{ borderColor: "rgba(233,255,112,0.12)" }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: "#E9FF70" }}>{t("deployment.siteBreakdown")}</p>
                  <div className="flex flex-wrap gap-3">
                    {sites.map((site) => {
                      const count = deployed.filter((w) => (w as any).siteLocation === site).length;
                      return (
                        <button
                          key={site}
                          onClick={() => setLocation(`/workers?site=${encodeURIComponent(site)}`)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:brightness-110"
                          style={{ background: "rgba(233,255,112,0.08)", border: "1px solid rgba(233,255,112,0.22)", color: "#E9FF70" }}
                          title={`Open workers filtered by ${site}`}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {site}
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black" style={{ background: "rgba(233,255,112,0.2)", color: "#E9FF70" }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}


        {/* ── Compliance Alerts Tab ── */}
        {activeTab === "alerts" && (
          <div className="space-y-5">
            {/* Summary strip */}
            {complianceSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Expired", value: complianceSummary.expired, bg: "#1e1e1e", border: "#ef4444", text: "#ef4444" },
                  { label: "Critical (< 30d)", value: complianceSummary.red, bg: "#1e1010", border: "#dc2626", text: "#f87171" },
                  { label: "Warning (< 60d)", value: complianceSummary.yellow, bg: "#1e1800", border: "#d97706", text: "#fbbf24" },
                  { label: "Compliant (60d+)", value: complianceSummary.green, bg: "#0d1e0f", border: "#16a34a", text: "#4ade80" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl p-4 border" style={{ background: s.bg, borderColor: s.border }}>
                    <p className="text-2xl font-black" style={{ color: s.text }}>{s.value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: s.text, opacity: 0.7 }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Expiry Calendar */}
            <ExpiryCalendar
              workers={workersData?.workers ?? []}
              onSelectWorker={(id) => setLocation(`/workers?worker=${encodeURIComponent(id)}`)}
            />

            {/* Buttons row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">{t("alerts.docExpiryGrid")}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={triggerTestAlert}
                  disabled={alertTriggering}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 border"
                  style={{ borderColor: "#E9FF70", color: "#E9FF70", background: "rgba(233,255,112,0.08)" }}
                >
                  <Mail className={`w-3 h-3 ${alertTriggering ? "animate-pulse" : ""}`} />
                  {alertTriggering ? t("alerts.sending") : t("alerts.sendTestAlert")}
                </button>
                <button
                  onClick={fetchCompliance}
                  disabled={complianceLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  style={{ background: "#E9FF70", color: "#333333" }}
                >
                  <RefreshCcw className={`w-3 h-3 ${complianceLoading ? "animate-spin" : ""}`} />
                  {complianceLoading ? t("alerts.scanning") : t("alerts.refreshScan")}
                </button>
                <button
                  onClick={async () => {
                    try {
                      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
                      const tkn = sessionStorage.getItem("eej_token");
                      const res = await fetch(`${base}/api/compliance/zus-export`, {
                        headers: tkn ? { Authorization: `Bearer ${tkn}` } : {},
                      });
                      if (!res.ok) throw new Error("Export failed");
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `EEJ_ZUS_Export_${new Date().toISOString().slice(0, 10)}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch { alert("ZUS Export failed."); }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:opacity-90"
                  style={{ background: "rgba(233,255,112,0.15)", color: "#E9FF70", border: "1px solid rgba(233,255,112,0.3)" }}
                >
                  <Download className="w-3 h-3" />
                  ZUS Export CSV
                </button>
                <button
                  onClick={async () => {
                    try {
                      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
                      const res = await fetch(`${base}/api/compliance/trigger-worker-reminders`, { method: "POST" });
                      const data = await res.json();
                      alert(t("alerts.remindSent", { sent: data.sent ?? 0, skipped: data.skipped ?? 0 }) + (data.errors?.length ? `\n${data.errors.join("; ")}` : ""));
                    } catch { alert(t("alerts.remindError")); }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.05)", color: "#aaa", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <Bell className="w-3 h-3" />
                  {t("alerts.remindWorkers")}
                </button>
              </div>
            </div>

            {/* Alert result panel */}
            {alertResult && (
              <div
                className="rounded-2xl p-5 border space-y-3"
                style={{
                  background: alertResult.error && !alertResult.docsFound
                    ? "rgba(30,10,10,0.8)"
                    : alertResult.emailSent
                    ? "rgba(10,25,12,0.85)"
                    : "rgba(24,20,10,0.85)",
                  borderColor: alertResult.emailSent ? "#16a34a" : alertResult.error && !alertResult.docsFound ? "#dc2626" : "#d97706",
                }}
              >
                <div className="flex items-center gap-2">
                  {alertResult.emailSent ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : alertResult.error && !alertResult.docsFound ? (
                    <AlertOctagon className="w-4 h-4 text-red-400" />
                  ) : (
                    <AlertOctagon className="w-4 h-4 text-yellow-400" />
                  )}
                  <span className="text-sm font-black text-white">
                    {alertResult.emailSent
                      ? `✓ Test alert email sent to ${alertResult.emailTo}`
                      : alertResult.error && !alertResult.docsFound
                      ? "Alert not sent"
                      : `Alert not sent — ${alertResult.docsFound ?? 0} documents found`}
                  </span>
                </div>

                {alertResult.scanned !== undefined && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Workers Scanned", val: alertResult.scanned, color: "#E9FF70" },
                      { label: "Documents Found", val: alertResult.docsFound ?? 0, color: "#E9FF70" },
                      { label: "Email Sent", val: alertResult.emailSent ? "Yes" : "No", color: alertResult.emailSent ? "#4ade80" : "#f87171" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center">
                        <p className="text-lg font-black" style={{ color: s.color }}>{s.val}</p>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {alertResult.error && (
                  <div className="rounded-xl bg-black/30 px-4 py-3">
                    <p className="text-xs font-bold text-red-400 mb-1">Reason</p>
                    <p className="text-xs text-white/60 font-mono">{alertResult.error}</p>
                    {alertResult.error.includes("SMTP") && (
                      <p className="text-xs text-yellow-400 mt-2 font-semibold">
                        → Add <span className="font-mono">SMTP_HOST</span>, <span className="font-mono">SMTP_USER</span>, <span className="font-mono">SMTP_PASS</span> to Secrets to enable email delivery.
                      </p>
                    )}
                  </div>
                )}

                {alertResult.docsFound > 0 && (
                  <div className="text-xs text-white/50 flex gap-4 pt-1">
                    <span className="text-red-400 font-bold">🔴 {alertResult.redCount} {t("alerts.critical")}</span>
                    <span className="text-yellow-400 font-bold">⚠ {alertResult.yellowCount} {t("alerts.warning")}</span>
                    <span className="text-green-400 font-bold">✓ {alertResult.greenCount} {t("alerts.compliantCount")}</span>
                    <span className="text-white/30">{t("alerts.allIncluded")}</span>
                  </div>
                )}
              </div>
            )}

            {/* Document grid */}
            {complianceLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : complianceDocs.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-slate-900/60 p-12 text-center">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400" />
                <p className="text-white font-bold">{t("alerts.allCompliant")}</p>
                <p className="text-white/40 text-xs mt-1">{t("alerts.noExpiry")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {complianceDocs.map((doc) => {
                  const isExpired = doc.zone === "expired";
                  const isRed = doc.zone === "red";
                  const isYellow = doc.zone === "yellow";
                  const bg = isExpired ? "rgba(30,10,10,0.9)" : isRed ? "rgba(30,10,10,0.7)" : isYellow ? "rgba(30,24,0,0.7)" : "rgba(10,20,12,0.7)";
                  const borderColor = isExpired ? "#7f1d1d" : isRed ? "#dc2626" : isYellow ? "#d97706" : "#16a34a";
                  const badgeBg = isExpired ? "#7f1d1d" : isRed ? "#dc2626" : isYellow ? "#d97706" : "#16a34a";
                  const badgeText = isExpired ? "EXPIRED" : isRed ? `🔴 ${doc.daysRemaining}d LEFT` : isYellow ? `⚠ ${doc.daysRemaining}d LEFT` : `✓ ${doc.daysRemaining}d`;
                  return (
                    <div
                      key={doc.id}
                      className="rounded-2xl p-4 border space-y-2"
                      style={{ background: bg, borderColor, borderWidth: isRed || isExpired ? 2 : 1 }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-black text-white leading-tight">{doc.workerName}</p>
                        <span
                          className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
                          style={{ background: badgeBg, color: "#fff" }}
                        >
                          {badgeText}
                        </span>
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: borderColor }}>{doc.documentType}</p>
                      <p className="text-[10px] font-mono text-white/40">{t("alerts.expiry")}: {doc.expiryDate}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-6 pt-2">
              {[
                { color: "#16a34a", label: t("alerts.legend60") },
                { color: "#d97706", label: t("alerts.legend30") },
                { color: "#dc2626", label: t("alerts.legendRed") },
                { color: "#7f1d1d", label: t("alerts.legendExp") },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                  <span className="text-[10px] text-white/40">{l.label}</span>
                </div>
              ))}
            </div>

            {/* Notification History Log */}
            <NotificationHistoryCard />
          </div>
        )}

        {/* ── Settings Tab ── */}
        {activeTab === "settings" && (
          <div className="space-y-6">

            {/* Administrator Profile Card */}
            <div className="rounded-2xl border p-6 space-y-4" style={{ borderColor: "rgba(233,255,112,0.25)", background: "rgba(233,255,112,0.03)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg" style={{ background: "#E9FF70", color: "#333333" }}>
                      {adminProfile?.fullName?.charAt(0) ?? "A"}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#333", border: "2px solid #E9FF70" }}>
                      <Shield className="w-2.5 h-2.5" style={{ color: "#E9FF70" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black uppercase tracking-widest text-white">{t("settings.adminProfile")}</h2>
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "#E9FF70", color: "#333333" }}>ADMIN</span>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{t("settings.adminProfileDesc")}</p>
                  </div>
                </div>
                {!adminEditing && (
                  <button
                    onClick={() => { setAdminEditing(true); setAdminSaveMsg(null); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:opacity-90"
                    style={{ background: "#E9FF70", color: "#333333" }}
                  >
                    <Pencil className="w-3 h-3" />
                    EDIT
                  </button>
                )}
              </div>

              {adminProfile ? (
                <div className="rounded-xl bg-slate-800/60 border border-white/8 p-4 space-y-3">
                  {/* Full Name — read only */}
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 w-24">{t("settings.fullName")}</span>
                    <span className="text-sm font-mono text-white">{adminProfile.fullName}</span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest" style={{ background: "rgba(233,255,112,0.12)", color: "#E9FF70" }}>{adminProfile.role}</span>
                  </div>

                  {/* Email */}
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 w-24 pt-2">{t("settings.email")}</span>
                    {adminEditing ? (
                      <input
                        type="email"
                        value={adminEditEmail}
                        onChange={(e) => setAdminEditEmail(e.target.value)}
                        className="flex-1 rounded-lg px-3 py-1.5 text-sm font-mono outline-none transition-all"
                        style={{ background: "#0f172a", border: "1.5px solid #E9FF70", color: "#fff" }}
                      />
                    ) : (
                      <span className="text-sm font-mono text-white">{adminProfile.email}</span>
                    )}
                  </div>

                  {/* Phone */}
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 w-24 pt-2">{t("settings.phone")}</span>
                    {adminEditing ? (
                      <input
                        type="tel"
                        value={adminEditPhone}
                        onChange={(e) => setAdminEditPhone(e.target.value)}
                        placeholder="+353 ..."
                        className="flex-1 rounded-lg px-3 py-1.5 text-sm font-mono outline-none transition-all"
                        style={{ background: "#0f172a", border: "1.5px solid #E9FF70", color: "#fff" }}
                      />
                    ) : (
                      <span className="text-sm font-mono text-white/60">{adminProfile.phone || "—"}</span>
                    )}
                  </div>

                  {/* Save / Cancel */}
                  {adminEditing && (
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={saveAdminProfile}
                        disabled={adminSaving}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-60"
                        style={{ background: "#E9FF70", color: "#333333" }}
                      >
                        {adminSaving ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        {adminSaving ? t("settings.saving") : t("settings.save")}
                      </button>
                      <button
                        onClick={() => { setAdminEditing(false); setAdminEditEmail(adminProfile.email); setAdminEditPhone(adminProfile.phone); }}
                        className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 hover:text-white transition-all border border-white/10"
                      >
                        {t("settings.cancel")}
                      </button>
                    </div>
                  )}

                  {adminSaveMsg && (
                    <p className="text-xs font-mono" style={{ color: adminSaveMsg.includes("success") ? "#4ade80" : "#f87171" }}>
                      {adminSaveMsg}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-slate-800/60 border border-white/8 p-4 text-xs text-white/40 font-mono">Loading profile…</div>
              )}
            </div>

            {/* Airtable Schema Sync Card */}
            <div className="rounded-2xl border border-white/8 bg-slate-900/60 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5" style={{ color: "#E9FF70" }} />
                <div>
                  <h2 className="text-base font-black uppercase tracking-widest text-white">{t("settings.schemaSync")}</h2>
                  <p className="text-xs text-white/40 mt-0.5">{t("settings.schemaSyncDesc")}</p>
                </div>
              </div>

              <div className="rounded-xl bg-slate-800/60 border border-white/8 p-4 space-y-1.5 text-xs font-mono">
                <p className="text-white/60 uppercase tracking-widest text-[10px] font-bold mb-2">{t("settings.fieldsToSync")}</p>
                {[
                  { name: "Job Role", type: "Single line text" },
                  { name: "Experience", type: "Single line text" },
                  { name: "Qualification", type: "Single line text" },
                  { name: "Assigned Site", type: "Single line text" },
                  { name: "Email", type: "Email" },
                  { name: "Phone", type: "Phone number" },
                ].map((f) => (
                  <div key={f.name} className="flex items-center gap-2">
                    <span className="w-32 text-white/80 font-bold">{f.name}</span>
                    <span className="text-white/30">{f.type}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={syncSchema}
                disabled={schemaSyncing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-60"
                style={{ background: "#E9FF70", color: "#333333" }}
              >
                {schemaSyncing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                {schemaSyncing ? t("settings.syncing") : t("settings.syncBtn")}
              </button>

              {schemaSyncResult && (
                <div className="rounded-xl bg-slate-800/60 border border-white/8 p-4 space-y-2 text-xs">
                  <p className="text-white/60 font-mono">{schemaSyncResult.message}</p>
                  {schemaSyncResult.created.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-white/40 uppercase tracking-widest text-[10px] font-bold">Created</p>
                      {schemaSyncResult.created.map((f) => (
                        <div key={f} className="flex items-center gap-2 text-white/80">
                          <CheckCircle className="w-3 h-3 text-green-400" />{f}
                        </div>
                      ))}
                    </div>
                  )}
                  {schemaSyncResult.existing.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-white/40 uppercase tracking-widest text-[10px] font-bold">Already Exist</p>
                      {schemaSyncResult.existing.map((f) => (
                        <div key={f} className="flex items-center gap-2 text-white/60">
                          <CheckCircle className="w-3 h-3 text-white/30" />{f}
                        </div>
                      ))}
                    </div>
                  )}
                  {schemaSyncResult.errors.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-white/40 uppercase tracking-widest text-[10px] font-bold">Errors</p>
                      {schemaSyncResult.errors.map((e, i) => (
                        <div key={i} className="flex items-start gap-2 text-red-400">
                          <XCircle className="w-3 h-3 mt-0.5 shrink-0" />{e}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {schemaSyncError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
                  <div className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{schemaSyncError}</span>
                  </div>
                  {schemaSyncError.includes("AIRTABLE_API_KEY") && (
                    <p className="mt-2 text-red-400/70">
                      Add <span className="font-mono bg-red-500/20 px-1 rounded">AIRTABLE_API_KEY</span> in your Replit Secrets to enable schema management.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Email Alert System Card */}
            <div className="rounded-2xl border border-white/8 bg-slate-900/60 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5" style={{ color: "#E9FF70" }} />
                <div>
                  <h2 className="text-base font-black uppercase tracking-widest text-white">{t("settings.autoAlerts")}</h2>
                  <p className="text-xs text-white/40 mt-0.5">{t("settings.autoAlertsDesc")}</p>
                </div>
              </div>
              <div className="rounded-xl bg-slate-800/60 border border-white/8 p-4 text-xs space-y-3">
                <p className="text-white/60 font-mono text-[10px] uppercase tracking-widest font-bold">{t("settings.requiredSecrets")}</p>
                {[
                  { name: "AIRTABLE_API_KEY", desc: "Enables live data checks" },
                  { name: "ALERT_EMAIL_TO", desc: "Recipient email for alerts" },
                  { name: "SMTP_HOST", desc: "e.g. smtp.gmail.com" },
                  { name: "SMTP_PORT", desc: "e.g. 587 (TLS) or 465 (SSL)" },
                  { name: "SMTP_USER", desc: "SMTP account username" },
                  { name: "SMTP_PASS", desc: "SMTP account password / app password" },
                  { name: "SMTP_FROM", desc: "Sender address (optional — defaults to SMTP_USER)" },
                ].map((s) => (
                  <div key={s.name} className="flex items-start gap-2">
                    <code className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0" style={{ background: "rgba(233,255,112,0.1)", color: "#E9FF70" }}>{s.name}</code>
                    <span className="text-white/40">{s.desc}</span>
                  </div>
                ))}
                <p className="text-white/30 text-[10px] font-mono pt-1 border-t border-white/8">
                  Once configured, the system checks daily at 08:00 and sends an email listing every candidate with TRC, BHP, or Work Permit expiring within 14 days.
                </p>
              </div>
            </div>

            {/* Credentials Info Card */}
            <div className="rounded-2xl border border-white/8 bg-slate-900/60 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5" style={{ color: "#E9FF70" }} />
                <div>
                  <h2 className="text-base font-black uppercase tracking-widest text-white">{t("settings.credentials")}</h2>
                  <p className="text-xs text-white/40 mt-0.5">Set <code className="text-[10px] px-1 rounded" style={{ background: "rgba(233,255,112,0.1)", color: "#E9FF70" }}>VITE_ADMIN_EMAIL</code> and <code className="text-[10px] px-1 rounded" style={{ background: "rgba(233,255,112,0.1)", color: "#E9FF70" }}>VITE_ADMIN_PASSWORD</code> in Replit Secrets to change.</p>
                </div>
              </div>
              <div className="rounded-xl bg-slate-800/60 border border-white/8 p-4 font-mono text-xs space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-white/40 w-20">{t("settings.email")}</span>
                  <span className="text-white/80">{(import.meta.env.VITE_ADMIN_EMAIL as string | undefined) ?? "admin@euro-edu-jobs.eu"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white/40 w-20">{t("settings.credPassword")}</span>
                  <span className="text-white/50 italic">{t("settings.credPasswordNote")}</span>
                </div>
              </div>
            </div>

            {/* JWT Secret Warning */}
            {systemStatus?.jwtIsDefault && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)" }}>
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-yellow-400">Security Warning — Default JWT Secret in Use</p>
                  <p className="text-[11px] font-mono text-yellow-300/70 mt-1">
                    The server is using a hardcoded default signing secret. Anyone who knows it could forge authentication tokens.
                    Add a <span className="text-yellow-300 font-bold">JWT_SECRET</span> secret in your deployment settings with a long random string to fix this.
                  </p>
                </div>
              </div>
            )}

            {/* SMTP Configuration Card */}
            <div className="rounded-2xl border p-6 space-y-4" style={{ borderColor: systemStatus ? (systemStatus.smtpConfigured ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.25)") : "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: systemStatus?.smtpConfigured ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)" }}>
                  {systemStatus?.smtpConfigured ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Email / SMTP Configuration</h3>
                  <p className="text-[10px] font-mono text-gray-500">Required for compliance alerts and coordinator notifications</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ background: systemStatus?.smtpConfigured ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)", color: systemStatus?.smtpConfigured ? "#4ade80" : "#f87171", border: `1px solid ${systemStatus?.smtpConfigured ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.25)"}` }}>
                  {systemStatus ? (systemStatus.smtpConfigured ? "Configured" : "Not Configured") : "Loading…"}
                </span>
              </div>

              <div className="rounded-xl bg-slate-800/50 border border-white/8 divide-y divide-white/5">
                {[
                  { label: "SMTP_HOST", val: systemStatus?.smtpHost ?? "—", note: "e.g. smtp.gmail.com" },
                  { label: "SMTP_PORT", val: systemStatus?.smtpPort ?? "587", note: "Usually 587 (TLS) or 465 (SSL)" },
                  { label: "SMTP_USER", val: systemStatus?.smtpUser ?? "Not set", note: "Sending email address", missing: !systemStatus?.smtpUser },
                  { label: "SMTP_PASS", val: systemStatus?.smtpConfigured ? "••••••••" : "Not set", note: "App password or SMTP password", missing: !systemStatus?.smtpConfigured },
                  { label: "SMTP_FROM", val: systemStatus?.smtpUser ?? "Defaults to SMTP_USER", note: "Display name in sent emails" },
                ].map(({ label, val, note, missing }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-28 text-[10px] font-black uppercase tracking-widest font-mono" style={{ color: missing ? "#f87171" : "#E9FF70" }}>{label}</span>
                    <span className="flex-1 text-xs font-mono" style={{ color: missing ? "#f87171" : "rgba(255,255,255,0.7)" }}>{val}</span>
                    <span className="text-[10px] font-mono text-white/25 hidden sm:block">{note}</span>
                    {missing !== undefined && (
                      missing
                        ? <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        : <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              {!systemStatus?.smtpConfigured && (
                <p className="text-[11px] font-mono text-white/40 leading-relaxed">
                  Add these as <span className="text-white/70 font-bold">Secrets</span> in your deployment settings. Without SMTP, alert emails are queued but not delivered. Gmail users should generate an App Password from Google Account → Security → App Passwords.
                </p>
              )}
            </div>

            {/* Two-Factor Authentication */}
            <TwoFactorCard />

            {/* Client / Employer Database */}
            <ClientManagementCard />

            {/* Team Access / User Management */}
            <TeamManagementCard />

            {/* Audit Trail */}
            <AuditTrailPanel />
          </div>
        )}

        {/* Calculator renders outside <main> — see above */}

        {/* ── Payroll Tab ── */}
        {activeTab === "payroll" && (
          <div className="space-y-4">
            <PayrollRunPage />
          </div>
        )}
      </main>
      </div>{/* /app-content-scroll */}

      {/* ═══════════════════════════════════════════
          BOTTOM APP BAR — mobile (≤768px) only
      ═══════════════════════════════════════════ */}
      <nav className="eej-bottom-bar">
        {(["compliance", "payroll", "deployment", "alerts", "calculator"] as const)
          .filter((tab) => {
            if (tab === "payroll" || tab === "calculator") return isAdmin || isCoordinator;
            return true;
          })
          .map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`eej-bottom-nav-btn${activeTab === tab ? " active" : ""}`}>
              {tab === "compliance" && <ShieldAlert className="w-5 h-5" />}
              {tab === "payroll"    && <Calculator  className="w-5 h-5" />}
              {tab === "deployment" && <MapPin       className="w-5 h-5" />}
              {tab === "alerts"     && <AlertOctagon className="w-5 h-5" />}
              {tab === "calculator" && <Zap          className="w-5 h-5" />}
              <span>
                {tab === "compliance" ? "Workers"
                  : tab === "payroll"    ? "Payroll"
                  : tab === "deployment" ? "Sites"
                  : tab === "alerts"     ? "Alerts"
                  : "ZUS Calc"}
              </span>
            </button>
          ))}
      </nav>

      </div>{/* /eej-main */}

      {/* ── Install / Download App Modal ── */}
      {showInstallModal && (() => {
        const appUrl = `${window.location.origin}/eej-mobile/`;
        const copyUrl = () => {
          navigator.clipboard.writeText(appUrl).then(() => {
            setUrlCopied(true);
            setTimeout(() => setUrlCopied(false), 2500);
          });
        };
        return (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setShowInstallModal(false)}>
            <div className="rounded-2xl w-full max-w-md overflow-y-auto max-h-[90vh]" style={{ background: "#1a1a1a", border: "1px solid rgba(233,255,112,0.3)" }} onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4" style={{ color: "#E9FF70" }} />
                  <span className="text-sm font-black uppercase tracking-widest" style={{ color: "#E9FF70" }}>Download EEJ App</span>
                </div>
                <button onClick={() => setShowInstallModal(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-6 space-y-5">

                {/* QR Code */}
                <div className="flex flex-col items-center gap-3">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Scan with your phone camera</p>
                  <div className="rounded-2xl p-4" style={{ background: "#ffffff" }}>
                    <QRCodeSVG value={appUrl} size={180} bgColor="#ffffff" fgColor="#1a1a1a" level="M" />
                  </div>
                  <p className="text-[10px] text-gray-500 text-center">Works on iPhone, Android, iPad — just point your camera at the code</p>
                </div>

                {/* URL + Copy */}
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Or open this URL directly</p>
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(233,255,112,0.2)" }}>
                    <span className="flex-1 text-xs font-mono truncate" style={{ color: "#E9FF70" }}>{appUrl}</span>
                    <button onClick={copyUrl} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0"
                      style={{ background: urlCopied ? "rgba(74,222,128,0.15)" : "rgba(233,255,112,0.12)", color: urlCopied ? "#4ade80" : "#E9FF70", border: `1px solid ${urlCopied ? "rgba(74,222,128,0.3)" : "rgba(233,255,112,0.25)"}` }}>
                      {urlCopied ? <><CheckIcon className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                </div>

                {/* Platform instructions */}
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">How to install on each device</p>

                  <div className="rounded-xl p-3.5 space-y-1.5" style={{ background: "rgba(233,255,112,0.05)", border: "1px solid rgba(233,255,112,0.12)" }}>
                    <p className="text-xs font-bold" style={{ color: "#E9FF70" }}>📱 iPhone / iPad (Safari)</p>
                    <ol className="text-gray-300 text-xs space-y-0.5 list-decimal list-inside">
                      <li>Scan QR above or open the URL in <strong>Safari</strong></li>
                      <li>Tap the <strong>Share</strong> button (box + arrow, bottom bar)</li>
                      <li>Tap <strong>"Add to Home Screen"</strong> → <strong>Add</strong></li>
                    </ol>
                  </div>

                  <div className="rounded-xl p-3.5 space-y-1.5" style={{ background: "rgba(233,255,112,0.05)", border: "1px solid rgba(233,255,112,0.12)" }}>
                    <p className="text-xs font-bold" style={{ color: "#E9FF70" }}>🤖 Android (Chrome)</p>
                    <ol className="text-gray-300 text-xs space-y-0.5 list-decimal list-inside">
                      <li>Scan QR above or open the URL in <strong>Chrome</strong></li>
                      <li>Tap <strong>⋮ menu</strong> (top right) → <strong>"Add to Home screen"</strong></li>
                      <li>Tap <strong>Install</strong></li>
                    </ol>
                  </div>

                  <div className="rounded-xl p-3.5 space-y-1.5" style={{ background: "rgba(233,255,112,0.05)", border: "1px solid rgba(233,255,112,0.12)" }}>
                    <p className="text-xs font-bold" style={{ color: "#E9FF70" }}>💻 MacBook / Windows / iPad (Chrome or Edge)</p>
                    <ol className="text-gray-300 text-xs space-y-0.5 list-decimal list-inside">
                      <li>Open the URL in <strong>Chrome</strong> or <strong>Edge</strong></li>
                      <li>Click the <strong>install icon</strong> in the address bar (right side)</li>
                      <li>Click <strong>Install</strong> — opens as a standalone app</li>
                    </ol>
                  </div>
                </div>

                <button onClick={() => setShowInstallModal(false)} className="w-full py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide transition-all hover:opacity-90" style={{ background: "#E9FF70", color: "#333333" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Worker-scoped modals (WorkerProfilePanel, WorkerCockpit, CandidateEditPanel,
          NotifyDialog/RenewDialog, ComplianceReportModal, BulkUpload, BulkCsv, AddWorker)
          and CommandPalette moved to WorkersPage in commit 23. */}

      {/* Change Password Modal */}
      {changePwOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setChangePwOpen(false)}>
          <div
            className="rounded-2xl border p-6 w-full max-w-sm space-y-4 mx-4"
            style={{ background: "#1a1a2e", borderColor: "rgba(233,255,112,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#E9FF70" }}>
                <Lock className="w-4 h-4" style={{ color: "#333" }} />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Change Password</h3>
                <p className="text-[10px] font-mono text-gray-500">Logged in as {user?.email}</p>
              </div>
              <button onClick={() => setChangePwOpen(false)} className="ml-auto p-1 text-gray-500 hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {[
                { label: "Current Password", val: changePwCurrent, set: setChangePwCurrent },
                { label: "New Password", val: changePwNew, set: setChangePwNew },
                { label: "Confirm New Password", val: changePwConfirm, set: setChangePwConfirm },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">{label}</p>
                  <input
                    type="password"
                    value={val}
                    onChange={(e) => { set(e.target.value); setChangePwMsg(null); }}
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                    style={{ background: "#0f172a", border: "1.5px solid rgba(255,255,255,0.1)", color: "#fff" }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#E9FF70"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  />
                </div>
              ))}
            </div>

            {changePwMsg && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono" style={{ background: changePwMsg.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${changePwMsg.ok ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`, color: changePwMsg.ok ? "#4ade80" : "#f87171" }}>
                {changePwMsg.ok ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                {changePwMsg.text}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setChangePwOpen(false)} className="px-4 py-2 rounded-lg text-xs text-gray-400 border border-white/10 hover:text-white transition-colors font-mono">
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={changePwSaving || changePwMsg?.ok}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "#E9FF70", color: "#333" }}
              >
                {changePwSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
