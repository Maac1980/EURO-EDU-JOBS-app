# Phase A — Dashboard auth unification on system_users

**Date:** 2026-05-13
**Branch:** `tuesday-cockpit-build`
**Scope:** Migrate dashboard portal (`artifacts/apatris-dashboard/`) from
authenticating against `schema.users` to authenticating against `schema.systemUsers`.
Single source of truth for user identity, single role-translation layer at the
auth boundary, single JWT payload shape (extended with `canViewFinancials` +
`nationalityScope`).
**Trigger:** Five of six EEJ team members rejected at the portal with "Access
Denied: Contact Administrator." Root cause: dashboard queries a different
user table than the mobile app. T23 seeded the team in `system_users` only.

This document is the audit-first artifact required by codification term 2.
No code lands until this is reviewed by Manish + chat-Claude.

**Status: APPROVED 2026-05-13 evening.** All four nods cycled with three
improvements landed before code (PayrollPage bundling, FUTURE.md trigger
sharpening, 2FA mandatory-for-admin scoping). Code commit begins May 14.

---

## 1. Decision shape

Recommended: auth-layer adapter at `routes/auth.ts`. Single commit.
- `POST /api/auth/login` queries `systemUsers` first (by email), falls back to `users` for backward-compat
- Role translation happens at JWT payload construction
- `canViewFinancials` + `nationalityScope` flow into the dashboard's JWT
- Anna keeps her admin row in `users` for the fallback path; her existing token validates until expiry, next login issues new-shape token

Alternatives rejected (see prior recommendation): duplicate seeding, unifying
on `users` instead, federated auth refactor.

End-state long-term (post-May-18 cleanup, trigger condition required):
`users` becomes a view over `systemUsers` (or removed entirely if no other code reads it).

---

## 2. Current state — system_users vs users

| Field | systemUsers | users |
|---|---|---|
| Identity | id, email, name | id, email, name |
| Role values | `T1` / `T2` / `T3` / `T4` | `admin` / `coordinator` / `manager` |
| Designation | `text` (free-form: "Head of Legal & Client Relations" etc.) | not present |
| canViewFinancials | `boolean` (T23 — Liza false, others true) | not present |
| nationalityScope | `text` nullable (Yana = "Ukrainian", others null) | not present |
| Password hash | `password_hash` scrypt | `password_hash` scrypt |
| 2FA | not present | totp columns + email_otp (per audit) |
| Tenant | implicit "production" (default tenant) | `tenant_id` text FK to tenants.slug |
| Site | not present | `site` text |
| Today's row count (prod) | 6 EEJ team + 2 historical (Marta, Piotr) | 1 (Anna) |
| Today's row count (staging) | 6 (re-seeded each deploy via migrate.ts idempotent insert) | 1 (Anna, seeded once) |

**Verdict:** `systemUsers` is the better-shaped table. Has all the per-user
permission flags T23 introduced. `users` is the legacy table that predates
T23 and lacks the access-control fields the business now relies on.

---

## 3. Role translation table

The function lives in `routes/auth.ts` (post-migration) or a shared lib if it's
needed elsewhere. Translation is one-way: systemUsers role → dashboard role.

| systemUsers | designation contains | Dashboard role | Reasoning |
|---|---|---|---|
| T1 | "Legal" (case-insensitive) | **coordinator** | Liza. Coordinator-level dashboard access. canViewFinancials=false additionally gates business books. |
| T1 | (anything else) | **admin** | Manish, Anna. Full dashboard. |
| T2 | (any) | **coordinator** | Historical/reserved tier; no current production users. Conservative coordinator default. |
| T3 | (any) | **manager** | Karan, Marjorie, Yana. Recruitment-tier permissions. nationalityScope filter applies on data queries (Yana sees Ukrainian-only). |
| T4 | (any) | reject (403) | Candidate-tier is worker-self-service; not a dashboard user. Returning 403 with clear message: "Dashboard is for staff; please use the mobile app." |

