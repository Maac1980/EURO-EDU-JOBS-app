import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  FileWarning,
  Wallet,
  ChevronRight,
  Briefcase,
  Sparkles,
} from "lucide-react";
import { fetchTrcSummary, fetchTrcCases, type TrcSummary, type TrcCase } from "@/lib/api";
import WorkerCockpit from "@/components/WorkerCockpit";
import DocumentScanFlow from "@/components/DocumentScanFlow";
import type { ActiveTab } from "@/types";

interface Props {
  onNavigate?: (tab: ActiveTab) => void;
}

// Liza's home page — TRC cases + clients + legal workload.
// Replaces the previous recruiting-flavored mockup. Each section reads from
// the existing /trc/* API (no new backend).

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  preparing:     { bg: "#EFF6FF", text: "#2563EB", border: "#93C5FD" },
  submitted:     { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
  under_review:  { bg: "#FFFBEB", text: "#D97706", border: "#FCD34D" },
  approved:      { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7" },
  rejected:      { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5" },
  appeal:        { bg: "#FAF5FF", text: "#7C3AED", border: "#C4B5FD" },
};
const DEFAULT_COLOR = { bg: "#F3F4F6", text: "#374151", border: "#D1D5DB" };

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function LegalHome({ onNavigate }: Props = {}) {
  const [summary, setSummary] = useState<TrcSummary | null>(null);
  const [cases, setCases] = useState<TrcCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);
  const [showScanFlow, setShowScanFlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTrcSummary(), fetchTrcCases()])
      .then(([s, c]) => {
        if (cancelled) return;
        setSummary(s);
        setCases(c);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load TRC data");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cases with missing docs (Liza needs to chase the worker)
  const casesMissingDocs = useMemo(
    () => cases.filter((c) => c.missing_documents > 0),
    [cases],
  );

  // Cases under decision (Liza watches these)
  const inProgress = useMemo(
    () =>
      cases
        .filter((c) => ["preparing", "submitted", "under_review"].includes(c.status))
        .sort((a, b) => {
          // Sort by soonest deadline
          const da = daysUntil(a.renewal_deadline) ?? daysUntil(a.appointment_date) ?? Infinity;
          const db = daysUntil(b.renewal_deadline) ?? daysUntil(b.appointment_date) ?? Infinity;
          return da - db;
        }),
    [cases],
  );

  const total = summary?.totalCases ?? cases.length;

  return (
    <div className="tab-page">
      <div className="tab-greeting">
        <div>
          <div className="tab-greeting-label">Legal & Client Relations</div>
          <div className="tab-greeting-name">TRC workload</div>
        </div>
        <div className="alert-total-badge">{total} cases</div>
      </div>

      {/* Scan a document — primary action for Liza. AI reads it, matches to
          a worker, files updates with provenance. */}
      <button className="lh-scan-btn" onClick={() => setShowScanFlow(true)}>
        <Sparkles size={16} strokeWidth={2.2} />
        <div className="lh-scan-text">
          <div className="lh-scan-title">Scan a document</div>
          <div className="lh-scan-sub">Passport, TRC, work permit, BHP — AI reads + files it</div>
        </div>
        <ChevronRight size={14} strokeWidth={2.2} />
      </button>

      {loading && (
        <div style={{ padding: 20, fontSize: 13, color: "#6B7280" }}>Loading…</div>
      )}
      {error && !loading && (
        <div className="lh-error">⚠ {error}</div>
      )}

      {!loading && !error && (
        <>
          {/* Status snapshot */}
          {summary && summary.byStatus.length > 0 && (
            <div className="lh-status-grid">
              {summary.byStatus.map((s) => {
                const cfg = STATUS_COLORS[s.status] ?? DEFAULT_COLOR;
                return (
                  <div
                    key={s.status}
                    className="lh-status-card"
                    style={{
                      background: cfg.bg,
                      color: cfg.text,
                      border: `1.5px solid ${cfg.border}`,
                    }}
                  >
                    <div className="lh-status-count">{s.count}</div>
                    <div className="lh-status-label">{statusLabel(s.status)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Upcoming deadlines */}
          <div className="alert-section-header amber" style={{ marginTop: 16 }}>
            <CalendarClock size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span>Upcoming deadlines</span>
            <span className="alert-count amber-count">
              {summary?.upcomingDeadlines.length ?? 0}
            </span>
          </div>
          <div className="alert-list">
            {(summary?.upcomingDeadlines ?? []).length === 0 ? (
              <div className="lh-empty">Nothing in the next 30 days.</div>
            ) : (
              summary!.upcomingDeadlines.map((d) => {
                const dl = d.renewal_deadline ?? d.appointment_date;
                const days = daysUntil(dl);
                const tone =
                  days !== null && days <= 7
                    ? "red"
                    : days !== null && days <= 14
                      ? "amber"
                      : "amber";
                const isAppointment = !d.renewal_deadline && d.appointment_date;
                return (
                  <div key={d.id} className={`alert-card ${tone}-card`}>
                    <div className="alert-card-left">
                      <div className="alert-card-name">{d.worker_name}</div>
                      <div className="alert-card-meta">
                        {isAppointment ? "Appointment " : "Renewal "} {fmtDate(dl)}
                        {" · "} {statusLabel(d.status)}
                      </div>
                    </div>
                    <div
                      className={`alert-days-badge ${days !== null && days <= 7 ? "red-badge" : "amber-badge"}`}
                    >
                      {days !== null ? `${days}d` : "—"}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Missing documents */}
          <div className="alert-section-header red" style={{ marginTop: 20 }}>
            <FileWarning size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span>Cases missing documents</span>
            <span className="alert-count red-count">{casesMissingDocs.length}</span>
          </div>
          <div className="alert-list">
            {casesMissingDocs.length === 0 ? (
              <div className="lh-empty">All required documents collected.</div>
            ) : (
              casesMissingDocs.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  className="alert-card red-card lh-clickable"
                  onClick={() => c.worker_id && setOpenWorkerId(c.worker_id)}
                  disabled={!c.worker_id}
                >
                  <div className="alert-card-left">
                    <div className="alert-card-name">{c.worker_name}</div>
                    <div className="alert-card-meta">
                      {c.missing_documents} missing · {c.uploaded_documents}/{c.total_documents} uploaded
                    </div>
                  </div>
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              ))
            )}
          </div>

          {/* In progress */}
          <div className="alert-section-header" style={{ marginTop: 20, color: "#1B2A4A" }}>
            <Briefcase size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span>In progress</span>
            <span className="alert-count">{inProgress.length}</span>
          </div>
          <div className="alert-list">
            {inProgress.length === 0 ? (
              <div className="lh-empty">No active TRC cases.</div>
            ) : (
              inProgress.slice(0, 10).map((c) => {
                const cfg = STATUS_COLORS[c.status] ?? DEFAULT_COLOR;
                return (
                  <button
                    key={c.id}
                    className="alert-card permit-card lh-clickable"
                    onClick={() => c.worker_id && setOpenWorkerId(c.worker_id)}
                    disabled={!c.worker_id}
                  >
                    <div className="alert-card-left">
                      <div className="alert-card-name">{c.worker_name}</div>
                      <div className="alert-card-meta">
                        {c.permit_type} · {c.voivodeship ?? "—"}
                      </div>
                    </div>
                    <span
                      className="permit-status-badge"
                      style={{ background: cfg.bg, color: cfg.text, border: `1.5px solid ${cfg.border}` }}
                    >
                      {statusLabel(c.status)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Revenue (Liza is gated from business financials per T23, but
              service-fee revenue from her own TRC work is not "business
              financials" — it's HER workload signal). */}
          {summary && summary.revenue.total > 0 && (
            <>
              <div className="alert-section-header green" style={{ marginTop: 20 }}>
                <Wallet size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                <span>Service fees</span>
              </div>
              <div className="lh-revenue-grid">
                <div className="lh-revenue-card">
                  <div className="lh-revenue-label">Total billed</div>
                  <div className="lh-revenue-value">PLN {summary.revenue.total.toFixed(0)}</div>
                </div>
                <div className="lh-revenue-card">
                  <div className="lh-revenue-label">Paid</div>
                  <div className="lh-revenue-value" style={{ color: "#059669" }}>
                    PLN {summary.revenue.paid.toFixed(0)}
                  </div>
                </div>
                <div className="lh-revenue-card">
                  <div className="lh-revenue-label">Unpaid</div>
                  <div className="lh-revenue-value" style={{ color: "#D97706" }}>
                    PLN {summary.revenue.unpaid.toFixed(0)}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div style={{ height: 100 }} />

      {showScanFlow && (
        <DocumentScanFlow
          onClose={() => setShowScanFlow(false)}
          onApplied={() => {
            // Refresh summary + cases so the new/updated worker appears.
            fetchTrcSummary().then(setSummary).catch(() => {});
            fetchTrcCases().then(setCases).catch(() => {});
          }}
        />
      )}

      {openWorkerId && (
        <WorkerCockpit
          workerId={openWorkerId}
          viewerRole="legal"
          onClose={() => setOpenWorkerId(null)}
          onOpenModule={
            onNavigate
              ? (module) => {
                  // Map cockpit module key → mobile tab. Only modules with
                  // their own dedicated tab are navigable; documents + notes
                  // are fully shown in the cockpit panel itself.
                  const tabMap: Record<string, ActiveTab> = {
                    trc: "trc",
                    permits: "permits",
                    payroll: "payroll",
                  };
                  const target = tabMap[module];
                  if (target) {
                    setOpenWorkerId(null);
                    onNavigate(target);
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
