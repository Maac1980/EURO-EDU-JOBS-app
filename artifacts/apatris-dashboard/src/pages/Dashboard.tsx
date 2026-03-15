import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useGetWorkers, useGetWorkerStats } from "@workspace/api-client-react";
import { 
  Users, AlertTriangle, ShieldAlert, Clock, 
  Search, Filter, LogOut, FileText, Bell, RefreshCcw, Eye, Zap, Pencil, ExternalLink,
  MapPin, UserCheck, UserMinus, Building2, Settings, Database, CheckCircle, XCircle,
  AlertOctagon, Mail, Phone, MessageSquare, AlertCircle, Shield
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";

import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkerProfilePanel } from "@/components/WorkerProfilePanel";
import { NotifyDialog, RenewDialog } from "@/components/ActionDialogs";
import { ComplianceReportModal } from "@/components/ComplianceReportModal";
import { BulkUploadModal } from "@/components/BulkUploadModal";
import { NotificationBell } from "@/components/NotificationBell";
import { CandidateEditPanel } from "@/components/CandidateEditPanel";
import { ComplianceTrendChart } from "@/components/ComplianceTrendChart";
import { PdfDownloadButton } from "@/components/PdfDownloadButton";

function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith("pl") ? "pl" : "en";

  const toggle = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-1">
      <button
        onClick={() => toggle("en")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
          current === "en"
            ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(233,255,112,0.4)]"
            : "text-muted-foreground hover:text-white"
        }`}
        title="English"
      >
        <span className="text-sm leading-none">🇬🇧</span>
        <span>EN</span>
      </button>
      <button
        onClick={() => toggle("pl")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
          current === "pl"
            ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(233,255,112,0.4)]"
            : "text-muted-foreground hover:text-white"
        }`}
        title="Polski"
      >
        <span className="text-sm leading-none">🇵🇱</span>
        <span>PL</span>
      </button>
    </div>
  );
}

/* ── Phone number auto-formatter for WhatsApp ─────────────────────── */
function formatWANumber(phone: string): string {
  const clean = phone.replace(/[\s\-().]/g, "");
  if (clean.startsWith("+")) return clean;
  if (clean.startsWith("00")) return "+" + clean.slice(2);
  if (clean.startsWith("0")) return "+48" + clean.slice(1);
  return "+48" + clean;
}

/* ── Determine which documents are in the critical zone ──────────────*/
function getCriticalDocType(worker: any): string {
  const now = new Date();
  const candidates: Array<{ label: string; date: string | null }> = [
    { label: "TRC", date: worker.trcExpiry },
    { label: "Zezwolenie na pracę", date: worker.workPermitExpiry },
    { label: "BHP", date: worker.bhpStatus },
    { label: "Umowa", date: worker.contractEndDate },
  ];
  const critical = candidates
    .filter((d) => {
      if (!d.date) return false;
      const dt = new Date(d.date);
      return !isNaN(dt.getTime()) && d.date.includes("-");
    })
    .map((d) => ({
      label: d.label,
      days: Math.ceil((new Date(d.date!).getTime() - now.getTime()) / 86_400_000),
    }))
    .filter((d) => d.days <= 30)
    .sort((a, b) => a.days - b.days);
  if (critical.length === 0) return "dokument";
  return critical.map((d) => d.label).join(", ");
}

