import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNotifyWorker, useUpdateWorker, getGetWorkersQueryKey, getGetWorkerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface ActionDialogProps {
  worker: any;
  isOpen: boolean;
  onClose: () => void;
}

export function NotifyDialog({ worker, isOpen, onClose }: ActionDialogProps) {
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
          toast({ title: "Notification Sent", description: `Message sent to ${worker.name} via ${channel.toUpperCase()}` });
          onClose();
          setMessage("");
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to send notification", variant: "destructive" });
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border border-white/10 shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-display font-bold">Notify Worker</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Send an urgent compliance notification to <span className="text-white font-bold">{worker?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-display uppercase tracking-wider text-muted-foreground">Channel</label>
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
            <label className="text-xs font-display uppercase tracking-wider text-muted-foreground">Message</label>
            <textarea
              className="w-full h-32 px-3 py-2 bg-background border border-white/10 rounded-md text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-sans"
              placeholder="Enter compliance warning..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-white">Cancel</Button>
          <Button 
            onClick={handleSend} 
            disabled={!message.trim() || notifyMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-display uppercase tracking-wider"
          >
            {notifyMutation.isPending ? "Sending..." : "Send Alert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RenewDialog({ worker, isOpen, onClose }: ActionDialogProps) {
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
          toast({ title: "Document Renewed", description: `Updated expiry date for ${worker.name}.` });
          queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(worker.id) });
          onClose();
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update record", variant: "destructive" });
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border border-white/10 shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-display font-bold">Renew Document</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Update compliance records for <span className="text-white font-bold">{worker?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-display uppercase tracking-wider text-muted-foreground">Document Type</label>
            <select
              className="w-full px-3 py-2 bg-background border border-white/10 rounded-md text-sm text-foreground focus:outline-none focus:border-primary transition-all font-sans"
              value={docType}
              onChange={(e) => setDocType(e.target.value as any)}
            >
              <option value="trcExpiry">TRC Expiry</option>
              <option value="workPermitExpiry">Work Permit Expiry</option>
              <option value="contractEndDate">Contract End Date</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-display uppercase tracking-wider text-muted-foreground">New Expiry Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 bg-background border border-white/10 rounded-md text-sm text-foreground focus:outline-none focus:border-primary transition-all font-mono"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-white">Cancel</Button>
          <Button 
            onClick={handleRenew} 
            disabled={!newDate || updateMutation.isPending}
            className="bg-success text-success-foreground hover:bg-success/90 font-display uppercase tracking-wider"
          >
            {updateMutation.isPending ? "Updating..." : "Update Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
