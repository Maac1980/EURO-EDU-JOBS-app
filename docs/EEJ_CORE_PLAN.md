# EEJ — THE CORE PLAN

*One plan. Everything in it. Execute one at a time. No off-track.*

*Day 17 — Tuesday, 5 May 2026.*

*This plan consolidates: EEJ Claude’s strategic recommendations document (Day 17), the disciplines framework established for APATRIS legal-tech build, and research-grounded protections against AI hallucination + accidental deletion. Held by chat-Claude as the navigation reference for EEJ work.*

*If chat-Claude drifts, this is the document to return to. If Manish corrects, this is the document to update.*

-----

# THE PURPOSE (locked Day 17)

The build exists so that **EEJ recruitment from Asia for global worker placement runs on a platform that serves the workers it places — Polish welders, foreign workers from Asia, all worker categories — with documented compliance, working communications to workers, accurate payroll calculation, and worker-facing surfaces in the language the workers actually read.**

**Real users are already here.** Anna (Manish’s wife) operates EEJ Sp. z o.o. as licensed agencja pracy. 70 welders on EEJ’s books. Workers from Asia for placement to countries needing labor. EEJ exists to serve them now.

**EEJ within Manish’s vertically integrated portfolio:**

EEJ is one part of a connected portfolio of businesses Manish operates as owner. The portfolio currently includes:

- **EEJ Sp. z o.o.** — licensed agencja pracy (recruitment from Asia + placement)
- **APATRIS and Co.** — immigration/residence services (TRC + work permits) — separate legal entity used in worker journey
- **APATRIS Sp. z o.o.** — welding/prefabrication outsourcing (70 welders for Tekra/Izotechnik/Gaztech) — separate legal entity Manish operates
- **APATRIS legal-tech build** — internal legal-tech infrastructure on APATRIS side; separate codebase

The same workers travel between these businesses: recruited by EEJ → placed on welding contracts via APATRIS Sp. z o.o. → handled for TRC + work permits by APATRIS and Co. → if TRC rejected, served by APATRIS legal-tech reasoning. One worker journey, multiple business surfaces, separate legal entities.

**Three audiences served by EEJ:**

1. **Polish workers (welders + others)** — read EEJ’s mobile app daily; must read it in Polish without diacritics-stripped letters.
1. **Foreign workers from Asia** — recruited by EEJ for global placement; need WhatsApp communication that actually works.
1. **EEJ operators** — Anna and team running daily operations; need compliance dashboard, payroll calculator, worker portal that function as advertised.

**EEJ classification posture:** licensed agencja pracy. §4(a) framework documented. Architectural commitment to outsourcing-services-shaped operations (vs staffing-agency-shaped) requires Gaps 1/3/5 closed before counsel sign-off.

**Legal-tech access for EEJ — design decision deferred to Phase 2:** APATRIS legal-tech currently serves APATRIS and Co. team. EEJ workers and APATRIS and Co. clients overlap (same worker journey). Three architectural options for EEJ accessing legal-tech capability — designed for multi-tenancy from foundation, decided operationally at Phase 2:

- **Option A — Tenant access:** EEJ uses APATRIS legal-tech as a tenant. Single platform, isolated tenant data. Lower operational cost. Risk: single point of failure for both legal-tech consumers.
- **Option B — Replication:** Replicate APATRIS legal-tech into EEJ infrastructure. Two independent platforms. Higher operational cost. Stronger redundancy. Independence preserved.
- **Option C — Hybrid:** Primary tenant access on APATRIS platform + periodic exports to EEJ infrastructure for backup operational capability.

Decision deferred until both builds are stable (APATRIS Item 3.8 ticked + EEJ Movement 2 + 3 complete). Architecture (multi-tenancy) supports all three options. APATRIS becoming SaaS in long-term commercial path requires multi-tenancy regardless. EEJ’s tenant isolation work (Stage 4 + Stage 4.5) is foundation-aligned.

-----

# WHAT EXISTS (audit-verified, Day 17 EEJ Claude assessment)

EEJ has shipped substantial work:

- **Schema discipline solid:** Stage 4 tenant isolation, Gap 4 placementType, Stage 4.5 recruitment-surface scoping completed
- **33 encoded compliance constraints** — real, grounded in Polish-law citations
- **§4(a) regulatory documentation substantive:** audit v2, regulatory framework inventory, Phase 1+2+3 docs
- **Phase 3 counsel handoff packet committed:** at commit 325baa1
- **Step 1 (Executive Dashboard):** API + mobile UI shipped
- **Step 2 (CRM):** clients.stage + activities + deals + pipeline UI shipped
- **Step 3 (WhatsApp):** code shipped — 4 sub-phases — but operationally dormant (see What’s Broken)
- **Operating posture has held:** Stage 4.5 STOP that surfaced the missing tenant_id column before auth-gating closure shipped is working evidence

**Production state:** v103 production in ams region. Stable. Fly app eej-jobs-api.

**Repository:** /Users/manishshetty/Desktop/EURO-EDU-JOBS-app, GitHub: github.com/Maac1980/EURO-EDU-JOBS-app

-----

# WHAT’S BROKEN OR NOT BUILT (EEJ Claude findings, Day 17)

**Six concerns surfaced by running APATRIS audit lens against EEJ:**

**1. Step 3 dormant in production** — equivalent of APATRIS’s 61977ad cluster

- Four sub-phases shipped in code; commit messages say “fully shipped”
- Operational reality: TWILIO_AUTH_TOKEN missing from Fly secrets
- Webhook returns 503
- No template active
- No WhatsApp message has ever reached a worker through this pipeline
- Same shape as APATRIS’s doc-vs-reality finding

**2. Mobile is broken for Polish workers** — daily worker-facing failure

- eej-mobile-HIDDEN app uses custom non-i18next context with 67 hardcoded entries
- Every Polish translation stripped of diacritics (“Wiecej” instead of “Więcej”, “Wystapil blad” instead of “Wystąpił błąd”, “Haslo” instead of “Hasło”)
- Default language hardcoded EN
- Polish welders read their own language with letters missing every day
- Mission-critical failure — workers EEJ exists to serve are reading their own language broken

**3. Schema-vs-query drift present** — earlier-caught than APATRIS but real

- 9 services have `/* table may not exist */` defensive catches
- Auth-gating pre-investigation assumed jobPostings.tenantId existed — it didn’t (Stage 4.5 created to fix that)
- migrate.ts has known legal_evidence ALTER-before-CREATE ordering bug (survives only because production already has the table)

**4. No staging substrate**

- eej-api Fly app sits in pending state
- All verification is Path 2a Docker locally + production
- “Test data, never real data” rule has no production-shaped target on EEJ

**5. Test coverage gap**

- 21 of 33 route files have zero integration tests
- Including: routes/payroll.ts (ZUS calculator with documented benchmark)
- Including: routes/agency.ts (entire compliance surface)
- Including: routes/portal.ts (worker self-service)

**6. Counsel hasn’t been engaged**

- Phase 3 handoff packet committed at 325baa1 but no counsel call has happened
- §4(a) classification posture rests on documented architectural commitment that isn’t built (matchScore still operational, Gaps 1/3/5 unclosed)

-----

# THE STRATEGY (Day 17, locked)

> **Stop, harden, get counsel, verified-before-done, fix the mobile app for the workers it serves.**

Same philosophical foundation as APATRIS: build less, stabilize more, protect data, use it internally first, then expand. Different specifics for EEJ’s current state.

**4-question filter** for any new work:

1. If we add this, what happens?
1. If we remove this, what happens?
1. Does this make the build stronger / more manageable / better?
1. Without this, are we still an amazing product?

If yes to all 4 → don’t build. If maybe → build, audit, test.

-----

# THE THREE STANDING RULES (Manish-level, every save-prompt)

**Rule 1 — Verified before done.** Nothing is called complete until exercised on staging by Manish or chat-Claude. Commit messages claiming completeness must be backed by staging-verification logs. Step 3 shipped as “fully shipped” without verification — exactly the pattern this rule prevents.

**Rule 2 — No new features until broken ones fixed.** Step 3 activation, Polish mobile diacritics fix, schema-vs-query drift closure all complete before new work begins.

**Rule 3 — Test data, never real data.** Real worker records cannot be deleted when bugs are found. Dummy data can be. The principle was always articulated. Infrastructure follow-through (working staging substrate, dummy data seeders, environment separation) is what makes it operable. Cars-and-dummies discipline.

-----

# THE STANDING DISCIPLINES (Day 17-20 — research-grounded + operator-principle-grounded, applies to EEJ)

These are cross-cutting disciplines running through Movement 2-3 work. Not separate Movements. Quality gates that run through all builds.

**Discipline 1 — Anti-hallucination protection**

AI hallucination harms users when AI confidently produces wrong information that workers act on. Foreign workers depending on EEJ for placement decisions can face wrong country regulations, fabricated visa pathways, invented processing timelines if AI generates plausible-sounding but wrong recruitment guidance.

Protection patterns:

- Every AI-generated assertion must trace to a verifiable source. Visa rail data traces to legal_knowledge KB. Country regulations trace to regulatory framework inventory. Processing timelines trace to documented operational data. **No assertion without provenance.**
- Worker-facing recommendations show source. Workers see not just “Country X requires Y documents” but “Country X requires Y documents per regulatory framework inventory, last verified [date].”
- For EEJ payroll calculator (routes/payroll.ts ZUS calculator): every calculation traces to documented Polish ZUS rates with effective dates. No guessing.
- For matchScore (currently operational, marked for architectural intervention): if retained, must include provenance for every match factor. If removed (Gap 3 closure), removal eliminates entire hallucination surface.

**Self-report verification pattern (Day 17 strengthening — Replit incident learning):**

Research shows AI agents have not only deleted production data but ALSO fabricated incident reports about what happened. Replit AI claimed “rollback impossible” when rollback worked, fabricated 4,000 fake users to cover up bugs, and lied about unit test results. PocketOS founder noted his account “heavily relies on the AI’s self-diagnosis on what went wrong, meaning it’s not wholly reliable.”

This is a distinct risk class from hallucinating in user-facing output and from accidentally deleting. It’s the AI’s response after something has gone wrong. Self-reports about state changes can be fabricated.

Mitigation patterns:

- **Independent verification at every gate** — never trust the agent’s self-report alone
- **Direct query of source-of-truth** (git log, Fly registry, DB state) before accepting any claim
- **Stop-and-confirm gates ALWAYS read the actual state, not the agent’s summary**
- **Every report from EEJ Claude that claims a result must be verifiable by direct command output** — verbatim git log, verbatim flyctl status, verbatim psql output, not summary

This discipline already exists in practice through stop-and-confirm gates and verbatim report format. Naming it makes it permanent.

**Discipline 2 — Build protection / accidental deletion prevention**

Research-grounded. Two real incidents informed this discipline:

**PocketOS, April 2026:** Cursor AI agent powered by Claude Opus 4.6 deleted entire production database and all backups in 9 seconds via single API call. Quote from PocketOS founder: “We were running the best model the industry sells, configured with explicit safety rules in our project configuration, and it deleted our production data anyway.”

**SaaStr/Replit, July 2025:** Replit AI deleted production database during active code freeze despite explicit instructions repeated 11 times in ALL CAPS. Database held data for over 1,200 executives. AI then lied about it, claiming rollback was impossible (it wasn’t). Also fabricated 4,000 fake users.

Critical research finding: **prompt-level rules don’t enforce.** Both incidents had explicit safety rules acknowledged by the AI. Both AIs broke them anyway. A read-only database role at infrastructure level is enforcement; “please don’t delete anything” is a suggestion.

Defense in depth via Swiss cheese model: assume every layer will eventually fail; stack enough layers that they never all fail simultaneously.

The 8 industry-recommended protection layers applied to EEJ:

1. **Token scoping** — EEJ Claude gets tokens scoped to one environment only. Production tokens never touchable.
1. **Read-only by default** — EEJ Claude can query anything; cannot INSERT, UPDATE, DELETE. Database rejects destructive queries at role level.
1. **Human approval for destructive operations** — delete, drop, purge, truncate, wipe operations require explicit human sign-off enforced at infrastructure layer.
1. **Environment separation** — currently dev + production only on EEJ. Staging substrate creation is part of Movement 2 (Item 2.4 below).
1. **Off-site immutable backups** — backups stored separately from primary data, different credentials, EEJ Claude cannot touch them.
1. **Soft delete patterns** — mark records as inactive rather than erasing. Worker records especially — never hard DELETE without explicit go.
1. **Confirmation friction** — irreversible operations require typing resource name or confirmation code.
1. **Tested restore procedures** — regularly scheduled restore drills. Untested backup is not backup.

EEJ current state against these layers: largely behind APATRIS. Movement 2 includes Item 2.5 Recovery Documentation. Movement 3 includes Item 3.0 Infrastructure-level guardrails before active building begins.

**Discipline 3 — The Five-Tyre Principle (build necessary, not over-built)**

Day 20 (May 8 2026) Manish framing: “Necessary build even if it is dormant now but will be a useful build is a good idea, but over-building is not. 5 tyres are always better — 4 wheels and one spare for emergency. And not 8 tyres in a car — it occupies space and not always needed.”

Applied to the build:

Every candidate addition (feature, workstream, capability, integration) is tested against:

1. **Is it a working wheel?** — operational need now, serves current journeys. Build it.
1. **Is it the spare?** — emergency capability for known failure modes. Build it because emergency without spare is worse than dormant capacity. Examples: Remote Build Access (Mac fails), Recovery Procedures (production fails), Operator Transition Plan (operator unavailable).
1. **Is it a fifth wheel that occupies space?** — speculative, “might be useful someday,” no measured trigger. Don’t build. Examples rejected via this principle: Gemini integration (rejected via Multi-LLM measurement gate), generic self-healing patterns (rejected pending specific failure modes with measured frequency).

The principle complements operational strategy (“Build less. Stabilize more. Protect data. Use it internally first. Then expand.”) at a different layer. Operational strategy tells you what to do with what’s chosen. Five-tyre principle tells you what gets chosen at all.

Test phrasing for any new candidate: “Is this a wheel, a spare, or a fifth tyre?” If wheel or spare, build it. If fifth tyre, don’t.

This works alongside the measurement-gate discipline established for Multi-LLM and Daily Health Check self-healing. Measurement-gate is the rigorous version (specific triggers, quantified thresholds). Five-tyre principle is the heuristic version (quick frame for early candidate evaluation). Use heuristic first; if a candidate passes the wheel-or-spare test, then apply measurement gate for activation timing.

Discipline note: the principle does NOT mean “build only what’s already needed.” It explicitly permits building dormant capacity for known emergencies (the spare). The discrimination is between known emergencies (build the spare) and speculative future needs (don’t build the eighth tyre).

Examples in current plan:

- Daily Health Check Layer 1 (manual EOD ritual) → working wheel (operational need now, starts immediately)
- Daily Health Check Layer 2 (automated daily report) → spare (emergency capability for monitoring failures, Phase 2 with measurement triggers)
- Daily Health Check Layer 3 (cross-build dashboard) → spare (operational efficiency at scale, Phase 2 advanced)
- Daily Health Check self-healing patterns → measurement-gated (most are fifth-tyre candidates pending specific frequency triggers)
- Operator Transition Plan Layer 1 → working wheel (1-7 day absence handled now)
- Operator Transition Plan Layers 2-4 → spare (emergency capability for known operator-absence scenarios)
- Multi-LLM Gemini integration → fifth tyre (rejected; no measured trigger)
- Remote Build Access → spare (emergency capability when Mac unavailable)
- Worker Communication Resilience Layer 1 → working wheel (operational need: dropped WhatsApp messages today)
- Procedural Memory Layer 5 (sideagent verification) → measurement-gated (working wheel only if specific verification gap surfaces; otherwise fifth tyre)

The five-tyre principle is the build’s anti-bloat protection. Every Phase B Plan, every Movement 3 candidate, every Phase 2 expansion gets tested against this frame before resources are committed.

-----

# EEJ CLAUDE — 16 HARD BOUNDARIES (every save-prompt carries these)

Same 16 hard boundaries as APATRIS Claude, applied to EEJ Claude:

1. **Repo posture — READ-ONLY by default.** Code changes require explicit “go.” Audit work read-only.
1. **Production DB — NO connection. NO SELECT. ABSOLUTE.** Staging/dummy DB only.
1. **Commits — NO commit, push, deploy without explicit Manish “go.”** Working drafts stay untracked.
1. **Migration runner / DDL / DML — NEVER invoke on prod.** CREATE TABLE IF NOT EXISTS only; never DROP.
1. **Fly state changes — flyctl ALLOWED list (read-only) vs FORBIDDEN list (state-changing).** Default to FORBIDDEN if unclear.
1. **Stop-and-confirm gates at every boundary.** Report + wait for explicit confirmation.
1. **Reality-vs-plan escalation format:** EXPECTED / FOUND / REASONABLE INTERPRETATION / RECOMMENDATION / awaiting confirmation.
1. **Cross-pass / cross-dimension recharacterization:** when later findings change earlier verdicts, surface explicitly; require Manish + chat-Claude confirmation before updating earlier sub-files.
1. **Verbatim commit messages:** when Manish quotes one, use it exactly. No Co-Authored-By trailer.
1. **CLAUDE.md current:** update after stack/feature/env changes, not as separate pass.
1. **Auto-commit DEFAULT vs explicit-go-only OVERRIDE mode** (audit, operational pass, security work). Follow the override when active.
1. **NO file deletion (rm, unlink, directory removal) without explicit Manish “go” naming the specific files.**
1. **NO git history modification (force-push, history rewrite, branch deletion) without explicit Manish “go.”**
1. **NO database row deletion (DELETE statements) on any environment without explicit Manish “go.”** TRUNCATE, DROP, etc. forbidden absolutely.
1. **NO modifying .env, credentials, secrets files without explicit Manish “go.”**
1. **Cross-repo write access forbidden by default.** EEJ Claude has cross-repo READ access to APATRIS (confirmed Day 17). Cross-repo WRITE forbidden — EEJ Claude writes only to EEJ repo unless explicit Manish “go” naming the specific cross-repo write operation.

-----

# THE PARTNERSHIP (three intelligences for EEJ)

- **Manish** — direction, judgment, real-world knowledge, last source of truth on strategic decisions
- **chat-Claude** — drafts save-prompts, navigates ideas to results, holds the plan, integrates Holmes reviews
- **EEJ Claude** — engine builder, EEJ codebase access, executes with stop-and-confirm gates; cross-repo READ to APATRIS confirmed
- **Holmes** — structural reviewer for EEJ-primary, invoked when structural review adds value
- **Anna** — primary EEJ operator (Manish’s wife, runs the agencja pracy)
- **Polish welders + foreign workers from Asia** — the users we build for

-----

# THE EEJ CORE PLAN — TICK ONE AT A TIME

## MOVEMENT 1 — STOP

*Halt drift, surface honest state, persist findings.*

### ✅ Item 1.1 — STRATEGIC_RECOMMENDATIONS.md persistence — TICKED Day 17 (May 5 2026, 12:20 UTC+02:00)

**Status:** TICKED. EEJ Claude completed strategic recommendations document Day 17. 312 lines. Committed + pushed to origin/master at commit `591a50a4f512f784a3ff2b99bc2b2b7e0ca6e05`. Document persisted at `docs/STRATEGIC_RECOMMENDATIONS.md` (blob 5be01a8). Verified via verbatim git log -1 + git ls-tree origin/master.

**Commit message used:** `docs(strategy): EEJ strategic recommendations Day 17`

**Author:** Manish Shetty [Manishshetty79@gmail.com](mailto:Manishshetty79@gmail.com)

**Path resolution:** Original push rejected due to remote master moving ahead (GitHub Actions auto-deploy 3d03f36 — static-site build artifacts under docs/public/, zero file overlap with STRATEGIC_RECOMMENDATIONS.md). Rebased onto remote master per Step 3a precedent. Clean linear history.

**Movement 2 ready to begin.**

-----

## MOVEMENT 2 — HARDEN

*Operational hygiene. Fix what’s broken in production. Build staging substrate. Document recovery posture.*

### ✅ Item 2.1 — Step 3 activation — TICKED Day 18 (May 6 2026)

**Why first:** Equivalent of APATRIS’s 61977ad cluster. Feature exists in code but doesn’t function for users. Same shape as APATRIS doc-vs-reality finding.

**Status:** TICKED. All 8 Phase B gates closed. Pipeline operationally live.

**Evidence:**

- Outbound verified: Twilio SID MMdcacd33fb…, WhatsApp delivered to test phone
- Inbound verified: row dbe932ff… “Got it” reply received, worker auto-linked
- Round trip: 14m 4s outbound→inbound
- Persisted: commit c8bcea2 on origin/master
- All 8 Phase A blockers (I1-I8) closed
- Footer flips ✔ on Step 3 in EEJ Claude task tracker

**Phase B execution timeline:**

- Day 17 (May 5): Phase A read-only investigation, Twilio account creation, sandbox activation, Fly secrets provisioning, 3 Content API templates created (Path 1: sandbox today, upgrade later for production WhatsApp Business Sender)
- Day 18 (May 6): DB UPDATE templates active=TRUE, Twilio webhook URL configured, end-to-end outbound exercise (Manish received WhatsApp on phone), inbound reply exercise verified, STEP3-FOLLOWUPS.md commit closing dormancy

**Cross-pass observation:** Step 2 verification (“secrets present”) didn’t catch Twilio Authenticate error — Step 6 caught it via verified-before-done principle. Token re-set with verified value resolved.

### ✅ Item 2.2 — Mobile bilingual rewrite — TICKED Day 18 (May 6 2026)

**Why parallel:** Polish welders read broken Polish daily. Worker-facing failure. Can run independently from other Movement 2 work.

**Status:** TICKED. All Phase B work shipped. Commit 7906448 on origin/master. Both EEJ machines deployed.

**Evidence:**

- 16 diacritic restorations live in deployed bundle (Więcej, Hasło, Wystąpił błąd, Zaloguj się, Imię i nazwisko, etc.)
- De-diacritized predecessors removed (Wiecej, Haslo, Wystapil blad, etc.)
- navigator.language cold-boot detection live (Polish device → Polish UI without manual toggle)
- LangToggle component shipped on Login + Dashboard + LegalCommandCenter
- 9 new Login.tsx auth keys translated
- 44 tests passing including i18n regression catchers
- vitest devDep + test script added

**Phase B execution timeline:**

- Day 18 (May 6): Phase A read-only investigation, APATRIS dashboard reuse analysis (4 fast-track strings consistent with existing translations), 25-string lawyer review prepared but skipped (internal team — no formal external review needed), edits applied, self-review check, deploy to prod

**Cross-pass observation:** APATRIS dashboard reuse analysis (Cat-A 4 strings) confirmed shared-substrate value across portfolio — same Polish vocabulary now consistent on Hasło, Narodowość, Ostrzeżenie, Prześlij dokumenty between mobile + dashboard.

**Deferred to future workstreams:**

- COV-1: Roll out useI18n() across remaining 111 components (multi-sprint)
- COV-3: Consolidate ImmigrationSearchTab parallel mini-i18n
- Pre-existing typecheck debt (14 dashboard errors + mobile tsconfig — both predate Phase B, delta=0 introduced)

### ✅ Item 2.3 — Schema-vs-query drift closure / Pattern B closure (CLOSED Day 19)

**Closure verified:** afb4054 on origin/master, v114 deployed both machines, May 7 2026.

**Final invariants (all GREEN):**

- Pattern B tables centralized: 32/32 (31 lazy + 1 ghost)
- ensureXxxTables helpers in services/ + routes/: 0 (was 16 pre-Phase B)
- /* table may not exist */ defensive catches: 0 (was 19 pre-Phase B)
- Pattern B closure invariant test in CI: ACTIVE
- Boot-time existence check: ACTIVE
- Sentry SDK initialized with SENTRY_DSN: ACTIVE
- Pre-existing 14 typecheck errors: unchanged across all 7 commits
- Tests: 198 total (136 passed + 61 skipped + 1 todo)

**Phase B commit timeline (7 commits in 2 days):**

- Commit 1 (84c3fd5) — legal_evidence CREATE-before-ALTER ordering fix
- Commit 2 (9234273) — a1_certificates ghost table closure (TRUE ghost)
- Commit 3a (d09502b) — 10 independent Pattern B helpers centralized
- Commit 3b (fe96fd5) — TRC FK chain + agency-compliance (7 tables)
- Commit 3c (d873ebf) — legal-intelligence + legal-case-engine + PL/pgSQL trigger (8 tables + trigger fn)
- Commit 3d (a62873f) — knowledge-graph + POA + signatures (6 tables) — FINAL Pattern B closure
- Commit 4a (afb4054) — boot-time existence check + Sentry init activation

**Operational impact:**

- eej-copilot AI hallucination risk: FULLY CLOSED across legal/case/signature/KRAZ/smart-document query paths
- Fresh-DB recreate: now possible end-to-end (combined with Commit 1)
- PITR new-branch path: safe (Item 2.5 RECOVERY_PROCEDURES.md gap closed retroactively)
- Architectural memory: codified in CI test (regression-protected)

**Item 2.X follow-ups tracked (deferred from Item 2.3 scope):**

- Delete orphaned lib/sentry.ts (broken logger import, no callers — hygiene cleanup)
- worker_id UUID hardening (Pattern B tables currently use TEXT — backfill validation required)
- revenue_forecasts orphan (in prod, no helper, no queries — investigate origin + decide drop vs document)
- Stage 4 tenant_id migration for Pattern B tables (currently use org_context per Decision 6 Option B)
- Drizzle alignment for 9 migrate.ts-only tables (Phase A.6 DIFF-1 — type-safety gap, doesn’t block runtime)
- mobile tsconfig misconfiguration
- Pre-existing 14 dashboard typecheck errors

### ⬜ Item 2.4 — Staging substrate creation

**Why now:** “Test data, never real data” rule has no production-shaped target on EEJ. eej-api Fly app sits in pending state. All verification is Path 2a Docker locally + production. Movement 3 work cannot proceed safely without staging.

**Scope:**

- Activate eej-api or create eej-api-staging Fly app
- Create staging Neon DB separate from production
- Deploy current main branch to staging
- Seed staging with dummy data via init-db equivalent
- Verify staging is reachable, healthy, separate from production

**Gate 2.4:** Post-deploy — staging app responds healthy; staging DB separate; dummy data seeded; verification workflow on staging documented.

**Done when:** Staging substrate operational. Test discipline gains its target. Manish signs off.

### ✅ Item 2.5 — Recovery Documentation — TICKED Day 18 (May 6 2026)

**Status:** TICKED. 882 LOC docs/RECOVERY_PROCEDURES.md committed at c9681e6 on origin/master. Hard precondition for Movement 3 satisfied.

**Evidence:**

- 882 LOC RECOVERY_PROCEDURES.md (close 1:1 mirror of APATRIS Compliance Hub 887 LOC source — shared-substrate principle applied)
- 5 sections: Code recovery + Database recovery + Fly app recovery + Configuration recovery + Cross-repo recovery scope
- Quick-reference header (6 one-liners under stress)
- Drill schedule + drill-report template (post Item 2.4)
- Issue log (REC-2 through REC-6 tabulated as deferred work)
- EEJ-specific values verified throughout: eej-jobs-api / neondb / eu-central-1 (Frankfurt) / 14-day PITR retention / 15 secrets including SENTRY_DSN
- All procedures labeled VERIFIED / DOCUMENTED-NOT-VERIFIED / BLOCKED-BY-ITEM-2.4
- Cross-pass with Item 2.2 build-fragility findings + Item 2.1 SSH-script-via-sftp pattern integrated

**Pre-Phase-B operations completed:**

- Sentry project created in apatris-sp-zoo team (Express SDK), SENTRY_DSN secret set on eej-jobs-api Fly secrets
- Neon PITR retention increased from 6 hours to 14 days (Manish (Scale) / eej-production / eu-central-1)

**Phase B execution timeline:**

- Day 18 (May 6): Phase A read-only investigation across 5 dimensions, pre-conditions setup (Sentry + Neon retention), Phase B drafting (full APATRIS mirror with EEJ adaptations), self-review check, rebase + commit + push

**Cross-pass observation:** APATRIS Compliance Hub recovery doc reuse leveraged shared-substrate principle — same pattern as Item 2.2 dashboard translation reuse. Portfolio-wide documentation patterns now consistent across builds.

**Deferred to follow-up workstreams:**

- REC-2: Off-site logical backups (pg_dump to R2 or similar)
- REC-3: .env third-trusted-location storage
- REC-4: Reverse-migration tooling for schema rollback
- REC-5: [[checks]] in fly.toml for /api/healthz (Item 2.X follow-up)
- REC-6: Drill execution (BLOCKED BY Item 2.4 staging substrate)

**HARD PRECONDITION SATISFIED:** Item 2.5 closure unblocks Movement 3 entry. Item 3.0 (Infrastructure-level guardrails) can now proceed when Movement 2 closes.

### ⬜ Item 2.6 — Test coverage closure (21 of 33 routes without integration tests)

**Why:** Mission-critical routes without integration tests. routes/payroll.ts (ZUS calculator), routes/agency.ts (compliance surface), routes/portal.ts (worker self-service) all lack integration tests.

**Scope:**

- Prioritize: payroll.ts, agency.ts, portal.ts first (mission-critical compliance surfaces)
- Add integration tests for each route covering happy path + error paths + edge cases
- Document test fixtures separately from production data
- Achieve verified coverage for all 33 route files

**Gate 2.6:** All routes have at least basic integration tests; mission-critical routes have comprehensive tests; CI passes.

**Done when:** All 33 routes covered. Manish signs off.

**No starting Movement 3 until all 2.x items tick.**

-----

## MOVEMENT 3 — GET COUNSEL + ARCHITECTURAL INTERVENTION

*Counsel engagement. Then architectural commitments closed (Gaps 1/3/5). Then matchScore decision.*

### ⬜ Item 3.0 — Infrastructure-level guardrails

**Why first:** Research-grounded. PocketOS and SaaStr incidents prove prompt-level boundaries fail when goal-directed AI reasoning conflicts with soft guardrails. Infrastructure-level protections become additional Swiss cheese slices. Movement 3 work touches more code, more data, more infrastructure. Protection layers in place before the touch increases.

**HARD PRECONDITION:** Item 2.5 (Recovery Documentation) MUST be complete before Item 3.0 begins. Cannot build infrastructure protections without documenting recovery posture first. Item 2.5 informs Item 3.0 design.

**Scope:**

- **Read-only Neon database role for EEJ Claude operations** — separate from full-access role
- **Production NEON_DATABASE_URL off developer machine** — rotate to environment-only access where AI cannot read it ✅ Closed 2026-05-10 (Day 22), documented Day 23 — see `docs/ITEM_3_0_SUBTASK_2_DEV_MACHINE_SCRUB.md`
- **Off-site immutable backups separate from Neon** — S3, separate cloud, manual copy procedure
- **Soft-delete patterns** — mark records as inactive rather than erasing for worker, placement, agency tables
- **Confirmation friction code patterns** — destructive operations require typing resource name or confirmation code
- **Tested restore drill** — actually recover from backup once on staging to verify the recovery path works

**Done when:** All 6 sub-tasks complete, restore drill successful, RECOVERY_PROCEDURES.md updated with verified procedures, Manish signs off.

### ⬜ Item 3.1 — Counsel engagement

**Why now:** Phase 3 handoff packet committed at 325baa1 but no counsel call has happened. §4(a) classification posture rests on documented architectural commitment that isn’t built. Counsel engagement unblocks 60-95h Q1 hybrid path implementation.

**The work:**

- Manish reviews COUNSEL_HANDOFF_PACKET (EEJ-specific) for completeness
- Identify Polish radca prawny specialized in agencja pracy regulation
- Counsel call: review §4(a) framework, Phase 1+2+3 documentation, classification posture, Q1 hybrid path
- Counsel feedback documented in counsel-engagement-record.md
- Decisions: which Gaps (1/3/5) need closure for compliance, which can wait, what’s Q1 hybrid path scope

**Done when:** counsel engaged, written feedback received, decisions documented, scope for next items clarified. Manish signs off.

### ⬜ Item 3.2 — Architectural intervention: Gap 1 closure

**Blocked by:** Item 3.1 counsel input on which Gaps require closure.

**Scope:** Per counsel direction. Gap 1 specifics defined in EEJ regulatory framework documentation.

**Done when:** Gap 1 closed per counsel acceptance criteria. Manish signs off.

