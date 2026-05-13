const API_BASE = "/api";
const TOKEN_KEY = "eej_token_v2";
const SESSION_KEY = "eej_session_v2";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

/** Attempt to refresh the JWT token. Returns true on success. */
async function tryRefreshToken(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/eej/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json() as { token?: string };
    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Clear auth state and redirect to login */
function forceLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
  window.location.reload();
}

/** Handle 401 responses: try refresh, retry once — don't force logout for API data calls */
async function handleUnauthorized<T>(method: () => Promise<Response>): Promise<T> {
  const res = await method();
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const retryRes = await method();
      if (retryRes.ok) return retryRes.json() as Promise<T>;
      throw new Error(`API ${retryRes.status}`);
    }
    // Don't force logout — just throw so the UI can handle it gracefully
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  return handleUnauthorized<T>(() =>
    fetch(`${API_BASE}${path}`, { headers: authHeaders() })
  );
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return handleUnauthorized<T>(() =>
    fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  return handleUnauthorized<T>(() =>
    fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body),
    })
  );
}

// Jobs
export async function fetchJobs() {
  return get<{ jobs: any[] }>("/jobs").then((d) => d.jobs ?? []);
}
export async function fetchAllJobs() {
  return get<{ jobs: any[] }>("/jobs/all").then((d) => d.jobs ?? []);
}

// Applications / ATS Pipeline
export async function fetchApplications(jobId?: string) {
  const q = jobId ? `?jobId=${jobId}` : "";
  return get<{ applications: any[] }>(`/applications${q}`).then((d) => d.applications ?? []);
}
export async function updateApplicationStage(id: string, stage: string) {
  return patch<any>(`/applications/${id}/stage`, { stage });
}

// Interviews
export async function fetchInterviews() {
  return get<{ interviews: any[] }>("/interviews").then((d) => d.interviews ?? []);
}

// Contracts
export async function generateContract(workerId: string, type?: string) {
  const q = type ? `?type=${type}` : "";
  return get<any>(`/contracts/generate/${workerId}${q}`);
}

// Invoices
export async function fetchInvoices() {
  return get<{ invoices: any[] }>("/invoices").then((d) => d.invoices ?? []);
}
export async function updateInvoiceStatus(id: string, status: string) {
  return patch<any>(`/invoices/${id}/status`, { status });
}

// Regulatory Intelligence
export async function fetchRegulatoryUpdates(category?: string) {
  const q = category ? `?category=${category}` : "";
  return get<{ updates: any[] }>(`/regulatory/updates${q}`).then((d) => d.updates ?? []);
}
export async function fetchRegulatorySummary() {
  return get<any>("/regulatory/summary");
}
export async function triggerRegulatoryScan() {
  return post<any>("/regulatory/scan");
}
export async function markUpdateRead(id: string) {
  return patch<any>(`/regulatory/updates/${id}/read`, {});
}

// Immigration Search
export async function searchImmigration(query: string, language = "en") {
  return post<{ answer: string; sources: any[]; confidence: number; actionItems: string[] }>(
    "/immigration/search",
    { query, language }
  );
}
export async function fetchImmigrationHistory() {
  return get<{ history: any[] }>("/immigration/history").then((d) => d.history ?? []);
}
export async function fetchPopularQuestions() {
  return get<{ questions: any[] }>("/immigration/popular").then((d) => d.questions ?? []);
}

// Work Permits
export async function fetchPermits() {
  return get<{ permits: any[] }>("/permits").then((d) => d.permits ?? []);
}
export async function fetchPermitDeadlines() {
  return get<{ deadlines: any[] }>("/permits/deadlines").then((d) => d.deadlines ?? []);
}
export async function fetchPermitFees() {
  return get<any>("/permits/fees");
}

// GPS Tracking
export async function fetchLatestCheckins() {
  return get<{ checkins: any[] }>("/gps/latest").then((d) => d.checkins ?? []);
}
export async function fetchWorkerCheckins(workerId: string) {
  return get<{ checkins: any[] }>(`/gps/checkins/${workerId}`).then((d) => d.checkins ?? []);
}
export async function fetchGpsConfig() {
  return get<{ token: string; configured: boolean }>("/gps/config");
}

// Workers
export async function fetchWorkers() {
  return get<{ workers: any[] }>("/workers").then((d) => d.workers ?? []);
}

// Cockpit — one call returns worker + adjacent state (TRC case, work permit,
// documents, notes, payroll, job applications, audit history, alerts).
// Backed by GET /workers/:id/cockpit. Used by the unified worker page.
export interface CockpitAlert {
  level: "red" | "amber";
  field: string;
  message: string;
  date?: string;
}
export interface CockpitResponse {
  worker: Record<string, any>;
  trcCase: Record<string, any> | null;
  workPermit: Record<string, any> | null;
  documents: Array<Record<string, any>>;
  notes: {
    worker: Array<Record<string, any>>;
    trc: Array<Record<string, any>>;
  };
  payroll: Array<Record<string, any>>;
  jobApplications: Array<Record<string, any>>;
  auditHistory: Array<Record<string, any>>;
  aiReasoning: Array<Record<string, any>>;
  whatsappMessages: Array<Record<string, any>>;
  alerts: CockpitAlert[];
  meta: {
    generatedAt: string;
    viewerRole?: string;
  };
}
export async function fetchWorkerCockpit(workerId: string): Promise<CockpitResponse> {
  return get<CockpitResponse>(`/workers/${encodeURIComponent(workerId)}/cockpit`);
}

