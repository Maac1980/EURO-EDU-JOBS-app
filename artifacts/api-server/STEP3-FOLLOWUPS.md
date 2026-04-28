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

## Discovered during Step 3c deploy (2026-04-27)

- [ ] **Twilio console webhook URL configuration:** after Step 3c deploy at v98, the inbound webhook is live at `https://eej-jobs-api.fly.dev/api/webhooks/whatsapp`. To activate inbound message receipt, configure the Twilio Messaging Service or Phone Number webhook URL in the Twilio console to point to this URL with HTTP POST. This is a manual ops step; not blocking any code work. Document the Twilio Messaging Service ID and the webhook configuration once completed.
  - Current state at v98 deploy: `TWILIO_AUTH_TOKEN` is NOT set on Fly secrets. The webhook returns 503 fail-closed for every request until the secret is configured. This is the designed steady state.
  - When ready to activate: set `TWILIO_AUTH_TOKEN` on Fly via `flyctl secrets set TWILIO_AUTH_TOKEN=<token> -a eej-jobs-api`, then configure the webhook URL in the Twilio console.
  - Verification on completion: send a hand-signed test request to the production URL (computed with the same authToken) and confirm 200 + row inserted in `whatsapp_messages` with `status='RECEIVED'`, `direction='inbound'`.

## Step 3 closure (2026-04-27)

Step 3 fully shipped on production at v99 (2026-04-27). All four sub-phases live:
- **3a** schema (whatsapp_templates, whatsapp_messages, 3 enums, 5 indexes, 2 CHECK constraints, 3-row template seed) — committed across `141b7c9` / `dd2a9a7` / `d980802` / `710c5f6`, deployed at v97
- **3b** drafter service + feature flag + manual draft endpoints (POST/GET/DELETE /api/whatsapp/drafts) — committed across `bf3b8de` / `fbe1227` / `3034f64` / `0e5358a` (+ test fix `295d229`), deployed at v97
- **3c** inbound webhook (POST /api/webhooks/whatsapp) with Twilio signature verification and idempotent insert — committed across `a225130` / `9415c26` / `9b4a4b6`, deployed at v98
- **3d** approve/send + read/list + dashboard counters + audit (PATCH /drafts/:id/approve, PATCH /messages/:id/read, GET /messages, /admin/stats counters, client_activities + notifications audit rows) — committed across `903fe56` / `f35c8e8` / `628d221` / `9886575`, deployed at v99

Operational activation pending (manual ops steps, not blocking any code work):
- `TWILIO_AUTH_TOKEN` and `TWILIO_ACCOUNT_SID` secrets provisioning on Fly
- Twilio console webhook URL configuration (inbound receipt) and outbound Messaging Service setup
- Template `content_sid` provisioning per template (currently 3 inactive seeds: `application_received`, `permit_status_update`, `payment_reminder`)

Until these ops steps complete, the steady state is:
- Webhook returns 503 fail-closed
- Drafts can be created and approved (status DRAFT → APPROVED with audit) but `sendImmediately=true` returns 503
- Templates remain inactive so the drafter rejects them at create time anyway
- Legacy `lib/alerter.ts` direct-send path is unchanged and continues to operate in parallel

## Gap 4 closure (2026-04-28)

Gap 4 fully shipped on production at v100 (2026-04-28). `placement_type` column live on `workers` table (NOT NULL, default `'agency_leased'`, CHECK constraint `placement_type IN ('agency_leased', 'direct_outsourcing')`). All 100 existing production workers default to `'agency_leased'` per migration default. Art. 20 18-month limit and Art. 14a retention gate on `placement_type='agency_leased'`. `eej_assignments.art_20_enforced` column added via idempotent ALTER inside `ensureComplianceTables()`; populated lazily on first agency-endpoint hit after deploy. Deferred follow-ups:

- [ ] **D2 worker detail editable placementType field.** The mobile worker-edit form (`eej-mobile-HIDDEN/src/components/WorkerProfileSheet.tsx`) consumes the `Candidate` interface defined in `eej-mobile-HIDDEN/src/data/mockData.ts`. Adding the editable dropdown for placement_type requires extending the `Candidate` type. Estimated 30-45 minutes. Track as a Gap 4 cleanup item.
- [ ] **Bulk worker creation endpoints dedicated PLACEMENT_TYPE audit entries.** `POST /workers/bulk-import` (`routes/workers.ts:295`) and `POST /workers/bulk-create` (`routes/workers.ts:676`) do not currently emit dedicated `field='PLACEMENT_TYPE'` audit entries on insert. Workers created via these paths inherit the schema default `'agency_leased'` correctly, but the dedicated audit row is not written. The existing `field='ALL'` audit entry on creation captures the placement value implicitly. Low priority.
- [ ] **PIP inspection pack and reclassification scanner placement_type surfacing.** `agency-compliance-engine.ts:557-693` does not currently surface `placement_type` in its output. The PIP pack's checklist could differentiate "Art. 20 limit applied" vs "Art. 20 not enforced (direct_outsourcing)". The reclassification scanner could weight risk differently by placement_type (PIP reclassification primarily targets disguised direct hires).
