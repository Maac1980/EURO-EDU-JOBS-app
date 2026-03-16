import React, { useState, useCallback } from "react";
import { Bell, Trash2, RefreshCcw, Mail, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface NotificationEntry {
  id: string;
  workerId: string;
  workerName: string;
  channel: string;
  message: string;
  actor: string;
  sentAt: string;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "właśnie teraz";
  if (m < 60) return `${m} min temu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} godz. temu`;
  const d = Math.floor(h / 24);
  return `${d} dni temu`;
}

export function NotificationHistoryCard() {
  const { token, isAdmin } = useAuth();
  const [entries, setEntries] = useState<NotificationEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [filterWorker, setFilterWorker] = useState("");
  const [loaded, setLoaded] = useState(false);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filterWorker.trim()) params.set("workerFilter", filterWorker.trim());
      const res = await fetch(`${base}/api/notifications?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setEntries(data.notifications ?? []);
      setTotal(data.total ?? 0);
      setLoaded(true);
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  }, [base, token, filterWorker]);

  const handleClear = async () => {
    if (!window.confirm("Usunąć całą historię powiadomień? Tej operacji nie można cofnąć.")) return;
    setClearing(true);
    try {
      await fetch(`${base}/api/notifications`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setEntries([]);
      setTotal(0);
    } finally {
      setClearing(false);
    }
  };

  const toggle = () => {
    if (!loaded) {
      load();
    } else {
      setExpanded((p) => !p);
    }
  };

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "#161616", borderColor: "rgba(255,255,255,0.08)" }}
    >
      {/* Header */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(233,255,112,0.12)" }}
          >
            <Bell className="w-4 h-4" style={{ color: "#E9FF70" }} />
          </div>
          <div className="text-left">
            <p className="text-sm font-black uppercase tracking-widest text-white">
              Historia Powiadomień
            </p>
            <p className="text-[10px] font-mono text-white/40 mt-0.5">
              {loaded ? `${total} wpisów łącznie` : "Kliknij, aby załadować log"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loaded && (
            <span
              className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ background: "rgba(233,255,112,0.15)", color: "#E9FF70" }}
            >
              {entries.length}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {/* Toolbar */}
          <div className="flex items-center gap-2 pt-3 flex-wrap">
            <input
              type="text"
              placeholder="Filtruj po nazwisku..."
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs font-mono bg-black/30 border text-white placeholder-white/30 focus:outline-none focus:border-primary"
              style={{ borderColor: "rgba(255,255,255,0.1)" }}
            />
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
              style={{ background: "#E9FF70", color: "#333333" }}
            >
              <RefreshCcw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Ładowanie..." : "Odśwież"}
            </button>
            {isAdmin && entries.length > 0 && (
              <button
                onClick={handleClear}
                disabled={clearing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 border"
                style={{ borderColor: "rgba(239,68,68,0.4)", color: "#f87171", background: "rgba(239,68,68,0.08)" }}
              >
                <Trash2 className="w-3 h-3" />
                {clearing ? "Usuwanie..." : "Wyczyść log"}
              </button>
            )}
          </div>

          {/* Empty state */}
          {!loading && entries.length === 0 && (
            <div className="text-center py-10">
              <Bell className="w-8 h-8 mx-auto mb-3 text-white/10" />
              <p className="text-xs font-bold uppercase tracking-widest text-white/30">
                Brak powiadomień w historii
              </p>
            </div>
          )}

          {/* Entries list */}
          {entries.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl p-3 border flex gap-3"
                  style={{ background: "#1a1a1a", borderColor: "rgba(255,255,255,0.06)" }}
                >
                  {/* Channel icon */}
                  <div
                    className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{
                      background: e.channel === "sms"
                        ? "rgba(251,191,36,0.12)"
                        : "rgba(59,130,246,0.12)",
                    }}
                  >
                    {e.channel === "sms" ? (
                      <MessageSquare className="w-3.5 h-3.5" style={{ color: "#fbbf24" }} />
                    ) : (
                      <Mail className="w-3.5 h-3.5" style={{ color: "#60a5fa" }} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <span className="text-xs font-black text-white">{e.workerName}</span>
                        <span
                          className="ml-2 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                          style={{
                            background: e.channel === "sms"
                              ? "rgba(251,191,36,0.15)"
                              : "rgba(59,130,246,0.15)",
                            color: e.channel === "sms" ? "#fbbf24" : "#60a5fa",
                          }}
                        >
                          {e.channel.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-white/30 flex-shrink-0">
                        {formatRelative(e.sentAt)}
                      </span>
                    </div>
                    <p className="text-xs text-white/60 mt-1 leading-relaxed line-clamp-2">
                      {e.message}
                    </p>
                    <p className="text-[10px] font-mono text-white/25 mt-1.5">
                      wysłał: {e.actor}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer note for large logs */}
          {total > 100 && (
            <p className="text-[10px] font-mono text-white/30 text-center">
              Pokazano 100 z {total} wpisów — zawęź filtr, aby zobaczyć więcej
            </p>
          )}
        </div>
      )}
    </div>
  );
}
