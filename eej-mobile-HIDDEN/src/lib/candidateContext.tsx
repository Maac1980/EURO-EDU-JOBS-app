import { createContext, useContext, type ReactNode } from "react";
import { useCandidateStore } from "./candidateStore";
import type { Candidate } from "@/data/mockData";

interface CandidateContextValue {
  candidates: Candidate[];
  addCandidate: (c: Candidate) => Promise<void>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const CandidateContext = createContext<CandidateContextValue>({
  candidates: [],
  addCandidate: async () => {},
  loading: false,
  error: null,
  refresh: () => {},
});

export function CandidateProvider({ children }: { children: ReactNode }) {
  const store = useCandidateStore();
  return (
    <CandidateContext.Provider value={store}>
      {children}
    </CandidateContext.Provider>
  );
}

export function useCandidates() {
  return useContext(CandidateContext);
}
