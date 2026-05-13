import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  X,
  AlertTriangle,
  FileText,
  Briefcase,
  StickyNote,
  Wallet,
  ShieldCheck,
  Sparkles,
  Clock,
  Mail,
  Phone,
  MapPin,
  Pencil,
  Check,
  MessageCircle,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import {
  fetchWorkerCockpit,
  fetchWorkerAiSummary,
  appendWorkerNote,
  patchWorker,
  fetchWhatsAppTemplates,
  whatsappQuickSend,
  type CockpitResponse,
  type CockpitAlert,
  type AiSummaryResponse,
  type AiSuggestedAction,
  type WhatsAppTemplate,
} from "@/lib/api";
import DocumentScanFlow from "./DocumentScanFlow";
import { setDeepLinkWorker } from "@/lib/navContext";

interface Props {
  workerId: string;
  viewerRole?: "executive" | "legal" | "operations" | "candidate" | string;
  onClose: () => void;
  onOpenModule?: (module: "trc" | "permits" | "payroll" | "documents" | "notes", workerId: string) => void;
}

type PanelKey =
  | "alerts"
  | "identity"
  | "trc"
  | "permit"
  | "documents"
  | "notes"
  | "whatsapp"
  | "payroll"
  | "ai"
  | "aiHistory"
  | "history";