**Rationale for Liza→coordinator (not admin):** Manish specified "Liza sees
everything EXCEPT business financials." The dashboard already has a
coordinator-vs-admin split that aligns with this. Mapping Liza to admin would
require disabling admin features that *should* stay admin-only (e.g.
TeamManagementCard role editing). Coordinator + canViewFinancials=false flag
gives Liza her case work without admin powers and without business books.

**Rationale for T3→manager:** Manager is the most-restrictive role; matches
"Karan/Marj see recruitment + worker docs + their candidates, not financials,
not full admin." Yana's Ukrainian-scope is enforced via nationalityScope on
the backend, not via role. T3 has same dashboard role as T2's manager but
backend nationalityScope filtering scopes their data.

---

## 4. Dashboard frontend role-check sites — inventory

Grep results from `artifacts/apatris-dashboard/src/`. Classified by what
happens to Liza (T1 + Legal → coordinator) and Karan/Marj/Yana (T3 → manager)
under the proposed translation.

### Admin-only sites (gated to admin role)

| File:Line | What it gates | Liza's result | Manager's result | Verdict |
|---|---|---|---|---|
| `Dashboard.tsx:278,285` | Admin-only useEffect (auto-load admin data) | not loaded | not loaded | OK — Liza doesn't need admin data |
| `Dashboard.tsx:1215` | Confirm-delete worker button | hidden | hidden | **NEEDS REVIEW** — does Liza need to delete worker rows? Per Manish's spec ("she sees everything except business financials") deletion is admin-only, OK |
| `IngestDiagnostics.tsx:60` | Dev/admin diagnostic page | hidden | hidden | OK — internal tool |
| `NotificationHistoryCard.tsx:145` | View notification entries | hidden | hidden | **NEEDS REVIEW** — Liza might want to see WhatsApp-sent log for her cases; map to coordinator instead |
| `CandidateEditPanel.tsx:758` | Admin-only UI in candidate edit | hidden | hidden | **NEEDS REVIEW** — depends on what's gated; if it's role-editing, OK to hide for Liza; if it's case work, blocking |
| `PayrollPage.tsx:481` | `user?.role === "Admin"` capital A | **always false (BUG)** | **always false (BUG)** | **PRE-EXISTING BUG, NOT FROM UNIFICATION.** Capital "A" vs rest of dashboard's lowercase "admin". Anna's row.role = "admin", so this comparison is always false — meaning PayrollPage's admin-gated features are currently INVISIBLE TO EVERYONE on the dashboard. Surfaced by this audit; not introduced by it. Flag separately for fix. |
| `PayrollPage.tsx:629–1192` | ~25 admin-gates inside PayrollPage | all hidden (BUG) | all hidden (BUG) | Same root cause as :481 — `isAdmin` is computed from the broken comparison, so EVERY admin gate on PayrollPage is effectively dead code. **Critical pre-existing bug.** |
| `TeamManagementCard.tsx:156,159,189` | Admin can edit team-member roles | hidden | hidden | OK — Liza shouldn't admin-edit roles, Karan/Marj/Yana definitely shouldn't |

### Coordinator-or-admin sites

| File:Line | What it gates | Liza | Manager | Verdict |
|---|---|---|---|---|
| `Dashboard.tsx:507` | Payroll tab visible | **shown** | hidden | OK — Liza needs payroll for case work (worker-level, not P&L); financial-gate flag handles the business-books exclusion |
| `Dashboard.tsx:510` | Calculator tab visible | **shown** | hidden | OK — calculator is useful for Liza |
| `Dashboard.tsx:558,564` | UI sections for admin/coordinator | shown | hidden | OK |
| `Dashboard.tsx:617,618,1808` | Payroll/calculator gate functions | passes | blocked | OK |

### Manager-only sites

| File:Line | What it gates | Verdict |
|---|---|---|
| `Dashboard.tsx:644` | Manager + has site sees something | OK — likely site-scoped view; Karan/Marj/Yana would have site assignments via system_users (well, they don't currently; that's a separate gap) |

### Role-agnostic sites

The remaining ~30 calls to `useAuth()` read `user.name`/`user.email`/`token`
without role gating. No issues there.

---

## 5. Pre-existing bug surfaced by this audit

