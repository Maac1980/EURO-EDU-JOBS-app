import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE, extractList } from "@/lib/api";
import { FileText, Shield, Clock, CheckCircle2, AlertTriangle, Upload } from "lucide-react";

interface Doc {
  id: string;
  document_type?: string;
  doc_type?: string;
  status?: string;
  expiry_date?: string;
  uploaded_at?: string;
  file_name?: string;
}

function daysUntil(date: string | undefined): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function docStatus(days: number | null): { label: string; color: string; icon: typeof CheckCircle2 } {
  if (days === null) return { label: "No expiry", color: "text-slate-400", icon: Clock };
  if (days < 0) return { label: "Expired", color: "text-red-400", icon: AlertTriangle };
  if (days <= 30) return { label: `${days}d left`, color: "text-amber-400", icon: Clock };
  if (days <= 60) return { label: `${days}d left`, color: "text-yellow-400", icon: Clock };
  return { label: "Valid", color: "text-emerald-400", icon: CheckCircle2 };
}

export default function MyDocs() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-docs"],
    queryFn: async () => {
      // Try self-service endpoint first, fallback to documents
      const res = await fetch(`${BASE}/api/self-service/documents`, { headers: authHeaders() });
      if (!res.ok) return { contracts: [], permits: [], workflows: [] };
      return res.json();
    },
  });

  const contracts = (data as any)?.contracts ?? [];
  const permits = (data as any)?.permits ?? [];
  const workflows = (data as any)?.workflows ?? [];
  const allDocs = [...contracts.map((c: any) => ({ ...c, category: "Contract" })), ...permits.map((p: any) => ({ ...p, category: "Permit" })), ...workflows.map((w: any) => ({ ...w, category: "Document" }))];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><FileText className="w-6 h-6" /> My Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">{allDocs.length} documents on file</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : allDocs.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <p className="text-white font-bold">No documents on file</p>
          <p className="text-sm text-muted-foreground mt-1">Your documents will appear here once uploaded by your coordinator</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allDocs.map((doc: any, i: number) => {
            const days = daysUntil(doc.expiry_date);
            const st = docStatus(days);
            const Icon = st.icon;
            return (
              <div key={doc.id ?? i} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><FileText className="w-5 h-5 text-primary" /></div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{doc.document_type ?? doc.doc_type ?? doc.permit_type ?? doc.title ?? doc.category}</p>
                  <p className="text-xs text-muted-foreground">{doc.category}{doc.file_name ? ` — ${doc.file_name}` : ""}</p>
                </div>
                <div className="text-right text-xs">
                  {doc.expiry_date && <p className="text-muted-foreground font-mono">{new Date(doc.expiry_date).toLocaleDateString("en-GB")}</p>}
                  <p className={`font-bold flex items-center gap-1 justify-end ${st.color}`}><Icon className="w-3 h-3" />{st.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
