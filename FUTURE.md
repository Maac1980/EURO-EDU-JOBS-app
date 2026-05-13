# FUTURE — deferred work with concrete revisit triggers

Codification term 8 corollary: deferred work needs explicit trigger conditions
to avoid the "later" → "never until incident forces it" pattern. Each item
below names what is deferred, why it's deferred, and the concrete trigger that
fires the revisit.

Established: 2026-05-13 as part of Phase A dashboard auth unification audit
(see `docs/PHASE_A_AUDIT_DASHBOARD_AUTH_UNIFICATION.md`).

---

## 1. Data-model unification: `users` becomes view over `system_users`

**Deferred:** the May 14-18 work ships an auth-layer adapter that queries
`system_users` first and falls back to `users` for backward-compat. Long-term
end-state is `users` as a view over `system_users`, or removal of `users`
entirely if no other code reads it.

**Why deferred for May 18:** auth-adapter is a single-commit change with clean
revert; full table consolidation is a higher-risk migration that's not needed
to unblock the five team members locked out of the portal today.

**Trigger to revisit, whichever first:**
- Next team member onboarded beyond the current 6 (Akshay, future hires)
- 30 days post May 18 stabilization (= 2026-06-17)
- First instance of role-translation logic becoming insufficient
  (e.g., needing a fourth role category, finer-grained scopes)

---

## 2. Permissions-table revisit (replace per-user capability flags)

**Deferred:** per-user capability flags are accumulating on `system_users`:
`canViewFinancials`, `canEditWorkers` (added May 14), `nationalityScope`,
`requires_2fa` (added May 15). Pattern is OK for May 18 but at scale should
become an explicit permissions table or capability set, not ad-hoc columns.

**Why deferred for May 18:** adding `canEditWorkers` + `requires_2fa` as
columns is additive and safe; refactoring to a permissions table is a much
larger change with cross-cutting impact on JWT shape, middleware, and tests.

**Important context:** `nationalityScope` already sits at the 10+
enforcement-site complexity threshold today (24 enforcement gaps per
Section 13 of Phase A audit). Post-May-18 cleanup work is real, not
hypothetical. This revisit may need to happen alongside or before the
data-model unification in section 1.

**Trigger to revisit, whichever first:**
- 5th per-user capability flag added to `system_users`
- First flag whose enforcement spans 10+ sites in the codebase
- 90 days post May 18 (= 2026-08-16)

---

## 3. `nationalityScope` full enforcement across dashboard read paths

**Deferred:** `nationalityScope` is enforced today at exactly ONE site
(`routes/workers.ts:412`). Audit 2026-05-13 identified **24 enforcement gaps**
across the API:
- 8 list reads: `workers.ts:431, 449, 1079`, `payroll.ts:20, 89, 297`,
  `compliance.ts:41`, `gps.ts:75`, `regulatory.ts:148`
- 6 join reads: `gdpr.ts:18`, `permits.ts:73, 174`, `interviews.ts:15`,
  `jobs.ts:51, 196, 265`
- ~10 point fetches that filter on `tenantId` only, not nationality

**Why deferred for May 18:** today only Yana has `nationalityScope` set;
five others have NULL ("see all"). Immediate blast radius is one user.
May 18 mitigation: Yana on mobile-only (mobile enforces scope correctly);
Manish/Anna/Liza/Karan/Marjorie on dashboard. Fixing 24 sites in the May
14-17 window is not feasible without compressing other work.

**Why this needs an explicit trigger and not "someday":** a future scoped
user reopens every gap simultaneously. If a "Indian workers only" liaison
or any second `nationalityScope`-set row appears on `system_users`, the
gaps become live exposure across all 24 sites at once.

**Trigger to revisit, whichever first:**
- Before adding ANY second scoped user (= any second
  `nationalityScope`-set row in `system_users`)
- 60 days post May 18 (= 2026-07-17)

**Estimated effort to close:** 6-8 focused hours plus walkthrough. Mostly
mechanical (add `.filter(nationality === scope)` post-fetch or add WHERE
clauses for scope on point-fetches and joins).

---

## 4. Broader 2FA mandate review

**Deferred:** May 18 ships mandatory-2FA for admin role (Manish, Anna) and
opt-in for everyone else (Liza, Karan, Marjorie, Yana). Long-term may
escalate to mandatory for all dashboard users or for any user with elevated
permissions (`canViewFinancials=true`, `canEditWorkers=true`).

**Why deferred for May 18:** mandatory-for-all adds TOTP setup + recovery
codes friction to first-time team onboarding. Mandatory-for-admin gets the
highest blast-radius accounts (founders) protected day-one without that
friction.

**Trigger to revisit, whichever first:**
- First phishing attempt against any EEJ account (any team member, any
  surface — even a failed attempt counts as signal)
- 30 days post May 18 (= 2026-06-17)

**Escalation paths to consider when triggered:**
- Mandatory for any user with `canViewFinancials=true` (catches Manish, Anna)
- Mandatory for any user with `canEditWorkers=true` (catches Karan, Marj, Yana too)
- Mandatory for all dashboard users (Liza joins)
- Mandatory for all users including mobile (catches T4 candidates if/when
  they get mobile accounts)

---

## How to use this file

- Reading this file is part of the EOD discipline (term 6/8). If a trigger
  has fired since last EOD review, the deferred work is no longer deferred
  — name it on the active branch.
- Adding to this file: must include the trigger condition. "TBD" or
  "someday" is rejected per term 8 corollary.
- Removing from this file: only after the deferred work has landed AND
  been verified in production. Removal commit references the resolving
  PR/commit.
