# Read-Only Database Pattern

**Purpose:** least-privilege architecture for queries that don't need write access. Defense-in-depth at the Postgres role level — even if application code attempts an INSERT/UPDATE/DELETE via the read-only client, Postgres rejects with `permission denied` at the role layer. Closes Item 3.0 sub-task 1.

**Origin:** `docs/EEJ_CORE_PLAN.md` v1.18 §"Item 3.0" sub-task 1. Discipline 2 (build protection / accidental deletion prevention) Layer 1 (token scoping). PocketOS + SaaStr/Replit incident lesson: prompt-level rules don't enforce; infrastructure-level role separation does.

**Lineage:** v1 landed Day 22 (commit `3999485`) and was reverted (`bf34088`) during the production crisis caused by `pg`/Neon `channel_binding` handshake failure. v2 re-introduces the same infrastructure with the channel_binding strip baked in at the code level (defense-in-depth — see "channel_binding handling" below).

---

## Architecture

Two Drizzle clients exported from `artifacts/api-server/src/db/index.ts`:

| Export | Pool | Backed by Neon role | Use case |
|---|---|---|---|
| `db` | `DATABASE_URL` | full read/write role | Mutations: INSERT, UPDATE, DELETE; transactions; migrations |
| `dbReadOnly` | `DATABASE_URL_READONLY` (or fallback) | `eej_readonly` (SELECT-only on all public tables; ALTER DEFAULT PRIVILEGES grants SELECT on future tables) | Reads: analytics, dashboard data, debugging, health checks |

Both clients use the **same Drizzle schema** (`schema.ts`). Schema is connection-agnostic — exporting two pools doesn't duplicate schema definition.

### Fail-soft behavior

When `DATABASE_URL_READONLY` env var is unset:
- `dbReadOnly` falls back to the writable pool (functionally equivalent to `db`)
- Startup logs a visible warning: `[db] DATABASE_URL_READONLY not set — dbReadOnly falls back to writable pool. Set the secret to activate least-privilege protection (Item 3.0 sub-task 1).`
- Code importing `dbReadOnly` works normally; **the role-level protection is INACTIVE until the secret lands**

This deploy-safe pattern allows incremental rollout:
1. Land the code (this commit) — `dbReadOnly` exists, fallback active
2. Manish provisions Neon role + sets Fly secret on prod + staging (see "Manish-side activation" below)
3. Rolling restart — `dbReadOnly` now uses real RO pool; protection active without further code changes

### Why fail-soft (vs fail-closed at startup)

Considered: throw at startup if `DATABASE_URL_READONLY` unset.

Rejected because:
- Code can land before the secret lands (allows EEJ Claude commits without coupling to Manish-side action)
- A missing RO secret should not break a working production deploy
- Operational visibility is preserved via startup warning + future Phase 2 Daily Health Check ritual scope

The trade-off is explicit: **soft fallback creates a window where `dbReadOnly` doesn't actually enforce RO**. Documentation + startup warning + audit during Item 3.0 sub-task 6 restore drill catch this. Acceptable.

---

## channel_binding handling

