import type { Candidate } from "@/data/mockData";

const API_BASE = "/api";

// Bare fetch() pre-fix #14 hit /api/eej/candidates without an Authorization
// header. The route requires authenticateToken — server returned 401, which
// the candidate-store catch handler masked as "Could not connect to server."
// Match the auth-header pattern used by ContractsTab/PayrollTab/etc.
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const t = localStorage.getItem("eej_token_v2");
  const base: Record<string, string> = { "Content-Type": "application/json", ...(extra ?? {}) };
  return t ? { ...base, Authorization: `Bearer ${t}` } : base;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function throwForStatus(res: Response): Promise<never> {
  // Item 2.2-followup-FE — prefer userMessage from friendly-error shape.
  const err = await res.json().catch(() => ({})) as { error?: string; userMessage?: string };
  throw new ApiError(res.status, err.userMessage ?? err.error ?? `Server error ${res.status}`);
}

export async function apiFetchCandidates(): Promise<Candidate[]> {
  const res = await fetch(`${API_BASE}/eej/candidates`, { headers: authHeaders() });
  if (!res.ok) await throwForStatus(res);
  const data = (await res.json()) as { candidates: Candidate[] };
  return data.candidates ?? [];
}

export async function apiCreateCandidate(candidate: Omit<Candidate, "documents"> & { documents?: Candidate["documents"] }): Promise<Candidate> {
  const res = await fetch(`${API_BASE}/eej/candidates`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(candidate),
  });
  if (!res.ok) await throwForStatus(res);
  const data = (await res.json()) as { candidate: Candidate };
  return data.candidate;
}

export async function apiUpdateCandidate(id: string, fields: Partial<Candidate>): Promise<Candidate> {
  const res = await fetch(`${API_BASE}/eej/candidates/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  if (!res.ok) await throwForStatus(res);
  const data = (await res.json()) as { candidate: Candidate };
  return data.candidate;
}

export { ApiError };
