import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, User, MapPin, X } from "lucide-react";
import { useGetWorkers } from "@workspace/api-client-react";
import { StatusBadge } from "./ui/StatusBadge";

interface CommandPaletteProps {
  onSelectWorker: (id: string) => void;
}

export function CommandPalette({ onSelectWorker }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const { data } = useGetWorkers({ search: query || undefined });
  const workers = (data?.workers ?? []).slice(0, 8);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((p) => !p);
        setQuery("");
        setActiveIdx(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const select = useCallback((id: string) => {
    onSelectWorker(id);
    setOpen(false);
    setQuery("");
  }, [onSelectWorker]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, workers.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && workers[activeIdx]) select(workers[activeIdx].id);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "#1a1a1a", border: "1px solid rgba(233,255,112,0.25)" }}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <Search className="w-4 h-4 flex-shrink-0 text-white/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Szukaj pracownika... (imię, specjalizacja, lokalizacja)"
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none font-mono"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-white/30 hover:text-white/60 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="text-[10px] font-mono text-white/25 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 flex-shrink-0">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1.5">
          {workers.length === 0 && query && (
            <div className="text-center py-8 text-xs font-mono text-white/30">
              Brak wyników dla „{query}"
            </div>
          )}
          {workers.length === 0 && !query && (
            <div className="text-center py-8 text-xs font-mono text-white/30">
              Wpisz imię, specjalizację lub lokalizację
            </div>
          )}
          {workers.map((w: any, i: number) => (
            <button
              key={w.id}
              onClick={() => select(w.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={{ background: i === activeIdx ? "rgba(233,255,112,0.07)" : "transparent" }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <div
                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-black"
                style={{ background: "rgba(233,255,112,0.12)", color: "#E9FF70" }}
              >
                {w.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{w.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono text-white/40">{w.specialization || "—"}</span>
                  {(w as any).siteLocation && (w as any).siteLocation !== "Available" && (
                    <span className="flex items-center gap-0.5 text-[10px] font-mono text-white/30">
                      <MapPin className="w-2.5 h-2.5" />
                      {(w as any).siteLocation}
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge status={w.complianceStatus} />
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t flex items-center gap-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {[["↑↓", "nawiguj"], ["↵", "otwórz"], ["Ctrl+K", "zamknij"]].map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-[10px] text-white/25">
              <kbd className="font-mono bg-white/5 border border-white/10 rounded px-1.5 py-0.5">{k}</kbd>
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
