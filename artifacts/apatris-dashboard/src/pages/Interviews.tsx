import { Calendar, Plus, Clock } from "lucide-react";

export default function Interviews() {
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Calendar className="w-6 h-6" /> Interviews</h1>
          <p className="text-sm text-muted-foreground mt-1">Schedule, track feedback, and manage interview pipeline</p>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold">
          <Plus className="w-4 h-4" /> Schedule
        </button>
      </div>
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <div className="text-center">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No interviews scheduled</p>
            <p className="text-xs mt-1">Click "Schedule" to add the first interview</p>
          </div>
        </div>
      </div>
    </div>
  );
}