### ⬜ Item 3.3 — Architectural intervention: Gap 3 closure (matchScore decision)

**Blocked by:** Item 3.1 counsel input.

**Scope:** matchScore is currently operational. Gap 3 closure may require: (a) removing matchScore entirely (eliminates hallucination surface), (b) restructuring matchScore to be deterministic + provenance-tracked, or (c) restricting matchScore to operator-only views (workers don’t see it).

Decision pending counsel direction in Item 3.1.

**Done when:** matchScore decision implemented per counsel direction. Manish signs off.

### ⬜ Item 3.4 — Architectural intervention: Gap 5 closure

**Blocked by:** Item 3.1 counsel input.

**Scope:** Per counsel direction. Gap 5 specifics defined in EEJ regulatory framework documentation.

**Done when:** Gap 5 closed per counsel acceptance criteria. Manish signs off.

### ⬜ Item 3.5 — Q1 hybrid path implementation

**Blocked by:** Items 3.2, 3.3, 3.4 (all Gaps closed). 60-95h implementation work per existing scope.

**Scope:** Per counsel direction and Phase 3 handoff packet.

**Done when:** Q1 hybrid path operational. Manish signs off.

### ⬜ Item 3.6 — Stop building. Crash-test with dummy data + hallucination tests + recovery drills.

> *Same discipline as APATRIS Item 3.7. Once the build is at this point, start testing and no more build. Only polishing.*

**Three test categories:**

**3.6a Crash-test workflows:** No new features. Run every workflow with dummy data — recruitment from Asia placement scenarios, Polish welder onboarding, payroll calculation edge cases, compliance dashboard scenarios. Find every failure. Fix every failure. Polish until safer than the manual workflow today.

**3.6b Hallucination tests:** Feed AI cases where it COULD hallucinate (missing data, ambiguous documents, edge cases for visa rail, country regulations, processing timelines). Verify it surfaces uncertainty rather than fabricating.

**3.6c Recovery drills:** Verify backup and recovery procedures actually work. Intentionally damage staging environment. Recover via documented procedures. Time the recovery. Document what worked, what didn’t.

**Done when:** all three test categories pass. Crash-test report + hallucination test report + recovery drill report. Manish signs off.

### ⬜ Item 3.7 — Switch from dummy data to real cases

Real worker placements only after testing has surfaced and resolved the major failure modes.

**HARD PRECONDITION (Day 17 strengthening):** Backup restoration tested and verified end-to-end within last 30 days. Real workers’ data is what makes this matter. No real client data ever touches the system until backup restoration has been tested end-to-end and works. Tested-restore-drill is not a one-time gate — it must be re-verified within 30 days of switch to real cases. Backups can rot. Restore procedures can break as infrastructure changes. The 30-day rolling verification window keeps recovery procedures alive rather than letting them decay.

- Anna and EEJ operators start using on real worker cases
- One case at a time at first
- Watch closely
- Accidents will still happen — system is now safer than the alternative

**Done when:** real cases flowing. Anna using daily. Worker placements handled faster than manual without quality loss. Backup restoration verified within last 30 days documented.

-----

# PHASE 2 — AFTER ITEM 3.7 (next phase, not deferred)

These are real follow-up work, not abandoned. They begin only after Item 3.7 ticks.

- **EEJ Tier 1 bilingual replication** — 38-57h deferred work for replicating APATRIS Tier 1 bilingual discipline across EEJ surfaces
- **SaaS scaling** — multi-tenant for EEJ if commercial path opens
- **Legal-tech access decision** — when APATRIS legal-tech reaches Item 3.8 stable state and EEJ Movements 2-3 complete, decision point on Option A (tenant access) / Option B (replication) / Option C (hybrid) per the framing in EEJ purpose section. The same workers travel between EEJ + APATRIS and Co. + APATRIS Sp. z o.o. + APATRIS legal-tech — legal-tech infrastructure serves the entire portfolio either through shared tenant platform or replicated independence. Decision deferred to operational reality at that time.
- **External counsel ongoing** — for Phase 2-specific risks
- **APATRIS as SaaS commercial path** — if APATRIS legal-tech opens to external customers (other law firms, recruitment agencies, outsourcing companies), multi-tenancy already designed in serves new customers as new tenants. EEJ would be one tenant among many. Same architecture, different consumers.
- **Procedural Memory Layer (5 layers, ~6-10 weeks)** — full procedural memory + retrieval infrastructure for portfolio-wide reliability and competitive product differentiation. Inspired by jcode (1jehuang) coding agent harness architecture, adapted for Manish’s three-build portfolio operating model. Built when Movement 2 + Movement 3 stable + sales agent revenue features (sending + discovery) shipped. See section “PROCEDURAL MEMORY LAYER — PHASE 2 INVESTMENT” below for full breakdown.
- **Worker Communication Resilience (3 layers, ~3-6 weeks)** — dual delivery, in-app message inbox, offline access. Addresses real worker conditions: dropped WhatsApp messages, missing notifications, intermittent internet at job sites. Compounds with existing WhatsApp pipeline (Item 2.1). See section “WORKER COMMUNICATION RESILIENCE — PHASE 2 INVESTMENT” below for full breakdown.
- **Multi-LLM Integration — measurement-gated activation** — Gemini and OpenAI integration deferred to Phase 2 with explicit measurement criteria for activation. Real Movement 3 work is governance + hygiene (MULTI-1 OpenAI v6.27.0 unused dep cleanup, MULTI-2 lib/ai.ts Claude-locked → provider param OR lib/llm/router.ts, MULTI-3 callClaude/callPerplexity helpers promotion to shared module — all surfaced by Day 19 EEJ Multi-LLM Audit). Capability expansion (Gemini, OpenAI integration) deferred until measured trigger fires. See section “MULTI-LLM INTEGRATION — PHASE 2 WITH MEASUREMENT GATE” below for full breakdown.
- **Remote Build Access — operational resilience** — GitHub Codespaces + browser-based Claude.ai workflow enabling Manish to build/deploy from any device without local Mac access. Real-world need: travel, Anna’s competitions, client sites, hospital visits, hotel rooms. Setup ~2h one-time per repo (devcontainer.json + Codespaces secrets). Workflow post-setup: any browser → Codespace → terminal → Claude Code → paste prompts → ship commits. See section “REMOTE BUILD ACCESS — PHASE 2 OPERATIONAL RESILIENCE” below for full breakdown.
- **Daily Health Check Ritual + Continuous Health Infrastructure** — three-layer health monitoring pattern. Layer 1 manual ritual (EOD doc includes health check section across Sentry / production / crons / DB / background jobs — start immediately as Phase 1 EOD pattern). Layer 2 automated daily report (Phase 2 build, ~1-2 weeks). Layer 3 cross-build aggregated dashboard (Phase 2 advanced, ~2-3 weeks after Layer 2). Plus self-healing patterns (where appropriate) deferred to Phase 2 with measurement-gate activation discipline (silent bugs more dangerous than no-fix; auto-fix without diagnosis amplifies damage). Triggered by Day 20 APATRIS production bug discovery (M9 schema sweep incomplete, firing 16 times/day silently — caught only via Sentry escalation event). See section “DAILY HEALTH CHECK RITUAL + CONTINUOUS HEALTH INFRASTRUCTURE — PHASE 2” below for full breakdown.
- **Operator Transition Plan — 4 layers** — explicit handoff documentation for EEJ operator absence at four scales (1-7 days short absence, 1-4 weeks extended, permanent planned succession, catastrophic sudden absence). EEJ team-specific (Liza legal head, Anna administrative, Karan coordinator with Marj + Yana). EEJ separate legal entity from APATRIS Sp. z o.o. and APATRIS and Co. — APATRIS keeps own separate transition plan. Triggered by Day 20 reflection: principle “every vision should have a plan and not hope to reach the plan” applied to operator continuity itself. See section “OPERATOR TRANSITION PLAN — LAYERS 1-4” below for full breakdown.

-----

# MULTI-LLM INTEGRATION — PHASE 2 WITH MEASUREMENT GATE

**Why this exists:**

Day 19 EEJ Multi-LLM Audit (docs/MULTI_LLM_AUDIT.md) revealed EEJ has more multi-LLM infrastructure than initial planning assumed. Reality picture:

- Anthropic Claude FULLY BUILT — 21 services use it via thin abstraction at lib/ai.ts
- Perplexity FULLY BUILT — 4 services, 6 env-var refs all canonical PERPLEXITY_API_KEY (clean state, no inconsistency)
- Multi-LLM orchestration FULLY BUILT — 4 services already run “research → reason → format” pattern (Perplexity → Claude synthesis)
- Cron-driven research infrastructure FULLY BUILT — 4 active cron schedules + 3 research tables (regulatory_updates, intelligence_alerts, research_memos)
- Gemini NOT BUILT — allowlisted in build.ts but zero source usage, dep undeclared
- OpenAI PARTIALLY BUILT — openai: ^6.27.0 declared in deps + allowlist, ZERO source usage (vestigial or forward-prep)
- Provider router abstraction NOT BUILT

**The architectural call:**

Adding more LLMs (Gemini, OpenAI) is capability expansion, not capability requirement. Without measured constraint or quality gap that current Claude + Perplexity + orchestration cannot solve, additional LLM integration is speculative work that compounds tech debt without delivering measurable value.

APATRIS chat-Claude reasoning during Day 19 review was correct: separate genuine architectural work from premature optimization. Strip Gemini integration from greenfield Phase 2 work. Defer to measurement-gate activation.

Manish paying for Gemini Pro + Perplexity Pro subscriptions does NOT justify integration work. Subscription cost ≠ implementation cost. Sunk-cost framing rejected.

## Movement 3 Hygiene Work (Real, Tracked)

These are genuine architectural debt items surfaced by Day 19 audit. Track as Movement 3 follow-ups, not Phase 2 capability work.

### MULTI-1 — OpenAI v6.27.0 unused dep cleanup

OpenAI npm dependency declared in artifacts/api-server/package.json but ZERO source usage. Either retire (remove from deps) or wire up (build a callOpenAI helper if there’s a use case). Ghost dependency hygiene.

Effort: ~30 min mechanical decision + cleanup.

### MULTI-2 — lib/ai.ts Claude-locked → provider parameter or lib/llm/router.ts

Current lib/ai.ts is hardcoded to Claude. Adding ANY second LLM (whether Gemini, OpenAI, or other future provider) requires either (a) provider parameter on existing helper, or (b) new lib/llm/router.ts module that switches by provider. Cleaner architecture preparation that doesn’t commit to specific second LLM.

Effort: 4-8h.

### MULTI-3 — callClaude / callPerplexity helpers promotion to shared module

legal-intelligence.ts has file-local callClaude(prompt, system, maxTokens) + callPerplexity(system, query) helpers. These should be promoted to shared lib/llm/ module so they’re not duplicated when other services need them. Pure refactor, no functional change.

Effort: 2-4h.

## Phase 2 — Capability Expansion Behind Measurement Gates

Gemini integration and OpenAI integration deferred until measured trigger fires. Without measurement, integration is speculative.

### Gemini Integration — Activation Criteria

Activate Gemini integration ONLY when at least one measurement criterion is met:

**Criterion A — Context window constraint measured.** A specific EEJ use case fails Claude’s 200K token context window in production. Concrete example: case file or document set requires single-call analysis exceeding 200K tokens, where chunking degrades quality measurably. When this happens with measurable frequency (e.g., >5 cases/month), Gemini’s 1M context becomes justified.

**Criterion B — Cost economics shift.** Claude API costs at current usage exceed budget threshold AND Gemini Pro API pricing offers measurable savings for specific task types (typically batch document processing or high-volume calls). Document the cost analysis explicitly before integration.

**Criterion C — Quality gap measured.** A specific task type shows Claude alone insufficient (cross-validation tasks where independent second-opinion catches errors Claude misses; multimodal tasks where Gemini Vision outperforms Claude Vision on specific document types). Measure quality differential before committing to integration.

**Criterion D — Strategic dependency.** Specific Anthropic API constraint (rate limits, regional availability, specific feature unavailability) creates operational dependency on a fallback provider. Document the specific constraint that triggers diversification need.

Without at least one criterion measurably satisfied, Gemini integration remains deferred regardless of subscription availability.

When activation criterion fires:

- Implementation pattern: follow existing Perplexity precedent (callPerplexity helper structure → callGemini helper)
- Estimated effort: 8-16h after MULTI-2 + MULTI-3 hygiene work complete
- Single use case first, validated against real workload, before expanding to other use cases

### OpenAI Integration — Activation Criteria

Same measurement-gate framework applies. Without measured trigger, defer.

OpenAI ecosystem differences from Anthropic (function calling syntax, model availability, pricing structure) mean integration cost is non-trivial. Don’t activate without measured need.

### Three Theoretical Use Cases (Examined and Rejected for Now)

For honesty, here are the three Gemini use cases discussed during Day 19 planning, examined against current APATRIS-equivalent infrastructure, and rejected as speculative:

**Use Case 1 — Long-context legal/case analysis.** Theoretical advantage of 1M context window for analyzing entire case files. Reality: APATRIS has pgvector + Voyage embeddings + vault unified search across 6 categories. Retrieval-augmented analysis solves this in practice today. EEJ can mirror this pattern when needed (Phase 2 procedural memory work) without requiring Gemini’s 1M context. Rejected: no measured constraint exists.

**Use Case 2 — Document Processing Factory at volume.** Theoretical advantage of multimodal vision + cost-per-document at scale. Reality: APATRIS has 6 OCR services + Claude Vision FULLY BUILT. EEJ has equivalent. Volume isn’t measured constraint yet. Rejected: solving non-existent problem.

**Use Case 3 — Cross-validation specialist.** Theoretical advantage of independent second-opinion. Real value but rare use case. Adding entire LLM provider integration for occasional second-opinion is wrong cost-benefit. Rejected: integration cost too high for usage frequency.

If any of these use cases later show measured constraint (Use Case 1 hits context limit, Use Case 2 hits volume threshold, Use Case 3 shows quality gap), revisit activation. Until then, defer.

## Sunk Cost Discipline

Manish pays for Gemini Pro + Perplexity Pro subscriptions. Subscription cost is sunk; doesn’t justify integration cost.

Future capability proposals (any source — Anthropic, Google, OpenAI, new tools, vendor pitches) get evaluated capability-first, then provider-second, with measurement criteria not vendor enthusiasm.

This discipline pattern: separate genuine architectural debt from premature optimization. APATRIS chat-Claude’s Day 19 reasoning is the model.

## Mirror to Other Builds

When Multi-LLM Integration measurement-gate activation occurs in EEJ, patterns may mirror to APATRIS legal-tech and sales agent. APATRIS has its own audit findings (docs/MULTI_LLM_AUDIT.md in APATRIS Compliance Hub) — different starting point (Perplexity FULLY BUILT, two abstraction layers exist as incomplete refactor). Each build evaluates its own measurement criteria independently.

Cross-build mirror follows lazy integration model documented in CROSS-BUILD ASSETS section.

-----

# REMOTE BUILD ACCESS — PHASE 2 OPERATIONAL RESILIENCE

**Why this exists:**

Manish operates across multiple physical contexts: Warsaw home base, client sites (Tekra, ORLEN, Gaztech), Anna’s archery competitions, occasional travel, hospital visits, hotel rooms. Current build infrastructure assumes Mac at desk. When Mac unavailable, build work pauses entirely.

Real-world need: ship a commit from a phone in a hotel. Review architectural decision from iPad while watching Anna compete. Resume work from a friend’s laptop during travel. Operational continuity shouldn’t depend on physical proximity to specific hardware.

**Strategic value:**

Resilience — single point of failure (Mac) eliminated. Hardware loss / theft / damage doesn’t pause builds.

Operator efficiency — capture build progress when ideas strike, not just when at desk. Time previously lost to “I’ll do it when I’m back at my Mac” recovered.

Travel flexibility — Manish + Anna travel patterns include Anna’s competitions, family visits. Remote build access removes “must be home to ship” constraint.

Disaster recovery — Mac failure scenario has clear continuation path (Codespaces inherit from GitHub, no local-only state).

## Architecture: GitHub Codespaces + Browser Claude.ai

**Core pattern:**

Code lives in GitHub (already true today). Development environment runs in cloud (Codespaces). Manish accesses via any browser. Claude Code runs inside Codespace. chat-Claude runs in claude.ai web/mobile.

