# STEP 3 PLAN: WhatsApp Draft Queue + Templates + Inbound Webhook

## Frame

This document is the durable forward plan for completing Step 3 of the EEJ
build — the WhatsApp draft queue, templates catalog, inbound webhook, and
approve/send/dashboard surfaces. It is written now to move EEJ from
conversational planning to repository-ratified planning, matching the
discipline already adopted by the APATRIS sister platform.

Step 3a (schema, templates, phone utility, integrity tests) is closed and
committed at HEAD `710c5f6` on `origin/master`. Step 3a is NOT yet deployed
to Fly — the live `eej-jobs-api` version v96 (deployed 2026-04-18) reflects
code through Step 2 (`adf1451`) plus a docs auto-deploy commit (`6d1d74e`)
that does not change runtime behavior.

The remaining sub-phases — 3b, 3c, 3d — are forward work whose scope is
ratified below. Step 3a code does not change as a result of this document;
3a is reference-only here.

---

## Companion Documents

- `CLAUDE.md` (root) — primary operating manual: RULES (MUST FOLLOW), STAGE 4
  SECURITY STANDARDS, DECISION MAKING, EXECUTION STYLE, VALIDATION FRAMEWORK,
  Phase 1-3 roadmap. STEP3_PLAN.md operates within those rules; this document
  does not override them.
- `artifacts/api-server/STEP3-FOLLOWUPS.md` — tracked deferred items
  surfaced during Step 3a Tasks A and B. Five items currently:
  alerter.ts `normalizePhone` migration, platform-wide phone PII encryption,
  JSONB template-variable cross-reference validator, tenant_id default
  audit, updated_at $onUpdate sweep.
- `artifacts/api-server/TENANT-ISOLATION-MAP.md` — every route's tenant-scope
  status. New endpoints introduced in 3b/3c/3d will be added to this map as
  they ship.
- `artifacts/api-server/src/services/SERVICE_SEPARATION.md` — Pattern A
  (routes thin, services own logic) is the target for new code in this plan.
- `docs/architecture-boundaries.md` — EEJ ↔ APATRIS boundary doc.
  Referenced in the Forward References section for the post-Step-3 audit
  comparison item.

---

## Status

- **Step 3a** — schema, migrations, phone utility, integrity tests:
  CLOSED on `master`. Committed across SHAs `141b7c9`, `dd2a9a7`, `d980802`,
  `710c5f6`. Not yet deployed to Fly.
- **Step 3b** — drafter service, feature flag, manual draft endpoints: NOT
  STARTED. Forward work scoped below.
- **Step 3c** — inbound webhook with Twilio signature verification + phone
  matching + MessageSid idempotency: NOT STARTED. Forward work scoped below.
- **Step 3d** — approve/discard/read endpoints, dashboard unread counter,
  audit-on-approval surfaces: NOT STARTED. Forward work scoped below.
- **Production target** — Fly app `eej-jobs-api` (region `ams`, currently v96).
- **Database** — Step 3a migrations apply on Fly startup once 3a is included
  in a deploy. Tables `whatsapp_templates` and `whatsapp_messages` do not
  yet exist on the production database.

---

## Sub-task 3a — Already Complete

Reference only. No action under this plan.

| Task | SHA | Description |
|---|---|---|
| Task A | `141b7c9` | `lib/phone.ts` — pure E.164 format normalizer, never throws, returns `string | null`. 17 vitest unit tests in `phone.test.ts` plus 1 todo for documented PL-default trade-off. |
| Task B | `dd2a9a7` | `db/schema.ts` additions: 3 pgEnums (`whatsapp_direction`, `whatsapp_status`, `whatsapp_trigger_event` with 7 trigger values), `whatsappTemplates` table, `whatsappMessages` table. No inline indexes, no inline CHECK — both deferred to Task C per EEJ convention. |
| Task C | `d980802` | `db/migrate.ts` additions: 3 `CREATE TYPE IF NOT EXISTS` guards, 2 `CREATE TABLE IF NOT EXISTS` blocks, 5 indexes (1 UNIQUE composite, 2 partial), 2 CHECK constraints (`jsonb_typeof(variables) = 'array'` and outbound-recipient guard), 3-row template seed for tenant `'production'` with `ON CONFLICT (tenant_id, name) DO NOTHING`. Templates seeded inactive; Twilio content SIDs are NULL pending console provisioning. |
| Task D | `710c5f6` | `integration.test.ts` additions: 6 DB-integration tests gated by `describe.skipIf(!process.env.TEST_DATABASE_URL)` covering enum CHECK (S1, S2), tenant FK violation (S3a), outbound-recipient CHECK (S3b), seed count (Sd1), seed idempotency (Sd2). Tests are inert locally; activate when a test DB is configured. |

