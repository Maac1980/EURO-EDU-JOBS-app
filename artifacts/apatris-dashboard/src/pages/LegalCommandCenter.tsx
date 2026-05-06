/**
 * Legal Command Center — the cockpit for EEJ legal operations.
 *
 * Real-time intelligence via SSE stream.
 * Three-panel layout: Action Queue | Active Case | Intelligence Ticker.
 *
 * Connected to:
 *   GET /api/intelligence/stream — real-time events
 *   GET /api/intelligence/alerts — persistent alerts
 *   POST /api/legal/answer — structured legal Q&A
 *   GET /api/intelligence/status — system health
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { PublicLangToggle } from "@/components/PublicLangToggle";
import {
  Shield, AlertTriangle, Clock, FileText, ChevronRight, Loader2,
  Send, Zap, Radio, Activity, Users, Eye, CheckCircle2, XCircle,
  Bell, RefreshCcw, Scale, Globe, Sparkles, ArrowRight
} from "lucide-react";

// ═══ SSE HOOK — real-time intelligence stream with auto-reconnect ═══════════

interface IntelEvent {
  type: string;
  workerId?: string;
  workerName?: string;
  data: Record<string, any>;
  timestamp: string;
  severity: "info" | "warning" | "critical";
}

function useIntelligenceStream() {
  const [events, setEvents] = useState<IntelEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const maxRetries = 10;

  const connect = useCallback(() => {
    const token = sessionStorage.getItem("eej_token");
    if (!token) return;

    // Close existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    try {
      const url = `${BASE}api/intelligence/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setReconnecting(false);
        retryRef.current = 0;
      };

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as IntelEvent;
          if (event.type === "HEARTBEAT" || event.type === "CONNECTED") return;
          setEvents(prev => [event, ...prev].slice(0, 50));
        } catch { /* invalid JSON */ }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        esRef.current = null;

        // Auto-reconnect with backoff
        if (retryRef.current < maxRetries) {
          setReconnecting(true);
          const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
          retryRef.current++;
          setTimeout(connect, delay);
        }
      };
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  return { events, connected, reconnecting, reconnect: connect };
}

// ═══ MAIN COMPONENT ═════════════════════════════════════════════════════════

