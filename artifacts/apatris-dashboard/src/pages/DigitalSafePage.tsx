/**
 * Digital Safe — secure vault for official MOS certificates per worker.
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { Shield, Upload, CheckCircle2, Loader2, FileText, Lock } from "lucide-react";

export default function DigitalSafePage() {
  const [workerId, setWorkerId] = useState("");
  const [fileName, setFileName] = useState("");
  const [category, setCategory] = useState("MOS_CERTIFICATE");
  const [description, setDescription] = useState("");
  const qc = useQueryClient();

  const { data: workers } = useQuery<any[]>({
    queryKey: ["workers-safe"], queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      const j = await r.json(); return (j.workers ?? j ?? []).slice(0, 100);
    }, staleTime: 60000,
  });

  const { data: safeData } = useQuery<any>({
    queryKey: ["safe", workerId], queryFn: () => fetch(`${BASE}api/safe/${workerId}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!workerId,
  });

  const upload = useMutation({
    mutationFn: async () => {
      await fetch(`${BASE}api/safe/${workerId}/upload`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ fileName, category, description: description || undefined }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["safe", workerId] }); setFileName(""); setDescription(""); },
  });

  const verify = useMutation({
    mutationFn: async (docId: string) => {
      await fetch(`${BASE}api/safe/document/${docId}/verify`, { method: "POST", headers: authHeaders() });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["safe", workerId] }),
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div><h1 className="text-xl font-bold text-white">Digital Document Safe</h1>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Official MOS Certificates · Timestamped · Source of Truth</p></div>

        <select value={workerId} onChange={e => setWorkerId(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
          <option value="">— Select Worker —</option>
          {(workers ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        {workerId && (
          <>
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase">Add Document to Safe</h3>
              <input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="File name (e.g., UPO_2026-04-27.pdf)" className="w-full bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm" />
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm">
                {(safeData?.categories ?? ["MOS_CERTIFICATE", "SUBMISSION_CONFIRMATION", "UPO_RECEIPT", "DECISION_POSITIVE", "DECISION_NEGATIVE", "TRC_CARD_SCAN", "STAMP_PROOF", "OFFICIAL_CORRESPONDENCE"]).map((c: string) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm" />
              <button onClick={() => upload.mutate()} disabled={!fileName || upload.isPending}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                {upload.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Store in Safe
              </button>
            </div>

            {(safeData?.documents ?? []).length > 0 && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Safe Contents ({safeData.documents.length})</h3>
                <div className="space-y-1.5">
                  {(safeData.documents as any[]).map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-700/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <div className="min-w-0"><p className="text-xs text-white truncate">{d.file_name}</p>
                          <p className="text-[10px] text-slate-500">{d.doc_category?.replace(/_/g, " ")} · {new Date(d.created_at).toLocaleDateString()}</p></div>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.verified ? <span className="text-[10px] text-green-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verified</span>
                          : <button onClick={() => verify.mutate(d.id)} className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30">Verify</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
