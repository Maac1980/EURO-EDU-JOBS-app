/**
 * DocumentVerificationPage — verify AI-extracted data before syncing to worker record.
 *
 * Layout: Left = document viewer | Right = editable verification table
 * Compares extracted values vs existing worker data.
 * Amber highlight for mismatches.
 * Confirm & Sync per field or Bulk Approve All.
 */

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { authHeaders, BASE } from "@/lib/api";
import {
  FileText, CheckCircle2, AlertTriangle, Loader2, Eye, Edit3,
  Upload, Shield, Clock, ChevronRight, Check, X, RefreshCcw, Zap
} from "lucide-react";

interface ExtractedField {
  key: string;
  label: string;
  extracted: string | null;
  existing: string | null;
  confidence: number;
  mismatch: boolean;
  confirmed: boolean;
  edited: string;
}

export default function DocumentVerification() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const docIdParam = params.get("docId") ?? "";
  const [docId, setDocId] = useState(docIdParam);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [syncToWorker, setSyncToWorker] = useState(true);
  const qc = useQueryClient();

  // Load document
  const { data: docData, isLoading: loadingDoc } = useQuery<{ document: any }>({
    queryKey: ["smart-doc-detail", docId],
    queryFn: () => fetch(`${BASE}api/documents/smart-ingest/detail/${docId}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!docId,
  });

  // Load worker data for comparison
  const workerId = docData?.document?.worker_id;
  const { data: workerData } = useQuery<any>({
    queryKey: ["worker-verify", workerId],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/workers/${workerId}`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!workerId,
  });

  // Load worker's ingested documents list (for doc picker)
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const { data: docsListData } = useQuery<{ documents: any[] }>({
    queryKey: ["worker-smart-docs", selectedWorkerId],
    queryFn: () => fetch(`${BASE}api/documents/smart-ingest/${selectedWorkerId}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!selectedWorkerId && !docId,
  });

  // Workers list
  const { data: workersData } = useQuery<any[]>({
    queryKey: ["workers-verify-list"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.workers ?? json ?? []).map((w: any) => ({ id: w.id, name: w.name, nationality: w.nationality }));
    },
    staleTime: 60_000,
  });

  // Build verification fields when doc + worker load
  useEffect(() => {
    if (!docData?.document) return;
    const doc = docData.document;
    const ext = doc.extracted_data ?? {};
    const w = workerData ?? {};

    const FIELD_DEFS: Array<{ key: string; label: string; workerField?: string }> = [
      { key: "worker_name", label: "Worker Name", workerField: "name" },
      { key: "pesel", label: "PESEL", workerField: "pesel" },
      { key: "passport_number", label: "Passport Number", workerField: "passport_number" },
      { key: "date_of_birth", label: "Date of Birth" },
      { key: "expiry_date", label: "Expiry Date", workerField: doc.doc_type?.includes("TRC") ? "trc_expiry" : doc.doc_type?.includes("PERMIT") ? "work_permit_expiry" : doc.doc_type === "PASSPORT" ? "passport_expiry" : undefined },
      { key: "issue_date", label: "Issue Date" },
      { key: "decision_date", label: "Decision Date" },
      { key: "case_number", label: "Case Number" },
      { key: "authority", label: "Issuing Authority" },
      { key: "employer_name", label: "Employer" },
      { key: "employer_nip", label: "Employer NIP" },
      { key: "salary", label: "Salary" },
      { key: "position", label: "Position", workerField: "job_role" },
      { key: "voivodeship", label: "Voivodeship" },
    ];

    const built: ExtractedField[] = FIELD_DEFS
      .filter(f => ext[f.key] != null || (f.workerField && w[f.workerField] != null))
      .map(f => {
        const extractedVal = ext[f.key]?.value ?? ext[f.key] ?? null;
        const existingVal = f.workerField ? (w[f.workerField] ?? null) : null;
        const conf = typeof ext[f.key] === "object" ? (ext[f.key]?.confidence ?? doc.confidence ?? 0) : (doc.confidence ?? 0);
        const mismatch = existingVal != null && extractedVal != null && String(existingVal).toLowerCase() !== String(extractedVal).toLowerCase();

        return {
          key: f.key,
          label: f.label,
          extracted: extractedVal ? String(extractedVal) : null,
          existing: existingVal ? String(existingVal) : null,
          confidence: typeof conf === "number" ? conf : 0,
          mismatch,
          confirmed: false,
          edited: extractedVal ? String(extractedVal) : "",
        };
      });

    setFields(built);
  }, [docData, workerData]);

  // Verify + sync mutation
  const verify = useMutation({
    mutationFn: async () => {
      const verifiedFields: Record<string, string | null> = {};
      for (const f of fields) {
        if (f.confirmed || f.edited) {
          verifiedFields[f.key] = f.edited || f.extracted;
        }
      }
      const res = await fetch(`${BASE}api/documents/verify/${docId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ verifiedFields, syncToWorker }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Verification failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart-doc-detail", docId] });
      qc.invalidateQueries({ queryKey: ["worker-verify", workerId] });
    },
  });

  const updateField = (idx: number, update: Partial<ExtractedField>) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...update } : f));
  };

  const confirmAll = () => {
    setFields(prev => prev.map(f => ({ ...f, confirmed: true })));
  };

  const confColor = (c: number) =>
    c >= 0.8 ? "bg-green-500" : c >= 0.5 ? "bg-yellow-500" : "bg-red-500";

  const confLabel = (c: number) =>
    c >= 0.8 ? "High" : c >= 0.5 ? "Medium" : "Low";

  const doc = docData?.document;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center">
            <Eye className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Document Verification</h1>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-0.5">AI Extraction · Human Verification · Worker Sync</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* Document selector (if no docId in URL) */}
        {!docId && (
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3 mb-6">
            <h2 className="text-sm font-bold text-white">Select Document to Verify</h2>
            <select value={selectedWorkerId} onChange={e => setSelectedWorkerId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
              <option value="">— Select Worker —</option>
              {(workersData ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {(docsListData?.documents ?? []).length > 0 && (
              <div className="space-y-1.5">
                {docsListData!.documents.map((d: any) => (
                  <button key={d.id} onClick={() => setDocId(d.id)}
                    className="w-full text-left p-3 rounded-lg bg-slate-900 border border-slate-700 hover:border-blue-500/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white font-medium">{d.file_name} — {d.doc_type}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${d.status === "verified" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{d.status}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{d.rationale?.substring(0, 80)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {loadingDoc && docId && (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
        )}

        {doc && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ═══ LEFT: Document Info ═══ */}
            <div className="space-y-4">
              {/* Document metadata */}
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" /> {doc.file_name}
                  </h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    doc.status === "verified" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                  }`}>{doc.status?.toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-500">Type:</span> <span className="text-white font-medium">{doc.doc_type}</span></div>
                  <div><span className="text-slate-500">Confidence:</span> <span className="text-white font-medium">{Math.round((doc.confidence ?? 0) * 100)}%</span></div>
                  <div><span className="text-slate-500">MOS Relevant:</span> <span className={doc.mos_relevant ? "text-blue-400" : "text-slate-400"}>{doc.mos_relevant ? "Yes" : "No"}</span></div>
                  <div><span className="text-slate-500">Rejection:</span> <span className={doc.is_rejection ? "text-red-400" : "text-slate-400"}>{doc.is_rejection ? "Yes" : "No"}</span></div>
                </div>
              </div>

              {/* Rationale */}
              {doc.rationale && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-1">AI Rationale</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{doc.rationale}</p>
                </div>
              )}

              {/* Legal Impact */}
              {doc.legal_impact && (
                <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" /> Legal Impact
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div><span className="text-slate-500">Status:</span> <span className="text-white">{doc.legal_impact.currentStatus}</span></div>
                    <div><span className="text-slate-500">Risk:</span> <span className={
                      doc.legal_impact.riskLevel === "CRITICAL" ? "text-red-400" :
                      doc.legal_impact.riskLevel === "HIGH" ? "text-orange-400" : "text-yellow-400"
                    }>{doc.legal_impact.riskLevel}</span></div>
                    <div className="col-span-2"><span className="text-slate-500">Basis:</span> <span className="text-slate-300">{doc.legal_impact.legalBasis}</span></div>
                  </div>
                  {doc.legal_impact.warnings?.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {doc.legal_impact.warnings.map((w: string, i: number) => (
                        <p key={i} className="text-[11px] text-yellow-300 flex items-start gap-1.5">
                          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />{w}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Legal Articles */}
              {doc.legal_articles?.length > 0 && (
                <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Applicable Articles</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {doc.legal_articles.map((a: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-700 text-blue-400">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ═══ RIGHT: Verification Table ═══ */}
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
                <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
                    <Edit3 className="w-3.5 h-3.5 text-blue-400" /> Extracted Fields
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">{fields.filter(f => f.confirmed).length}/{fields.length} confirmed</span>
                    <button onClick={confirmAll} className="px-2 py-1 rounded text-[10px] font-bold bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/30 transition-colors flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Approve All
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-700/50">
                  {fields.map((f, idx) => (
                    <div key={f.key} className={`px-4 py-3 ${f.mismatch && !f.confirmed ? "bg-amber-500/5" : ""}`}>
                      {/* Field header */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-300">{f.label}</span>
                        <div className="flex items-center gap-2">
                          {/* Confidence bar */}
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${confColor(f.confidence)}`} style={{ width: `${f.confidence * 100}%` }} />
                            </div>
                            <span className={`text-[9px] font-bold ${f.confidence >= 0.8 ? "text-green-400" : f.confidence >= 0.5 ? "text-yellow-400" : "text-red-400"}`}>
                              {confLabel(f.confidence)}
                            </span>
                          </div>
                          {/* Confirm button */}
                          <button onClick={() => updateField(idx, { confirmed: !f.confirmed })}
                            className={`p-1 rounded ${f.confirmed ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-slate-500 hover:text-white"} transition-colors`}>
                            {f.confirmed ? <Check className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Values */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] text-slate-600 uppercase">AI Extracted</span>
                          <input value={f.edited} onChange={e => updateField(idx, { edited: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 text-xs mt-0.5 focus:outline-none focus:border-blue-500/50" />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-600 uppercase">Current Record</span>
                          <div className={`w-full px-2 py-1 rounded text-xs mt-0.5 ${
                            f.existing ? (f.mismatch ? "bg-amber-500/10 border border-amber-500/30 text-amber-300" : "bg-slate-900 border border-slate-700 text-slate-300") : "bg-slate-900 border border-slate-700 text-slate-500 italic"
                          }`}>
                            {f.existing ?? "No existing value"}
                          </div>
                        </div>
                      </div>

                      {/* Mismatch warning */}
                      {f.mismatch && !f.confirmed && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-amber-400">
                          <AlertTriangle className="w-3 h-3" />
                          Value differs from current record — review before confirming
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {fields.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">No extracted fields to verify</div>
                )}
              </div>

              {/* Sync options + Submit */}
              {fields.length > 0 && (
                <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={syncToWorker} onChange={e => setSyncToWorker(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600" />
                    <span className="text-xs text-slate-300 font-medium">Sync confirmed fields to worker record</span>
                  </label>

                  <button onClick={() => verify.mutate()}
                    disabled={verify.isPending || fields.filter(f => f.confirmed).length === 0}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
                    {verify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Confirm & {syncToWorker ? "Sync to Worker" : "Save Verification"}
                  </button>

                  {verify.isSuccess && (
                    <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-400 text-center">
                      Verified and {syncToWorker ? "synced to worker record" : "saved"} successfully
                    </div>
                  )}

                  {verify.isError && (
                    <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 text-center">
                      {verify.error instanceof Error ? verify.error.message : "Verification failed"}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-600 text-center">
                    {fields.filter(f => f.confirmed).length} field(s) confirmed · {fields.filter(f => f.mismatch && !f.confirmed).length} mismatch(es) pending review
                  </p>
                </div>
              )}

              {/* Back button */}
              <button onClick={() => { setDocId(""); setFields([]); }}
                className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                <RefreshCcw className="w-3 h-3" /> Verify another document
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
