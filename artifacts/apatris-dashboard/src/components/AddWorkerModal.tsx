import React, { useState } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetWorkersQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const LIME = "#E9FF70";
const LIME_BORDER = "rgba(233,255,112,0.25)";
const inputCls = "w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none placeholder:text-gray-600 transition-colors";
const inputStyle = { border: `1px solid ${LIME_BORDER}` };

const JOB_ROLES = ["TIG", "MIG", "MAG", "MMA", "FCAW", "FABRICATOR", "Pipe Fitter", "Structural Welder", "Site Supervisor", "Other"];

interface AddWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddWorkerModal({ isOpen, onClose }: AddWorkerModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [siteLocation, setSiteLocation] = useState("");
  const [iban, setIban] = useState("");
  const [trcExpiry, setTrcExpiry] = useState("");
  const [workPermitExpiry, setWorkPermitExpiry] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [hourlyNettoRate, setHourlyNettoRate] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setSpecialization(""); setEmail(""); setPhone("");
    setSiteLocation(""); setIban(""); setTrcExpiry(""); setWorkPermitExpiry("");
    setContractEndDate(""); setHourlyNettoRate("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: t("addWorker.nameRequired"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name: name.trim() };
      if (specialization) payload.specialization = specialization;
      if (email.trim()) payload.email = email.trim();
      if (phone.trim()) payload.phone = phone.trim();
      if (siteLocation.trim()) payload.siteLocation = siteLocation.trim();
      if (trcExpiry) payload.trcExpiry = trcExpiry;
      if (workPermitExpiry) payload.workPermitExpiry = workPermitExpiry;
      if (contractEndDate) payload.contractEndDate = contractEndDate;
      const rate = parseFloat(hourlyNettoRate);
      if (!isNaN(rate) && rate > 0) payload.hourlyNettoRate = rate;
      if (iban.trim()) payload.iban = iban.trim().toUpperCase();

      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/workers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create worker");

      await queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() });
      toast({ title: `✓ ${t("addWorker.created")}`, description: name.trim(), variant: "success" as any });
      handleClose();
    } catch (err) {
      toast({ title: t("addWorker.failed"), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: "#0f1218", borderColor: LIME_BORDER }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: LIME_BORDER, background: "rgba(233,255,112,0.04)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: LIME }}>
              <UserPlus className="w-5 h-5" style={{ color: "#333333" }} />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-wide">{t("addWorker.title")}</h2>
              <p className="text-[10px] font-mono mt-0.5" style={{ color: LIME, opacity: 0.7 }}>EURO EDU JOBS · New Record</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Name — required */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>
              {t("addWorker.name")} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("addWorker.namePlaceholder")}
              className={inputCls}
              style={inputStyle}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {/* Job Role */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.jobRole")}</label>
            <select value={specialization} onChange={(e) => setSpecialization(e.target.value)} className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono appearance-none focus:outline-none" style={inputStyle}>
              <option value="">—</option>
              {JOB_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("settings.email")}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" className={`text-xs ${inputCls}`} style={inputStyle} />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("settings.phone")}</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48…" className={`text-xs ${inputCls}`} style={inputStyle} />
            </div>
          </div>

          {/* Assigned Site */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("table.assignedSite")}</label>
            <input type="text" value={siteLocation} onChange={(e) => setSiteLocation(e.target.value)} placeholder={t("edit.assignPlaceholder")} className={inputCls} style={inputStyle} />
          </div>

          {/* Hourly Rate */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("edit.hourlyNettoRate")}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-400">zł</span>
              <input type="number" min="0" step="0.5" value={hourlyNettoRate} onChange={(e) => setHourlyNettoRate(e.target.value)} placeholder="e.g. 28" className={`${inputCls} pl-8 pr-12`} style={inputStyle} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-500">/hr</span>
            </div>
          </div>

          {/* Bank IBAN */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5" style={{ color: LIME }}>
              🏦 Bank IBAN
            </label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase())}
              placeholder="PL61 1090 1014 0000 0712 1981 2874"
              className={inputCls}
              style={inputStyle}
            />
            <p className="text-[10px] font-mono mt-1 text-gray-600">Auto-populated in payroll ledger IBAN column</p>
          </div>

          {/* Divider */}
          <div className="border-t pt-2" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: LIME, opacity: 0.6 }}>{t("addWorker.documents")}</p>
          </div>

          {/* TRC + Work Permit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("panel.trcExpiry")}</label>
              <input type="date" value={trcExpiry} onChange={(e) => setTrcExpiry(e.target.value)} className={`text-xs ${inputCls}`} style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("panel.workPermitExpiry")}</label>
              <input type="date" value={workPermitExpiry} onChange={(e) => setWorkPermitExpiry(e.target.value)} className={`text-xs ${inputCls}`} style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
          </div>

          {/* Contract End Date */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>{t("panel.contractEndDate")}</label>
            <input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} className={inputCls} style={{ ...inputStyle, colorScheme: "dark" }} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex gap-3" style={{ borderColor: LIME_BORDER, background: "rgba(0,0,0,0.2)" }}>
          <button onClick={handleClose} className="flex-1 py-2.5 rounded-xl border text-sm font-bold uppercase tracking-wider text-gray-300 hover:text-white transition-all hover:bg-white/5" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
            {t("edit.close")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: LIME, color: "#333333" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {saving ? t("edit.saving") : t("addWorker.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
