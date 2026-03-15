import React, { useCallback, useRef, useState } from "react";
import { X, Upload, Loader2, CheckCircle2, Zap, FileText, Shield, Award, Briefcase, GraduationCap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Category = "passport" | "bhp" | "certificate" | "contract" | "cv";

interface DropZoneFile {
  file: File;
  preview?: string;
}

const COLOR_MAP: Record<string, string> = {
  blue:   "border-lime-400/40 bg-lime-400/10 hover:border-lime-300/70 text-lime-300",
  orange: "border-orange-500/40 bg-orange-500/10 hover:border-orange-400/70 text-orange-400",
  green:  "border-green-500/40 bg-green-500/10 hover:border-green-400/70 text-green-400",
  purple: "border-purple-500/40 bg-purple-500/10 hover:border-purple-400/70 text-purple-400",
  indigo: "border-indigo-500/40 bg-indigo-500/10 hover:border-indigo-400/70 text-indigo-400",
};

const SPEC_OPTIONS = ["TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR"];

function DropZone({
  category,
  file,
  onFile,
  dropOrClick,
}: {
  category: { key: Category; label: string; icon: React.ElementType; color: string; hint: string };
  file: DropZoneFile | null;
  onFile: (f: File | null) => void;
  dropOrClick: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const Icon = category.icon;
  const colors = COLOR_MAP[category.color];

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all min-h-[120px] ${
        dragging ? "scale-[1.02] brightness-110" : ""
      } ${file ? "border-green-500/60 bg-green-500/10" : colors}`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <>
          <CheckCircle2 className="w-7 h-7 text-green-400" />
          <p className="text-xs font-bold text-green-300 text-center truncate w-full px-2">
            {file.file.name}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onFile(null); }}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </>
      ) : (
        <>
          <Icon className="w-6 h-6" />
          <p className="text-xs font-bold uppercase tracking-wider">{category.label}</p>
          <p className="text-[10px] text-center opacity-60 leading-tight">{category.hint}</p>
          <p className="text-[10px] opacity-40">{dropOrClick}</p>
        </>
      )}
    </div>
  );
}

export function BulkUploadModal({ isOpen, onClose }: BulkUploadModalProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<Partial<Record<Category, DropZoneFile>>>({});
  const [profession, setProfession] = useState("");
  const [customProfession, setCustomProfession] = useState("");
  const [status, setStatus] = useState<"idle" | "scanning" | "creating" | "done" | "error">("idle");
  const [result, setResult] = useState<{ name?: string; trcExpiry?: string; bhpExpiry?: string; contractEndDate?: string; specialization?: string; yearsOfExperience?: string; highestQualification?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const CATEGORIES: { key: Category; label: string; icon: React.ElementType; color: string; hint: string }[] = [
    { key: "passport", label: t("upload.passportLabel"), icon: FileText, color: "blue", hint: t("upload.passportHint") },
    { key: "bhp", label: t("upload.bhpLabel"), icon: Shield, color: "orange", hint: t("upload.bhpHint") },
    { key: "certificate", label: t("upload.trcLabel"), icon: Award, color: "green", hint: t("upload.trcHint") },
    { key: "contract", label: t("upload.contractLabel"), icon: Briefcase, color: "purple", hint: t("upload.contractHint") },
    { key: "cv", label: t("upload.cvLabel"), icon: GraduationCap, color: "indigo", hint: t("upload.cvHint") },
  ];

  const setFile = (cat: Category) => (f: File | null) => {
    setFiles((prev) => {
      const next = { ...prev };
      if (f) {
        next[cat] = { file: f };
      } else {
        delete next[cat];
      }
      return next;
    });
  };

  const totalFiles = Object.keys(files).length;
  const effectiveProfession = profession === "__custom__" ? customProfession : profession;

  const handleSubmit = async () => {
    if (totalFiles === 0) return;
    setStatus("scanning");
    setResult(null);
    setErrorMsg("");

    try {
      const form = new FormData();
      for (const [cat, df] of Object.entries(files)) {
        if (df) form.append(cat, df.file);
      }
      if (effectiveProfession) {
        form.append("profession", effectiveProfession);
      }

      setStatus("creating");
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/bulk-create`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Upload failed");
      }

      const data = await res.json();
      setResult(data.extracted ?? {});
      setStatus("done");

      await queryClient.invalidateQueries();
      toast({
        title: "✓ " + t("upload.workerCreated"),
        description: data.extracted?.name
          ? `"${data.extracted.name}" ${t("upload.recordSaved")}`
          : t("upload.recordSaved"),
        variant: "success" as any,
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleClose = () => {
    setFiles({});
    setProfession("");
    setCustomProfession("");
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-gradient-to-r from-yellow-900/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(233,255,112,0.12)", border: "1px solid rgba(233,255,112,0.25)" }}>
              <Zap className="w-5 h-5" style={{ color: "#E9FF70" }} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">{t("upload.title")}</h2>
              <p className="text-xs text-gray-400 font-mono">{t("upload.subtitle")}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {status === "idle" || status === "error" ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {CATEGORIES.filter(c => c.key !== "cv").map((cat) => (
                  <DropZone
                    key={cat.key}
                    category={cat}
                    file={files[cat.key] ?? null}
                    onFile={setFile(cat.key)}
                    dropOrClick={t("upload.dropOrClick")}
                  />
                ))}
              </div>
              <div className="mb-4">
                {CATEGORIES.filter(c => c.key === "cv").map((cat) => (
                  <DropZone
                    key={cat.key}
                    category={cat}
                    file={files[cat.key] ?? null}
                    onFile={setFile(cat.key)}
                    dropOrClick={t("upload.dropOrClick")}
                  />
                ))}
              </div>

              {/* Job Role field */}
              <div className="mb-4 p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {t("upload.jobRoleLabel")}
                  <span className="ml-1 text-gray-600 normal-case font-normal">{t("upload.jobRoleAiNote")}</span>
                </label>
                <select
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
                  style={{ transition: "border-color 0.2s" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(233,255,112,0.6)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = ""; }}
                >
                  <option value="">{t("upload.selectOrAi")}</option>
                  {SPEC_OPTIONS.filter(Boolean).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                  <option value="__custom__">{t("upload.customOption")}</option>
                </select>
                {profession === "__custom__" && (
                  <input
                    type="text"
                    placeholder={t("upload.typeProfession")}
                    value={customProfession}
                    onChange={(e) => setCustomProfession(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none placeholder:text-gray-600"
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(233,255,112,0.6)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = ""; }}
                  />
                )}
              </div>

              {status === "error" && (
                <div className="mb-4 p-3 rounded-lg text-sm font-mono" style={{ background: "rgba(233,255,112,0.08)", border: "1px solid rgba(233,255,112,0.25)", color: "#E9FF70" }}>
                  {errorMsg}
                </div>
              )}

              <p className="text-[11px] text-gray-500 text-center mb-4 font-mono">
                {totalFiles === 0
                  ? t("upload.noFilesNote")
                  : t("upload.filesReady_other", { count: totalFiles })}
              </p>

              <button
                onClick={handleSubmit}
                disabled={totalFiles === 0}
                className={`w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                  totalFiles === 0
                    ? "bg-white/5 text-gray-600 cursor-not-allowed border border-white/5"
                    : "text-white hover:opacity-90"
                }`}
                style={totalFiles > 0 ? { background: "#E9FF70", color: "#333333" } : {}}
              >
                <Zap className="w-4 h-4" />
                {t("upload.createWithAI")}
              </button>
            </>
          ) : status === "scanning" || status === "creating" ? (
            <div className="py-12 flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin" style={{ color: "#E9FF70" }} />
              <p className="text-white font-bold text-lg">
                {status === "scanning" ? t("upload.scanningDocs") : t("upload.creatingRecord")}
              </p>
              <p className="text-gray-400 text-sm font-mono">
                {status === "scanning"
                  ? t("upload.extractingFields")
                  : t("upload.writingAirtable")}
              </p>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-green-400" />
              </div>
              <div className="text-center">
                <p className="text-white font-bold text-lg">{t("upload.workerCreated")}</p>
                <p className="text-gray-400 text-sm font-mono mt-1">{t("upload.recordSaved")}</p>
              </div>

              {result && Object.keys(result).length > 0 && (
                <div className="w-full mt-2 p-4 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{t("upload.aiExtractedFields")}</p>
                  {result.name && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("upload.fieldName")}</span>
                      <span className="text-white font-medium">{result.name}</span>
                    </div>
                  )}
                  {result.specialization && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("upload.fieldSpec")}</span>
                      <span className="font-bold" style={{ color: "#E9FF70" }}>{result.specialization}</span>
                    </div>
                  )}
                  {result.trcExpiry && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("upload.fieldTrc")}</span>
                      <span className="text-green-400 font-medium">{result.trcExpiry}</span>
                    </div>
                  )}
                  {result.bhpExpiry && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("upload.fieldBhp")}</span>
                      <span className="text-green-400 font-medium">{result.bhpExpiry}</span>
                    </div>
                  )}
                  {result.contractEndDate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("upload.fieldContract")}</span>
                      <span className="text-green-400 font-medium">{result.contractEndDate}</span>
                    </div>
                  )}
                  {result.yearsOfExperience && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("upload.fieldExperience")}</span>
                      <span className="font-bold" style={{ color: "#E9FF70" }}>{result.yearsOfExperience} {t("table.yrs")}</span>
                    </div>
                  )}
                  {result.highestQualification && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("upload.fieldQualification")}</span>
                      <span className="text-indigo-300 font-bold">{result.highestQualification}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleClose}
                className="mt-2 px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white text-sm font-bold uppercase tracking-wider transition-all"
              >
                {t("upload.close")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
