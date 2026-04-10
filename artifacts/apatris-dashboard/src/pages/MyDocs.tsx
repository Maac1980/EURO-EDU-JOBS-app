import { useState, useEffect } from "react";
import { FileText, Upload } from "lucide-react";
import { useAuth } from "@/lib/auth";
function getToken() { return localStorage.getItem("apatris_jwt") ?? sessionStorage.getItem("eej_token") ?? ""; }
export default function MyDocs() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<any[]>([]);
  useEffect(() => { fetch("/api/legal/documents", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(d => setDocs(d.documents ?? [])).catch(() => {}); }, []);
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><FileText className="w-6 h-6" /> My Documents</h1>
      <div className="bg-card border border-border rounded-xl p-5">
        {docs.length === 0 ? <div className="text-center py-12"><Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" /><p className="text-sm text-muted-foreground">No documents yet</p></div> : (
          <div className="space-y-2">{docs.slice(0, 20).map((d: any) => (
            <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20"><div><div className="text-sm text-white font-medium">{d.title ?? d.doc_type ?? "Document"}</div><div className="text-xs text-muted-foreground">{d.status ?? "draft"} · {d.created_at ? new Date(d.created_at).toLocaleDateString() : "—"}</div></div>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: d.status === "approved" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)", color: d.status === "approved" ? "#22c55e" : "#f59e0b" }}>{d.status ?? "draft"}</span></div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
