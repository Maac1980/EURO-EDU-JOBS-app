import React, { useEffect, useState, useCallback } from "react";
import { History, RefreshCw, Trash2, Loader2, ChevronDown, User, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

interface AuditEntry {
  timestamp: string;
  actor: string;
  workerId: string;
  workerName?: string;
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  action?: string;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function ActorBadge({ actor }: { actor: string }) {
  const isPortal = actor === "candidate-portal";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest"
      style={{
        background: isPortal ? "rgba(233,255,112,0.1)" : "rgba(255,255,255,0.06)",
        color: isPortal ? "#E9FF70" : "#9CA3AF",
      }}
    >
      {isPortal ? <ExternalLink className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
      {isPortal ? "Worker" : "Admin"}
    </span>
  );
}

export function AuditTrailPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);

  const token = localStorage.getItem("eej_token");
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/api/audit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error("[audit] fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [base, token]);

  useEffect(() => {
    if (expanded) fetchAudit();
  }, [expanded, fetchAudit]);

  const clearAudit = async () => {
    if (!confirm("Clear all audit log entries? This cannot be undone.")) return;
    setClearing(true);
    try {
      await fetch(`${base}/api/audit`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setEntries([]);
      setTotal(0);
      toast({ title: "Audit log cleared", variant: "success" as any });
    } catch {
      toast({ title: "Failed to clear audit log", variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  const visible = entries.slice(0, visibleCount);

  return (
    <div className="rounded-2xl border border-white/8 bg-slate-900/60 overflow-hidden">
      {/* Header — always visible, click to expand */}
      <button
        className="w-full flex items-center justify-between p-6 text-left hover:bg-white/2 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 flex-shrink-0" style={{ color: "#E9FF70" }} />
          <div>
            <h2 className="text-base font-black uppercase tracking-widest text-white">Audit Trail</h2>
            <p className="text-xs text-white/40 mt-0.5">
              {total > 0 ? `${total} change${total === 1 ? "" : "s"} recorded` : "Track who changed what and when"}
            </p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-white/6">
          {/* Action bar */}
          <div className="flex items-center justify-between px-5 py-3 bg-slate-800/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              {total} total entries
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAudit}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-80 disabled:opacity-50"
                style={{ background: "rgba(233,255,112,0.08)", color: "#E9FF70", border: "1px solid rgba(233,255,112,0.2)" }}
              >
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              {entries.length > 0 && (
                <button
                  onClick={clearAudit}
                  disabled={clearing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-80 disabled:opacity-50"
                  style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Log entries */}
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
          ) : entries.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-600 text-sm">
              No audit entries yet. Changes to worker records will appear here.
            </div>
          ) : (
            <div className="divide-y divide-white/4 max-h-96 overflow-y-auto">
              {visible.map((e, i) => (
                <div key={i} className="px-5 py-3 flex items-start gap-3 hover:bg-white/2 transition-colors">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: e.actor === "candidate-portal" ? "rgba(233,255,112,0.1)" : "rgba(255,255,255,0.06)" }}
                  >
                    {e.actor === "candidate-portal"
                      ? <ExternalLink className="w-3 h-3" style={{ color: "#E9FF70" }} />
                      : <User className="w-3 h-3 text-gray-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ActorBadge actor={e.actor} />
                      <span className="text-xs font-semibold text-white truncate">
                        updated <span className="font-mono" style={{ color: "#E9FF70" }}>{e.field}</span>
                      </span>
                      {e.workerId && (
                        <span className="text-[10px] font-mono text-gray-600 truncate">· {e.workerId.slice(0, 12)}…</span>
                      )}
                    </div>
                    {e.newValue && typeof e.newValue === "object" && (
                      <p className="text-[10px] font-mono text-gray-500 mt-0.5 truncate">
                        {Object.entries(e.newValue as Record<string, unknown>)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")
                          .slice(0, 80)}
                      </p>
                    )}
                    {typeof e.newValue !== "object" && e.newValue !== undefined && (
                      <p className="text-[10px] font-mono text-gray-500 mt-0.5">→ {String(e.newValue)}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-600 font-mono flex-shrink-0 mt-0.5">{timeAgo(e.timestamp)}</span>
                </div>
              ))}
              {visibleCount < entries.length && (
                <button
                  onClick={() => setVisibleCount((n) => n + 20)}
                  className="w-full py-3 text-xs font-bold text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Load more ({entries.length - visibleCount} remaining)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
