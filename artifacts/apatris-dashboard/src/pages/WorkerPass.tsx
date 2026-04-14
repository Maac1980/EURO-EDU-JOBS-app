/**
 * EEJ Worker Compliance Pass — /pass/:workerId
 *
 * Offline-capable compliance card. Worker shows this at border/checkpoint.
 * Caches via service worker + Cache-Control headers.
 * No auth required. EEJ Blue branding. PL/EN toggle.
 */
import React, { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Shield, CheckCircle2, AlertTriangle, XOctagon, Clock, Phone, Mail, Globe, RefreshCw } from "lucide-react";
import { PublicLangToggle } from "@/components/PublicLangToggle";

interface PassData {
  found: boolean;
  card?: {
    name: string; nationality: string; role: string; employer: string;
    zone: string; color: string; daysRemaining: number | null;
    permitType: string; permitExpiry: string; passportExpiry: string;
    contractType: string; contractEnd: string;
    art108Protected: boolean; bhpValid: boolean; medicalValid: boolean;
    eejContact: { company: string; phone: string; email: string; website: string };
  };
  generatedAt?: string;
  offlineUntil?: string;
}

const ZONE_ICON: Record<string, typeof Shield> = {
  GREEN: CheckCircle2, YELLOW: Clock, RED: AlertTriangle, EXPIRED: XOctagon, UNKNOWN: Shield,
};

export default function WorkerPass() {
  const { t } = useTranslation();
  const [, params] = useRoute("/pass/:workerId");
  const workerId = params?.workerId ?? "";
  const [data, setData] = useState<PassData | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/";

  const fetchCard = async () => {
    if (!workerId) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/pass/${workerId}`);
      const d = await res.json();
      setData(d);
      setOffline(false);
      setLastRefresh(new Date().toLocaleTimeString());
      // Cache for offline
      try { localStorage.setItem(`eej_pass_${workerId}`, JSON.stringify(d)); } catch {}
    } catch {
      // Load from cache
      try {
        const cached = localStorage.getItem(`eej_pass_${workerId}`);
        if (cached) { setData(JSON.parse(cached)); setOffline(true); }
      } catch {}
    }
    setLoading(false);
  };

  useEffect(() => { fetchCard(); }, [workerId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data?.found || !data.card) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Shield className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-400">Worker pass not found</p>
        </div>
      </div>
    );
  }

  const c = data.card;
  const ZoneIcon = ZONE_ICON[c.zone] ?? Shield;
  const verifyUrl = `${window.location.origin}/verify/${workerId}`;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <PublicLangToggle />
      <div className="max-w-sm w-full space-y-4">
        {/* Offline banner */}
        {offline && (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-center">
            <p className="text-[10px] text-yellow-400 font-bold uppercase">Offline Mode — cached data</p>
          </div>
        )}

        {/* Card */}
        <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: c.color + "50", background: "#0f172a" }}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">EEJ Compliance Pass</p>
              <h1 className="text-lg font-bold text-white mt-0.5">{c.name}</h1>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: c.color + "15", border: `2px solid ${c.color}40` }}>
              <ZoneIcon className="w-6 h-6" style={{ color: c.color }} />
            </div>
          </div>

          {/* Status badge */}
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: c.color + "08" }}>
            <span className="text-sm font-bold" style={{ color: c.color }}>{c.zone}</span>
            <span className="text-xs text-slate-400">
              {c.daysRemaining === null ? "—" : c.daysRemaining < 0 ? `Expired ${Math.abs(c.daysRemaining)}d ago` : `${c.daysRemaining} days remaining`}
            </span>
          </div>

          {/* Details grid */}
          <div className="px-5 py-3 space-y-2 text-xs">
            <Row label="Nationality" value={c.nationality} />
            <Row label="Role" value={c.role} />
            <Row label="Employer" value={c.employer} />
            <Row label="Permit" value={`${c.permitType} — exp. ${c.permitExpiry}`} />
            <Row label="Passport" value={`exp. ${c.passportExpiry}`} />
            <Row label="Contract" value={`${c.contractType} — exp. ${c.contractEnd}`} />
          </div>

          {/* Safety badges */}
          <div className="px-5 py-3 flex flex-wrap gap-2 border-t border-slate-800">
            {c.art108Protected && <Badge text="Art. 108" color="#3B82F6" />}
            <Badge text={c.bhpValid ? "BHP OK" : "BHP !"} color={c.bhpValid ? "#22C55E" : "#EF4444"} />
            <Badge text={c.medicalValid ? "Medical OK" : "Medical !"} color={c.medicalValid ? "#22C55E" : "#EF4444"} />
          </div>

          {/* QR + Contact */}
          <div className="px-5 py-4 border-t border-slate-800 flex items-center gap-4">
            <div className="bg-white rounded-lg p-1.5 flex-shrink-0">
              <QRCodeSVG value={verifyUrl} size={64} level="M" />
            </div>
            <div className="text-[10px] text-slate-500 space-y-1">
              <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.eejContact.phone}</div>
              <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.eejContact.email}</div>
              <div className="flex items-center gap-1"><Globe className="w-3 h-3" /> {c.eejContact.website}</div>
            </div>
          </div>
        </div>

        {/* Refresh */}
        <button onClick={fetchCard} className="w-full py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 flex items-center justify-center gap-2 active:scale-[0.98]">
          <RefreshCw className="w-3 h-3" /> Refresh {lastRefresh && <span className="text-slate-500 font-normal">({lastRefresh})</span>}
        </button>

        <p className="text-[10px] text-slate-700 text-center">EEJ Recruitment Platform &middot; org_context: EEJ</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300 font-mono text-right">{value}</span>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ color, background: color + "15", border: `1px solid ${color}30` }}>
      {text}
    </span>
  );
}