**PayrollPage.tsx:481 uses capital-A "Admin"** while every other dashboard
file uses lowercase. This means `isAdmin` (local to PayrollPage) is permanently
false for every user. Every admin-gated feature in PayrollPage — ZUS breakdown,
gross-rate editing, advances/penalties editing, bulk-hours toggle — is
**currently hidden from everyone, including Anna**.

This is unrelated to the unification work and would have been hidden until
someone went looking. Two paths:

a) Fix the typo in the same commit as the unification (cleanest — one-line, low risk)
b) Separate commit on the branch first, then unification on top (cleaner history)

Recommend (a). Mention in the commit message.

---

## 6. Backend role-gate middleware

`lib/authMiddleware.ts` defines:
- `requireAdmin` — `role !== "admin"` → 403
- `requireCoordinatorOrAdmin` — `role === "manager"` → 403
- `requireRole(...roles)` — flexible matching
- `requireFinancialAccess` — `canViewFinancials === false` → 403 (T23 — already integrated with system_users JWT)
- `requireT1T2` — mobile-only, mobile role names

**Used in 17 route files.** Critical question for each: does the route's
caller (dashboard frontend) work for the new role assignments?

Quick sample audit:
- `routes/admin.ts` — `requireAdmin` on `/admin/stats`, `/admin/users`, `/admin/system-status`. Anna admin = passes. Liza coordinator = 403. **Correct.**
- `routes/workers.ts` — `requireCoordinatorOrAdmin` on PATCH /workers/:id, DELETE /workers/:id (admin-only via requireAdmin). Liza coordinator = can edit workers. Karan/Marj manager = blocked from edit. **Karan/Marj currently DO recruitment data entry on the dashboard — being blocked from PATCH /workers/:id would break their workflow.**
- `routes/invoices.ts` — `requireFinancialAccess` already in place (T23). Liza `canViewFinancials=false` = 403. **Correct, matches spec.**

**Risk #1 surfaced:** if T3 → manager, Karan/Marj/Yana lose access to
`PATCH /workers/:id`. They currently use the dashboard daily for worker
data entry. Either:

a) Map T3 → **coordinator** instead of manager (gives them PATCH access; but also gives them payroll-tab visibility, which they shouldn't have)
b) Keep T3 → manager and ALSO loosen `PATCH /workers/:id` to allow manager (less safe)
c) Add a finer-grained gate (e.g. `requireCanEditWorkers`) and map both coordinator and manager-with-flag

