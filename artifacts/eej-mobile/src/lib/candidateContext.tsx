import { createContext, useContext, type ReactNode } from "react";
import { useCandidateStore } from "./candidateStore";
import type { Candidate } from "@/data/mockData";

interface CandidateContextValue {
  candidates: Candidate[];
  addCandidate: (c: Candidate) => void;
}

const CandidateContext = createContext<CandidateContextValue>({
  candidates: [],
  addCandidate: () => {},
});

export function CandidateProvider({ children }: { children: ReactNode }) {
  const [candidates, addCandidate] = useCandidateStore();
  return (
    <CandidateContext.Provider value={{ candidates, addCandidate }}>
      {children}
    </CandidateContext.Provider>
  );
}

export function useCandidates() {
  return useContext(CandidateContext);
}