Step 3a is the schema and structural foundation. No data flows into these
tables yet because no service writes to them. 3b is what starts the data
flow.

---

## Sub-task 3b — Drafter + Feature Flag + Manual Endpoints

### Scope

Build the internal-only draft generation engine and feature-flag mechanism.
No Twilio network call in this sub-phase. No webhook in this sub-phase. No
approval surface in this sub-phase. Outputs are draft rows in
`whatsapp_messages` with `status='DRAFT'`.

### Files to create

- `artifacts/api-server/src/services/whatsapp-drafter.ts` — exports
  `createDraft({ tenantId, templateName, workerId?, clientId?, phone?, variables, triggerEvent })`.
  Resolves phone via `lib/phone.ts` `normalizePhone`. Looks up
  `whatsapp_templates` by `(tenantId, name)`. Throws if template missing or
  inactive. Interpolates `{{var}}` placeholders into `body_preview` using
  the supplied `variables` object. Calls
  `services/test-safety.ts::isTestWorker()`; if true, sets
  `isTestLabel=true` and prefixes body with `[TEST] `. Inserts row with
  `direction='outbound'`, `status='DRAFT'`. Also exports three
  flag-gated trigger helpers: `draftApplicationReceived(workerId)`,
  `draftPermitUpdate(permitId)`, `draftPaymentReminder(invoiceId)`. When
  the flag is OFF, the trigger helpers short-circuit without inserting.
- `artifacts/api-server/src/lib/flags.ts` — exports
  `WHATSAPP_AUTOMATION_ENABLED` flag derived from
  `process.env.WHATSAPP_AUTOMATION_ENABLED === 'true'` (default false).
  Documented in code comment that manual API draft creation is unaffected
  by this flag — the flag gates auto-trigger hooks only.
- `artifacts/api-server/src/routes/whatsapp.ts` — new router file. Mounted
  in `routes/index.ts`. All endpoints require `authenticateToken`,
  `requireT1T2`, `requireTenant`. Initial endpoints in 3b:
  - `POST   /api/whatsapp/drafts` — manual draft create. Body
    `{ templateName, workerId?, clientId?, phone?, variables, triggerEvent }`.
    Validates with Zod. Calls `whatsapp-drafter.createDraft`. Returns
    inserted row.
  - `GET    /api/whatsapp/drafts` — list, paginated (`?limit=50&offset=0`,
    cap 200), `?status=` filter. Tenant-scoped.
  - `GET    /api/whatsapp/drafts/:id` — single draft. Tenant-scoped.
  - `DELETE /api/whatsapp/drafts/:id` — only when current
    `status='DRAFT'`; transitions to `DISCARDED`. Tenant-scoped.

### Files to modify

- `artifacts/api-server/src/routes/index.ts` — import + mount `whatsappRouter`
  at `/api`.
- `artifacts/api-server/TENANT-ISOLATION-MAP.md` — add entries for the four
  new endpoints with Scoped status and citation.

### Schema state populated by this sub-task

- `whatsapp_messages` rows with `direction='outbound'`, `status='DRAFT'`,
  `template_id` set to a `whatsapp_templates.id`,
  `template_variables` JSONB containing the variables used at interpolation
  time, `is_test_label` true or false per `isTestWorker()`,
  `trigger_event` set per the call site, `tenant_id` set per
  `requireTenant`.
- `approved_by`, `approved_at`, `sent_at`, `received_at`, `read_at` remain
  NULL — those columns are populated by 3d (approval/send) and 3c (inbound).
- `whatsapp_templates` is read-only in this sub-phase. The 3 seeded
  placeholder rows from Task C remain `active=false`; activation is a
  manual ops step that requires Twilio content-SID provisioning.

### Test scenarios

**Positive — drafter happy path with worker recipient:**
`createDraft({ tenantId: 'production', templateName: 'permit_status_update', workerId: <existing worker uuid>, variables: { permitStatus: 'approved', updateDate: '2026-04-26' }, triggerEvent: 'permit_update' })`
inserts one row. Row has `direction='outbound'`, `status='DRAFT'`,
`body` containing the interpolated Polish text with both variables
substituted, `template_variables` JSONB matching the input, `phone`
populated from the worker's phone normalized to E.164, `tenant_id`
matches the caller's tenant.

**Negative — flag-off blocks auto-trigger:**
With `WHATSAPP_AUTOMATION_ENABLED=false` (default),
`draftApplicationReceived(<worker uuid>)` short-circuits and returns
without inserting any row. Manual `POST /api/whatsapp/drafts` from a
T1 user with the same template still succeeds (the flag does not gate
manual creation).