export default function LegalCommandCenter() {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");

  // Real-time stream
  const { events: streamEvents, connected, reconnecting, reconnect } = useIntelligenceStream();

  // Persistent alerts
  const { data: alertsData, refetch: refetchAlerts } = useQuery<{ persistent: any[]; realtime: any[] }>({
    queryKey: ["intel-alerts"],
    queryFn: () => fetch(`${BASE}api/intelligence/alerts`, { headers: authHeaders() }).then(r => r.json()),
    refetchInterval: 30000,
  });

  // System status
  const { data: statusData } = useQuery<{ healthy: boolean; services: Record<string, any>; fallbackMode: boolean }>({
    queryKey: ["intel-status"],
    queryFn: () => fetch(`${BASE}api/intelligence/status`, { headers: authHeaders() }).then(r => r.json()),
    refetchInterval: 60000,
  });

  // Workers with risk levels (from fleet signals)
  const { data: workersData } = useQuery<any[]>({
    queryKey: ["workers-command"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.workers ?? json ?? []).slice(0, 50);
    },
    staleTime: 30000,
  });

  // Legal answer for selected worker
  const [legalAnswer, setLegalAnswer] = useState<any>(null);
  const askLegal = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(`${BASE}api/legal/answer`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ workerId: selectedWorkerId, question: q }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => setLegalAnswer(data.answer),
  });

  // Worker intelligence
  const { data: workerIntel } = useQuery<any>({
    queryKey: ["worker-intel-cmd", selectedWorkerId],
    queryFn: () => fetch(`${BASE}api/legal-intelligence/worker/${selectedWorkerId}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!selectedWorkerId,
  });

  // Merge stream events with persistent alerts for ticker
  const allAlerts = [
    ...streamEvents.filter(e => e.severity === "critical" || e.severity === "warning"),
    ...(alertsData?.persistent ?? []).map((a: any) => ({
      type: a.alert_type, workerId: a.worker_id, workerName: a.worker_name,
      data: a.data ?? {}, timestamp: a.created_at, severity: a.severity,
      id: a.id, acknowledged: a.acknowledged,
    })),
  ];

  // Build action queue — workers needing attention
  const actionQueue = (workersData ?? [])
    .map((w: any) => {
      const alerts = allAlerts.filter(a => a.workerId === w.id);
      const hasCritical = alerts.some(a => a.severity === "critical");
      const hasWarning = alerts.some(a => a.severity === "warning");
      const daysUntilExpiry = w.trc_expiry ? Math.ceil((new Date(w.trc_expiry).getTime() - Date.now()) / 86400000) : null;
      const expired = daysUntilExpiry !== null && daysUntilExpiry < 0;
      const urgentExpiry = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 14;

      if (!hasCritical && !hasWarning && !expired && !urgentExpiry) return null;

      return {
        ...w,
        alertCount: alerts.length,
        severity: hasCritical || expired ? "critical" : "warning",
        daysUntilExpiry,
        topAlert: alerts[0]?.data?.pattern ?? (expired ? "EXPIRED" : urgentExpiry ? "EXPIRING" : ""),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1));

  const handleSelectWorker = (wId: string) => {
    setSelectedWorkerId(wId);
    setLegalAnswer(null);
    setQuestion("");
  };

  const sevColor = (s: string) => s === "critical" ? "text-red-400" : s === "warning" ? "text-amber-400" : "text-blue-400";
  const sevBg = (s: string) => s === "critical" ? "bg-red-500/10 border-red-500/20" : s === "warning" ? "bg-amber-500/10 border-amber-500/20" : "bg-blue-500/10 border-blue-500/20";

  const intel = workerIntel?.intelligence;

  return (
    <div className="h-screen bg-slate-950 text-slate-200 flex flex-col overflow-hidden">
      <PublicLangToggle />

      {/* ═══ TOP BAR ═══ */}
      <div className="flex-shrink-0 h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-red-500" />
          <h1 className="text-sm font-bold tracking-widest uppercase text-white">Legal Command Center</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : reconnecting ? "bg-yellow-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-[10px] font-mono text-slate-500">
              {connected ? "LIVE" : reconnecting ? "RECONNECTING" : "OFFLINE"}
            </span>
          </div>
          {/* System health */}
          {statusData && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${statusData.healthy ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
              <Activity className="w-3 h-3" />
              {statusData.healthy ? "ALL SYSTEMS" : statusData.fallbackMode ? "FALLBACK MODE" : "DEGRADED"}
            </div>
          )}
          {/* Alert count */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px] font-bold">
            <Bell className="w-3 h-3" />
            {allAlerts.length}
          </div>
          {!connected && (
            <button onClick={reconnect} className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white">
              <RefreshCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ═══ THREE-PANEL GRID ═══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Action Queue (25%) ── */}
        <div className="w-1/4 border-r border-slate-800 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-3 py-2 bg-slate-900/50 border-b border-slate-800">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-red-400" /> Action Queue ({actionQueue.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {actionQueue.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-600">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2 opacity-30" />
                No critical workers
              </div>
            ) : (
              actionQueue.map((w: any) => (
                <button key={w.id} onClick={() => handleSelectWorker(w.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-800/50 transition-colors ${
                    selectedWorkerId === w.id ? "bg-slate-800" : "hover:bg-slate-900"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white truncate">{w.name}</span>
                    <span className={`text-[9px] font-bold uppercase ${sevColor(w.severity)}`}>{w.severity}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-500">{w.nationality ?? ""}</span>
                    {w.daysUntilExpiry !== null && (
                      <span className={`text-[10px] font-mono ${w.daysUntilExpiry < 0 ? "text-red-400" : "text-yellow-400"}`}>
                        {w.daysUntilExpiry < 0 ? `${Math.abs(w.daysUntilExpiry)}d overdue` : `${w.daysUntilExpiry}d left`}
                      </span>
                    )}
                  </div>
                  {w.topAlert && (
                    <span className={`text-[9px] mt-1 inline-block px-1.5 py-0.5 rounded ${sevBg(w.severity)}`}>{w.topAlert}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── CENTER: Active Case Workspace (50%) ── */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2 bg-slate-900/50 border-b border-slate-800">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Eye className="w-3 h-3 text-blue-400" /> Active Case
              {selectedWorkerId && intel && <span className="text-white ml-2">{intel.workerName}</span>}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!selectedWorkerId ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600">
                <Users className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">Select a worker from the Action Queue</p>
                <p className="text-xs mt-1">or click an alert in the Intelligence Ticker</p>
              </div>
            ) : (
              <>
                {/* Worker status bar */}
                {intel && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      intel.riskLevel === "CRITICAL" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                      intel.riskLevel === "HIGH" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                      "bg-green-500/20 text-green-400 border-green-500/30"
                    }`}>{intel.riskLevel}</span>
                    <span className="text-[10px] text-slate-500">Docs: {intel.scores?.documentCompleteness ?? 0}%</span>
                    <span className="text-[10px] text-slate-500">Health: {intel.scores?.complianceHealth ?? 0}%</span>
                    {intel.primaryAction && intel.primaryAction !== "No immediate action required" && (
                      <span className="text-[10px] text-yellow-400 flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" /> {intel.primaryAction}
                      </span>
                    )}
                  </div>
                )}

                {/* Deadlines */}
                {intel?.deadlines?.filter((d: any) => d.status === "expired" || d.status === "urgent").length > 0 && (
                  <div className="space-y-1">
                    {intel.deadlines.filter((d: any) => d.status === "expired" || d.status === "urgent").slice(0, 4).map((d: any, i: number) => (
                      <div key={i} className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg ${d.status === "expired" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"}`}>
                        <span>{d.label}</span>
                        <span className="font-mono font-bold">{d.daysLeft < 0 ? `${Math.abs(d.daysLeft)}d overdue` : `${d.daysLeft}d`}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick legal question */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && question.trim()) askLegal.mutate(question.trim()); }}
                      placeholder="Ask about this worker..."
                      className="flex-1 bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500/50 placeholder:text-slate-600" />
                    <button onClick={() => { if (question.trim()) askLegal.mutate(question.trim()); }}
                      disabled={askLegal.isPending || !question.trim()}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-bold flex items-center gap-1">
                      {askLegal.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {["Status?", "Art. 108?", "Missing docs?", "Risks?", "MOS filing?"].map(q => (
                      <button key={q} onClick={() => askLegal.mutate(`What is this worker's ${q.toLowerCase()}`)}
                        disabled={askLegal.isPending}
                        className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-900 border border-slate-700 text-slate-500 hover:text-blue-400 hover:border-blue-500/30 transition-colors disabled:opacity-50">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Legal Answer Brief */}
                {askLegal.isPending && (
                  <div className="flex items-center gap-2 py-4 justify-center text-xs text-blue-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Analyzing...
                  </div>
                )}

                {legalAnswer && !askLegal.isPending && (
                  <div className="space-y-2">
                    {/* Answer */}
                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                      <p className="text-xs text-slate-300 leading-relaxed">{legalAnswer.plain_answer}</p>
                    </div>

                    {/* Two-col: basis + risks */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-2.5">
                        <h4 className="text-[9px] font-bold uppercase text-blue-400 mb-1">Legal Basis</h4>
                        {(legalAnswer.legal_basis ?? []).map((b: string, i: number) => (
                          <p key={i} className="text-[10px] text-slate-300 mb-0.5">{b}</p>
                        ))}
                      </div>
                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5">
                        <h4 className="text-[9px] font-bold uppercase text-red-400 mb-1">Risks</h4>
                        {(legalAnswer.risks ?? []).map((r: string, i: number) => (
                          <p key={i} className="text-[10px] text-red-300 mb-0.5">{r}</p>
                        ))}
                      </div>
                    </div>

                    {/* Next actions */}
                    {legalAnswer.next_actions?.length > 0 && (
                      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-2.5">
                        <h4 className="text-[9px] font-bold uppercase text-green-400 mb-1">Next Actions</h4>
                        {legalAnswer.next_actions.map((a: string, i: number) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-green-300 mb-0.5">
                            <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" />{a}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* MOS + meta */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {legalAnswer.mos_check?.digital_filing_required && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/20">MOS Digital Required</span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        legalAnswer.confidence >= 0.7 ? "bg-green-500/10 text-green-400 border-green-500/20" :
                        legalAnswer.confidence >= 0.4 ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                        "bg-red-500/10 text-red-400 border-red-500/20"
                      }`}>{Math.round(legalAnswer.confidence * 100)}%</span>
                      <span className="text-[9px] text-slate-600">{legalAnswer.deadlines}</span>
                      {legalAnswer.human_review && <span className="text-[9px] text-yellow-400">Review Required</span>}
                    </div>
                  </div>
                )}
                {/* MOS Package Actions */}
                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-800">
                  <a href={`${BASE}api/mos/package/${selectedWorkerId}/strategy-pdf`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider transition-colors">
                    <FileText className="w-3 h-3" /> Strategy PDF
                  </a>
                  <a href={`${BASE}api/mos/package/${selectedWorkerId}/playbook`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-400 text-[10px] font-bold uppercase tracking-wider transition-colors">
                    <Sparkles className="w-3 h-3" /> Playbook
                  </a>
                  <button onClick={() => {
                    fetch(`${BASE}api/mos/package/${selectedWorkerId}`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ voivodeship: "mazowieckie" }) })
                      .then(r => r.json()).then(d => setLegalAnswer({ ...legalAnswer, mosPackage: d }));
                  }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider transition-colors">
                    <Globe className="w-3 h-3" /> MOS Package
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Intelligence Ticker (25%) ── */}
        <div className="w-1/4 border-l border-slate-800 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-3 py-2 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-green-400" /> Intelligence Feed
            </h2>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {allAlerts.length === 0 && streamEvents.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-600">
                <Radio className="w-6 h-6 mx-auto mb-2 opacity-20" />
                <p>Listening for events...</p>
                <p className="text-[10px] mt-1">Verify a document to see activity</p>
              </div>
            ) : (
              [...streamEvents, ...allAlerts].slice(0, 40).map((event, i) => (
                <button key={`${event.type}-${event.timestamp}-${i}`}
                  onClick={() => { if (event.workerId) handleSelectWorker(event.workerId); }}
                  className={`w-full text-left px-3 py-2 border-b border-slate-800/30 transition-colors hover:bg-slate-900 ${
                    event.severity === "critical" ? "border-l-2 border-l-red-500" :
                    event.severity === "warning" ? "border-l-2 border-l-amber-500" :
                    "border-l-2 border-l-blue-500/30"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase ${sevColor(event.severity)}`}>{event.type.replace(/_/g, " ")}</span>
                    <span className="text-[9px] text-slate-600 font-mono">
                      {new Date(event.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                  {event.workerName && <p className="text-[10px] text-white mt-0.5">{event.workerName}</p>}
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {event.data?.pattern ?? event.data?.trigger ?? event.data?.factType ?? JSON.stringify(event.data).substring(0, 60)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
