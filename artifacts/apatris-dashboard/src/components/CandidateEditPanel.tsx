import React, { useEffect, useRef, useState } from "react";
import { X, Upload, CheckCircle2, Loader2, Save, FileText, Shield, Award, MapPin, Clock, Plus } from "lucide-react";
import { useGetWorker } from "@workspace/api-client-react";
import { getGetWorkerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const LIME = "#E9FF70";
const LIME_BG = "rgba(233,255,112,0.10)";
const LIME_BORDER = "rgba(233,255,112,0.28)";

const JOB_ROLES = [
  "TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR",
  "Teacher", "Nurse", "Engineer", "IT Specialist", "Logistics", "Other",
];

/* ── Inline upload slot ────────────────────────────────────────────── */
function DocUploadSlot({
  workerId,
  docType,
  icon: Icon,
  label,
  hint,
  iconColor,
}: {
  workerId: string;
  docType: "passport" | "trc" | "bhp";
  icon: React.ElementType;
  label: string;
  hint: string;
  iconColor: string;
}) {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [fileName, setFileName] = useState("");
  const [autoFilled, setAutoFilled] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setState("uploading");
    setFileName(file.name);
    setAutoFilled([]);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(workerId) });
      setState("done");
      const filled = data.autoFilled as Record<string, string> | undefined;
      const lines: string[] = [];
      if (filled?.trcExpiry) lines.push(`TRC Expiry: ${filled.trcExpiry}`);
      if (filled?.bhpExpiry) lines.push(`BHP Expiry: ${filled.bhpExpiry}`);
      if (filled?.passportExpiry) lines.push(`Passport Expiry: ${filled.passportExpiry}`);
      if (filled?.specialization) lines.push(`Job Role: ${filled.specialization}`);
      if (filled?.name) lines.push(`Name: ${filled.name}`);
      setAutoFilled(lines);
      toast({
        title: data.scanned ? `✓ ${label} Scanned & Pushed` : `✓ ${label} Pushed to Airtable`,
        description: lines.length > 0 ? `AI extracted: ${lines.join(" · ")}` : `${label} saved to this candidate's record.`,
        variant: "success" as any,
      });
      setTimeout(() => setState("idle"), 5000);
    } catch (err) {
      setState("error");
      toast({ title: "Upload Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setTimeout(() => setState("idle"), 4000);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const isUploading = state === "uploading";
  const isDone = state === "done";
  const isError = state === "error";

  return (
    <div
      className="rounded-xl border p-4 transition-all"
      style={{
        background: isDone ? "rgba(34,197,94,0.07)" : isError ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.03)",
        borderColor: isDone ? "rgba(34,197,94,0.35)" : isError ? "rgba(239,68,68,0.35)" : LIME_BORDER,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: LIME_BG, border: `1px solid ${LIME_BORDER}` }}
        >
          <Icon className="w-4 h-4" style={{ color: iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{label}</p>
          <p className="text-[10px] font-mono text-gray-500">{hint}</p>
        </div>
        {isDone && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />}
      </div>

      {autoFilled.length > 0 && (
        <div
          className="mb-3 px-3 py-2 rounded-lg text-[10px] font-mono space-y-0.5"
          style={{ background: LIME_BG, border: `1px solid ${LIME_BORDER}`, color: LIME }}
        >
          {autoFilled.map((l) => <p key={l}>✓ {l}</p>)}
        </div>
      )}

      <label
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border-2 border-dashed cursor-pointer transition-all text-xs font-bold uppercase tracking-wide select-none"
        style={
          isUploading
            ? { borderColor: "rgba(255,255,255,0.1)", color: "#6b7280", cursor: "not-allowed" }
            : isDone
            ? { borderColor: "rgba(34,197,94,0.5)", color: "#4ade80" }
            : { borderColor: LIME_BORDER, color: LIME }
        }
        onMouseEnter={(e) => {
          if (!isUploading && !isDone) {
            (e.currentTarget as HTMLElement).style.background = LIME_BG;
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "";
        }}
      >
        <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFile} disabled={isUploading} />
        {isUploading ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
        ) : isDone ? (
          <><CheckCircle2 className="w-3.5 h-3.5" /> {fileName.length > 20 ? fileName.slice(0, 18) + "…" : fileName}</>
        ) : (
          <><Upload className="w-3.5 h-3.5" /> Click to upload / drag file</>
        )}
      </label>
    </div>
  );
}

/* ── Main panel ────────────────────────────────────────────────────── */
interface CandidateEditPanelProps {
  workerId: string | null;
  onClose: () => void;
}

export function CandidateEditPanel({ workerId, onClose }: CandidateEditPanelProps) {
  const { data: worker, isLoading } = useGetWorker(workerId || "", {
    query: { enabled: !!workerId },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [jobRole, setJobRole] = useState("");
  const [customJobRole, setCustomJobRole] = useState("");
  const [experience, setExperience] = useState("");
  const [qualification, setQualification] = useState("");
  const [siteLocation, setSiteLocation] = useState("");
  const [shiftHours, setShiftHours] = useState("");
  const [saving, setSaving] = useState(false);

  const isOpen = !!workerId;

  useEffect(() => {
    if (worker) {
      setJobRole(worker.specialization || "");
      setCustomJobRole("");
      setExperience((worker as any).yearsOfExperience || "");
      setQualification((worker as any).highestQualification || "");
      setSiteLocation((worker as any).siteLocation || "");
      setShiftHours("");
    }
  }, [worker]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const effectiveJobRole = jobRole === "__custom__" ? customJobRole : jobRole;

  const handleSave = async () => {
    if (!workerId) return;
    setSaving(true);
    try {
      const payload: Record<string, string | number> = {};
      if (effectiveJobRole) payload.specialization = effectiveJobRole;
      if (experience.trim()) payload.yearsOfExperience = experience.trim();
      if (qualification.trim()) payload.highestQualification = qualification.trim();
      if (siteLocation !== undefined) payload.siteLocation = siteLocation;
      const shiftHrsNum = parseFloat(shiftHours);
      if (!isNaN(shiftHrsNum) && shiftHrsNum > 0) payload.shiftHours = shiftHrsNum;

      if (Object.keys(payload).length === 0) {
        toast({ title: "Nothing to save", description: "Fill in at least one field before saving.", variant: "destructive" });
        return;
      }

      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(err.error ?? "Save failed");
      }
      await queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(workerId) });
      const saved: string[] = [];
      if (payload.specialization) saved.push(`Job Role: ${payload.specialization}`);
      if (payload.yearsOfExperience) saved.push(`Experience: ${payload.yearsOfExperience} yrs`);
      if (payload.highestQualification) saved.push(`Qualification: ${payload.highestQualification}`);
      if (payload.siteLocation !== undefined) saved.push(`Site: ${payload.siteLocation || "Available"}`);
      if (payload.shiftHours) saved.push(`+${payload.shiftHours}h added to Total Hours`);
      toast({
        title: "✓ Candidate Record Updated",
        description: saved.join(" · "),
        variant: "success" as any,
      });
    } catch (err) {
      toast({ title: "Save Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      />

      {/* Slide panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-900 border-l shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        style={{ borderColor: LIME_BORDER }}
      >
        {/* Header */}
        <div
          className="px-6 py-5 border-b flex items-center justify-between flex-shrink-0"
          style={{ background: "rgba(233,255,112,0.04)", borderColor: LIME_BORDER }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: LIME, boxShadow: "0 0 12px rgba(233,255,112,0.25)" }}
            >
              <span className="text-xs font-black" style={{ color: "#333333", fontFamily: "Arial Black, Arial, sans-serif" }}>EEJ</span>
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-wide uppercase">Edit Candidate</h2>
              <p className="text-[10px] font-mono mt-0.5" style={{ color: LIME, opacity: 0.7 }}>
                {isLoading ? "Loading…" : worker?.name ?? "—"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {isLoading || !worker ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: LIME, borderTopColor: "transparent" }} />
          </div>
        ) : (
          <div className="flex-1 p-6 space-y-6">

            {/* — Worker info strip — */}
            <div
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: LIME_BG, border: `1px solid ${LIME_BORDER}` }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black uppercase flex-shrink-0"
                style={{ background: LIME, color: "#333333" }}
              >
                {worker.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-white text-sm truncate">{worker.name}</p>
                <p className="text-xs font-mono text-gray-400 truncate">{worker.email || "No email"}</p>
              </div>
            </div>

            {/* ── SECTION 1: Document Upload ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1" style={{ background: LIME_BORDER }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: LIME }}>Push Documents</span>
                <div className="h-px flex-1" style={{ background: LIME_BORDER }} />
              </div>
              <p className="text-[10px] text-gray-500 font-mono mb-4">
                Uploading updates this candidate's existing Airtable record — no new row is created.
              </p>
              <div className="space-y-3">
                <DocUploadSlot
                  workerId={worker.id}
                  docType="passport"
                  icon={FileText}
                  label="Update Passport"
                  hint="AI extracts: Name · DOB · Nationality · Expiry"
                  iconColor={LIME}
                />
                <DocUploadSlot
                  workerId={worker.id}
                  docType="trc"
                  icon={Award}
                  label="Update TRC Certificate"
                  hint="AI extracts: TRC Expiry · Job Role / Spec"
                  iconColor="#4ade80"
                />
                <DocUploadSlot
                  workerId={worker.id}
                  docType="bhp"
                  icon={Shield}
                  label="Update Medical / BHP"
                  hint="AI extracts: BHP Expiry date"
                  iconColor="#fb923c"
                />
              </div>
            </div>

            {/* ── SECTION 2: Manual Fields ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1" style={{ background: LIME_BORDER }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: LIME }}>Manual Update</span>
                <div className="h-px flex-1" style={{ background: LIME_BORDER }} />
              </div>
              <div className="space-y-4">

                {/* Job Role */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>
                    Job Role
                  </label>
                  <div className="relative">
                    <select
                      value={jobRole}
                      onChange={(e) => setJobRole(e.target.value)}
                      className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono appearance-none focus:outline-none transition-colors pr-8"
                      style={{ border: `1px solid ${LIME_BORDER}` }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = LIME; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = LIME_BORDER; }}
                    >
                      <option value="">— Select Job Role —</option>
                      {JOB_ROLES.filter((r) => r !== "Other").map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                      <option value="__custom__">Custom / Other…</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {jobRole === "__custom__" && (
                    <input
                      type="text"
                      value={customJobRole}
                      onChange={(e) => setCustomJobRole(e.target.value)}
                      placeholder="e.g. Senior Welder, Nurse, Teacher…"
                      className="mt-2 w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none placeholder:text-gray-600"
                      style={{ border: `1px solid ${LIME_BORDER}` }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = LIME; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = LIME_BORDER; }}
                    />
                  )}
                </div>

                {/* Experience */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>
                    Years of Experience
                  </label>
                  <input
                    type="text"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder="e.g. 5  or  10+"
                    className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none placeholder:text-gray-600"
                    style={{ border: `1px solid ${LIME_BORDER}` }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = LIME; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = LIME_BORDER; }}
                  />
                </div>

                {/* Qualification */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>
                    Highest Qualification
                  </label>
                  <input
                    type="text"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    placeholder="e.g. Bachelor, Master, Diploma…"
                    className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none placeholder:text-gray-600"
                    style={{ border: `1px solid ${LIME_BORDER}` }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = LIME; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = LIME_BORDER; }}
                  />
                </div>
              </div>
            </div>

            {/* ── SECTION 3: Hours Tracker ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1" style={{ background: LIME_BORDER }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: LIME }}>Hours Tracker</span>
                <div className="h-px flex-1" style={{ background: LIME_BORDER }} />
              </div>

              {/* Current total display */}
              {(worker as any).totalHours !== null && (worker as any).totalHours !== undefined && (
                <div
                  className="flex items-center gap-3 p-3 rounded-xl mb-3"
                  style={{ background: "rgba(233,255,112,0.06)", border: `1px solid ${LIME_BORDER}` }}
                >
                  <Clock className="w-4 h-4 flex-shrink-0" style={{ color: LIME }} />
                  <div>
                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Current Total</p>
                    <p className="text-lg font-black tabular-nums" style={{ color: LIME }}>
                      {(worker as any).totalHours % 1 === 0
                        ? (worker as any).totalHours
                        : Number((worker as any).totalHours).toFixed(1)}{" "}
                      <span className="text-sm font-mono text-gray-400">hours</span>
                    </p>
                  </div>
                </div>
              )}

              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: LIME }}>
                Add Shift Hours
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={shiftHours}
                    onChange={(e) => setShiftHours(e.target.value)}
                    placeholder="e.g. 8  or  8.5"
                    className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none placeholder:text-gray-600 pr-12"
                    style={{ border: `1px solid ${LIME_BORDER}` }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = LIME; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = LIME_BORDER; }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-500">hrs</span>
                </div>
                {shiftHours && !isNaN(parseFloat(shiftHours)) && parseFloat(shiftHours) > 0 && (
                  <div
                    className="flex items-center gap-1 px-3 py-2.5 rounded-lg text-xs font-black whitespace-nowrap"
                    style={{ background: LIME, color: "#333333" }}
                  >
                    <Plus className="w-3 h-3" />
                    {parseFloat(shiftHours)}h
                  </div>
                )}
              </div>
              <p className="text-[10px] font-mono text-gray-600 mt-1.5">
                This value will be ADDED to the existing total — not replaced.
              </p>
            </div>

            {/* ── SECTION 4: Client Assignment ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1" style={{ background: LIME_BORDER }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: LIME }}>Assign To Client</span>
                <div className="h-px flex-1" style={{ background: LIME_BORDER }} />
              </div>
              <p className="text-[10px] text-gray-500 font-mono mb-3">
                Enter any company name (e.g. "Amazon Logistics", "Berlin Hospital"). Leave blank or type "Available" to mark as unassigned.
              </p>
              <div className="relative">
                <input
                  type="text"
                  value={siteLocation}
                  onChange={(e) => setSiteLocation(e.target.value)}
                  placeholder='e.g. Amazon Logistics, Berlin Hospital, Available…'
                  className="w-full bg-slate-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none placeholder:text-gray-600 transition-colors"
                  style={{ border: `1px solid ${LIME_BORDER}` }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = LIME; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = LIME_BORDER; }}
                />
              </div>
              {siteLocation && siteLocation.trim() !== "" && siteLocation !== "Available" && (
                <div
                  className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: "#E9FF70", color: "#333333" }}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Assigning to: {siteLocation}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {!isLoading && worker && (
          <div
            className="px-6 py-4 border-t flex gap-3 flex-shrink-0"
            style={{ borderColor: LIME_BORDER, background: "rgba(0,0,0,0.2)" }}
          >
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border text-sm font-bold uppercase tracking-wider text-gray-300 hover:text-white transition-all hover:bg-white/5"
              style={{ borderColor: "rgba(255,255,255,0.12)" }}
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: LIME, color: "#333333" }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving…" : "Save to Airtable"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
