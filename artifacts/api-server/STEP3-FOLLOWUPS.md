# Step 3 — Deferred Follow-ups

Tracked items discovered during Step 3 implementation that were intentionally
deferred to avoid silently bundling unrelated work into a scoped task.

## Deferred from Step 3 Task A (2026-04-18)

- [ ] Migrate `artifacts/api-server/src/lib/alerter.ts` `normalizePhone` (module-local, permissive) to import the strict version from `artifacts/api-server/src/lib/phone.ts`.
  - Reason deferred: currently unexported (no TS collision); migration would bundle a refactor into a utility task, violating "never silently bundle fixes" rule.
  - When: after Step 3c when all new call sites (drafter, webhook, phone-match routes) exist and can be reviewed together.
  - Risk until then: latent — alerter.sendWhatsApp called directly with malformed input would permissively reach Twilio (e.g., "abc" becomes "+48abc"). Production data is already +48 E.164 so practical exposure is low.
  - Verification on migration: sanity-check alerter's call sites handle `null` return (current function never returns null, migration must add `?? raw` fallback OR throw-on-null + try/catch at call sites).

## Deferred from Step 3 Task B (2026-04-18)

- [ ] PII-encrypt `phone` platform-wide (workers, clients, whatsapp_messages) as a single coordinated migration.
  - Reason deferred: encrypting only whatsapp_messages.phone while workers.phone and clients.phone stay plaintext creates architectural inconsistency.
  - When: alongside a GDPR re-audit or when EEJ onboards a tenant with stricter PII requirements.
  - Verification on migration: follow Stage 3 pattern — lib/encryption.ts `enc:v1:` prefix, legacy plaintext passthrough in decrypt(), role-based masking at projection, one-time backfill script.

- [ ] Structural validator that cross-references `whatsapp_messages.templateVariables` keys against `whatsapp_templates.variables` declared array.
  - Reason deferred: belongs in drafter service (Step 3b), not schema layer.
  - When: Step 3b — services/whatsapp-drafter.ts.
  - Verification: unit test with (template declares `["workerName"]`, payload provides `{"workerName":"Ada"}`) → pass; payload `{"wrongKey":"x"}` → reject.

- [ ] Audit `tenant_id DEFAULT 'production'` across all tenant-scoped tables.
  - Reason deferred: current pattern is intentional Stage 4 convention with runtime enforcement via requireTenant()/scopedWhere(). Removing the default platform-wide is a multi-table migration + call-site audit.
  - When: after first non-'production' tenant onboards.
  - Verification: grep every INSERT site for explicit tenantId; remove DEFAULT from DDL; fail loudly on NULL.

- [ ] Sweep: add `$onUpdate(() => new Date())` to all `updated_at` columns, OR standardize manual set-on-PATCH pattern.
  - Reason deferred: no EEJ table currently auto-bumps; changing just whatsapp_* is inconsistent.
  - When: independent hygiene pass, not tied to any feature.
  - Verification: sample 5 PATCH handlers and confirm updated_at is either auto-updated or explicitly set.