**Negative — unknown template:**
`createDraft({ ..., templateName: 'no_such_template' })` throws a
typed error. No row is inserted. The error surfaces with a clear
message and does not leak internal SQL state.

**Negative — test-worker labelling:**
`createDraft` for a worker whose `isTestWorker()` returns true (phone
prefix `+48000000`, email `@test.eej.invalid`, or `tenant_id='test'`)
inserts a row with `is_test_label=true` and `body` prefixed `[TEST] `.
External send is not exercised in 3b but the label is the precondition
for the test-worker external-send block in 3d.

**Dummy — payload variables that do not match template-declared variables:**
Template `application_received` declares `variables: ["workerName"]`.
`createDraft({ ..., templateName: 'application_received', variables: { wrongKey: 'x' } })`
is rejected at the Zod boundary or by a service-layer cross-reference
validator. The system refuses to fabricate a workerName value or to
silently leave the placeholder unreplaced. Returns a 400-class error;
no row is inserted.

### Build gate

`pnpm build` runs clean; api-server `dist/index.cjs` rebuilds; mobile and
dashboard builds succeed.

### Test gate

`pnpm typecheck` returns 0 errors. `pnpm vitest run` shows all prior
passing tests still pass; new 3b tests pass; integration tests gated by
`TEST_DATABASE_URL` pass when the env var is set against a test DB with
Step 3a migrations applied.

### Production deploy gate

3b is bundled with 3a in a single deploy — see Deploy Sequence section.
Pre-deploy: `pnpm build` clean and integrity tests pass with
`TEST_DATABASE_URL` set against a test DB. Post-deploy: push to origin and
Fly deploy with production verification — health endpoint returns 200,
manual draft creation via `POST /api/whatsapp/drafts` succeeds, the
inserted row is queryable via `GET /api/whatsapp/drafts/:id`, and no
auto-trigger hook has fired (flag still default-off).

### Risk level

Low. No external network calls. No mutation of existing data — only
inserts to a new table that is empty at deploy time. Feature flag
default-off ensures auto-trigger paths are inert until explicitly
enabled.

### Estimated LOC

~250 lines across 3 new files plus 2 modified files, excluding tests.

---

## Sub-task 3c — Inbound Webhook

### Scope

Build the Twilio-signed inbound webhook that receives WhatsApp messages
from end users and persists them to `whatsapp_messages` as inbound rows.
No JWT — signature is the auth. Idempotent against duplicate Twilio
deliveries via the partial UNIQUE index on `twilio_message_sid`. Phone
matching to existing `workers.phone` first, `clients.phone` second,
orphan persistence third.

### Files to create

- (extension to) `artifacts/api-server/src/routes/whatsapp.ts` — adds
  `POST /api/webhooks/whatsapp`. NOT mounted under the existing
  `authenticateToken` chain. Registered with a per-route
  `express.urlencoded({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } })`
  middleware so the raw bytes are preserved for signature verification.
- (optional helper) `artifacts/api-server/src/services/whatsapp-webhook.ts`
  — extracted handler logic so the route file stays thin and the handler
  can be unit-tested without supertest. Structure follows
  Pattern A from `services/SERVICE_SEPARATION.md`.

### Files to modify

- `artifacts/api-server/src/app.ts` — mount the per-route urlencoded
  middleware before `routes/index.ts` is bound. The middleware applies
  only to `/api/webhooks/whatsapp`; other routes continue to use the
  global `express.json` body parser.
- `artifacts/api-server/TENANT-ISOLATION-MAP.md` — add an entry for the
  webhook documenting that it is intentionally NOT JWT-gated; signature
  is the auth. Tenant resolution happens via phone match, not via
  `requireTenant`.

### Schema state populated by this sub-task

- `whatsapp_messages` rows with `direction='inbound'`, `status='RECEIVED'`,
  `received_at=NOW()`, `phone` populated from Twilio's `From` field
  (already in E.164 from Twilio; passed through `normalizePhone` for
  defense-in-depth), `body` populated from Twilio's `Body` field,
  `twilio_message_sid` populated from Twilio's `MessageSid` field,
  `worker_id` and `client_id` populated per the matching precedence
  below or both NULL for orphan delivery.
- Phone matching precedence: lookup `workers.phone = :normalized` first;
  if hit, set `worker_id` and inherit that worker's `tenant_id`. Else
  lookup `clients.phone = :normalized`; if hit, set `client_id` and
  inherit that client's `tenant_id`. Else orphan: leave both NULL,
  `tenant_id='production'` (default), and add `metadata` annotation
  marking the row as orphan for follow-up triage.
- Idempotency: insert uses the Step 3a partial UNIQUE index on
  `twilio_message_sid`. A duplicate delivery (same SID) returns a 200
  with empty TwiML and does not double-insert.

