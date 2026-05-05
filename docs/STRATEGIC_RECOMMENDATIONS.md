# EEJ BUILD — Strategic Recommendations from EEJ Claude

**Authored:** 2026-05-05 (Q&A mode, post-bilingual-architecture-audit close)
**Authored by:** EEJ Claude (the engine)
**For:** chat-Claude (to derive subsequent save-prompts) + Manish (direct reading without translation)
**Status:** Working draft; untracked at first authoring; promoted to committed reference if Manish authorizes.

---

## Purpose

This document captures EEJ Claude's honest read on the EEJ build. It mirrors the structure of `Apatris-Compliance-Hub/artifacts/api-server/docs/STRATEGIC_RECOMMENDATIONS.md` (commit 2026-05-02) so the two platforms can be reasoned about side-by-side, but the contents are EEJ-specific. The lens is the same as APATRIS's BUILD_INTEGRITY_AUDIT applied retrospectively to EEJ: silent-failure catches, schema-vs-query drift, hardcoded fallbacks, untested features, staging absence, commit-message-vs-reality.

Six tracks: 1–3 are remediation; 4 is audit continuation; 5 is process discipline; 6 is operating posture. The mission framing and the eleven hard boundaries from APATRIS's Track 6 carry over verbatim because they govern operating practice across both platforms.

---

## What EEJ does, who uses it, what workflow it serves

EEJ is a Polish staffing agency (`agencja pracy tymczasowej`) operating under Ustawa o zatrudnianiu pracowników tymczasowych. Approximately 70 active foreign welders are placed at three named user-employers (Tekra, Izotechnik, Gaztech). The workforce is predominantly Ukrainian, Belarusian, Vietnamese, and Filipino on `umowa zlecenie` civil-law contracts plus oświadczenie or work permits.

Daily users:
- **Anna B (T1 executive, anna.b@edu-jobs.eu).** Owner-operator. Uses the dashboard's "Anna B's one screen" UX (T1 ExecutiveHome) to see compliance state, regulatory updates, recruitment pipeline, and pending alerts.
- **T2 legal, T3 operations.** Coordinator-tier users who triage workers, schedule interviews, run permit applications.
- **T4 candidates.** Workers themselves, via the mobile app — view document expiries, submit hours, upload documents, see legal status.

Workflow EEJ serves: end-to-end lifecycle from candidate intake through placement, contract generation, payroll, regulatory tracking, and worker self-service. The recruitment pipeline (8-stage Kanban: New → Screening → Interview → Offer → Placed → Active → Released → Blacklisted) is the operational spine. Compliance gates (BHP, medical, work-authorization, 18/36-month assignment limits, voivode notifications) sit underneath every stage transition.

---

## What's been built across the build days

**Stage 4 hardening (Apr 17–18, v85–v92):** tenant isolation at FK level, PII encryption (PESEL/IBAN AES-256-GCM via `enc:v1:` prefix), TIMESTAMPTZ uniformity across 68 columns, audit immutability, rate-limiter trust-proxy fix.

**Step 1 (Apr 17, within Stage 4):** T1 Executive dashboard — `/admin/stats` aggregator + mobile `ExecutiveHome.tsx` for owner-operator view.

**Step 2 (Apr 17, commit `adf1451`):** CRM module — `clients.stage` enum (LEAD/NEGOTIATING/SIGNED/STALE/LOST), `client_activities` log, `client_deals` with dual-currency PLN/EUR.

**Step 3 (Apr 27, v97–v99, four sub-phases across ~16 commits):** WhatsApp draft queue + templates + inbound webhook + approve/send + dashboard counters + audit. Includes `whatsapp_messages` and `whatsapp_templates` tables, drafter service with feature flag, Twilio signature verification, full PATCH/approve flow.

**Gap 4 (Apr 28, v100, commit `8c4d819`):** `placement_type` classifier on workers (agency_leased / direct_outsourcing) with CHECK constraint, behavioral gating on Art. 20 18/36-month limits and Art. 14a retention, eej_assignments.art_20_enforced runtime column, integration tests.

**Stage 4.5 (Apr 29 morning, v101, commit `1ab4b16`):** `tenant_id` added to `job_postings` + `job_applications` with FK to `tenants(slug)`, indexes, defensive backfill. Brought recruitment/ATS surface under the Stage 4 tenant-isolation regime.

**Auth-gating closure (Apr 29 afternoon, v102, commit `d33456f`):** `GET /api/jobs/:id` middleware + tenant scoping + PII projection + tenantId stripping. Closes audit Rank 3 priority and Phase 3 §4(a) Q8 commitment. Moves `projectWorkerPII` to `lib/encryption.ts` as single source of truth.

