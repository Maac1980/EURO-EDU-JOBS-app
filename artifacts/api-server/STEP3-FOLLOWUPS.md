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

## Discovered during Step 3 deploy verification (2026-04-27)

The Step 3a + Step 3b joint deploy used Path 2 verification (local Docker Postgres) to exercise the 20 skipIf-gated tests against a real DB before pushing to production. That run surfaced two pre-existing infrastructure gaps and one Task H defect; the gaps are tracked here and the Task H defect was fixed inline as Step 3b Task I.

- [ ] **Provision a persistent Neon test branch for EEJ to match what APATRIS has.**
  - Reason deferred: today's deploy used an ephemeral Docker container, which works but is per-deploy setup. A persistent Neon branch off production would benefit every future deploy and align EEJ's verification posture with APATRIS's.
  - When: independent infrastructure sub-phase; not tied to any feature.
  - Verification on completion: `flyctl secrets set TEST_DATABASE_URL=...` (or equivalent local env-var convention), document the branch URL in STEP3-FOLLOWUPS.md or a new `TEST-DATABASE-SETUP.md`, run `pnpm vitest run` with the env set, confirm 144+ passing.

- [ ] **Fix `migrate.ts` `legal_evidence` ordering bug.**
  - Background: Step 3 deploy verification tried to apply migrations to a fresh Docker Postgres and the migration aborted at line 521 with `relation "legal_evidence" does not exist`. The `ALTER TABLE legal_evidence ADD COLUMN IF NOT EXISTS notes TEXT;` block (line 521-523) runs 113 lines BEFORE `CREATE TABLE IF NOT EXISTS legal_evidence (...)` (line 634). The DO `$$ BEGIN ... END $$;` block at lines 520-524 has no `EXCEPTION WHEN ... THEN NULL;` clause, so the error bubbles up.
  - Why production is fine: the production DB has the `legal_evidence` table from earlier deploys (when the migration order was different, or it was created by an earlier code path). On production, `ALTER ... ADD COLUMN IF NOT EXISTS` succeeds because the table exists. The bug is latent on production but blocks any clean-room recreation (test branch, disaster recovery, new tenant on a new Neon project).
  - Workaround used in 2026-04-27 deploy verification: `docker exec eej-test-db psql -U postgres -d postgres -c "CREATE TABLE IF NOT EXISTS legal_evidence (...)"` was run before the api-server applied migrations. The pre-seed used the column structure from migrate.ts:634-653 with FK constraints removed (since `workers` and `legal_cases` are not yet created at that point). After pre-seeding, the migration completed cleanly through all subsequent blocks including the Step 3a whatsapp additions.
  - The fix: either (a) move `CREATE TABLE IF NOT EXISTS legal_evidence (...)` from line 634 to before line 521, OR (b) wrap the line 520-524 DO block with `EXCEPTION WHEN undefined_table THEN NULL;` so the early ALTER becomes a no-op on a fresh DB. Option (a) is cleaner.
  - When: independent migration-ordering sub-phase, not tied to any feature. Should ship as its own focused commit + deploy with full Path 2 verification.
  - Verification on completion: spin a fresh Docker Postgres (no pre-seed), apply migrations end-to-end, confirm zero errors and all expected tables present.

- [ ] **Audit other test files for the same `DATABASE_URL` precedence pattern that Step 3b Task I fixed.**
  - Background: Step 3b Task H added the first DB-touching integration tests via supertest in `integration.test.ts`. The existing line 7-8 stub set `process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test_does_not_connect"` — written for the pre-Task-H era when integration tests never reached drizzle. Task H added W1-W7 tests that DO reach drizzle via supertest, but the line-8 stub still pointed at the unreachable URL even when `TEST_DATABASE_URL` was set, so 4 of the 7 W tests returned 500 in the Path 2 verification run.
  - The fix shipped as Step 3b Task I (commit `295d229`): change line 8 to `process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? "..."`. This mirrors the pattern already correct in `whatsapp-drafter.test.ts:5`.
  - Audit work: grep all test files (`**/*.test.ts`) for `process.env.DATABASE_URL ??=` and confirm each one consults `TEST_DATABASE_URL` before falling back. Update any that don't.
  - When: independent hygiene pass.
  - Verification: every file that sets DATABASE_URL via `??=` should have the `TEST_DATABASE_URL ?? stub` precedence chain.