// Role-adaptive panel order. Same data, different priority above the fold.
// Operations gets WhatsApp near the top — Yana especially lives in chat with
// Ukrainian workers. Legal sees it lower; executive lowest.
function panelOrderFor(role?: string): PanelKey[] {
  if (role === "legal") {
    return ["alerts", "trc", "documents", "notes", "whatsapp", "identity", "permit", "ai", "aiHistory", "payroll", "history"];
  }
  if (role === "executive") {
    return ["alerts", "permit", "payroll", "identity", "trc", "documents", "notes", "whatsapp", "ai", "aiHistory", "history"];
  }
  if (role === "operations") {
    return ["alerts", "identity", "whatsapp", "permit", "documents", "notes", "trc", "ai", "aiHistory", "payroll", "history"];
  }
  // candidate / unknown — keep order conservative
  return ["alerts", "identity", "documents", "permit", "trc", "notes", "whatsapp", "payroll", "ai", "aiHistory", "history"];
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function AlertStrip({
  alerts,
  onAlertClick,
}: {
  alerts: CockpitAlert[];
  onAlertClick?: (alert: CockpitAlert) => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <div className="wc-alert-strip">
      {alerts.map((a, i) => {
        const clickable = !!onAlertClick;
        return (
          <button
            key={i}
            className={`wc-alert wc-alert-${a.level}${clickable ? " wc-alert-clickable" : ""}`}
            onClick={clickable ? () => onAlertClick(a) : undefined}
            disabled={!clickable}
            type="button"
          >
            <AlertTriangle size={14} strokeWidth={2.5} />
            <span className="wc-alert-msg">{a.message}</span>
            {a.date && <span className="wc-alert-date">{fmtDate(a.date)}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Panel({
  icon,
  title,
  count,
  children,
  onOpen,
  openLabel,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
  onOpen?: () => void;
  openLabel?: string;
}) {
  return (
    <section className="wc-panel">
      <header className="wc-panel-header">
        <div className="wc-panel-title">
          {icon}
          <span>{title}</span>
          {count !== undefined && count > 0 && <span className="wc-panel-count">{count}</span>}
        </div>
        {onOpen && (
          <button className="wc-panel-open" onClick={onOpen}>
            {openLabel ?? "Open"} →
          </button>
        )}
      </header>
      <div className="wc-panel-body">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="wc-row">
      <div className="wc-row-label">{label}</div>
      <div className={"wc-row-value" + (mono ? " wc-mono" : "")}>
        {value === undefined || value === null || String(value) === "" ? "—" : String(value)}
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="wc-empty">{msg}</div>;
}

export default function WorkerCockpit({ workerId, viewerRole, onClose, onOpenModule }: Props) {
  const [data, setData] = useState<CockpitResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI summary state — separate from cockpit fetch so cockpit renders fast
  // and AI loads in the background. Auto-fires when alerts exist (worker has
  // something pressing); otherwise user clicks "Generate" if they want it.
  // Keeps the AI cost proportional to risk: green workers don't burn tokens.
  const [aiSummary, setAiSummary] = useState<AiSummaryResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Scan-document state — opens the DocumentScanFlow with this worker pre-pinned.
  const [showScanFlow, setShowScanFlow] = useState(false);

  // Quick-add note state — inline input in the Notes panel.
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // Inline contact edit (phone + email). Small daily-use win — Liza/Anna
  // fix typos without leaving the cockpit. PATCH /workers/:id handles audit.
  const [editingContact, setEditingContact] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [contactSaving, setContactSaving] = useState(false);

  // WhatsApp quick-send: pick a template, fill variables, send via Twilio.
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([]);
  const [showWaPicker, setShowWaPicker] = useState(false);
  const [pickedTemplate, setPickedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [waVariables, setWaVariables] = useState<Record<string, string>>({});
  const [waSending, setWaSending] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);

  useEffect(() => {
    fetchWhatsAppTemplates().then(setWaTemplates).catch(() => setWaTemplates([]));
  }, []);

  function openWaPicker() {
    setShowWaPicker(true);
    setPickedTemplate(null);
    setWaError(null);
  }

  function pickTemplate(t: WhatsAppTemplate) {
    setPickedTemplate(t);
    // Pre-fill from worker for common variable names — saves Yana typing.
    const prefill: Record<string, string> = {};
    for (const v of t.variables) {
      const k = v.toLowerCase();
      if (k.includes("name") && data?.worker?.name) prefill[v] = data.worker.name;
      if (k.includes("worker") && data?.worker?.name) prefill[v] = data.worker.name;
      if (k.includes("trc") && data?.worker?.trcExpiry) prefill[v] = String(data.worker.trcExpiry).slice(0, 10);
      if (k.includes("permit") && data?.worker?.workPermitExpiry) prefill[v] = String(data.worker.workPermitExpiry).slice(0, 10);
      if (k.includes("site") && data?.worker?.assignedSite) prefill[v] = data.worker.assignedSite;
    }
    setWaVariables(prefill);
  }

  // Dispatch an AI-suggested action to the corresponding flow. This is the
  // bridge between AI suggestions and concrete tools — "one click closer to
  // the result" in Manish's phrasing.
  function handleAiAction(action: AiSuggestedAction) {
    switch (action.actionType) {
      case "scan_document":
        setShowScanFlow(true);
        break;
      case "send_whatsapp":
        if (waTemplates.length > 0) {
          openWaPicker();
          // If the AI suggested a specific template, auto-pick it once the
          // picker is open. Looks up by name against active templates; if no
          // match, the picker stays on the template list (graceful fallback).
          if (action.templateHint) {
            const match = waTemplates.find((t) => t.name === action.templateHint);
            if (match) pickTemplate(match);
          }
        }
        break;
      case "open_trc":
        if (onOpenModule) {
          setDeepLinkWorker(workerId, data?.worker?.name);
          onOpenModule("trc", workerId);
        }
        break;
      case "open_permit":
        if (onOpenModule) {
          setDeepLinkWorker(workerId, data?.worker?.name);
          onOpenModule("permits", workerId);
        }
        break;
      case "open_payroll":
        if (onOpenModule) {
          setDeepLinkWorker(workerId, data?.worker?.name);
          onOpenModule("payroll", workerId);
        }
        break;
      case "add_note":
        // Scroll the notes panel into view + focus the input. Cheapest reliable
        // UX: just scroll to the bottom; the input is visible by then.
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        break;
      case "none":
      default:
        // Informational only — no flow to trigger.
        break;
    }
  }

  async function sendWa() {
    if (!pickedTemplate || waSending) return;
    setWaSending(true);
    setWaError(null);
    try {
      await whatsappQuickSend({
        templateName: pickedTemplate.name,
        workerId,
        variables: waVariables,
        triggerEvent: "manual",
      });
      setShowWaPicker(false);
      setPickedTemplate(null);
      setWaVariables({});
      const fresh = await fetchWorkerCockpit(workerId);
      setData(fresh);
    } catch (e) {
      setWaError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setWaSending(false);
    }
  }

  function startEditContact() {
    setEmailDraft(data?.worker?.email ?? "");
    setPhoneDraft(data?.worker?.phone ?? "");
    setEditingContact(true);
  }

  async function saveContact() {
    if (contactSaving) return;
    setContactSaving(true);
    try {
      await patchWorker(workerId, { email: emailDraft.trim(), phone: phoneDraft.trim() });
      const fresh = await fetchWorkerCockpit(workerId);
      setData(fresh);
      setEditingContact(false);
    } catch {
      // Keep edit mode so the user can retry.
    } finally {
      setContactSaving(false);
    }
  }

  async function submitNote() {
    const text = noteDraft.trim();
    if (!text || noteSaving) return;
    setNoteSaving(true);
    try {
      await appendWorkerNote(workerId, text);
      setNoteDraft("");
      // Refetch cockpit so the new note appears in the panel.
      const fresh = await fetchWorkerCockpit(workerId);
      setData(fresh);
    } catch {
      // Keep the draft so the user doesn't lose it.
    } finally {
      setNoteSaving(false);
    }
  }

  const generateAiSummary = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetchWorkerAiSummary(workerId);
      setAiSummary(res);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI summary unavailable");
    } finally {
      setAiLoading(false);
    }
  }, [workerId]);

  // Only auto-fire AI summary on the FIRST cockpit open per workerId. Cost-
  // aware: we don't want to regenerate on every refetch triggered by minor
  // actions (adding a note, editing a phone number, applying a scan). The
  // user can always tap "Refresh" if they want a fresh AI read.
  const autoFiredRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Reset AI state only when switching to a different worker. Refetches for
    // the same worker preserve the existing summary so we don't waste tokens.
    if (autoFiredRef.current !== workerId) {
      setAiSummary(null);
      setAiError(null);
    }
    fetchWorkerCockpit(workerId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
        // Auto-fire AI summary only once per worker per cockpit-open session
        // AND only if there are alerts worth analysing.
        if (autoFiredRef.current !== workerId && res.alerts.length > 0) {
          autoFiredRef.current = workerId;
          generateAiSummary();
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load worker");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workerId, generateAiSummary]);

  // Resolve panel order using the server's reported viewerRole when available,
  // falling back to the role passed in by the parent.
  const panelOrder = useMemo(
    () => panelOrderFor(data?.meta?.viewerRole ?? viewerRole),
    [data?.meta?.viewerRole, viewerRole],
  );

  if (loading) {
    return (
      <div className="wc-overlay" onClick={onClose}>
        <div className="wc-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="wc-loading">Loading worker…</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="wc-overlay" onClick={onClose}>
        <div className="wc-sheet" onClick={(e) => e.stopPropagation()}>
          <button className="wc-close" onClick={onClose}>
            <X size={14} strokeWidth={2.5} />
          </button>
          <div className="wc-error">{error ?? "No data"}</div>
        </div>
      </div>
    );
  }

  const w = data.worker;

  // Renderable panels keyed by PanelKey.
  const panels: Record<PanelKey, React.ReactNode> = {
    alerts:
      data.alerts.length > 0 ? (
        <AlertStrip
          alerts={data.alerts}
          onAlertClick={(a) => {
            // Map alert field → action. Expiry alerts (TRC / work permit /
            // medical / oświadczenie / UDT) open the scan flow so the user
            // can file the renewal document. Missing-TRC-docs opens the
            // same flow. Contract-end navigates to payroll (Anna's domain).
            const scanFields = new Set([
              "trcExpiry",
              "workPermitExpiry",
              "badaniaLekExpiry",
              "oswiadczenieExpiry",
              "udtCertExpiry",
              "trcDocuments",
            ]);
            if (scanFields.has(a.field)) {
              setShowScanFlow(true);
              return;
            }
            if (a.field === "contractEndDate" && onOpenModule) {
              onOpenModule("payroll", workerId);
            }
          }}
        />
      ) : null,

    identity: (
      <Panel icon={<MapPin size={14} strokeWidth={2.2} />} title="Identity">
        <Row label="Job role" value={w.jobRole ?? w.specialization} />
        <Row label="Nationality" value={w.nationality} />
        <Row label="Site" value={w.assignedSite ?? w.siteLocation} />
        <Row label="Voivodeship" value={w.voivodeship} />
        <Row label="Visa type" value={w.visaType} />
        <Row label="PESEL" value={w.pesel} mono />
        <Row label="Pipeline stage" value={w.pipelineStage} />
      </Panel>
    ),

    trc: (
      <Panel
        icon={<ShieldCheck size={14} strokeWidth={2.2} />}
        title="TRC case"
        onOpen={
          onOpenModule && data.trcCase
            ? () => {
                setDeepLinkWorker(workerId, w.name);
                onOpenModule("trc", workerId);
              }
            : undefined
        }
        openLabel="Open TRC →"
      >
        {data.trcCase ? (
          <>
            <Row label="Status" value={data.trcCase.status} />
            <Row label="Permit type" value={data.trcCase.permit_type} />
            <Row label="Voivodeship" value={data.trcCase.voivodeship} />
            <Row label="Applied" value={fmtDate(data.trcCase.application_date)} />
            <Row label="Submitted" value={fmtDate(data.trcCase.submission_date)} />
            <Row label="Decision expected" value={fmtDate(data.trcCase.expected_decision_date)} />
            <Row label="Appointment" value={fmtDate(data.trcCase.appointment_date)} />
            <Row label="Renewal deadline" value={fmtDate(data.trcCase.renewal_deadline)} />
            <Row
              label="Docs"
              value={
                data.trcCase.total_documents
                  ? `${data.trcCase.uploaded_documents}/${data.trcCase.total_documents} uploaded · ${data.trcCase.missing_documents} missing`
                  : "—"
              }
            />
          </>
        ) : (
          <Empty msg="No TRC case for this worker yet." />
        )}
      </Panel>
    ),

    permit: (
      <Panel
        icon={<Briefcase size={14} strokeWidth={2.2} />}
        title="Work permit"
        onOpen={
          onOpenModule && data.workPermit
            ? () => {
                setDeepLinkWorker(workerId, w.name);
                onOpenModule("permits", workerId);
              }
            : undefined
        }
        openLabel="Open permit →"
      >
        {data.workPermit ? (
          <>
            <Row label="Type" value={data.workPermit.permitType ?? data.workPermit.permit_type} />
            <Row label="Status" value={data.workPermit.status} />
            <Row label="Submitted" value={fmtDate(data.workPermit.submittedAt ?? data.workPermit.submitted_at)} />
            <Row label="Decision" value={fmtDate(data.workPermit.decisionDate ?? data.workPermit.decision_date)} />
            <Row label="Expiry" value={fmtDate(data.workPermit.expiryDate ?? data.workPermit.expiry_date ?? w.workPermitExpiry)} />
          </>
        ) : (
          <Empty msg="No work permit on file." />
        )}
      </Panel>
    ),

    documents: (
      <Panel
        icon={<FileText size={14} strokeWidth={2.2} />}
        title="Documents"
        count={data.documents.length}
        onOpen={() => setShowScanFlow(true)}
        openLabel="Scan & file →"
      >
        {data.documents.length === 0 ? (
          <Empty msg="No documents on file — tap “Scan & file →” to add one." />
        ) : (
          <div className="wc-doc-list">
            {data.documents.slice(0, 8).map((d: any) => (
              <div key={d.id} className="wc-doc-row">
                <span className="wc-doc-field">{d.fieldName ?? d.field_name ?? "Document"}</span>
                <span className="wc-doc-name">{d.filename}</span>
                <span className="wc-doc-date">{fmtDate(d.uploadedAt ?? d.uploaded_at)}</span>
              </div>
            ))}
            {data.documents.length > 8 && (
              <div className="wc-doc-more">+ {data.documents.length - 8} more</div>
            )}
          </div>
        )}
      </Panel>
    ),

    notes: (
      <Panel
        icon={<StickyNote size={14} strokeWidth={2.2} />}
        title="Notes"
        count={data.notes.worker.length + data.notes.trc.length}
      >
        {/* Inline quick-add — daily-use friction relief. Appends a new note
            (not an upsert) so the feed grows chronologically. */}
        <div className="wc-note-add">
          <input
            type="text"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitNote();
              }
            }}
            placeholder="Add a note about this worker…"
            disabled={noteSaving}
            className="wc-note-input"
          />
          <button
            className="wc-note-submit"
            onClick={submitNote}
            disabled={noteSaving || noteDraft.trim() === ""}
          >
            {noteSaving ? "Saving…" : "Add"}
          </button>
        </div>

        {data.notes.worker.length + data.notes.trc.length === 0 ? (
          <Empty msg="No notes yet — add one above." />
        ) : (
          <div className="wc-note-list">
            {[
              ...data.notes.worker.map((n: any) => ({
                kind: "worker" as const,
                content: n.content,
                by: n.updatedBy ?? n.updated_by,
                at: n.updatedAt ?? n.updated_at,
              })),
              ...data.notes.trc.map((n: any) => ({
                kind: "trc" as const,
                content: n.content,
                by: n.author,
                at: n.createdAt ?? n.created_at,
              })),
            ]
              .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
              .slice(0, 6)
              .map((n, i) => (
                <div key={i} className={`wc-note wc-note-${n.kind}`}>
                  <div className="wc-note-meta">
                    <span className="wc-note-kind">{n.kind === "trc" ? "TRC" : "Worker"}</span>
                    <span className="wc-note-by">{n.by ?? "—"}</span>
                    <span className="wc-note-at">{fmtDate(n.at)}</span>
                  </div>
                  <div className="wc-note-content">{n.content}</div>
                </div>
              ))}
          </div>
        )}
      </Panel>
    ),

    payroll: (
      <Panel
        icon={<Wallet size={14} strokeWidth={2.2} />}
        title="Payroll"
        onOpen={
          onOpenModule
            ? () => {
                setDeepLinkWorker(workerId, w.name);
                onOpenModule("payroll", workerId);
              }
            : undefined
        }
        openLabel="Open payroll →"
      >
        <Row label="Hourly rate (net)" value={w.hourlyNettoRate ? `${w.hourlyNettoRate} PLN/h` : null} />
        <Row label="Total hours" value={w.totalHours} />
        <Row label="Advance paid" value={w.advancePayment ? `${w.advancePayment} PLN` : null} />
        <Row label="ZUS status" value={w.zusStatus} />
        <Row label="IBAN" value={w.iban} mono />
        {data.payroll.length > 0 && (
          <div className="wc-payroll-recent">
            <div className="wc-payroll-recent-label">Recent records</div>
            {data.payroll.slice(0, 3).map((p: any) => (
              <div key={p.id} className="wc-payroll-row">
                <span>{p.periodLabel ?? p.period_label ?? fmtDate(p.createdAt ?? p.created_at)}</span>
                <span className="wc-mono">{p.netAmount ?? p.net_amount ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    ),

    ai: (
      <Panel
        icon={<Sparkles size={14} strokeWidth={2.2} />}
        title="AI summary"
        onOpen={aiSummary || aiLoading ? undefined : generateAiSummary}
        openLabel="Generate →"
      >
        {aiLoading && (
          <div className="wc-ai-loading">
            <Sparkles size={12} strokeWidth={2.2} /> Generating summary…
          </div>
        )}
        {!aiLoading && aiError && (
          <div className="wc-ai-error">
            {aiError}
            <button className="wc-ai-retry" onClick={generateAiSummary}>
              Retry
            </button>
          </div>
        )}
        {!aiLoading && !aiError && aiSummary && (
          <>
            <div className="wc-ai-summary">{aiSummary.summary}</div>

            {/* Suggested actions — Liza's "one click closer to the result." */}
            {aiSummary.actions && aiSummary.actions.length > 0 && (
              <div className="wc-ai-actions">
                {aiSummary.actions.map((a, idx) => (
                  <button
                    key={idx}
                    className={`wc-ai-action wc-ai-action-${a.priority}`}
                    onClick={() => handleAiAction(a)}
                    title={a.reasoning ?? undefined}
                  >
                    <span className="wc-ai-action-dot" />
                    <span className="wc-ai-action-label">{a.label}</span>
                    <span className="wc-ai-action-priority">{a.priority}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="wc-ai-meta">
              <span>Generated {new Date(aiSummary.generatedAt).toLocaleTimeString()}</span>
              <button className="wc-ai-refresh" onClick={generateAiSummary}>
                Refresh
              </button>
            </div>
          </>
        )}
        {!aiLoading && !aiError && !aiSummary && (
          <Empty msg="No alerts — AI summary on demand. Tap “Generate” above." />
        )}
      </Panel>
    ),

    history: (
      <Panel
        icon={<Clock size={14} strokeWidth={2.2} />}
        title="Recent changes"
        count={data.auditHistory.length}
      >
        {data.auditHistory.length === 0 ? (
          <Empty msg="No history recorded." />
        ) : (
          <div className="wc-history-list">
            {data.auditHistory.slice(0, 5).map((h: any) => (
              <div key={h.id} className="wc-history-row">
                <span className="wc-history-action">{h.action}</span>
                <span className="wc-history-field">{h.field}</span>
                <span className="wc-history-actor">{h.actor}</span>
                <span className="wc-history-at">{fmtDate(h.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    ),

    whatsapp: (
      <Panel
        icon={<MessageCircle size={14} strokeWidth={2.2} />}
        title="WhatsApp"
        count={data.whatsappMessages?.length ?? 0}
        onOpen={waTemplates.length > 0 ? openWaPicker : undefined}
        openLabel="Send →"
      >
        {(!data.whatsappMessages || data.whatsappMessages.length === 0) ? (
          <Empty msg="No WhatsApp messages with this worker yet." />
        ) : (
          <div className="wc-wa-list">
            {data.whatsappMessages.slice(0, 5).map((m: any) => {
              const inbound = m.direction === "INBOUND" || m.direction === "inbound";
              const when = m.sentAt ?? m.sent_at ?? m.receivedAt ?? m.received_at ?? m.createdAt ?? m.created_at;
              return (
                <div key={m.id} className={`wc-wa-row wc-wa-${inbound ? "in" : "out"}`}>
                  <div className="wc-wa-meta">
                    {inbound ? (
                      <ArrowDownLeft size={11} strokeWidth={2.2} />
                    ) : (
                      <ArrowUpRight size={11} strokeWidth={2.2} />
                    )}
                    <span className="wc-wa-direction">
                      {inbound ? "Received" : "Sent"}
                    </span>
                    <span className={`wc-wa-status wc-wa-status-${String(m.status ?? "").toLowerCase()}`}>
                      {m.status ?? "—"}
                    </span>
                    <span className="wc-wa-at">{fmtDate(when)}</span>
                  </div>
                  <div className="wc-wa-body">{m.body}</div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    ),

    aiHistory: (
      <Panel
        icon={<Sparkles size={14} strokeWidth={2.2} />}
        title="AI decisions"
        count={data.aiReasoning?.length ?? 0}
      >
        {(!data.aiReasoning || data.aiReasoning.length === 0) ? (
          <Empty msg="No AI decisions yet for this worker." />
        ) : (
          <div className="wc-ai-history-list">
            {data.aiReasoning.slice(0, 5).map((r: any) => {
              const fields = Array.isArray(r.output?.appliedFields)
                ? r.output.appliedFields.join(", ")
                : null;
              const confidencePct =
                r.confidence !== null && r.confidence !== undefined
                  ? Math.round(Number(r.confidence) * 100)
                  : null;
              return (
                <div key={r.id} className="wc-ai-history-row">
                  <div className="wc-ai-history-header">
                    <span className="wc-ai-history-type">
                      {String(r.decision_type ?? "decision").replace(/_/g, " ")}
                    </span>
                    {confidencePct !== null && (
                      <span className={`wc-ai-history-confidence ${
                        confidencePct >= 80 ? "wc-c-high" : confidencePct >= 50 ? "wc-c-mid" : "wc-c-low"
                      }`}>
                        {confidencePct}%
                      </span>
                    )}
                    <span className="wc-ai-history-at">{fmtDate(r.created_at)}</span>
                  </div>
                  <div className="wc-ai-history-detail">
                    {r.input_summary && <span>{r.input_summary}</span>}
                    {fields && <span> · fields: {fields}</span>}
                    {r.reviewed_by && <span> · by {r.reviewed_by}</span>}
                    <span className={`wc-ai-history-action wc-ai-action-${r.decided_action ?? "unknown"}`}>
                      {r.decided_action ?? "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    ),
  };

  return (
    <div className="wc-overlay" onClick={onClose}>
      <div className="wc-sheet" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="wc-header">
          <div className="wc-header-info">
            <h2 className="wc-name">{w.name}</h2>
            <div className="wc-subtitle">
              <span>{w.jobRole ?? w.specialization ?? "Worker"}</span>
              {w.assignedSite && <span> · {w.assignedSite}</span>}
              {w.nationality && <span> · {w.nationality}</span>}
            </div>
          </div>
          <button className="wc-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2.5} />
          </button>
        </header>

        {/* Contact strip — inline editable (Pencil icon) */}
        <div className="wc-contact-strip">
          {editingContact ? (
            <>
              <input
                className="wc-contact-edit"
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="Email"
                disabled={contactSaving}
              />
              <input
                className="wc-contact-edit"
                type="tel"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
                placeholder="Phone"
                disabled={contactSaving}
              />
              <button
                className="wc-contact-save"
                onClick={saveContact}
                disabled={contactSaving}
                aria-label="Save contact"
              >
                <Check size={13} strokeWidth={2.5} />
                {contactSaving ? "Saving" : "Save"}
              </button>
              <button
                className="wc-contact-cancel"
                onClick={() => setEditingContact(false)}
                disabled={contactSaving}
                aria-label="Cancel edit"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </>
          ) : (
            <>
              {w.email && (
                <a className="wc-contact" href={`mailto:${w.email}`}>
                  <Mail size={13} strokeWidth={2} />
                  <span>{w.email}</span>
                </a>
              )}
              {w.phone && (
                <a className="wc-contact" href={`tel:${w.phone}`}>
                  <Phone size={13} strokeWidth={2} />
                  <span>{w.phone}</span>
                </a>
              )}
              <button className="wc-contact-edit-btn" onClick={startEditContact} aria-label="Edit contact">
                <Pencil size={11} strokeWidth={2.2} />
                <span>Edit</span>
              </button>
            </>
          )}
        </div>

        {/* Panels in role-adaptive order */}
        <div className="wc-panels">
          {panelOrder.map((key) => (
            <div key={key}>{panels[key]}</div>
          ))}
        </div>

        <div style={{ height: 80 }} />
      </div>

      {showScanFlow && (
        <DocumentScanFlow
          preselectedWorkerId={workerId}
          preselectedWorkerName={w.name}
          onClose={() => setShowScanFlow(false)}
          onApplied={() => {
            // Re-fetch cockpit so the new document appears in the panel.
            setShowScanFlow(false);
            fetchWorkerCockpit(workerId).then(setData).catch(() => {});
          }}
        />
      )}

      {showWaPicker && (
        <div className="wc-overlay" onClick={() => setShowWaPicker(false)}>
          <div className="wc-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "80vh" }}>
            <button className="wc-close" onClick={() => setShowWaPicker(false)} aria-label="Close">
              <X size={16} strokeWidth={2.5} />
            </button>
            <header className="wc-header">
              <div className="wc-header-info">
                <h2 className="wc-name" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <MessageCircle size={16} strokeWidth={2.2} /> Send WhatsApp
                </h2>
                <div className="wc-subtitle">
                  To {w.name} ({w.phone ?? "no phone on file"})
                </div>
              </div>
            </header>

            <div className="wc-panels">
              {!pickedTemplate ? (
                <section className="wc-panel">
                  <div className="wc-panel-header">
                    <div className="wc-panel-title">Pick a template</div>
                  </div>
                  <div className="wc-panel-body">
                    {waTemplates.length === 0 ? (
                      <Empty msg="No active templates available." />
                    ) : (
                      <div className="wc-doc-list">
                        {waTemplates.map((t) => (
                          <button
                            key={t.id}
                            className="ds-match"
                            onClick={() => pickTemplate(t)}
                          >
                            <div className="ds-match-info">
                              <div className="ds-match-name">{t.name}</div>
                              <div className="ds-match-meta">
                                {t.language.toUpperCase()} · {t.bodyPreview.slice(0, 90)}
                                {t.bodyPreview.length > 90 ? "…" : ""}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              ) : (
                <section className="wc-panel">
                  <div className="wc-panel-header">
                    <div className="wc-panel-title">{pickedTemplate.name}</div>
                    <button className="wc-panel-open" onClick={() => setPickedTemplate(null)}>
                      ← Back
                    </button>
                  </div>
                  <div className="wc-panel-body">
                    <div className="wc-row">
                      <div className="wc-row-label">Preview</div>
                      <div className="wc-row-value" style={{ fontStyle: "italic" }}>
                        {pickedTemplate.bodyPreview}
                      </div>
                    </div>
                    {pickedTemplate.variables.length > 0 && (
                      <>
                        <div className="ds-section-label">Variables</div>
                        {pickedTemplate.variables.map((v) => (
                          <div key={v} className="ds-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                            <div className="ds-row-label">{v}</div>
                            <input
                              type="text"
                              className="wc-note-input"
                              value={waVariables[v] ?? ""}
                              onChange={(e) =>
                                setWaVariables({ ...waVariables, [v]: e.target.value })
                              }
                              placeholder={v}
                              disabled={waSending}
                            />
                          </div>
                        ))}
                      </>
                    )}

                    {waError && (
                      <div className="ds-no-match" style={{ marginTop: 8 }}>
                        {waError}
                      </div>
                    )}

                    <div className="ds-actions">
                      <button
                        className="ds-secondary"
                        onClick={() => setPickedTemplate(null)}
                        disabled={waSending}
                      >
                        Cancel
                      </button>
                      <button
                        className="ds-primary"
                        onClick={sendWa}
                        disabled={waSending || !w.phone}
                      >
                        {waSending ? "Sending…" : "Send via WhatsApp"}
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
            <div style={{ height: 60 }} />
          </div>
        </div>
      )}
    </div>
  );
}