### Test scenarios

**Positive — valid signature, new MessageSid, known worker phone:**
A POST with a hand-computed valid `X-Twilio-Signature` over the
form-encoded body, where `From` is the E.164 phone of a seeded worker,
returns 200 with `<Response></Response>` TwiML. One row is inserted
with `direction='inbound'`, `status='RECEIVED'`, `worker_id` set to
the matched worker, `tenant_id` inherited from that worker.

**Negative — missing or invalid signature:**
A POST with no `X-Twilio-Signature` header returns 403. A POST with
a malformed signature returns 403. No row is inserted. No webhook
side effect occurs.

**Negative — Twilio auth token unset:**
With `TWILIO_AUTH_TOKEN` env unset, the webhook returns 503
"Webhook receiver not configured" before attempting signature
verification. Fail-closed posture matches the Stage 1 hardening of
`services/stripe-webhooks.ts`.

**Negative — duplicate MessageSid:**
A second delivery of a previously-seen `MessageSid` returns 200 with
empty TwiML and does not insert a second row. The partial UNIQUE
index `idx_whatsapp_messages_twilio_sid` enforces this at the
database layer.

**Dummy — phone matches nothing:**
A valid-signature POST whose `From` phone normalizes successfully but
matches neither `workers.phone` nor `clients.phone` results in a row
with `worker_id=NULL`, `client_id=NULL`, default `tenant_id='production'`,
and `body` set to whatever Twilio sent. The system does NOT fabricate
a worker linkage to the closest match; it persists the orphan row
honestly so the admin surface can triage.

### Build gate

`pnpm build` runs clean. The new urlencoded middleware in `app.ts` does
not break any existing route.

### Test gate

`pnpm typecheck` returns 0 errors. New 3c integration tests pass when
`TEST_DATABASE_URL` is set. Signature-verification tests use
hand-computed HMAC-SHA1 values against a known authToken; no live
Twilio account is required.

### Production deploy gate

3c ships in a deploy subsequent to the joint 3a+3b deploy — see Deploy
Sequence section. Pre-deploy: `pnpm build` clean and integrity tests
pass. Post-deploy: push to origin and Fly deploy with production
verification — health endpoint returns 200, the webhook URL responds
401/403 for unauthenticated requests (signature missing), the webhook
URL responds 503 if `TWILIO_AUTH_TOKEN` is intentionally unset, and a
hand-crafted signed test request inserts an orphan row whose presence
is verifiable via `GET /api/whatsapp/messages?direction=inbound`.

### Risk level

Medium. Touches `app.ts` (per-route middleware ordering is a place to
make subtle errors), introduces a public URL that bypasses JWT auth,
and depends on Twilio signature math being correct. Mitigation: use
the official `twilio` SDK's `validateRequest()` rather than hand-rolled
HMAC; fail-closed if `TWILIO_AUTH_TOKEN` unset; reuse the Stripe webhook
as a structural reference.

### Estimated LOC

~200 lines across 1-2 new files plus 2 modified files, excluding tests.

---

## Sub-task 3d — Approve/Discard/Read + Dashboard Counters + Audit

### Scope

Build the human approval surface that gates outbound sends, the
read-tracking endpoint that drives the dashboard unread counter, and
the audit trail that fires on approval and on send. This is where the
Step 3a `approved_by`, `approved_at`, `sent_at`, and `read_at` columns
on `whatsapp_messages` finally get populated.

### Files to create

None. All work in this sub-phase extends existing files.

### Files to modify

- `artifacts/api-server/src/routes/whatsapp.ts` — adds:
  - `PATCH /api/whatsapp/drafts/:id/approve` — transitions
    `status='DRAFT'` to `'APPROVED'`. Sets `approved_by` to
    `req.user.id` (the JWT subject) and `approved_at=NOW()`. If body
    contains `{ sendImmediately: true }` AND `TWILIO_AUTH_TOKEN` is
    set AND the linked template has `active=true` and a
    `content_sid` populated, dispatches to Twilio via
    `lib/alerter.ts::sendWhatsAppMessage` (existing helper) and
    transitions to `'SENT'` (or `'FAILED'` with `failed_reason`
    populated on Twilio error). If `is_test_label=true`, refuses
    `sendImmediately` with 409 "test worker external sends blocked"
    and leaves the row in `'APPROVED'` state. If `sendImmediately`
    is false or omitted, the row stays at `'APPROVED'` for a
    future cron dispatcher (out of scope for 3d).
  - `PATCH /api/whatsapp/drafts/:id/discard` — transitions
    `status='DRAFT'` to `'DISCARDED'`. Returns 409 if the row is
    not currently `'DRAFT'`.
  - `PATCH /api/whatsapp/messages/:id/read` — sets `read_at=NOW()`
    on a row where `direction='inbound'`. Tenant-scoped. Returns
    409 if direction is outbound.
  - `GET /api/whatsapp/messages` — paginated list with `?direction=`
    filter and `?unreadOnly=true` flag. Tenant-scoped.
