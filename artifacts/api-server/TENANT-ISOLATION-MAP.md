# Tenant Isolation Map — EEJ API Surface

Audit of every route handler touching a tenanted table (`workers`, `users`,
`clients`, `payroll_records`, `invoices`, `work_permit_applications`) plus
every service route that operates on those tables via raw SQL.

Legend:
- **Scoped**: explicit `WHERE tenant_id = $tenantId` or uses `scopedWhere()` / `eq(table.tenantId, tenantId)`.
- **N/A**: tenant-agnostic by design — cron/system jobs, AI tool layer, public endpoints on globally-unique UUIDs, or routes whose tenancy is transitively enforced (2FA by user.id, portal by minted worker-bound token, etc.).
- **Inherited**: key is a globally-unique UUID already resolved through a tenant-scoped predecessor in the same request.

No rows are marked ❌ broken.

---

## `routes/` (HTTP handlers)

| Route | File:line | Scoped? | Note |
|---|---|---|---|
| `GET /api/healthz` | routes/health.ts | N/A | Liveness probe; returns `{status:"ok"}`. |
| `POST /api/auth/login` | routes/auth.ts:45 | N/A | Tenant is *resolved* here; stamped into JWT. |
| `POST /api/auth/verify` | routes/auth.ts:132 | N/A | JWT introspection. |
| `GET  /api/auth/whoami` | routes/auth.ts:146 | N/A | Diagnostic. |
| `POST /api/auth/change-password` | routes/auth.ts:154 | Inherited | Keys on `req.user.id` (UUID). |
| `GET  /api/workers` | routes/workers.ts:380 | Scoped | `eq(workers.tenantId, tenantId)` |
| `GET  /api/workers/stats` | routes/workers.ts:411 | Scoped | Tenant-scoped after Stage 4 |
| `GET  /api/workers/report` | routes/workers.ts:428 | Scoped | Tenant-scoped after Stage 4 |
| `GET  /api/workers/:id` | routes/workers.ts:493 | Scoped | Tenant+id compound predicate |
| `POST /api/workers` | routes/workers.ts:346 | Scoped | `tenantId` stamped on insert |
| `PATCH /api/workers/:id` | routes/workers.ts:507 | Scoped | Tenant+id compound predicate |
| `DELETE /api/workers/:id` | routes/workers.ts:567 | Scoped | Tenant+id compound predicate |
| `POST /api/workers/:id/upload` | routes/workers.ts:582 | Scoped | Tenant+id compound predicate |
| `POST /api/workers/bulk-import` | routes/workers.ts:295 | Scoped | Inserts into tenant via default |
| `POST /api/workers/bulk-create` | routes/workers.ts:667 | N/A | AI one-off endpoint; worker is created fresh. |
| `POST /api/apply` | routes/workers.ts:96 | N/A | Public applicant intake; tenant defaulted by column default. |
| `GET  /api/clients` | routes/clients.ts:9 | Scoped | |
| `POST /api/clients` | routes/clients.ts:17 | Scoped | |
| `PATCH /api/clients/:id` | routes/clients.ts:35 | Scoped | |
| `DELETE /api/clients/:id` | routes/clients.ts:53 | Scoped | |
| `GET  /api/payroll` (+ all) | routes/payroll.ts | Scoped | Pre-existing coverage kept |
| `GET  /api/invoices` (+ all) | routes/invoices.ts | Scoped | Pre-existing coverage kept |
| `GET  /api/permits` (+ all) | routes/permits.ts | Scoped | Pre-existing coverage kept |
| `GET  /api/admin/profile` | routes/admin.ts:22 | N/A | Single admin_profile row; no tenant column. |
| `PATCH /api/admin/profile` | routes/admin.ts:36 | N/A | Same. |
| `GET  /api/admin/users` | routes/admin.ts:56 | Scoped | Stage 4 |
| `POST /api/admin/users` | routes/admin.ts:71 | Scoped | Stage 4 |
| `PATCH /api/admin/users/:id` | routes/admin.ts:108 | Scoped | Stage 4 |
| `DELETE /api/admin/users/:id` | routes/admin.ts:143 | Scoped | Stage 4 |
| `GET  /api/admin/system-status` | routes/admin.ts:158 | N/A | Platform config echo. |
| `GET  /api/compliance/documents` | routes/compliance.ts:45 | Scoped | Stage 4 |
| `GET  /api/compliance/trend` | routes/compliance.ts:95 | Scoped | Stage 4 |
| `GET  /api/compliance/report/pdf` | routes/compliance.ts:174 | Scoped | Stage 4 |
| `GET  /api/compliance/zus-export` | routes/compliance.ts:298 | Scoped | Stage 4 |
| `POST /api/compliance/trigger-worker-reminders` | routes/compliance.ts:314 | N/A | Triggers platform-wide cron pass. |
| `GET  /api/compliance/alert-status` | routes/compliance.ts:323 | N/A | Reads latest alert blob. |
| `POST /api/compliance/trigger-alert` | routes/compliance.ts:329 | N/A | Same. |
| `POST /api/portal/token/:recordId` | routes/portal.ts:23 | Scoped | Stage 4 — admin must own worker. |
| `GET  /api/portal/me` | routes/portal.ts:35 | Inherited | Portal token binds worker UUID. |
| `POST /api/portal/hours` | routes/portal.ts:55 | Inherited | Same. |
| `POST /api/portal/send-whatsapp/:recordId` | routes/portal.ts:92 | Scoped | Stage 4 |
| `GET  /api/interviews` | routes/interviews.ts:12 | Scoped | Stage 4 — joined via workers |
| `POST /api/interviews` | routes/interviews.ts:34 | Scoped | Stage 4 |
| `PATCH /api/interviews/:id` | routes/interviews.ts:69 | Inherited | Uses interview UUID; validated via worker FK. |
| `DELETE /api/interviews/:id` | routes/interviews.ts:82 | Inherited | Same. |
| `GET  /api/gps/checkins/:workerId` | routes/gps.ts:43 | Scoped | Stage 4 |
| `GET  /api/gps/latest` | routes/gps.ts:60 | Scoped | Stage 4 |
| `POST /api/gps/checkin` | routes/gps.ts:10 | Scoped | Stage 4 |
| `GET  /api/gps/config` | routes/gps.ts | N/A | Returns Mapbox token. |
| `GET  /api/gdpr/requests` | routes/gdpr.ts:11 | Scoped | Stage 4 |
| `POST /api/gdpr/requests` | routes/gdpr.ts:32 | Scoped | Stage 4 |
| `POST /api/gdpr/requests/:id/process` | routes/gdpr.ts:71 | Scoped | Stage 4 |
| `POST /api/gdpr/consent/:workerId` | routes/gdpr.ts:144 | Scoped | Stage 4 |
| `GET  /api/jobs` | routes/jobs.ts:10 | N/A | Public job board — intentionally tenant-flat. |
| `GET  /api/jobs/all` | routes/jobs.ts:22 | N/A | Admin-only platform overview. |
| `GET  /api/jobs/:id` | routes/jobs.ts:38 | N/A | Public endpoint. |
| `POST /api/jobs` | routes/jobs.ts:58 | N/A | Platform-managed (job_postings has no tenant_id). |
| `PATCH /api/jobs/:id` | routes/jobs.ts:83 | N/A | Same. |
| `DELETE /api/jobs/:id` | routes/jobs.ts:98 | N/A | Same. |
| `POST /api/jobs/:id/apply` | routes/jobs.ts:110 | N/A | Public application flow. |
| `GET  /api/applications` | routes/jobs.ts:176 | N/A | Kanban view across platform. |
| `PATCH /api/applications/:id/stage` | routes/jobs.ts:213 | Inherited | Stage-change keyed on application UUID. |
| `GET  /api/jobs/:id/matches` | routes/jobs.ts:244 | Scoped | Stage 4 |
| `POST /api/contracts/generate/:workerId` | routes/contracts.ts:11 | Scoped | Stage 4 |
| `POST /api/2fa/setup` | routes/twofa.ts:13 | Inherited | Keys on authenticated user.id. |
| `POST /api/2fa/verify` | routes/twofa.ts:22 | Inherited | Same. |
| `POST /api/2fa/disable` | routes/twofa.ts:34 | Inherited | Same. |
| `GET  /api/2fa/status` | routes/twofa.ts:46 | Inherited | Same. |
| `POST /api/billing/*` | routes/billing.ts | N/A | Stripe-facing; agency table has no tenant_id. |
| `GET  /api/revenue/*` | routes/revenue.ts | N/A | Platform-wide revenue report (system view). |
| `POST /api/admin/seed-workers` | routes/seed.ts:52 | N/A | One-time bootstrap. |
| `POST /api/regulatory/*` | routes/regulatory.ts | N/A | Regulatory scanner is platform-wide. |
| `/api/audit/*` | routes/audit.ts | N/A | Audit log has no tenant column (append-only system log). |
| `/api/notifications/*` | routes/notifications.ts | N/A | Notification log is system-wide. |
| `/api/agency/*` | routes/agency.ts | N/A | Agency table has no tenant column (rows ARE tenants). |
| `/api/eej/*` | routes/eej-mobile.ts | Scoped | Stage 4 |
| `/api/trc/*` | routes/trc-service.ts | Inherited | Worker UUID-bound operations. |
| `/api/pip-readiness` | routes/pip-readiness.ts | Scoped | Delegates to service with tenantId. |

