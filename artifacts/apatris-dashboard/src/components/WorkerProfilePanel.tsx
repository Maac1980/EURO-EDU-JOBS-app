import React, { useEffect, useRef, useState } from "react";
import { X, Mail, Phone, FileText, Download, Upload, CheckCircle2, Loader2, Pencil, Save, XCircle, MapPin, Link2, Copy, Check, ClipboardList, MessageCircle, QrCode, FileEdit } from "lucide-react";
import { calcComplianceScore, scoreColor, scoreBg } from "@/lib/complianceScore";
import { PIPInspectionModal } from "./PIPInspectionModal";
import { WorkerQRModal } from "./WorkerQRModal";
import { format, parseISO } from "date-fns";
import { useGetWorker, getGetWorkerQueryKey, getGetWorkersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "./ui/StatusBadge";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

const SPEC_OPTIONS = ["TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR"];

interface WorkerProfilePanelProps {
  workerId: string | null;
  initialEditMode?: boolean;
  onClose: () => void;
  onRenew: (worker: any) => void;
  onNotify: (worker: any) => void;
}

function DocRow({ label, date }: { label: string; date?: string | null }) {
  if (!date)
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
        <span className="text-sm font-medium text-gray-300">{label}</span>
        <span className="text-sm font-mono text-gray-500">N/A</span>
      </div>
    );

  const d = parseISO(date);
  const isExpired = d < new Date();
  const isWarning = !isExpired && d < new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg bg-slate-800 border ${
        isExpired
          ? "border-yellow-400/40"
          : isWarning
            ? "border-yellow-500/40"
            : "border-slate-700"
      }`}
    >
      <span className="text-sm font-medium text-gray-300">{label}</span>
      <span
        className={`text-sm font-mono font-semibold ${
          isExpired ? "text-yellow-300" : isWarning ? "text-yellow-400" : "text-green-400"
        }`}
      >
        {format(d, "MMM d, yyyy")}
      </span>
    </div>
  );
}

function AttachmentCard({ title, filename, url }: { title: string; filename: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative p-4 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-all cursor-pointer group flex flex-col items-center justify-center text-center gap-2"
      style={{ borderColor: "rgba(233,255,112,0)" }}
      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(233,255,112,0.25)"}
      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(233,255,112,0)"}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform" style={{ background: "rgba(233,255,112,0.1)", color: "#E9FF70" }}>
        <FileText className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-xs text-gray-400 font-mono truncate w-28">{filename}</p>
      </div>
      <Download className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2" />
    </a>
  );
}

function UploadButton({ workerId, docType, label, uploadingText, doneText }: {
  workerId: string;
  docType: "passport" | "contract" | "trc" | "bhp";
  label: string;
  uploadingText: string;
  doneText: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setDone(false);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(workerId) });
      setDone(true);

      const filled = data.autoFilled as Record<string, string> | undefined;
      const filledLines: string[] = [];
      if (filled?.name) filledLines.push(`Name: ${filled.name}`);
      if (filled?.dateOfBirth) filledLines.push(`DOB: ${filled.dateOfBirth}`);
      if (filled?.passportExpiry) filledLines.push(`Expires: ${filled.passportExpiry}`);
      if (filled?.trcExpiry) filledLines.push(`TRC: ${filled.trcExpiry}`);
      if (filled?.bhpExpiry) filledLines.push(`BHP: ${filled.bhpExpiry}`);
      if (filled?.specialization) filledLines.push(`${t("table.spec")}: ${filled.specialization}`);
      if (filled?.contractEndDate) filledLines.push(`${t("panel.contractEndDate")}: ${filled.contractEndDate}`);
      if (filled?.nationality) filledLines.push(`Nationality: ${filled.nationality}`);

      const description = filledLines.length > 0
        ? `AI: ${filledLines.join(" · ")}`
        : `${label} → Airtable`;

      toast({ title: data.scanned ? "✓ " + label : "✓ " + label, description, variant: "success" as any });
      setTimeout(() => setDone(false), 4000);
    } catch (err) {
      toast({ title: "Upload Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <label className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none font-semibold text-sm ${
      done
        ? "bg-green-500/15 border-green-500/60 text-green-400"
        : uploading
          ? "cursor-not-allowed opacity-50 bg-slate-800 border-slate-600 text-gray-400"
          : "bg-slate-800 border-slate-600 text-white hover:text-white"
    }`}>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFile} disabled={uploading} />
      {uploading
        ? <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
        : done
          ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          : <Upload className="w-5 h-5 flex-shrink-0" />
      }
      <span>
        {uploading ? uploadingText : done ? doneText : label}
      </span>
    </label>
  );
}

