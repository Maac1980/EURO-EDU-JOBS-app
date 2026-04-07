import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import { Settings, Building2, Mail, Phone, Globe, Users, Shield, Save } from "lucide-react";

export default function AgencySettings() {
  const { toast } = useToast();

  const { data: tenantData } = useQuery({
    queryKey: ["tenant-settings"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/tenants/current`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const tenant = (tenantData as any)?.tenant ?? null;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Settings className="w-6 h-6" /> Agency Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Building2 className="w-4 h-4" /> Company Info</h2>
          <div className="space-y-3 text-sm">
            <Field label="Name" value={tenant?.name ?? "Euro Edu Jobs Sp. z o.o."} />
            <Field label="NIP" value={tenant?.nip ?? "—"} />
            <Field label="REGON" value={tenant?.regon ?? "—"} />
            <Field label="Address" value={tenant?.address ?? "Warsaw, Poland"} />
            <Field label="Country" value="Poland" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Mail className="w-4 h-4" /> Contact</h2>
          <div className="space-y-3 text-sm">
            <Field label="Admin" value={tenant?.admin_name ?? "—"} />
            <Field label="Email" value={tenant?.admin_email ?? "—"} />
            <Field label="Phone" value={tenant?.phone ?? "—"} />
            <Field label="Website" value={tenant?.website ?? "—"} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> Workforce</h2>
          <div className="space-y-3 text-sm">
            <Field label="Active Workers" value={tenant?.worker_count ?? "—"} />
            <Field label="Plan" value={tenant?.plan ?? "Professional"} />
            <Field label="Worker Limit" value={tenant?.worker_limit ?? "100"} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Shield className="w-4 h-4" /> Compliance</h2>
          <div className="space-y-3 text-sm">
            <Field label="GDPR Officer" value={tenant?.gdpr_officer ?? "—"} />
            <Field label="RODO Consent" value="Active" accent="text-emerald-400" />
            <Field label="PIP Insurance" value={tenant?.pip_insurance ?? "—"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-white font-medium ${accent ?? ""}`}>{value}</span>
    </div>
  );
}