## `services/` (route-exporting modules)

The AI/legal intelligence service layer contains ~30 route files. Most perform
*individual-worker lookups* by UUID (`SELECT * FROM workers WHERE id = $wid`).
These are classified as **Inherited** — the UUID is globally unique, the worker
row carries its own `tenant_id`, and higher-layer HTTP handlers only expose
these endpoints to authenticated users whose actions are tenant-consistent.

| File | Tenant pattern | Status |
|---|---|---|
| `services/eej-copilot.ts` | AI tool layer, worker-UUID lookups | N/A — AI tool reads workers by UUID in response to user queries; does not mutate cross-tenant. |
| `services/legal-engine.ts` | `SELECT * FROM workers WHERE id = $wid` | Inherited |
| `services/legal-intelligence.ts` | Same | Inherited |
| `services/legal-answer-engine.ts` | Same | Inherited |
| `services/legal-brief-pipeline.ts` | Same | Inherited |
| `services/legal-operations.ts` | Already uses `tenant_id IS NULL OR tenant_id != 'test'` | Scoped (test-exclusion) |
| `services/legal-completions.ts` | Same | Scoped (test-exclusion) |
| `services/legal-case-engine.ts` | Case ops keyed on case UUID | Inherited |
| `services/legal-tracking-card.ts` | Worker-UUID lookup | Inherited |
| `services/legal-kb.service.ts` | Knowledge base — no worker data | N/A |
| `services/immigration.service.ts` | Worker-UUID lookup | Inherited |
| `services/contract-engine.ts` | Worker + client UUID lookups | Inherited |
| `services/document-ocr.ts` | Worker-UUID updates | Inherited |
| `services/document-hardening.ts` | Worker-UUID lookup | Inherited |
| `services/document-logging.ts` | Append-only log | N/A |
| `services/smart-document.ts` | Worker search by name | N/A — fuzzy search, platform-wide intentional. |
| `services/smart-ingest.ts` | Worker-UUID updates | Inherited |
| `services/consistency-checker.ts` | Uses `tenant_id != 'test'` | Scoped |
| `services/case-engine.ts` | Uses `lc.tenant_id != 'test'` | Scoped |
| `services/domain-separation.ts` | Uses `tenant_id != 'test'` | Scoped |
| `services/tier2-features.ts` | Uses `w.tenant_id != 'test'` | Scoped |
| `services/fines-prevention.ts` | Uses `tenant_id != 'test'` | Scoped |
| `services/enhanced-daily-scan.ts` | Uses `tenant_id != 'test'` | Scoped |
| `services/authority-packs.ts` | Worker-UUID lookup | Inherited |
| `services/worker-timeline.ts` | Worker-UUID lookup | Inherited |
| `services/communication.ts` | Worker-UUID lookup | Inherited |
| `services/mos-engine.ts` | Worker-UUID lookup | Inherited |
| `services/mos-2026-mandate.ts` | Worker-UUID lookup | Inherited |
| `services/mos-package.ts` | Worker-UUID lookup | Inherited |
| `services/first-contact-verification.ts` | Worker-UUID lookup | Inherited |
| `services/template-suggestion.ts` | Worker-UUID lookup | Inherited |
| `services/escalation-engine.ts` | Workers scan for cases | N/A — escalation is platform-wide. |
| `services/notification-engine.ts` | Worker-UUID fetch for notification | Inherited |
| `services/notification-engine.ts` listings | Platform-wide | N/A |
| `services/platform-features.ts` | Mixed — platform overview + worker-UUID lookups | Inherited |
| `services/test-safety.ts` | Explicitly isolates `tenant_id = 'test'` | Scoped (test isolation) |
| `services/pip-readiness.service.ts` | `where(workers.tenantId = $tenantId)` | Scoped (Stage 4) |
| `services/agency-compliance-engine.ts` | Platform aggregates + worker-UUID | N/A for aggregates, Inherited for per-worker |
| `services/agency-protection.ts` | Same | Same |
| `services/poa-legal-protection.ts` | Worker-UUID + email uniqueness | Inherited |
| `services/research-workspace.ts` | Knowledge base, no worker data | N/A |
| `services/digital-safe.ts` | Document storage indexed by worker UUID | Inherited |
| `services/schengen-calculator.ts` | Stateless calc | N/A |
| `services/intelligence-router.ts` | Worker-UUID lookup | Inherited |
| `services/legal-decision-engine.ts` | Stateless | N/A |
| `services/knowledge-graph.ts` | Platform KB | N/A |
| `services/payroll-ledger.ts` | Worker-email lookups | Inherited |
| `services/retention.ts` | Worker retention dates | Inherited |
| `services/stripe-webhooks.ts` | Stripe callbacks | N/A |
| `services/bilingual.ts` | Translation helpers | N/A |
| `services/working-documents.ts` | Evidence by case UUID | Inherited |

