import { useState, useEffect } from "react";
import { FileSignature, Check, Clock } from "lucide-react";
function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
export default function SignatureTracking() {
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/signatures/pending", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(d => setPending(d.pendingSignatures ?? [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  const sign = async (id: string) => {
    await fetch(`/api/signatures/${id}/sign`, { method: "PATCH", headers: { Authorization: `Bearer ${getToken()}` } });
    setPending(p => p.filter(s => s.id !== id));
  };
  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><FileSignature className="w-6 h-6 text-primary" /> Signature Tracking</h1>
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-bold text-white mb-4">{pending.length} Pending Signatures</h2>
        {pending.length === 0 ? <div className="text-muted-foreground text-sm py-8 text-center">No pending signatures</div> : (
          <div className="space-y-2">{pending.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div><div className="text-sm text-white font-medium">{s.document_title ?? s.notes ?? "Document"}</div><div className="text-xs text-muted-foreground">{s.doc_type ?? "—"} · {new Date(s.created_at).toLocaleDateString()}</div></div>
              <button onClick={() => sign(s.id)} className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold flex items-center gap-1"><Check className="w-3 h-3" /> Sign</button>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
