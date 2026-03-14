import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGetWorkers, useGetWorkerStats } from "@workspace/api-client-react";
import { 
  Users, AlertTriangle, ShieldAlert, Clock, 
  Search, Filter, LogOut, FileText, Bell, RefreshCcw, Eye, Zap, Pencil, ExternalLink,
  MapPin, UserCheck, UserMinus, Building2, Settings, Database, CheckCircle, XCircle
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

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  
  const [activeTab, setActiveTab] = useState<"compliance" | "deployment" | "settings">("compliance");
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
              YOUR RELIABLE HR PARTNER IN EUROPE. WE MAKE HIRING SIMPLE.
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
            <span className="hidden sm:inline">AI Smart Upload</span>
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

      <main className="flex-1 p-6 lg:p-8 z-10 max-w-[1600px] mx-auto w-full space-y-6" style={{ minWidth: 0, overflowX: "hidden" }}>

        {/* ── Tab Bar ── */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-800/60 border border-white/8 w-fit">
          {(["compliance", "deployment", "settings"] as const).map((tab) => (
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
              {tab === "settings" && <Settings className="w-3.5 h-3.5" />}
              {tab === "compliance" ? "Compliance" : tab === "deployment" ? "Deployment" : "Settings"}
            </button>
          ))}
        </div>

        {/* Stats Grid — Compliance view */}
        {activeTab === "compliance" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title={t("stats.totalWorkforce")} value={stats?.total || "0"} icon={Users} />
            <StatCard title={t("stats.critical")} value={stats?.critical || "0"} icon={ShieldAlert} variant="critical" />
            <StatCard title={t("stats.upcomingRenewals")} value={stats?.warning || "0"} icon={Clock} variant="warning" />
            <StatCard title={t("stats.nonCompliant")} value={stats?.nonCompliant || "0"} icon={AlertTriangle} variant="critical" />
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
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Deployed</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#E9FF70" }}>
                      <UserCheck className="w-4 h-4" style={{ color: "#333333" }} />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-white">{deployed.length}</p>
                  <p className="text-xs font-mono text-gray-500 mt-1">Active site assignments</p>
                </div>

                {/* Bench / Available */}
                <div className="glass-panel rounded-xl p-5 border border-white/8">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Bench / Available</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-700">
                      <UserMinus className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-white">{bench.length}</p>
                  <p className="text-xs font-mono text-gray-500 mt-1">No site assigned</p>
                </div>

                {/* Total Candidates */}
                <div className="glass-panel rounded-xl p-5 border border-white/8">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Candidates</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-700">
                      <Users className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-white">{all.length}</p>
                  <p className="text-xs font-mono text-gray-500 mt-1">Across all statuses</p>
                </div>

                {/* Active Sites */}
                <div className="glass-panel rounded-xl p-5 border border-white/8">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Active Sites</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-700">
                      <Building2 className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-white">{sites.length}</p>
                  <p className="text-xs font-mono text-gray-500 mt-1">Distinct locations</p>
                </div>
              </div>

              {/* Per-site breakdown */}
              {sites.length > 0 && (
                <div className="glass-panel rounded-xl p-5 border" style={{ borderColor: "rgba(233,255,112,0.12)" }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: "#E9FF70" }}>Site Breakdown</p>
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
                        Clear filter ×
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
                <option value="">All Job Roles</option>
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
                <option value="">All Clients</option>
                <option value="Available">Available / Bench</option>
                {uniqueClients.map((client) => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        {/* v=2026_FINAL */}
        <div style={{
          overflowX: "scroll",
          WebkitOverflowScrolling: "touch",
          borderRadius: "0.75rem",
          border: "1px solid #334155",
          background: "#1e293b",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.4)",
        }} className="table-scroll-container">
          <table style={{
            width: "max-content",
            minWidth: "100%",
            borderCollapse: "collapse",
            whiteSpace: "nowrap",
          }} className="text-left">
              <thead className="bg-slate-700/60 border-b border-slate-600">
                <tr>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">{t("table.operator")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">{t("table.spec")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">{t("table.trcExpiry")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">{t("table.workPermit")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">{t("table.bhp")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">Experience</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">Qualification</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest" style={{ color: "#E9FF70" }}>Total Hours</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest" style={{ color: "#E9FF70" }}>Assigned Site</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">{t("table.status")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-center border-l border-white/10" style={{ color: "#E9FF70" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-sm">
                {isLoadingWorkers ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={11} className="px-6 py-6">
                        <div className="h-4 bg-white/5 rounded animate-pulse w-full" />
                      </td>
                    </tr>
                  ))
                ) : workersData?.workers.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-muted-foreground font-sans">
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
                      <td className="px-6 py-4">
                        <div className="font-sans font-medium text-white">{worker.name}</div>
                        <div className="text-xs text-muted-foreground">{worker.email}</div>
                      </td>
                      <td className="px-6 py-4">
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
                            {(worker as any).yearsOfExperience} yrs
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
                      <td className="px-6 py-4">
                        {(() => {
                          const hrs = (worker as any).totalHours as number | null;
                          if (hrs === null || hrs === undefined) return <span className="text-gray-500">—</span>;
                          return (
                            <span
                              className="px-2.5 py-1 rounded-lg text-xs font-black font-mono tabular-nums"
                              style={{ background: "#E9FF70", color: "#333333" }}
                            >
                              {hrs % 1 === 0 ? hrs : hrs.toFixed(1)} h
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4">
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
                            EDIT
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

        {/* ── Settings Tab ── */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            {/* Airtable Schema Sync Card */}
            <div className="rounded-2xl border border-white/8 bg-slate-900/60 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5" style={{ color: "#E9FF70" }} />
                <div>
                  <h2 className="text-base font-black uppercase tracking-widest text-white">Airtable Schema Sync</h2>
                  <p className="text-xs text-white/40 mt-0.5">Create missing EEJ columns in your Airtable base automatically.</p>
                </div>
              </div>

              <div className="rounded-xl bg-slate-800/60 border border-white/8 p-4 space-y-1.5 text-xs font-mono">
                <p className="text-white/60 uppercase tracking-widest text-[10px] font-bold mb-2">Fields to sync</p>
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
                {schemaSyncing ? "Syncing…" : "Sync Airtable Schema"}
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
                  <h2 className="text-base font-black uppercase tracking-widest text-white">Automatic Expiry Alerts</h2>
                  <p className="text-xs text-white/40 mt-0.5">Daily email alerts for documents expiring within 14 days.</p>
                </div>
              </div>
              <div className="rounded-xl bg-slate-800/60 border border-white/8 p-4 text-xs space-y-3">
                <p className="text-white/60 font-mono text-[10px] uppercase tracking-widest font-bold">Required Replit Secrets</p>
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
                  <h2 className="text-base font-black uppercase tracking-widest text-white">Portal Credentials</h2>
                  <p className="text-xs text-white/40 mt-0.5">Set <code className="text-[10px] px-1 rounded" style={{ background: "rgba(233,255,112,0.1)", color: "#E9FF70" }}>VITE_ADMIN_EMAIL</code> and <code className="text-[10px] px-1 rounded" style={{ background: "rgba(233,255,112,0.1)", color: "#E9FF70" }}>VITE_ADMIN_PASSWORD</code> in Replit Secrets to change.</p>
                </div>
              </div>
              <div className="rounded-xl bg-slate-800/60 border border-white/8 p-4 font-mono text-xs space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-white/40 w-20">Email</span>
                  <span className="text-white/80">{(import.meta.env.VITE_ADMIN_EMAIL as string | undefined) ?? "admin@euro-edu-jobs.eu"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white/40 w-20">Password</span>
                  <span className="text-white/50 italic">configured via secret</span>
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
