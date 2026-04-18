# Step 3 — Deferred Follow-ups

Tracked items discovered during Step 3 implementation that were intentionally
deferred to avoid silently bundling unrelated work into a scoped task.

## Deferred from Step 3 Task A (2026-04-18)

- [ ] Migrate `artifacts/api-server/src/lib/alerter.ts` `normalizePhone` (module-local, permissive) to import the strict version from `artifacts/api-server/src/lib/phone.ts`.
  - Reason deferred: currently unexported (no TS collision); migration would bundle a refactor into a utility task, violating "never silently bundle fixes" rule.
  - When: after Step 3c when all new call sites (drafter, webhook, phone-match routes) exist and can be reviewed together.
  - Risk until then: latent — alerter.sendWhatsApp called directly with malformed input would permissively reach Twilio (e.g., "abc" becomes "+48abc"). Production data is already +48 E.164 so practical exposure is low.
  - Verification on migration: sanity-check alerter's call sites handle `null` return (current function never returns null, migration must add `?? raw` fallback OR throw-on-null + try/catch at call sites).
