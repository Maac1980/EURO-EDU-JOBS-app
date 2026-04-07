import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Shield, Key, LogOut, Save } from "lucide-react";

export default function Profile() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ name: user?.name ?? "", email: user?.email ?? "" });

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><User className="w-6 h-6" /> My Profile</h1>

      <div className="max-w-lg space-y-4">
        {/* Avatar + Name */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center">
              <span className="text-3xl font-bold text-primary">{(user?.name ?? "U").charAt(0)}</span>
            </div>
            <div>
              <p className="text-xl font-bold text-white">{user?.name ?? "User"}</p>
              <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Shield className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold text-primary uppercase">{user?.role ?? "—"}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground"><Mail className="w-4 h-4" /> Email</div>
              <span className="text-white font-mono">{user?.email ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground"><Shield className="w-4 h-4" /> Role</div>
              <span className="text-white">{user?.role ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2 text-muted-foreground"><Key className="w-4 h-4" /> Session</div>
              <span className="text-xs text-emerald-400 font-bold">Active</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-card border border-border rounded-xl p-4">
          <button onClick={() => { logout(); toast({ description: "Logged out" }); }}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm font-bold transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