- `artifacts/api-server/src/routes/admin.ts` — extend
  `GET /api/admin/stats` aggregator to include
  `unreadWhatsApp: count(*) WHERE direction='inbound' AND read_at IS NULL`
  and `whatsappPendingApproval: count(*) WHERE status='DRAFT'`, both
  tenant-scoped.
- `artifacts/api-server/src/services/whatsapp-drafter.ts` — extend with
  the send-dispatch helper used by `sendImmediately=true` (delegates
  to `lib/alerter.ts::sendWhatsAppMessage`) and the audit writers
  described under Structural Enforcement Discipline.
- `eej-mobile-HIDDEN/src/pages/tabs/ExecutiveHome.tsx` — extend
  `statsMeta` to include `unreadWhatsApp` and `whatsappPendingApproval`.
  Render a small badge in the existing Alerts area when
  `unreadWhatsApp > 0` or `whatsappPendingApproval > 0`. No new tab
  is added; the existing tab structure is sufficient.
- `artifacts/api-server/TENANT-ISOLATION-MAP.md` — add entries for the
  four new endpoints.

### Schema state populated by this sub-task

- `whatsapp_messages.approved_by` set to `req.user.id` on approval.
- `whatsapp_messages.approved_at` set to `NOW()` on approval.
- `whatsapp_messages.sent_at` set to `NOW()` on successful send.
- `whatsapp_messages.failed_reason` populated on Twilio error;
  `whatsapp_messages.status` transitions to `'FAILED'` in that case.
- `whatsapp_messages.read_at` set to `NOW()` on inbound read.
- `client_activities` rows inserted on approval where the draft is
  client-linked: `kind='whatsapp_approval'`, `content` set to a
  body preview, `metadata` JSONB containing `{messageId, approvedBy}`.
- `notifications` rows inserted on successful send:
  `channel='whatsapp'`, `workerId` set if outbound was worker-linked,
  `message` set to the body preview (capped at 200 chars to avoid
  duplicating the full body — the full body lives in
  `whatsapp_messages.body`), `actor` set to the approver's email.

### Test scenarios

**Positive — T1 approval transitions DRAFT to APPROVED:**
A draft created by 3b in `'DRAFT'` state is patched by a T1 user via
`PATCH /api/whatsapp/drafts/:id/approve` with no body. Row transitions
to `'APPROVED'`. `approved_by` matches the T1 user's UUID.
`approved_at` is non-NULL and within the last second. No Twilio call
is made. No `notifications` row is created (send did not fire).
If the draft was client-linked, exactly one `client_activities` row
exists with `kind='whatsapp_approval'`.

**Positive — sendImmediately=true triggers Twilio and notifications:**
With `TWILIO_AUTH_TOKEN` configured and the linked template's
`content_sid` populated and `active=true`, a T1 user patches with
`{ sendImmediately: true }`. Row transitions DRAFT → APPROVED → SENT.
`sent_at` is non-NULL. Exactly one `notifications` row exists with
`channel='whatsapp'` and the body preview.

**Negative — T3/T4 forbidden:**
A T3 (operations) or T4 (candidate) user patches the approve endpoint
and receives 403. Row state is unchanged. No audit row is written.

**Negative — sendImmediately on test worker is blocked:**
A draft with `is_test_label=true` patched with `sendImmediately: true`
returns 409 "test worker external sends blocked". The row still
transitions to `'APPROVED'` (the approval is recorded; only the
external send is refused). `approved_by` and `approved_at` populate.
No `notifications` row is created.

**Negative — already-sent draft cannot be re-approved:**
A draft already in `'SENT'` state patched with the approve endpoint
returns 409. No state change. No new audit row.

**Dummy — approving an inbound message:**
`PATCH /api/whatsapp/drafts/:id/approve` where `:id` points to an
inbound (`direction='inbound'`) row returns 400 "approvals only
valid for outbound drafts". The system refuses to fabricate an
approval semantic for inbound traffic. No state change.

### Build gate

`pnpm build` runs clean. Frontend rebuild succeeds.

### Test gate

`pnpm typecheck` returns 0 errors. New 3d integration tests pass when
`TEST_DATABASE_URL` is set. T3/T4 forbidden tests run in-memory using
JWTs signed with the test secret.

### Production deploy gate

