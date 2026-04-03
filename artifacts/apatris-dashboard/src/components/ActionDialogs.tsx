import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNotifyWorker, useUpdateWorker, getGetWorkersQueryKey, getGetWorkerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface ActionDialogProps {
  worker: any;
  isOpen: boolean;
  onClose: () => void;
}

export function NotifyDialog({ worker, isOpen, onClose }: ActionDialogProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("email");
  const notifyMutation = useNotifyWorker();
  const { toast } = useToast();

  const handleSend = () => {
    if (!message.trim()) return;
    notifyMutation.mutate(
      { id: worker.id, data: { message, channel } },
      {
        onSuccess: () => {
          toast({ title: t("notify.successTitle"), description: t("notify.successDesc", { name: worker.name, channel: channel.toUpperCase() }) });
          onClose();
          setMessage("");
        },
        onError: () => {
          toast({ title: t("notify.errorTitle"), description: t("notify.errorDesc"), variant: "destructive" });
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border border-white/10 shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-display font-bold">{t("notify.title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("notify.description")} <span className="text-white font-bold">{worker?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-display uppercase tracking-wider text-muted-foreground">{t("notify.channel")}</label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className={`flex-1 font-mono ${channel === 'email' ? 'border-primary text-primary bg-primary/10' : 'border-white/10 text-muted-foreground'}`}
                onClick={() => setChannel('email')}
              >
                EMAIL
              </Button>
              <Button
                variant="outline"
                className={`flex-1 font-mono ${channel === 'sms' ? 'border-primary text-primary bg-primary/10' : 'border-white/10 text-muted-foreground'}`}
                onClick={() => setChannel('sms')}
              >
                SMS
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-display uppercase tracking-wider text-muted-foreground">{t("notify.message")}</label>
            <textarea
              className="w-full h-32 px-3 py-2 bg-background border border-white/10 rounded-md text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-sans"
              placeholder={t("notify.messagePlaceholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-white">{t("notify.cancel")}</Button>
          <Button
            onClick={handleSend}
            disabled={!message.trim() || notifyMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-display uppercase tracking-wider"
          >
            {notifyMutation.isPending ? t("notify.sending") : t("notify.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RenewDialog({ worker, isOpen, onClose }: ActionDialogProps) {
  const { t } = useTranslation();
  const [docType, setDocType] = useState<"trcExpiry" | "workPermitExpiry" | "contractEndDate">("trcExpiry");
  const [newDate, setNewDate] = useState("");
  const updateMutation = useUpdateWorker();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleRenew = () => {
    if (!newDate) return;
    updateMutation.mutate(
      { id: worker.id, data: { [docType]: newDate } },
      {
        onSuccess: () => {
          toast({ title: t("renew.successTitle"), description: t("renew.successDesc", { name: worker.name }) });
          queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(worker.id) });
          onClose();
        },
        onError: () => {
          toast({ title: t("renew.errorTitle"), description: t("renew.errorDesc"), variant: "destructive" });
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border border-white/10 shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-display font-bold">{t("renew.title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("renew.description")} <span className="text-white font-bold">{worker?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-display uppercase tracking-wider text-muted-foreground">{t("renew.docType")}</label>
            <select
              className="w-full px-3 py-2 bg-background border border-white/10 rounded-md text-sm text-foreground focus:outline-none focus:border-primary transition-all font-sans"
              value={docType}
              onChange={(e) => setDocType(e.target.value as any)}
            >
              <option value="trcExpiry">{t("renew.trcExpiry")}</option>
              <option value="workPermitExpiry">{t("renew.workPermitExpiry")}</option>
              <option value="contractEndDate">{t("renew.contractEndDate")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-display uppercase tracking-wider text-muted-foreground">{t("renew.newExpiryDate")}</label>
            <input
              type="date"
              className="w-full px-3 py-2 bg-background border border-white/10 rounded-md text-sm text-foreground focus:outline-none focus:border-primary transition-all font-mono"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-white">{t("renew.cancel")}</Button>
          <Button
            onClick={handleRenew}
            disabled={!newDate || updateMutation.isPending}
            className="bg-success text-success-foreground hover:bg-success/90 font-display uppercase tracking-wider"
          >
            {updateMutation.isPending ? t("renew.updating") : t("renew.update")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
