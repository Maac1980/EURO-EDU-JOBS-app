# EURO-EDU-JOBS (EEJ) Platform

## Business Purpose
EEJ is a Polish labor compliance, recruitment, and workforce management platform for Euro Edu Jobs — a staffing agency managing foreign workers in Poland. It handles the full lifecycle: recruitment (job board, ATS pipeline), compliance (work permits, TRC, BHP, contracts), payroll (ZUS/PIT calculations), regulatory intelligence (Polish law monitoring), and workforce tracking (GPS, timesheets).

## GitHub Repository
`Maac1980/EURO-EDU-JOBS-app`

## Deployment
- **Primary:** Fly.io app `eej-jobs-api` (region `ams`, 2 machines)
- **Deploy command:** `~/.fly/bin/flyctl deploy -a eej-jobs-api` (run from REPO ROOT — never `cd` into `artifacts/api-server/`; Docker build context must include the full monorepo workspace so `lib/api-zod`, `lib/db`, and `pnpm-workspace.yaml` are visible to `pnpm install` inside the container)
- **Build:** `pnpm build` (builds api-server + eej-mobile + apatris-dashboard)
- **Run:** `node artifacts/api-server/dist/index.cjs`
- **Health Check:** `GET /api/healthz` → https://eej-jobs-api.fly.dev/api/healthz
- **Port:** 8080 internal → 443 external (HTTPS via Fly, force_https = true)
- **Secrets:** set via `flyctl secrets set -a eej-jobs-api KEY=value` (see Environment Variables)

## Tech Stack

### Backend
- **Runtime:** Node.js 24, TypeScript, Express 5
- **Database:** PostgreSQL (Drizzle ORM, **66 tables** — count verified from `lib/db/src/schema.ts` + `artifacts/api-server/src/db/schema.ts` `pgTable` exports)
- **Auth:** JWT (15min access tokens + refresh), TOTP 2FA. Users live in Drizzle/Postgres `system_users`, seeded via `artifacts/api-server/src/db/migrate.ts` (`seedUsers` block). **Airtable is no longer in the live auth path** — historical only.
- **Security:** Helmet, CORS, express-rate-limit
- **AI:** Anthropic Claude (document OCR, compliance copilot), Perplexity (regulatory search)
- **Email:** Brevo SMTP / Resend / Nodemailer
- **SMS:** Twilio (SMS + WhatsApp)
- **Storage:** Cloudflare R2 (S3-compatible)
- **Payments:** Stripe (agency subscriptions)
- **Maps:** Mapbox (GPS tracking)
- **Scheduling:** node-cron (daily regulatory scans, compliance alerts)
- **Logging:** Pino, Sentry

### Frontend — Dashboard (desktop / tablet)
- **Location:** `artifacts/apatris-dashboard/` (directory name is historical — this is the EEJ dashboard, served at the site root by the Fly app)
- **Framework:** React 19, Vite 8, TypeScript
- **Styling:** Tailwind CSS 4, Radix UI components
- **State:** TanStack React Query (with generated client at `lib/api-client-react/`), React Context for auth
- **Routing:** Wouter (URL-based). `App.tsx` is the route table; `AppShell.tsx` provides the top nav, mega-menu, mobile bottom-bar
- **Auth token:** `sessionStorage["eej_token"]` is the canonical key (note: a few legacy pages use `eej_jwt` / `apatris_jwt` — unification is a known Tier 2 cleanup)

### Frontend — Mobile App (PWA)
- **Location:** `eej-mobile-HIDDEN/` (the live source). `artifacts/eej-mobile/` is an older Replit artifact and is not the deployed mobile build.
- **Framework:** React 19, Vite 8, TypeScript
- **Styling:** Tailwind CSS 4, Radix UI components
- **State:** TanStack React Query, React Context
- **Routing:** State-based tab navigation (no URL routing)
- **Design:** Mobile-first PWA (430px container)
- **Auth token:** `localStorage["eej_token_v2"]` via `eej-mobile-HIDDEN/src/lib/api.ts` `authHeaders()` helper
- **RBAC:** 4-tier (T1 Executive, T2 Legal, T3 Operations, T4 Candidate)

