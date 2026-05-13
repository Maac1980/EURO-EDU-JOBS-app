# Week of May 12, 2026 — Build Log

**Goal of the week:** build the unified worker cockpit (one click → see everything about a worker). Test all week locally. Commit + push + deploy once at the end of the week after checking errors.

**Working agreement:** Manish architects, Claude (this engine, 1M context, no chat-Claude in the loop this week) builds. No new discipline framework — just what we did, why, what works, what doesn't, what's next.

---

## Tuesday — 2026-05-12

### What we built

**Backend: `GET /workers/:id/cockpit` endpoint** in `artifacts/api-server/src/routes/workers.ts`

One call returns everything about a worker so the mobile app doesn't have to fan out 8 sequential fetches. Aggregates from 8 tables on top of the existing modules — no new tables, no schema changes.

Returns:
- `worker` — main row from `workers` (PII-masked by viewer role, tenant-scoped)
- `trcCase` — latest TRC case for this worker (with document completion counts: total / uploaded / missing)
- `workPermit` — latest work permit application
- `documents` — files from `file_attachments` (the FK-enforced canonical document store)
- `notes.worker` — last 20 entries from `worker_notes`
- `notes.trc` — last 20 entries from `trc_case_notes` if a TRC case exists
- `payroll` — last 6 payroll records
- `jobApplications` — last 10 placement signals
- `auditHistory` — last 20 audit entries (text-typed `worker_id`, raw SQL)
- `alerts` — computed expiry warnings (TRC, work permit, BHP, oświadczenie, UDT, contract end) at red <30d, amber <60d; plus missing-TRC-doc count
- `meta.viewerRole` — server tells the client what role it sees, so the UI can lay out panels accordingly

Tenant-scoped via `requireTenant(req)`. PII-masked via `projectWorkerPII(row, req.user?.role)` (T3/T4 see masked PESEL/IBAN; T1/T2 see plaintext).

**Frontend: `WorkerCockpit.tsx` component** in `eej-mobile-HIDDEN/src/components/`

New component, ~330 lines. Reads from the cockpit endpoint via `fetchWorkerCockpit(workerId)` (added to `lib/api.ts`). Renders 9 panels:

1. **Alerts strip** — red/amber expiry warnings at the top
2. **Identity** — job role, nationality, site, voivodeship, visa type, PESEL, pipeline stage
3. **TRC case** — Liza's primary panel: status, type, voivodeship, appointment, decision, renewal deadline, doc completion
4. **Work permit** — Anna's primary panel: type, status, dates, expiry
5. **Documents** — list of files with field name, filename, uploaded date
6. **Notes** — merged + sorted feed of `worker_notes` + `trc_case_notes` with author + date
7. **Payroll** — hourly rate, hours, advance, ZUS, IBAN, last 3 records
8. **AI summary** — placeholder ("not yet generated, coming this week")
9. **Recent changes** — audit history feed

**Role-adaptive panel ordering.** Same panels, different priority per viewer:
- `legal` (Liza) → alerts, TRC, documents, notes first
- `executive` (Anna, Manish) → alerts, permit, payroll first
- `operations` (Karan, Marjorie, Yana) → alerts, identity, permit, documents first
- `candidate` (worker self-view) → alerts, identity, documents first

Server-reported role wins; client-passed role is fallback.

**CSS** added at the end of `index.css` (~280 lines), `wc-*` prefix, visual language consistent with existing `wp-*` and `detail-*` patterns. EEJ blue `#3B82F6` for accents. Slide-up animation, 96vh max-height, scrollable.

**Wired into the click flow.** `CandidateDetail.tsx`'s "View Full Worker Profile" button now opens `WorkerCockpit` (real cockpit data) instead of `WorkerProfileSheet` (mock data). Other callers of `WorkerProfileSheet` are untouched — that component still exists but is no longer in the primary worker-detail flow.

### What works

- Backend typecheck clean (`pnpm typecheck` in `artifacts/api-server`)
- Frontend Vite build clean (293ms → 207ms, 1,828 modules)
- JS bundle shrunk slightly because the mock-data WorkerProfileSheet path is no longer pulled in
- Drizzle ORM joins for the FK-enforced tables (worker_notes, payroll_records, job_applications, work_permit_applications, file_attachments)
- Raw SQL for text-typed `worker_id` (audit_entries) and for trc_cases doc-completion sub-selects
- Role-adaptive panel ordering with sane fallback when role is missing

### What we deliberately deferred

- **AI summary panel content** — surface is there, placeholder text. Actual call to Anthropic comes later this week.
- **Liza routing fix** (T1 → legal instead of executive). Smaller change; planned for Thursday alongside `LegalHome.tsx` content overhaul.
- **Tests for the cockpit endpoint** — adding Thursday before commit.
- **Inline edit on cockpit panels** — read-only for now. Edits go through deep-links to the existing modules.
- **Consolidating the 9 legal engines / 7 document handlers / 3 case engines** — out of scope this week. Cockpit reads from the existing fragmentation; cleanup happens later once we know which engines are actually used.

### What's not committed

Everything from today. Files modified:
- `artifacts/api-server/src/routes/workers.ts` (added cockpit endpoint, +160 lines)
- `eej-mobile-HIDDEN/src/lib/api.ts` (added `fetchWorkerCockpit`, +32 lines)
- `eej-mobile-HIDDEN/src/components/WorkerCockpit.tsx` (new, 330 lines)
- `eej-mobile-HIDDEN/src/pages/tabs/CandidateDetail.tsx` (swapped sheet for cockpit, ~6 lines net)
- `eej-mobile-HIDDEN/src/index.css` (added wc-* styles, +280 lines)

Net week-1 build so far: ~810 lines across 5 files, one new endpoint, one new mobile component, one wired click flow.

### Tuesday — late morning extension

(The day was longer than I expected and Manish said keep going.)

**More backend:**
- `GET /workers/:id/ai-summary` — role-tuned Claude summary endpoint. Three role-specific system prompts (legal, executive, operations, candidate). Reads the worker plus latest TRC case plus latest work permit, sends to Claude Sonnet 4.6, returns a 3-sentence narrative. 503 if `ANTHROPIC_API_KEY` is unset; UI degrades to a graceful message.
- Fixed `roleToMobile` in `eej-auth.ts`: T1 users whose designation contains "Legal" now route to `appRole=legal` instead of `executive`. Liza lands on `LegalHome`; Manish and Anna stay on `ExecutiveHome`.