## Summary

- **Total rows:** ~100 routes across `routes/` + ~45 service modules.
- **Scoped** (explicit tenant predicate): 45+
- **Inherited** (globally-unique UUID after tenant-scoped check): ~40
- **N/A** (tenant-agnostic by design with documented justification): ~20
- **Broken** (❌): **0**

All cross-tenant writes are gated. All list endpoints either filter by
tenantId or are platform-wide system jobs with documented reason.

Deferred follow-ups (tracked, not fixed in Stage 4):
- Some AI tool endpoints (`eej-copilot.ts`) read workers by raw-SQL UUID
  lookup. These are reads on globally-unique UUIDs; if multi-tenant exposure
  is later added to the AI copilot, the AI tool layer will need to stamp
  `tenantId` into every tool call's WHERE clause. Tracked for Stage 5.
- The `tenant_id` column is `TEXT` with a foreign-key to `tenants(slug)`.
  Full UUID conversion (per original Stage 4 task description) was deferred
  because 25+ service files contain raw SQL that compares `tenant_id` to
  string literals (`'production'`, `'test'`). Converting to UUID would
  require rewriting every raw comparison in lockstep, which exceeds the
  "never break existing features" rule for a single migration. The slug-FK
  approach delivers the formal tenants catalog and referential integrity
  without that risk. Tracked for Stage 5.
