/**
 * WorkerCockpit — unified worker view for the dashboard.
 *
 * Dashboard-side port of the mobile WorkerCockpit (eej-mobile-HIDDEN). Reuses
 * the same `GET /api/workers/:id/cockpit` aggregator endpoint that returns
 * worker + TRC + permit + documents + notes + payroll + jobApps + audit +
 * AI reasoning + WhatsApp messages + computed alerts in one call.
 *
 * 11 panels, role-adaptive ordering. Dashboard role taxonomy (admin/
 * coordinator/manager) is translated to mobile role taxonomy (executive/
 * legal/operations) for panel-order lookup so we share the priority rules.
 *
 * Thread 3 bake-in: "Ask AI about appeal" button on TRC panel calls
 * POST /api/legal/answer with workerId pre-set, opening a structured
 * legal Q&A response inline.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X, AlertTriangle, FileText, Briefcase, StickyNote, Wallet, ShieldCheck,
  Sparkles, Clock, Mail, Phone, MapPin, Pencil, Check, MessageCircle,
  ArrowDownLeft, ArrowUpRight, Scale, Loader2, Copy, History,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { BASE, authHeaders } from "@/lib/api";

// ─── Types (local, mirroring backend cockpit response shape) ─────────────────

interface CockpitAlert {
  level: "red" | "amber";
  field: string;
  message: string;
  date?: string;
}

interface CockpitWorker {
  id: string;
  name: string;
  jobRole?: string | null;
  nationality?: string | null;
  assignedSite?: string | null;
  voivodeship?: string | null;
  pipelineStage?: string | null;
  visaType?: string | null;
  pesel?: string | null;
  iban?: string | null;
  email?: string | null;
  phone?: string | null;
  trcExpiry?: string | null;
  workPermitExpiry?: string | null;
  badaniaLekExpiry?: string | null;
  oswiadczenieExpiry?: string | null;
  udtCertExpiry?: string | null;
  contractEndDate?: string | null;
  bhpStatus?: string | null;
  hourlyNettoRate?: number | string | null;
  totalHours?: number | string | null;
  advancePayment?: number | string | null;
  [k: string]: unknown;
}

// trc_cases is returned via raw SELECT c.* — column names are snake_case
// per migrate.ts:1380-1402. Cockpit aggregator at workers.ts:548-557 aliases
// the document-completion counts inline (camelCase aliases). Everything else
// is the raw schema column name.
interface CockpitTrcCase { id: string; status?: string; permit_type?: string; voivodeship?: string;
  appointment_date?: string; actual_decision_date?: string; expected_decision_date?: string;
  renewal_deadline?: string;
  total_documents?: number; uploaded_documents?: number; missing_documents?: number;
  [k: string]: unknown; }

interface CockpitWorkPermit { id: string; type?: string; status?: string;
  startDate?: string; endDate?: string; submittedAt?: string; [k: string]: unknown; }

interface CockpitDocument { id: string; fieldName?: string; filename?: string;
  uploadedAt?: string; url?: string; [k: string]: unknown; }

interface CockpitNote { id: string; content?: string; author?: string;
  authorEmail?: string; createdAt?: string; updatedAt?: string; [k: string]: unknown; }

interface CockpitPayroll { id: string; periodMonth?: string; hourlyRate?: string;
  totalHours?: string | number; netPay?: string | number; [k: string]: unknown; }

// audit_entries returned via raw SQL `SELECT * FROM audit_entries` —
// snake_case column names per migrate.ts:136-146. No JS-side aliasing.
interface CockpitAudit { id: string; action?: string; field?: string; actor?: string;
  timestamp?: string; new_value?: unknown; old_value?: unknown;
  worker_id?: string; worker_name?: string;
  [k: string]: unknown; }

interface CockpitReasoning { id: string; decision_type?: string; input_summary?: string;
  output?: unknown; confidence?: number; decided_action?: string;
  reviewed_by?: string; model?: string; created_at?: string; }

interface CockpitWhatsApp { id: string; direction?: string; status?: string;
  body?: string; sentAt?: string; receivedAt?: string; createdAt?: string;
  twilioMessageSid?: string; }

interface CockpitResponse {
  worker: CockpitWorker;
  trcCase: CockpitTrcCase | null;
  workPermit: CockpitWorkPermit | null;
  documents: CockpitDocument[];
  notes: { worker: CockpitNote[]; trc: CockpitNote[] };
  payroll: CockpitPayroll[];
  jobApplications: Array<Record<string, unknown>>;
  auditHistory: CockpitAudit[];
  aiReasoning: CockpitReasoning[];
  whatsappMessages: CockpitWhatsApp[];
  alerts: CockpitAlert[];
  meta: { generatedAt: string; viewerRole?: string };
}

interface AiSuggestedAction {
  label: string;
  actionType: "scan_document" | "send_whatsapp" | "open_trc" | "open_permit"
    | "open_payroll" | "add_note" | "open_case" | "none";
  priority: "high" | "med" | "low";
  reasoning?: string;
  templateHint?: string | null;
}

interface AiSummaryResponse {
  summary: string;
  actions: AiSuggestedAction[];
  model?: string;
}

interface LegalAnswerResponse {
  plain_answer?: string;
  legal_basis?: string[];
  applicability?: string;
  required_docs?: string[];
  deadlines?: string;
  risks?: string[];
  next_actions?: string[];
  confidence?: number;
  human_review?: boolean;
  [k: string]: unknown;
}

type PanelKey =
  | "alerts" | "identity" | "trc" | "permit" | "documents" | "notes"
  | "whatsapp" | "payroll" | "ai" | "aiHistory" | "history";

// ─── Role translation (dashboard → mobile taxonomy for panel ordering) ──────

function dashboardRoleToPanelRole(
  role: string | undefined,
  designation: string | undefined,
): "legal" | "executive" | "operations" | "candidate" {
  // Coordinator with "Legal" designation is Liza-shape — wants legal layout.
  // Coordinator without "Legal" (rare today) defaults to operations layout.
  if (role === "coordinator") {
    if ((designation ?? "").toLowerCase().includes("legal")) return "legal";
    return "operations";
  }
  if (role === "admin") return "executive";
  if (role === "manager") return "operations";
  return "candidate";
}

function panelOrderFor(role: string): PanelKey[] {
  if (role === "legal") {
    return ["alerts", "trc", "documents", "notes", "whatsapp", "identity", "permit", "ai", "aiHistory", "payroll", "history"];
  }
  if (role === "executive") {
    return ["alerts", "permit", "payroll", "identity", "trc", "documents", "notes", "whatsapp", "ai", "aiHistory", "history"];
  }
  if (role === "operations") {
    return ["alerts", "identity", "whatsapp", "permit", "documents", "notes", "trc", "ai", "aiHistory", "payroll", "history"];
  }
  return ["alerts", "identity", "documents", "permit", "trc", "notes", "whatsapp", "payroll", "ai", "aiHistory", "history"];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function daysUntil(s?: string | null): number | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

// ─── Small UI primitives ────────────────────────────────────────────────────

function PanelHeader({ icon, title, count, onOpen, openLabel }: {
  icon: React.ReactNode; title: string; count?: number;
  onOpen?: () => void; openLabel?: string;
}) {
  return (
    <header className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-gray-400 uppercase">
        {icon}
        <span>{title}</span>
        {count !== undefined && count > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-white">{count}</span>
        )}
      </div>
      {onOpen && (
        <button onClick={onOpen} className="text-xs font-bold text-blue-400 hover:text-blue-300">
          {openLabel ?? "Open"} →
        </button>
      )}
    </header>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  const display = value === undefined || value === null || String(value) === "" ? "—" : String(value);
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-b-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-sm text-white ${mono ? "font-mono" : ""}`}>{display}</span>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-xs italic text-gray-500 py-2">{msg}</div>;
}

// ─── Alerts strip (clickable) ────────────────────────────────────────────────

function AlertStrip({ alerts, onAlertClick }: {
  alerts: CockpitAlert[];
  onAlertClick: (alert: CockpitAlert) => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <button
          key={i}
          onClick={() => onAlertClick(a)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
            a.level === "red"
              ? "bg-red-500/15 border border-red-500/40 text-red-100 hover:bg-red-500/25"
              : "bg-amber-500/15 border border-amber-500/40 text-amber-100 hover:bg-amber-500/25"
          }`}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm flex-1">{a.message}</span>
          {a.date && <span className="text-xs font-mono text-gray-300">{fmtDate(a.date)}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Component: WorkerCockpit ────────────────────────────────────────────────

interface Props {
  workerId: string | null;
  onClose: () => void;
}

export function WorkerCockpit({ workerId, onClose }: Props) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [data, setData] = useState<CockpitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI summary state — separate from cockpit fetch
  const [aiSummary, setAiSummary] = useState<AiSummaryResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const firedForRef = useRef<string | null>(null);

  // Legal answer state (thread 3 bake-in)
  const [legalAnswer, setLegalAnswer] = useState<LegalAnswerResponse | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);

  // Inline contact edit
  const [editingContact, setEditingContact] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [contactSaving, setContactSaving] = useState(false);

  const isOpen = !!workerId;

  // Resolve panel role from dashboard auth + designation
  const panelRole = useMemo(
    () => dashboardRoleToPanelRole(user?.role, (user as unknown as { designation?: string })?.designation),
    [user?.role, user],
  );
  const order = useMemo(() => panelOrderFor(panelRole), [panelRole]);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const fetchCockpit = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}api/workers/${id}/cockpit`, { headers: authHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error ?? "Failed to load worker");
      }
      const json = await res.json() as CockpitResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAiSummary = useCallback(async (id: string) => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch(`${BASE}api/workers/${id}/ai-summary`, { headers: authHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error ?? "AI summary unavailable");
      }
      const json = await res.json() as AiSummaryResponse;
      setAiSummary(json);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Network error");
    } finally {
      setAiLoading(false);
    }
  }, []);

  // Load cockpit when workerId changes; reset state
  useEffect(() => {
    if (!workerId) {
      setData(null);
      setAiSummary(null);
      setLegalAnswer(null);
      setEditingContact(false);
      firedForRef.current = null;
      return;
    }
    fetchCockpit(workerId);
  }, [workerId, fetchCockpit]);

  // Fire AI summary once per worker when alerts exist (cost-aware)
  useEffect(() => {
    if (!data || !workerId) return;
    if (firedForRef.current === workerId) return;
    if (data.alerts.length === 0) return;
    firedForRef.current = workerId;
    fetchAiSummary(workerId);
  }, [data, workerId, fetchAiSummary]);

  // Seed contact draft when entering edit mode
  useEffect(() => {
    if (editingContact && data?.worker) {
      setEmailDraft(data.worker.email ?? "");
      setPhoneDraft(data.worker.phone ?? "");
    }
  }, [editingContact, data?.worker]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  function dispatchAction(action: AiSuggestedAction) {
    if (!workerId) return;
    switch (action.actionType) {
      case "open_trc":
        setLocation(`/trc-service?workerId=${workerId}`);
        onClose();
        break;
      case "open_permit":
        setLocation(`/permits?workerId=${workerId}`);
        onClose();
        break;
      case "open_payroll":
        setLocation(`/payroll?workerId=${workerId}`);
        onClose();
        break;
      case "send_whatsapp":
        // Deferred: WhatsApp picker. Fallback: navigate to Messaging.
        setLocation(`/messaging?workerId=${workerId}${action.templateHint ? `&template=${action.templateHint}` : ""}`);
        onClose();
        break;
      case "scan_document":
        // Deferred: DocumentScanFlow port. Fallback: navigate to bulk upload.
        setLocation(`/bulk-upload?workerId=${workerId}`);
        onClose();
        break;
      case "add_note":
        // Deferred: inline quick-add. Fallback: scroll to notes panel.
        document.getElementById("wc-panel-notes")?.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      case "open_case":
        setLocation(`/case-management?workerId=${workerId}`);
        onClose();
        break;
      case "none":
      default:
        break;
    }
  }

  async function askAboutAppeal() {
    if (!workerId) return;
    setLegalLoading(true);
    setLegalError(null);
    setLegalAnswer(null);
    try {
      const res = await fetch(`${BASE}api/legal/answer`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          workerId,
          question: "What is our appeal strategy for this worker's TRC denial? Include relevant Polish law articles, appeal deadline, required documents, and next actions.",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error ?? "Legal answer unavailable");
      }
      const json = await res.json() as LegalAnswerResponse;
      setLegalAnswer(json);
    } catch (e) {
      setLegalError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLegalLoading(false);
    }
  }

  async function saveContact() {
    if (!workerId) return;
    setContactSaving(true);
    try {
      const res = await fetch(`${BASE}api/workers/${workerId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ email: emailDraft.trim() || null, phone: phoneDraft.trim() || null }),
      });
      if (!res.ok) throw new Error("Save failed");
      // Refetch
      await fetchCockpit(workerId);
      setEditingContact(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setContactSaving(false);
    }
  }

  function handleAlertClick(alert: CockpitAlert) {
    if (!workerId) return;
    if (alert.field === "trcExpiry" || alert.field === "trcDocuments") {
      setLocation(`/trc-service?workerId=${workerId}`);
      onClose();
    } else if (alert.field === "workPermitExpiry") {
      setLocation(`/permits?workerId=${workerId}`);
      onClose();
    } else if (alert.field === "contractEndDate") {
      setLocation(`/payroll?workerId=${workerId}`);
      onClose();
    } else {
      // Default: scroll to documents panel (the most common follow-up)
      document.getElementById("wc-panel-documents")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // ─── Panel renderers (keyed by PanelKey) ───────────────────────────────────

  function renderPanel(key: PanelKey): React.ReactNode {
    if (!data) return null;
    const w = data.worker;
    switch (key) {
      case "alerts":
        if (data.alerts.length === 0) return null;
        return (
          <Panel key="alerts">
            <PanelHeader icon={<AlertTriangle className="w-4 h-4 text-red-400" />} title="Alerts" count={data.alerts.length} />
            <AlertStrip alerts={data.alerts} onAlertClick={handleAlertClick} />
          </Panel>
        );

      case "identity":
        return (
          <Panel key="identity">
            <PanelHeader icon={<Briefcase className="w-4 h-4" />} title="Identity" />
            <Row label="Job role" value={w.jobRole} />
            <Row label="Nationality" value={w.nationality} />
            <Row label="Site" value={w.assignedSite} />
            <Row label="Voivodeship" value={w.voivodeship as string | null | undefined} />
            <Row label="Pipeline stage" value={w.pipelineStage} />
            <Row label="Visa type" value={w.visaType} />
            {w.pesel && <Row label="PESEL" value={w.pesel} mono />}
          </Panel>
        );

      case "trc":
        return (
          <Panel key="trc">
            <PanelHeader
              icon={<ShieldCheck className="w-4 h-4 text-blue-400" />}
              title="TRC case"
              onOpen={() => { setLocation(`/trc-service?workerId=${workerId}`); onClose(); }}
              openLabel="Open TRC"
            />
            {data.trcCase ? (
              <>
                <Row label="Status" value={data.trcCase.status} />
                <Row label="Type" value={data.trcCase.permit_type} />
                <Row label="Voivodeship" value={data.trcCase.voivodeship} />
                <Row label="Appointment" value={fmtDate(data.trcCase.appointment_date)} />
                <Row label="Decision" value={fmtDate(data.trcCase.actual_decision_date)} />
                <Row label="Renewal deadline" value={fmtDate(data.trcCase.renewal_deadline)} />
                <Row label="Documents" value={`${data.trcCase.uploaded_documents ?? 0} / ${data.trcCase.total_documents ?? 0} uploaded`} />
                {Number(data.trcCase.missing_documents ?? 0) > 0 && (
                  <Row label="Missing required" value={String(data.trcCase.missing_documents)} />
                )}
                {/* Thread 3 bake-in: Ask AI about appeal when status indicates denial */}
                {(data.trcCase.status === "REJECTED" || data.trcCase.status === "DENIED" || data.trcCase.status === "rejected") && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <button
                      onClick={askAboutAppeal}
                      disabled={legalLoading}
                      className="w-full px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-100 text-sm font-bold hover:bg-blue-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {legalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                      Ask AI about appeal strategy
                    </button>
                    {legalError && <p className="mt-2 text-xs text-red-300">{legalError}</p>}
                    {legalAnswer && (
                      <div className="mt-3 space-y-2 text-sm">
                        {legalAnswer.plain_answer && (
                          <p className="text-white leading-relaxed">{legalAnswer.plain_answer}</p>
                        )}
                        {legalAnswer.legal_basis && legalAnswer.legal_basis.length > 0 && (
                          <div className="rounded bg-slate-800/60 p-2">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Legal basis</p>
                            <ul className="space-y-0.5">
                              {legalAnswer.legal_basis.map((b, i) => (
                                <li key={i} className="text-xs text-gray-200">• {b}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {legalAnswer.next_actions && legalAnswer.next_actions.length > 0 && (
                          <div className="rounded bg-slate-800/60 p-2">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Next actions</p>
                            <ul className="space-y-0.5">
                              {legalAnswer.next_actions.map((a, i) => (
                                <li key={i} className="text-xs text-gray-200">→ {a}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {legalAnswer.deadlines && (
                          <p className="text-xs text-amber-200"><strong>Deadlines:</strong> {legalAnswer.deadlines}</p>
                        )}
                        {typeof legalAnswer.confidence === "number" && (
                          <p className="text-[10px] text-gray-500">
                            Confidence: {Math.round(legalAnswer.confidence * 100)}%
                            {legalAnswer.human_review && " · Human review recommended"}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <Empty msg="No TRC case on file" />
            )}
          </Panel>
        );

      case "permit":
        return (
          <Panel key="permit">
            <PanelHeader
              icon={<FileText className="w-4 h-4 text-purple-400" />}
              title="Work permit"
              onOpen={() => { setLocation(`/permits?workerId=${workerId}`); onClose(); }}
              openLabel="Open permit"
            />
            {data.workPermit ? (
              <>
                <Row label="Type" value={data.workPermit.type} />
                <Row label="Status" value={data.workPermit.status} />
                <Row label="Start" value={fmtDate(data.workPermit.startDate)} />
                <Row label="End" value={fmtDate(data.workPermit.endDate)} />
                {w.workPermitExpiry && (
                  <Row label="Expiry" value={`${fmtDate(w.workPermitExpiry)}${daysUntil(w.workPermitExpiry) !== null ? ` (${daysUntil(w.workPermitExpiry)}d)` : ""}`} />
                )}
              </>
            ) : (
              <Empty msg="No active work permit" />
            )}
          </Panel>
        );

      case "documents":
        return (
          <Panel key="documents">
            <div id="wc-panel-documents" />
            <PanelHeader
              icon={<FileText className="w-4 h-4" />}
              title="Documents"
              count={data.documents.length}
            />
            {data.documents.length === 0 ? (
              <Empty msg="No documents on file" />
            ) : (
              <ul className="space-y-1.5">
                {data.documents.slice(0, 10).map(d => (
                  <li key={d.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="text-white truncate">{d.filename ?? d.fieldName ?? "Untitled"}</p>
                      <p className="text-xs text-gray-500 font-mono">{fmtDate(d.uploadedAt)}</p>
                    </div>
                    {d.url && (
                      <a href={String(d.url)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 ml-2">
                        View →
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );

      case "notes": {
        // Two heterogeneous note sources:
        //   - data.notes.worker: from worker_notes via Drizzle. JS keys are
        //     camelCase per Drizzle mapping. Schema (migrate.ts:174-180):
        //     id, worker_id, content, updated_by, updated_at. No author
        //     field, no created_at — only updated_by + updated_at.
        //   - data.notes.trc: from trc_case_notes via raw SQL `SELECT *`.
        //     Column names are snake_case. Schema (migrate.ts:1419-1425):
        //     id, case_id, author, content, created_at. No updated_at.
        // Normalize both into a unified shape before sort + render.
        const merged: Array<{ id: string; content: string; who: string; when: string; source: "worker" | "trc" }> = [
          ...data.notes.worker.map(n => ({
            id: String(n.id),
            content: String(n.content ?? ""),
            who: String((n as unknown as { updatedBy?: string }).updatedBy ?? "Unknown"),
            when: String((n as unknown as { updatedAt?: string }).updatedAt ?? ""),
            source: "worker" as const,
          })),
          ...data.notes.trc.map(n => ({
            id: String(n.id),
            content: String(n.content ?? ""),
            who: String((n as unknown as { author?: string }).author ?? "Unknown"),
            when: String((n as unknown as { created_at?: string }).created_at ?? ""),
            source: "trc" as const,
          })),
        ].sort((a, b) => {
          const da = a.when ? new Date(a.when).getTime() : 0;
          const db = b.when ? new Date(b.when).getTime() : 0;
          return db - da;
        });
        return (
          <Panel key="notes">
            <div id="wc-panel-notes" />
            <PanelHeader
              icon={<StickyNote className="w-4 h-4" />}
              title="Notes"
              count={merged.length}
            />
            {merged.length === 0 ? (
              <Empty msg="No notes yet" />
            ) : (
              <ul className="space-y-2">
                {merged.slice(0, 8).map(n => (
                  <li key={`${n.source}-${n.id}`} className="rounded bg-slate-800/40 p-2">
                    <p className="text-sm text-white leading-snug">{n.content}</p>
                    <p className="text-[10px] text-gray-500 font-mono mt-1">
                      {n.who} · {fmtDateTime(n.when)}
                      {n.source === "trc" && " · TRC"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      }

      case "payroll":
        return (
          <Panel key="payroll">
            <PanelHeader
              icon={<Wallet className="w-4 h-4 text-green-400" />}
              title="Payroll"
              onOpen={() => { setLocation(`/payroll?workerId=${workerId}`); onClose(); }}
              openLabel="Open payroll"
            />
            <Row label="Hourly rate" value={w.hourlyNettoRate ? `${w.hourlyNettoRate} PLN` : null} mono />
            <Row label="Total hours" value={w.totalHours} mono />
            <Row label="Advance" value={w.advancePayment ? `${w.advancePayment} PLN` : null} mono />
            <Row label="IBAN" value={w.iban} mono />
            {data.payroll.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <p className="text-xs text-gray-400 mb-1">Recent records</p>
                <ul className="space-y-1">
                  {data.payroll.slice(0, 3).map(p => (
                    <li key={p.id} className="flex items-center justify-between text-xs font-mono">
                      <span className="text-gray-300">{p.periodMonth ?? "—"}</span>
                      <span className="text-white">{p.netPay ?? "—"} PLN</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        );

      case "whatsapp":
        return (
          <Panel key="whatsapp">
            <PanelHeader
              icon={<MessageCircle className="w-4 h-4 text-green-500" />}
              title="WhatsApp"
              count={data.whatsappMessages.length}
              onOpen={() => { setLocation(`/messaging?workerId=${workerId}`); onClose(); }}
              openLabel="Open chat"
            />
            {data.whatsappMessages.length === 0 ? (
              <Empty msg="No messages yet" />
            ) : (
              <ul className="space-y-1.5">
                {data.whatsappMessages.slice(0, 5).map(m => {
                  const inbound = m.direction === "inbound" || m.direction === "received";
                  return (
                    <li key={m.id} className={`rounded p-2 text-sm flex items-start gap-2 ${
                      inbound ? "bg-green-500/10 border border-green-500/20" : "bg-blue-500/10 border border-blue-500/20"
                    }`}>
                      {inbound ? <ArrowDownLeft className="w-3.5 h-3.5 mt-0.5 text-green-400 flex-shrink-0" />
                              : <ArrowUpRight className="w-3.5 h-3.5 mt-0.5 text-blue-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs leading-snug">{m.body}</p>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                          {fmtDateTime(m.sentAt ?? m.receivedAt ?? m.createdAt)}
                          {m.status && ` · ${m.status}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        );

      case "ai":
        return (
          <Panel key="ai">
            <PanelHeader
              icon={<Sparkles className="w-4 h-4 text-yellow-400" />}
              title="AI summary"
            />
            {aiLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Generating…
              </div>
            ) : aiError ? (
              <p className="text-xs text-red-300">{aiError}</p>
            ) : aiSummary ? (
              <div className="space-y-3">
                <p className="text-sm text-white leading-relaxed">{aiSummary.summary}</p>
                {aiSummary.actions && aiSummary.actions.length > 0 && (
                  <div className="space-y-1.5">
                    {aiSummary.actions.map((a, i) => (
                      <button
                        key={i}
                        onClick={() => dispatchAction(a)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                          a.priority === "high"
                            ? "bg-red-500/15 border border-red-500/40 text-red-100 hover:bg-red-500/25"
                            : a.priority === "med"
                              ? "bg-amber-500/15 border border-amber-500/40 text-amber-100 hover:bg-amber-500/25"
                              : "bg-blue-500/15 border border-blue-500/40 text-blue-100 hover:bg-blue-500/25"
                        }`}
                        title={a.reasoning}
                      >
                        {a.label}
                        {a.reasoning && <span className="block text-[10px] font-normal text-gray-400 mt-0.5">{a.reasoning}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => workerId && fetchAiSummary(workerId)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Generate AI summary →
              </button>
            )}
          </Panel>
        );

      case "aiHistory":
        return (
          <Panel key="aiHistory">
            <PanelHeader
              icon={<Sparkles className="w-4 h-4 text-purple-400" />}
              title="AI decisions"
              count={data.aiReasoning.length}
            />
            {data.aiReasoning.length === 0 ? (
              <Empty msg="No AI decisions yet" />
            ) : (
              <ul className="space-y-2">
                {data.aiReasoning.slice(0, 5).map(r => {
                  const conf = typeof r.confidence === "number" ? Math.round(r.confidence * 100) : null;
                  return (
                    <li key={r.id} className="rounded bg-slate-800/40 p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-white">{r.decision_type}</span>
                        {conf !== null && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            conf >= 80 ? "bg-green-500/20 text-green-300"
                              : conf >= 50 ? "bg-amber-500/20 text-amber-300"
                              : "bg-red-500/20 text-red-300"
                          }`}>{conf}%</span>
                        )}
                      </div>
                      {r.input_summary && (
                        <p className="text-xs text-gray-300 leading-snug">{r.input_summary}</p>
                      )}
                      <p className="text-[10px] text-gray-500 font-mono mt-1">
                        {r.decided_action} · {r.reviewed_by ?? "—"} · {fmtDateTime(r.created_at)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        );

      case "history":
        return (
          <Panel key="history">
            <PanelHeader
              icon={<History className="w-4 h-4" />}
              title="Recent changes"
              count={data.auditHistory.length}
            />
            {data.auditHistory.length === 0 ? (
              <Empty msg="No changes yet" />
            ) : (
              <ul className="space-y-1">
                {data.auditHistory.slice(0, 5).map(a => (
                  <li key={a.id} className="text-xs flex items-baseline justify-between gap-2">
                    <span className="text-gray-300 truncate">
                      <span className="font-mono text-white">{a.action}</span>
                      {a.field && <span className="text-gray-500"> · {a.field}</span>}
                    </span>
                    <span className="text-gray-500 font-mono whitespace-nowrap">{fmtDateTime(a.timestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );

      default:
        return null;
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 top-[52px] bg-black/60 backdrop-blur-sm z-[205] transition-opacity duration-300"
      />

      {/* Cockpit slide-over (wider than WorkerProfilePanel — 11 panels needs the room) */}
      <div
        className="fixed right-0 top-[52px] bottom-0 w-full max-w-3xl bg-slate-950 border-l border-white/10 shadow-2xl z-[210] overflow-y-auto transform transition-transform duration-300 ease-out translate-x-0"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-xl border-b border-white/10 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading worker…</span>
                </div>
              ) : error ? (
                <div className="text-red-300">
                  <p className="font-bold text-sm">Failed to load</p>
                  <p className="text-xs mt-0.5">{error}</p>
                </div>
              ) : data ? (
                <>
                  <h2 className="text-xl font-black text-white truncate">{data.worker.name}</h2>
                  <div className="flex items-center flex-wrap gap-2 mt-1.5 text-xs">
                    {data.worker.jobRole && (
                      <span className="px-2 py-0.5 rounded bg-white/10 text-gray-300 font-mono">{data.worker.jobRole}</span>
                    )}
                    {data.worker.nationality && (
                      <span className="px-2 py-0.5 rounded bg-white/10 text-gray-300">{data.worker.nationality}</span>
                    )}
                    {data.worker.assignedSite && (
                      <span className="flex items-center gap-1 text-gray-400">
                        <MapPin className="w-3 h-3" /> {data.worker.assignedSite}
                      </span>
                    )}
                    {data.worker.pipelineStage && (
                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                        {data.worker.pipelineStage}
                      </span>
                    )}
                  </div>
                  {/* Inline contact strip */}
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    {editingContact ? (
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <input
                          type="email"
                          placeholder="email@…"
                          value={emailDraft}
                          onChange={e => setEmailDraft(e.target.value)}
                          className="px-2 py-1 rounded bg-slate-800 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                        />
                        <input
                          type="tel"
                          placeholder="+48…"
                          value={phoneDraft}
                          onChange={e => setPhoneDraft(e.target.value)}
                          className="px-2 py-1 rounded bg-slate-800 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => setEditingContact(false)}
                          disabled={contactSaving}
                          className="col-span-1 px-2 py-1 rounded bg-white/5 text-gray-400 hover:text-white text-xs"
                        >Cancel</button>
                        <button
                          onClick={saveContact}
                          disabled={contactSaving}
                          className="col-span-1 px-2 py-1 rounded bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          {contactSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-gray-400">
                          <Mail className="w-3 h-3" /> {data.worker.email ?? "—"}
                        </span>
                        <span className="flex items-center gap-1 text-gray-400">
                          <Phone className="w-3 h-3" /> {data.worker.phone ?? "—"}
                        </span>
                        <button
                          onClick={() => setEditingContact(true)}
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : null}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
              aria-label="Close cockpit"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Panels in role-adaptive order */}
        {data && (
          <div className="px-6 py-4 space-y-4">
            {order.map(key => renderPanel(key))}
          </div>
        )}
      </div>
    </>
  );
}

export default WorkerCockpit;
