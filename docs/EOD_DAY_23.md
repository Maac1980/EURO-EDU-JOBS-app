# EOD Day 23 — Monday, 11 May 2026

## DAY 23 SUMMARY

**Date:** Monday, 11 May 2026
**Build context:** EEJ — T23 team-provisioning + Item 3.0 sub-tasks 1 + 2 closure + deploy infrastructure fixes
**HEAD at close:** 98554fb (this EOD doc commits on top)

## COMMITS LANDED (7, chronological)

| Commit | Description | Status |
|--------|-------------|--------|
| 384f4f5 | feat(team): T23 team-provisioning — per-user permission flags + /eej/auth/me + change-password | ✅ Live |
| 0215cc7 | fix(test): T23 fix-forward — apply migrations in test setup so eej-test branch picks up T23 columns | ✅ Live |
| 0f471ce | fix(test): T23 fix-forward iter 2 — raise beforeAll hook timeout to 60s for CI cold-start | ✅ Live |
| 8671da2 | fix(deploy): remove stale api-server/Dockerfile + pin root Dockerfile in fly.toml | ✅ Live |
| 9e8809a | feat(safety): Item 3.0 sub-task 1 v2 — dbReadOnly export with channel_binding strip | ✅ Live |
| d9c4268 | fix(deploy): pin Docker pnpm to v9 to match CI — unblock T23 production deploy | ✅ Live |
| 98554fb | docs(safety): Item 3.0 sub-task 2 closure — production credentials off dev machine | ✅ Live |

(Plus this EOD doc = 8 commits on the day.)

## T23 TEAM PROVISIONING

Six real team accounts seeded on production via idempotent migration:

| Name | Email | Role | Tier | can_view_financials | nationality_scope |
|---|---|---|---|---|---|
| Manish Shetty | manish.s@edu-jobs.eu | Founder & Executive | T1 | ✅ true | — |
| Anna Bondarenko | anna.b@edu-jobs.eu | Executive Board & Finance | T1 | ✅ true | — |
| Liza Yelyzaveta Chubarova | liza.c@edu-jobs.eu | Head of Legal & Client Relations | T1 | ❌ false | — |
| Karan Chauhan | karan.c@edu-jobs.eu | Recruitment & People Operations | T3 | ❌ false | — |
| Marjorie Isla Ramones | marjorie.r@edu-jobs.eu | Recruitment Operations | T3 | ❌ false | — |
| Yana Zielinska | yana.z@edu-jobs.eu | Contracts & UA Liaison | T3 | ❌ false | `"Ukrainian"` |

Plus historical placeholders Marta (`legal@`) + Piotr (`ops@`) kept in seed until Manish deactivates via `DELETE /api/eej/auth/users/:id` post-deploy. Real Piotr is a partner across STPG / APATRIS / APATRIS-and-Co / IWS-Outsourcing — likely future EEJ board member, but the current placeholder row stays inert until a real account is needed.

Financial-access gate verified end-to-end:
- Liza login → HTTP 200 (auth succeeds)
- Liza GET `/api/invoices` → HTTP 403 `{"error":"Financial access required."}`
- Manish/Anna same call → HTTP 200 with invoice rows

Bootstrap password (Manish-side) staged as `EEJstart-2026!` for first-login rotation by each team member.

## ITEM 3.0 PROGRESS

| Sub-task | Status |
|----------|--------|
| 0. Notifications mass-delete emergency fix (`d26f6f8`) | ✅ Closed Day 22 |
| 7. PreToolUse destructive-command firewall (`a651305`) | ✅ Closed Day 22 (hook-execution health — see carry-forward) |
| 1. Read-only Neon role | Neon side ✅ closed Day 22; wiring re-implemented today (`9e8809a` + `d9c4268`); Manish-side activation per `docs/READ_ONLY_DB_PATTERN.md` step 2 |
| 2. NEON_DATABASE_URL off dev machine (`98554fb`) | ✅ Closed (substantively done Day 22, documented today) |
| 3. Off-site immutable backups | ⬜ Cloudflare R2 prereq pending Manish-side |
| 4. Soft-delete patterns | ⬜ Day 24+ (per Manish-side audit: ~11 hard-DELETE callsites scoped for migration) |
| 5. Confirmation friction | ⬜ Day 24+ (per Manish-side audit: 9 DELETE routes need friction before May 18 team rollout) |
| 6. Tested restore drill | ⬜ Window opens 2026-05-15 |

## DEPLOY INFRASTRUCTURE FIXES

Day 23 surfaced three deploy blockers, all closed in sequence:

**1. Stale sub-directory Dockerfile (`8671da2`)** — `artifacts/api-server/Dockerfile` was a March-21 single-stage file that needed repo-root context but lived in the sub-directory. When flyctl was invoked from `artifacts/api-server/`, Fly auto-detected the local Dockerfile and packaged only the sub-directory as the build context — so the in-container pnpm install couldn't see `pnpm-workspace.yaml` / `lib/api-zod`. Deleted the stale file, pinned the canonical root multi-stage Dockerfile via `fly.toml [build] dockerfile = "Dockerfile"`, documented `(from REPO ROOT)` deploy guidance in CLAUDE.md + TEAM_ONBOARDING.md.

**2. Docker pnpm version drift (`d9c4268`)** — `npm install -g pnpm` in Dockerfile resolved to whatever `latest` pointed at on each build. A point release of pnpm 10.x landed between the previous successful deploy (`8671da2`) and the next attempt; pnpm 10.x enforces strict build-script approval and rejected `@sentry/cli` / `esbuild` / `sharp`. CI pins pnpm 9 via `pnpm/action-setup@v3` and never saw it. Pinned Dockerfile to `pnpm@9` to match — same wheel that passes CI now also builds in the container.

