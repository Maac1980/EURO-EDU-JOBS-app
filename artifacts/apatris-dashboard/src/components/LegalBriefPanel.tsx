/**
 * LegalBriefPanel — displays structured legal answers from the Legal Answer Engine.
 *
 * Connected to POST /api/legal/answer
 * Shows: plain answer, legal basis, risks, deadlines, next actions, MOS check, required docs.
 * Includes worker selector and question input.
 */

import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  Sparkles, Send, Loader2, Shield, AlertTriangle, Clock, FileText,
  ChevronRight, Scale, CheckCircle2, XCircle, Globe, Copy, Check,
  User, BookOpen
} from "lucide-react";

interface MosCheck {
  digital_filing_required: boolean;
  mos_system_applicable: boolean;
  login_gov_pl_needed: boolean;
  upo_required: boolean;
  paper_filing_still_accepted: boolean;
  mos_notes: string[];
}

interface LegalAnswer {
  plain_answer: string;
  legal_basis: string[];
  applicability: string;
  required_docs: string[];
  deadlines: string;
  risks: string[];
  next_actions: string[];
  confidence: number;
  human_review: boolean;
  mos_check: MosCheck;
  source_data: {
    worker_status: string;
    risk_level: string;
    documents_analyzed: number;
    engine_used: "deterministic" | "ai_assisted";
  };
}

interface Worker { id: string; name: string; nationality?: string }

const QUICK_QUESTIONS = [
  "What is this worker's current legal status and can they work?",
  "Is Art. 108 protection active for this worker?",
  "What documents are missing for TRC renewal?",
  "What are the upcoming deadlines and risks?",
  "Is this worker ready for a PIP inspection?",
  "What MOS digital filing is required for this case?",
  "Can this worker change employers under current permit?",
  "What happens if the permit expires before renewal?",
];

