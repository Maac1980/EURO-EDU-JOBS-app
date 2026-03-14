import React, { useEffect, useRef, useState } from "react";
import { X, Mail, Phone, FileText, Download, Upload, CheckCircle2, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useGetWorker } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetWorkerQueryKey } from "@workspace/api-client-react";
import { StatusBadge } from "./ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

interface WorkerProfilePanelProps {
  workerId: string | null;
  onClose: () => void;
  onRenew: (worker: any) => void;
  onNotify: (worker: any) => void;
}

function DocRow({ label, date }: { label: string; date?: string | null }) {
  if (!date)
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-white/5">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="text-sm font-mono text-muted-foreground/50">N/A</span>
      </div>
    );

  const d = parseISO(date);
  const isExpired = d < new Date();
  const isWarning = !isExpired && d < new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg bg-background border ${
        isExpired
          ? "border-destructive/30"
          : isWarning
            ? "border-yellow-500/30"
            : "border-white/5"
      }`}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span
        className={`text-sm font-mono font-bold ${
          isExpired ? "text-destructive" : isWarning ? "text-yellow-400" : "text-green-400"
        }`}
      >
        {format(d, "MMM d, yyyy")}
      </span>
    </div>
  );
}

function AttachmentCard({ title, filename, url }: { title: string; filename: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-primary/30 transition-all cursor-pointer group flex flex-col items-center justify-center text-center gap-2"
    >
      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
        <FileText className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-xs text-muted-foreground font-mono truncate w-28">{filename}</p>
      </div>
      <Download className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2" />
    </a>
  );
}

function UploadButton({ workerId, docType, label }: { workerId: string; docType: "passport" | "contract"; label: string }) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setDone(false);
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
      setDone(true);

      const filled = data.autoFilled as Record<string, string> | undefined;
      const filledLines: string[] = [];
      if (filled?.name) filledLines.push(`Name: ${filled.name}`);
      if (filled?.dateOfBirth) filledLines.push(`DOB: ${filled.dateOfBirth}`);
      if (filled?.passportExpiry) filledLines.push(`Expires: ${filled.passportExpiry}`);
      if (filled?.contractEndDate) filledLines.push(`Contract end: ${filled.contractEndDate}`);
      if (filled?.nationality) filledLines.push(`Nationality: ${filled.nationality}`);

      const description = filledLines.length > 0
        ? `AI auto-filled: ${filledLines.join(" · ")}`
        : `${label} saved successfully.`;

      toast({ title: data.scanned ? "✓ Document Scanned & Saved" : "✓ Document Uploaded", description });
      setTimeout(() => setDone(false), 4000);
    } catch (err) {
      toast({ title: "Upload Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const isDone = done;
  const isUploading = uploading;

  return (
    <label className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all select-none font-semibold text-sm ${
      isDone
        ? "bg-green-500/15 border-green-500/50 text-green-400"
        : isUploading
          ? "bg-primary/10 border-primary/40 text-primary cursor-not-allowed"
          : "bg-white/5 border-dashed border-white/20 text-white hover:bg-primary/10 hover:border-primary/60 hover:text-primary"
    }`}>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFile} disabled={isUploading} />
      {isUploading
        ? <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
        : isDone
          ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          : <Upload className="w-5 h-5 flex-shrink-0" />
      }
      <span>
        {isUploading ? `Uploading ${label}…` : isDone ? `${label} Saved!` : `Upload ${label}`}
      </span>
    </label>
  );
}

export function WorkerProfilePanel({
  workerId,
  onClose,
  onRenew,
  onNotify,
}: WorkerProfilePanelProps) {
  const { t } = useTranslation();
  const { data: worker, isLoading } = useGetWorker(workerId || "", {
    query: { enabled: !!workerId },
  });

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const isOpen = !!workerId;

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-background/70 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      <div
        ref={panelRef}
        className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-white/10 shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {isLoading || !worker ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="p-6 border-b border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <button
                  onClick={onClose}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <div className="w-16 h-16 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xl font-bold uppercase">
                  {worker.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">{worker.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/10 text-muted-foreground border border-white/5">
                      {worker.specialization}
                    </span>
                    <StatusBadge status={worker.complianceStatus} />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-8 flex-1">
              <div className="grid grid-cols-1 gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground font-mono">
                    {worker.email || t("panel.noEmail")}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground font-mono">
                    {worker.phone || t("panel.noPhone")}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-4">
                  {t("panel.complianceTimeline")}
                </h3>
                <div className="space-y-3">
                  <DocRow label={t("panel.trcExpiry")} date={worker.trcExpiry} />
                  <DocRow label={t("panel.workPermitExpiry")} date={worker.workPermitExpiry} />
                  <DocRow label={t("panel.contractEndDate")} date={worker.contractEndDate} />
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-white/5">
                    <span className="text-sm font-medium text-foreground">{t("panel.bhpStatus")}</span>
                    <span
                      className={`text-sm font-mono font-bold ${
                        worker.bhpStatus === "Active" ? "text-green-400" : "text-destructive"
                      }`}
                    >
                      {worker.bhpStatus || "Unknown"}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-4">
                  {t("panel.documentVault")}
                </h3>

                {/* Existing attachments */}
                {(worker.passportAttachments?.length > 0 || worker.contractAttachments?.length > 0) && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {worker.passportAttachments?.map((att: any) => (
                      <AttachmentCard
                        key={att.id}
                        title={t("panel.passport")}
                        filename={att.filename}
                        url={att.url}
                      />
                    ))}
                    {worker.contractAttachments?.map((att: any) => (
                      <AttachmentCard
                        key={att.id}
                        title={t("panel.contract")}
                        filename={att.filename}
                        url={att.url}
                      />
                    ))}
                  </div>
                )}

                {/* Upload buttons — always visible */}
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-1">
                    Upload Document
                  </p>
                  <UploadButton workerId={worker.id} docType="passport" label="Passport" />
                  <UploadButton workerId={worker.id} docType="contract" label="Contract" />
                  <p className="text-xs text-muted-foreground/50 text-center">
                    PDF, JPG, PNG or WebP · AI scans images automatically
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-white/5 bg-background flex gap-3">
              <Button
                className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold uppercase tracking-wider"
                onClick={() => onNotify(worker)}
              >
                {t("panel.notify")}
              </Button>
              <Button
                className="flex-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 font-bold uppercase tracking-wider"
                onClick={() => onRenew(worker)}
              >
                {t("panel.renewDoc")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