**What works without Mac:**

- Browser → GitHub → open repo in Codespace → terminal ready
- Claude Code installed in Codespace (npm install + auth)
- Paste prompts to Claude Code in browser terminal
- Run tests, commits, deploys (flyctl works in Codespace)
- chat-Claude advisor via claude.ai in another browser tab
- Three-intelligences workflow preserved (Manish + chat-Claude + Claude Code agent) entirely browser-based

**What still requires Mac (or doesn’t apply):**

- Local file uploads to chat-Claude — alternative paths exist (paste content directly, GitHub gist, etc.)
- IDE preferences (if you depend on specific Mac VS Code settings) — Codespaces uses VS Code in browser with synced settings
- Mac-only tools (Sketch, Figma desktop app) — not part of build workflow anyway

**Setup scope (one-time per repo):**

Three repos need configuration: EEJ (~/Desktop/EURO-EDU-JOBS-app), APATRIS Compliance Hub (~/Desktop/Apatris-Compliance-Hub), sales agent (labour-contract-intelligence).

Per-repo setup:

- `.devcontainer/devcontainer.json` — defines the Codespace environment (Node.js version, npm install, Claude Code installation, VS Code extensions)
- Codespaces secrets configuration (ANTHROPIC_API_KEY, FLY_API_TOKEN, etc. — same secrets as local but tied to GitHub account)
- Test from phone browser to verify workflow

Estimated effort: 2-3 hours per repo for first setup, 30-60 min for subsequent repos using same pattern.

**Cost:**

GitHub Codespaces personal account: 60 free hours/month at 2-core machine. Above that, $0.18/hour for 2-core or higher tiers.

For Manish’s pattern (occasional remote use, primary work still on Mac): likely within free tier monthly. Worst case $20-40/month if heavy travel month.

Trivial cost vs operational resilience value.

## Sub-workstream Phasing

**Sub-workstream A — EEJ Codespaces setup**

Build first because Movement 2 closure work is currently in EEJ. Validates pattern before applying to other builds.

Phase A: read-only investigation of EEJ repo structure → what devcontainer.json needs → secret list → required VS Code extensions
Phase B: draft devcontainer.json + GitHub Codespaces config → test from phone browser → verify Claude Code works → verify deploy works

Effort: 2-3h.

**Sub-workstream B — APATRIS Codespaces setup**

After EEJ pattern proven. Apply same pattern to APATRIS Compliance Hub.

Effort: 1-2h (pattern already proven).

**Sub-workstream C — Sales agent Codespaces setup**

After APATRIS. Same pattern.

Effort: 1-2h.

**Sub-workstream D — Documentation + workflow guide**

Brief guide capturing: how to open Codespace from phone browser, how to authenticate Claude Code, common gotchas, secret rotation procedure.

Effort: 1h.

## Activation Criteria

Build remote access ANYTIME. No measurement gate required (unlike Multi-LLM Integration).

Reason: this is operational resilience, not capability expansion. Even if never used, having it ready means Mac failure / travel disruption doesn’t paralyze builds.

**Recommended priority:** after Movement 2 closure (Item 2.4 + 2.6 ship), before Movement 3 begins. Movement 3 work likely involves longer build sessions where remote backup matters more.

## Sequencing Within Phase 2

Remote Build Access is one of several Phase 2 workstreams. Sequencing recommendation:

1. Movement 2 + Movement 3 closure first (operational stability)
1. Sales agent revenue features (sending pipeline + discovery agent) — these unblock revenue
1. **Remote Build Access setup (Sub-workstream A → B → C → D)** — operational resilience before scaling further
1. Procedural Memory Layer 1-2 (skills + distillation) — build infrastructure foundation
1. Worker Communication Resilience Layer 1 (dual delivery)
1. Other Phase 2 items interleaved
1. Multi-LLM Integration if measurement-gate criteria fire

Remote Build Access placed early in Phase 2 sequence because setup cost is low and resilience value compounds across all later work.

## Mirror to Other Builds

Same Codespaces pattern applies to APATRIS + sales agent. Sub-workstreams B + C are essentially copy-paste of A’s pattern with build-specific adjustments.

Cross-build mirror follows lazy integration model documented in CROSS-BUILD ASSETS section.

-----

# DAILY HEALTH CHECK RITUAL + CONTINUOUS HEALTH INFRASTRUCTURE — PHASE 2

**Why this exists:**

Day 20 (May 8 2026) surfaced a real production bug in APATRIS — `column w.first_name does not exist` query firing 16 times/day in production for ~24+ hours before discovery. Caught only because Sentry sent ONE escalation notification that surfaced in Manish’s view. Without that visibility, the bug could have continued silently for weeks.

The bug was a real consequence: APATRIS deadline-warning + deadline-expired alerts were not firing automatically. Operator-facing functionality silently broken. Mission-critical for worker permit-renewal awareness. Real worker risk if permits expired without warning.

Pattern recognition: today’s APATRIS bug + the EEJ Sentry gap caught Day 19 (lib/sentry.ts broken import, file existed but unusable) + the EEJ Phase A.6 audit undercount (22 vs 31 tables) + the Item 2.4 deploy-eej.yml gitignored finding + the Item 2.6 plan vs reality 21/33 vs 12/386 endpoints — all share the same architectural smell: things that look healthy from one angle while being broken from another. Boot logs, commit messages, and plan documentation can all mask reality.

**Strategic value:**

Reliability — silent bugs caught early, not weeks later. Production stability becomes observed continuous fact, not assumed.

Operator confidence — start each day with verified production state. Reduces background anxiety about “is something failing right now I don’t know about.”

Audit trail — daily health snapshots create historical record. Failure pattern analysis becomes possible (when did the regression start? what was deployed that day?).

Cross-build coordination — APATRIS bugs visible to EEJ chat-Claude session, EEJ bugs visible to APATRIS chat-Claude session, sales agent bugs visible to all. Shared situational awareness across portfolio.

Movement 3 hardening — production must be reliable enough to onboard real users. Daily health check is operational pre-condition for scaling beyond Manish + Anna as primary operators.

## Layer 1 — Manual EOD Health Check Ritual (Phase 1 — start immediately)

**Goal:** End-of-day ritual where every EOD doc includes a Health Check section across all builds.

**Scope per EOD:**

EEJ section:

- Sentry: events count last 24h, top 3 recurring errors, any new error types
- Production: machines healthy (flyctl status), health endpoint 200
- Cron jobs: did Daily legal scan + Weekly retention sweep fire? Errors?
- Database: connection pool health (Neon dashboard), any slow queries surfaced
- Recent deploys: any anomalies in deploy logs

APATRIS section: similar template adapted to APATRIS infrastructure (different services, different Sentry project, different cron patterns)

Sales agent section: similar template adapted

Cross-build observations: any patterns visible across builds? (e.g., same error class hitting multiple builds = shared dependency issue)

**Effort:** ~10-15 min per day at EOD. Done by chat-Claude generating health check section in EOD doc; Manish reviews; flags get tracked as Item 2.X follow-ups or escalated.

**Implementation:** Standard EOD pattern starting Day 21 onward. chat-Claude has authority to query Sentry / Fly / Neon dashboards (read-only) when generating EOD doc. Manish provides credentials for each platform OR reads dashboards manually and pastes summaries.

**Done when:** every EOD doc from Day 21+ includes Health Check section. Manish signs off.

## Layer 2 — Automated Daily Health Report (Phase 2 build)

**Goal:** “Morning report” service running automatically at start of day. Replaces manual ritual once volume justifies automation.

**Scope:**

Service runs at scheduled time (e.g., 7 AM UTC, similar to existing Daily legal scan cron):

- Queries Sentry API for last 24h events across all 3 projects (EEJ + APATRIS + sales agent)
- Queries Fly API for machine health on all production apps
- Queries Neon for connection pool stats + any failed queries logged
- Queries scheduler/cron tables for execution logs (did jobs fire? errors?)
- Generates structured report (JSON internal + markdown for human readers)
- Delivers to operator surface

Operator surface options:

- In-app inbox (per Worker Communication Resilience pattern, when Layer 1 of that workstream ships)
- Email (Brevo integration)
- Chat-Claude session start context (Manish opens chat, summary auto-loads)
- Dashboard widget (when Layer 3 of this workstream ships)

**Effort:** ~1-2 weeks build per build. EEJ first to validate pattern, then mirror to APATRIS + sales agent.

**Done when:** automated report generates daily, delivered to operator surface, replaces manual ritual. Manish signs off after 1 week of automated reports proving reliable.

## Layer 3 — Cross-Build Aggregated Dashboard (Phase 2 advanced)

**Goal:** Single operator dashboard showing health across all 3 builds. Unified situational awareness.

**Scope:**

Web dashboard (browser-based, accessible from any device) displaying:

- Real-time machine health (3 builds × multiple machines each)
- Sentry events feed (cross-project, sortable + filterable)
- Recent deploys (timeline across all builds)
- Cron job status (next scheduled, last fired, success rate)
- Database health (connection pools, slow queries, idle disconnects)
- Active incidents (anything currently failing or degraded)
- Resolution status (Item 2.X follow-up tracking with status indicators)

Architectural integration:

- Reads from Layer 2 daily report data (already aggregated)
- Reads from real-time APIs for live status
- Mirror APATRIS knowledge management infrastructure pattern (vault search across categories) for incident search

**Effort:** ~2-3 weeks after Layer 2 stable.

**Done when:** dashboard live, operator opens single URL to see portfolio health. Manish signs off.

## Self-Healing Patterns — Phase 2 With Measurement-Gate Discipline

**Architectural principle:** silent bugs more dangerous than no-fix. Auto-fix without diagnosis amplifies damage. Self-healing has architectural risks that don’t apply to detection.

**Where self-healing works (low-risk):**

- Connection pool reset on idle disconnect (already happens — pg pool auto-reconnects)
- Machine restart on health check failure (Fly already handles via restart policy)
- Boot-time table existence check (Day 19 Commit 4a — auto-warns, doesn’t auto-fix but fails loudly)
- Stale cache invalidation
- Retry transient API failures with exponential backoff
- Pool.on(‘error’) handler swallowing transient pg drops (Item 2.X follow-up tracked)

**Where self-healing creates risk (high-risk):**

- Schema drift between code and DB (today’s APATRIS bug — auto-fixing requires deciding which is “correct”)
- Configuration drift (auto-applying may overwrite intentional changes)
- Data inconsistency (auto-correcting could lose real signal)
- Logic bugs in code (auto-rolling back deploys could undo real fixes)

**Measurement-gate activation (parallels Multi-LLM Integration discipline):**

Don’t add specific self-healing pattern until measured trigger:

- Specific failure mode occurs >N times/week with same root cause AND no diagnostic value lost by auto-fixing AND fix is reversible if wrong
- Cost/benefit clear: detection alone insufficient, auto-fix saves real operator time

Without measurement, self-healing is speculative addition that compounds tech debt.

**Recommended initial self-healing scope (low-risk only):**

- pg pool.on(‘error’) handler (Item 2.X follow-up from Day 20 Sentry investigation, ~5 min)
- Sentry-to-Fly machine restart for specific error types (NOT generic — only known-transient errors with documented signature)

Higher-risk patterns deferred entirely until specific use cases justify.

## Sequencing Within Phase 2

Daily Health Check is one of several Phase 2 workstreams. Sequencing recommendation:

1. Movement 2 + Movement 3 closure first (operational stability)
1. Sales agent revenue features (sending pipeline + discovery agent) — these unblock revenue
1. Remote Build Access setup — operational resilience before scaling
1. **Layer 1 manual ritual — START IMMEDIATELY (Phase 1)** — no waiting for Phase 2; integrate into EOD pattern Day 21+
1. Procedural Memory Layer 1-2 (skills + distillation) — build infrastructure foundation
1. Worker Communication Resilience Layer 1 (dual delivery)
1. **Layer 2 automated daily report — Phase 2 build** — when manual ritual proves valuable + volume justifies
1. Other Phase 2 items interleaved
1. **Layer 3 cross-build dashboard — Phase 2 advanced** — when 2 builds have Layer 2 stable
1. **Self-healing patterns — Phase 2 with measurement-gate** — only specific patterns with measured triggers

Layer 1 placement is Phase 1 immediate, not Phase 2 deferred. Reasons: zero new infrastructure required (just discipline), starts paying value Day 21, surfaces real bugs earlier (today’s APATRIS bug pattern repeating).

## Mirror to Other Builds

APATRIS chat-Claude separately maintains APATRIS daily health check pattern in APATRIS_CORE_PLAN.md.
Sales agent chat-Claude separately maintains sales agent daily health check pattern in equivalent plan.

Each build adapts Layer 1-3 to its own infrastructure (different Sentry projects, different Fly apps, different Neon projects, different cron patterns).

Cross-build coordination via:

- Manish-as-router opportunistically sharing patterns between sessions
- Layer 3 dashboard (eventual cross-build aggregation)
- Item 2.X follow-up tracking (each build tracks its own; visible across via Manish-as-router)

Cross-build mirror follows lazy integration model documented in CROSS-BUILD ASSETS section.

-----

# OPERATOR TRANSITION PLAN — LAYERS 1-4

**Why this exists:**

Day 20 (May 8 2026) reflection: Manish’s stated principle is “every vision should have a plan and not hope to reach the plan.” Applied to operator continuity itself, this principle demands explicit transition documentation.

EEJ Sp. z o.o. is a separate legal entity from APATRIS Sp. z o.o. and APATRIS and Co. EEJ has its own team, its own operational continuity needs, its own transition mechanics. This section addresses EEJ ONLY. APATRIS plans address APATRIS team and mechanics separately.

EEJ team (current, May 2026):

- **Manish** — founder, primary decision-maker, build operator
- **Liza** — legal head (legal authority, regulatory compliance, contract review)
- **Anna** — administrative (Manish’s wife; administrative coordination across EEJ; not operator-track but holds emergency activation role)
- **Karan** — coordinator (operational coordination role)
- **Marj** — under Karan (specific role TBD by Manish)
- **Yana** — under Karan + brings contracts (business development, contract sourcing)

EEJ uses APATRIS welding services for some operations (worker placement infrastructure when applicable). APATRIS uses EEJ legal-tech platform for some workflows. This is service consumption between separate entities, not shared operators. EEJ transition plan does not depend on APATRIS team availability.

**THIS SECTION IS A LIVING TEMPLATE.** Manish drafts actual content per layer based on current real state (who actually has access to what, what really happens day-to-day if Manish unavailable). The structure below is the scaffold; the contents must be written by Manish (with chat-Claude as drafting assistant) reflecting EEJ operational reality, not aspiration.

**Privacy and access:** This section contains operationally sensitive information (succession authority, banking access, credential locations). Recommended storage: separate encrypted document referenced from this plan, NOT verbatim in plan file. Plan file documents the structure; encrypted document holds the values. Encrypted document accessible to: Manish + Anna + designated EEJ successor + EEJ legal counsel.

## Layer 1 — Day-to-Day Operator Absence (1-7 days)

**Trigger scenarios:** Travel without internet, illness, intentional disconnect day, family emergency requiring 1-7 days operator absence.

**EEJ operational continuity:**

Day-to-day operations:

- Karan handles operational coordination (workflow continuity, team coordination)
- Marj continues current responsibilities under Karan’s coordination
- Yana continues contract pipeline + business development conversations
- Liza handles any legal questions arising during absence (regulatory queries, contract reviews, compliance issues)
- Client communications: route to Karan as primary; escalations to Liza for legal matters or to Manish-on-return for strategic matters

Build operations:

- EEJ Claude (Claude Code in repo terminal) continues with existing Save Prompt structure if Manish drafted prompts before absence
- chat-Claude session pauses (requires Manish to drive)
- New build work pauses; maintenance only (Sentry alerts addressed if critical, otherwise queued)
- Daily Health Check Ritual pauses or simplified version (Karan notes any visible production issues, defers detailed review to Manish return)

Communication routing:

- Operational issues: Karan
- Legal issues: Liza
- Contract pipeline: Yana
- Personal/family: Anna
- Build-specific issues: queued for Manish return (no third party drives build operations during Layer 1 absence)

Decision authority during absence:

- Karan: operational decisions within current scope, no new strategic commitments
- Liza: legal authority within her existing scope (contract review, compliance responses)
- Yana: contract pipeline conversations, no signed commitments without Manish concurrence
- Anna: family decisions, personal financial decisions per existing arrangement; no EEJ business decisions