The Day 22 production crisis surfaced a structural incompatibility between Node's `pg` client and Neon's pooler endpoint: `pg` cannot complete the SCRAM-SHA-256-PLUS channel-binding handshake, so any connection string containing `&channel_binding=require` (Neon Console's default suffix as of mid-2026) produces 28P01 auth failures even with correct credentials.

`db/index.ts` exports a small pure helper `normalizeNeonUrl(url: string): string` that strips `channel_binding=<value>` from the query string. The helper is applied to BOTH `DATABASE_URL` and `DATABASE_URL_READONLY` before pool construction. Idempotent — already-clean strings pass through unchanged.

Why both connections, not just RO:
- The writable `DATABASE_URL` was fixed at the Fly-secret level during Day 22 recovery. A future operator pasting a fresh Neon-Console string would re-create the same crash. Code-level normalization closes that lid permanently.
- Defense-in-depth principle (same logic used for T0-B rate limiter — reject env-var bypass in production code): self-healing in code beats out-of-band convention.

Unit tests in `artifacts/api-server/src/db/normalize.test.ts` exercise five positional cases (mid-string, only-param, leading, sandwiched, idempotent on clean) plus the `prefer`/`disable` variant strip. AC-8.X discipline satisfied — the normalization is exercised, not just claimed.

---

## Convention for code

**Prefer `dbReadOnly` for read-only queries even before the secret lands.**

Reasoning:
- Code communicates intent: "this query doesn't write"
- Once secret lands, protection activates without diff
- Habit-forming: every developer reflexively reaches for the right client

**Use cases where `dbReadOnly` SHOULD replace `db`:**
- Analytics endpoints (`/api/admin/stats`, dashboard widgets, KPI queries)
- Health-check queries (e.g., `SELECT 1` probes, table-existence checks)
- Debug/admin read endpoints (read-only inspections of worker status, audit log, etc.)
- Cron-job readers (regulatory scan reading rate-limit state, retention sweep checking row counts before delete)
- PIP readiness scoring (already only reads — `routes/pip-readiness.ts`)
- WhatsApp lifecycle reads (GET /whatsapp/messages, GET /whatsapp/drafts)
- Revenue analytics (`routes/revenue.ts` — forecast/actual/summary; pure reads gated by `requireFinancialAccess`)

**Use cases where `db` MUST stay (writes are intrinsic):**
- All POST/PATCH/PUT/DELETE handlers
- Migration runner (`migrate.ts`)
- Seed data writes (`seedInitialData()`)
- Audit log appends (`appendAuditEntry`)
- WhatsApp dispatch (whatsapp_messages writes)

**Anti-pattern:** mixing `db` and `dbReadOnly` in a single transaction. Drizzle transactions belong to one pool. If a transaction needs both reads and writes, use `db` throughout.

**This commit (v2 re-impl) ships infrastructure only.** No production callsite is migrated to `dbReadOnly` here — migration of eligible callers happens in subsequent commits per the Phase A audit list above.

---

## How to verify a query uses `dbReadOnly`

**At code-review time:**
```bash
# Find every reference to dbReadOnly in source
grep -rn "dbReadOnly" artifacts/api-server/src --include="*.ts"
```

**At runtime (when secret is set):**
- INSERT/UPDATE/DELETE via `dbReadOnly` returns Postgres error `permission denied for relation <table>` (rejected by role, not by code)
- SELECT via `dbReadOnly` returns rows normally

**At startup:**
- Look for log line: `[db] dbReadOnly using DATABASE_URL_READONLY (eej_readonly Neon role)` (RO active)
- OR: `[db] DATABASE_URL_READONLY not set — dbReadOnly falls back to writable pool...` (RO inactive, fallback)

**At drill time (Item 3.0 sub-task 6):**
- Manish-side test: connect to Neon via `psql "$DATABASE_URL_READONLY"`, attempt `INSERT INTO workers (name) VALUES ('test')`, expect `ERROR: permission denied for table workers`. Confirms protection at infrastructure layer.

---

## Type safety note

Drizzle's pg client type does NOT narrow to read-only operations. `dbReadOnly.insert(...)` compiles cleanly in TypeScript. **The protection is at the Postgres role level, not at the type system.**

Why not type-narrow:
- Drizzle's API surface is symmetric across reads/writes; constraining at type level would require a custom Drizzle wrapper or runtime proxy
- Type-narrowing would prevent ad-hoc debugging where a developer wants to use `dbReadOnly.execute(sql\`SELECT 1\`)`
- Role-level enforcement is the durable protection; type-level convention is the code-review aid

If TypeScript-level enforcement becomes valuable later, a future workstream could introduce a custom wrapper. Defer until the convention proves insufficient.

---

## Manish-side activation

**Step 1 (already complete):** `eej_readonly` Neon role + connection string created on the `eej-production` branch. Stored in password manager. SELECT-only on all 75 public tables verified Day 22.

**Step 2:** set Fly secret on both apps. Use the **file approach proven Day 22** to avoid shell-history exposure and to make the channel_binding visual scrub explicit:

```bash
# 2a — paste connection string into a temp file (interactive)
nano /tmp/db_readonly_url.txt
#   - paste the eej_readonly URL from password manager
#   - REMOVE any trailing &channel_binding=require (belt-and-suspenders;
#     code-level normalizeNeonUrl will strip it anyway, but the visual
#     scrub before save reduces operator surprise downstream)
#   - save + exit

# 2b — set on production
~/.fly/bin/flyctl secrets set --app eej-jobs-api \
  DATABASE_URL_READONLY="$(cat /tmp/db_readonly_url.txt)"

# 2c — set on staging
~/.fly/bin/flyctl secrets set --app eej-api \
  DATABASE_URL_READONLY="$(cat /tmp/db_readonly_url.txt)"

# 2d — secure-delete the temp file
shred -u /tmp/db_readonly_url.txt 2>/dev/null || rm /tmp/db_readonly_url.txt
```

Both `secrets set` operations trigger a rolling restart. After restart, the startup log switches from the warning to the activation message. RO protection then live.

**Step 3 (verification):** confirm the activation log + production health:
```bash
# Watch logs for the activation line
~/.fly/bin/flyctl logs --app eej-jobs-api | grep -E "dbReadOnly|DATABASE_URL_READONLY"
# Expect: [db] dbReadOnly using DATABASE_URL_READONLY (eej_readonly Neon role)

# Confirm production still serves
curl -fsS https://eej-jobs-api.fly.dev/api/healthz
# Expect: {"status":"ok"}
```

**Step 4 (drill, deferred to Item 3.0 sub-task 6, window opens 2026-05-15):** prove the role-level rejection works end-to-end. Document outcome in `docs/STATE_CHANGES_LOG.md` per #14 protocol.

---

## Maintenance

This doc is the canonical reference for the dbReadOnly pattern. Revise when:
- New use cases identified (e.g., specific endpoint refactored from `db` to `dbReadOnly`)
- Type-narrowing added (Drizzle wrapper or proxy)
- RO role permissions change (new tables not auto-granted)
- Failover behavior changes
- channel_binding handling changes (e.g., Neon ships a pg-compatible PLUS variant, normalize.ts becomes unnecessary)

**Revision history:**
- v1: 2026-05-10 (Day 22). Initial doc + `dbReadOnly` export landed via Item 3.0 sub-task 1 commit `3999485`. Fail-soft fallback when `DATABASE_URL_READONLY` unset. **Reverted same day** (`bf34088`) during production crisis caused by `pg`/Neon channel_binding handshake failure — the revert was crisis-recovery, not a design retraction.
- v2: 2026-05-11 (Day 23). Re-implemented per Day 22 EOD carry-forward. Channel_binding strip baked into code via `normalizeNeonUrl` helper applied to BOTH `DATABASE_URL` and `DATABASE_URL_READONLY` (defense-in-depth). Five unit tests cover positional cases + variants + idempotency. Manish-side activation steps amended to use the file-approach pattern proven during Day 22 recovery.
