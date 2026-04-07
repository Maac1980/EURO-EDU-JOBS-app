import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE, extractList } from "@/lib/api";
import { Bell, Info, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface Update {
  id: string;
  type: string;
  message: string;
  created_at: string;
  level?: string;
}

export default function Updates() {
  const { data, isLoading } = useQuery({
    queryKey: ["system-updates"],
    queryFn: async () => {
      // Try audit log as updates source
      const res = await fetch(`${BASE}/api/audit?limit=50`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return extractList<any>(json, "logs", "entries", "audit").slice(0, 30);
    },
  });

  const updates = data ?? [];

  const getIcon = (action: string) => {
    if (action?.includes("create") || action?.includes("add")) return { icon: CheckCircle2, color: "text-emerald-400" };
    if (action?.includes("alert") || action?.includes("warning")) return { icon: AlertTriangle, color: "text-amber-400" };
    return { icon: Info, color: "text-blue-400" };
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Bell className="w-6 h-6" /> Updates</h1>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : updates.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <p className="text-white font-bold">No updates yet</p>
          <p className="text-sm text-muted-foreground mt-1">System activity will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {updates.map((u: any, i: number) => {
            const { icon: Icon, color } = getIcon(u.action ?? u.type ?? "");
            return (
              <div key={u.id ?? i} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                <div className="flex-1">
                  <p className="text-sm text-white">{u.action ?? u.message ?? u.type ?? "Activity"}{u.entity_type ? ` — ${u.entity_type}` : ""}</p>
                  {u.details && <p className="text-xs text-muted-foreground mt-0.5">{typeof u.details === "string" ? u.details : JSON.stringify(u.details).slice(0, 100)}</p>}
                  <p className="text-[10px] text-muted-foreground font-mono mt-1">
                    {u.created_at ? new Date(u.created_at).toLocaleString("en-GB") : ""}
                    {u.admin_name ? ` — ${u.admin_name}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
