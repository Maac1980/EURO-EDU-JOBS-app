import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useGetWorkers, getGetWorkersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Users, AlertTriangle, Search, Filter, FileText, Bell, RefreshCcw, Eye, Zap, Pencil,
  MapPin, UserMinus, Download, Trash2, Mail, Phone, MessageSquare, AlertCircle, UserPlus,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkerProfilePanel } from "@/components/WorkerProfilePanel";
import { WorkerCockpit } from "@/components/WorkerCockpit";
import { NotifyDialog, RenewDialog } from "@/components/ActionDialogs";
import { ComplianceReportModal } from "@/components/ComplianceReportModal";
import { BulkUploadModal } from "@/components/BulkUploadModal";
import { CandidateEditPanel } from "@/components/CandidateEditPanel";
import { PdfDownloadButton } from "@/components/PdfDownloadButton";
import { AddWorkerModal } from "@/components/AddWorkerModal";
import { BulkCsvImportModal } from "@/components/BulkCsvImportModal";
import { CommandPalette } from "@/components/CommandPalette";
import { PrintQRSheet } from "@/components/PrintQRSheet";
import { calcComplianceScore, scoreColor } from "@/lib/complianceScore";

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
      <a href={`tel:${phone}`} title={`Zadzwoń: ${phone}`} className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: "#4ade80" }}>
        <Phone className="w-3 h-3" />
      </a>
      <a href={`sms:${phone}`} title={`SMS: ${phone}`} className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: "#60a5fa" }}>
        <MessageSquare className="w-3 h-3" />
      </a>
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
        <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" title={`WhatsApp: ${waNumber}`} className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: "#25D366" }}>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      )}
    </div>
  );
}

