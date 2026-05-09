# EOD Day 21 — Saturday, 9 May 2026

## Summary

Movement 2 fully closed. Plan landed in repo as canonical source-of-truth. Movement 3 Phase A complete. Item 2.7 hygiene closeout shipped. **14 commits to master — strongest single-day commit run in EEJ history.** All CI-verified green.

Headline trajectory: started Day 21 mid-Movement-2 (Item 2.6 T0-A complete, T0-B in queue); closed Day 21 with Movement 2 fully ticked + Movement 3 entry-ready.

---

## Commits (chronological)

| # | SHA | Subject |
|---|---|---|
| 1 | `5eb6373` | feat(test): T0-A Portal endpoints (16 tests) |
| 2 | `e53174b` | fix(ci): wire TEST_DATABASE_URL into test step (pull T0-E env-wiring forward) |
| 3 | `33aadf0` | fix(test): D4/D7 self-contained inactive template (decouple from prod state) |
| 4 | `6fcb07d` | feat(test): T0-B Auth admin + EEJ mobile + 2FA endpoints (38 tests) |
| 5 | `3e39b12` | fix(test): T0-B unique XFF per login call (avoid loginLimiter shared counter) |
| 6 | `0f6e35e` | feat(test): T0-C WhatsApp outbound — GET /messages + approve dispatch leg (9 tests) |
| 7 | `c3101cb` | fix(test): T0-C notifications col + twilio mock spread + Sd2 race tighten |
| 8 | `21989e1` | fix(test): T0-C twilio mock — explicit validateRequest from importActual |
| 9 | `58ef3b4` | feat(test): T0-D PIP readiness behavior — auth + tenant + scoring + A1 (6 tests) |
| 10 | `d0c190e` | feat(ci): T0-E coverage step + GitHub Actions artifact upload |
| 11 | `27e0528` | docs(plan): land EEJ_CORE_PLAN.md v1.18 into repo (canonical source-of-truth) |
| 12 | `3641848` | chore(hygiene): Item 2.7 — Movement 2 closeout (8 follow-ups) |
| 13 | `68d762c` | ci: verify Sentry source map upload activation (Manish empty CI-trigger) |
| 14 | `da7701a` | fix(ci): wire SENTRY_AUTH_TOKEN/ORG/PROJECT into Build step env (Item 2.7 #3 activation) |

---

## Movements Closed Today

- **Movement 2 fully closed** — Items 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 plus Item 2.7 hygiene closeout. All 6 numbered Movement 2 items + post-closure hygiene bundle ticked.
- **Movement 3 Phase A complete** — 7 decisions confirmed; sequencing locked (Item 2.7 → Item 3.0 → Item 3.0.5 → 3.1 → ... → 3.7).

---

## Plan Reframes

**v1.18 added** to canonical plan via commit `27e0528`:
- `docs/EEJ_CORE_PLAN.md` landed in repo (1994 lines, 19 version-history entries v1 → v1.18)
- v1.18 entry covered PreToolUse hook backlog item #22 from Day 20 framework review (architectural decision after Five-Tyre evaluation: spare for known catastrophic failure mode)

No version bump on canonical plan today. Plan content was a verbatim landing of chat-Claude's v1.18 artifact into the EEJ repo (per Item 2.7 #26 source-of-truth co-location protocol).

---

## Verification Mechanism Operating

**T0-C cycle (3 commits):** vi.mock CJS/ESM shape gotcha caught + fixed via 2 fix-forwards.
- `0f6e35e` initial: 7 CI failures surfaced (5 webhook 403 + D2 col + Sd2 race) via newly-activated `TEST_DATABASE_URL` wire (e53174b)
- `c3101cb` fix-forward 1: D2 col + Sd2 race resolved; webhook 403 persisted
- `21989e1` fix-forward 2: explicit named-export listing in vi.mock factory closed `validateRequest` undefined path; CI green
- AC-8.X discipline operating throughout — local skip-gated validation = structural-only; CI canonical functional verification

**T0-D + T0-E:** clean first-pass with Phase A audit catching prior-coverage overlap (a1_certificates schema tests existed; T0-D added endpoint-behavior tests; no duplication).

**Plan landing in repo (`27e0528`):** source-of-truth divergence resolved (chat-Claude artifact at `/mnt/user-data/outputs/` vs EEJ repo). Items #25 (renumbered from EEJ Claude original #22 to non-conflict with chat-Claude #22 PreToolUse hook) + #26 (Source-of-truth co-location protocol) captured for ongoing prevention.

**Item 2.7 #3 activation gap:** GH Actions secrets needed step-level `env:` declaration. Caught via 2nd CI run on `68d762c` showing "skipped — local dev mode" despite secrets being set. Fix-forward via 4-line `ci.yml` change (`da7701a`). Source maps now uploading on every CI build (Bundle ID `9e8a65f7-3236-5e71-82d4-63dd4498837f` issued; Sentry Release linked to commit SHA).

---

## Test Coverage Delta

| Metric | Pre-Day-20 baseline | End-of-Day-21 |
|---|---|---|
| Total tests | 198 | 267 (+69) |
| Passing in CI | 136 | 266 (+130) |
| Distinct endpoint paths exercised | ~12 | ~33 (+21) |
| Coverage measurement | none | v8 baseline + lcov + html, GHA artifact upload |

T0 endpoint coverage by group: Portal (4), Auth admin (4), Auth EEJ mobile (5), 2FA (4), WhatsApp outbound (3 active gaps), PIP readiness (1 endpoint, 6 behavioral tests).

---

## Manish-Side Closures Today

- **Item 2.7 #1 (key rotation):** EEJ-specific keys generated for Anthropic + Perplexity + Sentry, deployed to `eej-jobs-api` + `eej-api` Fly secrets, verified via `flyctl secrets list` digests + `flyctl status` both apps healthy. APATRIS continues using existing keys uninterrupted (separation achieved).
- **Sentry GH Actions secrets:** `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` (`apatris-sp-zoo`) + `SENTRY_PROJECT` (`eej-jobs-api`) added to GH Actions repo secrets. Source map upload activates on every CI build going forward.

---

## Cross-Build Observation (during EEJ work)

While reviewing APATRIS Sentry inbox (incidental cross-build awareness check during Movement 2 closeout discussion), surfaced live "column w.first_name does not exist" production bug (76 events over 4 days) + Replit zombie deployment (`apatris-compliance-hub.replit.app` autoscale instance running stale code, polluting APATRIS Sentry). Routed to APATRIS chat-Claude.

APATRIS shipped:
- M9-completion sweep deploy (commit `c28e207`, v300)
- Replit deletion (commit `ff25e41` ledger record)

Cross-build catch worked as designed — EEJ-side observation surfaced APATRIS-side production reality. Lazy integration model (per CROSS-BUILD ASSETS section of EEJ_CORE_PLAN.md) operating: Manish-as-router + chat-Claude awareness, no unified infrastructure required.

---

## Items 2.X Backlog State (post-Item-2.7-close)

Reconciled per Movement 3 Phase A categorization:

| Class | Items | Count |
|---|---|---|
| **Item 3.0 (7 sub-tasks)** | #22 PreToolUse hook + plan's 6 sub-tasks | 7 |
| **Item 3.0.5 (Movement 3 hygiene)** | #5, #23, #24, #25 | 4 |
| **Phase 2 deferred** | #2, #7, #8, #10, #11, #12, #16, #18 | 8 |
| **Defer indefinitely** | #17 (rate-limiter coverage marginal value) | 1 |
| **Always-on Manish-side** | #9 (Sentry dashboard verification), #13 (Twilio CI creds) | 2 |
| **Closed today (Item 2.7)** | #1, #3, #4, #6, #14, #15, #19, #20, #26 | 9 |

**Active (not closed):** 16 items in active Movement 3 work + Phase 2 deferred + always-on Manish-side queue. **Closed:** 9 items via Item 2.7 commit `3641848` + activation `da7701a` + Manish-side rotation.

---

## Day 22 Resume Path

**Item 3.0 Phase A entry:** 7 sub-tasks scoping work for production data protection infrastructure:
1. Read-only Neon DB role for EEJ Claude operations
2. Production NEON_DATABASE_URL off developer machine
3. Off-site immutable backups separate from Neon
4. Soft-delete patterns (worker / placement / agency tables)
5. Confirmation friction code patterns
6. Tested restore drill on staging
7. PreToolUse destructive-command firewall (#22)

**Estimated execution effort post-Phase-A:** 2.5-5 days.

---

## State Snapshot (end of Day 21)

- HEAD = `da7701a` on origin/master ✓
- CI green on every Day 21 commit ✓
- Movement 2: closed ✓
- Movement 3 Phase A: complete, sequencing locked ✓
- Plan in repo: `docs/EEJ_CORE_PLAN.md` v1.18 canonical ✓
- Phase B Plan template: `docs/PHASE_B_PLAN_TEMPLATE.md` (template + AC-8.X + source-of-truth protocol) ✓
- State changes log: `docs/STATE_CHANGES_LOG.md` (Item 2.1 activation captured) ✓
- All Items 2.X follow-ups categorized for Movement 3 work ✓
- Sentry source map upload: active (Bundle ID `9e8a65f7-3236-5e71-82d4-63dd4498837f` issued on `da7701a`) ✓
- EEJ-specific API keys: in production (separated from APATRIS) ✓
