/**
 * EEJ Client Compliance View — /client/:employerName
 *
 * Public, read-only dashboard for employers.
 * Shows workers assigned to their site with compliance risk zones.
 * No PII exposed (no passport, PESEL, phone, email, IBAN).
 * EEJ Blue branding.
 */
import React, { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Shield, Users, AlertTriangle, CheckCircle2, XOctagon, Clock, Building2 } from "lucide-react";

interface ClientWorker {
  id: string;
  name: string;
  role: string;
  nationality: string;
  voivodeship: string;
  zone: string;
  color: string;
  riskLevel: string;
  daysRemaining: number | null;
  art108Protected: boolean;
  stage: string;
}

const ZONE_ICON: Record<string, typeof Shield> = {
  GREEN: CheckCircle2,
  YELLOW: Clock,
  RED: AlertTriangle,
  EXPIRED: XOctagon,
  UNKNOWN: Shield,
};

export default function ClientCompliance() {
  const [, params] = useRoute("/client/:employerName");
  const employer = decodeURIComponent(params?.employerName ?? "");
  const [data, setData] = useState<{ workers: ClientWorker[]; total: number; atRisk: number; employer: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/";

  useEffect(() => {
    if (!employer) return;
    fetch(`${BASE}api/client/${encodeURIComponent(employer)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [employer]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{employer || "Employer"}</h1>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">EEJ Client Compliance Dashboard</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 mt-3">Loading compliance data...</p>
          </div>
        ) : !data || data.total === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-12 text-center">
            <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No workers found for "{employer}"</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-center">
                <div className="text-2xl font-bold text-blue-400">{data.total}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Total Workers</div>
              </div>
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{data.total - data.atRisk}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Compliant</div>
              </div>
              <div className={`rounded-xl border p-4 text-center ${data.atRisk > 0 ? "border-red-500/20 bg-red-500/5" : "border-green-500/20 bg-green-500/5"}`}>
                <div className={`text-2xl font-bold ${data.atRisk > 0 ? "text-red-400" : "text-green-400"}`}>{data.atRisk}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">At Risk</div>
              </div>
            </div>

            {/* Worker table */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Worker</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nationality</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Days Left</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Art. 108</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workers.map(w => {
                    const Icon = ZONE_ICON[w.zone] ?? Shield;
                    return (
                      <tr key={w.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 text-white font-semibold">{w.name}</td>
                        <td className="px-4 py-3 text-slate-400">{w.role}</td>
                        <td className="px-4 py-3 text-slate-400">{w.nationality}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ color: w.color, background: `${w.color}15`, border: `1px solid ${w.color}30` }}>
                            <Icon className="w-3 h-3" /> {w.zone}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs" style={{ color: w.color }}>
                          {w.daysRemaining === null ? "—" : w.daysRemaining < 0 ? `${Math.abs(w.daysRemaining)}d ago` : `${w.daysRemaining}d`}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {w.art108Protected ? (
                            <span className="text-[10px] text-blue-400 font-bold">Protected</span>
                          ) : (
                            <span className="text-[10px] text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-center space-y-1">
              <p className="text-[10px] text-slate-600">EEJ Recruitment Platform &middot; org_context: EEJ</p>
              <p className="text-[9px] text-slate-700 italic">Automated compliance overview. Contact EEJ for details.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