**3. channel_binding=require breaks pg/Neon handshake (`9e8809a`)** — Day 22 production-crisis root cause now closed at the code level. `normalizeNeonUrl()` strips `channel_binding=<value>` from BOTH `DATABASE_URL` and `DATABASE_URL_READONLY` before pool construction. Idempotent; five unit tests cover mid-string / only-param / leading / sandwiched / clean-no-op positions plus `prefer`/`disable` variants. Self-heals if a future operator pastes a fresh Neon-Console URL.

## REFLECTIONS

- **Defense-in-depth at code level beats out-of-band convention.** The Day 22 carry-forward (strip channel_binding for both DATABASE_URL and DATABASE_URL_READONLY) was honored — code now self-heals, future operators don't have to remember the visual scrub.
- **Audit-first discipline held across three deploy-fix iterations.** Each blocker (sub-directory Dockerfile, pnpm version drift, then the bigger normalization) was diagnosed from one surfaced root cause rather than from piled hypotheses. The reverted Day 22 sub-task 1 wiring is back live in a more robust form.
- **AC-8.X exercised, not claimed.** The `normalizeNeonUrl` function is verified by five unit tests running in 282ms; the discipline lesson from Day 22 ("local test verified warn fired but didn't catch production startup path") shaped today's testing posture.
- **Cross-build coordination from Day 22 still paying dividends.** APATRIS chat-Claude's three-hypothesis diagnostic (Hypothesis 1 = channel binding) shaped today's code-level fix design.
- **T23 is the most consequential commit for the May 18 rollout.** First time the production DB carries real EEJ team identities + per-user permission flags. Bootstrap password staged; team-side first-login rotation is the next dependency.

## CARRY-FORWARD TO DAY 24

| Item | Owner | Notes |
|------|-------|-------|
| Sub-task 3 — off-site immutable backups | EEJ Claude (after R2 prereq) | Gated on Manish creating Cloudflare R2 bucket + access keys. Once those land, build backup service that streams a Postgres logical dump to R2 on a schedule, encrypted at rest. |
| Sub-task 4 — soft-delete patterns | EEJ Claude | ~11 hard-DELETE callsites identified per Manish-side audit; migrate to `deleted_at` timestamps + filtered reads. Important before May 18 — accidental deletion by new team members must be reversible. |
| Sub-task 5 — confirmation friction on 9 DELETE routes | EEJ Claude | Type-the-resource-name pattern (or random confirmation code) before destructive operations. Same May 18 motivation as sub-task 4. |
| Sub-task 6 — tested restore drill | Manish + EEJ Claude | Window opens 2026-05-15. Prove the backup→restore path works end-to-end on staging before treating sub-task 3 as load-bearing. |
| PreToolUse hook execution health | EEJ Claude | Manish reports the hook script appeared not to execute on multiple Bash invocations today. Validate by running a known-blocked test command (e.g., `echo "DROP TABLE workers"`) in a new session and confirming the hook fires; if it doesn't, audit `.claude/settings.json` registration + `.claude/hooks/pretooluse-firewall.sh` perms + jq availability. |
| Marta + Piotr placeholder deactivation | Manish | `DELETE /api/eej/auth/users/:id` with a T1 token, once the real Piotr account is ready (or sooner if cleanup matters). HB-14 forbids DELETE in migrate.ts, so this stays admin-endpoint-side. |
| Bootstrap password distribution | Manish | Share `EEJstart-2026!` with the 6 team members via a secure channel (Signal / password manager / in-person). Rotate `EEJ_SEED_PASSWORD` once all 6 complete first-login rotation. |
| Staging readonly activation | Manish + EEJ Claude | Create `eej_readonly` role on staging (eej-staging Neon project) mirroring production grants, then set `DATABASE_URL_READONLY` Fly secret on `eej-api`. OR defer to Phase 2 if staging's role-isolation value is judged low. |
| Day 23 EOD doc | This commit | Land EOD doc on master. |

## STATE AT CLOSE

- **HEAD:** `98554fb` on `origin/master` (this EOD commit will be HEAD+1)
- **CI:** ✅ Green at `98554fb` per local verification (typecheck clean; 5 normalize tests + 24 integration tests passed locally; 131 DB-gated tests skipped locally, exercised in CI)
- **Production:** ✅ Live per Manish report (HTTP 200; dbReadOnly activation pending confirmation via Fly logs once Manish-side `DATABASE_URL_READONLY` secret-set per `docs/READ_ONLY_DB_PATTERN.md` step 2)
- **Staging:** ✅ Live (writable-only; readonly fallback active until staging activation)
- **Item 3.0 progress:** 4/7 sub-tasks closed (0 + 7 Day 22; 1 + 2 Day 23). Remaining 3, 4, 5, 6 carry to Day 24+.
- **Day 23 commits:** 7 build + this EOD = 8 total.

## DISCIPLINE FRAMEWORK STATE

- Movement 2 closed (Day 21)
- Movement 3 in progress (Item 3.0 — 4/7 sub-tasks closed)
- All Hard Boundaries 1-16 + AC-1 through AC-23 active
- Plan canonical: `docs/EEJ_CORE_PLAN.md` v1.18
- Source-of-truth co-location protocol (#26): satisfied — sub-task 1 doc (`READ_ONLY_DB_PATTERN.md`), sub-task 2 doc (`ITEM_3_0_SUBTASK_2_DEV_MACHINE_SCRUB.md`), and `EEJ_CORE_PLAN.md` v1.18 closure markers all in-repo before EEJ Claude prompts reference them.