export function WorkerProfilePanel({
  workerId,
  initialEditMode = false,
  onClose,
  onRenew,
  onNotify,
}: WorkerProfilePanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: worker, isLoading } = useGetWorker(workerId || "", {
    query: { enabled: !!workerId } as any,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editSpec, setEditSpec] = useState("");
  const [editProfession, setEditProfession] = useState("");
  const [editSiteLocation, setEditSiteLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isPipOpen, setIsPipOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteUpdatedAt, setNoteUpdatedAt] = useState<string | null>(null);
  const [noteUpdatedBy, setNoteUpdatedBy] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);

  const handleCopyPortalLink = async () => {
    if (!workerId) return;
    setCopyingLink(true);
    try {
      const token = sessionStorage.getItem("eej_token");
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/portal/token/${workerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const portalUrl = `${window.location.origin}${base}/portal?token=${data.token}`;
      await navigator.clipboard.writeText(portalUrl);
      setLinkCopied(true);
      toast({ title: "✓ Portal link copied!", description: "Share this link with the worker. It expires in 30 days.", variant: "success" as any });
      setTimeout(() => setLinkCopied(false), 3000);
    } catch (err) {
      toast({ title: "Failed to copy link", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setCopyingLink(false);
    }
  };

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workerId) {
      setIsEditing(initialEditMode);
    }
  }, [workerId, initialEditMode]);

  useEffect(() => {
    if (worker && isEditing) {
      setEditSpec(worker.specialization || "");
      setEditProfession(worker.specialization || "");
      setEditSiteLocation((worker as any).siteLocation || "");
    }
  }, [worker, isEditing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing) setIsEditing(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, isEditing]);

  // Load notes when worker changes
  useEffect(() => {
    if (!workerId) { setNoteContent(""); setNoteUpdatedAt(null); setNoteUpdatedBy(null); return; }
    const token = sessionStorage.getItem("eej_token");
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/workers/${workerId}/notes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        setNoteContent(d.content ?? "");
        setNoteUpdatedAt(d.updatedAt ?? null);
        setNoteUpdatedBy(d.updatedBy ?? null);
      })
      .catch(() => {});
  }, [workerId]);

  const handleSaveNote = async () => {
    if (!workerId) return;
    setNoteSaving(true);
    const token = sessionStorage.getItem("eej_token");
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    try {
      const res = await fetch(`${base}/api/workers/${workerId}/notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteContent }),
      });
      const d = await res.json();
      if (d.note) { setNoteUpdatedAt(d.note.updatedAt); setNoteUpdatedBy(d.note.updatedBy); }
    } catch { /* silent */ }
    setNoteSaving(false);
  };

  const handleSave = async () => {
    if (!workerId) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (editSpec || editProfession) payload.specialization = editSpec || editProfession;
      payload.siteLocation = editSiteLocation.trim();
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(err.error ?? "Save failed");
      }
      await queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(workerId) });
      await queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() });
      toast({ title: "✓ " + t("panel.saveChanges"), description: payload.specialization || payload.siteLocation, variant: "success" as any });
      setIsEditing(false);
    } catch (err) {
      toast({ title: "Save Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isOpen = !!workerId;

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      <div
        ref={panelRef}
        className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-900 border-l border-white/10 shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {isLoading || !worker ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#E9FF70", borderTopColor: "transparent" }} />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-white/10 relative overflow-hidden bg-slate-800/50">
              <div className="absolute top-0 right-0 p-4 flex items-center gap-2">
                {!isEditing && (
                  <>
                    <button
                      onClick={() => setShowQR(true)}
                      className="p-2 rounded-full transition-colors"
                      style={{ background: "rgba(233,255,112,0.1)", border: "1px solid rgba(233,255,112,0.3)" }}
                      title="Show worker QR code"
                    >
                      <QrCode className="w-4 h-4" style={{ color: "#E9FF70" }} />
                    </button>
                    <button
                      onClick={handleCopyPortalLink}
                      disabled={copyingLink}
                      className="p-2 rounded-full transition-colors disabled:opacity-50"
                      style={{ background: linkCopied ? "rgba(34,197,94,0.15)" : "rgba(233,255,112,0.1)", border: linkCopied ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(233,255,112,0.3)" }}
                      title="Copy worker's self-service portal link"
                    >
                      {copyingLink ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#E9FF70" }} /> : linkCopied ? <Check className="w-4 h-4 text-green-400" /> : <Link2 className="w-4 h-4" style={{ color: "#E9FF70" }} />}
                    </button>
                    <button
                      onClick={() => {
                        setEditSpec(worker.specialization || "");
                        setEditProfession(worker.specialization || "");
                        setEditSiteLocation((worker as any).siteLocation || "");
                        setIsEditing(true);
                      }}
                      className="p-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-full transition-colors"
                      title={t("panel.editWorkerDetails")}
                    >
                      <Pencil className="w-4 h-4 text-amber-400" />
                    </button>
                  </>
                )}
                <button
                  onClick={onClose}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-300" />
                </button>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <div className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold uppercase" style={{ background: "rgba(233,255,112,0.12)", border: "1px solid rgba(233,255,112,0.25)", color: "#E9FF70" }}>
                  {worker.name.split(" ").map((n: string) => n[0]).join("")}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">{worker.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/10 text-gray-300 border border-white/10">
                      {worker.specialization}
                    </span>
                    <StatusBadge status={worker.complianceStatus} />
                    {(() => {
                      const score = calcComplianceScore(worker);
                      const color = scoreColor(score);
                      const bg = scoreBg(score);
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black" style={{ background: bg, color, border: `1px solid ${color}40` }}>
                          {score}/100
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 flex-1">

              {/* EDIT MODE PANEL */}
              {isEditing && (
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/30 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-2">
                    <Pencil className="w-3.5 h-3.5" />
                    {t("panel.editWorkerDetails")}
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                        {t("panel.jobRole")}
                      </label>
                      <select
                        value={editSpec}
                        onChange={(e) => setEditSpec(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-amber-500/60"
                      >
                        <option value="">{t("panel.selectSpec")}</option>
                        {SPEC_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                        {t("panel.jobTitleFreeText")}
                      </label>
                      <input
                        type="text"
                        value={editProfession}
                        onChange={(e) => setEditProfession(e.target.value)}
                        placeholder={t("panel.jobTitlePlaceholder")}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-amber-500/60 placeholder:text-gray-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5" style={{ color: "#E9FF70" }}>
                        <MapPin className="w-3 h-3" />
                        {t("panel.assignedClient")}
                      </label>
                      <input
                        type="text"
                        value={editSiteLocation}
                        onChange={(e) => setEditSiteLocation(e.target.value)}
                        placeholder={t("panel.assignedClientPlaceholder")}
                        className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none placeholder:text-gray-600 transition-colors"
                        style={{ border: "1px solid rgba(233,255,112,0.3)" }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "#E9FF70"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(233,255,112,0.15)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(233,255,112,0.3)"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                      {editSiteLocation.trim() && editSiteLocation.trim() !== "Available" && (
                        <p className="text-[10px] font-mono mt-1.5" style={{ color: "#E9FF70" }}>
                          {t("panel.willSaveAs")}{editSiteLocation.trim()}
                        </p>
                      )}
                      {(!editSiteLocation.trim() || editSiteLocation.trim() === "Available") && (
                        <p className="text-[10px] font-mono mt-1.5 text-gray-600">
                          {t("panel.leaveBlank")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setIsEditing(false)}
                      disabled={saving}
                      className="flex-1 py-2 border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {t("panel.cancel")}
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(217,119,6,0.3)]"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {saving ? t("panel.saving") : t("panel.saveChanges")}
                    </button>
                  </div>
                </div>
              )}

              {/* Contact */}
              <div className="grid grid-cols-1 gap-3 p-4 rounded-xl bg-slate-800 border border-slate-700">
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: "#E9FF70" }} />
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t("panel.site")}</span>
                    {(worker as any).siteLocation && (worker as any).siteLocation !== "Available" ? (
                      <span className="font-mono text-sm font-semibold truncate" style={{ color: "#E9FF70" }}>
                        {(worker as any).siteLocation}
                      </span>
                    ) : (
                      <span className="font-mono text-sm text-gray-500 italic">{t("panel.availableBench")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 flex-shrink-0" style={{ color: "#E9FF70" }} />
                  <span className="text-gray-300 font-mono">
                    {worker.email || t("panel.noEmail")}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 flex-shrink-0" style={{ color: "#E9FF70" }} />
                  <span className="text-gray-300 font-mono flex-1">
                    {worker.phone || t("panel.noPhone")}
                  </span>
                  {worker.phone && (
                    <a
                      href={`https://wa.me/${worker.phone.replace(/[\s\-().+]/g, "").replace(/^00/, "").replace(/^0/, "48")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open WhatsApp chat"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all hover:opacity-90 flex-shrink-0"
                      style={{ background: "#25D366", color: "white" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MessageCircle className="w-3 h-3" />
                      WA
                    </a>
                  )}
                </div>
              </div>

              {/* Compliance Timeline */}
              <div>
                <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">
                  {t("panel.complianceTimeline")}
                </h3>
                <div className="space-y-2">
                  <DocRow label={t("panel.trcExpiry")} date={worker.trcExpiry} />
                  <DocRow label={t("panel.workPermitExpiry")} date={worker.workPermitExpiry} />
                  <DocRow label={t("panel.contractEndDate")} date={worker.contractEndDate} />
                  {(worker as any).badaniaLekExpiry && <DocRow label={t("panel.badaniaLek")} date={(worker as any).badaniaLekExpiry} />}
                  {(worker as any).oswiadczenieExpiry && <DocRow label={t("panel.oswiadczenie")} date={(worker as any).oswiadczenieExpiry} />}
                  {(worker as any).udtCertExpiry && <DocRow label={t("panel.udtCert")} date={(worker as any).udtCertExpiry} />}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
                    <span className="text-sm font-medium text-gray-300">{t("panel.bhpStatus")}</span>
                    <span className={`text-sm font-mono font-semibold ${
                      worker.bhpStatus === "Active" ? "text-green-400" : "text-yellow-300"
                    }`}>
                      {worker.bhpStatus || t("status.unknown")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Polish Legal Info */}
              {((worker as any).pesel || (worker as any).nip || (worker as any).zusStatus || (worker as any).visaType || (worker as any).rodoConsentDate || (worker as any).iso9606Process) && (
                <div>
                  <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">{t("panel.polishLegal")}</h3>
                  <div className="space-y-2">
                    {(worker as any).pesel && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
                        <span className="text-sm font-medium text-gray-300">PESEL</span>
                        <span className="text-sm font-mono text-white">{(worker as any).pesel}</span>
                      </div>
                    )}
                    {(worker as any).nip && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
                        <span className="text-sm font-medium text-gray-300">NIP</span>
                        <span className="text-sm font-mono text-white">{(worker as any).nip}</span>
                      </div>
                    )}
                    {(worker as any).zusStatus && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
                        <span className="text-sm font-medium text-gray-300">{t("panel.zusStatus")}</span>
                        <span className={`text-sm font-mono font-bold ${(worker as any).zusStatus === "Registered" ? "text-green-400" : (worker as any).zusStatus === "Unregistered" ? "text-red-400" : "text-yellow-400"}`}>{(worker as any).zusStatus}</span>
                      </div>
                    )}
                    {(worker as any).visaType && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
                        <span className="text-sm font-medium text-gray-300">{t("panel.visaType")}</span>
                        <span className={`text-sm font-mono ${(worker as any).visaType?.includes("Tourist") ? "text-red-400 font-bold" : "text-white"}`}>{(worker as any).visaType}</span>
                      </div>
                    )}
                    {(worker as any).rodoConsentDate && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
                        <span className="text-sm font-medium text-gray-300">{t("panel.rodoConsent")}</span>
                        <span className="text-sm font-mono text-green-400">{(worker as any).rodoConsentDate}</span>
                      </div>
                    )}
                    {(worker as any).iso9606Process && (
                      <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">EN ISO 9606</span>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                          <span className="text-xs text-gray-400">Process:</span><span className="text-xs font-mono text-white">{(worker as any).iso9606Process}</span>
                          {(worker as any).iso9606Material && <><span className="text-xs text-gray-400">Material:</span><span className="text-xs font-mono text-white">{(worker as any).iso9606Material}</span></>}
                          {(worker as any).iso9606Thickness && <><span className="text-xs text-gray-400">Thickness:</span><span className="text-xs font-mono text-white">{(worker as any).iso9606Thickness}</span></>}
                          {(worker as any).iso9606Position && <><span className="text-xs text-gray-400">Position:</span><span className="text-xs font-mono text-white">{(worker as any).iso9606Position}</span></>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Document Vault */}
              <div>
                <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">
                  {t("panel.documentVault")}
                </h3>

                {(worker.passportAttachments?.length > 0 || worker.contractAttachments?.length > 0) && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {worker.passportAttachments?.map((att: any) => (
                      <AttachmentCard key={att.id} title={t("panel.passport")} filename={att.filename} url={att.url} />
                    ))}
                    {worker.contractAttachments?.map((att: any) => (
                      <AttachmentCard key={att.id} title={t("panel.contract")} filename={att.filename} url={att.url} />
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">{t("panel.pushDocToAirtable")}</p>
                  <UploadButton workerId={worker.id} docType="passport" label={t("panel.updatePassport")} uploadingText={t("panel.uploading")} doneText={t("panel.updatePassport")} />
                  <UploadButton workerId={worker.id} docType="trc" label={t("panel.updateTrc")} uploadingText={t("panel.uploading")} doneText={t("panel.updateTrc")} />
                  <UploadButton workerId={worker.id} docType="bhp" label={t("panel.updateBhp")} uploadingText={t("panel.uploading")} doneText={t("panel.updateBhp")} />
                  <UploadButton workerId={worker.id} docType="contract" label={t("panel.contract")} uploadingText={t("panel.uploading")} doneText={t("panel.contract")} />
                  <p className="text-xs text-gray-600 text-center">
                    {t("panel.aiScanNote")}
                  </p>
                </div>
              </div>

              {/* Coordinator Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase flex items-center gap-1.5">
                    <FileEdit className="w-3.5 h-3.5" />
                    Notatki Koordynatora
                  </h3>
                  {noteUpdatedAt && (
                    <span className="text-[9px] font-mono text-white/30">
                      {noteUpdatedBy} · {new Date(noteUpdatedAt).toLocaleDateString("pl-PL")}
                    </span>
                  )}
                </div>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Wewnętrzne notatki o pracowniku... (widoczne tylko dla koordynatorów)"
                  rows={3}
                  maxLength={4000}
                  className="w-full rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder-white/20 resize-none focus:outline-none transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(233,255,112,0.35)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[9px] font-mono text-white/20">{noteContent.length}/4000</span>
                  <button
                    onClick={handleSaveNote}
                    disabled={noteSaving}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                    style={{ background: "rgba(233,255,112,0.12)", color: "#E9FF70", border: "1px solid rgba(233,255,112,0.25)" }}
                  >
                    {noteSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    {noteSaving ? "Zapisywanie..." : "Zapisz"}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="p-5 border-t border-white/10 bg-slate-800/50 space-y-2">
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 rounded-xl font-bold uppercase tracking-wider text-sm transition-all"
                  onClick={() => onNotify(worker)}
                >
                  {t("panel.notify")}
                </button>
                <button
                  className="flex-1 py-2.5 text-white rounded-xl font-bold uppercase tracking-wider text-sm transition-all hover:opacity-90"
                  style={{ background: "#E9FF70", color: "#333333" }}
                  onClick={() => onRenew(worker)}
                >
                  {t("panel.updateStatus")}
                </button>
              </div>
              <button
                className="w-full py-2.5 flex items-center justify-center gap-2 rounded-xl border font-bold uppercase tracking-wider text-xs transition-all hover:opacity-90"
                style={{ borderColor: "rgba(233,255,112,0.4)", color: "#E9FF70", background: "rgba(233,255,112,0.06)" }}
                onClick={() => setIsPipOpen(true)}
              >
                <ClipboardList className="w-4 h-4" />
                {t("panel.pipMode")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PIP Inspection Modal */}
      {worker && <PIPInspectionModal worker={worker} isOpen={isPipOpen} onClose={() => setIsPipOpen(false)} />}
      <WorkerQRModal worker={worker} isOpen={showQR} onClose={() => setShowQR(false)} />
    </>
  );
}
