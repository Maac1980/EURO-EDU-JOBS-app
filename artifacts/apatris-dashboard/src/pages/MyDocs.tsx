import { FileText, Upload } from "lucide-react";

export default function MyDocs() {
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><FileText className="w-6 h-6" /> My Documents</h1>
      <div className="bg-card border border-border rounded-xl p-6">
        <p className="text-muted-foreground text-sm text-center py-8">Document management for workers — upload passport, BHP, TRC, contracts</p>
      </div>
    </div>
  );
}