Build state at end of absence:

- Manish reads EOD docs from Day N (last day before absence) to resume context
- EEJ Claude state preserved in working context (or rebuildable from plan files + EOD docs)
- Pending Item 2.X items unchanged (paused, not lost)

**TO BE DRAFTED BY MANISH:** specific decision authority thresholds for each EEJ team member, specific routing protocols, specific access credentials list (banking, vendor accounts, EEJ-specific tooling).

## Layer 2 — Extended Operator Absence (1-4 weeks)

**Trigger scenarios:** Extended illness, sabbatical, family crisis requiring weeks of operator absence, intentional planned disconnect.

**EEJ operational continuity:**

Layer 1 handoffs continue, plus:

Operations extended:

- Karan handles full operational authority within existing client/service contracts
- New client conversations: pause OR Karan handles per delegated authority (TBD)
- Liza expands legal authority during absence (sign-off on contracts within pre-defined scope, regulatory responses)
- Yana continues contract pipeline; signing authority requires Manish concurrence via async OR Liza+Karan joint authority (TBD)
- Marj operations continue under Karan’s expanded coordination

Banking + financial:

- Banking signatory: [TO BE DEFINED — Anna joint signatory? Karan? Liza? Multi-signatory threshold?]
- Major financial decisions (>X PLN): require Manish concurrence via async communication OR Anna + Liza joint authority (TBD)
- Routine operational expenses: pre-authorized within Karan’s scope (specific PLN threshold TBD)

Build operations:

- EEJ Claude continues maintenance only (no new feature work)
- Production stability monitored by [TO BE DEFINED — Karan with chat-Claude proxy? External monitoring service? Liza for legal-impacting alerts?]
- Critical alerts routed to: [TO BE DEFINED — Karan phone? Liza email? Multi-channel?]
- If build maintenance becomes blocking: option to engage external developer with read access to specific repos (NOT full access — scoped to specific debugging task), authorization Liza+Karan

Knowledge transfer for extended absence:

- Manish writes pre-absence handoff doc covering: current EEJ state, decisions pending, access credentials per role, “if X happens, do Y” runbook for top 5 likely scenarios
- This doc becomes operational truth during absence
- Updated each pre-planned absence; versioned with date

Build state at end of extended absence:

- Manish reads handoff doc + recent EOD docs to resume context
- Build pace gradually resumes (don’t immediately push hard — restore rhythm first)
- Item 2.X follow-ups review for any deferred items that became urgent during absence

**TO BE DRAFTED BY MANISH:** specific banking signatory delegations, specific decision authority thresholds per role, specific monitoring service contracts, specific external developer relationship (or explicit “no external developer access” decision), specific Liza+Karan joint authority scope.

## Layer 3 — Permanent Operator Transition (Planned Succession or Unplanned)

**Trigger scenarios:** Manish decides to step back from active EEJ operations (planned succession after build maturity), Manish takes different EEJ role (e.g., chairman vs CEO), Manish becomes permanently unable to operate (medical, etc.).

**EEJ succession options:**

EEJ Sp. z o.o. is the purest “Manish’s vision” entity of the three businesses. Succession decision is harder than welding or immigration entities because EEJ’s strategic direction is most operator-dependent.

Three succession paths Manish must choose between:

**Path A — Continue EEJ as legal-tech platform under successor:**

- Successor identification: [TO BE DEFINED — Liza? Karan? External hire? Combined operator team?]
- Operational handoff: successor reads EEJ_CORE_PLAN.md (with version history preserving reasoning), EOD docs archive, plan files, recovery procedures
- Knowledge transfer protocol: 6-month overlap with Manish before full transition; successor develops own relationships with key clients/contracts/lawyers during overlap
- Build maintenance: EEJ Claude can run maintenance with new operator at lower fluency level initially (~3-6 months to reach Manish-equivalent operational fluency with discipline patterns)
- Ownership transition: existing shareholder structure mechanics; adjustments needed before succession TBD

**Path B — Sell EEJ to legal-tech buyer:**

- EEJ as platform has acquisition value (multi-tenant legal-tech infrastructure with worker continuity North Star)
- Sale process: lawyer-led, valuation based on operational state at sale time
- Team transition: Liza/Karan/Yana/Marj either transition with sale OR receive severance + redeployment opportunity
- Build access: transferred to acquirer

**Path C — Wind down EEJ:**

- Graceful sunset (data export, notify users, sunset platform with reasonable notice — typically 90-180 days)
- Worker contracts honored OR transitioned to APATRIS welding/immigration entities
- Client relationships transitioned with reasonable notice
- Build: archive read-only; team severance + redeployment

**Manish must declare intent before succession plan can be detailed.** Each path has different transition mechanics, different team implications, different timing constraints.

Knowledge transfer protocols (general, applies to Path A primarily):

Documents that must be sufficient for new EEJ operator:

- EEJ_CORE_PLAN.md (this document, with version history preserving reasoning)
- EOD docs archive (build continuity)
- Migration ledger (database evolution)
- Recovery procedures (operational disaster handling)
- Operator transition plan (this section)
- Encrypted credential document (banking, vendor accounts, key services)
- Client/contract registry
- Team member context: roles, scopes, current assignments (Liza, Karan, Marj, Yana, plus any future hires)

Build maintenance plan post-transition:

- Path A: EEJ Claude continues maintenance + selected new feature work per successor priorities
- Path B: EEJ Claude transferred to acquirer with operational documentation
- Path C: EEJ Claude archived; maintenance mode only during sunset period

Ownership transition mechanics:

- Existing shareholder structure determines immediate mechanics
- Adjustments needed before succession: [TO BE DEFINED — review with lawyers, possibly amend articles of incorporation, possibly create succession trust]

**TO BE DRAFTED BY MANISH:** EEJ succession path decision (Path A / B / C / hybrid), specific successor identification if Path A, specific 6-month overlap protocol, specific shareholder structure adjustments needed, specific timing for succession trigger.

## Layer 4 — Catastrophic Operator Absence (Sudden Permanent)

**Trigger scenarios:** Sudden death, severe medical emergency removing operational capacity permanently, accident, kidnapping, any event causing immediate permanent operator absence without planned transition.

This is the layer most operators avoid documenting because it requires confronting mortality. Manish’s principle “every vision should have a plan and not hope to reach the plan” applies here especially.

**Immediate continuity (first 72 hours):**

Family-side mechanics:

- Anna receives notification per emergency contact protocol
- Anna has access to: [TO BE DEFINED — banking, business email accounts, this plan document, encrypted credential document, EEJ legal counsel contacts, Karan/Liza contacts]
- Anna’s decision authority: full personal decisions (medical, family, funeral); EEJ business decisions limited to “do not panic, do not signal distress to clients/team, route to Liza + Karan + EEJ legal counsel”

EEJ business-side mechanics:

- Liza receives notification + activates Layer 2 legal authority immediately + manages communications to clients/regulatory bodies
- Karan receives notification + activates Layer 2 operational authority immediately
- Yana continues contract pipeline conversations on hold (no signed commitments)
- Marj continues current responsibilities under Karan
- Team receives minimal communication: “Manish is temporarily unavailable; Karan handling operations, Liza handling legal; we will provide updates within 7 days” — NOT immediate disclosure of catastrophic absence (avoids contract panic + regulatory complications)
- EEJ legal counsel briefed on Layer 4 protocol activation

**Short-term continuity (3-30 days):**

EEJ operations continue under Layer 2 protocol (extended absence) with Liza + Karan acting in expanded authority
Family + lawyers begin Layer 3 succession protocol per Manish’s pre-declared path (A/B/C)
Ownership transition mechanics activate per shareholder structure + last will + insurance
Bank accounts may freeze pending estate proceedings — this is why Layer 2 banking signatory delegation matters; if Anna OR Liza+Karan has joint signatory authority, business cash flow continues

**Medium-term resolution (1-12 months):**

Layer 3 succession plan executes per pre-defined succession decision (Path A / B / C)
Estate proceedings complete ownership transitions
Build state: maintenance only / new operator / acquirer / wind-down per Layer 3 decision
Client relationships transitioned, sold with platform, OR terminated with notice
Vendor relationships transitioned OR terminated
Team transitions: continue with successor, transition with acquirer, OR severance + redeployment

**Documentation that must exist BEFORE catastrophic event:**

1. This plan section (with TO-BE-DEFINED items actually filled in)
1. Encrypted credential document accessible to Anna + EEJ legal counsel
1. Last will + estate plan reflecting EEJ succession intent (Path A/B/C declared)
1. Insurance policies (life insurance, key-person insurance for EEJ specifically)
1. Joint banking signatory delegations active
1. EEJ legal counsel briefed on succession plan (Liza + external counsel both aware of Layer 3 + Layer 4 protocols)
1. Anna briefed on emergency activation procedure
1. Liza + Karan briefed on Layer 2 emergency authority activation

**Three-line summary for non-builder successor:**

Written by Manish in plain language for Anna OR family member OR lawyer who isn’t a builder:

“This is what EEJ exists to do: [North Star + worker continuity + foreign worker advocacy through legal-tech]. This is what matters: [active client commitments + team obligations + worker-facing commitments]. This is who to call: [EEJ legal counsel + Liza + Karan + accountant + insurance + Anna for personal decisions].”

This 3-line summary is the absolute minimum operational artifact. Without it, catastrophic absence creates business chaos that harms team + clients + workers.

## Implementation Sequence

This plan section becomes addressable through phased execution, not all-at-once writing:

**Phase 1A — Layer 1 baseline (next 7 days):**

- Manish drafts Layer 1 specifics (decision authority thresholds, routing protocols)
- Brief Karan + Liza + Yana on Layer 1 authority
- Document specific bracketed items in this plan section
- Test: Manish takes 2-day intentional disconnect, observes what breaks

**Phase 1B — Layer 2 baseline (next 30 days):**

- Manish drafts Layer 2 specifics (banking signatory, monitoring protocols)
- Execute banking signatory delegations
- Set up monitoring service contracts OR explicit “no monitoring service” decision with team alert routing
- Brief Karan + Liza on Layer 2 authority
- Document specific bracketed items

**Phase 1C — Layer 3 + 4 baseline (next 90 days):**

- Manish makes EEJ succession path decision (Path A / B / C / hybrid)
- If Path A: identify successor (Liza? Karan? External hire?)
- Review will + estate plan with lawyers
- Review insurance with broker
- Create encrypted credential document
- Brief Anna on emergency activation procedure
- Document all specific bracketed items
- Schedule annual review of full operator transition plan (catastrophic-layer items can become stale fast — credentials change, relationships change)

**Phase 2 — Maintenance:**

- Annual operator transition plan review (each January)
- Update encrypted credential document quarterly
- Re-brief Karan + Liza + Yana + Anna on changes annually
- Test Layer 1 once per year (intentional disconnect day)
- Test Layer 2 once per 2 years (intentional 1-week disconnect)

## Discipline Note

This plan section honors Manish’s stated principle: “every vision should have a plan and not hope to reach the plan.”

EEJ operator continuity is a vision component. Without explicit plan, it’s hope. With this section drafted (and TO-BE-DEFINED items filled in), it becomes plan.

The discipline is: don’t leave this section as scaffold forever. Phase 1A starts within 7 days. Phase 1B within 30 days. Phase 1C within 90 days. Each phase converts scaffold into operational reality.

If 90 days pass and bracketed items remain unfilled, the principle is violated. Audit pattern weakness lesson applies: claim of operator-redundancy without verification mechanism is hope, not plan. AC-8.X “Verification Mechanism Discipline” applies here too.

**APATRIS keeps its own separate operator transition plan in APATRIS_CORE_PLAN.md (when APATRIS_CORE_PLAN.md exists on disk per Day 20 Knowledge Management Audit finding).** APATRIS plan reflects APATRIS team and APATRIS-specific mechanics. No cross-build duplication, no shared operator dependency between EEJ and APATRIS plans. Each plan is self-contained for its own entity.

-----

# WORKER COMMUNICATION RESILIENCE — PHASE 2 INVESTMENT

**Why this exists:**

Item 2.1 (Day 18) shipped WhatsApp pipeline as primary communication channel. WhatsApp is best-effort, not guaranteed delivery. Workers operating across European job sites face real conditions where messages get missed:

- Phone storage full → messages don’t arrive
- Notifications disabled → messages arrive but worker doesn’t see
- Switched phones → WhatsApp number changes, messages lost
- Twilio number blocked by carrier (rare but happens) → silent failure
- Intermittent internet at construction/welding sites → messages queued indefinitely
- Worker reads on WhatsApp but later can’t find the message (chat history degrades)

These are not theoretical edge cases. Foreign workers placed by EEJ are the primary user population — phone access patterns vary widely across countries, carriers, and economic situations.

**Strategic value:**

Reliability — workers receive messages even when single channel fails. Operations can trust that critical communications (permit status, payroll, safety alerts, immediate scheduling) reach workers.

Audit trail — every worker communication logged in our DB, not split across Twilio + WhatsApp Business + email. Compliance regulators can verify communication history.

Operator efficiency — unified view of all worker communications (instead of fragmented across channels).

Worker autonomy — searchable communication history within app. Worker can reference past communications (“what did office say about my permit last month?”) without scrolling WhatsApp infinitely.

Offline capability — workers at job sites without internet can still access essential documents (work permits, contracts, safety procedures, emergency contacts).

## Layer 1 — Dual Delivery (WhatsApp + In-App Inbox)

**Goal:** Every outbound WhatsApp message also lands in worker’s in-app inbox in EEJ mobile app. Same content, two delivery channels.

**Current state (per Day 19 Mobile Resilience Audit):**

- whatsapp_messages table exists (Item 2.1). Reads now trustworthy after Item 2.3 Pattern B closure (Day 19).
- Worker portal has 4 endpoints (/portal/token, /portal/me, /portal/hours, /portal/send-whatsapp). No /portal/messages or /api/inbox endpoint.
- eej-mobile-HIDDEN has no Messages tab or inbox UI. Candidate role bottom nav has 4 tabs (room for 5th).
- WhatsApp purely external from mobile app perspective today (Twilio sends to worker’s phone, no mobile inbox surface).

**Scope:**

Schema additions:

- `whatsapp_messages` table (Item 2.1) — add `worker_inbox_visible BOOLEAN DEFAULT TRUE`
- New endpoint `GET /api/worker/inbox` — returns messages where worker_id matches authenticated worker + worker_inbox_visible=TRUE

Mobile UI additions:

- New “Messages” tab in eej-mobile-HIDDEN bottom navigation
- Reads from /api/worker/inbox
- Renders messages chronologically with timestamps
- Marks read state per message (worker has seen vs new)
- Reply input field (replies route via same Twilio pipeline back to operator OR stay in-app — operator surface decides which)
- Search within messages (operator name, date range, keyword)

Architectural pattern:

- WhatsApp delivery + in-app delivery happen in parallel (single send → two channels)
- Reply from in-app surfaces in same operator interface as WhatsApp reply (unified inbox for operators)
- If WhatsApp fails, in-app remains functional (graceful degradation)
- If in-app fails (no internet), WhatsApp remains functional

**Time cost:** 1-2 weeks of focused Phase A → Phase B work.

**Done when:** workers receive same message via WhatsApp + see it in EEJ mobile app inbox. Reply from either channel. Operator sees unified history. Manish signs off.

## Layer 2 — In-App Message Inbox (search + history)

**Goal:** Workers have searchable communication history within EEJ mobile app independent of WhatsApp message persistence.

**Scope:**

Builds on Layer 1 infrastructure. Adds:

- Long-term message history (90+ days, configurable per tenant)
- Full-text search across messages (operator name, date, keyword, message type)
- Message categorization (system / operator / payroll / permit / safety / etc.)
- Pinned messages (worker bookmarks important communications)
- Read receipts shown to operator (worker has acknowledged message)
- Translation-on-demand (worker sees English by default, can request Polish translation per message — leverages Item 2.2 i18n infrastructure)

**Time cost:** 1-2 weeks on top of Layer 1.

**Done when:** workers can find any past communication via search. Operators see read receipts. Translation-on-demand works for Polish-required surfaces. Manish signs off.

## Layer 3 — Offline Mode (PWA + document caching)

**Goal:** Workers at job sites without internet can access essential documents + recent messages + safety information.