### Monorepo Structure
```
/                          # pnpm workspace root
├── artifacts/
│   ├── api-server/        # Express API (95+ endpoints)
│   ├── eej-mobile/        # Replit artifact version
│   ├── apatris-dashboard/ # Dashboard app
│   └── mockup-sandbox/    # UI staging
├── eej-mobile-HIDDEN/     # Main mobile app source
├── lib/
│   ├── db/                # Drizzle schema & migrations
│   ├── api-zod/           # Shared Zod schemas
│   └── api-client-react/  # React API hooks
└── scripts/               # Deployment scripts
```

## Features Built

### Recruitment & ATS
1. **Job Board** — Public job listings with search, salary, location
2. **ATS Pipeline** — 8-stage Kanban (New → Screening → Interview → Offer → Placed → Active → Released → Blacklisted)
3. **Smart Matching** — AI candidate-job matching (score 0-100 based on role, experience, docs, location)
4. **Interview Scheduling** — Schedule, feedback, pass/fail tracking
5. **Public Application** — Landing page with CV upload + AI extraction

### Worker Management
6. **Worker Database** — Full profiles (60+ fields: contact, docs, rates, compliance)
7. **Candidate List** — Search, filter by status (cleared/expiring/missing/pending)
8. **Bulk Import** — CSV import, AI-powered document scanning (passport/BHP/CV)
9. **Worker Notes** — Internal notes per worker

### Compliance & Documents
10. **Document Tracking** — 8+ expiry fields with color zones (green >60d, yellow 30-60d, red <30d, expired)
11. **Compliance Alerts** — Email/WhatsApp notifications for expiring docs
12. **AI Document Scanning** — Claude OCR for passport, contract, CV auto-fill
13. **GDPR Tools** — Data export, right to be forgotten, RODO consent tracking

### Payroll & Finance
14. **ZUS Calculator** — Full Polish payroll calc (Umowa Zlecenie + Umowa o Prace)
15. **Payroll Records** — Monthly payroll with ZUS/PIT breakdown
16. **Invoicing** — Faktura VAT generation (PDF), status tracking (draft/sent/paid)
17. **Stripe Billing** — Agency subscription plans (Starter/Professional/Enterprise)

### Immigration & Regulatory
18. **Work Permit Tracker** — Type A/B/C/Seasonal/Oswiadczenie, document checklists, 7-day deadlines
19. **Regulatory Intelligence** — AI-powered daily scans of Polish gov sources (praca.gov.pl, ZUS, PIP, Sejm)
20. **Immigration Search Engine** — Perplexity + Claude analysis with sources, confidence scores
21. **Compliance Copilot** — Streaming AI Q&A on Polish labor law

### Operations
22. **GPS Tracking** — Worker check-in/out with Mapbox, site geofencing
23. **Contract Generation** — Polish labor contracts (Zlecenie/Prace) as PDF
24. **Worker Portal** — Self-service hour tracking with 30-day JWT tokens
25. **Audit Logging** — Immutable trail of all system actions

### Platform
26. **Multi-Role Dashboard** — Role-specific home pages (Executive, Legal, Operations, Candidate)
27. **Platform Modules** — ZUS Ledger, Timesheets, PIP Compliance, B2B Contracts, BHP Medical
28. **Notification System** — Email, WhatsApp, SMS alerts
29. **Client Management** — Client records with NIP, billing rates

## Environment Variables

### Required
```
DATABASE_URL=postgresql://user:password@localhost:5432/eej
JWT_SECRET=<random-64-char-hex>
EEJ_ADMIN_EMAIL=anna.b@edu-jobs.eu
EEJ_ADMIN_PASSWORD=<admin-password>
```

### AI Services
```
ANTHROPIC_API_KEY=sk-ant-api-...
PERPLEXITY_API_KEY=pplx-...
```

### Email (Brevo SMTP)
```
BREVO_SMTP_USER=<brevo-login>
BREVO_SMTP_PASS=<brevo-password>
ALERT_EMAIL_TO=admin@edu-jobs.eu
```

