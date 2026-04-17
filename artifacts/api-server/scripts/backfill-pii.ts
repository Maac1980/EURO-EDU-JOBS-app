/**
 * CLI wrapper for the PII backfill routine.
 *
 * Usage:
 *   pnpm tsx artifacts/api-server/scripts/backfill-pii.ts
 *
 * The backfill is also invoked automatically at startup (see runMigrations)
 * when legacy plaintext rows exist — this script is for on-demand operator runs.
 */
import { backfillPII } from "../src/lib/pii-backfill.js";

backfillPII()
  .then((r) => {
    console.log(`[backfill-pii] scanned=${r.scanned} encrypted=${r.encrypted} skipped=${r.skipped} errors=${r.errors}`);
    process.exit(r.errors > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error("[backfill-pii] Fatal:", e);
    process.exit(1);
  });
