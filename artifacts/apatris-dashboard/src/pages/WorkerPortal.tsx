import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Loader2, Clock3, CheckCircle2, Calendar, Briefcase, MapPin, Plus } from "lucide-react";

interface Profile {
  id: string;
  name: string;
  specialization: string;
  siteLocation?: string | null;
}

interface DailyEntry {
  date: string;
  hours: number;
  submittedAt: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function totalThisMonth(log: DailyEntry[]): number {
  const ym = todayISO().slice(0, 7);
  return log.filter((e) => e.date.startsWith(ym)).reduce((s, e) => s + e.hours, 0);
}

export default function WorkerPortal() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [log, setLog] = useState<DailyEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(todayISO());
  const [hours, setHours] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const token = new URLSearchParams(window.location.search).get("token");
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const loadProfile = useCallback(async () => {
    if (!token) { setError("No access link found. Please use the link sent by your coordinator."); setLoading(false); return; }
    try {
      const res = await fetch(`${base}/api/portal/me?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProfile(data.profile);
      setLog(data.dailyLog ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, [token, base]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Pre-fill hours input when date changes (show existing entry if any)
  useEffect(() => {
    const existing = log.find((e) => e.date === date);
    setHours(existing ? String(existing.hours) : "");
    setSaveMsg(null);
  }, [date, log]);

  const submit = async () => {
    if (!token || !hours) return;
    const h = parseFloat(hours);
    if (isNaN(h) || h < 0 || h > 24) {
      setSaveMsg({ text: "Enter a valid number of hours (0–24).", ok: false });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`${base}/api/portal/hours?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, hours: h }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLog(data.log ?? []);
      setSaveMsg({ text: `✓ ${h}h recorded for ${fmtDate(date)}`, ok: true });
    } catch (e) {
      setSaveMsg({ text: e instanceof Error ? e.message : "Failed to save.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const monthTotal = totalThisMonth(log);
  const recentLog = [...log].reverse().slice(0, 30);
  const existingEntry = log.find((e) => e.date === date);

  return (
    <div className="min-h-screen bg-slate-900 text-white px-4 py-10 flex flex-col items-center">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] blur-[160px] rounded-full" style={{ background: "rgba(233,255,112,0.04)" }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] blur-[140px] rounded-full" style={{ background: "rgba(233,255,112,0.03)" }} />
      </div>

      <div className="w-full max-w-sm z-10 space-y-5">

        {/* EEJ Logo header */}
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "#E9FF70", boxShadow: "0 0 0 2px rgba(233,255,112,0.3), 0 0 20px rgba(233,255,112,0.15)" }}>
            <span className="text-sm font-black tracking-tighter" style={{ color: "#333333", fontFamily: "Arial Black, Arial, sans-serif" }}>EEJ</span>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide text-white uppercase">Hours Portal</h1>
            <p className="text-[10px] font-mono" style={{ color: "#E9FF70", opacity: 0.7 }}>EURO EDU JOBS</p>
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

        {profile && !loading && (
          <>
            {/* Identity card — minimal, no company data */}
            <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "rgba(233,255,112,0.18)", background: "#1a1f2e" }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(233,255,112,0.04)" }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "#E9FF70", opacity: 0.6 }}>Welcome</p>
                <h2 className="text-2xl font-black text-white">{profile.name}</h2>
              </div>
              <div className="px-5 py-4 flex flex-col gap-3">
                {profile.specialization && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-gray-600 flex-shrink-0" />
                    <span className="text-sm text-gray-300">{profile.specialization}</span>
                  </div>
                )}
                {profile.siteLocation && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-600 flex-shrink-0" />
                    <span className="text-sm text-gray-300">{profile.siteLocation}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Month summary pill */}
            <div className="rounded-2xl px-5 py-4 flex items-center justify-between border" style={{ background: "rgba(233,255,112,0.05)", borderColor: "rgba(233,255,112,0.15)" }}>
              <div className="flex items-center gap-2">
                <Clock3 className="w-4 h-4" style={{ color: "#E9FF70" }} />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">This month</span>
              </div>
              <span className="text-2xl font-black" style={{ color: "#E9FF70" }}>
                {monthTotal.toFixed(1)} <span className="text-sm font-bold text-gray-500">hrs</span>
              </span>
            </div>

            {/* Daily hours submission */}
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(233,255,112,0.2)", background: "#1a1f2e" }}>
              <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(233,255,112,0.04)" }}>
                <Calendar className="w-4 h-4" style={{ color: "#E9FF70" }} />
                <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#E9FF70" }}>
                  {existingEntry ? "Update today's hours" : "Report today's hours"}
                </p>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Date picker */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Date</label>
                  <input
                    type="date"
                    value={date}
                    max={todayISO()}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl text-white text-sm font-mono bg-slate-800 border outline-none focus:ring-1 transition-all"
                    style={{ borderColor: "rgba(255,255,255,0.1)", colorScheme: "dark" }}
                  />
                </div>

                {/* Hours input + submit */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Hours worked</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={hours}
                      onChange={(e) => { setHours(e.target.value); setSaveMsg(null); }}
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                      className="flex-1 px-4 py-3 rounded-xl text-white text-lg font-black font-mono bg-slate-800 border outline-none transition-all"
                      style={{ borderColor: "rgba(233,255,112,0.3)" }}
                      placeholder="8"
                    />
                    <button
                      onClick={submit}
                      disabled={saving || !hours}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black uppercase tracking-wide transition-all disabled:opacity-40"
                      style={{ background: "#E9FF70", color: "#333333" }}
                    >
                      {saving
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : existingEntry ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      {existingEntry ? "Update" : "Add"}
                    </button>
                  </div>
                  {existingEntry && !saveMsg && (
                    <p className="text-[10px] text-gray-600 mt-1.5 font-mono">
                      Previously logged: {existingEntry.hours}h for this date — submitting will overwrite it.
                    </p>
                  )}
                  {saveMsg && (
                    <p className={`text-xs mt-2 font-semibold ${saveMsg.ok ? "text-green-400" : "text-red-400"}`}>
                      {saveMsg.text}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Recent submissions log */}
            {recentLog.length > 0 && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.07)", background: "#1a1f2e" }}>
                <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">My recent entries</p>
                </div>
                <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  {recentLog.map((e) => (
                    <div key={e.date} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{fmtDate(e.date)}</p>
                        <p className="text-[10px] text-gray-600 font-mono">
                          logged {new Date(e.submittedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className="text-base font-black font-mono" style={{ color: "#E9FF70" }}>
                        {e.hours}h
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <p className="text-center text-[11px] text-gray-700 pb-4">
              For changes to your profile, contact your EEJ coordinator.<br />
              <a href="https://edu-jobs.eu" className="underline hover:text-gray-500 transition-colors">edu-jobs.eu</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