export default function LegalBriefPanel() {
  const [workerId, setWorkerId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<LegalAnswer | null>(null);
  const [copied, setCopied] = useState(false);

  // Worker list
  const { data: workersData } = useQuery<Worker[]>({
    queryKey: ["workers-brief"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.workers ?? json ?? []).map((w: any) => ({ id: w.id, name: w.name, nationality: w.nationality }));
    },
    staleTime: 60_000,
  });

  const ask = useMutation({
    mutationFn: async (q: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35000); // 35s client timeout
      try {
        const res = await fetch(`${BASE}api/legal/answer`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ workerId, question: q }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Service temporarily unavailable");
        }
        return res.json();
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === "AbortError") throw new Error("AI service busy — please try again in a moment");
        throw err;
      }
    },
    onSuccess: (data) => setAnswer(data.answer),
    retry: 1, // auto-retry once on failure
    retryDelay: 2000,
  });

  const handleAsk = (q: string) => {
    setQuestion(q);
    ask.mutate(q);
  };

  const handleCopy = () => {
    if (!answer) return;
    const text = [
      `LEGAL BRIEF: ${answer.plain_answer}`,
      `\nLEGAL BASIS: ${answer.legal_basis.join(", ")}`,
      `\nAPPLICABILITY: ${answer.applicability}`,
      `\nDEADLINES: ${answer.deadlines}`,
      `\nRISKS:\n${answer.risks.map(r => `- ${r}`).join("\n")}`,
      `\nNEXT ACTIONS:\n${answer.next_actions.map(a => `- ${a}`).join("\n")}`,
      `\nREQUIRED DOCS:\n${answer.required_docs.map(d => `- ${d}`).join("\n")}`,
      `\nMOS 2026: ${answer.mos_check.mos_notes.join(" | ")}`,
      `\nConfidence: ${Math.round(answer.confidence * 100)}% | Review: ${answer.human_review ? "Required" : "Optional"}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const riskColor = (level: string) =>
    level === "CRITICAL" ? "text-red-400" : level === "HIGH" ? "text-orange-400" : level === "MEDIUM" ? "text-yellow-400" : "text-green-400";

  const confidenceColor = (c: number) =>
    c >= 0.7 ? "bg-green-500/20 text-green-400 border-green-500/30" :
    c >= 0.4 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
    "bg-red-500/20 text-red-400 border-red-500/30";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center">
            <Scale className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Legal Answer Engine</h1>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-0.5">Structured Q&A · MOS 2026 · Decision Engine</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* Input Section */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-4">
          {/* Worker selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Worker</label>
            <select value={workerId} onChange={e => setWorkerId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/60">
              <option value="">— Select Worker —</option>
              {(workersData ?? []).map(w => (
                <option key={w.id} value={w.id}>{w.name}{w.nationality ? ` (${w.nationality})` : ""}</option>
              ))}
            </select>
          </div>

          {/* Quick questions */}
          {workerId && (
            <div className="flex flex-wrap gap-1.5">
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => handleAsk(q)} disabled={ask.isPending}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-900 border border-slate-700 text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-colors disabled:opacity-50">
                  {q.length > 45 ? q.substring(0, 45) + "..." : q}
                </button>
              ))}
            </div>
          )}

          {/* Custom question */}
          <div className="flex gap-2">
            <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && question.trim() && workerId) handleAsk(question.trim()); }}
              placeholder={workerId ? "Ask a legal question about this worker..." : "Select a worker first"}
              disabled={!workerId}
              className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 placeholder:text-slate-600 disabled:opacity-50" />
            <button onClick={() => { if (question.trim() && workerId) handleAsk(question.trim()); }}
              disabled={ask.isPending || !question.trim() || !workerId}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2">
              {ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Loading skeleton */}
        {ask.isPending && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-3 text-blue-400 mb-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Analyzing worker data + legal engine + MOS check...</span>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-3 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-3/4" />
              <div className="h-4 bg-slate-700 rounded w-1/2" />
              <div className="h-3 bg-slate-700 rounded w-5/6" />
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="h-20 bg-slate-700 rounded-lg" />
                <div className="h-20 bg-slate-700 rounded-lg" />
              </div>
              <div className="h-16 bg-slate-700 rounded-lg" />
            </div>
            <p className="text-[10px] text-slate-600 text-center">This may take up to 30 seconds for complex cases</p>
          </div>
        )}

        {/* Error with retry */}
        {ask.isError && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-3 mb-2">
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm font-medium text-red-300">
                {ask.error instanceof Error && ask.error.message.includes("busy") ? "Service Busy — Retrying..." : "Analysis failed"}
              </p>
            </div>
            <p className="text-xs text-red-400/70 mb-3">{ask.error instanceof Error ? ask.error.message : "Unknown error"}</p>
            <button onClick={() => { if (question.trim()) ask.mutate(question.trim()); }}
              className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg text-xs font-bold transition-colors">
              Try Again
            </button>
          </div>
        )}

        {/* ═══ ANSWER DISPLAY ═══ */}
        {answer && !ask.isPending && (
          <div className="space-y-4">

            {/* Status bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase border ${confidenceColor(answer.confidence)}`}>
                {Math.round(answer.confidence * 100)}% Confidence
              </span>
              <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${riskColor(answer.source_data.risk_level)}`}>
                {answer.source_data.risk_level} Risk
              </span>
              <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-slate-700 text-slate-300">
                {answer.source_data.worker_status}
              </span>
              <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-slate-700 text-slate-400">
                {answer.source_data.engine_used === "ai_assisted" ? "AI + Engine" : "Engine Only"}
              </span>
              <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-slate-700 text-slate-400">
                {answer.source_data.documents_analyzed} docs analyzed
              </span>
              {answer.human_review && (
                <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                  Requires Human Review
                </span>
              )}
              <button onClick={handleCopy} className="ml-auto p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors" title="Copy full brief">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Plain Answer */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
              <p className="text-base text-slate-200 leading-relaxed">{answer.plain_answer}</p>
            </div>

            {/* Two-column: Legal Basis + Risks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Legal Basis */}
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-2 flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5" /> Legal Basis
                </h3>
                {answer.legal_basis.length > 0 ? (
                  <ul className="space-y-1">
                    {answer.legal_basis.map((b, i) => (
                      <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                        <Scale className="w-3 h-3 mt-0.5 text-blue-400 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-slate-500">No specific articles identified</p>}
              </div>

              {/* Risks */}
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-red-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> Risks
                </h3>
                {answer.risks.length > 0 ? (
                  <ul className="space-y-1">
                    {answer.risks.map((r, i) => (
                      <li key={i} className="text-xs text-red-200 flex items-start gap-2">
                        <XCircle className="w-3 h-3 mt-0.5 text-red-400 flex-shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-green-400">No critical risks identified</p>}
              </div>
            </div>

            {/* Applicability */}
            {answer.applicability && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-2">
                  <User className="w-3.5 h-3.5" /> Applicability
                </h3>
                <p className="text-sm text-slate-300">{answer.applicability}</p>
              </div>
            )}

            {/* Deadlines */}
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-yellow-400 mb-1 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" /> Deadlines
              </h3>
              <p className="text-sm text-yellow-200">{answer.deadlines}</p>
            </div>

            {/* Next Actions */}
            {answer.next_actions.length > 0 && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-green-400 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Next Actions
                </h3>
                <ol className="space-y-1.5">
                  {answer.next_actions.map((a, i) => (
                    <li key={i} className="text-xs text-green-200 flex items-start gap-2">
                      <span className="text-[10px] font-bold text-green-400 bg-green-500/20 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      {a}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Required Documents */}
            {answer.required_docs.length > 0 && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> Required Documents
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {answer.required_docs.map((d, i) => (
                    <span key={i} className="px-2 py-1 rounded-lg text-[11px] bg-slate-900 border border-slate-700 text-slate-300">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {/* MOS 2026 Check */}
            <div className={`rounded-xl border p-4 ${
              answer.mos_check.digital_filing_required
                ? "border-blue-500/30 bg-blue-500/5"
                : "border-slate-700 bg-slate-800/50"
            }`}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-2 flex items-center gap-2">
                <Globe className="w-3.5 h-3.5" /> 2026 MOS Digital Filing Check
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                {[
                  { label: "Digital Filing", value: answer.mos_check.digital_filing_required, icon: "📄" },
                  { label: "MOS System", value: answer.mos_check.mos_system_applicable, icon: "🖥️" },
                  { label: "login.gov.pl", value: answer.mos_check.login_gov_pl_needed, icon: "🔐" },
                  { label: "UPO Receipt", value: answer.mos_check.upo_required, icon: "🧾" },
                  { label: "Paper OK", value: answer.mos_check.paper_filing_still_accepted, icon: "📋" },
                ].map((item, i) => (
                  <div key={i} className={`p-2 rounded-lg text-center text-[10px] font-bold ${
                    item.value ? "bg-blue-500/20 text-blue-400 border border-blue-500/20" : "bg-slate-800 text-slate-500 border border-slate-700"
                  }`}>
                    <span className="text-sm">{item.icon}</span>
                    <p className="mt-0.5">{item.label}</p>
                    <p className="text-[9px]">{item.value ? "YES" : "NO"}</p>
                  </div>
                ))}
              </div>
              {answer.mos_check.mos_notes.length > 0 && (
                <div className="space-y-1">
                  {answer.mos_check.mos_notes.map((note, i) => (
                    <p key={i} className="text-xs text-blue-200/80 flex items-start gap-2">
                      <ChevronRight className="w-3 h-3 mt-0.5 text-blue-400 flex-shrink-0" />
                      {note}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <p className="text-[10px] text-slate-600 text-center font-mono">
              EEJ Legal Answer Engine · {answer.source_data.engine_used === "ai_assisted" ? "Claude + Decision Engine" : "Deterministic Engine"} · Advisory Only · Requires Human Review
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