3d ships in a deploy subsequent to 3c — see Deploy Sequence section.
Pre-deploy: `pnpm build` clean, integration tests pass with
`TEST_DATABASE_URL` set. Post-deploy: push to origin and Fly deploy
with production verification — health endpoint returns 200, manual
draft created via 3b can be approved by a T1 user via the new
endpoint, `client_activities` and `notifications` audit rows appear as
expected, and `GET /api/admin/stats` returns the new
`unreadWhatsApp` and `whatsappPendingApproval` fields.

### Risk level

Low to medium. No new external surface. Touches the dashboard
aggregator and the mobile frontend. The Twilio dispatch path is
medium-risk because it talks to an external API; mitigated by reusing
the existing `lib/alerter.ts::sendWhatsAppMessage` helper which is
already production-tested for the legacy direct-send flows.

### Estimated LOC

~180 lines across 3-4 modified files, excluding tests.

---

## Structural Enforcement Discipline

The structural enforcement that makes the draft queue meaningful is
this: no row in `whatsapp_messages` transitions from `'DRAFT'` to
`'APPROVED'` to `'SENT'` without `whatsapp_messages.approved_by` and
`whatsapp_messages.approved_at` being populated by an authenticated
user via the `PATCH /api/whatsapp/drafts/:id/approve` endpoint. Those
two columns are the approval audit. They live on the existing
Step 3a schema; no new columns are introduced for this discipline.

The role gate on the approve endpoint (`requireT1T2`) ensures only
T1 (executive/admin) and T2 (legal) tiers can approve. T3 and T4 get
403. The endpoint is the only path through which `approved_by` and
`approved_at` get populated; there is no service-layer or migration
backdoor that sets these columns.

For client-linked draft approvals — where the draft is associated
with a `clients.id` — a row is also written to `client_activities`
with `kind='whatsapp_approval'` and `metadata` JSONB containing
`{messageId, approvedBy}`. This matches the Step 2 CRM activity-log
pattern and gives the client-facing CRM timeline a record of when
WhatsApp messaging was authorised on that client.

For successful sends — when `sendImmediately=true` and the Twilio
dispatch returns success — a row is written to `notifications` with
`channel='whatsapp'`, the body preview (capped at 200 chars), and
the approver's email as `actor`. The full body remains on
`whatsapp_messages.body` so the audit row stays compact.

This discipline does not route through `audit_entries`. The
`audit_entries` table is reserved for worker / job / payroll / permit
mutations per the existing pattern; mixing communication-approval
events into that table would be a category error. The discipline
also does not introduce an `approval_reason` column; prior EEJ
planning did not call for one and the existing columns are
sufficient.

The discipline applies to 3d. The legacy direct-send path in
`lib/alerter.ts` is NOT covered by this discipline in Step 3 — see
Legacy Direct-Send Path Coexistence below. Consolidation of the
legacy path under this discipline is a future sub-phase.

---

## Legacy Direct-Send Path Coexistence

`lib/alerter.ts` exports `sendWhatsAppMessage(to, body)` and
`sendSmsMessage(to, body)`. These are direct fire-and-forget Twilio
calls without a draft queue, without an approval gate, and without
the structural enforcement described above. They are used today by:

- `lib/alerter.ts:308` — daily compliance alert cron (admin
  recipient).
- `lib/alerter.ts:392` — daily worker reminder cron.
- `routes/portal.ts:118` — the portal `send-whatsapp` endpoint that
  delivers a portal token to a worker.
- `services/platform-features.ts:83` — additional sends in the
  platform-features service.

Step 3 does NOT remove or rewire any of these call sites. The new
draft-queue path (3b/3c/3d) is parallel to the legacy direct-send
path. Both coexist after Step 3 ships.

The reason for coexistence rather than replacement: removing the
legacy path requires every existing call site to be migrated to the
draft queue, with each migration verifying that the new approval
gate is appropriate for that flow. Some flows (a daily cron sending
admin alerts to Anna) may be acceptable to keep direct-send because
the audit trail of the cron run itself is sufficient. Other flows
(worker-reminder cron) may want to migrate to the draft queue once
the queue is operational. These are case-by-case decisions, not
something to bundle into Step 3.

The relevant tracked follow-up is in `STEP3-FOLLOWUPS.md` Task A
deferred item: migrate the module-local
`alerter.ts::normalizePhone` to the strict `lib/phone.ts::normalizePhone`
once all new draft-queue call sites exist for review. The broader
"consolidate legacy direct-send under the draft-queue discipline"
question is forward work past Step 3.

---

## Feature Flag Mechanism

Step 3b introduces `artifacts/api-server/src/lib/flags.ts`. The first
flag is `WHATSAPP_AUTOMATION_ENABLED`, derived from
`process.env.WHATSAPP_AUTOMATION_ENABLED === 'true'` with a default
of false.

