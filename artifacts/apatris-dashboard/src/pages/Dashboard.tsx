import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGetWorkers, useGetWorkerStats } from "@workspace/api-client-react";
import { 
  Users, AlertTriangle, ShieldAlert, Clock, 
  Search, Filter, LogOut, FileText, Bell, RefreshCcw
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkerProfilePanel } from "@/components/WorkerProfilePanel";
import { NotifyDialog, RenewDialog } from "@/components/ActionDialogs";
import { ComplianceReportModal } from "@/components/ComplianceReportModal";

export default function Dashboard() {
  const { user, logout } = useAuth();
  
  // Filters state
  const [search, setSearch] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [status, setStatus] = useState("");

  // UI State
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [actionWorker, setActionWorker] = useState<any | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Queries
  const { data: workersData, isLoading: isLoadingWorkers } = useGetWorkers({ 
    search: search || undefined, 
    specialization: specialization || undefined, 
    status: status || undefined 
  });
  
  const { data: stats } = useGetWorkerStats();

  const handleNotify = (e: React.MouseEvent, worker: any) => {
    e.stopPropagation();
    setActionWorker(worker);
    setNotifyOpen(true);
  };

  const handleRenew = (e: React.MouseEvent, worker: any) => {
    e.stopPropagation();
    setActionWorker(worker);
    setRenewOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-destructive/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      {/* Header */}
      <header className="h-16 border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-30 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 object-contain" />
          <h1 className="text-xl font-display font-bold tracking-widest uppercase">
            Apatris <span className="text-primary font-light">Compliance</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-display uppercase tracking-wide transition-colors text-white"
          >
            <FileText className="w-4 h-4 text-primary" />
            Generate Report
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-2" />
          
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-white leading-tight">{user?.name}</p>
              <p className="text-xs text-primary font-mono">{user?.role}</p>
            </div>
            <button onClick={logout} className="p-2 text-muted-foreground hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 lg:p-8 z-10 max-w-[1600px] mx-auto w-full space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Total Workforce" 
            value={stats?.total || "0"} 
            icon={Users} 
          />
          <StatCard 
            title="Critical (<30 Days)" 
            value={stats?.critical || "0"} 
            icon={ShieldAlert} 
            variant="critical"
          />
          <StatCard 
            title="Upcoming Renewals" 
            value={stats?.warning || "0"} 
            icon={Clock} 
            variant="warning"
          />
          <StatCard 
            title="Non-Compliant" 
            value={stats?.nonCompliant || "0"} 
            icon={AlertTriangle} 
            variant="critical"
          />
        </div>

        {/* Command Bar */}
        <div className="glass-panel p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between mt-8">
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search by Operator Name..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/5 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          
          <div className="flex gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:w-48">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select 
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-black/40 border border-white/5 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/50 transition-colors"
              >
                <option value="">All Specs</option>
                <option value="TIG">TIG Welders</option>
                <option value="MIG">MIG Welders</option>
                <option value="ARC">ARC Welders</option>
              </select>
            </div>
            <div className="relative flex-1 md:w-48">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select 
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-black/40 border border-white/5 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/50 transition-colors"
              >
                <option value="">All Statuses</option>
                <option value="compliant">Compliant</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
                <option value="non-compliant">Non-Compliant</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="glass-panel rounded-xl overflow-hidden tech-border">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-black/40 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-xs font-display uppercase tracking-widest text-muted-foreground">Operator</th>
                  <th className="px-6 py-4 text-xs font-display uppercase tracking-widest text-muted-foreground">Spec</th>
                  <th className="px-6 py-4 text-xs font-display uppercase tracking-widest text-muted-foreground">TRC Expiry</th>
                  <th className="px-6 py-4 text-xs font-display uppercase tracking-widest text-muted-foreground">Work Permit</th>
                  <th className="px-6 py-4 text-xs font-display uppercase tracking-widest text-muted-foreground">BHP</th>
                  <th className="px-6 py-4 text-xs font-display uppercase tracking-widest text-muted-foreground">Status</th>
                  <th className="px-6 py-4 text-xs font-display uppercase tracking-widest text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-sm">
                {isLoadingWorkers ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="px-6 py-6">
                        <div className="h-4 bg-white/5 rounded animate-pulse w-full" />
                      </td>
                    </tr>
                  ))
                ) : workersData?.workers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground font-sans">
                      No operators found matching criteria.
                    </td>
                  </tr>
                ) : (
                  workersData?.workers.map((worker) => (
                    <tr 
                      key={worker.id} 
                      onClick={() => setSelectedWorkerId(worker.id)}
                      className="hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <div className="font-sans font-medium text-white">{worker.name}</div>
                        <div className="text-xs text-muted-foreground">{worker.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-xs">
                          {worker.specialization}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {worker.trcExpiry ? format(parseISO(worker.trcExpiry), 'MMM d, yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {worker.workPermitExpiry ? format(parseISO(worker.workPermitExpiry), 'MMM d, yyyy') : '-'}
                      </td>
                      <td className={`px-6 py-4 font-bold ${worker.bhpStatus === 'Active' ? 'text-success' : 'text-destructive'}`}>
                        {worker.bhpStatus || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={worker.complianceStatus} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => handleNotify(e, worker)}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                            title="Notify Worker"
                          >
                            <Bell className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => handleRenew(e, worker)}
                            className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
                            title="Renew Document"
                          >
                            <RefreshCcw className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Side Panel & Modals */}
      <WorkerProfilePanel 
        workerId={selectedWorkerId} 
        onClose={() => setSelectedWorkerId(null)} 
        onRenew={(w) => { setSelectedWorkerId(null); setActionWorker(w); setRenewOpen(true); }}
        onNotify={(w) => { setSelectedWorkerId(null); setActionWorker(w); setNotifyOpen(true); }}
      />
      
      {actionWorker && (
        <>
          <NotifyDialog worker={actionWorker} isOpen={notifyOpen} onClose={() => setNotifyOpen(false)} />
          <RenewDialog worker={actionWorker} isOpen={renewOpen} onClose={() => setRenewOpen(false)} />
        </>
      )}

      <ComplianceReportModal isOpen={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
