/**
 * Knowledge Graph Patterns — search historical cases, view graph stats.
 */
import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { Search, Loader2, Scale, Activity, ChevronRight } from "lucide-react";

export default function KnowledgeGraphPage() {
  const [docType, setDocType] = useState("");
  const [voivodeship, setVoivodeship] = useState("");
  const [nationality, setNationality] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);

  const { data: stats } = useQuery<any>({
    queryKey: ["kg-stats"], queryFn: () => fetch(`${BASE}api/legal/patterns/stats`, { headers: authHeaders() }).then(r => r.json()),
  });

  const search = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/legal/patterns/search`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ query: query || undefined, docType: docType || undefined, voivodeship: voivodeship || undefined, nationality: nationality || undefined }),
      });
      return r.json();
    },
    onSuccess: setResults,
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div><h1 className="text-xl font-bold text-white">Knowledge Graph</h1>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Pattern Search · Historical Cases · Graph Memory</p></div>

        {stats && (
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
              <p className="text-2xl font-black text-blue-400">{stats.graph?.totalNodes ?? 0}</p><p className="text-[10px] text-slate-500 uppercase">Nodes</p></div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
              <p className="text-2xl font-black text-green-400">{stats.graph?.totalEdges ?? 0}</p><p className="text-[10px] text-slate-500 uppercase">Edges</p></div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
              <p className="text-2xl font-black text-purple-400">{stats.patterns?.total ?? 0}</p><p className="text-[10px] text-slate-500 uppercase">Patterns</p></div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
              <p className="text-2xl font-black text-yellow-400">{stats.topLegalStatutes?.length ?? 0}</p><p className="text-[10px] text-slate-500 uppercase">Statutes</p></div>
          </div>
        )}

        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <input value={docType} onChange={e => setDocType(e.target.value)} placeholder="Doc type (e.g., TRC_APPLICATION)" className="bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-xs" />
            <input value={voivodeship} onChange={e => setVoivodeship(e.target.value)} placeholder="Voivodeship" className="bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-xs" />
            <input value={nationality} onChange={e => setNationality(e.target.value)} placeholder="Nationality" className="bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-xs" />
          </div>
          <div className="flex gap-2">
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") search.mutate(); }}
              placeholder="Ask: 'Find successful TRC appeals in Wrocław'" className="flex-1 bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-sm" />
            <button onClick={() => search.mutate()} disabled={search.isPending} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-sm font-bold flex items-center gap-1">
              {search.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {results && (
          <div className="space-y-3">
            {results.aiInsight && <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
              <h3 className="text-xs font-bold text-purple-400 uppercase mb-1">AI Insight</h3>
              <p className="text-xs text-slate-300">{results.aiInsight}</p></div>}
            {(results.patterns ?? []).map((p: any, i: number) => (
              <div key={i} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 flex items-center justify-between">
                <div><p className="text-xs text-white font-medium">{p.description}</p>
                  <p className="text-[10px] text-slate-500">Outcome: {p.outcome} · Freq: {p.frequency}x</p></div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${(p.confidence ?? 0) >= 0.7 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                  {Math.round((p.confidence ?? 0) * 100)}%</span>
              </div>
            ))}
            {(results.patterns ?? []).length === 0 && <p className="text-xs text-slate-500 text-center py-4">No patterns found. Verify more documents to build the knowledge graph.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
