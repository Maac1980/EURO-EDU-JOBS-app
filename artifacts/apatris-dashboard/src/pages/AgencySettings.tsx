import { useState, useEffect } from "react";
import { Settings, Building2, Mail } from "lucide-react";
function getToken() { return sessionStorage.getItem("eej_token") ?? ""; }
export default function AgencySettings() {
  const [profile, setProfile] = useState<any>(null);
  useEffect(() => { fetch("/api/admin/profile", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(setProfile).catch(() => {}); }, []);
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Settings className="w-6 h-6" /> Agency Settings</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5"><h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Building2 className="w-4 h-4" /> Company</h2><div className="space-y-3 text-sm"><div><span className="text-muted-foreground">Name:</span> <span className="text-white ml-2">Euro Edu Jobs Sp. z o.o.</span></div><div><span className="text-muted-foreground">Address:</span> <span className="text-white ml-2">Warsaw, Poland</span></div></div></div>
        <div className="bg-card border border-border rounded-xl p-5"><h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Mail className="w-4 h-4" /> Admin</h2><div className="space-y-3 text-sm"><div><span className="text-muted-foreground">Admin:</span> <span className="text-white ml-2">{profile?.fullName ?? profile?.full_name ?? "Anna Bondarenko"}</span></div><div><span className="text-muted-foreground">Email:</span> <span className="text-white ml-2">{profile?.email ?? "anna.b@edu-jobs.eu"}</span></div><div><span className="text-muted-foreground">Role:</span> <span className="text-white ml-2">{profile?.role ?? "Administrator"}</span></div></div></div>
      </div>
    </div>
  );
}
