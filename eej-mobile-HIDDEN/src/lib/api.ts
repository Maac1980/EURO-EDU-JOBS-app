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