export default function WorkersPage() {
  const { isAdmin, isCoordinator, isManager, user } = useAuth();
  const { t } = useTranslation();
  const [location] = useLocation();

  // Read deep-link params on mount: ?worker=ID (open profile), ?site=NAME (apply site filter)
  // Pre-fix: workers grid lived on Dashboard /, QR scans encode /?worker=ID; commit 23 moves
  // the grid to /workers. Dashboard now redirects /?worker=ID → /workers?worker=ID so legacy
  // QR codes still resolve.
  const initialParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();

  const [search, setSearch] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [status, setStatus] = useState("");
  const [siteFilter, setSiteFilter] = useState(initialParams.get("site") ?? "");
  const [pipelineFilter, setPipelineFilter] = useState("");
  const [voivodeshipFilter, setVoivodeshipFilter] = useState("");

  const [cockpitWorkerId, setCockpitWorkerId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(initialParams.get("worker"));
  const [panelEditMode, setPanelEditMode] = useState(false);
  const [editPanelWorkerId, setEditPanelWorkerId] = useState<string | null>(null);
  const [actionWorker, setActionWorker] = useState<any | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkCsvOpen, setBulkCsvOpen] = useState(false);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Strip ?worker= / ?site= params from URL on initial load (keeps browser history tidy)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let dirty = false;
    if (params.has("worker")) { params.delete("worker"); dirty = true; }
    if (params.has("site")) { params.delete("site"); dirty = true; }
    if (dirty) {
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    }
  }, []);

  const { data: workersData, isLoading: isLoadingWorkers, isFetching } = useGetWorkers({
    search: search || undefined,
    specialization: specialization || undefined,
    status: status || undefined,
  }, {
    // Item 2.16 — TanStack Query options type requires queryKey alongside
    // refetchInterval. Include filter params so per-filter cache identity
    // matches the invalidateQueries call below (line ~227).
    query: {
      queryKey: getGetWorkersQueryKey({
        search: search || undefined,
        specialization: specialization || undefined,
        status: status || undefined,
      }),
      refetchInterval: 15_000,
    },
  });

  const uniqueClients = Array.from(
    new Set(
      (workersData?.workers ?? [])
        .map((w) => (w as any).siteLocation as string | undefined)
        .filter((s): s is string => !!s && s !== "Available")
    )
  ).sort();

  const exportCsv = () => {
    const workers = workersData?.workers ?? [];
    if (workers.length === 0) return;
    const headers = [
      "Name","Email","Phone","Job Role","Site","TRC Expiry","Work Permit Expiry",
      "BHP Status","Contract End","Badania Lekarskie","Oświadczenie Expiry",
      "UDT Cert Expiry","PESEL","NIP","ZUS Status","Visa Type",
      "Hourly Rate (zł)","Total Hours","Advance Payment","Penalties","Compliance Status",
      "IBAN","Typ Umowy","Obywatelstwo","Etap Rekrutacji",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const rows = workers.map((w: any) => [
      w.name, w.email, w.phone,
      w.specialization, w.siteLocation,
      w.trcExpiry, w.workPermitExpiry, w.bhpStatus, w.contractEndDate,
      w.badaniaLekExpiry, w.oswiadczenieExpiry, w.udtCertExpiry,
      w.pesel, w.nip, w.zusStatus, w.visaType,
      w.hourlyNettoRate, w.totalHours, w.advancePayment, w.penalties,
      w.complianceStatus,
      w.iban, w.contractType, w.nationality, w.pipelineStage,
    ].map(esc).join(","));
    const csv = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const filename = `EEJ_workers_${new Date().toISOString().slice(0, 10)}.csv`;
    if ((navigator as any).msSaveBlob) { (navigator as any).msSaveBlob(blob, filename); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  };

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

  const handleDelete = async (e: React.MouseEvent, workerId: string) => {
    e.stopPropagation();
    if (confirmDeleteId !== workerId) { setConfirmDeleteId(workerId); return; }
    setDeletingId(workerId);
    setConfirmDeleteId(null);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/workers/${workerId}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Delete failed" })); throw new Error(err.error ?? "Delete failed"); }
      await queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() });
      toast({ title: t("table.deleted"), variant: "destructive" });
    } catch (err) {
      toast({ title: t("table.deleteFailed"), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="eej-app-shell bg-slate-900 text-foreground">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/8 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
      </div>

      <div className="eej-main">
      <div className="app-content-scroll">

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, margin: "28px 40px 0" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)" }}>
            <Users className="w-5 h-5" style={{ color: "#60a5fa" }} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-widest text-white">Workers</h1>
            <p className="text-[10px] font-mono text-white/40">Full database — filter, edit, deploy</p>
          </div>
        </div>
      </div>

      {/* Worker CRUD action buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "20px 40px" }}>
        {(isAdmin || isCoordinator) && (
          <button onClick={() => setAddWorkerOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 6, background: "#E9FF70", color: "#333333", border: "none", fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}>
            <UserPlus size={14} /> {t("addWorker.title")}
          </button>
        )}
        {(isAdmin || isCoordinator) && (
          <button onClick={() => setBulkCsvOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 6, background: "#1e2028", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", cursor: "pointer" }}>
            <Download size={14} /> Bulk Import (CSV)
          </button>
        )}
        <button onClick={() => setBulkUploadOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 6, background: "#1e2028", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", cursor: "pointer" }}>
          <Zap size={14} /> {t("header.aiUpload")}
        </button>
        <button onClick={() => setReportOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 6, background: "#1e2028", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", cursor: "pointer" }}>
          <FileText size={14} /> {t("header.generateReport")}
        </button>
        <button onClick={exportCsv} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 6, background: "#1e2028", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", cursor: "pointer" }}>
          <Download size={14} /> Export
        </button>
        <PdfDownloadButton sites={uniqueClients} />
      </div>

      <main className="px-10 pb-6 z-10 max-w-[1600px] mx-auto w-full space-y-4">

        {/* Site-restriction badge for managers */}
        {isManager && user?.site && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest w-fit" style={{ background: "rgba(233,255,112,0.12)", border: "1px solid rgba(233,255,112,0.3)", color: "#E9FF70" }}>
            <MapPin className="w-3.5 h-3.5" />
            {t("roles.siteView")}: {user.site}
          </div>
        )}

        {/* Active filter chip — surfaces ?site= deep-link from home deployment tab */}
        {siteFilter && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Filtered by site:</span>
            <button onClick={() => setSiteFilter("")} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black" style={{ background: "#E9FF70", color: "#333333" }}>
              <MapPin className="w-3 h-3" />
              {siteFilter}
              <span className="text-white/60">×</span>
            </button>
          </div>
        )}

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
                ).sort().map((role) => (
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
              >
                <option value="">All Sites</option>
                <option value="Available">Bench / Available</option>
                {uniqueClients.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative flex-1 md:w-44">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select
                value={pipelineFilter}
                onChange={(e) => setPipelineFilter(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors"
              >
                <option value="">All Stages</option>
                {["New","Screening","Interview","Offer Sent","Placed","Active","Released","Blacklisted"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="relative flex-1 md:w-44">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select
                value={voivodeshipFilter}
                onChange={(e) => setVoivodeshipFilter(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors"
              >
                <option value="">All Voivodeships</option>
                {["dolnoslaskie","kujawsko-pomorskie","lubelskie","lubuskie","lodzkie","malopolskie","mazowieckie","opolskie","podkarpackie","podlaskie","pomorskie","slaskie","swietokrzyskie","warminsko-mazurskie","wielkopolskie","zachodniopomorskie"].map((v) => (
                  <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                ))}
              </select>
            </div>
            <PrintQRSheet workers={workersData?.workers ?? []} />
          </div>
        </div>

        {/* Mobile card view */}
        <div className="md:hidden space-y-3">
          {isFetching ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background: "#1e293b", border: "1px solid #334155" }}>
                <div className="h-4 bg-slate-700 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-800 rounded w-1/2 mb-3" />
                <div className="flex gap-2">
                  <div className="h-6 bg-slate-700 rounded w-16" />
                  <div className="h-6 bg-slate-700 rounded w-16" />
                </div>
              </div>
            ))
          ) : (
            (workersData?.workers ?? [])
              .filter((w) => {
                const name = w.name?.toLowerCase() ?? "";
                const spec = ((w as any).specialization as string | null)?.toLowerCase() ?? "";
                if (search && !name.includes(search.toLowerCase()) && !spec.includes(search.toLowerCase())) return false;
                if (specialization && (w as any).specialization !== specialization) return false;
                if (status) {
                  const s = w.complianceStatus;
                  if (s !== status) return false;
                }
                const site = (w as any).siteLocation as string | null;
                if (siteFilter) {
                  if (siteFilter === "Available") { if (!(!site || site === "Available")) return false; }
                  else { if (site !== siteFilter) return false; }
                }
                if (pipelineFilter && (w as any).pipelineStage !== pipelineFilter) return false;
                if (voivodeshipFilter && (w as any).voivodeship !== voivodeshipFilter) return false;
                return true;
              })
              .map((worker) => {
                const sc = worker.complianceStatus;
                const statusColor = (sc === "compliant" || sc === "valid") ? "#22c55e"
                  : (sc === "warning" || sc === "pending") ? "#f59e0b"
                  : (sc === "critical" || sc === "non-compliant" || sc === "expired") ? "#ef4444"
                  : "#f59e0b";
                const daysLeft = (d?: string | null) => {
                  if (!d) return null;
                  const diff = Math.round((new Date(d).getTime() - Date.now()) / 86400000);
                  return diff;
                };
                const expiryBadge = (label: string, date?: string | null) => {
                  const d = daysLeft(date);
                  if (d == null) return null;
                  const color = d < 0 ? "#ef4444" : d < 30 ? "#f97316" : d < 60 ? "#eab308" : "#4ade80";
                  return (
                    <span key={label} className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${color}20`, color }}>
                      {label}: {d < 0 ? "wygasł" : `${d}d`}
                    </span>
                  );
                };
                const pipe = (worker as any).pipelineStage as string | null;
                const pipeColor: Record<string, string> = { New: "#60a5fa", Screening: "#a78bfa", Interview: "#f59e0b", "Offer Sent": "#f97316", Placed: "#4ade80", Active: "#4ade80", Released: "#94a3b8", Blacklisted: "#ef4444" };

                return (
                  <div key={worker.id}
                    className="rounded-2xl p-4 cursor-pointer active:opacity-80 transition-all"
                    style={{ background: "#1e293b", border: `1px solid ${statusColor}33` }}
                    onClick={() => setSelectedWorkerId(worker.id)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-black text-white text-sm">{worker.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{(worker as any).specialization ?? "—"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: `${statusColor}20`, color: statusColor }}>
                          {worker.complianceStatus}
                        </span>
                        {pipe && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${pipeColor[pipe] ?? "#94a3b8"}20`, color: pipeColor[pipe] ?? "#94a3b8" }}>{pipe}</span>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {expiryBadge("TRC", worker.trcExpiry)}
                      {expiryBadge("WP", worker.workPermitExpiry)}
                      {expiryBadge("BHP", (worker as any).bhpExpiry)}
                    </div>

                    {(worker as any).siteLocation && (
                      <p className="text-[9px] text-gray-500 font-mono mb-2">📍 {(worker as any).siteLocation}</p>
                    )}

                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide"
                        style={{ background: "rgba(233,255,112,0.1)", color: "#E9FF70", border: "1px solid rgba(233,255,112,0.2)" }}
                        onClick={() => { setEditPanelWorkerId(worker.id); setPanelEditMode(true); }}
                      >EDYTUJ</button>
                      <button
                        className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide"
                        style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
                        onClick={() => setSelectedWorkerId(worker.id)}
                      >PROFIL</button>
                    </div>
                  </div>
                );
              })
          )}
        </div>

        {/* Desktop data table */}
        <div className="hidden md:block" style={{
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
                <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-right" style={{ color: "#4ade80" }}>Net/HR</th>
                <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.badaniaLek")}</th>
                <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.oswiadczenie")}</th>
                <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.exp")}</th>
                <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.qual")}</th>
                <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest" style={{ color: "#E9FF70" }}>{t("table.assignedSite")}</th>
                <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-white">{t("table.status")}</th>
                <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest" style={{ color: "#E9FF70" }}>{t("table.etap")}</th>
                <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-center" style={{ color: "#E9FF70" }}>Score</th>
                <th className="px-2 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-center border-l border-white/10" style={{ color: "#E9FF70" }}>{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-xs">
              {isLoadingWorkers ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={14} className="px-2 py-2">
                      <div className="h-4 bg-white/5 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))
              ) : workersData?.workers.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-6 py-12 text-center text-muted-foreground font-sans">
                    {t("table.noResults")}
                  </td>
                </tr>
              ) : (
                (workersData?.workers ?? [])
                  .filter((w) => {
                    if (specialization && (w as any).specialization !== specialization) return false;
                    if (status) {
                      const s = w.complianceStatus;
                      if (s !== status) return false;
                    }
                    const site = (w as any).siteLocation as string | null;
                    if (siteFilter) {
                      if (siteFilter === "Available") { if (!(!site || site === "Available")) return false; }
                      else { if (site !== siteFilter) return false; }
                    }
                    if (pipelineFilter) {
                      const stage = (w as any).pipelineStage as string | null;
                      if (stage !== pipelineFilter) return false;
                    }
                    if (voivodeshipFilter && (w as any).voivodeship !== voivodeshipFilter) return false;
                    return true;
                  })
                  .map((worker) => (
                  <tr key={worker.id} onClick={() => setSelectedWorkerId(worker.id)} className="hover:bg-white/5 transition-colors cursor-pointer group">
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
                    <td className="px-2 py-2 text-right">
                      {(() => {
                        const rate = (worker as any).hourlyNettoRate ?? 0;
                        if (rate <= 0) return <span className="text-gray-600">—</span>;
                        const pension = Math.round(rate * 160 * 0.0976 * 100) / 100;
                        const disability = Math.round(rate * 160 * 0.015 * 100) / 100;
                        const zus = pension + disability;
                        const healthBase = rate * 160 - zus;
                        const health = Math.round(healthBase * 0.09 * 100) / 100;
                        const kup = Math.floor(healthBase * 0.20);
                        const taxBase = Math.round(healthBase - kup);
                        const pit = Math.max(0, Math.round(taxBase * 0.12) - 300);
                        const netMonthly = rate * 160 - zus - health - pit;
                        const netH = Math.round(netMonthly / 160 * 100) / 100;
                        return <span className="font-mono font-bold text-xs" style={{ color: "#4ade80" }}>{netH.toFixed(2)}</span>;
                      })()}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm">
                      {(() => {
                        const v = worker.bhpStatus;
                        if (!v) return <span className="text-gray-500">—</span>;
                        const d = new Date(v);
                        if (!isNaN(d.getTime()) && v.includes('-')) {
                          const expired = d < new Date();
                          return <span className={expired ? 'text-destructive font-bold' : 'text-success font-bold'}>{format(parseISO(v), 'MMM d, yyyy')}</span>;
                        }
                        const lower = v.toLowerCase();
                        return <span className={lower === 'active' ? 'text-success font-bold' : 'text-destructive font-bold'}>{v}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">
                      {(worker as any).badaniaLekExpiry ? (() => {
                        const d = new Date((worker as any).badaniaLekExpiry);
                        const expired = d < new Date();
                        return <span className={expired ? 'text-destructive font-bold' : 'text-success font-bold'}>{format(parseISO((worker as any).badaniaLekExpiry), 'MMM d, yy')}</span>;
                      })() : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">
                      {(worker as any).oswiadczenieExpiry ? (() => {
                        const d = new Date((worker as any).oswiadczenieExpiry);
                        const expired = d < new Date();
                        return <span className={expired ? 'text-destructive font-bold' : 'text-success font-bold'}>{format(parseISO((worker as any).oswiadczenieExpiry), 'MMM d, yy')}</span>;
                      })() : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {(worker as any).yearsOfExperience ? (
                        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Inter, sans-serif" }}>
                          {(worker as any).yearsOfExperience}
                        </span>
                      ) : <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {(worker as any).highestQualification ? (
                        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Inter, sans-serif" }}>
                          {(worker as any).highestQualification}
                        </span>
                      ) : <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>}
                    </td>
                    <td className="px-2 py-2">
                      {(() => {
                        const site = (worker as any).siteLocation as string | null;
                        if (!site || site === "Available") {
                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest" style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}>
                              <UserMinus className="w-2.5 h-2.5" />
                              BENCH
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
                    <td className="px-2 py-2">
                      {(() => {
                        const stage = (worker as any).pipelineStage as string | null;
                        if (!stage) return <span className="text-gray-600 text-[10px]">—</span>;
                        const colors: Record<string, string> = {
                          "New": "bg-blue-900/40 text-blue-300",
                          "Screening": "bg-purple-900/40 text-purple-300",
                          "Interview": "bg-yellow-900/40 text-yellow-300",
                          "Offer Sent": "bg-orange-900/40 text-orange-300",
                          "Placed": "bg-green-900/40 text-green-300",
                          "Active": "bg-emerald-900/40 text-emerald-300",
                          "Released": "bg-gray-800/60 text-gray-400",
                          "Blacklisted": "bg-red-900/40 text-red-400",
                        };
                        return (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${colors[stage] ?? "bg-white/10 text-white/60"}`}>
                            {stage}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {(() => {
                        const score = calcComplianceScore(worker);
                        const color = scoreColor(score);
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-sm font-black" style={{ color }}>{score}</span>
                            <div className="w-10 h-1 rounded-full overflow-hidden bg-white/10">
                              <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center border-l border-white/10" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditPanelWorkerId(worker.id); }}
                          className="flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all hover:brightness-110 active:scale-95"
                          style={{ background: "#E9FF70", color: "#333333", minWidth: "84px", boxShadow: "0 2px 12px rgba(233,255,112,0.35)" }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {t("table.edit")}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setCockpitWorkerId(worker.id); }}
                          className="flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-500 border border-blue-400 transition-all hover:brightness-110 active:scale-95"
                          style={{ minWidth: "84px", boxShadow: "0 2px 12px rgba(59,130,246,0.35)" }}
                          title="Open the unified worker cockpit"
                        >
                          Full Cockpit →
                        </button>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setPanelEditMode(false); setSelectedWorkerId(worker.id); }}
                            className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                            title="View full profile"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                          <button onClick={(e) => handleNotify(e, worker)} className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white transition-colors" title={t("table.notifyWorker")}>
                            <Bell className="w-3 h-3" />
                          </button>
                          <button onClick={(e) => handleRenew(e, worker)} className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white transition-colors" title={t("table.renewDocument")}>
                            <RefreshCcw className="w-3 h-3" />
                          </button>
                          {isAdmin && (confirmDeleteId === worker.id ? (
                            <button
                              onClick={(e) => handleDelete(e, worker.id)}
                              disabled={deletingId === worker.id}
                              className="p-1.5 rounded text-xs font-black uppercase transition-colors animate-pulse"
                              style={{ background: "#ef4444", color: "white" }}
                              title={t("table.confirmDelete")}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          ) : (
                            <button onClick={(e) => handleDelete(e, worker.id)} className="p-1.5 rounded bg-white/5 hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-colors" title={t("table.deleteWorker")}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>

      </main>
      </div>{/* /app-content-scroll */}
      </div>{/* /eej-main */}

      <CommandPalette onSelectWorker={(id) => setSelectedWorkerId(id)} />

      <WorkerProfilePanel
        workerId={selectedWorkerId}
        initialEditMode={panelEditMode}
        onClose={() => { setSelectedWorkerId(null); setPanelEditMode(false); }}
        onRenew={(w) => { setSelectedWorkerId(null); setPanelEditMode(false); setActionWorker(w); setRenewOpen(true); }}
        onNotify={(w) => { setSelectedWorkerId(null); setPanelEditMode(false); setActionWorker(w); setNotifyOpen(true); }}
        onOpenCockpit={(id) => { setSelectedWorkerId(null); setCockpitWorkerId(id); }}
      />

      <WorkerCockpit workerId={cockpitWorkerId} onClose={() => setCockpitWorkerId(null)} />

      <CandidateEditPanel workerId={editPanelWorkerId} onClose={() => setEditPanelWorkerId(null)} />

      {actionWorker && (
        <>
          <NotifyDialog worker={actionWorker} isOpen={notifyOpen} onClose={() => setNotifyOpen(false)} />
          <RenewDialog worker={actionWorker} isOpen={renewOpen} onClose={() => setRenewOpen(false)} />
        </>
      )}

      <ComplianceReportModal isOpen={reportOpen} onClose={() => setReportOpen(false)} />
      <BulkUploadModal isOpen={bulkUploadOpen} onClose={() => setBulkUploadOpen(false)} />
      <BulkCsvImportModal isOpen={bulkCsvOpen} onClose={() => setBulkCsvOpen(false)} />
      <AddWorkerModal isOpen={addWorkerOpen} onClose={() => setAddWorkerOpen(false)} />
    </div>
  );
}
