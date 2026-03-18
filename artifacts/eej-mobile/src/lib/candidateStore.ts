import { useState, useEffect } from "react";
import { MOCK_CANDIDATES, type Candidate } from "@/data/mockData";

const STORE_KEY = "eej_candidates_v1";

function loadStored(): Candidate[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Candidate[];
  } catch {}
  return [];
}

function saveStored(added: Candidate[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(added));
}

export function useCandidateStore(): [Candidate[], (c: Candidate) => void, () => void] {
  const [added, setAdded] = useState<Candidate[]>(loadStored);
  const all = [...MOCK_CANDIDATES, ...added];

  useEffect(() => {
    saveStored(added);
  }, [added]);

  function addCandidate(c: Candidate) {
    setAdded((prev) => [c, ...prev]);
  }

  function clearAdded() {
    setAdded([]);
    localStorage.removeItem(STORE_KEY);
  }

  return [all, addCandidate, clearAdded];
}