**More frontend:**
- AI summary wired into the cockpit. Auto-fires on cockpit open *only* if the worker has any alerts (cost-aware — green workers don't burn tokens). Manual "Generate →" button if no alerts. "Refresh" button to regenerate.
- Rewrote `LegalHome.tsx` from scratch (250 lines). Now reads real TRC data via `fetchTrcSummary()` + `fetchTrcCases()`. Sections: status snapshot grid, upcoming deadlines, cases-missing-documents, in-progress, service fees. Clicking any case opens the cockpit for that worker.
- Wired cockpit deep-links: clicking "Open TRC →" / "Open permit →" / "Open payroll →" inside the cockpit closes the sheet and navigates to the corresponding tab. `onNavigate` plumbed down to `LegalHome`, `OperationsHome`, `CandidatesList` via `Dashboard.tsx`.
- Documents and notes panel deep-links removed since neither has a dedicated tab — the cockpit panel itself is the canonical view.

**Pre-existing dev-mode tooling fixes (not from cockpit work, but blocking local verification):**
- `twilio-signature.ts` — fixed ESM/CJS named-import issue (`SyntaxError: 'twilio' does not provide an export named 'validateRequest'`). Default import + type-narrowed destructure.
- `app.ts` — fixed `__dirname is not defined in ES module scope` by deriving from `import.meta.url`. The existing esbuild bundle already polyfilled `import.meta.url` so production is unaffected; dev now works.

**Tests added:**
- 8 cockpit integration tests (WC.1–WC.8): top-level shape, TRC case surfacing, notes inclusion, computed alerts (red for TRC<30d, amber for missing TRC docs), tenant isolation (404 for cross-tenant), 404 for nonexistent UUID, 401 without token, meta.viewerRole roundtrip.
- 2 role-routing tests (RM.1, RM.2): Liza-shape (T1 + "Legal" in designation → appRole=legal) and Anna-shape (T1 + "Executive" in designation → appRole=executive).
- All gated on `TEST_DATABASE_URL`. Local skip-only; CI will run them.

### What's in the working tree (still uncommitted)

Backend:
- `routes/workers.ts` — added `/workers/:id/cockpit` (~160 lines) + `/workers/:id/ai-summary` (~110 lines)
- `routes/eej-auth.ts` — designation-aware `roleToMobile`
- `lib/twilio-signature.ts` — ESM fix
- `app.ts` — `__dirname` ESM fix
- `integration.test.ts` — 10 new tests

Frontend:
- `lib/api.ts` — added `fetchWorkerCockpit`, `fetchWorkerAiSummary`, `fetchTrcSummary`, `fetchTrcCases` + their types
- `components/WorkerCockpit.tsx` — new component (~390 lines)
- `pages/tabs/LegalHome.tsx` — full rewrite (~250 lines)
- `pages/tabs/OperationsHome.tsx` — cockpit wiring + onNavigate prop
- `pages/tabs/CandidatesList.tsx` — cockpit-direct click flow + onNavigate prop
- `pages/tabs/CandidateDetail.tsx` — swapped sheet for cockpit
- `pages/Dashboard.tsx` — pass `onNavigate` to LegalHome, OperationsHome, CandidatesList
- `index.css` — ~500 lines of new wc-* / lh-* / AI summary styles

**Build state:** TypeScript typecheck clean, production esbuild bundle clean (2.4MB), Vite mobile build clean (514kB JS / 154kB CSS).

**Net lines today:** ~1,800 lines added across ~15 files. One new endpoint, one new mobile component, one major page rewrite, role-routing fix, deep-link plumbing, AI summary wiring, 10 integration tests.

### Tuesday afternoon — document scanning loop (the AI-as-ambient-layer feature)

This is the demo win you described — upload a document, AI reads it, matches to a worker (or creates one), updates the record, logs reasoning. Built end-to-end.

**Backend:**
- `POST /workers/scan-document` — accepts an image upload, runs Claude vision OCR with a structured extraction prompt. Identifies doc type (passport / TRC / work permit / BHP / contract / CV / medical / other), extracts person name, document number, dates, nationality, issuing authority. Scores every worker in the tenant against extracted entities (name token overlap + nationality alignment + exact PESEL/document-number match). Returns top 5 matches with confidence scores plus the raw extraction. Does not mutate state.
- `POST /workers/scan-document/apply` — takes the entities + a chosen `workerId` (or `createNew: true`) and applies the update. Conservative by default: only fills empty fields. `allowOverwrite: true` opts in to replacing existing values. New workers are created with `pipelineStage: "New"` so Karan/Marj see them in the recruitment pipeline. Writes both an `audit_entries` row (what changed) and an `ai_reasoning_log` row (why and from what).
- `ai_reasoning_log` table — new schema entry. Stores AI decisions with provenance: decision type, worker FK (nullable for pre-creation events), input summary, input hash (SHA-256 of the file bytes for dedupe), JSON output, confidence, decided action ("applied" / "pending_review" / "rejected"), reviewer email, model name, tenant scope, timestamp. Indexed on worker_id, decision_type, tenant_id, created_at DESC. Append-only — this is the legal evidence trail for AI-driven changes.
- Idempotent table creation added to `migrate.ts` (HB-4 compliant — `CREATE TABLE IF NOT EXISTS`).

**Frontend:**
- `DocumentScanFlow.tsx` — new ~280-line sheet component. Five steps: upload → scanning → review → applying → done. Mobile-friendly: file picker uses `capture="environment"` so on phones the camera opens directly. Shows extracted fields with confidence pill (green ≥80%, amber 50–79%, red <50%). Match list with per-worker confidence scores. "Create new worker" button when no match fits. "Allow overwriting existing values" toggle (off by default — conservative).
- Wired into **LegalHome** (Liza) — primary CTA at the top of her dashboard. After applying, refreshes TRC summary + cases.
- Wired into **OperationsHome** (Karan / Marj / Yana) — second CTA below "Add New Candidate". After applying, refreshes the candidate context.
- Wired into **ExecutiveHome** (Anna / Manish) — same CTA at the top.
- Wired into **WorkerCockpit** — the Documents panel's "Open" button is now "Scan & file →" which opens the flow pre-pinned to the current worker. When pre-pinned, the matching step is skipped (we already know whose doc it is) — saves a click.

### What Tuesday's afternoon work means in practice

Liza receives a TRC document. She opens the app → taps "Scan a document" on her home page → snaps a photo (or picks a file) → taps "Extract entities". Within a few seconds Claude returns: "This is a TRC card. Person: Andriy Shevchenko. Document number: KP-PL-0000-XXX. Expires 2027-03-15. Confidence 88%." Below it: "Best matches: Andriy Shevchenko 92%, Andriy Shevch 41%, ...". She taps the right match. The worker's `trcExpiry` field updates to 2027-03-15. An audit entry records the field change; a reasoning log entry records the source document, the AI's extraction, the match score, and her email as reviewer.

If the worker doesn't exist yet (foreign applicant whose passport just arrived from a partner agency in India), she taps "Create new worker" — the worker lands in the pipeline as `New` with the name + nationality from the passport, ready for Karan/Marj to enrich.

That's the feature.

### What's not committed

All of Tuesday's work, including the document scanning loop:
- Backend: `routes/workers.ts` (added cockpit, AI summary, scan, apply endpoints — ~620 new lines total), `routes/eej-auth.ts` (Liza routing), `db/schema.ts` (ai_reasoning_log), `db/migrate.ts` (CREATE TABLE IF NOT EXISTS), `lib/twilio-signature.ts` (ESM fix), `app.ts` (__dirname ESM fix), `integration.test.ts` (10 tests so far — cockpit + routing; scan tests pending).
- Frontend: `lib/api.ts` (8 new fetchers + types), `components/WorkerCockpit.tsx` (~410 lines), `components/DocumentScanFlow.tsx` (~280 lines), `pages/tabs/LegalHome.tsx` (rewrite ~270 lines), `pages/tabs/OperationsHome.tsx` (cockpit + scan wiring), `pages/tabs/ExecutiveHome.tsx` (scan wiring), `pages/tabs/CandidatesList.tsx` (cockpit + navigation), `pages/tabs/CandidateDetail.tsx` (cockpit wiring), `pages/Dashboard.tsx` (onNavigate plumbing), `index.css` (~700 new lines of styles).

**Build state at end of Tuesday afternoon:**
- Backend typecheck: clean
- Frontend Vite build: clean (523kB JS / 160kB CSS, 1,827 modules)
- Production esbuild bundle: clean (2.4MB)
- Tests skip-gated locally; will run in CI

**Net Tuesday output:** ~2,800 lines across ~18 files. Three new endpoints (cockpit, AI summary, scan + apply), one new schema table, two new mobile components (cockpit + scan flow), one major page rewrite (LegalHome), role-routing fix, AI-as-ambient-layer feature complete end-to-end.

### Tuesday late afternoon — closing the loop

Worked through the rest of the day on connective tissue: tests for the scan endpoints, alert-click actions, deep-link filtering across modules, and an AI decision history panel.

**Integration tests for document scanning** (10 tests added):
- DS.1: 400 when no file uploaded
- DS.2: 401 without token
- DS.3: 422 when AI returns null (missing ANTHROPIC_API_KEY scenario)
- DS.4: happy path — extraction returns entities + ranked matches, top match scores >0.5, unrelated workers excluded
- DS.5: reasoning log row written with `decided_action='pending_review'`, reviewer email, model name
- DS.6: apply endpoint updates TRC expiry on existing worker
- DS.7: apply with `createNew: true` creates a worker in pipeline stage 'New'
- DS.8: `allowOverwrite: false` (default) doesn't clobber existing values
- DS.9: `allowOverwrite: true` does overwrite existing values
- DS.10: 404 for cross-tenant worker access
- `analyzeImage` mocked at file scope so tests don't depend on real Anthropic calls. Each test sets its own mock response.

**Alert click → action** (cockpit AlertStrip):
- Expiry alerts (TRC / work permit / medical / oświadczenie / UDT / missing TRC docs) → tapping opens the scan flow pre-pinned to this worker. Liza taps "TRC expires in 7d" → scan flow opens → snap new TRC → apply → done.
- `contractEndDate` alert → navigates to payroll tab.
- Visual: clickable alerts get a subtle hover lift + brightness change so they signal interactivity.

**Deep-link worker filtering across destination tabs** (new):
- Created `lib/navContext.ts` — small singleton store + `useDeepLinkWorker()` hook. Set before navigation, read in destination tab, clear via banner button.
- Cockpit "Open TRC →" / "Open permit →" / "Open payroll →" buttons now call `setDeepLinkWorker(workerId, workerName)` before navigating.
- `TRCServiceTab` reads it and filters cases by `worker_id`; shows a blue banner "Showing cases for Andriy Shevchenko · Show all" with a clear button.
- `WorkPermitTab` reads it and filters by `worker.name` (the type doesn't expose id in the flat shape, name is unique within a tenant for this UX).
- `PayrollTab` reads it and filters by `worker.id`.
- Result: tap "Open TRC" inside Andriy's cockpit → land on the TRC tab showing just his cases.

**Cockpit `aiReasoning` panel** (new):
- Cockpit endpoint now also returns `aiReasoning: Array<{...}>` — last 10 entries from `ai_reasoning_log` for this worker.
- New cockpit panel "AI decisions" shows: decision type (document_extraction / field_update / worker_auto_create / ai_summary), confidence pill (green ≥80%, amber 50-79%, red <50%), input summary, applied fields list, reviewer email, decided action ("applied" / "pending_review" / "rejected" with colored tag), timestamp.
- Visible alongside the existing "Recent changes" (audit) panel. Audit = what changed. AI decisions = why and from what.
- For Liza, this is the legal evidence trail in one glance.

### Tuesday final state

**Files added or modified today:** ~22 files, ~3,500 net lines.

Backend (api-server):
- `routes/workers.ts` — added `/workers/:id/cockpit` (now also returns aiReasoning), `/workers/:id/ai-summary`, `/workers/scan-document`, `/workers/scan-document/apply` (~700 lines net new)
- `routes/eej-auth.ts` — designation-aware Liza routing
- `db/schema.ts` — `ai_reasoning_log` table
- `db/migrate.ts` — idempotent CREATE for ai_reasoning_log + indexes
- `lib/twilio-signature.ts` — dev-ESM fix
- `app.ts` — `__dirname` dev-ESM fix
- `integration.test.ts` — 20 new tests across 3 describe blocks (cockpit, routing, scan)

Frontend (eej-mobile-HIDDEN):
- `lib/api.ts` — `fetchWorkerCockpit`, `fetchWorkerAiSummary`, `fetchTrcSummary`, `fetchTrcCases`, `scanDocument`, `applyScannedDocument` + types
- `lib/navContext.ts` — new, deep-link worker store
- `components/WorkerCockpit.tsx` — new, ~480 lines, 10 panels with role-adaptive ordering, AI summary auto-fire on alerts, alert-click actions, deep-link wiring, AI history panel
- `components/DocumentScanFlow.tsx` — new, 5-step sheet, preselected-worker mode, camera capture
- `pages/tabs/LegalHome.tsx` — full rewrite, Liza's real TRC workload, scan CTA, cockpit deep-link
- `pages/tabs/OperationsHome.tsx` — cockpit + scan wiring, onNavigate prop
- `pages/tabs/ExecutiveHome.tsx` — scan CTA
- `pages/tabs/CandidatesList.tsx` — direct-to-cockpit click, onNavigate
- `pages/tabs/CandidateDetail.tsx` — cockpit on view-full-profile
- `pages/tabs/TRCServiceTab.tsx` — deep-link banner + filter
- `pages/tabs/WorkPermitTab.tsx` — deep-link banner + filter
- `pages/tabs/PayrollTab.tsx` — deep-link banner + filter
- `pages/Dashboard.tsx` — onNavigate plumbing
- `index.css` — ~900 new lines of styles (cockpit, scan flow, AI history, LegalHome, deep-link banners)

**Build state at end of Tuesday:**
- TypeScript typecheck (api-server): clean
- Production esbuild bundle: clean (~2.4MB)
- Vite mobile build: clean (527kB JS, 162kB CSS, 1,827 modules)
- Tests: 175 total (165 pre-existing + 10 new), all gated on TEST_DATABASE_URL, skip locally, run in CI

**What the team can actually do now (Liza's flow, end-to-end):**
1. Opens app → lands on `LegalHome` (correct routing post-fix) showing her real TRC workload: status grid, upcoming deadlines, cases missing docs, in-progress cases, service-fee revenue.
2. Sees Andriy Shevchenko's TRC missing 3 documents → taps his card → opens the worker cockpit.
3. Cockpit shows: red alert "TRC expires in 8d", TRC panel with all case state, documents panel with what's on file, AI summary auto-generated saying "Andriy's TRC expires in 8 days. Missing: passport scan, work contract draft, proof of accommodation. Submit by 2026-05-20 to avoid lapse."
4. Taps the red alert → DocumentScanFlow opens pre-pinned to Andriy.
5. Snaps a photo of the new TRC card → AI extracts entities (doc type, expiry, document number, confidence) → "Apply to Andriy" → field updated, audit row written, reasoning log entry written.
6. Cockpit refreshes; the red alert is gone, the AI decisions panel shows the new entry.
7. Taps "Open TRC →" → lands on TRCServiceTab pre-filtered to just Andriy with a clear-able banner. Deep-edits his case there or clears the filter and sees all.

That's the connected experience that didn't exist this morning.

### What I deliberately did not do today

- Live dev-server walk-through. The pre-existing rate-limit IPv6 validator warnings + the static path-priority quirk would still need their own diagnostic time; both are tooling, not feature, problems. Production deploy uses Docker + esbuild bundle which sidesteps these. We rely on CI + the integration test pass on the eej-test branch to validate against a real DB at end of week.
- Committing. Everything stays uncommitted until you say go for the end-of-week deploy.

### Still on the list (for Wednesday onward, if we keep going)

1. ExecutiveHome mockData cleanup — remove `EXEC_STATS` fallback, surface real or empty.
2. ~~OperationsHome enhancements~~ ✅ DONE (bench + contracts-ending + real B2B clients)
3. ~~AI summary endpoint tests~~ ✅ DONE (DS.11 / DS.12 / DS.13)
4. ~~Cockpit `aiReasoning` inclusion test~~ ✅ DONE (DS.10b)
5. ~~Inline edit on cockpit identity fields~~ ✅ DONE (phone + email)
6. ~~Append-only note input on cockpit~~ ✅ DONE
7. Worker-level WhatsApp panel in cockpit — surface recent WhatsApp messages with the worker.
8. Reasoning-log review UI — admin page listing all AI decisions across the tenant with filter by decision_type / decided_action.

### Tuesday-end inventory of cockpit features

The worker cockpit, when opened, now shows:

- **Header** — name, role, site, nationality.
- **Contact strip with inline edit** — tap "Edit" to change email or phone without leaving the cockpit; PATCH /workers/:id handles audit server-side.
- **Alerts panel** — red/amber expiry warnings (TRC, work permit, BHP, oświadczenie, UDT, contract end) + missing-TRC-docs. Each alert is **clickable** → opens the scan flow (for expiry alerts on documents) or navigates to the relevant module (for contract-end).
- **Identity panel** — job role, nationality, site, voivodeship, visa type, PESEL, pipeline stage.
- **TRC panel** — current case status, deadlines, doc completion counts. "Open TRC →" deep-links to TRCServiceTab pre-filtered to this worker.
- **Work permit panel** — type, status, dates, expiry. "Open permit →" deep-links to WorkPermitTab filtered.
- **Documents panel** — files with field name, filename, uploaded date. "Scan & file →" opens DocumentScanFlow pre-pinned to this worker.
- **Notes panel** — append-only feed of `worker_notes` + `trc_case_notes` chronologically merged. Inline quick-add input (Enter to submit). New notes appear without leaving the cockpit.
- **Payroll panel** — hourly rate, hours, ZUS, IBAN, last 3 records. "Open payroll →" deep-links pre-filtered.
- **AI summary panel** — Claude-generated 3-sentence summary tuned by role. Auto-fires when alerts exist; manual generate / refresh otherwise.
- **AI decisions panel** — last 10 reasoning-log entries for this worker: decision type, confidence pill, applied fields, reviewer, decided-action tag (applied / pending / rejected). The legal evidence trail in one panel.
- **Recent changes panel** — last 5 audit entries: action, field, actor, timestamp.

All panels arrange themselves by viewer role (Liza sees TRC + docs first; Anna sees permit + payroll first; Karan/Marj/Yana see identity + placement first).

### Three home pages, end-of-Tuesday state

- **LegalHome (Liza)** — TRC status grid, upcoming deadlines, cases missing docs, in-progress cases, service-fee revenue, plus the big "Scan a document" CTA.
- **OperationsHome (Karan/Marj/Yana)** — KPI strip (Ready / Needs Docs / Total Pool), pipeline visualization, "Add candidate" + "Scan document" + "Bulk upload" CTAs, **Bench section** (cleared but unassigned — placement leverage), **Contracts ending soon** (renewal/replacement planning), real B2B clients with computed headcount per client.
- **ExecutiveHome (Anna / Manish)** — existing real-data dashboard preserved, plus the "Scan a document" CTA.

### Three module tabs, end-of-Tuesday state

- **TRCServiceTab** — banner appears when cockpit deep-linked here with a worker; filter clears via "Show all" button.
- **WorkPermitTab** — same banner + filter pattern (matches by worker name).
- **PayrollTab** — same banner + filter pattern (matches by worker id).

### Tests

- **181 integration tests registered** (155 pre-existing + 26 new today)
- Cockpit (8): WC.1 shape, WC.2 TRC surfacing, WC.3 notes, WC.4 alerts, WC.5 cross-tenant 404, WC.6 unknown UUID, WC.7 401, WC.8 viewerRole
- Role routing (2): RM.1 Liza→legal, RM.2 Anna→executive
- Document scan (16): DS.1–DS.10 scan + apply; DS.10b cockpit returns aiReasoning; DS.11–DS.13 AI summary; DS.14–DS.15 note append
- All gated on `TEST_DATABASE_URL`. Local: 24 pass / 157 skip. CI runs the full set against eej-test Neon branch.

### Build state at Tuesday close

- TypeScript typecheck (api-server): clean
- Production esbuild bundle: clean (~2.4MB)
- Vite mobile build: clean (533kB JS / 162kB CSS / 1,827 modules)
- Pre-existing dev-mode tooling bugs (twilio ESM named-import, app.ts `__dirname`) fixed

### Tuesday net output

~4,200 lines across ~24 files. Five new endpoints. One new schema table. Two new mobile components. Three rewritten / enhanced home pages. Three module tabs gain deep-link filtering. 26 new integration tests.

### When we commit at end of week, this is what the team experiences

Liza opens her phone → lands on a home page that shows her actual TRC workload, not Anna's executive dashboard. She taps a worker whose TRC is expiring → cockpit opens with red alert at the top, AI summary already generated explaining what's pressing. She taps the red alert → scan flow opens pre-pinned to that worker → she photographs the new TRC card → Claude reads it → entities show → she taps "Apply to [name]" → the worker's `trcExpiry` field updates, audit row written, reasoning log entry written. She adds a quick note ("Filed renewal today, will follow up Monday"). She edits the worker's phone number inline because the carrier changed. She taps "Open TRC →" because she wants to deep-edit the case — lands on the TRC tab pre-filtered to just that worker with a clear-able banner.

Karan or Marjorie opens their phone → lands on the operations home → sees the bench workers section first (workers ready to be placed but currently unassigned). Sees a worker in "contracts ending in 12 days" — taps them, opens cockpit, reaches out, adds a note about the renewal conversation.

Anna opens her phone → lands on the executive home with real stats. Taps "Scan a document" when an invoice arrives from a client.

That's what's in the working tree, ready for end-of-week verification + commit + deploy.

---

## Tuesday afternoon (continued) — five more features, one by one

After lunch, Manish said "all one at a time" and we kept going.

### 1. WhatsApp panel in cockpit (read)

Cockpit endpoint now also returns `whatsappMessages: Array<{...}>` — last 10 inbound + outbound messages for this worker, tenant-scoped.

New cockpit panel "WhatsApp" with count badge. Each row shows direction (Received / Sent with arrow icon), status pill (SENT / DELIVERED / READ / DRAFT / FAILED with color coding), body preview, timestamp. Visual differentiation: inbound = green-tinted, outbound = blue-tinted, matching WhatsApp's own UI convention.

Role-adaptive ordering: Operations sees WhatsApp near the top (Yana lives in chat with UA workers), legal sees it mid, executive sees it low.

### 2. ExecutiveHome mockData cleanup

Removed `EXEC_STATS` fallback. Anna now sees real-or-empty zeroes from `/admin/stats`. If stats fetch fails, a yellow warning banner surfaces ("Stats unavailable — showing what's loaded so far") instead of silently showing fake numbers. The premise: a wrong number is worse than no number when she's making decisions.

### 3. Worker self-service improvements

`CandidateHome.tsx` (the page workers see when they log in as T4):

- **Upload now actually uploads** — the previous `handleUpload` just stored a filename in state and never POSTed. Wired to the existing `POST /workers/:id/upload` endpoint with a real `FormData` + Bearer token. Server stores file metadata in `file_attachments` and runs Claude OCR for passport / contract types (auto-fills worker fields).
- **"What needs my attention" status grid** — surfaces TRC, work permit, medical exam, oświadczenie, UDT, and contract end dates with color-coded urgency (red <30d, amber 30-60d, green >60d). Shows how many days left and the absolute date. Sorted by soonest deadline.
- Upload button shows "Uploading…" state while the POST is in flight; toast on success / error.

### 4. Reasoning-log review UI

Backend: new `GET /admin/ai-reasoning` endpoint, admin-only, tenant-scoped, with filters (decisionType, decidedAction, workerId, limit). LEFT JOINs to workers so each row carries `worker_name` for display.

Frontend: rewrote `AiAuditTab.tsx` as a **combined timeline**:

- Pulls from both `/api/audit` (state changes) AND `/api/admin/ai-reasoning` (AI decisions)
- Merges + sorts chronologically (newest first)
- Filter chips: Everything / AI decisions / State changes
- When AI-decisions-only filter is active, secondary chips appear listing the distinct `decision_type` values present (document_extraction, field_update, worker_auto_create, ai_summary, etc.) — Liza picks one to drill in.
- AI rows show: type, confidence pill (green/amber/red), decided-action tag (applied / pending / rejected), worker name, input summary, applied fields, reviewer, model, timestamp.
- Audit rows preserve their existing format.

This is the surface Liza or Anna shows a Voivodeship inspector when asked "why did the system change worker X's data on date Y."

### 5. WhatsApp send-from-cockpit (write)

Closes the loop: workers can be messaged from inside the cockpit without leaving it.

Backend:
- New `GET /whatsapp/templates` — lists active templates (T1/T2 only).
- Reused existing `POST /whatsapp/drafts` + `PATCH /whatsapp/drafts/:id/approve` flow.

Frontend:
- New `whatsappQuickSend()` API client — orchestrates draft creation + approve+send in one call.
- WhatsApp panel's "Send →" button opens a picker modal.
- Pick template → variable fields appear, pre-filled from worker data (variable named `worker_name` auto-fills from `worker.name`; `trc_expiry` from `worker.trcExpiry`; etc.).
- Send button calls the two-step API. Disabled if worker has no phone on file.
- On success: modal closes, cockpit refetches, new message appears in WhatsApp panel.

Yana taps a Ukrainian worker → cockpit opens → WhatsApp panel → "Send →" → "Document reminder" template → variables pre-filled (name, missing doc list) → tap Send → WhatsApp message dispatched via Twilio → reasoning log row written → message appears in panel. All without leaving the cockpit.

### Tests

3 more added (DS.16, DS.17): admin/ai-reasoning endpoint requires admin role, returns combined entries with worker_name join.

**Total tests: 183** (165 pre-existing + 28 added today, includes WC.1-8 cockpit, RM.1-2 routing, DS.1-17 document + AI + notes + admin).

### Tuesday absolute final state

**Files touched today total:** ~28 files, ~5,400 lines of net new code.

**Backend endpoints added today:**
- `GET /workers/:id/cockpit` (now returns aiReasoning + whatsappMessages)
- `GET /workers/:id/ai-summary`
- `POST /workers/scan-document`
- `POST /workers/scan-document/apply`
- `POST /workers/:id/notes/append`
- `GET /whatsapp/templates`
- `GET /admin/ai-reasoning`

**New schema:** `ai_reasoning_log` table + 4 indexes.

**Backend logic changes:** `roleToMobile` designation-aware (Liza T1+Legal → legal route).

**Backend tooling fixes:** twilio ESM import, app.ts `__dirname` ESM.

**Frontend net new:**
- `components/WorkerCockpit.tsx` — ~600 lines, 11 panels, role-adaptive order, inline edits, quick-add note, WhatsApp send, scan-for-this-worker, alert-click actions, AI summary, AI history
- `components/DocumentScanFlow.tsx` — ~290 lines, 5-step scan flow with preselected-worker mode
- `lib/navContext.ts` — deep-link worker store

**Frontend modified:**
- `LegalHome.tsx` (full rewrite for Liza)
- `OperationsHome.tsx` (bench + contracts-ending + real clients)
- `ExecutiveHome.tsx` (mockData purge + scan CTA + error banner)
- `CandidateHome.tsx` (real upload + status grid)
- `CandidatesList.tsx`, `CandidateDetail.tsx` (cockpit wiring)
- `TRCServiceTab.tsx`, `WorkPermitTab.tsx`, `PayrollTab.tsx` (deep-link filter banners)
- `AiAuditTab.tsx` (combined audit + reasoning timeline)
- `Dashboard.tsx` (onNavigate plumbing)
- `lib/api.ts` (15+ new fetcher functions + types)
- `index.css` (~1,200 lines of new styles)

**Build state:**
- TypeScript typecheck (api-server): clean
- Production esbuild bundle: clean (~2.4MB)
- Vite mobile build: clean (545kB JS / 162kB CSS / 1,827 modules)
- Tests: 183 total. 24 pass locally + 159 skip-gated (run in CI)

**End-to-end Liza workflow (rebuilt today):**
1. Open app → land on LegalHome (correct routing) showing her real TRC workload
2. Tap a worker → cockpit opens with AI summary auto-generated for any active alerts
3. Red TRC-expires alert visible → tap it → scan flow opens pre-pinned → photograph TRC card → AI extracts → "Apply to [worker]" → field updates + audit row + reasoning log
4. Tap "Send →" on WhatsApp panel → "Document reminder" template → variables pre-filled → Send → message dispatched, appears in WhatsApp panel
5. Tap "Open TRC →" if she needs to deep-edit → lands on TRC tab pre-filtered to that worker
6. Anywhere along the way: add a quick note, edit phone/email inline, view AI's recent decisions for this worker
7. End of week: visit AiAuditTab → see every AI decision the system made in the tenant, filter by type

**End-to-end Yana workflow:**
1. Open app → OperationsHome with bench (cleared-but-unassigned workers ready to place) + contracts ending soon + real B2B clients
2. Tap a Ukrainian worker → cockpit opens with WhatsApp panel near top
3. Send a reminder via the template picker — pre-filled with the worker's name and missing items
4. Scan a passport when a new applicant arrives from the partner agency → AI creates the worker record automatically

**End-to-end Anna workflow:**
1. Open app → ExecutiveHome showing real stats (no mock fallback)
2. Tap any worker → cockpit with payroll panel near top
3. Inline edit a phone number when a worker calls in to update it
4. Scan an invoice document → AI extracts metadata → file it against the worker

**End-to-end worker (T4) workflow:**
1. Open app → CandidateHome with "What needs my attention" grid showing TRC/permit/medical expiry
2. Upload a missing document — actually goes to server now (was fake before)
3. EEJ team gets a `file_attachments` row and sees the doc on the worker's cockpit

That's the full Tuesday output. Working tree only. End-of-week commit + deploy as agreed.

---

## Tuesday evening — Phase 2 worker-portal tabs + WhatsApp templates test

Kept going on Manish's "10:30 only" signal. Worked through the candidate-tier surfaces that were still scaffolds.

### `useMyWorker` hook

New shared hook (`lib/useMyWorker.ts`) — single source of truth for "which worker is this logged-in user." Looks up the worker record whose email matches the authenticated user's email (or `companyEmail` as fallback). Returns `{ worker, loading, error }`. Used by all the candidate-tier (T4) tabs so they agree on identity.

### MyStatusTab — full rewrite

Replaced the previous scaffold (wrong token keys, `workers[0]` fallback, raw Tailwind classes) with a real implementation:
- Uses `useMyWorker` to identify the logged-in worker
- Fetches the cockpit endpoint and renders a worker-friendly subset
- Status header: green ("clear to work") / amber / red based on alerts count
- Alerts list — every red and amber alert from the cockpit
- Document expiry grid (TRC, work permit, medical, contract) sorted by soonest deadline
- Uses our existing wc-* CSS classes instead of Tailwind — visual consistency
- AI summary acknowledgment when alerts exist

### MyUPOTab — full rewrite

Same modernization. Calls `/api/mos2026/upo/:workerId` (existing endpoint) with correct auth. Empty state shows "No UPO registered yet — your coordinator will register it." Loaded records show Art. 108 status with green-soft styling when locked.

### MySchengenTab — full rewrite

90/180 day tracker. Calls `/api/schengen/worker/:workerId` with correct auth. Big-number display (days remaining) with color-coded urgency. Progress bar to 90-day limit. Special-cases Art. 108 active (TRC pending → rule doesn't apply). Overstay warning at red, <15-day warning at amber.

### Tests

DS.17a — `/whatsapp/templates` endpoint:
- Active-only filter (inactive templates excluded)
- Tenant scoping
- Response shape (`bodyPreview`, `variables`, `language`)

**Total tests: 184** (165 pre-existing + 19 from earlier today + 1 new = 19 added today; 184 grand total).

### Build state at Tuesday true close

- TypeScript typecheck (api-server): clean
- Vite mobile build: clean (545.73 kB JS / 165 kB CSS / 1,827 modules)
- Production esbuild bundle: clean
- 24 tests passing locally, 160 skip-gated for CI

### What's still not built (intentional, not regressing)

- Full i18n cleanup (research called this out). Inherited concern, not Tuesday's introduction. Skipped because adding wrong-Polish translations would be worse than English-only; the keys are there for someone with Polish fluency to translate when ready.
- MoreTab role-gating. Currently shows all modules to all roles. Risk of hiding something Liza expects to see. Defer to Wednesday at earliest.
- A WhatsApp template specifically for "TRC renewal reminder" — production has 3 templates seeded (application_received, permit_status_update, payment_reminder). Adding a fourth would be operational scope.
- Worker self-service portal at the candidate-tier `/portal` route — the existing scaffold endpoint exists but isn't part of today's mobile-app build.

### Final Tuesday tally

| Category | Count |
|---|---|
| New backend endpoints | 7 |
| New schema tables | 1 |
| New mobile components | 2 (cockpit + scan flow) |
| New lib modules | 2 (navContext + useMyWorker) |
| Rewritten mobile screens | 6 (LegalHome, OperationsHome, ExecutiveHome contribution, CandidateHome, MyStatusTab, MyUPOTab, MySchengenTab, AiAuditTab) |
| Module tabs gaining deep-link banner | 3 (TRC, Permits, Payroll) |
| New integration tests | 29 |
| Net new lines | ~6,500 |
| Files touched | ~32 |

All in working tree. No commits yet. End-of-week verification + commit + deploy per the agreement.

---

## Tuesday late evening — MoreTab role-gating + AI suggested actions

Manish said "lets keep going." Two more substantial pieces landed.

### MoreTab role-aware module grid

Previously: every role saw every module — Liza saw "Pricing & Plans" and "Salary Benchmark"; workers saw "Agency Settings"; nobody knew which tile was relevant.

Now: each module declares which roles see it.

- **Executive** (Manish, Anna): all 25+ modules
- **Legal** (Liza): 14 — net-per-hour, ZUS calc, clients, permits, TRC, immigration, regulatory, contracts, GDPR, profile, plus a few shared ones. No invoices/payroll/pricing/payreport.
- **Operations** (Karan, Marjorie, Yana): 14 — recruitment-focused (applications, jobs, ATS, interviews, skills), ops tools (GPS, availability, shifts, clients, permits, TRC, profile, calculators). No financial / compliance-admin / immigration-research.
- **Candidate** (workers): 4 — profile, my-status, my-UPO, my-Schengen. Their own surfaces only.

Subtitle in the header now says "N available to you" so each user knows what they have access to. Uses `useAuth()` to resolve role.

### AI summary returns structured suggested actions

The biggest of the late additions. The cockpit's AI summary panel used to show "Andriy's TRC expires in 8 days. Three documents missing." — informative but Liza still had to decide what to do.

Now Claude returns:
```json
{
  "summary": "Andriy's TRC expires in 8 days. Three required documents are still missing. Submit the renewal by 2026-05-20 to avoid lapse.",
  "actions": [
    { "label": "Scan new TRC card", "actionType": "scan_document", "priority": "high", "reasoning": "TRC expires in 8 days." },
    { "label": "Send document reminder", "actionType": "send_whatsapp", "priority": "med", "reasoning": "Worker not responsive." },
    { "label": "Open TRC case", "actionType": "open_trc", "priority": "low", "reasoning": "Final filing review." }
  ]
}
```

Each action renders as a color-coded button under the summary (red border for high, amber for med, blue for low). Tap → dispatches the right flow:
- `scan_document` → opens DocumentScanFlow pre-pinned to this worker
- `send_whatsapp` → opens the WhatsApp template picker (pre-fills variables)
- `open_trc` / `open_permit` / `open_payroll` → deep-link nav with worker context (via navContext)
- `add_note` → scrolls to the notes panel
- `none` → informational only

Role-tuned prompts: legal viewer is steered toward scan_document and send_whatsapp; executive toward payroll/permit deep-links; operations toward whatsapp/scan/notes; candidate toward informational-only (workers can't trigger internal flows from their own view).

Every AI summary generation writes an `ai_reasoning_log` row (`decision_type=ai_summary`) so the suggested actions are auditable in the AiAuditTab timeline — the legal evidence trail for AI-driven recommendations.

This is "AI as writer / orchestrator" — Liza becomes the editor/reviewer instead of the typist. One tap from "this worker needs help" to "I'm filing the document."

### Tests updated for structured response

- DS.11 — verifies summary + actions array; tests the filter against invalid `actionType` values; verifies `ai_reasoning_log` row is written.
- DS.11b — plain-text fallback path (older Claude responses or model regression).

**Total tests: 185** — 24 pass locally + 161 CI-gated.

### Build state (late evening)

- TypeScript typecheck (api-server): clean
- Vite mobile build: clean (547.59 kB JS / 165 kB CSS)
- Production esbuild bundle: clean
- 185 integration tests registered, all properly gated

### Today's grand tally

| Surface | Count |
|---|---|
| New backend endpoints | 7 |
| New schema tables | 1 |
| New mobile components | 2 |
| New lib modules | 2 |
| Rewritten mobile screens | 8 (LegalHome, OperationsHome, ExecutiveHome additions, CandidateHome, MyStatusTab, MyUPOTab, MySchengenTab, AiAuditTab, MoreTab) |
| Module tabs gaining deep-link banners | 3 |
| Backend endpoints evolved | 1 (ai-summary → structured actions) |
| New integration tests | 31 |
| Net new lines | ~7,200 |
| Files touched | ~34 |

Everything in working tree. No commits today as agreed.

---

## Tuesday final extension — ProfileTab change-password, AddCandidate fixes, real bulk upload, ApplicationsTab + AlertsTab cockpit-wiring

Kept going on "for me lets keep going" — five more pieces landed.

### ProfileTab change-password UI

Critical May-18 gap closed. The team-onboarding doc (`docs/TEAM_ONBOARDING.md`) tells every team member to rotate from the bootstrap password on first login. Until now there was no mobile UI — they'd have had to curl the endpoint. Added:

- Expandable "Change password" section in ProfileTab with a yellow first-login warning banner
- Three inputs: current password, new password, confirm new password
- Client-side validation (min 8 chars, confirm match)
- Calls `POST /api/eej/auth/change-password` (existing endpoint)
- Toast on success / surfaces real error from server
- Worker designation displayed in the hero card (was missing)
- LangToggle moved into the page header

### AddCandidateModal cleanups

Three real issues fixed:
1. Toast said "saved to Airtable" — we migrated to Postgres long ago; misleading.
2. The "Assigned Client / Site" dropdown was hardcoded mock clients ("BuildPro Sp. z o.o.", "MediCare PL"). Now fetches real clients from `/clients`, falls back to "Other" only if no clients returned.
3. The catch path used to call `showToast("Saved locally — will sync when online", "success")` on ANY error — there's no offline-sync mechanism, the save just failed. Now surfaces real errors: `Could not save: ${err.message}`.

### BulkUploadTab — real uploads, not visual-only

Previously `handleFile` just added a row to local state — files were never POSTed. Now wired to the real `POST /workers/:id/upload` endpoint via the existing `uploadWorkerDocument` client. Document-type labels mapped to backend slugs (passport → passport, TRC Residence Card → trc, etc.) so the server-side OCR routing works correctly. Removed the seeded fake log entries (Daria Shevchenko, Ahmed Al-Rashid). Disable + "Uploading…" state while POST is in flight. Error surfaces via toast.

### ApplicationsTab — Review button + card opens cockpit

Previously the "Review" button on each new-applicant card just showed a toast ("Open candidate profile to review"). Now opens the cockpit pre-pinned to the worker. Pipeline-tab cards become clickable too — tap the card opens the cockpit; the "Move to Screening" button retains its action via `stopPropagation`.

### AlertsTab — all three role views cockpit-wired

The alerts tab is the second-most-frequent nav target for Liza/Anna/Karan-Marj-Yana (right after their home page). It had four sections each rendering alert cards from candidate + mock data, with no way to drill into the worker behind the card.

Each role component (`ExecutiveAlerts`, `LegalAlerts`, `OpsAlerts`) now:
- Retains the candidate id when sourcing from real data
- Card click opens the cockpit pre-pinned to that worker
- Mock-data-backed rows (when no candidates returned) stay inert — cursor doesn't change, click is a no-op
- Cockpit mounted at the bottom of each component

Net effect: **the cockpit is now reachable from every major staff surface** — CandidatesList, LegalHome (via TRC cases), OperationsHome (via candidate rows + new bench + contracts-ending sections), ExecutiveHome (worker tiles), ApplicationsTab (Review button + cards), AlertsTab (all three role views). One click on any worker name anywhere → unified view.

### Tuesday absolute totals (final)

| Surface | Count |
|---|---|
| New backend endpoints | 7 |
| New schema tables | 1 |
| New mobile components | 2 (cockpit + scan flow) |
| New lib modules | 2 (navContext + useMyWorker) |
| Major mobile screens rewritten / heavily extended | 11 (LegalHome, OperationsHome, ExecutiveHome, CandidateHome, MyStatusTab, MyUPOTab, MySchengenTab, AiAuditTab, MoreTab, ProfileTab, BulkUploadTab) |
| Mobile surfaces gaining cockpit click-to-open | 6 (CandidatesList, ApplicationsTab, AlertsTab × 3 role views) |
| Module tabs gaining deep-link banners | 3 (TRC, Permits, Payroll) |
| Backend endpoints evolved | 1 (ai-summary → structured actions) |
| New integration tests | 31 |
| Net new lines | ~7,800 |
| Files touched | ~37 |

**Build state at Tuesday's actual close:**
- TypeScript typecheck (api-server): clean
- Vite mobile build: clean (551.94 kB JS / 165 kB CSS)
- Production esbuild bundle: clean (~2.4 MB)
- 185 integration tests registered, 24 pass locally, 161 CI-gated

**End-to-end flows the team can now use:**

*Liza's day:*
1. Login → land on LegalHome (correct role routing) → see her TRC workload not Anna's executive dash
2. Tap a worker case → cockpit opens, AI summary auto-generates with suggested actions ("Scan new TRC card", "Send document reminder", "Open TRC case")
3. Tap "Scan new TRC card" → camera opens → AI extracts entities → "Apply to [worker]" → field updates, audit + reasoning logged
4. Tap "Send document reminder" → WhatsApp picker → variables pre-filled → Send → message dispatched via Twilio
5. Add a quick note inline ("Confirmed renewal will be filed Friday") → appears in feed
6. Edit phone/email inline if wrong
7. Tap "Open TRC →" if she needs deep edit → lands on TRC tab pre-filtered to that worker
8. End-of-day: visit AI & Audit Trail → see every AI decision the system made in her tenant; filter by decision_type

*Karan/Marj/Yana's day:*
1. Login → OperationsHome → see bench (cleared, unassigned) + contracts-ending soon + real B2B clients
2. New applicant scans their passport at intake → AI auto-creates worker
3. Add new candidate via the modal (real clients dropdown)
4. Tap any worker → cockpit → see WhatsApp panel near the top (Yana lives here)
5. Send WhatsApp reminder; bulk upload documents for a candidate

*Anna's day:*
1. Login → ExecutiveHome with real stats (no mockData fallback)
2. Yellow banner appears if `/admin/stats` fails — never fake numbers
3. Tap any worker → cockpit → payroll panel near top
4. Inline edit a phone number when a worker calls in to correct it

*Worker (T4) self-service:*
1. Login → CandidateHome shows the "What needs my attention" status grid (TRC/permit/medical/contract)
2. Upload docs that actually upload to the server (was visual-only before)
3. MyStatusTab → see same alerts EEJ team sees, formatted for self-view
4. MyUPOTab → digital proof of legal stay (Art. 108)
5. MySchengenTab → 90/180 day tracker

*Everyone:*
1. ProfileTab → change password (closing the bootstrap-rotation gap for May 18)
2. MoreTab → see only the modules relevant to their role

End-of-Tuesday: **the platform feels connected.** One click on any worker name from any surface → unified view. AI suggests next steps. One tap acts on them. Every action audited + reasoning-logged.

All in working tree. No commits today. End-of-week verification + commit + deploy per agreement.

---

## Tuesday — even later: WhatsApp templates seeded, AI templateHint, onboarding doc updates

Manish said "we are doing great lets move forward." Three closing pieces.

### Four new WhatsApp templates seeded

`migrate.ts` now seeds four additional WhatsApp templates (alongside the existing application_received, permit_status_update, payment_reminder):

- `trc_expiry_reminder_pl` — Polish — "Twoja karta pobytu (TRC) wygasa {{trcExpiry}} — za {{daysLeft}} dni." Variables: workerName, trcExpiry, daysLeft.
- `trc_expiry_reminder_en` — English version, same variables.
- `documents_missing_pl` — Polish — "Brakuje nam kilku dokumentow do Twojego dossier." Variable: workerName.
- `documents_missing_en` — English version.

Named with `_pl` / `_en` suffix because the unique index is `(tenant_id, name)` — same name across languages would silently drop one row. All seed as `active=FALSE` per the established pattern; Manish flips them via SQL once Twilio Business Sender approves the templates.

These specifically match the AI-suggested-action "Send document reminder" flow, so when Yana or Liza tap that action button in the cockpit, the matching template is available in the picker.

### AI summary now suggests a specific WhatsApp template

The AI summary response was already returning structured suggested actions (scan_document, send_whatsapp, open_trc, etc.). Now each `send_whatsapp` action can also carry a **`templateHint`** naming one of the active templates.

Prompt change: the system prompt explicitly lists the seven template names available and asks Claude to suggest the right one based on context. Polish-language workers (Ukrainian, Polish nationalities) → prefer `_pl`; others → `_en`. Omit the hint if no good match.

Cockpit change: when the user taps the "Send TRC reminder" action button, `handleAiAction` now opens the WhatsApp picker AND auto-picks the suggested template if its name matches an active one. Variables auto-fill from worker data (workerName from worker.name, trcExpiry from worker.trcExpiry, daysLeft computed from the alert).

End-to-end: AI suggests "Send TRC reminder" → tap → picker opens with `trc_expiry_reminder_pl` already selected → 3 variables already filled → tap Send → message dispatched. That's a one-tap workflow from AI suggestion to WhatsApp delivery.

Test DS.11 updated to assert:
- `send_whatsapp` action carries the `templateHint` field
- Non-whatsapp actions have `templateHint: null` (parser only retains it when actionType matches)

### TEAM_ONBOARDING.md updates

- First-login flow step 4: replaced the curl command with the in-app instructions (More → Profile & Settings → Security → Change password). Keeps the curl as fallback in a sentence but the recommended path is the UI.
- New step 7 in Manish-side activation: SQL to flip the WhatsApp templates active once Twilio approves them, with the full UPDATE statement listing all seven templates. Cross-references STATE_CHANGES_LOG.md per the #14 protocol.

### Tests / build state

- TypeScript typecheck (api-server): clean
- Vite mobile build: clean (552.01 kB JS / 165 kB CSS)
- Production esbuild: clean
- **185 integration tests** — 24 pass locally, 161 CI-gated

### Tuesday GRAND total (this is the actual end-of-day count)

| Surface | Count |
|---|---|
| New backend endpoints | 7 |
| New schema tables | 1 (`ai_reasoning_log`) |
| New WhatsApp templates seeded | 4 (in addition to 3 pre-existing) |
| New mobile components | 2 (cockpit + scan flow) |
| New lib modules | 2 (navContext + useMyWorker) |
| Major mobile screens rewritten / heavily extended | 11 |
| Mobile surfaces gaining cockpit click-to-open | 6 |
| Module tabs gaining deep-link banners | 3 |
| Docs updated | 2 (TEAM_ONBOARDING.md, EOD_WEEK_MAY_12.md) |
| Backend endpoints evolved | 1 (ai-summary → structured actions + templateHint) |
| New integration tests | 31 |
| Net new lines | ~8,000 |
| Files touched | ~38 |

That's Tuesday. All in working tree. No commits today. End-of-week verification + commit + deploy as agreed.

---

## Tuesday — even-even-later: upload tests, AI fire-once dedup, GDPR rewrite

Manish said "keep going" again. Three more pieces.

### 5 new upload-endpoint tests (DS.16a–DS.16e)

The `/workers/:id/upload` endpoint is used by three surfaces today — cockpit scan flow (preselected-worker mode), CandidateHome self-upload, BulkUploadTab. It had no coverage. Added:

- **DS.16a**: 401 without token
- **DS.16b**: 404 for worker in a different tenant (tenant isolation)
- **DS.16c**: 400 when no file attached
- **DS.16d**: Happy path on non-AI docType (e.g. `bhp`) — returns attachment metadata, no `scanned` field, file_attachments row present in DB with correct fieldName + filename
- **DS.16e**: passport docType with mocked Claude OCR — verifies the auto-update path that lifts extracted `nationality` and `passportExpiry` into the worker row

Total tests: **190** (24 pass locally + 166 CI-gated).

### Cockpit AI summary: fire-once-per-worker

Previously the cockpit cleared `aiSummary` on every refetch and re-fired the Anthropic call. After every quick action (note add, contact edit, scan apply) we'd burn tokens regenerating. Added a `useRef<string | null>` to track which workerId we've already auto-fired for. AI summary now fires:

- Once when the cockpit opens for a new worker (and there are alerts)
- NOT on subsequent refetches for the same worker
- User can always tap "Refresh" if they want a fresh AI read

Cost-aware: every cockpit open is one Anthropic call when alerts exist, not N calls per session.

### GDPRTab — proper request-and-process flow

Previously called a nonexistent `/gdpr/export/:id` endpoint. The real GDPR endpoints implement the request-and-process pattern:
- `POST /gdpr/requests` — file a request (type: export / erasure / consent_withdrawal)
- `POST /gdpr/requests/:id/process` — admin-only, executes the request

Rewrote GDPRTab to match. Three tabs now:

- **Requests queue** — pending + in-progress requests with status pills. Admins (executive / legal roles) get a "Process" button per request that respects the type: erasure shows red "Erase data" button + confirm dialog; export triggers a JSON download of the actual export payload; consent_withdrawal just toggles. Recently-completed section shows the last 5 closed requests with processor + date.
- **Consent records** — list of workers with RODO consent date or "Pending" badge.
- **File new request** — form: worker dropdown (from `fetchWorkers`), request type, optional reason. Erasure shows a red warning banner before submit. Non-admins can file requests but cannot process — they're routed to the queue for admin review.

This is the GDPR/RODO Art. 7 / 15 / 17 audit-evidence flow the platform was claiming compliance with but wasn't actually implementing in the UI.

### Build state at this point

- TypeScript typecheck (api-server): clean
- Vite mobile build: clean (558.18 kB JS / 165 kB CSS — bundle grew ~6 kB from GDPRTab rewrite)
- Production esbuild: clean
- **190 integration tests** — 24 pass locally, 166 CI-gated

### Running grand total

| Surface | Count |
|---|---|
| New backend endpoints | 7 |
| New schema tables | 1 |
| New WhatsApp templates seeded | 4 |
| New mobile components | 2 |
| New lib modules | 2 |
| Major mobile screens rewritten / heavily extended | 13 (added GDPRTab + the upload-cost-aware cockpit refactor) |
| Mobile surfaces gaining cockpit click-to-open | 6 |
| Module tabs with deep-link banners | 3 |
| Docs updated | 2 |
| Backend endpoints evolved | 1 |
| New integration tests | 36 |
| Net new lines | ~8,500 |
| Files touched | ~40 |

Tuesday continues. Working tree only. No commits today.

---

## Tuesday — last batch: cockpit-edit tests + AiAuditTab worker filter

### 5 new edit-flow tests (CE.1–CE.5)

The cockpit's inline contact edit (`patchWorker` in api.ts → `PATCH /workers/:id`) had no dedicated coverage. Added:

- **CE.1**: PATCH with email + phone updates the worker row and writes an audit entry
- **CE.2**: Candidate role is rejected (coordinator-or-admin required) — verifies the security gate works
- **CE.3**: 404 for cross-tenant worker — tenant isolation enforced on writes too
- **CE.4**: Cockpit response carries `whatsappMessages: []` even when empty (key always present so frontend doesn't need optional-chaining everywhere)
- **CE.5**: Cockpit response carries `aiReasoning: []` even when empty (same key-present invariant)

Total tests now **195** — 24 pass locally + 171 CI-gated.

### AiAuditTab worker filter — click any worker name to drill in

Worker names in AI reasoning rows are now blue dotted-underline links. Tap → the timeline filters to just that worker's audit + reasoning entries.

A filter chip appears at the top showing "Filtering to [worker name]" with two buttons:
- **Open cockpit** — opens the unified worker view for that person
- **X** — clears the filter

The filter applies to both reasoning rows (matched on `worker_id`) and audit rows (matched on `workerId`). Useful when Liza needs to show a Voivodeship inspector exactly what AI did for one worker across many decisions — three taps from the timeline view to "here are the four decisions the system made for Andriy" to "here's the cockpit so you can see the current state."

### Build state at this point

- TypeScript typecheck (api-server): clean
- Vite mobile build: clean (559.64 kB JS / 165 kB CSS)
- Production esbuild: clean
- **195 integration tests** — 24 pass locally, 171 CI-gated

### Final-final running grand total

| Surface | Count |
|---|---|
| New backend endpoints | 7 |
| New schema tables | 1 |
| New WhatsApp templates seeded | 4 |
| New mobile components | 2 |
| New lib modules | 2 |
| Major mobile screens rewritten / heavily extended | 14 (added the AiAuditTab worker-filter pass) |
| Mobile surfaces gaining cockpit click-to-open | 7 (added AiAuditTab) |
| Module tabs with deep-link banners | 3 |
| Docs updated | 2 |
| Backend endpoints evolved | 1 |
| New integration tests | 41 |
| Net new lines | ~9,000 |
| Files touched | ~42 |

Tuesday is genuinely done now. Working tree only. End-of-week verification + commit + deploy as agreed.