### SMS (Twilio)
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=<token>
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_SMS_FROM=+1234567890
```

### Storage (Cloudflare R2)
```
R2_ACCOUNT_ID=<account>
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET_NAME=eej-documents
```

### Payments (Stripe)
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Maps
```
MAPBOX_PUBLIC_TOKEN=pk.eyJ1...
```

### Scheduling
```
ALERT_CRON=0 8 * * *
REGULATORY_CRON=0 7 * * *
```

## Database
- PostgreSQL with Drizzle ORM
- **66 tables** (count from `pgTable` exports in `lib/db/src/schema.ts` + `artifacts/api-server/src/db/schema.ts`). Key tables: `workers`, `system_users`, `job_postings`, `job_applications`, `interviews`, `invoices`, `work_permit_applications`, `regulatory_updates`, `immigration_searches`, `gps_checkins`, `payroll_records`, `audit_entries`, `notifications`, `trc_cases`, `border_crossings`, `smart_documents`, `clients`, `tenants`
- Push schema: `cd lib/db && pnpm push`

## API Structure
- **~400 endpoints across 33 route files** in `artifacts/api-server/src/routes/` (route-file count exact; endpoint count counted from `router.<method>(` occurrences, approximate because some service files also register routes)
- Key route groups: `auth`, `workers`, `jobs`, `applications`, `interviews`, `contracts`, `invoices`, `permits`, `regulatory`, `immigration`, `gps`, `payroll`, `compliance`, `gdpr`, `billing`, `admin`, `portal`, `notifications`, `audit`, `trc-service`, `legal-engine`, `legal-operations`, `intelligence-router`, `eej-mobile`, `eej-copilot`, `clients`, `twofa`, `smart-ingest` (in `services/`), `first-contact-verification` (in `services/`)

## User Seeding
- 7 seed system users in `artifacts/api-server/src/db/migrate.ts` `seedUsers` block (Manish, Anna, Liza, Karan, Marjorie, Yana, plus two historical accounts kept until Manish deactivates).
- Seed password is read from `EEJ_SEED_PASSWORD` env (Fly secret) — **never hardcoded in source**.
- `requires_2fa` and `can_view_financials` are baked in at INSERT time (commit `9808059` removed the re-clobbering UPDATE backfills — see `migrate.ts` comment block in the post-seedUsers region for history).
- Airtable is **not** the auth source. The "Airtable Schema Sync" UI in the dashboard Settings tab is a stale remnant from an earlier integration and is on the Tier 2 cleanup list.

## Mobile App Navigation
- Bottom nav (`AppShell.tsx` `MOBILE_TABS`, post-commit 23): **Home, Workers, Payroll, Alerts, Permits, Contracts**, plus a "More" entry that opens the full module grid (`MoreTab.tsx`)
- "More" menu grid links role-gated by `executive | legal | operations | candidate` — see `MoreTab.tsx` `MODULES` array for the full list (currently ~33 modules)
- State-based tab switching (no URL routing). Modal sheets (e.g. `WorkerProfileSheet`) overlay the active tab

---

## TEAM & SCOPE

### Owner: Manish Shetty
### Companies: EEJ (Euro Edu Jobs), Apatris, IWS, STPG
### Workers: 200+ foreign workers across Poland

The current priority list is the audit-tier sequencing — see `## CURRENT PRIORITY LIST` at the bottom of this file. The earlier aspirational Phase 1-3 roadmap was removed in commit `<this commit>`; its content remains in git history if ever needed.

---

## RULES (MUST FOLLOW)
- Always use pnpm not npm
- Always build dist before pushing
- Always test ZUS formula: 160h × 31.40 = 3929.05 net
- Never use DROP TABLE or DROP COLUMN — only CREATE TABLE IF NOT EXISTS / ALTER TABLE ... IF EXISTS
- Never break existing features
- Use DATABASE_URL for EEJ database connection
- Push to `master` branch for EEJ
- After every change: build dist → copy to artifacts → commit → push
- Deploy: `~/.fly/bin/flyctl deploy -a eej-jobs-api` (Fly.io, region `ams`)
- Vite base must be "/" not "/eej-mobile/"
- .gitignore must NOT contain "dist" — frontend dist must stay tracked

## STAGE 4 SECURITY STANDARDS (MUST FOLLOW)
- All PESEL / IBAN writes pass through `lib/encryption.ts` (`encrypt()`) — AES-256-GCM, format `enc:v1:<iv>:<tag>:<ciphertext>`
- Reads use `decrypt()` which tolerates legacy plaintext (backward compat)
- Role masking: T1/T2 see plaintext; T3/T4 see `***-****-NNNN` via `projectWorkerPII()` or `workerToCandidate(row, viewerRole)`
- Audit log never stores raw PII — use `"[encrypted]"` sentinel on changes
- All queries to tenanted tables (workers, users, clients, payroll_records, invoices, work_permit_applications) MUST filter by `tenant_id`
- Use `requireTenant(req)` + `scopedWhere(tenantId, col)` from `lib/tenancy.ts`
- Tenants table is authoritative — `tenant_id` columns are FK to `tenants(slug)`
- Audit log is INSERT-ONLY — do NOT add DELETE or UPDATE endpoints on `audit_entries`
- Money columns must be `NUMERIC(10,2)` — never REAL or FLOAT
- All timestamp columns must be `TIMESTAMPTZ` — convert via `AT TIME ZONE 'Europe/Warsaw'`
- No hardcoded passwords anywhere — use env vars (`EEJ_ADMIN_PASSWORD`, `EEJ_SEED_PASSWORD`, `EEJ_ENCRYPTION_KEY`)
- Stripe webhooks require `STRIPE_WEBHOOK_SECRET` — reject without signature
- CORS allowlist via `ALLOWED_ORIGINS` env — no wildcards
- Required Fly secrets: JWT_SECRET, DATABASE_URL, EEJ_ADMIN_PASSWORD, EEJ_ENCRYPTION_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY, BREVO_SMTP_USER, BREVO_SMTP_PASS

## DECISION MAKING (MUST FOLLOW)
Governs **how Claude Code presents work to Manish** — not how chat-Claude or Manish phrase suggestions back.
- Never ask "shall I proceed?" or "which option do you prefer?"
- Always pick the best option yourself and execute it
- If genuinely ambiguous (50/50 with real consequences), state your choice and why in one line, then execute
- Never present numbered options for Manish to choose from
- Never stop to ask for approval mid-task
- Just build it

*Note: this rule applies to Claude Code's own output. It does NOT conflict with chat-Claude or Manish framing inputs to Claude Code as questions ("what do you think if we do X") — see `## TEAM STRUCTURE`. The asymmetry is intentional: Claude Code is closest to the code and decides; chat-Claude + Manish are upstream and may probe.*

## EXECUTION STYLE (MUST FOLLOW)
- Read CLAUDE.md before starting any task
- Execute without stopping within a task — but tier boundaries are gated (see `/goal USAGE DOCTRINE` below)
- Test before pushing to GitHub
- Always push AND fly deploy (not just git push): `~/.fly/bin/flyctl deploy -a eej-jobs-api`
- Commit after each logical unit, not in one big batch
- If something fails, fix it and continue — don't stop to ask

## WORKING CONVENTIONS (durable — applies every session)
- **Prompt format:** every instruction carries IF / WHY / FOR WHAT — the reasoning travels with the instruction
- Every prompt opens with a TO/FROM/SUBJECT-style header identifying who it's for
- Every command, URL, SQL block, and code snippet goes in its own copy-paste code box. No exceptions
- **One prompt at a time** — never two parallel work-prompts in flight. When multiple items exist, one stepped prompt covering them, sequenced — not multiple separate prompts
- A PENDING SCOPE TRACKER is maintained and pasted at the end of work prompts — persistent capture surviving drift and compaction
- **"Always implement what you learn"** — corrections become permanent immediately, applied in the next instance, not the third
- Explanations kill time — prompts and responses stay to the point
- **Time is in Manish's hand.** No calendar narration ("tonight", "tomorrow", "this morning"). Sessions are bounded by laptop-open / laptop-shut, not clocks. EOD is the physical act of Manish closing the laptop — chat-Claude may recommend ending, only Manish decides
- **Estimates are NEVER given in human-developer hours** — execution is near-instant; the real constraint is Manish's thinking, review, and routing bandwidth. Scope is expressed as work units / milestones, not clock time

## TEAM STRUCTURE
- Three roles:
  - **Manish** — architect (decides, detects, routes)
  - **chat-Claude** — drafts prompts, applies systemic pressure, holds the tracker
  - **Claude Code** — executes AND reviews / suggests / pushes back (closest to the code)
- Current process: **Claude Code's suggestions are the default path.** chat-Claude does not inject competing preferences on the work plan. Manish + chat-Claude may suggest, framed as a question ("what do you think if we do X") — not a directive
- **Manish detects, chat-Claude architects.** Manish should not be asked to make architecture decisions — he is the detection and direction layer; chat-Claude makes the architect calls
- No Holmes / no separate structural-review seat — that was the APATRIS-era setup. Claude Code now does review and suggestion directly

## /goal USAGE DOCTRINE
- `/goal` is used for substantial remediation work with a verifiable end state
- **ONE /goal per tier / per scoped batch** — never one mega-goal across an entire backlog
- Every `/goal` carries:
  - (a) concrete numbered acceptance criteria the evaluator can check from surfaced output
  - (b) an explicit turn cap as a safety net
  - (c) a scope/constraint section stating what NOT to touch
- The `/goal` evaluator cannot call tools and cannot see staging. It only judges what Claude Code surfaces in conversation. **Therefore `/goal` completion is NOT the same as "verified working"**
- **Two-layer verification:**
  - **Layer 1** — what the `/goal` evaluator + Claude Code can verify (compiles, tests pass, endpoint returns 200, `git ls-files --deleted` empty)
  - **Layer 2** — what only Manish can verify (the feature actually works when clicked on staging)
- A `/goal` completing satisfies Layer 1 only. **Manish's staging detection is Layer 2 and is mandatory between tiers**
- **Workflow:** one `/goal` completes → Claude Code reports → Manish detects on staging → next tier's `/goal`. Never chain tiers without the Manish-detection gate

## TOOLING NOTES
- **Agent View** (`claude agents`) is the monitoring surface during long `/goal` runs — running / blocked-on-Manish / done
- Use `claude agents --cwd <path>` to scope the session list — EEJ and APATRIS live in separate directories
- `/loop` (time-interval re-run) is distinct from `/goal` (run-until-condition). Remediation work uses `/goal`, not `/loop`
- `claude project purge` is destructive — never run without `--dry-run` first

## PRE-DEPLOY DISCIPLINE
- `git ls-files --deleted` must return empty before any deploy — flyctl packages the local filesystem, not git HEAD; CI-green does not mean deploy-safe
- CI green is **CHECKED** on GitHub Actions, never assumed
- `fly.staging.toml`: `auto_stop_machines = false` (set in commit `afdacc3` — staging machines must not idle-stop mid-work)

## HARD BOUNDARIES
- Hard Boundaries 1-16 remain pre-conditional gates and hold at all times

## VALIDATION FRAMEWORK (RUN AFTER EVERY BUILD)
After every build, run this validation before saying "done":

### Step 1 — Functional Test
- Happy path: does the feature work end-to-end?
- Missing data: what happens with empty/null inputs?
- Edge case: duplicate data, expired dates, wrong format

### Step 2 — Logic Check
- No conflicts between new and existing code
- No duplicate functions across files
- AI layer isolated from decision logic
- All outputs default to DRAFT

### Step 3 — Safety Check
- No unsafe automatic external actions (WhatsApp, email, SMS)
- Approval layer respected — nothing sent without explicit approval
- Test workers blocked from external communication
- Safe fallback on failure (no crash, no data loss)

### Step 4 — Regression Check
- Login still works
- Dashboard still serves
- Mobile app still serves
- Workers API returns data
- Existing features not broken

### Step 5 — Security Check
- New endpoints use authenticateToken
- No sensitive data exposed without auth
- Test data isolated by tenant_id

### Step 6 — Performance Check
- No N+1 query patterns (loop with DB call inside)
- Scalable for 200-500 workers

### Step 7 — Report (REQUIRED)
Output a clear report with:
1. What works (with evidence)
2. What is broken (with detail)
3. Critical issues (fix now)
4. High issues (fix soon)
5. Medium/low issues
6. What needs manual testing

DO NOT say "build succeeded" or "everything works" without running this validation and showing evidence.

---

## CURRENT PRIORITY LIST

Canonical "what's next" surface. Drove by the pre-production audit. Each tier is one `/goal` per the `## /goal USAGE DOCTRINE` above. **Tier-to-tier transitions are gated by Manish staging detection** — never chain.

### Tier 1 — Compliance-critical falsehoods
Surfaces that **lie about compliance state on real data** (worst class of bug for a labor-compliance platform). All must land before any tier they block.
- **DocumentWorkflow** — wire to the existing smart-ingest pipeline (`artifacts/api-server/src/services/smart-ingest.ts:137`, `POST /api/documents/smart-ingest`); add explicit `error` branch to the render decision tree so "Failed to load" no longer renders as "All documents reviewed"
- **PayrollPage** — frontend calls `/api/payroll/current`; backend has `/payroll/workers`. Path mismatch silently 404s and renders "No workers found." Add a route alias OR rename the frontend call + map field names (`hourlyNettoRate→hourlyRate`, `totalHours→monthlyHours`, `advancePayment→advance`). Also add a generic `PATCH /payroll/workers/:id` or rewire the four field-PATCH callers
- **MyUPOTab / MySchengenTab** (mobile) — both fetch routes that don't exist server-side (`/api/mos2026/upo/:id`, `/api/schengen/worker/:id`). Build the backends — these are border-checkpoint legal-stay surfaces and "No UPO registered yet" empty state is dangerous fiction
- **WorkerProfileSheet** (mobile modal) — banner says "saved locally" but toast says "Profile saved successfully"; uploads only set local state, never POST. Wire save + upload to real endpoints

### Tier 2 — Dashboard connection hygiene
One sweep across ~20 surfaces fixing the systemic pattern issues.
- **Token-key unification** — pick one (`eej_token` recommended), shim/migrate the others (`eej_jwt`, `apatris_jwt`)
- **Error-masquerading-as-empty sweep** — add `error` state to the render decision tree across all surfaces that currently do `.catch(() => setX([]))` without an error UI
- **Replit-text purge** — user-visible strings like "Add to your Replit Secrets" replaced with current Fly-era guidance

### Tier 3 — Scaffold-404 surfaces
Architect decision: **build the missing backends, don't hide the UI**. Each is its own scoped task.
- `AnalyticsPage` (`/api/analytics/heatmap`, `/predictive`, `/report/pdf`)
- `GpsTracking` (`/api/gps/active`, `/api/geofences`, `/api/gps/anomalies`)
- `ContractHub` list (`/api/contracts`, `/api/poa`, `/api/contracts/:id/pdf`)
- `SkillsAssessmentTab` (`/api/workers/:id/skills`)
- `ShiftScheduleTab` (`/api/shifts`)
- `WorkerCalendarTab` (`/api/workers/availability`)

### Tier 4 — Static-mock tabs
Where the 66-table schema has data, wire to real data. Where it doesn't, honest empty-state. Claude Code reports the split for each.
- `UpdatesTab` (mobile) — fictitious BuildPro updates
- `SalaryBenchmarkTab` — synthetic "Q1 2026 Polish market" rates
- `PayTransparencyTab` — synthetic gender/contract/nationality breakdowns
- `AlertsTab` "Recently Resolved" hardcoded names with specific dates
- `OperationsHome` `OPS_PIPELINE` / `B2B_CONTRACTS` mock fallback

### Tier 5 — Hardcoded enums
Single source of truth for pipeline stages, job roles (currently 13 welding-heavy entries), nationalities, voivodeships, status enums, contract types.
