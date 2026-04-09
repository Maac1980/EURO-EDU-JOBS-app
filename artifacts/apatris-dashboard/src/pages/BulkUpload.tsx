import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, Download, X } from "lucide-react";

interface ParsedRow { name: string; phone?: string; email?: string; specialization?: string; site?: string; nationality?: string; [key: string]: string | undefined; }

const CSV_TEMPLATE = "Name,Phone,Email,Specialization,Assigned Site,Nationality,Visa Type,PESEL,IBAN,Hourly Rate,TRC Expiry,Work Permit Expiry,Contract End,BHP Expiry,Medical Expiry\nJan Kowalski,+48601234567,jan@example.com,Welder TIG,Wroclaw-Site-A,Polish,EU Citizen,,PL61109010140000071219812874,35.00,,,2027-06-30,2026-12-01,2027-01-15\nOlena Petryk,+380671234567,olena@example.com,Healthcare Assistant,Warsaw-MediCare,Ukrainian,Type A,,,,2026-08-15,2026-09-01,2026-12-31,2026-10-01,2026-11-15";

export default function BulkUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [status, setStatus] = useState<"idle" | "parsed" | "importing" | "done" | "error">("idle");
  const [imported, setImported] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "eej_worker_import_template.csv"; a.click();
    toast({ description: "Template downloaded" });
  };

  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      const row: ParsedRow = { name: "" };
      headers.forEach((h, i) => {
        if (h === "name" || h === "full_name" || h === "fullname") row.name = vals[i] ?? "";
        else row[h.replace(/\s+/g, "_")] = vals[i];
      });
      return row;
    }).filter(r => r.name.trim().length > 0);
  };

  const handleFile = (f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target?.result as string);
      setRows(parsed);
      setStatus(parsed.length > 0 ? "parsed" : "idle");
      if (parsed.length === 0) toast({ description: "No valid rows found", variant: "destructive" });
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    setStatus("importing"); setImported(0); setErrors([]);
    let ok = 0; const errs: string[] = [];

    for (const row of rows) {
      try {
        const body: Record<string, string> = { name: row.name };
        if (row.phone) body.phone = row.phone;
        if (row.email) body.email = row.email;
        if (row.specialization) body.specialization = row.specialization;
        if (row.assigned_site || row.site) body.siteLocation = row.assigned_site ?? row.site ?? "";
        if (row.nationality) body.nationality = row.nationality;
        if (row.visa_type) body.visaType = row.visa_type;
        if (row.pesel) body.pesel = row.pesel;
        if (row.iban) body.iban = row.iban;
        if (row.hourly_rate || row.rate) body.hourlyNettoRate = row.hourly_rate ?? row.rate ?? "";
        if (row.trc_expiry) body.trcExpiry = row.trc_expiry;
        if (row.work_permit_expiry) body.workPermitExpiry = row.work_permit_expiry;
        if (row.contract_end) body.contractEndDate = row.contract_end;
        if (row.bhp_expiry) body.bhpExpiry = row.bhp_expiry;
        if (row.medical_expiry) body.medicalExpiry = row.medical_expiry;

        const res = await fetch(`${BASE}/api/workers`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
        if (res.ok) { ok++; setImported(ok); }
        else { const e = await res.json().catch(() => ({})); errs.push(`${row.name}: ${(e as any).error ?? "Failed"}`); }
      } catch { errs.push(`${row.name}: network error`); }
    }

    setErrors(errs);
    setStatus(errs.length === 0 ? "done" : "error");
    queryClient.invalidateQueries();
    toast({ description: `Imported ${ok}/${rows.length} workers${errs.length > 0 ? `, ${errs.length} errors` : ""}` });
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Upload className="w-6 h-6" /> Bulk Upload</h1>
          <p className="text-sm text-muted-foreground mt-1">Import workers from CSV file</p>
        </div>
        <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-4 py-2 bg-card border border-border rounded-lg text-sm font-bold text-white hover:bg-muted">
          <Download className="w-4 h-4" /> Template
        </button>
      </div>

      {status === "idle" || status === "error" ? (
        <div className="bg-card border border-border rounded-xl p-8">
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="text-white font-bold mb-1">{file ? file.name : "Drop CSV file here"}</p>
            <p className="text-sm text-muted-foreground mb-4">or click to browse — Name column required</p>
          </div>
          {errors.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 space-y-1">
              {errors.map((e, i) => <p key={i}><AlertTriangle className="w-3 h-3 inline mr-1" />{e}</p>)}
            </div>
          )}
        </div>
      ) : status === "parsed" ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <p className="text-sm font-bold text-white">{rows.length} workers ready to import</p>
            <div className="flex gap-2">
              <button onClick={() => { setStatus("idle"); setRows([]); setFile(null); }} className="px-3 py-1.5 text-xs bg-muted rounded-lg text-white">Cancel</button>
              <button onClick={handleImport} className="px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-bold">Import All</button>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="text-left p-3">#</th><th className="text-left p-3">Name</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Nationality</th><th className="text-left p-3">Spec</th><th className="text-left p-3">Site</th><th className="text-left p-3">Rate</th>
            </tr></thead>
            <tbody>{rows.slice(0, 50).map((r, i) => (
              <tr key={i} className="border-b border-border/50"><td className="p-3 text-muted-foreground">{i + 1}</td><td className="p-3 text-white font-medium">{r.name}</td><td className="p-3">{r.phone ?? "—"}</td><td className="p-3">{r.nationality ?? "—"}</td><td className="p-3">{r.specialization ?? "—"}</td><td className="p-3">{r.assigned_site ?? r.site ?? "—"}</td><td className="p-3 text-primary font-mono">{r.hourly_rate ?? r.rate ?? "—"}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : status === "importing" ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
          <p className="text-white font-bold">Importing {imported}/{rows.length}...</p>
          <div className="w-64 h-2 bg-muted rounded-full mx-auto mt-4"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(imported / rows.length) * 100}%` }} /></div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-400" />
          <p className="text-white font-bold text-lg">Import Complete</p>
          <p className="text-sm text-muted-foreground mt-1">{imported} workers imported successfully</p>
          <button onClick={() => { setStatus("idle"); setRows([]); setFile(null); setImported(0); }}
            className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold">Upload More</button>
        </div>
      )}
    </div>
  );
}