The flag gates the auto-trigger hooks:

- `draftApplicationReceived(workerId)` — invoked when a new worker
  application lands. With the flag OFF, this is a no-op. With the
  flag ON, it calls `whatsapp-drafter.createDraft` to insert a
  draft.
- `draftPermitUpdate(permitId)` — invoked when a permit transitions
  state. Same flag-gating.
- `draftPaymentReminder(invoiceId)` — invoked by a future cron when
  an invoice approaches due date. Same flag-gating.

The flag does NOT gate manual draft creation. A T1 or T2 user calling
`POST /api/whatsapp/drafts` directly can always create a draft —
admins need to be able to test the flow without flipping the flag
globally.

The flag is checked at the trigger-hook callsite, not inside
`createDraft` itself. `createDraft` is the underlying primitive and
does not know whether its caller is an auto-trigger or a manual
admin request.

When EEJ is ready to switch on auto-triggering for a tenant, the
plan is to set `WHATSAPP_AUTOMATION_ENABLED=true` as a Fly secret
and redeploy. Per-tenant flag gating is not introduced in Step 3;
flag is global. Per-tenant gating is forward work past Step 3.

`lib/flags.ts` is structured to host additional flags in the future
without becoming a god-module: the file exports named constants
(one per flag), each derived from a documented env var, with a
default value safe to ship.

---

## Deploy Sequence

EEJ's only Fly app is `eej-jobs-api` (region `ams`). EEJ does NOT
currently have a separate staging Fly environment. Deploys go
directly from `master` to `eej-jobs-api` production. Whether to
add a staging environment is a separate decision deferred to the
post-Step-3 audit.

### Joint deploy: Step 3a + Step 3b together

3a is on master at `710c5f6` but not yet deployed. 3b ships in the
same Fly release as 3a so the schema migrations run for the first
time alongside the first service that writes to those tables.

**Pre-deploy gate:**
- `pnpm build` runs clean from a fresh checkout.
- `pnpm typecheck` returns 0 errors.
- `pnpm vitest run` shows all unit tests pass and the 6 schema
  integrity tests pass when run with `TEST_DATABASE_URL` pointing
  at a test database where Step 3a migrations have been applied.
- The 3b drafter unit tests pass.
- Working tree is clean. Commits are pushed to `origin/master`.

**Deploy command:**
`flyctl deploy -a eej-jobs-api`

**Post-deploy verification on production:**
- `GET /api/healthz` returns 200 with `{ status: "ok" }`.
- A T1 user calls `POST /api/whatsapp/drafts` with a known template
  and worker and receives a 201 with the inserted row.
- The same T1 user calls `GET /api/whatsapp/drafts/:id` and reads
  the row back.
- `GET /api/admin/stats` returns the existing fields without
  regression (the 3d additions land in a later release).
- No auto-trigger hook has fired in the absence of
  `WHATSAPP_AUTOMATION_ENABLED=true`.

**Rollback:**
If any post-deploy verification fails, `fly releases rollback` to v96
(the last known-good production release prior to 3a+3b). The Step 3a
schema additions use `CREATE TABLE IF NOT EXISTS` and `CREATE TYPE IF NOT EXISTS`
so the migrations are forward-compatible with the rollback target;
the new tables persist in the database after rollback but are
unreferenced by the v96 image. A subsequent re-deploy after fixes
will pick up the existing tables and continue.

### Subsequent deploy: Step 3c (inbound webhook)

Ships independently after the joint 3a+3b deploy stabilises in
production.

**Pre-deploy gate:** as above plus webhook signature tests pass.

**Deploy command:** `flyctl deploy -a eej-jobs-api`.

**Post-deploy verification:** webhook URL returns 503 if
`TWILIO_AUTH_TOKEN` is intentionally unset (fail-closed); a
hand-signed test request returns 200 and persists an inbound row.
Push to origin and Fly deploy with production verification covers
the deploy step.

**Rollback:** `fly releases rollback` to the prior release (the
3a+3b deploy version, not v96).

### Subsequent deploy: Step 3d (approve/send/dashboard)

Ships independently after 3c stabilises.

**Pre-deploy gate:** as above plus approve/send unit tests pass.

**Deploy command:** `flyctl deploy -a eej-jobs-api`.

**Post-deploy verification:** A draft created via 3b can be approved
via the new 3d endpoint; if Twilio credentials are configured and
the template is active, send proceeds and `notifications` audit row
appears. Dashboard `unreadWhatsApp` and `whatsappPendingApproval`
counters render correctly. Push to origin and Fly deploy with
production verification.

**Rollback:** `fly releases rollback` to the 3c release.

Every sub-phase deploy ends with push to origin and Fly deploy with
production verification. No sub-phase is considered complete until
production verification has passed.

