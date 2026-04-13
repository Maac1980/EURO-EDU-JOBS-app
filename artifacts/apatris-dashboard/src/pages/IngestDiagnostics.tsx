/**
 * EEJ Ingest Diagnostics — hidden internal testing page.
 * Route: /test/ingest-diagnostics
 *
 * Features:
 *  - Mock OCR classification without writing to the live database
 *  - Manual stay-days input → Green/Yellow/Red legal risk display
 *  - System health checks for First Contact endpoints
 *
 * Branding: EEJ Professional Blue/White
 * Access: Internal dev/QA only (not in sidebar navigation)
 */
import React, { useState } from "react";
import { authHeaders, BASE } from "@/lib/api";
import { Activity, FileText, Shield, Loader2, CheckCircle2, AlertTriangle, XOctagon, Cpu, Zap } from "lucide-react";

// ═══ MOCK OCR CLASSIFICATION (no DB writes) ═════════════════════════════════

const MOCK_DOC_TYPES = [
  { type: "PASSPORT", label: "Passport", fields: ["worker_name", "passport_number", "date_of_birth", "expiry_date", "nationality"] },
  { type: "ZUS_ZUA", label: "ZUS ZUA Registration", fields: ["worker_name", "pesel", "employer_name", "employer_nip", "issue_date"] },
  { type: "WORK_PERMIT_A", label: "Work Permit Type A", fields: ["worker_name", "employer_name", "expiry_date", "position", "voivodeship"] },
  { type: "TRC_APPLICATION", label: "TRC Decision", fields: ["worker_name", "case_number", "decision_date", "expiry_date", "authority"] },
  { type: "UPO_RECEIPT", label: "UPO Filing Receipt", fields: ["worker_name", "case_number", "issue_date", "authority"] },
];

// ═══ LEGAL RISK CALCULATOR (pure client-side, no API calls) ═════════════════

