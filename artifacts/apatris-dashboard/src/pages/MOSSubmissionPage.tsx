/**
 * MOS 2026 — Submission Sheet + Signature Tracker + UPO Vault + Recruitment Risk
 * All four MOS mandate features in one page with tabs.
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { FileText, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, Send, Shield, Globe } from "lucide-react";

type MosTab = "sheet" | "signatures" | "upo" | "risk";

export default function MOSSubmissionPage() {
  const [tab, setTab] = useState<MosTab>("sheet");
  const [workerId, setWorkerId] = useState("");
  const qc = useQueryClient();

  const { data: workers } = useQuery<any[]>({
    queryKey: ["workers-mos"], queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      const j = await r.json(); return (j.workers ?? j ?? []).slice(0, 100);
    }, staleTime: 60000,
  });

  const tabs = [
    { id: "sheet" as const, label: "Submission Sheet", icon: FileText },
    { id: "signatures" as const, label: "Employer Signatures", icon: Send },
    { id: "upo" as const, label: "UPO Vault", icon: Shield },
    { id: "risk" as const, label: "Recruitment Risk", icon: AlertTriangle },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div><h1 className="text-xl font-bold text-white">MOS 2026 Mandate</h1>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Digital Submission · Employer Links · UPO Vault · Risk Scoring</p></div>

        <select value={workerId} onChange={e => setWorkerId(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
          <option value="">— Select Worker —</option>
          {(workers ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}{w.nationality ? ` (${w.nationality})` : ""}</option>)}
        </select>

        <div className="flex gap-0.5 p-1 bg-slate-800/60 rounded-xl border border-slate-700">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${tab === t.id ? "bg-slate-700 text-white shadow" : "text-gray-500 hover:text-gray-300"}`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "sheet" && workerId && <SubmissionSheetTab workerId={workerId} />}
        {tab === "signatures" && <SignatureTrackerTab workerId={workerId} />}
        {tab === "upo" && workerId && <UPOVaultTab workerId={workerId} />}
        {tab === "risk" && workerId && <RecruitmentRiskTab workerId={workerId} />}
        {!workerId && <p className="text-sm text-slate-500 text-center py-8">Select a worker to view MOS 2026 data</p>}
      </div>
    </div>
  );
}

function SubmissionSheetTab({ workerId }: { workerId: string }) {
  const [result, setResult] = useState<any>(null);
  const generate = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/mos2026/submission-sheet/${workerId}`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ voivodeship: "mazowieckie" }) });
      return r.json();
    },
    onSuccess: setResult,
  });

  return (
    <div className="space-y-4">
      <button onClick={() => generate.mutate()} disabled={generate.isPending}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2">
        {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Generate Submission Sheet
      </button>
      {result && (
        <>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${result.readiness === "READY" ? "bg-green-500/20 text-green-400" : result.readiness === "BLOCKED" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>{result.readiness}</span>
            <span className="text-[10px] text-slate-500">{result.missingFields} missing · {result.fieldsToVerify} to verify</span>
          </div>
          {(result.blockers ?? []).length > 0 && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              {result.blockers.map((b: string, i: number) => <p key={i} className="text-xs text-red-300 flex items-start gap-2"><XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />{b}</p>)}
            </div>
          )}
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
            {(result.sheet?.checklist ?? []).map((c: any, i: number) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 border-b border-slate-700/30 ${c.status === "missing" ? "bg-red-500/5" : c.status === "verify" ? "bg-yellow-500/5" : ""}`}>
                <span className="text-xs text-slate-300">{c.field}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white font-mono truncate max-w-[200px]">{c.value || "—"}</span>
                  {c.status === "filled" && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                  {c.status === "missing" && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                  {c.status === "verify" && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />}
                </div>
              </div>
            ))}
          </div>
          {result.feeNote && <p className="text-[10px] text-slate-500 text-center">{result.feeNote}</p>}
        </>
      )}
    </div>
  );
}

function SignatureTrackerTab({ workerId }: { workerId: string }) {
  const [empName, setEmpName] = useState("");
  const [empNip, setEmpNip] = useState("");
  const qc = useQueryClient();

  const { data } = useQuery<any>({
    queryKey: ["sig-links"], queryFn: () => fetch(`${BASE}api/mos2026/signature-links`, { headers: authHeaders() }).then(r => r.json()),
  });

  const create = useMutation({
    mutationFn: async () => {
      await fetch(`${BASE}api/mos2026/signature-link`, { method: "POST", headers: authHeaders(),
        body: JSON.stringify({ workerId, employerName: empName, employerNip: empNip || undefined }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sig-links"] }); setEmpName(""); setEmpNip(""); },
  });

  const markSigned = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${BASE}api/mos2026/signature-link/${id}/signed`, { method: "POST", headers: authHeaders() });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sig-links"] }),
  });

  return (
    <div className="space-y-4">
      {workerId && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={empName} onChange={e => setEmpName(e.target.value)} placeholder="Employer name" className="bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm" />
            <input value={empNip} onChange={e => setEmpNip(e.target.value)} placeholder="NIP (optional)" className="bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm" />
          </div>
          <button onClick={() => create.mutate()} disabled={!empName || create.isPending}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold">Create Signature Link</button>
        </div>
      )}
      {data && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
            <p className="text-2xl font-black text-yellow-400">{data.unsigned ?? 0}</p><p className="text-[10px] text-slate-500 uppercase">Unsigned</p></div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-center">
            <p className="text-2xl font-black text-red-400">{data.overdue ?? 0}</p><p className="text-[10px] text-slate-500 uppercase">Overdue</p></div>
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-center">
            <p className="text-2xl font-black text-orange-400">{data.needsFollowUp ?? 0}</p><p className="text-[10px] text-slate-500 uppercase">Needs Follow-up</p></div>
        </div>
      )}
      {(data?.links ?? []).map((l: any) => (
        <div key={l.id} className={`rounded-lg border p-3 ${l.isOverdue ? "border-red-500/30 bg-red-500/5" : l.needsAlert ? "border-orange-500/30 bg-orange-500/5" : "border-slate-700 bg-slate-800/50"}`}>
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-white font-medium">{l.worker_name ?? "Worker"} → {l.employer_name}</p>
              <p className="text-[10px] text-slate-500">{l.daysLeft}d left · sent {l.daysSinceSent}d ago</p></div>
            {l.signed ? <span className="text-[10px] text-green-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Signed</span>
              : <button onClick={() => markSigned.mutate(l.id)} className="px-2 py-1 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">Mark Signed</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function UPOVaultTab({ workerId }: { workerId: string }) {
  const [subNum, setSubNum] = useState("");
  const [subDate, setSubDate] = useState("");
  const qc = useQueryClient();

  const { data } = useQuery<any>({
    queryKey: ["upo", workerId], queryFn: () => fetch(`${BASE}api/mos2026/upo/${workerId}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!workerId,
  });

  const register = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/mos2026/upo`, { method: "POST", headers: authHeaders(),
        body: JSON.stringify({ workerId, submissionNumber: subNum, submissionDate: subDate }) });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["upo", workerId] }); setSubNum(""); setSubDate(""); },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase">Register UPO (locks Art. 108)</h3>
        <input value={subNum} onChange={e => setSubNum(e.target.value)} placeholder="Submission number" className="w-full bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm" />
        <input type="date" value={subDate} onChange={e => setSubDate(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm" />
        <button onClick={() => register.mutate()} disabled={!subNum || !subDate || register.isPending}
          className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2">
          {register.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Register UPO & Lock Art. 108
        </button>
      </div>
      {(data?.records ?? []).map((r: any) => (
        <div key={r.id} className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-white font-mono">{r.submission_number}</p>
              <p className="text-[10px] text-slate-500">Filed: {r.submission_date} · {r.case_type}</p></div>
            {r.art108_locked && <span className="text-[10px] text-green-400 font-bold flex items-center gap-1"><Shield className="w-3 h-3" /> Art. 108 LOCKED</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecruitmentRiskTab({ workerId }: { workerId: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["recruit-risk", workerId],
    queryFn: () => fetch(`${BASE}api/mos2026/recruitment-risk/${workerId}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!workerId,
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>;
  if (!data) return null;

  const riskColor = data.overallRisk === "CRITICAL" ? "text-red-400 bg-red-500/10 border-red-500/30" : data.overallRisk === "HIGH" ? "text-orange-400 bg-orange-500/10 border-orange-500/30" : "text-green-400 bg-green-500/10 border-green-500/30";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={`px-3 py-1.5 rounded-lg text-sm font-bold uppercase border ${riskColor}`}>{data.overallRisk}</span>
        <span className="text-sm text-white">{data.workerName}</span>
        {data.mandatoryMosFiling && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">MANDATORY MOS FILING</span>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
          <p className="text-2xl font-black text-blue-400">{data.schengen?.daysUsed ?? 0}/90</p><p className="text-[10px] text-slate-500 uppercase">Days Used</p></div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
          <p className={`text-2xl font-black ${(data.schengen?.daysRemaining ?? 90) < 15 ? "text-red-400" : "text-green-400"}`}>{data.schengen?.daysRemaining ?? 90}</p><p className="text-[10px] text-slate-500 uppercase">Days Left</p></div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
          <p className="text-2xl font-black text-purple-400">{data.art108Protected ? "YES" : "NO"}</p><p className="text-[10px] text-slate-500 uppercase">Art. 108</p></div>
      </div>

      {(data.risks ?? []).map((r: any, i: number) => (
        <div key={i} className={`p-2.5 rounded-lg border ${r.level === "CRITICAL" ? "border-red-500/30 bg-red-500/5" : r.level === "HIGH" ? "border-orange-500/30 bg-orange-500/5" : "border-green-500/20 bg-green-500/5"}`}>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold ${r.level === "CRITICAL" ? "text-red-400" : r.level === "HIGH" ? "text-orange-400" : "text-green-400"}`}>{r.level}</span>
            <span className="text-xs text-slate-300">{r.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