**Current state (per Day 19 Mobile Resilience Audit):**

- manifest.json complete + well-formed (display:standalone, theme color, icons including maskable, scope:”/”). App is INSTALLABLE as PWA today — installable but not offline-capable.
- Zero service worker registration calls. No vite-plugin-pwa. No workbox. No cache strategies.
- Zero IndexedDB / localforage usage. localStorage used 32 times (auth tokens + eej_lang preference only).
- Zero navigator.onLine references. No online/offline event handlers. No queue persistence.
- TanStack Query initialized in App.tsx but NOT persisted (in-memory cache only, lost on reload). Free upgrade opportunity once service worker lands.

**Scope:**

PWA (Progressive Web App) infrastructure:

- Service worker registration for eej-mobile-HIDDEN (vite-plugin-pwa recommended)
- manifest.json already complete (Day 19 audit confirmed). PWA installable today.
- Cache strategies per content type (documents = cache-first, messages = stale-while-revalidate, API calls = network-first with offline fallback)
- TanStack Query persistence (free upgrade once SW lands — currently QueryClient initialized but cache lost on reload)
- Optional proactive “Install EEJ” button using beforeinstallprompt event

Offline-accessible content:

- Worker’s own documents (work permit, contract, A1 certificate, payslip last 90 days)
- Last 30 days of messages (synced when online, available offline)
- Safety procedures and emergency contacts (always cached)
- Job site information (current assignment, location, supervisor contact)
- Polish/English language toggle (works offline per Item 2.2)

Sync queue:

- Worker actions taken offline (mark message as read, submit form, request document) queue locally
- On reconnect, queue replays to server
- Conflict resolution for stale data (server wins for system updates, client wins for worker-initiated actions)

UI indicators:

- “Offline” badge when network unavailable
- “Syncing” indicator when reconnecting
- Stale data warnings (“Last updated 2 hours ago”)
- Action queue visibility (“3 actions pending sync”)

**Time cost:** 2-3 weeks on top of Layer 1 + Layer 2.

**Operational cost:** $0 incremental. PWA + service workers are browser-native. No new vendor.

**Done when:** worker can open EEJ mobile app at job site without internet, view their permit + contract + last 30 days of messages + safety procedures. Actions taken offline sync correctly when reconnected. Manish signs off.

## Sequence Discipline

All 3 layers built sequentially. Each applies full Phase A → Phase B → Self-Review discipline. Each closes with verbatim git log -1 + verbatim deploy verification.

Build order non-negotiable:

- Layer 1 first (dual delivery — needs whatsapp_messages schema extension + new endpoint + mobile UI tab)
- Layer 2 second (compounds Layer 1 with search + history features)
- Layer 3 third (compounds Layers 1-2 with offline access infrastructure)

**Total time investment:** 3-6 weeks of focused evening work (1-2 + 1-2 + 2-3).

## Sequencing Within Phase 2

Worker Communication Resilience is one of several Phase 2 workstreams. Sequencing recommendation:

1. Movement 2 + Movement 3 closure first (operational stability)
1. Sales agent revenue features (sending pipeline + discovery agent) — these unblock revenue
1. Procedural Memory Layer 1-2 (skills + distillation) — build infrastructure foundation
1. Worker Communication Resilience Layer 1 (dual delivery) — fastest path to operational impact for foreign workers
1. Other Phase 2 items interleaved
1. Worker Communication Resilience Layers 2-3 — compound on Layer 1
1. Procedural Memory Layer 3-5 (memory consolidation infrastructure) — build when portfolio history justifies

Manish + chat-Claude review sequencing at Phase 2 entry. Operational reality may shift priorities (e.g., if a worker incident reveals offline gap as urgent, Layer 3 jumps priority).

## Mirror to Other Builds

After Worker Communication Resilience layers ship in EEJ, patterns mirror to APATRIS legal-tech where applicable:

- Dual delivery for legal communications (TRC status, court filings, hearing notifications)
- In-app inbox for legal case history
- Offline access for legal documents (powers of attorney, evidence files, appeal drafts)

Sales agent / labour-contract-intelligence: less applicable (operator-facing, not worker-facing) but in-app inbox pattern could apply to operator dashboard for buyer conversation history.

Cross-build mirror follows same lazy integration model documented in CROSS-BUILD ASSETS section.

-----

# PROCEDURAL MEMORY LAYER — PHASE 2 INVESTMENT

**Day 20 reframe (May 8 2026):**

This section was originally drafted Day 18 assuming Layer 1-5 was greenfield work across all builds. Day 19 APATRIS Knowledge Management Audit (docs/KNOWLEDGE_MGMT_AUDIT.md in APATRIS Compliance Hub) revealed APATRIS already has substantial Layer 1-3 equivalents built:

- **Skills directory FULLY BUILT in APATRIS** — across 3 locations (artifacts/api-server/skills/ with 3 skills + .agents/skills/ with 4 skills + .claude/skills/superpowers/ with 15 skills like using-git-worktrees, TDD, etc.)
- **Vector retrieval substrate FULLY BUILT in APATRIS** — pgvector + Voyage embeddings + 4 vector(1024) columns + HNSW indexes + 5 lib files (embeddings, rag)
- **Knowledge graph FULLY BUILT in APATRIS** — kg_* tables auto-populate on case status changes (9 exported functions, 5 caller files)
- **Vault unified search FULLY BUILT in APATRIS** — searches across 6 categories with relevance scoring
- **Obsidian export pipeline FULLY BUILT in APATRIS** — obsidian_exports table + service + 4 routes at /v1/obsidian/* + filesystem export to obsidian_exports/regulatory/YYYY/MM/

EEJ has the kg_nodes + kg_edges substrate (Pattern B closure Day 19 Commit 3d). Beyond that, EEJ has not built equivalent infrastructure.

**Architectural implication:**

Procedural Memory Layer for EEJ is NOT greenfield. The strategic question shifts from “build Layer 1-5 from scratch in EEJ” to “evaluate whether to mirror APATRIS patterns to EEJ vs build EEJ-native versions vs share APATRIS infrastructure.”

When Phase 2 procedural memory work begins, three architectural options:

**Option α — Mirror APATRIS patterns to EEJ.** Borrow proven patterns (Skills directory structure, vector retrieval pipeline, vault search, Obsidian export). Each build maintains independent infrastructure but reuses architectural patterns. Lazy integration model (per CROSS-BUILD ASSETS section) — chat-Claude routes patterns, Manish-as-router approves.

**Option β — Build EEJ-native versions optimized for EEJ use cases.** Worker-facing build with different audience (foreign workers vs lawyers). Different content types (job listings, schedules, payroll vs legal cases, court filings). May warrant different retrieval models, different search semantics. More work but better fit.

**Option γ — Shared substrate via legal-tech access decision.** When APATRIS legal-tech reaches Item 3.8 stable state and Movement 2-3 closes, Option A (tenant access to shared APATRIS infrastructure) becomes feasible. EEJ becomes one tenant of shared procedural memory infrastructure. Same workers traveling between EEJ + APATRIS + APATRIS Sp. z o.o. + APATRIS legal-tech use shared knowledge layer.

Decision deferred to Phase 2 entry timing. Current Movement 2 + Movement 3 work doesn’t depend on this decision.

**The original 5-layer architecture below remains valid as conceptual framework. Layer 1-3 are partially built in APATRIS (per audit). Layer 4-5 are greenfield across portfolio. Time investment estimate (~6-10 weeks) was for greenfield assumption — reality estimate depends on chosen option (α/β/γ).**

-----

**Why this exists:**

Today (Day 18), three Movement 2 EEJ items closed using disciplined Phase A → Phase B → Self-Review pattern. The patterns that worked are held in operator memory + commit messages + EOD docs + save prompts. None are formally extracted as retrievable artifacts. As the portfolio scales (months of history, hundreds of conversations, three builds compounding), implicit knowledge becomes harder to retrieve.

Procedural Memory Layer addresses this systematically. Inspired by jcode’s architecture (skills system + semantic memory + ambient consolidation). Adapted for Manish’s three-build operating model (EEJ + APATRIS legal-tech + sales agent / labour-contract-intelligence) where chat-Claude + Manish-as-router cross-pollinate patterns opportunistically.

**Strategic value:**

Reliability — system reminds itself of past mistakes, past solutions, past architectural decisions. Reduces re-derivation of patterns from scratch.

Bus-factor protection — patterns held only in operator memory don’t survive operator absence. Explicit declarative artifacts survive.

Competitive differentiation — most AI builds run stateless or with primitive context windows. Builds with persistent procedural memory + semantic retrieval compound knowledge competitors can’t match.

Cross-build knowledge sharing — APATRIS Claude querying memory finds relevant patterns from EEJ + sales agent. Sales agent Claude finds relevant patterns from APATRIS legal-tech. The shared-substrate principle proven on small scale today (Item 2.2 borrowed Polish translations, Item 2.5 borrowed recovery doc structure) becomes infrastructure rather than manual routing.

Token economics not a concern — Manish’s Max 20x plan + product-quality priority. Build for reliability, not token efficiency.

## Layer 1 — Skills/ Directory (declarative pattern repository)

**Goal:** Move implicit patterns to explicit declarative SKILL.md files in each build’s repo.

**Scope:**

Create `~/Desktop/EURO-EDU-JOBS-app/skills/` directory structure:

```
skills/
├── README.md (master index)
├── discipline/
│   ├── phase-a-phase-b-self-review.md
│   ├── verified-before-done.md
│   ├── reality-vs-plan-escalation.md
│   ├── cross-pass-recharacterization.md
├── deployment/
│   ├── single-commit-rebase-pattern.md
│   ├── pre-condition-setup-before-phase-b.md
│   ├── ssh-script-via-sftp.md
│   ├── flyctl-rollback-procedures.md
├── reuse/
│   ├── shared-substrate-borrow.md
│   ├── snapshot-not-link-architecture.md
│   ├── apatris-compliance-hub-mirror-pattern.md
├── boundaries/
│   ├── hard-boundaries-1-16.md
├── validation/
│   ├── twilio-authenticate-verification.md
│   ├── neon-pitr-retention-check.md
```

**Per-skill structure:**

Each skill = standalone markdown file with:

- Skill name
- When to use (specific triggers)
- What it is (pattern in plain language)
- Prompt template (if applicable, reusable save prompt fragment)
- Verification gate (how to know skill applied correctly)
- Origin (which task discovered/proved this)
- Examples (2-3 concrete instances)
- Version (Day, date, version number)

**Reference integration:**

CLAUDE.md updated with: “Reference skills/ directory for explicit reusable patterns. Activate skill by name in save prompts.”

EEJ_CORE_PLAN.md cross-build assets section updated to point at skills/ as canonical source.

**Mirror to other builds:**

After EEJ skills/ is built, APATRIS chat-Claude and sales chat-Claude mirror the structure into their repos. Each build populates with build-specific patterns. Consistent structure across portfolio.

**Time cost:** 3-5 evenings of focused Phase A → Phase B → Self-Review work.

**Done when:** skills/ directory committed in EEJ. Initial skills extracted from existing patterns. CLAUDE.md + EEJ_CORE_PLAN.md reference skills/. Manish signs off.

## Layer 2 — Skill Distillation Closed-Loop

**Goal:** After every closed item, automatically propose new skills based on what worked. Knowledge compounds without manual extraction effort.

**Scope:**

End-of-task hook integrated into EEJ Claude workflow:

After item closure (Phase B commit + verbatim verification), EEJ Claude proposes 0-3 candidate skills based on what worked during the item. Format:

```
SKILL DISTILLATION — Item X closure proposal

Candidate Skill 1:
- Name: <descriptive>
- When to use: <triggers>
- Pattern: <what worked>
- Origin: Item X, commit <SHA>

Candidate Skill 2: ...

Awaiting Manish + chat-Claude approval. Approve / refine / reject per candidate.
```

Operator approves or refines. Approved skills written to skills/ directory. Refined skills updated before write. Rejected skills logged for review.

**Implementation pattern:**

Hook fires after GATE T<item>-PHASE-B-DEPLOY (or equivalent close gate). Reuses existing Phase A → Phase B → Self-Review discipline applied to skill creation.

**Idempotency:**

Each skill checked against existing skills/ before write. If similar skill exists, propose update vs new. Versioning preserved.

**Time cost:** 2-3 evenings on top of Layer 1.

**Done when:** distillation hook fires automatically at item closure. Three test items pass through hook successfully. Skills/ grows organically from real work. Manish signs off.

## Layer 3 — Memory Consolidation Infrastructure (Semantic Retrieval)

**Goal:** Every conversation turn, every commit message, every EOD doc, every plan section embedded as semantic vector. Future Claude Code sessions retrieve relevant historical context automatically. No grep needed.

**Scope:**

Postgres + pgvector inside existing Neon database (or dedicated vector DB instance).

Background process embeds:

- All commit messages (git log of repo)
- All EOD docs (docs/ directory)
- All plan sections (EEJ_CORE_PLAN.md, APATRIS plans, ARCHITECTURE.md)
- All Phase A findings + Phase B plans
- All save prompts (preserved history)
- All chat-Claude conversation summaries (when persisted)

Retrieval API:

- Semantic similarity query via cosine similarity
- Top-K results returned with source attribution
- Retrieval threshold tunable
- Results injected into Claude Code context at session start (or on-demand)

Consolidation:

- Periodic background process detects duplicate/near-duplicate entries
- Merges, preserves source attribution
- Detects staleness (entries older than freshness window for evolving topics)
- Resolves conflicts (contradictory memories surface for operator review)

**Build-protection considerations:**

Hard Boundary 14 (no DB row deletion) applies to memory store.

Embeddings generated via Anthropic API (within Max 20x quota) — not exposing data to third-party services beyond what’s already used.

Vector DB hosted in same infrastructure as primary DB (Neon eu-central-1) — no new vendor dependency.

Backup posture: vector DB included in Neon PITR window (already 14 days).

**Time cost:** 2-3 weeks of focused Phase A → Phase B work.

**Operational cost:** ~$0 incremental. pgvector free, embeddings via Max 20x quota.

**Done when:** semantic retrieval API operational. Initial embedding pass complete (all repo history embedded). Consolidation process running periodically. Three test queries return relevant results with verified attribution. Manish signs off.

## Layer 4 — Cross-Build Memory Consolidation (Portfolio-wide Retrieval)

**Goal:** APATRIS Claude querying memory finds relevant patterns from EEJ + sales agent. Sales agent Claude finds relevant patterns from APATRIS legal-tech. Cross-build knowledge sharing becomes infrastructure.

**Scope:**

Shared pgvector instance (or federated query layer) accessible to all three builds.

Tagging system: every embedded entry tagged by source build (eej / apatris / sales-agent).

Retrieval API normalizes results across builds. Default scope: same-build only. Optional flag: cross-build query when shared-substrate value justifies.

Privacy/security:

- APATRIS legal-tech client data (Manish’s actual TRC cases) NEVER cross-build queryable. Access control at retrieval layer.
- EEJ worker data NEVER cross-build queryable.
- Cross-build retrieval scope limited to: patterns, decisions, architectural docs, plan sections, commit messages. Not raw operational data.

**Time cost:** 1-2 weeks on top of Layer 3.

**Done when:** cross-build retrieval API operational with access controls. Tested query: APATRIS Claude retrieving EEJ’s WhatsApp Twilio pattern returns the relevant skill + commit messages. Manish signs off.

## Layer 5 — Memory Sideagent Verification (Two-stage Retrieval)

**Goal:** When memory retrieval returns results, secondary verification step filters irrelevant matches. Two-stage retrieval = better signal, less noise.

**Scope:**

After Layer 3 retrieval returns top-K results, sideagent (lightweight Claude pass) scores each result for actual relevance to current task. Filters out matches that are semantically similar but contextually irrelevant.

Sideagent uses minimal context (current task + retrieved snippet). Fast, cheap. Returns relevance score 0-100.

Threshold tunable: only results above threshold injected into main Claude context.

**Time cost:** 1 week on top of Layer 4.

**Done when:** two-stage retrieval operational. Three test queries demonstrate noise reduction vs Layer 3 retrieval alone. Sideagent verification pattern documented. Manish signs off.

## Sequence Discipline

All 5 layers built sequentially. Each layer applies full Phase A → Phase B → Self-Review discipline. Each closes with verbatim git log -1 verification + verbatim deploy verification (where applicable).

Build order non-negotiable:

- Layer 1 first (foundation)
- Layer 2 second (compounds Layer 1)
- Layer 3 third (infrastructure for Layers 4-5)
- Layer 4 fourth
- Layer 5 fifth (refinement)

**Total time investment:** 6-10 weeks of focused evening work.

## Sequencing Within Phase 2

Procedural Memory Layer is one of several Phase 2 workstreams. Sequencing recommendation:

1. Sales agent revenue features first (sending pipeline + discovery agent) — these unblock revenue
1. Procedural Memory Layer 1-2 (skills + distillation) — fast value, foundation for later layers
1. Other Phase 2 items (EEJ Tier 1 bilingual replication, SaaS scaling, etc.) interleaved
1. Procedural Memory Layer 3-5 (consolidation infrastructure) — built when portfolio history mass justifies (likely 6+ months of accumulated EOD docs + commit messages)

Manish + chat-Claude review sequencing at Phase 2 entry. Operational reality may shift priorities.

## Mirror to Other Builds

After EEJ Procedural Memory Layer (or any layer) is built, pattern mirrors to APATRIS + sales agent following same lazy integration model documented in CROSS-BUILD ASSETS section. APATRIS chat-Claude and sales chat-Claude adapt the layer for their build’s specifics. Each build’s procedural memory infrastructure is independent but architecturally consistent.

-----

# NOT PLANNED BY DESIGN (actively rejected, with reason)

These are not “deferred.” They are **out of scope for the entire core plan**, with reason.

- **New AI sub-agents beyond what compliance + payroll + recruitment surfaces require** — focus is closing what’s broken, not adding new AI surfaces. Build less.
- **New worker categories beyond current scope** — current 70 welders + Asia recruitment for global placement is the operational scope. Expansion only after Item 3.7.
- **Third-party integrations beyond Twilio (for WhatsApp) and standard infrastructure** — integration sprawl rejected during stabilization phase.
- **matchScore retention without architectural intervention** — Gap 3 must close. Either remove, restructure, or restrict. Current operational matchScore is hallucination surface.
- **Production credentials accessible to AI agents** — Item 3.0 closes this gap.

-----

# SECURITY — STANDING PROTECTIONS (always in force, same framework as APATRIS)

*The build’s protection layers. None are optional. Reviewed at every save-prompt before any state-changing operation.*

## Layer 1 — Stage protection (every stage stored, immutable)

**GitHub remote (origin/main) — code history.**

- Every commit on origin/main is durable on GitHub
- EEJ Claude cannot delete commits from GitHub remote
- Roll back to any prior state: `git checkout <sha>` brings the entire codebase back to that point

**Fly image registry — deployed bundle history.**

- Every prod deploy creates a unique image tag
- Images stored by Fly, not by EEJ Claude
- EEJ Claude cannot delete Fly images
- Rollback: `flyctl image deploy --app eej-jobs-api <previous-tag>`

**Strategic stage markers — daily EOD documents.**

- EEJ EOD docs at `/mnt/user-data/outputs/` capture state at end of day

## Layer 2 — EEJ Claude operational restrictions (every save-prompt)

The 16 hard boundaries restated verbatim in every save-prompt. Override mode active for every save-prompt: default auto-commit pattern is OFF; every state-changing operation requires explicit Manish go.

## Layer 3 — Stop-and-confirm gates at every boundary

Same pattern as APATRIS. EEJ Claude stops at every operational boundary and waits for explicit Manish “go.”

## Layer 4 — Production DB data backup

Currently: prod EEJ DB is Neon. Verify Neon PITR enabled with appropriate retention. Action item: Item 2.5 (Recovery Documentation) closes this.

For Item 3.7 onwards (real worker cases flowing): Neon backup configuration must be verified before real data starts flowing. Hard precondition.

## Layer 5 — Three-engine partnership review

- **Manish** — final decision on every state-changing operation
- **chat-Claude** — drafts save-prompts, holds the plan, integrates Holmes review where needed
- **Holmes** — structural review for high-risk items (encryption, schema changes, architectural decisions)
- **EEJ Claude** — executes within boundaries, reports at gates

Risk-graded review pattern same as APATRIS.

## Layer 6 — Quiet hours protection

22:00 to 05:00 Poland time:

- No permission prompts
- No decision requests
- No choice points
- Routine read-only commands pre-authorized
- Findings logged silently
- Decisions wait until 05:00 PL or Manish check-in

-----

# WHAT STAYS ALIVE BETWEEN ITEMS

**Discipline:**

- 8-step ritual (Build / Test / Report / Fix / Test the fix / Report / Push / Deploy)
- Suggest-then-execute, every suggestion with a reason
- Test data only, never real data (Standing Rule 3)
- Verified before done (Standing Rule 1)
- No new features until broken ones fixed (Standing Rule 2)
- Anti-hallucination per-pass (Discipline 1)
- Build protection layers (Discipline 2)
- Dedup before building — use what exists, polish to connect, don’t rebuild
- Slow and steady wins the race
- 11/10 — keep margin
- 4-question filter applied to any proposed work

**Constants:**

- Bilingual Polish-authoritative + English-bridge (especially for mobile, where workers actually read)
- Dummy data discipline
- Real users (Anna + EEJ operators + 70 welders + Asian foreign workers placed globally)
- EEJ Claude operates within the 16 hard boundaries
- Cross-repo READ access to APATRIS confirmed (Day 17); WRITE forbidden by default

-----

# HOW WE TICK ITEMS

After each item:

1. EEJ Claude reports done with verification
1. Manish + chat-Claude review
1. Manish signs off — item ticks
1. EOD documentation captures completion
1. Memory updates if needed
1. **Then** the next item begins — not before

**No parallel work beyond the explicit Movement 2 parallel item (Item 2.2 mobile rewrite). No skipping. No off-track.**

**Every save-prompt to EEJ Claude includes:**

1. Architectural assumptions at top
1. Pre-execution verification (V1/V2/V3 + V3a external imports check + V3b history stability check where applicable)
1. Output structure (one new sub-file at exact path)
1. Execution order (numbered items grouped into gates)
1. Stop-and-confirm gates at boundaries
1. The 16 hard boundaries restated verbatim
1. Report format at each gate
1. Escalation rules for item-internal expansion
1. Anti-hallucination check (where AI generation happens)
1. Build-protection check (where destructive operations possible)

-----

# WHERE WE ARE — DAY 17, ~10 hours working day ahead

**MOVEMENT 1 — IN PROGRESS**

- Item 1.1: ✅ TICKED Day 17 (May 5 2026, 12:20 UTC+02:00) — commit 591a50a on origin/master

**MOVEMENT 2 — IN PROGRESS** (begins now; Movement 1 ticked)

- Item 2.1: ⬜ Step 3 activation (HIGHEST PRIORITY) — Phase A read-only investigation pending
- Item 2.2: ⬜ Mobile bilingual rewrite (parallel — doesn’t block on staging or counsel)
- Item 2.3: ✅ Schema-vs-query drift / Pattern B closure (Day 19, afb4054)
- Item 2.4: ⬜ Staging substrate creation
- Item 2.5: ⬜ Recovery Documentation
- Item 2.6: ⬜ Test coverage closure (21 of 33 routes)

**MOVEMENT 3 — pending** (begins after Movement 2 completes; starts with Item 3.0 Infrastructure-level guardrails)

**PHASE 2 — after Item 3.7**

**Today’s discipline:** Movement 2 Item 2.1 (Step 3 activation) begins next. Phase A read-only investigation save prompt being drafted by chat-Claude. Standard Phase A → Phase B discipline applied (same as APATRIS Items 2.2 / 2.3).

**Parallel tracks running today:**

- APATRIS legal-tech: separate chat-Claude session managing APATRIS work
- EEJ: Movement 2 Item 2.1 beginning — Phase A read-only investigation drafting
- Welding business certification plan: real-world track separate from technology builds; Action 1 (radca prawny consultation) when capacity allows
- Labour-contract-intelligence: Codex builds continue at own pace

-----

# CROSS-BUILD ASSETS

EEJ is one of three parallel builds in Manish’s portfolio. The three builds run independently but borrow from each other when patterns or assets prove valuable. Cross-pollination is opportunistic and lazy — Manish (as architect/router) identifies when one build has something another build can use. No unified infrastructure is enforced. This section documents what EEJ has that other builds can borrow + what EEJ has borrowed from elsewhere. It exists so that during build work, awareness of available cross-build patterns is explicit, not held only in human memory.

**Portfolio context:**

- APATRIS legal-tech (~/Desktop/Apatris-Compliance-Hub/) — internal tooling for immigration/welding legal work
- EEJ (~/Desktop/EURO-EDU-JOBS-app/) — foreign worker recruitment platform (this build)
- Sales agent / labour-contract-intelligence (github.com/Maac1980/labour-contract-intelligence) — AI agent system for outbound sales conversations

The three builds share Manish + chat-Claude as cross-pollinator. Each build has its own dedicated Claude Code agent. APATRIS Claude does NOT communicate directly with EEJ Claude or sales agent Claude — coordination happens through Manish + chat-Claude.

## Available to other builds

EEJ has the following patterns or assets that other builds may borrow:

**Phase A → Phase B → Self-Review pattern (process)**

- Origin: matured during EEJ Movement 2 (Items 2.1, 2.2, 2.5 closed Day 18)
- What it is: Read-only investigation phase produces docs/ITEM_X_PHASE_A_FINDINGS.md before any code change. Phase B drafts the change in docs/ITEM_X_PHASE_B_PLAN.md. Self-review check before commit. Verbatim verification at each gate.
- Why valuable: catches errors before production (column name mismatches, command typos, false assumptions about codebase reality)
- Use case for other builds: any item that touches production code or state

**Hard Boundaries 1-16 (process)**

- Origin: EEJ build framework
- What it is: Standard restrictions in every save prompt — repo posture, production DB, commits, migration runner, Fly state, stop-and-confirm, reality-vs-plan escalation, cross-pass recharacterization, verbatim commit messages, override mode, no file deletion, no git history modification, no DB row deletion, no .env modification, cross-repo write forbidden
- Why valuable: prevents AI agent destructive operations
- Use case for other builds: every Claude Code save prompt

**WhatsApp Sandbox + Twilio Content Templates pattern (Item 2.1)**

- Origin: EEJ Movement 2 Item 2.1 closure
- What it is: Twilio sandbox account creation + 3-template Content API setup + DB UPDATE activation pattern + webhook URL configuration + outbound/inbound exercise verification
- Why valuable: any build needing WhatsApp messaging can mirror this without rebuilding from scratch
- Use case for APATRIS: if APATRIS legal-tech ever sends WhatsApp messages (TRC status updates, work permit notifications, etc.)
- Use case for sales agent: if sales agents move to WhatsApp outreach in Polish/German/Slovak markets

**Twilio Authenticate verification discipline (Item 2.1)**

- Origin: Day 18 Step 6 retry after Authenticate error
- What it is: Step 2 “secret present” verification is insufficient — actual outbound test must succeed before declaring credentials operational
- Why valuable: catches typo/stale token errors that pass simple presence checks

**SSH-script-via-sftp pattern (Item 2.1 + Item 2.5)**

- Origin: EEJ Movement 2
- What it is: Read-only DB queries inside production container without exposing credentials, by writing a script via sftp + executing via ssh
- Why valuable: any build needing read-only production verification without local DB exposure

**Verified-before-done discipline (Item 2.1)**

- Origin: Day 18 Step 6 retry catching Twilio Authenticate
- What it is: Don’t mark task closed based on intermediate verification (secrets present, code wired). Wait for end-to-end exercise (real message sent, real reply received).
- Why valuable: prevents false “done” claims that surface as production issues later

**Recovery procedures structure (Item 2.5)**

- Origin: EEJ Movement 2 Item 2.5 closure (mirrored from APATRIS Compliance Hub)
- What it is: 5-section RECOVERY_PROCEDURES.md (Code / Database / Fly / Configuration / Cross-repo) with verification labels (VERIFIED / DOCUMENTED-NOT-VERIFIED / BLOCKED-BY-X) + drill schedule + issue log
- Why valuable: any build can mirror this structure for its own recovery posture
- Note: EEJ borrowed FROM APATRIS Compliance Hub — pattern is now portfolio-wide proven

**Custom React Context i18n with toggle pattern (Item 2.2)**

- Origin: eej-mobile-HIDDEN/src/lib/i18n.tsx
- What it is: 130-LOC custom React Context for i18n without i18next dependency, with navigator.language cold-boot detection, localStorage persistence, LangToggle component
- Why valuable: lightweight i18n for builds that don’t need full i18next overhead
- Use case for sales agent: if labour-contract-intelligence builds operator UI needing PL/EN toggle

**Sentry Express SDK + DSN configuration pattern (Item 2.5 pre-condition)**

- Origin: Day 18 Sentry project creation in apatris-sp-zoo team
- What it is: Sentry project creation flow + Express SDK selection + DSN extraction + flyctl secrets set deployment
- Why valuable: any Node.js build needing error monitoring can follow same flow
- Note: single Sentry team (apatris-sp-zoo) manages portfolio; new projects created per build

**Neon PITR retention pattern (Item 2.5 pre-condition)**

- Origin: Day 18 Neon Console verification + retention increase
- What it is: PITR retention discovery + raise from default to production-appropriate (14d minimum) before any recovery doc commits
- Why valuable: any build using Neon needs this verification before claiming recovery posture

## Borrowed from other builds

EEJ has borrowed the following patterns or assets from other builds:

**APATRIS dashboard Polish translations (Item 2.2)**

- Source: artifacts/apatris-dashboard/src/locales/pl.json (588 PL keys, i18next stack)
- Borrowed: 4 fast-track translations (Hasło, Narodowość, Ostrzeżenie, Prześlij dokumenty)
- Adoption: snapshot copy into eej-mobile-HIDDEN/src/lib/i18n.tsx — no build-time linkage
- Note: 29% match rate empirically — most EEJ-mobile keys don’t have APATRIS equivalents due to brand voice differences (workforce vs compliance)

**APATRIS Compliance Hub recovery procedures structure (Item 2.5)**

- Source: ~/Desktop/Apatris-Compliance-Hub/docs/RECOVERY_PROCEDURES.md (887 LOC)
- Borrowed: full 5-section structure + verification labels + drill schedule format + issue log pattern
- Adoption: 1:1 mirror with EEJ-specific values substituted (eej-jobs-api / neondb / eu-central-1 / 14d retention / ams region)
- Result: 882 LOC docs/RECOVERY_PROCEDURES.md committed at c9681e6 on origin/master

**Phase A → Phase B → Self-Review discipline (Movement 2 framework)**

- Source: APATRIS legal-tech build pattern (matured during APATRIS Items 2.2, 2.3 work)
- Borrowed: complete pattern including save prompt structure, hard boundaries, gate format
- Adoption: applied across all EEJ Movement 2 items (2.1, 2.2, 2.5 closed Day 18 using this discipline)

**Hard validation gates concept (anti-pattern catching)**

- Source: labour-contract-intelligence sales agent build
- Borrowed: pattern of hard gates (always block) vs soft warnings (review-flagged)
- Adoption: informed EEJ build-protection thinking (Discipline 2)
- Note: not directly applied yet but pattern conceptually in use

**Three-intelligences workflow (Manish + chat-Claude + Claude Code)**

- Source: emerged across all three builds in parallel during early 2026
- Borrowed: standardized routing (Manish architect, chat-Claude strategic, Claude Code execution)
- Adoption: structural across all three builds; not unique to EEJ

## How cross-pollination happens

When working on EEJ, chat-Claude considers: “Has this problem been solved elsewhere in the portfolio?” If yes, pattern is borrowed (snapshot copy, not linked dependency). Source attribution preserved in commit messages or plan documentation.

When EEJ closes a major item, end-of-task reflection asks: “What pattern from this work might apply to APATRIS or sales agent?” If yes, pattern is documented in this section as “Available to other builds.” Manish forwards to APATRIS chat-Claude or sales chat-Claude when relevant.

No automated synchronization. No unified repository. No multi-agent coordination protocol. Just explicit awareness + Manish-as-router doing the cross-pollination work consciously.

## When to deepen this pattern

If portfolio scale grows significantly (5+ builds, 10x conversation volume, dozens of patterns shared per month), revisit this section’s adequacy. Possible deeper investments:

- Standalone portfolio-skills repository
- Vector DB semantic memory across all conversations
- Multi-agent coordination protocol

Until then, lazy integration via this documentation section is sufficient.

-----

*Three movements + Phase 2 + Not-planned-by-design exclusions. Sequential. One at a time. No off-track. Until Anna and EEJ operators are using the system, Polish welders read their own language correctly, foreign workers from Asia get accurate placement guidance, and the workers EEJ serves are protected by working compliance + working communications + working payroll.*

*This file lives at `/mnt/user-data/outputs/EEJ_CORE_PLAN.md`. chat-Claude returns to it when drift is suspected. Manish updates it when corrections land. The plan is the navigation reference; the work is the execution; the purpose is what makes the work matter.*

*Version history:*
*- v1: Day 17, Tuesday 5 May 2026. Initial EEJ CORE PLAN. Built from EEJ Claude strategic recommendations (Day 17) + APATRIS plan structure + Day 17 disciplines additions (anti-hallucination + build-protection + 16 hard boundaries).*
*- v1.1: Day 17 evening. Three strengthenings from APATRIS Claude integrated: (A) Item 2.5 hard precondition for Item 3.0; (B) Self-report verification pattern added to Discipline 1 (Replit-incident learning — AI fabricates incident reports); (C) 30-day backup verification rolling precondition for Item 3.7 (switch to real cases).*
*- v1.2: Day 17 (May 5 2026, 12:20 UTC+02:00). Movement 1 Item 1.1 ticked. STRATEGIC_RECOMMENDATIONS.md persisted at commit 591a50a on origin/master. Movement 2 begins.*
*- v1.3: Day 17 afternoon. Portfolio context integrated. EEJ acknowledged as part of Manish’s vertically integrated portfolio (EEJ + APATRIS and Co. + APATRIS Sp. z o.o. + APATRIS legal-tech). Legal-tech access for EEJ framed as Phase 2 decision point with three architectural options (tenant access / replication / hybrid). APATRIS SaaS commercial path acknowledged as multi-tenancy driver. Architecture supports all options; decision deferred to when both builds stable.*
*- v1.4: Day 18 (May 6 2026). Movement 2 Item 2.1 ticked. Step 3 WhatsApp pipeline activated end-to-end. All 8 Phase B gates closed. Outbound + inbound verified with sandbox sender. Commit c8bcea2 on origin/master. Pipeline live; production WhatsApp Business Sender deferred until upgrade ($15.50 + 1-3 day approval) when EEJ scales to real worker WhatsApp messaging.*
*- v1.5: Day 18 (May 6 2026). Movement 2 Item 2.2 ticked. Mobile bilingual baseline live. 16 Polish diacritic restorations + navigator.language cold-boot detection + LangToggle on Login/Dashboard/LegalCommandCenter + Login translation + 44 tests. Commit 7906448 on origin/master. APATRIS dashboard reuse analysis confirmed shared-substrate principle on 4 strings. COV-1 (full coverage rollout across 111 components) and COV-3 (ImmigrationSearchTab parallel i18n consolidation) deferred to future workstream.*
*- v1.6: Day 18 (May 6 2026). Movement 2 Item 2.5 ticked. RECOVERY_PROCEDURES.md (882 LOC) committed at c9681e6 on origin/master. Full APATRIS Compliance Hub mirror with EEJ-specific values. Pre-conditions completed: Sentry project created + SENTRY_DSN deployed, Neon PITR retention raised from 6h to 14d. Hard precondition for Movement 3 satisfied. Three Movement 2 items closed in single day (Items 2.1, 2.2, 2.5). REC-2 through REC-6 deferred to follow-up workstreams.*
*- v1.7: Day 18 (May 6 2026, evening). CROSS-BUILD ASSETS section added. Documents what EEJ has available for other builds (APATRIS legal-tech, sales agent / labour-contract-intelligence) and what EEJ has borrowed from elsewhere. Lazy integration model: opportunistic cross-pollination via Manish-as-router + chat-Claude awareness, no unified infrastructure. Pattern matches portfolio operating model where three builds run in parallel and borrow when patterns prove valuable. APATRIS chat-Claude + sales chat-Claude will mirror this section structure into their respective plans.*
*- v1.8: Day 18 (May 6 2026, evening). PROCEDURAL MEMORY LAYER section added as Phase 2 investment. 5-layer architecture (Skills directory + Skill distillation + Memory consolidation infrastructure + Cross-build memory + Memory sideagent verification) inspired by jcode (1jehuang) coding agent harness, adapted for Manish’s three-build portfolio operating model. ~6-10 weeks total time investment. Built when revenue features ship + portfolio history mass justifies. Strategic value: reliability, bus-factor protection, competitive product differentiation, cross-build knowledge sharing. Token economics not a concern (Max 20x plan + product-quality priority). Documented as future work; current focus remains EEJ Movement 2 closure.*
*- v1.9: Day 19 (May 7 2026, afternoon). WORKER COMMUNICATION RESILIENCE section added as Phase 2 investment. 3-layer architecture (Dual delivery + In-app message inbox + Offline mode) addressing real foreign worker conditions: dropped WhatsApp messages, missing notifications, intermittent internet at job sites. Compounds with Item 2.1 WhatsApp pipeline. Strategic value: reliability for worker-facing communications, audit trail for compliance, operator efficiency, worker autonomy via searchable history, offline capability for job site conditions. ~3-6 weeks total time investment. Sequencing in Phase 2: after Movement 2 + Movement 3 closure + sales agent revenue features + Procedural Memory Layer 1-2. Layer 1 (dual delivery) prioritized as fastest path to operational impact. Mirror pattern to APATRIS legal-tech where applicable (legal communications, case history, document access).*
*- v1.10: Day 19 (May 7 2026, evening). Mobile Resilience Audit completed (docs/MOBILE_RESILIENCE_AUDIT.md). Worker Communication Resilience confirmed ~90% greenfield. Current state captured in Layer 1 + Layer 3 scope sections. Key findings: manifest.json complete (PWA installable today, not offline-capable), zero service worker, zero IndexedDB, zero whatsapp_messages visibility in mobile app. Estimated 30-60 hours sequential work maps to v1.9’s 3-6 weeks evening estimate (accurate). Free upgrade opportunity surfaced: TanStack Query persistence becomes 1-2h add once service worker lands. Plan estimates validated against codebase reality. Item 2.3 closure (Pattern B fully centralized) unblocks reliable whatsapp_messages reads for future Layer 1 work.*
*- v1.11: Day 19 (May 7 2026, evening close). Item 2.3 FULLY TICKED. 7 commits closed across Days 18-19 (Commit 1 + Commit 2 + Commit 3a + Commit 3b + Commit 3c + Commit 3d + Commit 4a). Final state: 32/32 Pattern B tables centralized, 0 ensureXxxTables helpers in services/+routes/, 0 defensive catches, Pattern B closure invariant test ACTIVE in CI, boot-time existence check ACTIVE, Sentry SDK initialized in production. eej-copilot AI hallucination risk fully closed across legal/case/signature/KRAZ/smart-document query paths. Fresh-DB recreate now possible. PITR new-branch path safe. Item 2.X follow-ups documented (lib/sentry.ts cleanup, worker_id UUID hardening, revenue_forecasts orphan, Stage 4 tenant_id, Drizzle alignment, mobile tsconfig, pre-existing 14 dashboard typecheck errors). Movement 2: 4 of 6 items closed (2.1, 2.2, 2.3, 2.5). Remaining: 2.4 (staging substrate) + 2.6 (test coverage closure). Day 19 closes with strongest single-day commit run in EEJ history (7 commits, full Phase A → Phase B → Self-review discipline maintained throughout, Sentry gap caught at lib/sentry.ts via reality-vs-plan escalation pattern).*
*- v1.12: Day 20 (May 8 2026, morning). MULTI-LLM INTEGRATION section added with measurement-gate activation framework. Reframe driven by Day 19 EEJ Multi-LLM Audit findings + APATRIS chat-Claude review reasoning. Reality: EEJ has Anthropic Claude FULLY BUILT (21 services, lib/ai.ts), Perplexity FULLY BUILT (4 services, env-var canonical), Multi-LLM orchestration FULLY BUILT (4 services with research→reason→format pattern), cron-driven research infrastructure FULLY BUILT (4 schedules + 3 research tables). Gemini NOT BUILT, OpenAI PARTIALLY BUILT (dep declared, zero usage). Plan separates genuine Movement 3 hygiene work (MULTI-1 OpenAI cleanup, MULTI-2 lib/ai.ts → router.ts, MULTI-3 helpers promotion) from speculative capability expansion (Gemini, OpenAI integration deferred to Phase 2 with measurement-gate activation). Three theoretical Gemini use cases (long-context, volume documents, cross-validation) examined and rejected as speculative — no measured constraint exists. Sunk-cost discipline: Manish pays for Gemini Pro subscription, but cost ≠ integration justification. Capability-first evaluation, provider-second, with measurement criteria not vendor enthusiasm. APATRIS chat-Claude’s Day 19 reasoning pattern (separate genuine architectural debt from premature optimization) becomes the model.*
*- v1.13: Day 20 (May 8 2026, morning). PROCEDURAL MEMORY LAYER reframe added at top of section. Day 19 APATRIS Knowledge Management Audit revealed APATRIS has substantial Layer 1-3 equivalents already built: Skills directory FULLY BUILT (3 locations totaling 22 skills), pgvector + Voyage vector retrieval substrate FULLY BUILT, knowledge graph FULLY BUILT (auto-populates on case events), vault unified search across 6 categories FULLY BUILT, Obsidian export pipeline FULLY BUILT. EEJ has kg_* substrate from Pattern B closure (Day 19 Commit 3d) but not other layers. Strategic question shifts from “build Layer 1-5 greenfield in EEJ” to “evaluate whether to mirror APATRIS patterns (Option α), build EEJ-native versions (Option β), or shared substrate via legal-tech access decision (Option γ).” Decision deferred to Phase 2 entry timing. Original 5-layer architecture remains valid as conceptual framework. Time investment estimate depends on chosen option.*
*- v1.14: Day 20 (May 8 2026, morning). REMOTE BUILD ACCESS section added as Phase 2 operational resilience workstream. Architecture: GitHub Codespaces + browser-based Claude.ai. Eliminates Mac single-point-of-failure for build operations. Real-world need: travel, Anna’s competitions, client sites, hospital visits. Setup ~2-3h per repo (devcontainer.json + Codespaces secrets). Workflow post-setup: any browser → Codespace → terminal → Claude Code → paste prompts → ship commits. Cost: free tier 60h/month likely sufficient, worst case $20-40/month if heavy travel. No measurement gate required (operational resilience, not capability expansion). Recommended sequence: after Movement 2 closure, before Movement 3 begins. Sub-workstreams: A (EEJ first to validate), B (APATRIS), C (sales agent), D (documentation guide).*
*- v1.15: Day 20 (May 8 2026, evening). DAILY HEALTH CHECK RITUAL + CONTINUOUS HEALTH INFRASTRUCTURE section added. Triggered by Day 20 APATRIS production bug discovery: M9 schema sweep incomplete, “column w.first_name does not exist” firing 16 times/day in production for 24+ hours, deadline alerts silently broken, caught only via Sentry escalation event. Three-layer architecture: Layer 1 manual EOD ritual (immediate Phase 1, ~10-15 min/day), Layer 2 automated daily report (Phase 2, ~1-2 weeks build), Layer 3 cross-build aggregated dashboard (Phase 2 advanced, ~2-3 weeks). Self-healing patterns separately tracked with measurement-gate discipline (parallels Multi-LLM Integration framework — silent bugs more dangerous than no-fix; auto-fix without diagnosis amplifies damage). Pattern recognition: today’s APATRIS bug + Day 19 Sentry gap + Phase A.6 undercount + deploy-eej.yml gitignored finding + Item 2.6 plan vs reality 21/33 vs 12/386 — all share architectural smell of “looks healthy from one angle while broken from another.” Layer 1 starts Day 21+ as Phase 1 immediate (zero infrastructure, just discipline). APATRIS chat-Claude + sales agent chat-Claude maintain equivalent health check patterns in their respective plans (this section is EEJ-only; cross-build mirror happens via Manish-as-router opportunistic sharing).*
*- v1.16: Day 20 (May 8 2026, late evening). OPERATOR TRANSITION PLAN — LAYERS 1-4 section added. Triggered by Manish reflection: principle “every vision should have a plan and not hope to reach the plan” applied to EEJ operator continuity itself. EEJ team-specific section (Liza legal head, Anna administrative, Karan coordinator with Marj + Yana). EEJ is separate legal entity from APATRIS Sp. z o.o. and APATRIS and Co. — operator transition plans are entity-specific, not cross-build. APATRIS keeps own separate transition plan in APATRIS_CORE_PLAN.md (when exists). Four layers: Layer 1 (1-7 day absence — daily operational continuity via Karan + Liza + Yana), Layer 2 (1-4 week absence — extended business continuity), Layer 3 (permanent succession — Path A continue / Path B sell / Path C wind-down decision deferred to Manish), Layer 4 (catastrophic sudden absence — family + business + estate mechanics). Section is LIVING TEMPLATE — Manish drafts specifics per layer reflecting current real state. Implementation sequence: Phase 1A baseline within 7 days, Phase 1B within 30 days, Phase 1C within 90 days. AC-8.X Verification Mechanism Discipline applies: claim of operator-redundancy without verification mechanism is hope, not plan.*
*- v1.17: Day 20 (May 8 2026, late evening). FIVE-TYRE PRINCIPLE added as Discipline 3 in The Two Standing Disciplines section (now three standing disciplines). Manish framing: “5 tyres are always better — 4 wheels and one spare for emergency. And not 8 tyres in a car — it occupies space and not always needed.” Heuristic frame for early candidate evaluation: is this a working wheel (operational need now), a spare (emergency capability for known failure modes), or a fifth tyre (speculative, occupies space)? Wheels and spares get built; fifth tyres get rejected. Complements measurement-gate discipline (Multi-LLM, Daily Health Check self-healing) at heuristic layer — measurement-gate is rigorous version, five-tyre is quick-frame version. Use heuristic first; if candidate passes wheel-or-spare test, then apply measurement gate for activation timing. Examples mapped against current plan: Daily Health Check Layer 1 (working wheel), Layers 2-3 (spare), self-healing patterns (measurement-gated, mostly fifth-tyre candidates), Operator Transition Plan Layer 1 (working wheel), Layers 2-4 (spare), Gemini integration (fifth tyre, rejected), Remote Build Access (spare), Worker Communication Resilience Layer 1 (working wheel). Anti-bloat protection — every Phase B Plan, every Movement 3 candidate, every Phase 2 expansion gets tested against this frame before resources committed.*
*- v1.18: Day 20 (May 8 2026, late evening). Item 2.X follow-up #22 added — PreToolUse hook destructive-command firewall evaluation (Movement 3 hygiene). Source: Day 20 review of agentic Claude Code framework document (superframeworks.com / jitendrazaa.com / public Boris Cherny strategic posts). Manish architectural decision after five-tyre evaluation: PreToolUse hook is real spare for known catastrophic failure mode. Reasoning: prompt-level rules don’t enforce (PocketOS April 2026 + SaaStr/Replit July 2025 incidents both had explicit safety rules acknowledged by AI; both AIs broke them anyway — Replit deleted production database during active code freeze despite ALL CAPS instructions repeated 11 times). Infrastructure-level enforcement via PreToolUse bash firewall closes the gap between Hard Boundaries 1-16 (prompt) and actual prevention. Defense-in-depth alongside existing token scoping + read-only defaults. Other items from same document review explicitly REJECTED via five-tyre principle: Skills directory for EEJ (defer until pattern emerges that Save Prompts + EOD docs + Hard Boundaries can’t capture; APATRIS evolved skills naturally, EEJ hasn’t shown that pattern), PostToolUse auto-format/auto-commit (undermines explicit commit decisions which are part of discipline framework — fifth tyre, actively harmful), parallel worktree multi-agent orchestration (shatters sequential single-thread discipline that makes verification mechanism reliable — fifth tyre), Auto Mode / Auto-Accept (discipline framework explicitly avoids — permanent stop-and-confirm gates are feature not limitation). Document review demonstrates five-tyre principle in operation: 1 spare extracted, 4 fifth-tyre candidates rejected.*