// AI summary — role-tuned 3-sentence narrative of where this worker stands.
// 503 from the server means ANTHROPIC_API_KEY isn't configured; UI degrades
// to a friendly message rather than an error.
export interface AiSuggestedAction {
  label: string;
  actionType:
    | "scan_document"
    | "send_whatsapp"
    | "open_trc"
    | "open_permit"
    | "open_payroll"
    | "add_note"
    | "none";
  priority: "high" | "med" | "low";
  reasoning: string | null;
  // Only present when actionType === 'send_whatsapp'. Names match
  // whatsapp_templates.name and are looked up against the picker's active
  // template list — the cockpit pre-selects that template if found.
  templateHint: string | null;
}
export interface AiSummaryResponse {
  summary: string;
  actions: AiSuggestedAction[];
  generatedAt: string;
  viewerRole?: string;
}
export async function fetchWorkerAiSummary(workerId: string): Promise<AiSummaryResponse> {
  return get<AiSummaryResponse>(`/workers/${encodeURIComponent(workerId)}/ai-summary`);
}

// TRC service — used by Liza's LegalHome dashboard.
export interface TrcSummary {
  totalCases: number;
  byStatus: Array<{ status: string; count: number }>;
  casesWithMissingDocs: number;
  upcomingDeadlines: Array<{
    id: string;
    worker_name: string;
    renewal_deadline: string | null;
    appointment_date: string | null;
    status: string;
  }>;
  revenue: {
    total: number;
    paid: number;
    unpaid: number;
  };
}
export async function fetchTrcSummary(): Promise<TrcSummary> {
  // Backend at /trc/summary uses snake_case + a flatter shape; this normaliser
  // converts to the camelCase shape the UI uses and keeps it tolerant to
  // future renames.
  const raw = await get<any>("/trc/summary");
  return {
    totalCases: Number(raw?.total ?? raw?.totalCases ?? 0),
    byStatus: Array.isArray(raw?.by_status ?? raw?.byStatus)
      ? (raw.by_status ?? raw.byStatus)
      : [],
    casesWithMissingDocs: Number(
      raw?.missing_docs_cases ?? raw?.casesWithMissingDocs ?? 0,
    ),
    upcomingDeadlines: Array.isArray(raw?.upcoming_deadlines ?? raw?.upcomingDeadlines)
      ? (raw.upcoming_deadlines ?? raw.upcomingDeadlines)
      : [],
    revenue: {
      total: Number(raw?.revenue?.total_revenue ?? raw?.revenue?.total ?? 0),
      paid: Number(raw?.revenue?.paid ?? 0),
      unpaid: Number(raw?.revenue?.unpaid ?? 0),
    },
  };
}

export interface TrcCase {
  id: string;
  worker_id: string | null;
  worker_name: string;
  nationality: string | null;
  permit_type: string;
  status: string;
  voivodeship: string | null;
  application_date: string | null;
  submission_date: string | null;
  expected_decision_date: string | null;
  appointment_date: string | null;
  renewal_deadline: string | null;
  service_fee: number | string | null;
  payment_status: string | null;
  total_documents: number;
  uploaded_documents: number;
  missing_documents: number;
  created_at: string;
  updated_at: string;
}
export async function fetchTrcCases(): Promise<TrcCase[]> {
  return get<{ cases: TrcCase[] }>("/trc/cases").then((d) => d.cases ?? []);
}

// Document scanning loop — upload a doc, AI extracts entities, suggests
// worker matches, caller decides whether to apply.
export interface ScannedEntities {
  docType: string;
  personName: string | null;
  documentNumber: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  expiryDate: string | null;
  issueDate: string | null;
  issuingAuthority: string | null;
  additionalFields: Record<string, string | null>;
  rawText: string | null;
  confidence: number;
}
export interface ScanMatch {
  id: string;
  name: string;
  nationality: string | null;
  jobRole: string | null;
  pipelineStage: string | null;
  score: number;
}
export interface ScanResponse {
  entities: ScannedEntities;
  matches: ScanMatch[];
  inputHash: string;
  meta: { extractedAt: string };
}
export async function scanDocument(file: File): Promise<ScanResponse> {
  const form = new FormData();
  form.append("file", file);
  const token = localStorage.getItem("eej_token_v2");
  const res = await fetch(`${API_BASE}/workers/scan-document`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: `Scan failed (${res.status})` }));
    throw new Error(errBody.error ?? `Scan failed (${res.status})`);
  }
  return res.json() as Promise<ScanResponse>;
}

