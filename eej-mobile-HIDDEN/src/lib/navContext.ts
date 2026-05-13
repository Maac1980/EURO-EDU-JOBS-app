import { useEffect, useState } from "react";

/**
 * Lightweight cross-component navigation context.
 *
 * When the cockpit deep-links to a module tab (e.g. "Open TRC →"), we want
 * the destination tab to pre-filter to the worker the cockpit was showing.
 * The mobile app uses state-based tab navigation (no URL routing), so this
 * tiny module-level store carries the worker context across the navigation.
 *
 * Usage:
 *   setDeepLinkWorker(workerId, workerName);   // set before navigate
 *   const link = useDeepLinkWorker();          // read in destination tab
 *   clearDeepLinkWorker();                     // when user clears the filter
 *
 * The store is module-level (singleton) on purpose — the deep-link is a
 * one-shot signal; once the destination tab reads it, it owns the filter
 * state in its own component.
 */

interface DeepLinkWorker {
  id: string;
  name?: string;
}

let current: DeepLinkWorker | null = null;
const listeners = new Set<(value: DeepLinkWorker | null) => void>();

export function setDeepLinkWorker(id: string, name?: string): void {
  current = { id, name };
  for (const l of listeners) l(current);
}

export function clearDeepLinkWorker(): void {
  current = null;
  for (const l of listeners) l(null);
}

export function getDeepLinkWorker(): DeepLinkWorker | null {
  return current;
}

export function useDeepLinkWorker(): DeepLinkWorker | null {
  const [value, setValue] = useState<DeepLinkWorker | null>(current);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
