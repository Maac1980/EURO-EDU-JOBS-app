import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
function getToken() { return localStorage.getItem("apatris_jwt") ?? sessionStorage.getItem("eej_token") ?? ""; }
export default function Updates() {
  const [notifs, setNotifs] = useState<any[]>([]);
  useEffect(() => { fetch("/api/legal/notifications", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(d => setNotifs(d.notifications ?? [])).catch(() => {}); }, []);
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Bell className="w-6 h-6" /> Updates & Notifications</h1>
      <div className="bg-card border border-border rounded-xl p-5">
        {notifs.length === 0 ? <p className="text-muted-foreground text-center py-8">No notifications</p> : (
          <div className="space-y-2">{notifs.slice(0, 20).map((n: any) => (
            <div key={n.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20"><div className="flex-1"><div className="text-sm text-white">{n.message?.substring(0, 80) ?? "Notification"}</div><div className="text-xs text-muted-foreground mt-1">{n.message_type ?? "update"} · {n.created_at ? new Date(n.created_at).toLocaleDateString() : "—"}</div></div>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: n.status === "sent" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)", color: n.status === "sent" ? "#22c55e" : "#f59e0b" }}>{n.status ?? "pending"}</span></div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
