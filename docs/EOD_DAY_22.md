# EOD Day 22 — Sunday, 10 May 2026

## DAY 22 SUMMARY

**Date:** Sunday, 10 May 2026
**Build context:** EEJ — Item 3.0 sub-task work + production crisis recovery
**HEAD at close:** bf34088 (revert of 3999485)

## COMMITS LANDED (4)

| Commit | Description | Status |
|--------|-------------|--------|
| d26f6f8 | fix(safety): patch notifications.ts:32 unguarded mass-delete (Item 3.0.0 emergency) | ✅ Live |
| a651305 | feat(safety): Item 3.0 sub-task 7 — PreToolUse destructive-command firewall (#22) | ✅ Live |
| 3999485 | feat(safety): Item 3.0 sub-task 1 — dbReadOnly export with fail-soft fallback | ⚠️ Reverted |
| bf34088 | Revert "feat(safety): Item 3.0 sub-task 1 — dbReadOnly export with fail-soft fallback" | ✅ Live |

## ITEM 3.0 PROGRESS

| Sub-task | Status |
|----------|--------|
| 7. PreToolUse firewall | ✅ Closed (a651305) |
| 0. Notifications mass-delete emergency fix | ✅ Closed (d26f6f8) |
| 1. Read-only Neon role (Neon side) | ✅ Closed (eej_readonly role + 75 tables SELECT-only + ALTER DEFAULT PRIVILEGES) |
| 1. Read-only Neon role (Wiring) | 🔄 Reverted, needs re-implementation Day 23 |
| 2. NEON_DATABASE_URL off dev machine | ✅ Substantively done (.zshrc line 5 removed, backup deleted) — needs documentation commit Day 23 |
| 3. Off-site immutable backups | ⬜ Manish R2 prereq pending |
| 4. Soft-delete patterns | ⬜ |
| 5. Confirmation friction | ⬜ |
| 6. Tested restore drill | ⬜ Window opens 2026-05-15 |

## PRODUCTION CRISIS — RECOVERY DOCUMENTED

**Trigger:** neondb_owner password rotation (security closure for password exposure in chat history) + DATABASE_URL_READONLY Fly secret activation. Production crashed with 28P01 auth failures, machines hit max restart count.

**Root cause:** `pg` Node client in production could not complete SCRAM-SHA-256-PLUS channel binding handshake against Neon pooler endpoint. Connection string `&channel_binding=require` parameter caused authentication failure even with correct credentials.

**Fix:** Strip `&channel_binding=require` from DATABASE_URL connection string. Allows fallback to plain SCRAM-SHA-256 which `pg` client can complete successfully.

**Discovery:** APATRIS chat-Claude cross-build diagnostic (3 hypotheses ordered by cost). Hypothesis 1 (channel binding incompatibility) confirmed correct.

**Recovery sequence:**
1. neondb_owner password rotated multiple times during crisis (current = May 10 1:26 pm)
2. DATABASE_URL set with correct host (ep-wild-cell-aljop684 — confirmed via Neon Console connection details)
3. `&channel_binding=require` stripped from connection string
4. Both eej-jobs-api + eej-api now live and serving (HTTP 200 verified production)
5. DATABASE_URL_READONLY currently unset on both apps (sub-task 1 wiring deferred to Day 23)

**Discipline lesson:** AC-8.X verification mechanism for "fail-soft fallback" claims needs to exercise actual production startup path, not just local skip-gated tests. Local test verified warn fired when env var unset; did not catch that pool construction logic still reached out to readonly path. Adding to discipline ledger for Day 23+ mechanized verification.

## REFLECTIONS

- "Errors which are solvable are not errors they are issues which can be solved" — Manish reframing adopted as discipline. Errors → blockers. Issues → solvable. Production was an issue (solvable with cross-build diagnostic), not an error (irreversible).
- Cross-build coordination value proven: APATRIS chat-Claude provided structured 3-hypothesis diagnostic during crisis. Saved hours of trial-and-error.
- Five-tyre principle held: read-only role IS a working wheel/spare. Implementation broke. Fix is "fix the fail-soft logic + channel binding handling," not "abandon the idea."
- Channel binding handshake issue is not specific to today's work; it's an environment property. Affects ANY connection using Neon pooler + pg client without channel_binding handling. Document in Day 23 sub-task 1 re-implementation.

## CARRY-FORWARD TO DAY 23

| Item | Owner | Notes |
|------|-------|-------|
| Sub-task 1 re-implementation | EEJ Claude | Re-introduce dbReadOnly export with channel_binding fix baked in. Both DATABASE_URL and DATABASE_URL_READONLY pool construction must strip channel_binding from connection string OR use uselibpqcompat=true&sslmode=require pattern. |
| DATABASE_URL_READONLY re-set on Fly | Manish | After sub-task 1 wiring re-commits, set readonly secret on both apps using channel-binding-stripped connection string from password manager. |
| Sub-task 2 documentation commit | EEJ Claude | Brief docs/ commit capturing .zshrc scrub work + .env audit clean result. No code changes (substantively done, just records the work). |
| Build error blocking manual deploys | Separate scope | pnpm workspace `@workspace/api-zod` missing. Investigate when next manual deploy needed. |
| Day 22 EOD doc commit | This task | Land EOD doc on master. |

## STATE AT CLOSE

- HEAD: bf34088 (origin/master)
- CI: ✅ Green
- Production: ✅ Live (HTTP 200)
- Staging: ✅ Live (1 machine started, 1 auto-stopped — normal)
- Item 3.0 progress: 3/7 sub-tasks closed + 1 emergency fix
- Day 22 commits: 4 (3 forward + 1 revert = 3 net forward)

## DISCIPLINE FRAMEWORK STATE

- Movement 2 closed (Day 21)
- Movement 3 in progress (Item 3.0 ongoing)
- All Hard Boundaries 1-16 + AC-1 through AC-23 active
- Plan canonical: docs/EEJ_CORE_PLAN.md v1.18
