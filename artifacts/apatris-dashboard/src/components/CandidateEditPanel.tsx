import React, { useEffect, useRef, useState } from "react";
import { X, Upload, CheckCircle2, Loader2, Save, FileText, Shield, Award, ChevronDown, MapPin, Clock, TrendingUp } from "lucide-react";
import { useGetWorker } from "@workspace/api-client-react";
import { getGetWorkerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const LIME = "#E9FF70";
const LIME_BG = "rgba(233,255,112,0.10)";
const LIME_BORDER = "rgba(233,255,112,0.28)";

const JOB_ROLES = [
  "TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR",
  "Teacher", "Nurse", "Engineer", "IT Specialist", "Logistics", "Other",
];

const inputCls = "w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none placeholder:text-gray-600 transition-colors";
const inputStyle = { border: `1px solid ${LIME_BORDER}` };
const onFocusLime = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = LIME; };
const onBlurLime  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = LIME_BORDER; };

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1" style={{ background: LIME_BORDER }} />
      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: LIME }}>{label}</span>
      <div className="h-px flex-1" style={{ background: LIME_BORDER }} />
    </div>
  );
}

function DocUploadSlot({
  workerId, docType, icon: Icon, label, hint, iconColor,
}: {
  workerId: string; docType: "passport" | "trc" | "bhp";
  icon: React.ElementType; label: string; hint: string; iconColor: string;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [fileName, setFileName] = useState("");
  const [autoFilled, setAutoFilled] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setState("uploading"); setFileName(file.name); setAutoFilled([]);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}/upload`, { method: "POST", body: form });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Upload failed" })); throw new Error(err.error ?? "Upload failed"); }
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(workerId) });
      setState("done");
      const filled = data.autoFilled as Record<string, string> | undefined;
      const lines: string[] = [];
      if (filled?.trcExpiry) lines.push(`TRC: ${filled.trcExpiry}`);
      if (filled?.bhpExpiry) lines.push(`BHP: ${filled.bhpExpiry}`);
      if (filled?.passportExpiry) lines.push(`Passport: ${filled.passportExpiry}`);
      if (filled?.specialization) lines.push(`${t("table.spec")}: ${filled.specialization}`);
      if (filled?.name) lines.push(`${t("upload.fieldName")}: ${filled.name}`);
      setAutoFilled(lines);
      toast({ title: `✓ ${label}`, description: lines.length > 0 ? `AI: ${lines.join(" · ")}` : `${label} → Airtable`, variant: "success" as any });
      setTimeout(() => setState("idle"), 5000);
    } catch (err) {
      setState("error");
      toast({ title: "Upload Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setTimeout(() => setState("idle"), 4000);
    } finally { if (inputRef.current) inputRef.current.value = ""; }
  };

  const isUploading = state === "uploading";
  const isDone = state === "done";
  const isError = state === "error";

  return (
    <div className="rounded-xl border p-4 transition-all" style={{ background: isDone ? "rgba(34,197,94,0.07)" : isError ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.03)", borderColor: isDone ? "rgba(34,197,94,0.35)" : isError ? "rgba(239,68,68,0.35)" : LIME_BORDER }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: LIME_BG, border: `1px solid ${LIME_BORDER}` }}>
          <Icon className="w-4 h-4" style={{ color: iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{label}</p>
          <p className="text-[10px] font-mono text-gray-500">{hint}</p>
        </div>
        {isDone && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />}
      </div>
      {autoFilled.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg text-[10px] font-mono space-y-0.5" style={{ background: LIME_BG, border: `1px solid ${LIME_BORDER}`, color: LIME }}>
          {autoFilled.map((l) => <p key={l}>✓ {l}</p>)}
        </div>
      )}
      <label
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border-2 border-dashed cursor-pointer transition-all text-xs font-bold uppercase tracking-wide select-none"
        style={isUploading ? { borderColor: "rgba(255,255,255,0.1)", color: "#6b7280", cursor: "not-allowed" } : isDone ? { borderColor: "rgba(34,197,94,0.5)", color: "#4ade80" } : { borderColor: LIME_BORDER, color: LIME }}
        onMouseEnter={(e) => { if (!isUploading && !isDone) (e.currentTarget as HTMLElement).style.background = LIME_BG; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
      >
        <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFile} disabled={isUploading} />
        {isUploading
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("panel.uploading")}</>
          : isDone
            ? <><CheckCircle2 className="w-3.5 h-3.5" /> {fileName.length > 20 ? fileName.slice(0, 18) + "…" : fileName}</>
            : <><Upload className="w-3.5 h-3.5" /> {t("panel.clickToUpload")}</>}
      </label>
    </div>
  );
}

interface CandidateEditPanelProps {
  workerId: string | null;
  onClose: () => void;
}

export function CandidateEditPanel({ workerId, onClose }: CandidateEditPanelProps) {
  const { t } = useTranslation();
  const { data: worker, isLoading } = useGetWorker(workerId || "", { query: { enabled: !!workerId } });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [jobRole, setJobRole] = useState("");
  const [customJobRole, setCustomJobRole] = useState("");
  const [experience, setExperience] = useState("");
  const [qualification, setQualification] = useState("");
  const [siteLocation, setSiteLocation] = useState("");
  const [hourlyNettoRate, setHourlyNettoRate] = useState("");
  const [totalHoursInput, setTotalHoursInput] = useState("");
  const [advancePayment, setAdvancePayment] = useState("");
  const [saving, setSaving] = useState(false);
  // Polish legal fields
  const [badaniaLekExpiry, setBadaniaLekExpiry] = useState("");
  const [oswiadczenieExpiry, setOswiadczenieExpiry] = useState("");
  const [iso9606Process, setIso9606Process] = useState("");
  const [iso9606Material, setIso9606Material] = useState("");
  const [iso9606Thickness, setIso9606Thickness] = useState("");
  const [iso9606Position, setIso9606Position] = useState("");
  const [pesel, setPesel] = useState("");
  const [nip, setNip] = useState("");
  const [zusStatus, setZusStatus] = useState("");
  const [udtCertExpiry, setUdtCertExpiry] = useState("");
  const [visaType, setVisaType] = useState("");
  const [rodoConsentDate, setRodoConsentDate] = useState("");

  const isOpen = !!workerId;

  useEffect(() => {
    if (worker) {
      setJobRole(worker.specialization || "");
      setCustomJobRole("");
      setExperience((worker as any).yearsOfExperience || "");
      setQualification((worker as any).highestQualification || "");
      setSiteLocation((worker as any).siteLocation || "");
      setHourlyNettoRate((worker as any).hourlyNettoRate != null ? String((worker as any).hourlyNettoRate) : "");
      setAdvancePayment((worker as any).advancePayment != null ? String((worker as any).advancePayment) : "");
      setTotalHoursInput((worker as any).totalHours != null ? String((worker as any).totalHours) : "");
      // Polish legal fields
      setBadaniaLekExpiry((worker as any).badaniaLekExpiry || "");
      setOswiadczenieExpiry((worker as any).oswiadczenieExpiry || "");
      setIso9606Process((worker as any).iso9606Process || "");
      setIso9606Material((worker as any).iso9606Material || "");
      setIso9606Thickness((worker as any).iso9606Thickness || "");
      setIso9606Position((worker as any).iso9606Position || "");
      setPesel((worker as any).pesel || "");
      setNip((worker as any).nip || "");
      setZusStatus((worker as any).zusStatus || "");
      setUdtCertExpiry((worker as any).udtCertExpiry || "");
      setVisaType((worker as any).visaType || "");
      setRodoConsentDate((worker as any).rodoConsentDate || "");
    }
  }, [worker]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const effectiveJobRole = jobRole === "__custom__" ? customJobRole : jobRole;

  const totalHrs = parseFloat(totalHoursInput) || (worker as any)?.totalHours || 0;
  const rateNum = parseFloat(hourlyNettoRate) || 0;
  const advNum = parseFloat(advancePayment) || 0;
  const grossPay = totalHrs * rateNum;
  const finalPayout = grossPay - advNum;
  const hasSummary = rateNum > 0 || advNum > 0;

  const handleSave = async () => {
    if (!workerId) return;
    setSaving(true);
    try {
      const payload: Record<string, string | number> = {};
      if (effectiveJobRole) payload.specialization = effectiveJobRole;
      if (experience.trim()) payload.yearsOfExperience = experience.trim();
      if (qualification.trim()) payload.highestQualification = qualification.trim();
      if (siteLocation !== undefined) payload.siteLocation = siteLocation;

      const rateVal = parseFloat(hourlyNettoRate);
      if (!isNaN(rateVal) && rateVal >= 0) payload.hourlyNettoRate = rateVal;

      const advVal = parseFloat(advancePayment);
      if (!isNaN(advVal) && advVal >= 0) payload.advancePayment = advVal;

      const totalHrsNum = parseFloat(totalHoursInput);
      if (!isNaN(totalHrsNum) && totalHrsNum >= 0) payload.totalHours = totalHrsNum;

      // Polish legal fields
      if (badaniaLekExpiry !== undefined) payload.badaniaLekExpiry = badaniaLekExpiry;
      if (oswiadczenieExpiry !== undefined) payload.oswiadczenieExpiry = oswiadczenieExpiry;
      if (iso9606Process !== undefined) payload.iso9606Process = iso9606Process;
      if (iso9606Material !== undefined) payload.iso9606Material = iso9606Material;
      if (iso9606Thickness !== undefined) payload.iso9606Thickness = iso9606Thickness;
      if (iso9606Position !== undefined) payload.iso9606Position = iso9606Position;
      if (pesel !== undefined) payload.pesel = pesel;
      if (nip !== undefined) payload.nip = nip;
      if (zusStatus !== undefined) payload.zusStatus = zusStatus;
      if (udtCertExpiry !== undefined) payload.udtCertExpiry = udtCertExpiry;
      if (visaType !== undefined) payload.visaType = visaType;
      if (rodoConsentDate !== undefined) payload.rodoConsentDate = rodoConsentDate;

      if (Object.keys(payload).length === 0) {
        toast({ title: t("edit.nothingToSave"), description: t("edit.nothingToSaveDesc"), variant: "destructive" });
        return;
      }

      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Save failed" })); throw new Error(err.error ?? "Save failed"); }
      await queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(workerId) });

      const saved: string[] = [];
      if (payload.specialization) saved.push(`${t("edit.jobRole")}: ${payload.specialization}`);
      if (payload.yearsOfExperience) saved.push(`${t("edit.yearsExperience")}: ${payload.yearsOfExperience}`);
      if (payload.highestQualification) saved.push(`${t("edit.highestQualification")}: ${payload.highestQualification}`);
      if (payload.siteLocation !== undefined) saved.push(`${t("table.assignedSite")}: ${payload.siteLocation || "Available"}`);
      if (payload.hourlyNettoRate !== undefined) saved.push(`${t("edit.hourlyNettoRate")}: zł${payload.hourlyNettoRate}/hr`);
      if (payload.advancePayment !== undefined) saved.push(`${t("edit.advancePayment")}: zł${payload.advancePayment}`);
      if (payload.totalHours !== undefined) saved.push(`${t("edit.totalHours")}: ${payload.totalHours}h`);

      toast({ title: "✓ " + t("edit.saveToAirtable"), description: saved.join(" · "), variant: "success" as any });
    } catch (err) {
      toast({ title: "Save Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <>
      <div onClick={onClose} className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} />

      <div className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-900 border-l shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? "translate-x-0" : "translate-x-full"}`} style={{ borderColor: LIME_BORDER }}>

        {/* Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between flex-shrink-0" style={{ background: "rgba(233,255,112,0.04)", borderColor: LIME_BORDER }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: LIME, boxShadow: "0 0 12px rgba(233,255,112,0.25)" }}>
              <span className="text-xs font-black" style={{ color: "#333333", fontFamily: "Arial Black, Arial, sans-serif" }}>EEJ</span>
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-wide uppercase">{t("edit.title")}</h2>
              <p className="text-[10px] font-mono mt-0.5" style={{ color: LIME, opacity: 0.7 }}>{isLoading ? t("settings.loadingProfile") : worker?.name ?? "—"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {isLoading || !worker ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: LIME, borderTopColor: "transparent" }} />
          </div>
        ) : (
          <div className="flex-1 p-6 space-y-6">

            {/* Worker info strip */}
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: LIME_BG, border: `1px solid ${LIME_BORDER}` }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black uppercase flex-shrink-0" style={{ background: LIME, color: "#333333" }}>
                {worker.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-white text-sm truncate">{worker.name}</p>
                <p className="text-xs font-mono text-gray-400 truncate">{worker.email || t("panel.noEmail")}</p>
              </div>
            </div>

            {/* SECTION 1: Document Upload */}
            <div>
              <SectionDivider label={t("edit.pushDocuments")} />
              <p className="text-[10px] text-gray-500 font-mono mb-4">{t("edit.pushDocsNote")}</p>
              <div className="space-y-3">
                <DocUploadSlot workerId={worker.id} docType="passport" icon={FileText} label={t("panel.updatePassport")} hint={t("panel.passportHint")} iconColor={LIME} />
                <DocUploadSlot workerId={worker.id} docType="trc" icon={Award} label={t("panel.updateTrc")} hint={t("panel.trcHint")} iconColor="#4ade80" />
                <DocUploadSlot workerId={worker.id} docType="bhp" icon={Shield} label={t("panel.updateBhp")} hint={t("panel.bhpHint")} iconColor="#fb923c" />
              </div>
            </div>

            {/* SECTION 2: Manual Fields */}
            <div>
              <SectionDivider label={t("edit.manualUpdate")} />
              <div className="space-y-4">

                {/* Job Role */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.jobRole")}</label>
                  <div className="relative">
                    <select value={jobRole} onChange={(e) => setJobRole(e.target.value)} className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono appearance-none focus:outline-none transition-colors pr-8" style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime}>
                      <option value="">{t("edit.selectJobRole")}</option>
                      {JOB_ROLES.filter((r) => r !== "Other").map((r) => <option key={r} value={r}>{r}</option>)}
                      <option value="__custom__">{t("edit.customOther")}</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {jobRole === "__custom__" && (
                    <input type="text" value={customJobRole} onChange={(e) => setCustomJobRole(e.target.value)} placeholder={t("panel.jobTitlePlaceholder")} className={`mt-2 ${inputCls}`} style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime} />
                  )}
                </div>

                {/* Experience */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.yearsExperience")}</label>
                  <input type="text" value={experience} onChange={(e) => setExperience(e.target.value)} placeholder={t("edit.expPlaceholder")} className={inputCls} style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime} />
                </div>

                {/* Qualification */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.highestQualification")}</label>
                  <input type="text" value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder={t("edit.qualPlaceholder")} className={inputCls} style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime} />
                </div>

                {/* Hourly Netto Rate */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.hourlyNettoRate")}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-400">zł</span>
                    <input
                      type="number" min="0" step="0.5" value={hourlyNettoRate}
                      onChange={(e) => setHourlyNettoRate(e.target.value)}
                      placeholder="e.g. 25"
                      className={`${inputCls} pl-8 pr-12`}
                      style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-500">/hr</span>
                  </div>
                  <p className="text-[10px] font-mono text-gray-600 mt-1">{t("edit.hourlyRateNote")}</p>
                </div>
              </div>
            </div>

            {/* SECTION 3: Total Hours */}
            <div>
              <SectionDivider label={t("edit.totalHours")} />
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.hoursWorkedMonth")}</label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="number" min="0" step="0.5" value={totalHoursInput}
                  onChange={(e) => setTotalHoursInput(e.target.value)}
                  placeholder={t("edit.hoursPlaceholder")}
                  className={`${inputCls} pl-9 pr-12`}
                  style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-500">hrs</span>
              </div>
              <p className="text-[10px] font-mono text-gray-600 mt-1.5">{t("edit.hoursNote")}</p>
            </div>

            {/* SECTION 4: Financial Adjustments */}
            <div>
              <SectionDivider label={t("edit.financialAdjustments")} />
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>
                  {t("edit.advancePayment")} <span className="text-gray-500 normal-case font-mono tracking-normal">(Zaliczka)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-400">zł</span>
                  <input
                    type="number" min="0" step="1" value={advancePayment}
                    onChange={(e) => setAdvancePayment(e.target.value)}
                    placeholder={t("edit.advancePlaceholder")}
                    className={`${inputCls} pl-8`}
                    style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime}
                  />
                </div>
                <p className="text-[10px] font-mono text-gray-600 mt-1">{t("edit.advanceNote")}</p>
              </div>
            </div>

            {/* SECTION 5: Monthly Summary */}
            {hasSummary && (
              <div>
                <SectionDivider label={t("edit.monthlySummary")} />
                <div className="rounded-2xl overflow-hidden border" style={{ borderColor: LIME_BORDER }}>
                  <div className="divide-y" style={{ divideBorderColor: LIME_BORDER }}>
                    <div className="flex items-center justify-between px-4 py-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t("edit.grossPay")}</p>
                        <p className="text-[10px] font-mono text-gray-600 mt-0.5">
                          {totalHrs}h × {rateNum > 0 ? `zł${rateNum}` : "—"}
                        </p>
                      </div>
                      <p className="text-base font-black tabular-nums" style={{ color: LIME }}>
                        {rateNum > 0 ? `zł${grossPay.toFixed(2)}` : "—"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t("edit.advanceDeduction")}</p>
                        <p className="text-[10px] font-mono text-gray-600 mt-0.5">Zaliczka</p>
                      </div>
                      <p className="text-base font-black tabular-nums text-red-400">
                        {advNum > 0 ? `− zł${advNum.toFixed(2)}` : "zł0.00"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4" style={{ background: rateNum > 0 ? "#E9FF70" : "rgba(233,255,112,0.10)" }}>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" style={{ color: "#333333" }} />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#333333" }}>{t("edit.finalPayout")}</p>
                        <p className="text-[9px] font-mono mt-0.5" style={{ color: "#555" }}>{t("edit.finalPayoutFormula")}</p>
                      </div>
                    </div>
                    <p className="text-xl font-black tabular-nums" style={{ color: rateNum > 0 ? "#333333" : LIME }}>
                      {rateNum > 0 ? `zł${finalPayout.toFixed(2)}` : t("edit.setRate")}
                    </p>
                  </div>
                </div>
                <p className="text-[9px] font-mono text-gray-600 mt-2 text-center">{t("edit.livePreview")}</p>
              </div>
            )}

            {/* SECTION 6: Polish Legal Compliance */}
            <div>
              <SectionDivider label={t("edit.polishCompliance")} />
              <div className="space-y-4">

                {/* Badania Lekarskie */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.badaniaLek")}</label>
                  <p className="text-[10px] font-mono text-gray-600 mb-1.5">{t("edit.badaniaLekNote")}</p>
                  <input type="date" value={badaniaLekExpiry} onChange={(e) => setBadaniaLekExpiry(e.target.value)} className={inputCls} style={{ ...inputStyle, colorScheme: "dark" }} onFocus={onFocusLime} onBlur={onBlurLime} />
                </div>

                {/* Oświadczenie */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.oswiadczenie")}</label>
                  <p className="text-[10px] font-mono text-gray-600 mb-1.5">{t("edit.oswiadczenieNote")}</p>
                  <input type="date" value={oswiadczenieExpiry} onChange={(e) => setOswiadczenieExpiry(e.target.value)} className={inputCls} style={{ ...inputStyle, colorScheme: "dark" }} onFocus={onFocusLime} onBlur={onBlurLime} />
                </div>

                {/* EN ISO 9606 */}
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "rgba(233,255,112,0.12)", background: "rgba(233,255,112,0.02)" }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: LIME }}>{t("edit.iso9606")}</p>
                  <p className="text-[10px] font-mono text-gray-600">{t("edit.iso9606Note")}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">{t("edit.iso9606Process")}</label>
                      <select value={iso9606Process} onChange={(e) => setIso9606Process(e.target.value)} className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 text-xs font-mono appearance-none focus:outline-none" style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime}>
                        <option value="">—</option>
                        {["MIG/MAG (135/136)", "TIG (141)", "MMA (111)", "FCAW (114)", "SAW (121)", "Laser (52)"].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">{t("edit.iso9606Material")}</label>
                      <input type="text" value={iso9606Material} onChange={(e) => setIso9606Material(e.target.value)} placeholder="e.g. FM1" className={`text-xs ${inputCls}`} style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">{t("edit.iso9606Thickness")}</label>
                      <input type="text" value={iso9606Thickness} onChange={(e) => setIso9606Thickness(e.target.value)} placeholder="e.g. 3-20mm" className={`text-xs ${inputCls}`} style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">{t("edit.iso9606Position")}</label>
                      <select value={iso9606Position} onChange={(e) => setIso9606Position(e.target.value)} className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 text-xs font-mono appearance-none focus:outline-none" style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime}>
                        <option value="">—</option>
                        {["PA (flat)", "PB (h-fillet)", "PC (horizontal)", "PD (overhead)", "PE (overhead butt)", "PF (vertical up)", "PG (vertical down)"].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* PESEL + NIP */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>PESEL</label>
                    <input type="text" value={pesel} onChange={(e) => setPesel(e.target.value)} placeholder="11 digits" className={`text-xs ${inputCls}`} style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime} maxLength={11} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>NIP</label>
                    <input type="text" value={nip} onChange={(e) => setNip(e.target.value)} placeholder="10 digits" className={`text-xs ${inputCls}`} style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime} maxLength={10} />
                  </div>
                </div>

                {/* ZUS Status */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.zusStatus")}</label>
                  <select value={zusStatus} onChange={(e) => setZusStatus(e.target.value)} className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono appearance-none focus:outline-none" style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime}>
                    <option value="">— {t("edit.select")} —</option>
                    <option value="Registered">✓ Registered</option>
                    <option value="Unregistered">✗ Unregistered</option>
                    <option value="Unknown">? Unknown</option>
                  </select>
                </div>

                {/* UDT Cert Expiry */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.udtCert")}</label>
                  <p className="text-[10px] font-mono text-gray-600 mb-1.5">{t("edit.udtCertNote")}</p>
                  <input type="date" value={udtCertExpiry} onChange={(e) => setUdtCertExpiry(e.target.value)} className={inputCls} style={{ ...inputStyle, colorScheme: "dark" }} onFocus={onFocusLime} onBlur={onBlurLime} />
                </div>

                {/* Visa Type */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.visaType")}</label>
                  <select value={visaType} onChange={(e) => setVisaType(e.target.value)} className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono appearance-none focus:outline-none" style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime}>
                    <option value="">— {t("edit.select")} —</option>
                    <option value="EU Citizen">EU Citizen (no restriction)</option>
                    <option value="Karta Pobytu - Temporary">Karta Pobytu — Temporary</option>
                    <option value="Karta Pobytu - Permanent">Karta Pobytu — Permanent</option>
                    <option value="Karta Pobytu - EU Long-term">Karta Pobytu — EU Long-term</option>
                    <option value="Visa D - Work">Visa D — Work</option>
                    <option value="Visa C - Tourist">Visa C — Tourist (⚠ cannot work)</option>
                    <option value="Oświadczenie Only">Oświadczenie Only</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* RODO Consent */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.rodoConsent")}</label>
                  <p className="text-[10px] font-mono text-gray-600 mb-1.5">{t("edit.rodoConsentNote")}</p>
                  <input type="date" value={rodoConsentDate} onChange={(e) => setRodoConsentDate(e.target.value)} className={inputCls} style={{ ...inputStyle, colorScheme: "dark" }} onFocus={onFocusLime} onBlur={onBlurLime} />
                </div>
              </div>
            </div>

            {/* SECTION 7: Client Assignment */}
            <div>
              <SectionDivider label={t("edit.assignToClient")} />
              <p className="text-[10px] text-gray-500 font-mono mb-3">{t("edit.assignNote")}</p>
              <div className="relative">
                <input type="text" value={siteLocation} onChange={(e) => setSiteLocation(e.target.value)} placeholder={t("edit.assignPlaceholder")} className={`${inputCls} transition-colors`} style={inputStyle} onFocus={onFocusLime} onBlur={onBlurLime} />
              </div>
              {siteLocation && siteLocation.trim() !== "" && siteLocation !== "Available" && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold" style={{ background: "#E9FF70", color: "#333333" }}>
                  <MapPin className="w-3.5 h-3.5" />{t("edit.assigningTo")}{siteLocation}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {!isLoading && worker && (
          <div className="px-6 py-4 border-t flex gap-3 flex-shrink-0" style={{ borderColor: LIME_BORDER, background: "rgba(0,0,0,0.2)" }}>
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-bold uppercase tracking-wider text-gray-300 hover:text-white transition-all hover:bg-white/5" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              {t("edit.close")}
            </button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-60" style={{ background: LIME, color: "#333333" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? t("edit.saving") : t("edit.saveToAirtable")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