**D2 placementType editable (Apr 30, v103, commit `ee26b34`):** Mobile WorkerProfileSheet now exposes the placementType dropdown in the Contract section. Backend already wired since Gap 4 Task B; this closes the UI gap.

**§4(a) regulatory documentation (across multiple commits):**
- `docs/EEJ-APATRIS-CONSOLIDATION-AUDIT.md` v2 at `9be0faa` (cross-platform audit, 622 lines)
- `docs/EEJ_AGENCY_REGULATORY_FRAMEWORK.md` at `014bea2` (33 encoded compliance constraints catalogued + 5+5 gap list)
- `docs/EU_AI_ACT_ANNEX_III_4A_RECRUITMENT_RESEARCH_SCOPE.md` at `305eb08` (Phase 1 scope)
- `docs/EU_AI_ACT_ANNEX_III_4A_PHASE_2_RESEARCH.md` at `ce0364c` (Phase 2 research, 1,014 lines, 13 counsel questions)
- `docs/EU_AI_ACT_ANNEX_III_4A_COUNSEL_HANDOFF.md` at `325baa1` (Phase 3 counsel-ready handoff, 531 lines)

**Schema:** 22 tables on PostgreSQL via Drizzle ORM. 33 encoded compliance constraints across `agency-protection.ts` (625 LOC), `agency-compliance-engine.ts` (695 LOC), `legal-decision-engine.ts`, `legal-intelligence.ts`, `legal-kb.service.ts`, `first-contact-verification.ts`, `docs/knowledge-hub/workflows/status-dashboard.ts`. ~1,700 lines of compliance encoding code.

**Routes:** 33 route files in `artifacts/api-server/src/routes/`. ~95+ endpoints.

**Frontend artifacts:** 2 active surfaces — the EEJ dashboard at `artifacts/apatris-dashboard/` (uses real `react-i18next`, 622 EN keys + 588 PL keys) and the mobile app at `eej-mobile-HIDDEN/` (custom context-based i18n with 67 hardcoded entries, no JSON files, **Polish translations rendered without diacritics**). The mobile app is the worker-facing surface and is structurally weaker than the dashboard.

**Integration tests:** 181 total in `integration.test.ts` (180 passed + 1 todo) at HEAD `ee26b34`. Coverage spans 12 of 33 route files. The tests pass against Path 2a Docker Postgres on warm runs; first-run on cold container has shown one transient failure that resolves on retry.

---

## What's not built yet that should be

**Recruitment / ATS gaps (regulatory framework inventory Section 5):**
- **Gap 1** — Article 8 ust. 1 prohibition list. No `prohibited_work_types` taxonomy. Agency-leased workers can be placed on legally prohibited work (height work, striking-worker replacement, recently-dismissed-staff replacement) without the system detecting it. 6–10 hours.
- **Gap 2** — position-specific permit binding under Art. 88 Ustawa o promocji zatrudnienia. EEJ stores `permit_type` and `permit_expiry` but not `permit_position` or `permit_user_employer`. Matching checks expiry only. A worker placed at a job whose position is outside the permit's scope is a 3,000–50,000 PLN per-worker fine. 8–14 hours.
- **Gap 3** — equal-pay parity under Art. 15 Temp Work Act + Art. 18³ᶜ Kodeks Pracy. No automated comparator-pay check. Most-litigated obligation under Polish staffing law. 10–18 hours.
- **Gap 5** — `jobRole` is free-text without controlled vocabulary or KZiS-code lookup. Precondition for Gap 2; affects matching reliability across the board. 12–20 hours.

**§4(a) architectural intervention (Phase 3 commitment, ~60–95 hours):**
- Sunset numeric `matchScore` in `routes/jobs.ts:127-165` and `:244-280`.
- Replace ApplicationsTab and ATSPipelineTab badges with neutral display.
- Stop writing `matchScore="0"` in public-application path at `routes/workers.ts:184`.
- Implement `matchReasons` as eligibility-checklist artifact.
- Draft Article 6(4) non-high-risk-assessment record.

