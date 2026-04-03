import { User, Mail, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function Profile() {
  const { user } = useAuth();
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><User className="w-6 h-6" /> Profile</h1>
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">{user?.name?.charAt(0) ?? "U"}</span>
          </div>
          <div>
            <p className="text-lg font-bold text-white">{user?.name ?? "User"}</p>
            <p className="text-sm text-muted-foreground">{user?.role ?? "—"}</p>
          </div>
        </div>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3"><Mail className="w-4 h-4 text-muted-foreground" /><span className="text-white">{user?.email ?? "—"}</span></div>
          <div className="flex items-center gap-3"><Shield className="w-4 h-4 text-muted-foreground" /><span className="text-white">Role: {user?.role ?? "—"}</span></div>
        </div>
      </div>
    </div>
  );
}
