import { useState, useEffect, useCallback } from "react";
import type { Candidate } from "@/data/mockData";
import { apiFetchCandidates, apiCreateCandidate, ApiError } from "./apiClient";

type StoreResult = {
  candidates: Candidate[];
  addCandidate: (c: Candidate) => Promise<void>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useCandidateStore(): StoreResult {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const live = await apiFetchCandidates();
      setCandidates(live);
    } catch (err) {
      console.warn("[candidateStore] API error:", err);
      setCandidates([]);
      // Distinguish auth failure from connection failure so users (and future
      // debuggers) aren't misled. Pre-fix #14 the generic "cannot connect"
      // string masked a 401 caused by missing Authorization header.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError("Session expired — please log in again.");
      } else if (err instanceof ApiError) {
        setError(`Server returned ${err.status}. Please try again.`);
      } else {
        setError("Could not connect to server.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addCandidate = useCallback(async (c: Candidate) => {
    try {
      const saved = await apiCreateCandidate(c);
      setCandidates((prev) => [saved, ...prev]);
    } catch (err) {
      console.error("[candidateStore] addCandidate API error:", err);
      setCandidates((prev) => [c, ...prev]);
      throw err;
    }
  }, []);

  return { candidates, addCandidate, loading, error, refresh: load };
}