---

## What Step 3 Does Not Do

The following are explicit out-of-scope items for Step 3:

- **No consolidation of the legacy direct-send path.**
  `lib/alerter.ts::sendWhatsAppMessage` and its callers
  (`lib/alerter.ts:308, 392`, `routes/portal.ts:118`,
  `services/platform-features.ts:83`) remain unchanged and continue
  to operate as fire-and-forget direct sends. Migration is forward
  work past Step 3.
- **No UI redesign.** The Step 3d frontend addition is a small badge
  on the existing `ExecutiveHome.tsx` Alerts area. No new mobile tab
  is added. No standalone "drafts management" page is built. A
  drafts UI surface is forward work past Step 3.
- **No Twilio content-SID provisioning.** The 3 seeded templates are
  inactive and have NULL `content_sid` values. Activation requires
  approving the templates in the Twilio console and writing the
  approved SIDs into the database. This is a manual ops step and is
  not part of any code sub-phase.
- **No phone-field encryption.** `whatsapp_messages.phone` and the
  existing `workers.phone` / `clients.phone` remain plaintext. The
  Step 3a Task B follow-up tracked in `STEP3-FOLLOWUPS.md`
  ("PII-encrypt phone platform-wide") is the relevant forward item;
  it is not in Step 3 scope.
- **No staging environment introduction.** EEJ deploys directly to
  production. Adding a staging Fly app is a separate decision out-of-scope
  for Step 3.
- **No per-tenant flag gating.** `WHATSAPP_AUTOMATION_ENABLED` is a
  single global flag in Step 3. Per-tenant variation is forward work.
- **No EU AI Act analysis for recruitment scoring.** The
  `routes/jobs.ts` smart-matching `matchScore` algorithm is a likely
  Annex III §4(a) candidate; that analysis is a separate research
  task tracked in the orientation report, not Step 3 work.
- **No retroactive audit of existing notifications rows.** The
  `notifications` table may contain `channel='whatsapp'` rows from
  the legacy direct-send path. Step 3 does not migrate or annotate
  those.

---

## Forward References

After Step 3 ships and stabilises, the following are candidate
follow-up sub-phases ordered roughly by priority:

- **Alerter consolidation.** Migrate `lib/alerter.ts::normalizePhone`
  to import the strict `lib/phone.ts::normalizePhone`. Then evaluate
  whether the legacy direct-send call sites should migrate to the
  draft queue. Tracked in `STEP3-FOLLOWUPS.md` Task A deferred item.
- **Phone PII encryption.** Encrypt `phone` platform-wide
  (`workers.phone`, `clients.phone`, `whatsapp_messages.phone`) as a
  single coordinated migration. Follow the Stage 3 pattern from
  `lib/encryption.ts` (enc:v1: prefix, legacy plaintext passthrough,
  role-based masking, one-time backfill). Tracked in
  `STEP3-FOLLOWUPS.md` Task B deferred item.
- **Stage 5 follow-ups.** UUID migration for `tenant_id` columns
  (currently TEXT FK to `tenants.slug`); audit `tenant_id DEFAULT 'production'`
  across all tenant-scoped tables once the first non-production
  tenant onboards; sweep `updated_at` columns for `$onUpdate`
  consistency. All tracked in `STEP3-FOLLOWUPS.md`.
- **EEJ-APATRIS audit comparison.** With Step 3 shipped, compare
  EEJ's draft-queue + audit pattern against the Apatris equivalent
  to surface duplication, divergence, and consolidation candidates.
  Reference `docs/architecture-boundaries.md` and the orientation
  report's Section D (Relationship to APATRIS).
- **EU AI Act analysis for recruitment scoring.** Annex III §4(a)
  candidate analysis for `routes/jobs.ts` smart matching. Produce
  a research artifact analogous to Apatris's
  `EU_AI_ACT_ARTICLE_6_RESEARCH.md`.
- **WhatsApp drafts UI.** A standalone admin surface for browsing
  drafts, approving in bulk, viewing the audit timeline. Step 3d
  ships only a badge; a full UI is its own sub-phase.
- **Twilio content-SID provisioning runbook.** Document the manual
  ops step to approve the 3 seeded templates in the Twilio console
  and write the approved SIDs into the database via a small
  privileged endpoint or migration.
- **Cron dispatcher for APPROVED messages.** A scheduled job that
  picks up rows in `'APPROVED'` state with `sendImmediately` not
  used and dispatches them to Twilio in a controlled batch with
  rate limits.
- **Per-tenant flag mechanism.** When EEJ onboards a second
  customer tenant, replace the global `WHATSAPP_AUTOMATION_ENABLED`
  with a per-tenant configuration table.