**Mobile bilingual rewrite (per 2026-05-05 i18n audit):**
- Migrate from custom context to `react-i18next`.
- Extract 67 hardcoded entries to `eej-mobile-HIDDEN/src/locales/en.json` + `pl.json`.
- **Restore Polish diacritics** (every PL string is currently de-diacritized — "Wiecej", "Wystapil blad", "Haslo" — Polish workers reading their own language stripped of its letters).
- Flip default language from EN to PL (audit principle #16 violation; analogous to APATRIS workforce-app pre-Phase 6 Part 2b).
- Build shared LanguageToggle with `compact?: boolean` prop.
- Convert ~50 hardcoded `language === "en" ? ... : ...` ternaries in mobile pages to `t()` calls.
- 20–30 hours minimum.

**Operational activation pending (per `STEP3-FOLLOWUPS.md`):**
- `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID` not in Fly secrets list. Step 3 WhatsApp work shipped but webhook returns 503 fail-closed and outbound sends are gated. **The entire Step 3 feature is dormant in production despite four shipped sub-phases.**
- Twilio Messaging Service webhook URL configuration in Twilio console (manual ops step).
- Template `content_sid` provisioning per template (3 inactive seeds: `application_received`, `permit_status_update`, `payment_reminder`).
- BREVO SMTP credentials currently rejected by Brevo (`535 5.7.8 Authentication failed` in production logs, 2026-04-30 07:49). Login notifications failing silently. Login itself works.
- R2 storage / Stripe billing / Mapbox secrets not in production (all named in CLAUDE.md but no secrets configured).

**Test coverage gaps:**
- 21 of 33 route files have NO integration test coverage. Notable gaps include `routes/agency.ts` (the entire Stage 4 + Gap 4 compliance surface), `routes/payroll.ts` (the ZUS calculator), `routes/portal.ts` (worker self-service), `routes/permits.ts`, `routes/contracts.ts`, `routes/gdpr.ts`, `routes/gps.ts`, `routes/regulatory.ts`, `routes/interviews.ts`, `routes/invoices.ts`, `routes/eej-mobile.ts`, `routes/billing.ts`. The integration test suite covers roughly the recruitment / Step 3 WhatsApp / Gap 4 surfaces and very little else.

**Counsel engagement:**
- Phase 3 counsel handoff packet committed at `325baa1`. Engagement itself has not happened. Same Polish counsel as APATRIS (per Q3 decision). Q1 (Article 6(3) classification of redesigned matching) gates the architectural intervention work above.

---

## Deferred-hardening patterns (run with the same lens APATRIS audit used)

**Silent-failure catches without observability** — present in EEJ. Direct grep findings:

- `routes/regulatory.ts: } catch { return null; }` and `} catch { /* ignore parse errors */ }` — regulatory ingest failures swallowed; T1 dashboard's regulatory widget could be reading empty state without error surfacing.
- `services/legal-intelligence.ts: } catch { /* parse failed */ }` — legal-intelligence parse failures swallowed.
- `lib/alerter.ts:101, 139, 146` — three `} catch { return null; }` and `} catch { return []; }` patterns. The alerter is the legacy direct-send path that runs on cron; failures don't surface.
- `lib/ai.ts:89: } catch { return null; }` — AI invocation failures swallowed; calling code sees `null` and treats as "no AI response."
- `services/agency-protection.ts: 4 instances of /* table may not exist */` plus `services/poa-legal-protection.ts: 1`, `services/pip-readiness.service.ts: 1`, `services/first-contact-verification.ts: 1`, `services/mos-2026-mandate.ts: 1`, `services/legal-answer-engine.ts: 1`. **9 services have catches that defensively swallow against schema drift.** This is the EEJ-side equivalent of APATRIS's `61977ad` schema-assumption bug cluster, but inverted: where APATRIS shipped queries against non-existent COLUMNS that crashed, EEJ's services catch table-may-not-exist errors and return empty results silently. Same root cause: schema-vs-query drift not verified.

There is no logger discipline (no `logger.error` calls visible in the spot-check). Pino is named in CLAUDE.md tech stack but is not the structural sink; failures go to `console.error` or are swallowed. Sentry is wired (`@sentry/node` per imports) but the systematic "logger.error in every silent catch" pattern from APATRIS Tier 2 is absent.

**Hardcoded fallback keys** — minor in EEJ. `lib/complianceAI.ts:4` and `lib/ai.ts:4` use `process.env.ANTHROPIC_API_KEY ?? ""` (empty-string fallback). Production has the secret set (per `flyctl secrets list`), so no production exposure; but if the secret is ever rotated and the new value not deployed, the SDK initializes with empty string and calls fail at runtime with non-obvious errors. Not the AES-vs-XOR severity of APATRIS Track 2.1 but the same shape.

**Schema-vs-query drift** — three concrete instances:
- The `/* table may not exist */` defensive catches above. Production state has all 22 tables present, but the defensive code suggests historical drift where queries shipped before tables existed.
- The `tenant_id` column on `job_postings` did not exist before Stage 4.5 (commit `1ab4b16`, 2026-04-29). The pre-closure investigation for the auth-gating gap **assumed** the column existed (Section G recommended `eq(schema.jobPostings.tenantId, tenantId)` filter); production verification revealed it didn't, and Manish authorized a Stage 4.5 schema migration before the auth-gating closure could land. The investigation Section G was wrong because it didn't verify against schema. This is the same pattern as APATRIS's `61977ad` queries-against-non-existent-columns, caught earlier (in pre-closure investigation rather than in production logs) but the underlying discipline gap is identical.
- `migrate.ts` `legal_evidence` ordering bug from `STEP3-FOLLOWUPS.md`: `ALTER TABLE legal_evidence ADD COLUMN IF NOT EXISTS notes TEXT` runs at line 521, `CREATE TABLE IF NOT EXISTS legal_evidence` runs at line 634 — **ALTER before CREATE.** Production survives because `legal_evidence` was created earlier by a prior code path; clean-room recreation breaks. The Path 2a Docker workaround pre-seeds `legal_evidence` to bypass this. **Latent migration-ordering bug, known and tracked, not fixed.**

**Pool config** — light-touch concern. `db/index.ts:9` is `new pg.Pool({ connectionString })` with no overrides. Defaults are `max: 10, min: 0, idleTimeoutMillis: 10000`. The default `min: 0` is the APATRIS-recommended value (no permanent connection holding). Less concerning than APATRIS's `min: 1` situation but the file has no documentation, no observability hooks on pool events, no graceful-shutdown handler. The same "pool noise masks real failures" risk exists if the pool ever needs tuning.

**Untested features shipped** — significant. 21 of 33 route files have zero integration test coverage. The bulk of route surface area has never been exercised against a real DB by the test suite. Specific concerns:
- The entire `services/agency-protection.ts` + `agency-compliance-engine.ts` (1,300+ LOC, 33 encoded constraints, all the Stage 4 hardening) is exercised only at the route level for Gap 4's specific 8 tests. The 18/36-month limiter, the KRAZ tracker, the Marshal annual report, the contract reclassification scanner, the Specustawa/CUKR Ukrainian-tracker — none have direct integration tests.
- The ZUS calculator at `routes/payroll.ts` is the documented "EEJ benchmark: 160h × 31.40 = 3929.05" (per CLAUDE.md mandatory rule). No integration test verifies this benchmark in CI. If a refactor changes the calculation, nothing catches it.
- The worker portal at `routes/portal.ts` (worker self-service with 30-day JWT tokens) is untested.

**Staging absence** — confirmed. `flyctl apps list` shows `eej-api` in **pending** state (analogous to APATRIS's suspended `apatris-api-staging`). EEJ does not have a working staging environment. All verification is Path 2a Docker locally + production. Manish's "test data, never real data" principle has no production-shaped target; staging would need to be reactivated/provisioned before that principle can hold for EEJ work.

**Commit messages claiming completeness vs reality** — present and significant.

The most concrete instance is **Step 3 closure**. The closure note in `STEP3-FOLLOWUPS.md` says "Step 3 fully shipped on production at v99 (2026-04-27). All four sub-phases live." Read closely, the same note acknowledges:

> Operational activation pending (manual ops steps, not blocking any code work):
> - `TWILIO_AUTH_TOKEN` and `TWILIO_ACCOUNT_SID` secrets provisioning on Fly
> - Twilio console webhook URL configuration (inbound receipt) and outbound Messaging Service setup
> - Template `content_sid` provisioning per template
> 
> Until these ops steps complete, the steady state is:
> - Webhook returns 503 fail-closed
> - Drafts can be created and approved (status DRAFT → APPROVED with audit) but `sendImmediately=true` returns 503
> - Templates remain inactive so the drafter rejects them at create time anyway

Step 3's commit messages — "Step 3a deploy complete," "Step 3b approved/send live," "Step 3c webhook live," "Step 3d closure" — claim completeness. The *operational reality* is that the entire Step 3 feature is dormant. Webhook returns 503 because `TWILIO_AUTH_TOKEN` is unset. Drafts exist but cannot be sent. Templates exist but are marked inactive, so the drafter rejects them at create time. **No Step 3 message has ever actually reached a worker.** Step 3 ships in code; it does not ship operationally.

This is the EEJ-side equivalent of APATRIS's "doc-vs-reality at commit-message granularity" finding from the Operational Pass. Same mechanism. Same root cause. Manish's verified-before-done rule (APATRIS Track 5.1) applies retroactively to Step 3: the feature is not done because no end-to-end exercise has happened.

A second instance: the v102 auth-gating closure deploy was reported as "all closures confirmed in production," which is true for the closure itself, but the pre-closure investigation that claimed the tenant-scoping design was implementable was wrong (see schema-vs-query drift item above). The investigation Section G was treated as authoritative when it should have surfaced "I haven't verified against schema." That gap was caught before deploy, but the pattern — investigation claims correctness without grounding it — is the same.

---

## TRACK 1 — Operational Hygiene (immediate)

### Goal
Restore staging substrate; close the operational-activation gap on Step 3; close the migrate.ts ordering bug; surface the silent catches with logger.error.

### Actions

**1.1 Provision EEJ staging environment.**
- WHO: Manish authorizes; provisioning is state-changing flyctl. Either he runs it himself OR explicitly authorizes EEJ Claude with narrow scope-exception (matches APATRIS Track 1.1 pattern).
- WHY: precondition for Manish's test-data-never-real-data principle on EEJ. The `eej-api` Fly app is in pending state and unused. Either resurrect it or provision a fresh `eej-jobs-api-staging`.
- DONE WHEN: a staging app exists, deploys cleanly with v103 image, has its own DATABASE_URL pointing at a Neon test branch (per the deferred follow-up in `STEP3-FOLLOWUPS.md`), and Path 2a Docker can be retired in favor of `flyctl deploy -a eej-jobs-api-staging` for verification before production.

**1.2 Step 3 operational activation.**
- SCOPE: provision `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_WHATSAPP_FROM` on Fly secrets. Configure Twilio console webhook URL (`https://eej-jobs-api.fly.dev/api/webhooks/whatsapp`) on the Messaging Service. Provision `content_sid` for the 3 seed templates (or one template to start). Flip the relevant template's `active=true`. End-to-end test: create a draft, approve with `sendImmediately=true`, confirm WhatsApp delivery to a test phone, confirm row in `whatsapp_messages` with `status='SENT'`.
- WHO: Manish provisions secrets; chat-Claude routes; EEJ Claude executes the test exercise.
- DONE WHEN: one outbound WhatsApp message has been sent end-to-end through the Step 3 pipeline and verified received.

**1.3 Migrate.ts `legal_evidence` ordering bug fix.**
- SCOPE: move `CREATE TABLE IF NOT EXISTS legal_evidence (...)` from line 634 to before the ALTER block at line 521, OR widen the DO block at lines 520–524 with `EXCEPTION WHEN undefined_table THEN NULL;`. Latter is safer (smaller diff, idempotent). Verify on fresh Docker without pre-seed.
- WHY: clean-room recreation (new tenant on new Neon project, disaster recovery) currently broken. Production survives only because the table was created by an earlier code path.

**1.4 SMTP credential refresh.**
- SCOPE: Brevo SMTP returning `535 5.7.8 Authentication failed` since at least 2026-04-30. Either rotate Brevo password and update Fly secret, or migrate to the Resend alternative named in CLAUDE.md.
- WHY: login notifications failing silently; alerter cron emails likely also failing.

**1.5 Logger.error in silent catches.**
- SCOPE: ~10 catch blocks across `lib/alerter.ts`, `lib/ai.ts`, `routes/regulatory.ts`, and the 9 `/* table may not exist */` services. Add structured logger.error before the silent return. Cheaper than full Pino-Sentry transport (APATRIS Track 2.2) but closes the observability gap on the worst offenders.

### Stop-and-confirm gates
- **GATE-T1-A:** post-staging-provision; deploy v103 image to staging; report DB connectivity and `/api/healthz` 200 on staging.
- **GATE-T1-B:** post-Step-3-activation; one WhatsApp message delivered + audit row written.
- **GATE-T1-C:** post-migrate.ts fix on staging; fresh Docker-from-scratch verification.
- **GATE-T1-D:** post-logger-instrumentation; intentionally trigger one catch on staging; verify log line.

---

## TRACK 2 — Test Coverage Posture (urgent; pre-Phase 1 closure)

### Goal
Bring the 21 untested route files under integration test coverage **before** classifying Phase 1 of the CLAUDE.md roadmap as complete. Apply Manish's "no new features until broken ones fixed" rule (APATRIS Track 5.2) to EEJ: do not start Phase 2 until Phase 1's existing surface is verified.

### Actions

**2.1 Per-route integration test sprint.**
- SCOPE: 21 route files needing tests. Prioritize by mission-criticality:
  1. **`routes/payroll.ts`** — the ZUS calculator. CLAUDE.md mandates the benchmark (160h × 31.40 = 3929.05 net). Add a test that asserts this benchmark; refactor that breaks it must fail CI.
  2. **`routes/agency.ts`** — Stage 4 + Gap 4 compliance surface, 33 constraints. Test placement-check, contract-permit cross-validation, 18-month limit, KRAZ registration.
  3. **`routes/portal.ts`** — worker self-service with 30-day JWT. Auth gates, document upload, hours submission.
  4. **`routes/permits.ts`** — work-permit application CRUD + 7-day deadline tracking.
  5. **`routes/contracts.ts`** — Polish-language PDF generation for Umowa Zlecenie / Umowa o Pracę.
  6. Remaining routes by usage frequency.
- ESTIMATE: 30–40 hours engineering. Apply Step 3 / Gap 4 atomic-commit pattern (one route file per commit, ~5 tests each).

**2.2 ZUS-benchmark canary.**
- SCOPE: a single fast unit test that runs on every CI invocation, asserts `calculateZUS({hours: 160, rateNet: 31.40}).net === 3929.05`. Independent of the full integration suite. Catches accidental regressions in the calculator's most operationally-critical computation.

### Stop-and-confirm gates
- **GATE-T2-A:** post-ZUS-canary; intentionally introduce a 1% rounding error; verify CI fails; revert.
- **GATE-T2-B:** post-priority-route-tests (top 5 of 21); rerun full vitest suite, target 220+ tests passing.
- **GATE-T2-C:** post-full-21-route-coverage; classify Phase 1 complete only when this gate clears.

---

## TRACK 3 — Architectural Intervention (gating §4(a) classification)

### Goal
Implement the Phase 3 counsel-ready architectural intervention so the not-high-risk classification under Article 6(3)(a)+(d) becomes defensible. The classification posture currently rests on a documented architectural commitment, not on a fait accompli; this track makes the commitment real.

### Actions

**3.1 Counsel engagement.**
- WHO: Manish; counsel handoff packet at `docs/EU_AI_ACT_ANNEX_III_4A_COUNSEL_HANDOFF.md` (commit `325baa1`). Q12 from Phase 2 research recommends the same Polish counsel as APATRIS for cost/scope efficiency; the EEJ-specific complement is the Polish staffing-agency-law expertise (Temp Work Act, Foreigners Act position-binding, equal-pay parity).
- WHEN: as part of the same engagement window APATRIS uses; ideally combined into one counsel-review pass covering both platforms.
- BLOCKS: 3.2 cannot start without Q1 resolution.

**3.2 Hybrid-path implementation in code (post-counsel).**
- SCOPE: ~60–95 hours engineering work inventoried in Phase 2 Section 4.5. Sunset numeric matchScore in `routes/jobs.ts:127-165` and `:244-280`; remove color-coded badges in `ApplicationsTab.tsx:143-152` and `ATSPipelineTab.tsx:135-144`; clean up public-application path at `routes/workers.ts:184`; close Gap 1 (Art. 8 prohibition list), Gap 3 (equal-pay parity), Gap 5 (jobRole taxonomy); Gap 2 (position-permit binding) sequenced after APATRIS integration.
- WHO: chat-Claude routes; EEJ Claude executes; counsel reviews each architectural change against Q1 reasoning.

**3.3 Article 6(4) non-high-risk-assessment record.**
- SCOPE: 4–6 hour drafting deliverable post-implementation. Anchors the classification under audit. Retention: 10 years per Article 18 if the system is ever reclassified; per counsel guidance otherwise.

### Stop-and-confirm gates
- **GATE-T3-A:** counsel engagement confirmed (Manish reports after first call); Q1 resolved with explicit reasoning.
- **GATE-T3-B:** Gap 1 + Gap 3 + Gap 5 closed in code, integration-tested.
- **GATE-T3-C:** matchScore sunset complete in production (UI badges removed, scoring logic replaced with eligibility checklist, `matchReasons` retained).
- **GATE-T3-D:** Article 6(4) record drafted; counsel reviews and approves.

---

## TRACK 4 — Mobile Bilingual Rewrite (urgent; serves the worker mission directly)

### Goal
Make the mobile app rendering correctly Polish for Polish workers. This is mission-critical: EEJ's daily users on the mobile surface are Polish-speaking foreign workers, and the current state — Polish stripped of diacritics, default language EN, custom non-standard i18n — is an accessibility and dignity failure.

### Actions

**4.1 Mobile i18n migration.**
- SCOPE: per the bilingual architecture audit (2026-05-05). Replace `eej-mobile-HIDDEN/src/lib/i18n.tsx` custom context with `react-i18next` matching the dashboard pattern. Extract 67 hardcoded entries to `eej-mobile-HIDDEN/src/locales/en.json` + `pl.json`. **Restore Polish diacritics across every translation.** Flip default language from EN to PL.
- ESTIMATE: 8–12 hours.

**4.2 LanguageToggle component for mobile.**
- SCOPE: build shared `<LanguageToggle compact?: boolean />` component (per APATRIS workforce-app Phase 5b-1 pattern). Replace inline toggles in `ImmigrationSearchTab.tsx:99,114` and `Dashboard.tsx:185` with the new component.
- ESTIMATE: 2–3 hours.

**4.3 Mobile content migration.**
- SCOPE: convert ~50 hardcoded `language === "en" ? ... : ...` ternaries in mobile pages to `t()` calls. Expand dictionary substantially as new strings are pulled from JSX. CHECK 9 verification pass to surface any unresolved t() calls.
- ESTIMATE: 15–25 hours.

### Stop-and-confirm gates
- **GATE-T4-A:** post-react-i18next migration; Polish strings render with diacritics on staging; default-language flip behaves on a clean browser.
- **GATE-T4-B:** post-LanguageToggle extraction; both mount points behave identically; toggle persists across reloads.
- **GATE-T4-C:** post-content-migration; CHECK 9 inventory shows zero unresolved t() keys.

---

## TRACK 5 — Process Discipline (Manish-level rules)

### Goal
Same as APATRIS Track 5: institute owner-level rules that close the verification-discipline gap. These rules apply to EEJ identically because both platforms are subject to the same human dynamics that produced the same shaped failures.

### Rules

**5.1 "Verified before done" rule.**
- Nothing is called complete or shipped until exercised end-to-end on staging by Manish or chat-Claude.
- Apply retroactively to Step 3: the feature is not done because no WhatsApp message has been sent in production. Step 3's status is "shipped in code, dormant operationally." Track 1.2 closes this.

**5.2 "No new features until broken ones fixed" rule.**
- Phase 1's 21 named features (per CLAUDE.md ROADMAP) verified working before Phase 2 begins.
- Auditing the 21 features against the same lens that surfaced Step 3's dormancy is a Track 2 prerequisite to classifying Phase 1 complete.

**5.3 "Test data, never real data" standing rule.**
- APATRIS has this saved as `feedback_test_data_only.md` (2026-05-02). Carries to EEJ.
- Currently EEJ has no test-data target (no staging). Track 1.1 unblocks this.

**5.4 "Pre-closure investigation must verify against schema" rule.**
- Surfaced by the auth-gating closure pre-investigation that assumed `jobPostings.tenantId` existed when it didn't. Investigation V-checks must include schema verification before recommending queries that filter on a column.
- Codify: every pre-closure investigation that proposes new query predicates must include a `\d <table>` or equivalent schema check in its V-checks.

**5.5 "Commit messages reflect operational reality" rule.**
- Step 3's "fully shipped" commit messages diverge from operational state because the feature is dormant. Future closure commits must distinguish "shipped in code" from "operational end-to-end."
- Format suggestion: closure commits include a "Operational status: DORMANT / ACTIVATED / PARTIAL" line in the body when relevant.

These rules become CLAUDE.md additions OR chat-Claude prompt-template constraints.

---

## TRACK 6 — EEJ Claude Operating Constraints (active AND protected)

### Goal
Preserve the operating posture that has been working through the build days. The eleven hard boundaries from APATRIS's Track 6 carry over to EEJ verbatim because they govern operating practice across both platforms.

### "Active" means
- EEJ Claude continues as executor in three-intelligences pattern (chat-Claude + Manish + Holmes-on-some-artifacts + EEJ Claude).
- Full repo + Fly + git context access.
- Runs verification gates; surfaces empirical evidence beyond literal items (active reviewer).
- Surfaces reality-vs-plan in escalation format before deep execution when premise is wrong (the Stage 4.5 STOP that surfaced the missing `tenant_id` column is a working example).

### "Protected" means — same 11 hard boundaries
1. Repo posture: READ-ONLY by default. Code changes require explicit "go."
2. Production DB: NO direct connection. NO SELECT. ABSOLUTE. Diagnostic queries only via authorized scripts uploaded via sftp and removed after.
3. Commits: NO commit, push, or deploy without explicit Manish "go."
4. Migration runner / DDL / DML: never invoke ad-hoc on prod. CREATE TABLE IF NOT EXISTS only; never DROP.
5. Fly state changes: ALLOWED list (read-only) vs FORBIDDEN list (state-changing). Default to FORBIDDEN if unclear.
6. Stop-and-confirm gates: at every boundary. Report + wait for explicit confirmation.
7. Reality-vs-plan escalation format: EXPECTED / FOUND / REASONABLE INTERPRETATION / RECOMMENDATION / awaiting confirmation. Use when premise is wrong before deep execution.
8. Cross-pass / cross-dimension recharacterization: when later findings change earlier verdicts, surface explicitly.
9. Verbatim commit messages: when Manish quotes one, use it exactly.
10. CLAUDE.md current: update after stack/feature/env changes.
11. Auto commit/push DEFAULT: test → commit → push → fly deploy after task. OVERRIDE: explicit-go-only mode for audit / counsel work / pre-counsel posture.

### Three-intelligences pattern preservation
- **chat-Claude + Manish:** strategic decisions, save-prompt authoring, last source of truth.
- **Holmes:** structural review on agreed artifact stages; primary work EEJ; queued otherwise. (Per APATRIS doc; Holmes is named as primary-work-EEJ — meaning EEJ Claude is the engine here and Holmes is structural review.)
- **EEJ Claude:** executor, active reviewer, surfacing implications beyond literal items, stop-and-confirm at gates.

---

## How chat-Claude uses this document

For each track, derive a save-prompt by:
1. Pulling the track's GOAL → ARCHITECTURAL ASSUMPTIONS.
2. Pulling the actions → EXECUTION ORDER.
3. Pulling the gates → STOP-AND-CONFIRM structure.
4. Carrying TRACK 6 hard boundaries verbatim.
5. Adding pre-execution verification (V1 = repo state; V2 = sub-file state; V3 = flyctl auth state when state-changing).
6. Adding output structure (one new sub-file at exact path; no other file creation).

For Manish, the strategic picture without translation: **Step 3 is not actually live in production despite shipping in code. The mobile app is rendering Polish without diacritics for Polish workers. Twenty-one route files have no tests. There's no staging. The compliance constraints are encoded but not all exercised. The §4(a) classification work is documented but the architectural intervention isn't built. Counsel engagement hasn't started.**

The good news: schema discipline (Stage 4 tenant isolation, Gap 4 placement_type, Stage 4.5 recruitment-surface scoping, Gap 4 D2 closure) is solid and shipped. Audit documentation (audit v2, regulatory framework inventory, §4(a) Phase 1+2+3) is substantive. The 33 encoded compliance constraints are real and grounded in Polish law citations. The operating posture (three-intelligences pattern, eleven hard boundaries, stop-and-confirm gates, V-checks) has held across deploys. The build process learned to STOP and surface (Stage 4.5 schema-vs-query catch on the auth-gating closure is the working evidence).

**Stop, harden, get counsel, verified-before-done, fix the mobile app for the workers it serves.** Same shape as APATRIS's recommendation, EEJ-specific contents.

---

## Recommended save-prompt order

1. **Track 1 first** — operational hygiene. Step 3 activation (Track 1.2) is highest-priority because the feature exists in code but doesn't function for users. Staging provisioning (Track 1.1) unblocks everything else.
2. **Track 4 in parallel with Track 1** — mobile bilingual rewrite. Polish-without-diacritics is a daily worker-facing failure that doesn't depend on staging or counsel. Can ship piecemeal.
3. **Track 2** — test coverage. Sequenced after Track 1 hygiene so staging is available; foundational for Track 5.2 "no new features until broken ones fixed."
4. **Track 3 gated on counsel engagement** — Manish-driven. Same counsel as APATRIS per Q12.
5. **Track 5 ongoing** — rules; not single-prompt-able; carry into every save-prompt.
6. **Track 6 baked into every save-prompt** — operating constraints.

---

## Mission framing (held throughout)

Manish's two-part mission applied to EEJ:
- **Follow the law.** Polish staffing-agency law (Temp Work Act Art. 7, 8, 14a, 15, 20). Foreigners Act (Art. 87, 88, 88i, 88z, 108, 114, 118). Promocji Zatrudnienia / Ustawa o rynku pracy 2025 (Art. 305-329, 323). Kodeks Pracy anti-discrimination (Art. 11³, 18³ᵃ-ᵉ). RODO. EU AI Act Annex III §4(a).
- **Save people from getting trapped.** Foreign workers (welders, construction, healthcare) on `umowa zlecenie` placed at user-employers across Poland. Mission-critical surfaces: BHP/medical/work-authorization gates (block illegal placement), 18/36-month assignment limits (block over-deployment), equal-pay parity (block exploitation), worker self-service portal (give workers visibility into their own status), candidate-facing applications (entry to lawful employment), regulatory updates (keep workers informed), audit trail (defend against discrimination claims under Art. 18³ᵉ).

Strength of the build is measured by how reliably those mission-critical surfaces work for Polish-speaking workers using a phone in Polish. Step 3's WhatsApp dormancy means workers don't get permit-update notifications. Mobile's missing diacritics mean Polish workers see broken Polish. The 21 untested routes mean those mission surfaces have unknown behavior under real load. Track 1, Track 2, and Track 4 close those gaps.

End of strategic recommendations document.
