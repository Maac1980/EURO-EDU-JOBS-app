import type { Candidate } from "@/data/mockData";

const API_BASE = "/api";

export async function apiFetchCandidates(): Promise<Candidate[]> {
  const res = await fetch(`${API_BASE}/eej/candidates`);
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = (await res.json()) as { candidates: Candidate[] };
  return data.candidates ?? [];
}

export async function apiCreateCandidate(candidate: Omit<Candidate, "documents"> & { documents?: Candidate["documents"] }): Promise<Candidate> {
  const res = await fetch(`${API_BASE}/eej/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(candidate),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Server error ${res.status}`);
  }
  const data = (await res.json()) as { candidate: Candidate };
  return data.candidate;
}

export async function apiUpdateCandidate(id: string, fields: Partial<Candidate>): Promise<Candidate> {
  const res = await fetch(`${API_BASE}/eej/candidates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Server error ${res.status}`);
  }
  const data = (await res.json()) as { candidate: Candidate };
  return data.candidate;
}
