import { useState, useEffect, useCallback } from "react";
import { MOCK_CANDIDATES, type Candidate } from "@/data/mockData";
import { apiFetchCandidates, apiCreateCandidate } from "./apiClient";

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
      if (live.length > 0) {
        setCandidates(live);
      } else {
        setCandidates(MOCK_CANDIDATES);
      }
    } catch (err) {
      console.warn("[candidateStore] API unavailable, using mock data:", err);
      setCandidates(MOCK_CANDIDATES);
      setError("Could not connect to server. Showing cached data.");
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
