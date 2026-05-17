/**
 * Phase 1 Item 2.1 (Day 28) — auth-token storage migration shim.
 *
 * Two legacy storage keys are being retired:
 *   - apatris_jwt — leftover from APATRIS-era code
 *   - eej_jwt    — intermediate refactor key
 *
 * Canonical key on the dashboard is `eej_token`, written to BOTH
 * localStorage and sessionStorage by `lib/auth.tsx` (see setToken /
 * removeToken in auth.tsx — they dual-write so reads from either
 * storage succeed).
 *
 * This shim runs ONCE on app load, BEFORE AuthProvider initializes
 * (called from main.tsx top-level, before createRoot). It:
 *   1. Skips migration if the canonical key is already populated
 *      (don't overwrite an active session), but still purges any
 *      lingering legacy keys for hygiene.
 *   2. Otherwise, finds the first non-empty legacy value, copies it
 *      to the canonical key in BOTH storages (matching auth.tsx's
 *      dual-write pattern), and deletes the legacy keys.
 *
 * Idempotent — repeat loads no-op after migration completes.
 *
 * Acceptance criterion: this file is the ONLY file in the dashboard
 * source tree that references the legacy "apatris_jwt" or "eej_jwt"
 * string literals. Verify with:
 *   grep -rl "apatris_jwt\|eej_jwt" artifacts/apatris-dashboard/src
 * → should return only this file.
 */

const LEGACY_KEYS = ["apatris_jwt", "eej_jwt"] as const;
const CANONICAL_KEY = "eej_token";

export function migrateLegacyTokens(): void {
  if (typeof window === "undefined") return; // SSR / non-browser no-op

  // Don't override an active canonical session — but DO clean up any
  // lingering legacy keys so subsequent grep / leak audits stay clean.
  const existing =
    localStorage.getItem(CANONICAL_KEY) ?? sessionStorage.getItem(CANONICAL_KEY);
  if (existing) {
    purgeLegacy();
    return;
  }

  // Migrate the first non-empty legacy value to canonical (dual-write
  // to match auth.tsx setToken behaviour). Iterate in declaration order
  // — apatris_jwt is the older one; if both happen to be set, we prefer
  // the newer eej_jwt to avoid resurrecting a stale APATRIS-era session.
  // To honour that "prefer newer," scan in REVERSE order.
  for (const key of [...LEGACY_KEYS].reverse()) {
    const value = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (value) {
      localStorage.setItem(CANONICAL_KEY, value);
      sessionStorage.setItem(CANONICAL_KEY, value);
      break;
    }
  }

  purgeLegacy();
}

function purgeLegacy(): void {
  for (const key of LEGACY_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}
