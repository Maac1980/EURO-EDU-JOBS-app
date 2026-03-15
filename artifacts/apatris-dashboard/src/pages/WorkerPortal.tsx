import React, { useEffect, useState } from "react";
import { Shield, Clock, AlertTriangle, CheckCircle2, Upload, Loader2, ChevronRight, Calendar, Briefcase, MapPin, Clock3, Save } from "lucide-react";

interface Worker {
  id: string;
  name: string;
  specialization: string;
  siteLocation?: string;
  complianceStatus: string;
  daysUntilNextExpiry: number | null;
  trcExpiry?: string | null;
  workPermitExpiry?: string | null;
  bhpStatus?: string | null;
  contractEndDate?: string | null;
  hourlyNettoRate?: number | null;
  totalHours?: number | null;
  advancePayment?: number | null;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysLeft(d: string | null | undefined): { days: number | null; expired: boolean } {
  if (!d) return { days: null, expired: false };
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return { days: diff, expired: diff < 0 };
}

function ExpiryRow({ label, date }: { label: string; date?: string | null }) {
  const { days, expired } = daysLeft(date);
  const color = expired ? "#EF4444" : days !== null && days < 30 ? "#F59E0B" : days !== null && days < 60 ? "#FBBF24" : "#22C55E";

  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <span className="text-sm text-gray-400 font-medium">{label}</span>
      <div className="text-right">
        <p className="text-sm font-mono font-bold" style={{ color: date ? color : "#4B5563" }}>{fmtDate(date)}</p>
        {date && days !== null && (
          <p className="text-[10px] font-mono" style={{ color }}>
            {expired ? `${Math.abs(days)}d expired` : `${days}d remaining`}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    compliant:       { label: "Compliant",       color: "#22C55E", bg: "rgba(34,197,94,0.12)"  },
    warning:         { label: "Warning",          color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
    critical:        { label: "Critical",         color: "#EF4444", bg: "rgba(239,68,68,0.12)"  },
    "non-compliant": { label: "Non-Compliant",    color: "#EF4444", bg: "rgba(239,68,68,0.12)"  },
  };
  const c = cfg[status] ?? { label: status, color: "#9CA3AF", bg: "rgba(156,163,175,0.12)" };
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest" style={{ color: c.color, background: c.bg }}>
      {status === "compliant" ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {c.label}
    </span>
  );
}

export default function WorkerPortal() {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const token = new URLSearchParams(window.location.search).get("token");
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => {
    if (!token) { setError("No portal link token found. Please use the link provided by your coordinator."); setLoading(false); return; }
    fetch(`${base}/api/portal/me?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setWorker(data.worker);
        setHours(String(data.worker.totalHours ?? ""));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const saveHours = async () => {
    if (!token || hours === "") return;
    const parsed = parseFloat(hours);
    if (isNaN(parsed) || parsed < 0) { setSaveMsg("Please enter a valid number of hours."); return; }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`${base}/api/portal/hours?token=${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalHours: parsed }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSaveMsg("Hours updated successfully!");
      if (worker) setWorker({ ...worker, totalHours: parsed });
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const grossPay = worker?.hourlyNettoRate && worker?.totalHours
    ? (worker.hourlyNettoRate * worker.totalHours).toFixed(2)
    : null;
  const finalPay = grossPay && worker?.advancePayment
    ? (parseFloat(grossPay) - (worker.advancePayment ?? 0)).toFixed(2)
    : grossPay;

  return (
    <div className="min-h-screen bg-slate-900 text-white px-4 py-10 flex flex-col items-center">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] blur-[160px] rounded-full" style={{ background: "rgba(233,255,112,0.04)" }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] blur-[140px] rounded-full" style={{ background: "rgba(233,255,112,0.03)" }} />
      </div>

      <div className="w-full max-w-lg z-10 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-4 mb-2">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "#E9FF70", boxShadow: "0 0 0 2px rgba(233,255,112,0.3), 0 0 24px rgba(233,255,112,0.15)" }}>
            <span className="text-lg font-black tracking-tighter" style={{ color: "#333333", fontFamily: "Arial Black, Arial, sans-serif" }}>EEJ</span>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wide text-white uppercase">Worker Portal</h1>
            <p className="text-xs font-mono" style={{ color: "#E9FF70", opacity: 0.7 }}>EURO EDU JOBS · My Profile</p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#E9FF70" }} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl p-6 text-center border" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)" }}>
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-red-400" />
            <p className="text-red-300 font-semibold text-sm">{error}</p>
            <p className="text-gray-500 text-xs mt-2">Contact your coordinator at Euro Edu Jobs.</p>
          </div>
        )}

        {/* Profile */}
        {worker && !loading && (
          <>
            {/* Identity card */}
            <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "rgba(233,255,112,0.2)", background: "#1a1f2e" }}>
              <div className="px-5 py-4 border-b flex items-start justify-between" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(233,255,112,0.04)" }}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Worker</p>
                  <h2 className="text-2xl font-black text-white">{worker.name}</h2>
                </div>
                <StatusBadge status={worker.complianceStatus} />
              </div>
              <div className="px-5 py-4 grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-500">Role</p>
                    <p className="text-sm font-semibold text-white">{worker.specialization || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-500">Site</p>
                    <p className="text-sm font-semibold text-white">{worker.siteLocation || "—"}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Compliance documents */}
            <div className="rounded-2xl border" style={{ borderColor: "rgba(255,255,255,0.08)", background: "#1a1f2e" }}>
              <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <Shield className="w-4 h-4" style={{ color: "#E9FF70" }} />
                <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#E9FF70" }}>Document Expiry</p>
              </div>
              <div className="px-5 py-2">
                <ExpiryRow label="TRC (Temporary Residence Card)" date={worker.trcExpiry} />
                <ExpiryRow label="Work Permit / Passport" date={worker.workPermitExpiry} />
                <ExpiryRow label="BHP (Safety Certificate)" date={worker.bhpStatus} />
                <ExpiryRow label="Contract End Date" date={worker.contractEndDate} />
              </div>
            </div>

            {/* Hours submission */}
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(233,255,112,0.2)", background: "#1a1f2e" }}>
              <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(233,255,112,0.04)" }}>
                <Clock3 className="w-4 h-4" style={{ color: "#E9FF70" }} />
                <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#E9FF70" }}>Report My Hours</p>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-2">Total Hours Worked This Month</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl text-white text-sm font-mono font-bold bg-slate-800 border outline-none focus:ring-2 transition-all"
                      style={{ borderColor: "rgba(233,255,112,0.3)" }}
                      placeholder="e.g. 168"
                    />
                    <button
                      onClick={saveHours}
                      disabled={saving || hours === ""}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black uppercase tracking-wide transition-all disabled:opacity-50"
                      style={{ background: "#E9FF70", color: "#333333" }}
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save
                    </button>
                  </div>
                  {saveMsg && (
                    <p className={`text-xs mt-2 font-semibold ${saveMsg.includes("success") ? "text-green-400" : "text-red-400"}`}>
                      {saveMsg}
                    </p>
                  )}
                </div>

                {/* Pay summary */}
                {worker.hourlyNettoRate && (
                  <div className="rounded-xl p-4 space-y-2 border" style={{ background: "rgba(233,255,112,0.04)", borderColor: "rgba(233,255,112,0.1)" }}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Estimated Payout</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Rate</span>
                      <span className="font-mono font-bold text-white">{worker.hourlyNettoRate} zł/hr</span>
                    </div>
                    {hours && !isNaN(parseFloat(hours)) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Gross ({hours} hrs)</span>
                        <span className="font-mono font-bold text-white">{(worker.hourlyNettoRate * parseFloat(hours)).toFixed(2)} zł</span>
                      </div>
                    )}
                    {worker.advancePayment && worker.advancePayment > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Advance paid</span>
                        <span className="font-mono font-bold text-red-400">− {worker.advancePayment} zł</span>
                      </div>
                    )}
                    {hours && !isNaN(parseFloat(hours)) && (
                      <div className="flex justify-between text-sm pt-2 border-t mt-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                        <span className="font-bold text-white">Final Payout</span>
                        <span className="font-mono font-black text-lg" style={{ color: "#E9FF70" }}>
                          {(worker.hourlyNettoRate * parseFloat(hours) - (worker.advancePayment ?? 0)).toFixed(2)} zł
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer note */}
            <p className="text-center text-xs text-gray-600 pb-4">
              This is your personal secure portal. Contact your EEJ coordinator for document updates.<br />
              <a href="https://edu-jobs.eu" className="underline hover:text-gray-400 transition-colors">edu-jobs.eu</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