**Recommend (c)** — finer-grained gate. Adds a new `canEditWorkers` boolean
to systemUsers (similar pattern to T23's `canViewFinancials`). T3 users get
it true by default; T4 false. The dashboard gate becomes "any role with
canEditWorkers=true". This adds ~5 lines to systemUsers schema, migrates
idempotently, and gives Manish per-user override control.

**Adversarial check on (c):** schema change is additive (new boolean column,
default true for existing rows, false for new candidate-tier rows). This
counts as additive migration per term 2 — peer-mode allowed. No data-shape
risk.

---

## 7. JWT payload diff

### Current dashboard JWT payload (from auth.ts:101-108)
```typescript
{ id, email, name, role: "admin"|"coordinator"|"manager", site, tenantId }
```

### Proposed unified JWT payload
```typescript
{
  id,                // systemUsers.id
  email,             // systemUsers.email
  name,              // systemUsers.name
  role,              // translated: "admin"|"coordinator"|"manager"
  site,              // null (systemUsers has no site column — manager site-scope deferred to follow-up)
  tenantId,          // "production" (systemUsers default)
  canViewFinancials, // T23 flag, drives business-financials gate
  nationalityScope,  // T23 flag, "Ukrainian" for Yana, null for others
  canEditWorkers,    // NEW — per-user override for worker-edit permission (true for T1/T3, false for T4)
  designation,       // systemUsers.designation — for UI display only
  sourceTable,       // "system_users" | "users" — debug/transition flag, removable post-cleanup
}
```

### Backward-compat for Anna's existing token

Anna currently has a token from her previous portal login. The JWT was signed
with the same `JWT_SECRET` and contains the OLD payload shape (no
canViewFinancials, no nationalityScope, no canEditWorkers).

Two read patterns in the dashboard frontend:
- `user?.role === "admin"` — works (her role is "admin" in both old and new)
- Reads of `canViewFinancials` etc — undefined for her old token

Frontend safety: code that reads `canViewFinancials` must treat undefined as
"don't grant access" (conservative). I'll grep for any read of these fields
on the frontend after unification lands to verify the conservative default.

Backend safety: `requireFinancialAccess` already handles `canViewFinancials
!== false` (T23 pattern) — undefined → undefined !== false → passes the
gate. **WAIT — this means undefined would let Anna's old token through to
`requireFinancialAccess`. Is that the correct behavior?** Yes — Anna's old
admin role implicitly granted financial access; undefined-defaulting-to-true
preserves that. New tokens will explicitly carry true.

For Liza/Karan/Marj/Yana the question doesn't apply — they don't have old
tokens.

---

## 8. Migration path on routes/auth.ts

Current code (auth.ts:54-60):
```typescript
const [found] = await db.select().from(schema.users).where(
  sql`LOWER(${schema.users.email}) = ${emailLower}`
);
if (!found) { return res.status(403).json({ error: "Access Denied: Contact Administrator." }); }
```

New shape:
```typescript
// 1. Try systemUsers first (new path)
const [sysUser] = await db.select().from(schema.systemUsers).where(
  sql`LOWER(${schema.systemUsers.email}) = ${emailLower}`
);
if (sysUser) {
  // ... password verification against sysUser.passwordHash (scrypt)
  // ... role translation: roleFromSystemUser(sysUser)
  // ... JWT signing with extended payload
  return res.json({ token, user });
}

// 2. Fall back to legacy users table (for Anna's pre-T23 admin row)
const [legacyUser] = await db.select().from(schema.users).where(
  sql`LOWER(${schema.users.email}) = ${emailLower}`
);
if (legacyUser) {
  // ... existing logic preserved
  // ... JWT with sourceTable: "users" debug flag
}

return res.status(403).json({ error: "Access Denied: Contact Administrator." });
```

Order matters: systemUsers first means Anna (who exists in both) takes the
NEW path and gets the extended JWT. Without the order, Anna's password would
need to match both tables. With this order, the systemUsers row wins; her
mobile-app bootstrap password becomes her portal password too (which is what
Manish wants).

**Anna password question (Manish's parallel ask):** unification makes her
portal password = her mobile bootstrap password (set via `EEJ_SEED_PASSWORD`,
which is `EEJstart-2026!` per recent docs). She needs heads-up. If her
current portal password (set via legacy `EEJ_ADMIN_PASSWORD` env var) differs,
the change is visible to her.

---

## 9. Test plan (added to integration.test.ts)

| Test ID | What it verifies |
|---|---|
| DASH.1 | Liza login at `/api/auth/login` returns 200 with role=coordinator + canViewFinancials=false |
| DASH.2 | Karan login at `/api/auth/login` returns 200 with role=manager + canViewFinancials=false + canEditWorkers=true |
| DASH.3 | Yana login at `/api/auth/login` returns 200 with role=manager + nationalityScope="Ukrainian" + canEditWorkers=true |
| DASH.4 | Manish login at `/api/auth/login` returns 200 with role=admin + canViewFinancials=true |
| DASH.5 | Anna login at `/api/auth/login` returns 200 with role=admin (systemUsers path wins; legacy `users` row fallback path covered by DASH.5b) |
| DASH.6 | Email not in either table returns 403 "Access Denied" (unchanged behavior for unknown emails) |
| DASH.7 | Liza's token rejected on `/admin/stats` (requireAdmin gate) |
| DASH.8 | Liza's token rejected on `/api/invoices` (requireFinancialAccess gate) |
| DASH.9 | Karan's manager token can PATCH /workers/:id (canEditWorkers=true honored by loosened `requireCoordinatorOrAdmin` middleware) |
| DASH.10 | A T4 candidate seeded into systemUsers gets 403 at `/api/auth/login` with clear "use mobile app" message |

**2FA-specific tests (add to integration suite):**

| Test ID | What it verifies |
|---|---|
| TFA.1 | Manish login without TOTP returns `2fa_required` (mandatory-for-admin enforced) |
| TFA.2 | Manish login with valid TOTP returns 200 + token |
| TFA.3 | Manish login with invalid TOTP returns 401 |
| TFA.4 | Liza login without 2FA setup returns 200 + token (opt-in, not mandatory for coordinator) |
| TFA.5 | Liza opts in via /2fa/setup, /2fa/verify, then subsequent login requires TOTP |
| TFA.6 | Recovery code used at login (instead of TOTP) succeeds and marks that code used |
| TFA.7 | Admin reset endpoint clears 2FA for a user (Manish-only authorized) |

---

## 10. Rollback plan

Single-commit change. `git revert <sha>` + redeploy = ~5 minutes back to
pre-unification state. Anna's tokens stay valid (signed with same secret).
Liza/Karan/Marj/Yana go back to "Access Denied" on the portal but still work
on mobile.

**Adversarial check:** is there any state-change in the unification that's
NOT reverted by revert? No. The auth handler is read-only on user tables;
no INSERT/UPDATE/DELETE in the dashboard login path. Reverting the code
reverts the behavior. Clean rollback.

---

## 11. Timeline reality (revised after 2FA scope addition)

Effort breakdown — focused-work hours, not calendar:

| Item | Hours |
|---|---|
| Auth unification (`routes/auth.ts` try-systemUsers-then-users) | 1.5-2 |
| Role-translation function + table | 0.5 |
| JWT payload extension + Anna backward-compat | 1 |
| `canEditWorkers` migration + seed backfill + middleware update | 1 |
| PayrollPage capital-A fix | 0.25 |
| 2FA: migrate TOTP columns to system_users | 0.5 |
| 2FA: rewrite `twofa.ts` (8 read sites → system_users) | 1.5 |
| 2FA: recovery codes (gen + hashed storage + display-once UI + verify-at-login) | 2.5 |
| 2FA: admin reset endpoint | 0.5 |
| 2FA: login-flow TOTP check + mandatory-for-admin gate | 1 |
| 2FA: Profile UI (setup, toggle, recovery codes display) | 1.5 |
| Integration tests DASH.1-DASH.10 (10 tests, ~20 min each) | 3 |
| FUTURE.md write-up (3 trigger conditions) | 0.5 |
| Build/deploy/iterate overhead (pnpm build cycles, type errors) | 1.5 |
| **TOTAL** | **17 hours** |

At 8 focused hours/day = 2 days work. At 10 hours/day = 1.7 days.

| Day | What | Risk |
|---|---|---|
| May 13 (today) | Audit doc approved (this), grep findings, Anna password check, nationalityScope audit | Low |
| May 14 | Code Part 1: auth unification, role-translation, JWT extension, canEditWorkers migration, PayrollPage fix | Medium |
| May 15 | Code Part 2: 2FA work (TOTP migration, recovery codes, admin reset, mandatory-for-admin, Profile UI), integration tests, FUTURE.md | Medium |
| May 16 morning | Deploy to staging. Manish walkthrough — single user, low-noise window. | High — first staging deploy of unified auth + 2FA |
| May 17 | Iterate on walkthrough findings (1-3 items realistic) | Medium |
| **May 18 morning** | **Merge to master. Deploy to production. Plan A.** | Medium |
| May 18 evening | Anna + Manish set up 2FA. Team rollout: "log in Tuesday morning." | Operational |
| May 19 | Team logs in. Yana on mobile-only (dashboard deferred per Section 13). | Operational |

**Fallback:** if May 14-15 code work hits a real snag, deploy slips to
May 19 morning, team rollout May 19 evening / May 20 morning.

**Brake-role note:** the May 17 prod deploy with May 18 fallback was the
fantasy timeline. May 18 morning prod deploy is the realistic baseline.
Anchoring on May 18 as baseline (not fallback) prevents pressure to cut
corners on the May 16 walkthrough.

**Risk flags on the estimate:**
- Drizzle schema regeneration after `canEditWorkers` + TOTP column moves
  can ripple into 5-10 type errors. Built into 1.5h overhead but could spike.
- Integration test fixture setup for role-translation paths is the most
  likely place to hit "this takes longer than priced." If test harness
  doesn't have system_users+tenant+JWT helper, factor +2 hours.
- 2FA Profile UI assumes dashboard has a Profile/Settings page. If not,
  factor +1.5 hours for shell + routing.

---

## 11.5 Commit sequence (revised after three refinements 2026-05-13 evening)

Three refinements accepted in cycle 3:
1. Interleave integration tests after each step (not batched at end) — closer to TDD discipline
2. FUTURE.md written FIRST (peak-context freshness on triggers)
3. PayrollPage capital-A fix as its OWN micro-commit BEFORE auth unification — survives any subsequent revert of auth work

**Commit sequence:**

| # | Commit | What | Why first/now |
|---|---|---|---|
| 0a | docs(future): trigger conditions for deferred work | FUTURE.md with 4 trigger sections (data-model unification, permissions-table revisit, nationalityScope full enforcement, broader 2FA mandate) | Refinement 2: peak-context clarity on triggers; north-star reference during implementation |
| 0b | docs(audit): Phase A audit doc with commit sequence | Audit doc + this sequence section | Pre-write artifact per term 2; all four approvals captured |
| 1 | fix(payroll): correct admin role check capital-A typo | PayrollPage.tsx:481 `"Admin"` → `"admin"` (one char) + interleaved test asserting Anna-as-admin sees ZUS breakdown | Refinement 3: independent of auth changes; survives subsequent revert; Anna gets fix same-day |
| 2 | feat(systemusers): canEditWorkers column + T3 backfill | `ALTER TABLE system_users ADD COLUMN IF NOT EXISTS can_edit_workers BOOLEAN NOT NULL DEFAULT TRUE` + seed update + DB-state assertion test | Schema first, before code that depends on it |
| 3 | feat(auth): unify dashboard on system_users + JWT extension | `routes/auth.ts` try-systemUsers-then-users, role-translation function, JWT payload extension, PayrollPage-type-shape update for new fields, `requireCoordinatorOrAdmin` honors canEditWorkers + DASH.1-DASH.9 tests (interleaved, exit step 2 with auth-coverage complete) | Core unification; DASH.9 lands here (depends on step 2 migration + step 3 middleware + JWT) |
| 4 | feat(2fa): migrate TOTP columns to system_users | `ALTER TABLE system_users ADD COLUMN IF NOT EXISTS two_factor_secret`, `two_factor_enabled`, `requires_2fa`, `recovery_codes_hashed` + idempotency test | Schema first for 2FA work |
| 5 | feat(2fa): twofa.ts swap to system_users + recovery codes + admin reset + mandatory-for-admin login enforcement | Rewrite 8 read sites in `routes/twofa.ts`, generation + display-once UI + verify-at-login fallback, admin-reset endpoint, login-flow TOTP gate + TFA.1-TFA.7 tests | Full 2FA flow + interleaved tests |
| 6 | feat(ui): Profile/Settings 2FA toggle + recovery codes UI | Dashboard frontend: setup flow, enable/disable toggle, recovery codes display-once, lost-phone path | UI verification deferred to May 16 walkthrough (no e2e harness; manual UI confirmation) |
| 7 | docs(eod): May 14-15 build close | EOD writeup capturing implementation surprises, walkthrough prep checklist for May 16 | End-of-build doc per term 6 (brake/reflection) |

**Independent properties of the sequence:**
- Commit 1 (PayrollPage) revertible without affecting any other commit
- Commits 2+3 paired (migration before middleware); reverting 3 doesn't require reverting 2 (column stays, just unused until re-applied)
- Commits 4+5 paired similarly (TOTP column migration before code that uses it)
- Commit 6 (UI) revertible without affecting backend 2FA enforcement

**What gets deployed when:**
- May 14 morning: Commit 1 (PayrollPage) can deploy independently to staging for early signal
- May 14 EOD: Commits 1-3 complete on branch (auth core done)
- May 15 EOD: Commits 4-6 complete on branch (2FA full)
- May 16 AM: Single staging deploy of entire branch state for walkthrough
- May 18 AM: Production deploy after walkthrough iteration

---

## 12. FUTURE.md trigger conditions (four deferred items)

The auth-layer adapter is a stepping stone. End-states require concrete
revisit triggers — without them, deferred work accumulates.

### 12.1 Data-model unification: `users` becomes view over `systemUsers`

**Trigger, whichever first:**
- Next team member to onboard beyond the 6 (Akshay, future hires, etc.)
- Within 30 days of May 18 stabilization
- First instance of role-translation logic becoming insufficient

### 12.2 Permissions-table revisit (replace per-user capability flags)

**Trigger, whichever first:**
- 5th per-user capability flag added to `systemUsers`
- First flag whose enforcement spans 10+ sites in the codebase
- Within 90 days of May 18

**Important:** `nationalityScope` already sits at the 10+ enforcement-site
threshold today (24 enforcement gaps per Section 13). Post-May-18 cleanup
work is real, not hypothetical. The permissions-table revisit may need to
happen alongside (or before) the data-model unification in 12.1.

### 12.3 nationalityScope full enforcement across dashboard read paths

**Trigger, whichever first:**
- Before adding any second scoped user (e.g., a future "Indian workers only"
  liaison, or any second `nationalityScope`-set row in systemUsers)
- Within 60 days of May 18

**Why this needs an explicit trigger:** today only Yana has scope set, so
the 24 enforcement gaps don't leak. But a future scoped user reopens every
gap simultaneously. Yana is held off the dashboard May 18 because of this
(Section 13). Cleanup work to bring Yana online: fix all 24 sites with
proper scope filter (8 list reads, 6 join reads, ~10 point fetches).

### 12.4 Broader 2FA mandate review

**Trigger, whichever first:**
- First phishing attempt against any EEJ account (any team member, any
  surface — even a failed attempt counts as signal)
- Within 30 days of May 18

**Reasoning:** May 18 ships mandatory-for-admin + opt-in for everyone else.
If phishing pressure rises (or any incident occurs), escalate to "mandatory
for all dashboard users" or "mandatory for any user with
`canViewFinancials=true` or `canEditWorkers=true`."

---

## 13. Known issues + risk flags

1. **PayrollPage.tsx:481 capital-A typo.** Pre-existing bug. Surfaces during
   audit. Fix in same commit (one-line).

2. **`requireCoordinatorOrAdmin` blocks managers from PATCH /workers/:id.**
   Karan/Marj/Yana do worker data entry on the dashboard. Without a finer
   gate, T3 → manager mapping breaks their workflow. **Recommend adding
   `canEditWorkers` boolean to systemUsers** (additive migration, peer-mode-OK).

3. **`nationalityScope` enforced on exactly ONE site (`routes/workers.ts:412`).**
   Audit (2026-05-13 evening) counted **24 enforcement gaps** across the
   API:
   - **8 list reads** bypass scope: `workers.ts:431` (/workers/stats),
     `workers.ts:449` (/workers/report), `workers.ts:1079` (derived list helper),
     `payroll.ts:20, 89, 297`, `compliance.ts:41`, `gps.ts:75`, `regulatory.ts:148`.
   - **6 join reads** bypass scope: `gdpr.ts:18`, `permits.ts:73, 174`,
     `interviews.ts:15`, `jobs.ts:51, 196, 265`.
   - **~10 point fetches** by ID filter on `tenantId` only, not nationality.
     Knowing-the-ID = read access. Yana could navigate to a worker detail
     URL by guessing an ID and view non-Ukrainian data.

   **Today's narrowing:** only Yana has `nationalityScope` set; the other
   five have NULL ("see all"). So immediate blast radius is one user, not
   six. **Mitigation for May 18: Yana on mobile-only; Karan/Marjorie on
   dashboard (NULL scope = no leak); Manish/Anna/Liza on dashboard.**
   Full fix tracked in FUTURE.md 12.3 with a trigger before any second
   scoped user joins.

4. **2FA scope and migration plan.** Existing TOTP code (`routes/twofa.ts`)
   uses `speakeasy` + `qrcode`, is functional, and reads `schema.users` at
   8 sites. `system_users` does NOT have TOTP columns today. Decision: bring
   2FA into May 18 scope with mandatory-for-admin + opt-in-for-others
   (NOD 4 sharpening).
   - Migrate `two_factor_secret` + `two_factor_enabled` to `system_users`
     (additive: `ALTER TABLE system_users ADD COLUMN IF NOT EXISTS ...`).
   - Add `recovery_codes` (hashed, JSON array of scrypt-hashed codes) to
     `system_users` for lost-phone fallback.
   - Add `requires_2fa` boolean to `system_users`, default TRUE for admin
     role and the two admin emails (Manish, Anna), FALSE otherwise.
   - Rewrite 8 read sites in `twofa.ts` to point at `system_users`.
   - Add admin-reset endpoint for lost-phone-without-recovery-code case.
   - Login flow: if `requires_2fa` is true OR `two_factor_enabled` is true,
     require TOTP at second step (after password verification).
   - Profile UI: setup flow (QR code already returned by API), recovery
     codes display-once, enable/disable toggle.
   - Time estimate: 1-1.5 days (see Section 11 timeline).

5. **`canEditWorkers` schema change scope.** Adding a boolean column to
   systemUsers is additive: `ALTER TABLE system_users ADD COLUMN IF NOT
   EXISTS can_edit_workers BOOLEAN NOT NULL DEFAULT TRUE`. Peer-mode OK per
   term 2 (additive migration, blast radius local). Default TRUE means no
   existing user loses access on migration. Backfill specifically for T3:
   `UPDATE system_users SET can_edit_workers = TRUE WHERE role = 'T3'`
   (idempotent given default; explicit for documentation).

---

## 14. Approval checklist (cycled 2026-05-13)

- [x] **Manish** — operational/UX adversary. Approved all four nods with
  three improvements: PayrollPage bundling (NOD 1), FUTURE.md trigger
  sharpening with 10-site rule (NOD 2), Yana-deferred-from-dashboard with
  Karan/Marjorie OK on dashboard (NOD 3), 2FA mandatory-for-admin / opt-in
  for others (NOD 4). Anna password change acceptable. May 18 baseline
  acceptable.

- [x] **chat-Claude** — systemic/architectural adversary. Confirmed
  auth-adapter shape sound, trigger conditions concrete enough, half-day
  2FA estimate corrected to 1-1.5 days, sharpening framing accepted.

- [x] **Claude Code (self-attestation as safety adversary).** Blast radius
  bounded:
  - Auth unification: single commit, clean revert path (Section 10).
  - `canEditWorkers` migration: additive, default TRUE — no existing user
    loses access.
  - TOTP migration to system_users: additive — existing `users` columns
    remain (zero-risk; only Anna has a `users` row and 2FA not seeded today).
  - PayrollPage typo fix: one-character change, walkthrough verifies.
  - 2FA mandatory-for-admin: enforced at login; Anna + Manish set up day-one
    on May 18 before team rollout (operational order documented).
  - Yana dashboard deferral: explicit; no silent leak.
  - Pre-existing bugs (PayrollPage typo) bundled with explanatory commit
    message; not silent inclusions.

  Honest timeline estimate provided in Section 11: 17 focused-work hours,
  May 18 morning prod deploy is realistic baseline, May 19 morning is
  actual fallback. Per term 6 (brake) — explicitly anchored on May 18
  not May 17 to prevent corner-cutting on May 16 walkthrough.

**All three nods landed.** Code commit begins May 14.

---

## 15. Hard boundaries reaffirmation

- No DELETE on audit_entries
- No DROP TABLE / DROP COLUMN
- No force push
- No hardcoded passwords
- Pre-write audit (this doc) precedes any code change to `routes/auth.ts`
  (auth-architecture-level surface — explicit codification term-2 path)
- pnpm not npm
- Build dist before pushing
- Test ZUS formula (`160h × 31.40 = 3929.05`) — not touched by this change but
  remains a CLAUDE.md invariant
- Single-commit change for clean revert