/* ── Contact icons strip ─────────────────────────────────────────────*/
function ContactIcons({ worker }: { worker: any }) {
  const phone = worker.phone as string | null;
  if (!phone) return null;
  const waNumber = formatWANumber(phone);
  const isCritical = worker.complianceStatus === "critical";
  const docType = isCritical ? getCriticalDocType(worker) : "";
  const urgentMsg = isCritical
    ? `Dzień dobry ${worker.name}, Twoje dokumenty (${docType}) wygasają. Prosimy o pilny kontakt z biurem EEJ.`
    : "";

  return (
    <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
      {/* Phone */}
      <a
        href={`tel:${phone}`}
        title={`Zadzwoń: ${phone}`}
        className="p-1 rounded transition-colors hover:bg-white/10"
        style={{ color: "#4ade80" }}
      >
        <Phone className="w-3 h-3" />
      </a>
      {/* SMS */}
      <a
        href={`sms:${phone}`}
        title={`SMS: ${phone}`}
        className="p-1 rounded transition-colors hover:bg-white/10"
        style={{ color: "#60a5fa" }}
      >
        <MessageSquare className="w-3 h-3" />
      </a>
      {/* WhatsApp — urgent alert if critical, normal link otherwise */}
      {isCritical ? (
        <a
          href={`https://wa.me/${waNumber}?text=${encodeURIComponent(urgentMsg)}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Wyślij pilny alert WhatsApp"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide animate-pulse"
          style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.5)", color: "#f87171" }}
        >
          <AlertCircle className="w-2.5 h-2.5" />
          PILNE
        </a>
      ) : (
        <a
          href={`https://wa.me/${waNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`WhatsApp: ${waNumber}`}
          className="p-1 rounded transition-colors hover:bg-white/10"
          style={{ color: "#25D366" }}
        >
          {/* WhatsApp SVG icon */}
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  
  const [activeTab, setActiveTab] = useState<"compliance" | "deployment" | "alerts" | "settings">("compliance");
  const [search, setSearch] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [status, setStatus] = useState("");
  const [siteFilter, setSiteFilter] = useState("");

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [panelEditMode, setPanelEditMode] = useState(false);
  const [editPanelWorkerId, setEditPanelWorkerId] = useState<string | null>(null);
  const [actionWorker, setActionWorker] = useState<any | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

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

  const { data: workersData, isLoading: isLoadingWorkers } = useGetWorkers({ 
    search: search || undefined, 
    specialization: specialization || undefined, 
    status: status || undefined 
  });
  
  const { data: stats } = useGetWorkerStats();

  // Derive unique client/site names dynamically from live data
  const uniqueClients = Array.from(
    new Set(
      (workersData?.workers ?? [])
        .map((w) => (w as any).siteLocation as string | undefined)
        .filter((s): s is string => !!s && s !== "Available")
    )
  ).sort();

  const handleNotify = (e: React.MouseEvent, worker: any) => {
    e.stopPropagation();
    setActionWorker(worker);
    setNotifyOpen(true);
  };

  const handleRenew = (e: React.MouseEvent, worker: any) => {
    e.stopPropagation();
    setActionWorker(worker);
    setRenewOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-foreground flex flex-col relative">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/8 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[30%] bg-destructive/3 blur-[160px] rounded-full" />
      </div>

      {/* Header */}
      <header
        className="h-16 border-b border-slate-700 bg-slate-900/95 backdrop-blur-xl sticky top-0 z-30 px-6 flex items-center justify-between"
        style={{ boxShadow: "0 1px 0 rgba(233,255,112,0.08), 0 4px 20px rgba(0,0,0,0.3)" }}
      >
        <div className="flex items-center gap-3">
          {/* EEJ Lime Square Logo */}
          <div
            className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center"
            style={{ background: "#E9FF70", boxShadow: "0 0 0 1px rgba(233,255,112,0.3), 0 4px 12px rgba(233,255,112,0.2)" }}
            aria-label="Euro Edu Jobs Logo"
          >
            <span
              className="text-sm font-black tracking-tighter"
              style={{ color: "#333333", fontFamily: "Arial Black, Arial, sans-serif" }}
            >
              EEJ
            </span>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-[0.12em] uppercase leading-none text-white">
              {t("header.title")}
            </h1>
            <p
              className="text-[9px] font-bold font-mono tracking-[0.18em] uppercase leading-none mt-0.5"
              style={{ color: "#E9FF70", opacity: 0.75 }}
            >
              {t("header.tagline")}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* ⚡ AI Smart Upload */}
          <button
            onClick={() => setBulkUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono font-black uppercase tracking-wide transition-all hover:opacity-90"
            style={{ background: "#E9FF70", color: "#333333" }}
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">{t("header.aiUpload")}</span>
          </button>

          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono font-bold uppercase tracking-wide transition-all hover:opacity-90"
            style={{ border: "1px solid rgba(233,255,112,0.4)", color: "#E9FF70" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#E9FF70"; (e.currentTarget as HTMLButtonElement).style.color = "#333333"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ""; (e.currentTarget as HTMLButtonElement).style.color = "#E9FF70"; }}
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">{t("header.generateReport")}</span>
          </button>

          <PdfDownloadButton sites={uniqueClients} />

          {/* Notification Bell */}
          <NotificationBell onSelectWorker={(id) => setSelectedWorkerId(id)} />

          <LanguageToggle />
          
          <div className="w-px h-6 bg-white/10" />
          
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-white leading-tight">{user?.name}</p>
              <p className="text-xs text-primary font-mono">{user?.role}</p>
            </div>
            <a
              href="https://edu-jobs.eu"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all hover:opacity-90"
              style={{ border: "1px solid rgba(233,255,112,0.35)", color: "#E9FF70" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#E9FF70"; (e.currentTarget as HTMLAnchorElement).style.color = "#333333"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = ""; (e.currentTarget as HTMLAnchorElement).style.color = "#E9FF70"; }}
              title="Back to Main Website"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Main Website</span>
            </a>
            <button onClick={logout} title={t("header.logout")} className="p-2 text-muted-foreground hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-6 z-10 max-w-[1600px] mx-auto w-full space-y-4">

        {/* ── Tab Bar ── */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-800/60 border border-white/8 w-fit">
          {(["compliance", "deployment", "alerts", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all"
              style={
                activeTab === tab
                  ? { background: "#E9FF70", color: "#333333", boxShadow: "0 0 14px rgba(233,255,112,0.25)" }
                  : { color: "rgba(255,255,255,0.45)" }
              }
            >
              {tab === "compliance" && <ShieldAlert className="w-3.5 h-3.5" />}
              {tab === "deployment" && <MapPin className="w-3.5 h-3.5" />}
              {tab === "alerts" && <AlertOctagon className="w-3.5 h-3.5" />}
              {tab === "settings" && <Settings className="w-3.5 h-3.5" />}
              {tab === "compliance" ? t("tabs.compliance") : tab === "deployment" ? t("tabs.deployment") : tab === "alerts" ? t("tabs.alerts") : t("tabs.settings")}
            </button>
          ))}
        </div>

        {/* Stats Grid — Compliance view */}
        {activeTab === "compliance" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title={t("stats.totalWorkforce")} value={stats?.total || "0"} icon={Users} />
              <StatCard title={t("stats.critical")} value={stats?.critical || "0"} icon={ShieldAlert} variant="critical" />
              <StatCard title={t("stats.upcomingRenewals")} value={stats?.warning || "0"} icon={Clock} variant="warning" />
              <StatCard title={t("stats.nonCompliant")} value={stats?.nonCompliant || "0"} icon={AlertTriangle} variant="critical" />
            </div>
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

              {/* Per-site breakdown */}
              {sites.length > 0 && (
                <div className="glass-panel rounded-xl p-5 border" style={{ borderColor: "rgba(233,255,112,0.12)" }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: "#E9FF70" }}>{t("deployment.siteBreakdown")}</p>
                  <div className="flex flex-wrap gap-3">
                    {sites.map((site) => {
                      const count = deployed.filter((w) => (w as any).siteLocation === site).length;
                      return (
                        <button
                          key={site}
                          onClick={() => { setSiteFilter(siteFilter === site ? "" : site); }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                          style={
                            siteFilter === site
                              ? { background: "#E9FF70", color: "#333333" }
                              : { background: "rgba(233,255,112,0.08)", border: "1px solid rgba(233,255,112,0.22)", color: "#E9FF70" }
                          }
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {site}
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-black"
                            style={siteFilter === site ? { background: "#333333", color: "#E9FF70" } : { background: "rgba(233,255,112,0.2)", color: "#E9FF70" }}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                    {siteFilter && (
                      <button
                        onClick={() => setSiteFilter("")}
                        className="px-3 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
                      >
                        {t("deployment.clearFilter")}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Command Bar */}
        <div className="glass-panel p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder={t("table.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white focus:outline-none transition-colors placeholder:text-gray-500"
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(233,255,112,0.7)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(233,255,112,0.12)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
            />
          </div>
          
          <div className="flex gap-3 w-full md:w-auto flex-wrap">
            <div className="relative flex-1 md:w-52">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors"
                style={specialization ? { borderColor: "rgba(233,255,112,0.5)", color: "#E9FF70" } : {}}
              >
                <option value="">{t("table.allSpecs")}</option>
                {Array.from(
                  new Set(
                    (workersData?.workers ?? [])
                      .map((w) => w.specialization)
                      .filter((s): s is string => !!s && s.trim() !== "")
                  )
                )
                  .sort()
                  .map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
              </select>
            </div>
            <div className="relative flex-1 md:w-44">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select 
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors"
              >
                <option value="">{t("table.allStatuses")}</option>
                <option value="compliant">{t("table.compliant")}</option>
                <option value="warning">{t("table.warning")}</option>
                <option value="critical">{t("table.critical")}</option>
                <option value="non-compliant">{t("table.nonCompliant")}</option>
              </select>
            </div>
            <div className="relative flex-1 md:w-52">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors"
                style={siteFilter ? { borderColor: "rgba(233,255,112,0.5)", color: "#E9FF70" } : {}}
              >
                <option value="">{t("table.allClients")}</option>
                <option value="Available">{t("table.available")}</option>
                {uniqueClients.map((client) => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div style={{
          borderRadius: "0.75rem",
          border: "1px solid #334155",
          background: "#1e293b",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.4)",
          overflowX: "auto",
          width: "100%",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }} className="text-left text-xs">
              <thead className="bg-slate-700/60 border-b border-slate-600">
                <tr>
                  <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.operator")}</th>
                  <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.spec")}</th>
                  <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.trcExpiry")}</th>
                  <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.workPermit")}</th>
                  <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.bhp")}</th>
                  <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.exp")}</th>
                  <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.qual")}</th>
                  <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest" style={{ color: "#E9FF70" }}>{t("table.assignedSite")}</th>
                  <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.status")}</th>
                  <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-center border-l border-white/10" style={{ color: "#E9FF70" }}>{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-xs">
                {isLoadingWorkers ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10} className="px-2 py-2">
                        <div className="h-4 bg-white/5 rounded animate-pulse w-full" />
                      </td>
                    </tr>
                  ))
                ) : workersData?.workers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground font-sans">
                      {t("table.noResults")}
                    </td>
                  </tr>
                ) : (
                  (workersData?.workers ?? [])
                    .filter((w) => {
                      if (!siteFilter) return true;
                      const site = (w as any).siteLocation as string | null;
                      if (siteFilter === "Available") return !site || site === "Available";
                      return site === siteFilter;
                    })
                    .map((worker) => (
                    <tr 
                      key={worker.id} 
                      onClick={() => setSelectedWorkerId(worker.id)}
                      className="hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      <td className="px-2 py-2">
                        <div className="font-sans font-medium text-white">{worker.name}</div>
                        <div className="text-xs text-muted-foreground">{worker.email}</div>
                        <ContactIcons worker={worker} />
                      </td>
                      <td className="px-2 py-2">
                        <span className="px-2 py-1 rounded bg-white/10 border border-white/20 text-xs font-bold text-white">
                          {worker.specialization || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-white font-mono text-sm">
                        {worker.trcExpiry ? format(parseISO(worker.trcExpiry), 'MMM d, yyyy') : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-6 py-4 text-white font-mono text-sm">
                        {worker.workPermitExpiry ? format(parseISO(worker.workPermitExpiry), 'MMM d, yyyy') : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-6 py-4 font-mono text-sm">
                        {(() => {
                          const v = worker.bhpStatus;
                          if (!v) return <span className="text-gray-500">—</span>;
                          const d = new Date(v);
                          if (!isNaN(d.getTime()) && v.includes('-')) {
                            const expired = d < new Date();
                            return (
                              <span className={expired ? 'text-destructive font-bold' : 'text-success font-bold'}>
                                {format(parseISO(v), 'MMM d, yyyy')}
                              </span>
                            );
                          }
                          const lower = v.toLowerCase();
                          return (
                            <span className={lower === 'active' ? 'text-success font-bold' : 'text-destructive font-bold'}>
                              {v}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {(worker as any).yearsOfExperience ? (
                          <span className="px-2 py-1 rounded text-xs font-bold font-mono" style={{ background: "rgba(233,255,112,0.1)", border: "1px solid rgba(233,255,112,0.25)", color: "#E9FF70" }}>
                            {(worker as any).yearsOfExperience} {t("table.yrs")}
                          </span>
                        ) : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {(worker as any).highestQualification ? (
                          <span className="px-2 py-1 rounded text-xs font-bold font-mono" style={{ background: "rgba(233,255,112,0.07)", border: "1px solid rgba(233,255,112,0.18)", color: "rgba(233,255,112,0.85)" }}>
                            {(worker as any).highestQualification}
                          </span>
                        ) : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        {(() => {
                          const site = (worker as any).siteLocation as string | null;
                          if (!site || site === "Available") {
                            return (
                              <span className="flex items-center gap-1.5 text-xs font-mono text-gray-500">
                                <UserMinus className="w-3 h-3" />
                                Available
                              </span>
                            );
                          }
                          return (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSiteFilter(siteFilter === site ? "" : site); }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black transition-all hover:opacity-80"
                              style={{ background: "#E9FF70", color: "#333333" }}
                              title={`Filter by ${site}`}
                            >
                              <MapPin className="w-3 h-3" />
                              {site}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={worker.complianceStatus} />
                      </td>
                      <td className="px-4 py-3 text-center border-l border-white/10" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-center gap-1.5">
                          {/* Primary EDIT action — lime-filled */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditPanelWorkerId(worker.id); }}
                            className="flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all hover:brightness-110 active:scale-95"
                            style={{ background: "#E9FF70", color: "#333333", minWidth: "84px", boxShadow: "0 2px 12px rgba(233,255,112,0.35)" }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            {t("table.edit")}
                          </button>
                          {/* Secondary actions — always visible as small icons */}
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setPanelEditMode(false); setSelectedWorkerId(worker.id); }}
                              className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                              title="View full profile"
                            >
                              <Eye className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={(e) => handleNotify(e, worker)}
                              className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                              title={t("table.notifyWorker")}
                            >
                              <Bell className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={(e) => handleRenew(e, worker)}
                              className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                              title={t("table.renewDocument")}
                            >
                              <RefreshCcw className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
          </table>
        </div>

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
          </div>
        )}
      </main>

      <WorkerProfilePanel 
        workerId={selectedWorkerId}
        initialEditMode={panelEditMode}
        onClose={() => { setSelectedWorkerId(null); setPanelEditMode(false); }} 
        onRenew={(w) => { setSelectedWorkerId(null); setPanelEditMode(false); setActionWorker(w); setRenewOpen(true); }}
        onNotify={(w) => { setSelectedWorkerId(null); setPanelEditMode(false); setActionWorker(w); setNotifyOpen(true); }}
      />

      <CandidateEditPanel
        workerId={editPanelWorkerId}
        onClose={() => setEditPanelWorkerId(null)}
      />
      
      {actionWorker && (
        <>
          <NotifyDialog worker={actionWorker} isOpen={notifyOpen} onClose={() => setNotifyOpen(false)} />
          <RenewDialog worker={actionWorker} isOpen={renewOpen} onClose={() => setRenewOpen(false)} />
        </>
      )}

      <ComplianceReportModal isOpen={reportOpen} onClose={() => setReportOpen(false)} />
      <BulkUploadModal isOpen={bulkUploadOpen} onClose={() => setBulkUploadOpen(false)} />
    </div>
  );
}