function computeRisk(days: number | null): { level: string; color: string; bg: string; border: string; label: string; actions: string[] } {
  if (days === null || isNaN(days as number)) return { level: "UNKNOWN", color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/20", label: "Enter days remaining", actions: [] };
  if (days < 0) return { level: "EXPIRED", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", label: "EXPIRED — Not Protected", actions: ["Suspend work assignment immediately", "Consult immigration lawyer", "File new application via MOS portal urgently"] };
  if (days === 0) return { level: "CRITICAL", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", label: "EXPIRES TODAY", actions: ["File TRC application via MOS portal NOW", "Obtain employer Annex 1 signature", "After filing: Art. 108 protection activates"] };
  if (days <= 14) return { level: "CRITICAL", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", label: `CRITICAL — ${days}d remaining`, actions: ["File TRC application IMMEDIATELY", "Verify ZUS/KAS registration", "MOS fee: PLN 800 (TRC) / PLN 400 (WP)"] };
  if (days <= 30) return { level: "HIGH", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", label: `HIGH RISK — ${days}d remaining`, actions: ["Begin MOS filing process this week", "Gather employer Annex 1 signature", "Prepare PESEL + passport docs"] };
  if (days <= 60) return { level: "MEDIUM", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", label: `MEDIUM — ${days}d remaining`, actions: ["Plan TRC renewal in next 2 weeks", "Verify all documents are current", "Begin MOS portal pre-check"] };
  if (days <= 90) return { level: "LOW-MOS", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", label: `<90 DAYS — MOS filing recommended`, actions: ["Schedule MOS filing before 30-day mark", "Ensure employer is aware of renewal timeline", "Check Schengen days if applicable"] };
  return { level: "GREEN", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20", label: `SAFE — ${days}d remaining`, actions: ["No immediate action required", "Monitor quarterly"] };
}

function computeSchengenRisk(days: number | null): { level: string; color: string; label: string } {
  if (days === null || isNaN(days as number)) return { level: "N/A", color: "text-slate-400", label: "Enter Schengen days" };
  if (days >= 90) return { level: "DO_NOT_PLACE", color: "text-red-400", label: `OVERSTAY — ${days}/90 days. Do NOT place.` };
  if (days >= 86) return { level: "DEFER", color: "text-red-400", label: `DEFER — ${days}/90 days. File immediately or defer placement.` };
  if (days >= 80) return { level: "EXPEDITE", color: "text-yellow-400", label: `EXPEDITE — ${days}/90 days. Expedite MOS filing before placement.` };
  return { level: "SAFE", color: "text-green-400", label: `SAFE — ${days}/90 days. Proceed with placement.` };
}

export default function IngestDiagnostics() {
  const [stayDays, setStayDays] = useState<string>("");
  const [schengenDays, setSchengenDays] = useState<string>("");
  const [mockDocType, setMockDocType] = useState("PASSPORT");
  const [mockConfidence, setMockConfidence] = useState(85);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const parsedDays = stayDays.trim() === "" ? null : parseInt(stayDays, 10);
  const parsedSchengen = schengenDays.trim() === "" ? null : parseInt(schengenDays, 10);
  const risk = computeRisk(parsedDays);
  const schengen = computeSchengenRisk(parsedSchengen);
  const selectedDoc = MOCK_DOC_TYPES.find(d => d.type === mockDocType) ?? MOCK_DOC_TYPES[0];

  const runHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const [statusRes, auditRes] = await Promise.all([
        fetch(`${BASE}api/first-contact/status`, { headers: authHeaders() }).then(r => r.json()).catch(() => ({ error: "unreachable" })),
        fetch(`${BASE}api/first-contact/ingest-audit`, { headers: authHeaders() }).then(r => r.json()).catch(() => ({ error: "unreachable" })),
      ]);
      setHealthStatus({ status: statusRes, audit: auditRes, timestamp: new Date().toISOString() });
    } catch { setHealthStatus({ error: "Failed to reach API" }); }
    setHealthLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Ingest Diagnostics</h1>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Internal Testing &middot; No DB Writes &middot; org_context: EEJ</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── LEFT: Legal Risk Simulator ──────────────────────────── */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-4">
              <h2 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4" /> Legal Risk Simulator
              </h2>

              {/* Stay days input */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Days of Stay Remaining</label>
                <input type="number" value={stayDays} onChange={e => setStayDays(e.target.value)}
                  placeholder="e.g. 45"
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm placeholder-slate-600 focus:border-blue-500/50 focus:outline-none" />
              </div>

              {/* Risk result */}
              <div className={`rounded-lg border ${risk.border} ${risk.bg} p-4 space-y-2`}>
                <div className="flex items-center gap-2">
                  {risk.level === "GREEN" ? <CheckCircle2 className={`w-5 h-5 ${risk.color}`} /> :
                   risk.level === "EXPIRED" || risk.level === "CRITICAL" ? <XOctagon className={`w-5 h-5 ${risk.color}`} /> :
                   <AlertTriangle className={`w-5 h-5 ${risk.color}`} />}
                  <span className={`text-sm font-bold ${risk.color}`}>{risk.label}</span>
                </div>
                {risk.actions.length > 0 && (
                  <ul className="space-y-1 ml-7">
                    {risk.actions.map((a, i) => (
                      <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                        <span className="text-slate-600 mt-0.5">-</span> {a}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Schengen input */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Schengen Days Used (90/180 window)</label>
                <input type="number" value={schengenDays} onChange={e => setSchengenDays(e.target.value)}
                  placeholder="e.g. 82"
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm placeholder-slate-600 focus:border-blue-500/50 focus:outline-none" />
              </div>

              {/* Schengen result */}
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 flex items-center gap-2">
                <Zap className={`w-4 h-4 ${schengen.color}`} />
                <span className={`text-xs font-semibold ${schengen.color}`}>{schengen.label}</span>
              </div>

              {/* Quick presets */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Quick Presets</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "120d (Safe)", days: "120", sch: "20" },
                    { label: "45d (MOS)", days: "45", sch: "60" },
                    { label: "12d (Urgent)", days: "12", sch: "82" },
                    { label: "0d (Today)", days: "0", sch: "89" },
                    { label: "-5d (Expired)", days: "-5", sch: "95" },
                  ].map(p => (
                    <button key={p.label} onClick={() => { setStayDays(p.days); setSchengenDays(p.sch); }}
                      className="px-2.5 py-1 rounded text-[10px] font-bold bg-slate-700/50 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 border border-slate-700 transition-colors">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Mock OCR + Health Check ─────────────────────── */}
          <div className="space-y-4">
            {/* Mock OCR */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-4">
              <h2 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4" /> Mock OCR Classification
              </h2>
              <p className="text-[10px] text-slate-500">Simulates document classification without writing to the database.</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Document Type</label>
                  <select value={mockDocType} onChange={e => setMockDocType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs">
                    {MOCK_DOC_TYPES.map(d => <option key={d.type} value={d.type}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Confidence (%)</label>
                  <input type="range" min="0" max="100" value={mockConfidence} onChange={e => setMockConfidence(parseInt(e.target.value))}
                    className="w-full accent-blue-500 mt-2" />
                  <span className={`text-xs font-bold ${mockConfidence >= 80 ? "text-green-400" : mockConfidence >= 50 ? "text-yellow-400" : "text-red-400"}`}>{mockConfidence}%</span>
                </div>
              </div>

              {/* Mock result */}
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">{selectedDoc.type}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${mockConfidence >= 80 ? "bg-green-500/20 text-green-400" : mockConfidence >= 50 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>{mockConfidence}%</span>
                  <span className={`text-[10px] ${mockConfidence >= 80 ? "text-green-400" : mockConfidence >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                    {mockConfidence >= 80 ? "AUTO_SUGGEST" : mockConfidence >= 50 ? "REVIEW_REQUIRED" : "MANUAL_REQUIRED"}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Expected Fields:</div>
                <div className="flex flex-wrap gap-1">
                  {selectedDoc.fields.map(f => (
                    <span key={f} className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">{f}</span>
                  ))}
                </div>
                <div className="text-[10px] text-slate-600 italic mt-1">No data written to database — simulation only</div>
              </div>
            </div>

            {/* Health Check */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
              <h2 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4" /> System Health Check
              </h2>

              <button onClick={runHealthCheck} disabled={healthLoading}
                className="w-full py-2.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold hover:bg-blue-500/30 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                {healthLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</> : <><Activity className="w-3.5 h-3.5" /> Run Health Check</>}
              </button>

              {healthStatus && !healthStatus.error && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {["smartIngest", "legalEngine", "feedbackLoop"].map(sys => {
                      const s = healthStatus.status?.systems?.[sys];
                      return (
                        <div key={sys} className={`rounded-lg border p-2 text-center ${s?.ready ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                          <div className={`text-[10px] font-bold ${s?.ready ? "text-green-400" : "text-red-400"}`}>{s?.ready ? "READY" : "DOWN"}</div>
                          <div className="text-[9px] text-slate-500 mt-0.5">{sys.replace(/([A-Z])/g, " $1").trim()}</div>
                        </div>
                      );
                    })}
                  </div>
                  {healthStatus.audit?.overallStatus && (
                    <div className={`rounded-lg border p-2 text-xs text-center ${healthStatus.audit.overallStatus === "READY" ? "border-green-500/20 text-green-400" : "border-yellow-500/20 text-yellow-400"}`}>
                      Ingest Pipeline: {healthStatus.audit.overallStatus} ({healthStatus.audit.summary?.ready ?? "?"}/{healthStatus.audit.summary?.totalDocTypes ?? "?"} doc types)
                    </div>
                  )}
                  <div className="text-[10px] text-slate-600 text-center">Checked: {healthStatus.timestamp}</div>
                </div>
              )}

              {healthStatus?.error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
                  API unreachable — ensure server is running on port 8080
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