export interface ScanApplyRequest {
  entities: ScannedEntities;
  workerId?: string | null;
  createNew?: boolean;
  allowOverwrite?: boolean;
  inputHash?: string;
  filename?: string;
}
export interface ScanApplyResponse {
  workerId: string;
  created: boolean;
  appliedFields: string[];
  updates: Record<string, unknown>;
}
export async function applyScannedDocument(req: ScanApplyRequest): Promise<ScanApplyResponse> {
  return post<ScanApplyResponse>("/workers/scan-document/apply", req);
}

// Append-only worker note (cockpit Notes panel quick-add). Always inserts a
// new row — separate from the legacy single-note POST endpoint.
export async function appendWorkerNote(workerId: string, content: string): Promise<{ note: any }> {
  return post<{ note: any }>(`/workers/${encodeURIComponent(workerId)}/notes/append`, { content });
}

// Worker-side document upload (CandidateHome MyDocs flow).
// POSTs multipart to /workers/:id/upload — server stores file metadata in
// file_attachments and runs Claude OCR for passport/contract types.
export async function uploadWorkerDocument(
  workerId: string,
  docType: string,
  file: File,
): Promise<{ attachment: any; scanned?: any }> {
  const form = new FormData();
  form.append("file", file);
  form.append("docType", docType);
  const token = localStorage.getItem("eej_token_v2");
  const res = await fetch(
    `${API_BASE}/workers/${encodeURIComponent(workerId)}/upload`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `Upload failed (${res.status})` }));
    throw new Error(body.error ?? `Upload failed (${res.status})`);
  }
  return res.json();
}

// Update worker fields (cockpit inline edit). Goes to PATCH /workers/:id;
// audit + projected PII handling are done server-side.
export async function patchWorker(workerId: string, updates: Record<string, unknown>): Promise<any> {
  return patch<any>(`/workers/${encodeURIComponent(workerId)}`, updates);
}

// Clients — used by OperationsHome to replace the B2B_CONTRACTS mockData.
export interface ClientRow {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  nip: string | null;
  billingRate: number | string | null;
}
export async function fetchClients(): Promise<ClientRow[]> {
  return get<{ clients: ClientRow[] }>("/clients").then((d) => d.clients ?? []);
}

// Admin AI reasoning log — full tenant view (Liza / Anna's compliance trail).
export interface AiReasoningEntry {
  id: string;
  decision_type: string;
  input_summary: string | null;
  output: any;
  confidence: number | string | null;
  decided_action: string | null;
  reviewed_by: string | null;
  model: string | null;
  created_at: string;
  worker_id: string | null;
  worker_name: string | null;
}
export async function fetchAiReasoning(filters?: {
  decisionType?: string;
  decidedAction?: string;
  workerId?: string;
  limit?: number;
}): Promise<AiReasoningEntry[]> {
  const params = new URLSearchParams();
  if (filters?.decisionType) params.set("decisionType", filters.decisionType);
  if (filters?.decidedAction) params.set("decidedAction", filters.decidedAction);
  if (filters?.workerId) params.set("workerId", filters.workerId);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return get<{ entries: AiReasoningEntry[] }>(
    `/admin/ai-reasoning${qs ? `?${qs}` : ""}`,
  ).then((d) => d.entries ?? []);
}

// Change password — every team member rotates from the bootstrap password
// on first login. ProfileTab UI uses this; server-side enforces min length
// + verifies current password via scrypt.
export async function changePassword(args: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean }> {
  return post<{ success: boolean }>("/eej/auth/change-password", args);
}

// WhatsApp templates + quick-send from cockpit.
export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  bodyPreview: string;
  variables: string[];
  active: boolean;
}
export async function fetchWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  return get<{ templates: WhatsAppTemplate[] }>("/whatsapp/templates").then(
    (d) => d.templates ?? [],
  );
}

// Two-step send: create draft, then approve with sendImmediately=true.
// Returns the final message row.
export async function whatsappQuickSend(args: {
  templateName: string;
  workerId: string;
  variables: Record<string, string>;
  triggerEvent: string;
}): Promise<any> {
  const draft = await post<any>("/whatsapp/drafts", {
    templateName: args.templateName,
    workerId: args.workerId,
    variables: args.variables,
    triggerEvent: args.triggerEvent,
  });
  // approve + send immediately
  const sent = await patch<any>(`/whatsapp/drafts/${draft.id}/approve`, {
    sendImmediately: true,
  });
  return sent;
}

// Admin Stats
export async function fetchAdminStats() {
  return get<any>("/admin/stats");
}

// Notifications
export async function fetchNotifications() {
  return get<{ notifications: any[] }>("/notifications").then((d) => d.notifications ?? []);
}

// Recent applications (workers with pipelineStage "New")
export async function fetchRecentApplications() {
  return get<{ workers: any[] }>("/workers?status=new&limit=20").then((d) => d.workers ?? []);
}
