import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Building2, X, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const LIME = "#E9FF70";
const DARK = "#333333";

interface Client {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  nip: string;
  billingRate: number | null;
  notes: string;
  createdAt: string;
}

function getBase() {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

async function fetchClients(): Promise<{ clients: Client[] }> {
  const res = await fetch(`${getBase()}/api/clients`);
  if (!res.ok) throw new Error("Failed to load clients");
  return res.json();
}

const emptyForm = (): Omit<Client, "id" | "createdAt"> => ({
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  address: "",
  nip: "",
  billingRate: null,
  notes: "",
});

export function ClientManagementCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, error } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<Client, "id" | "createdAt">) => {
      const res = await fetch(`${getBase()}/api/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Create failed"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); setShowForm(false); setForm(emptyForm()); toast({ title: "✓ Klient dodany", variant: "success" as any }); },
    onError: (e: Error) => toast({ title: "Błąd", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Client> }) => {
      const res = await fetch(`${getBase()}/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Update failed"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); setEditId(null); toast({ title: "✓ Klient zaktualizowany", variant: "success" as any }); },
    onError: (e: Error) => toast({ title: "Błąd", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${getBase()}/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Delete failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); toast({ title: "✓ Klient usunięty", variant: "success" as any }); },
    onError: (e: Error) => toast({ title: "Błąd", description: e.message, variant: "destructive" }),
  });

  const inputCls = "w-full rounded-lg px-3 py-2 text-xs bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#E9FF70] transition-colors";

  function ClientForm({ initial, onSave, onCancel, saving }: {
    initial: Omit<Client, "id" | "createdAt">;
    onSave: (data: Omit<Client, "id" | "createdAt">) => void;
    onCancel: () => void;
    saving: boolean;
  }) {
    const [f, setF] = useState(initial);
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));
    return (
      <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: "rgba(233,255,112,0.2)", background: "rgba(233,255,112,0.03)" }}>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: LIME }}>Nazwa klienta *</label>
            <input className={inputCls} value={f.name} onChange={set("name")} placeholder="ABC Construction Sp. z o.o." required />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: LIME }}>Osoba kontaktowa</label>
            <input className={inputCls} value={f.contactPerson} onChange={set("contactPerson")} placeholder="Jan Kowalski" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: LIME }}>Email</label>
            <input type="email" className={inputCls} value={f.email} onChange={set("email")} placeholder="jan@firma.pl" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: LIME }}>Telefon</label>
            <input className={inputCls} value={f.phone} onChange={set("phone")} placeholder="+48 600 000 000" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: LIME }}>NIP</label>
            <input className={`${inputCls} font-mono`} value={f.nip} onChange={set("nip")} placeholder="1234567890" maxLength={10} />
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: LIME }}>Adres</label>
            <input className={inputCls} value={f.address} onChange={set("address")} placeholder="ul. Przykładowa 1, 00-001 Warszawa" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: LIME }}>Stawka Billingowa (zł/h)</label>
            <input type="number" className={inputCls} value={f.billingRate ?? ""} onChange={(e) => setF((p) => ({ ...p, billingRate: e.target.value ? Number(e.target.value) : null }))} placeholder="45.00" min="0" step="0.01" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: LIME }}>Notatki</label>
            <input className={inputCls} value={f.notes} onChange={set("notes")} placeholder="…" />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white bg-white/5 transition-all">Anuluj</button>
          <button onClick={() => onSave(f)} disabled={saving || !f.name.trim()} className="flex-1 py-2 rounded-lg text-xs font-black uppercase flex items-center justify-center gap-1 disabled:opacity-60 transition-all" style={{ background: LIME, color: DARK }}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Zapisz
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4" style={{ color: LIME }} />
          <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: LIME }}>Baza Klientów / Pracodawców</h3>
        </div>
        {!showForm && (
          <button onClick={() => { setShowForm(true); setForm(emptyForm()); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all hover:brightness-110" style={{ background: LIME, color: DARK }}>
            <Plus className="w-3.5 h-3.5" /> Dodaj klienta
          </button>
        )}
      </div>

      {showForm && (
        <ClientForm
          initial={form}
          onSave={(data) => createMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          saving={createMutation.isPending}
        />
      )}

      {isLoading && <div className="text-xs text-gray-500 font-mono py-4 text-center">Ładowanie klientów…</div>}
      {error && <div className="text-xs text-red-400 font-mono py-2">{(error as Error).message}</div>}

      {data && data.clients.length === 0 && !showForm && (
        <div className="text-center py-8 text-gray-600 font-mono text-xs">
          Brak klientów. Kliknij "Dodaj klienta" aby rozpocząć.
        </div>
      )}

      <div className="space-y-2">
        {(data?.clients ?? []).map((client) => (
          <div key={client.id}>
            {editId === client.id ? (
              <ClientForm
                initial={{ name: client.name, contactPerson: client.contactPerson, email: client.email, phone: client.phone, address: client.address, nip: client.nip, billingRate: client.billingRate, notes: client.notes }}
                onSave={(payload) => updateMutation.mutate({ id: client.id, payload })}
                onCancel={() => setEditId(null)}
                saving={updateMutation.isPending}
              />
            ) : (
              <div className="flex items-start justify-between p-3 rounded-xl border hover:border-white/20 transition-all" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white truncate">{client.name}</span>
                    {client.nip && <span className="text-[9px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">NIP: {client.nip}</span>}
                    {client.billingRate && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(233,255,112,0.1)", color: LIME }}>{client.billingRate.toFixed(2)} zł/h</span>}
                  </div>
                  {client.contactPerson && <p className="text-xs text-gray-400">{client.contactPerson}{client.email && ` · ${client.email}`}{client.phone && ` · ${client.phone}`}</p>}
                  {client.address && <p className="text-[10px] text-gray-600 font-mono">{client.address}</p>}
                </div>
                <div className="flex gap-1 ml-2 flex-shrink-0">
                  <button onClick={() => setEditId(client.id)} className="p-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors" title="Edytuj">
                    <Pencil className="w-3 h-3 text-gray-400 hover:text-white" />
                  </button>
                  <button onClick={() => { if (confirm(`Usunąć klienta "${client.name}"?`)) deleteMutation.mutate(client.id); }} className="p-1.5 rounded bg-white/5 hover:bg-red-900/30 transition-colors" title="Usuń">
                    <Trash2 className="w-3 h-3 text-gray-600 hover:text-red-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
