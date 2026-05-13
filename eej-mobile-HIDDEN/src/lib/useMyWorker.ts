import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchWorkers } from "@/lib/api";

/**
 * Resolve "which worker is this logged-in user." For Phase 2 worker portal
 * (T4 candidate accounts), the JWT carries the user's email; we look up the
 * worker record whose email matches. This is the single source of truth so
 * MyStatusTab / MyUPOTab / MySchengenTab / CandidateHome all agree on
 * "who am I."
 *
 * Returns:
 *   - { loading: true } while fetching
 *   - { worker: { id, name, ... }, loading: false } on match
 *   - { error: "No worker profile…", loading: false } when no match
 */
export interface MyWorker {
  id: string;
  name: string;
  email: string | null;
  nationality: string | null;
  jobRole: string | null;
  assignedSite: string | null;
  trcExpiry: string | null;
  workPermitExpiry: string | null;
  badaniaLekExpiry: string | null;
  contractEndDate: string | null;
  [key: string]: unknown;
}

export interface UseMyWorkerResult {
  loading: boolean;
  worker: MyWorker | null;
  error: string | null;
}

export function useMyWorker(): UseMyWorkerResult {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [worker, setWorker] = useState<MyWorker | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.email) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }
    fetchWorkers()
      .then((workers) => {
        if (cancelled) return;
        const myEmail = user.email.toLowerCase();
        const match = (workers as MyWorker[]).find(
          (w) =>
            (typeof w.email === "string" && w.email.toLowerCase() === myEmail) ||
            // Fall back to company_email if present (common in EEJ data model).
            (typeof (w as Record<string, unknown>).companyEmail === "string" &&
              ((w as Record<string, unknown>).companyEmail as string).toLowerCase() === myEmail),
        );
        if (match) {
          setWorker(match);
          setError(null);
        } else {
          setError(
            "No worker profile linked to your account. Contact your coordinator to set it up.",
          );
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load profile.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  return { loading, worker, error };
}
