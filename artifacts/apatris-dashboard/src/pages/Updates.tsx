import { Bell, Info } from "lucide-react";

export default function Updates() {
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Bell className="w-6 h-6" /> Updates</h1>
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="text-center">
            <Info className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No new updates</p>
          </div>
        </div>
      </div>
    </div>
  );
}
