# EEJ Team Onboarding

**Audience:** EEJ team members logging into the EEJ mobile app for the first time.
**Origin:** Item T23 (Day 23, 2026-05-11). Closes Day 23 audit blockers F4 (real team accounts) + F5 (onboarding docs).
**Canonical reference:** `docs/EEJ_CORE_PLAN.md` v1.18 §"Operator Transition Plan".

---

## Provisioned team accounts

The following accounts are seeded into `system_users` on next migration run. Each user logs in via the EEJ mobile app with the bootstrap password (shared securely by Manish), then **immediately rotates** to a personal password via `POST /eej/auth/change-password`.

| Name | Email | Role | Tier | Business-financial access | Worker nationality scope |
|---|---|---|---|---|---|
| Manish Shetty | `manish.s@edu-jobs.eu` | Founder & Executive | T1 | ✅ Yes | All |
| Anna Bondarenko | `anna.b@edu-jobs.eu` | Executive Board & Finance | T1 | ✅ Yes | All |
| Liza Yelyzaveta Chubarova | `liza.c@edu-jobs.eu` | Head of Legal & Client Relations | T1 | ❌ No (legal scope, not financial) | All |
| Karan Chauhan | `karan.c@edu-jobs.eu` | Recruitment & People Operations | T3 | ❌ No | All |
| Marjorie Isla Ramones | `marjorie.r@edu-jobs.eu` | Recruitment Operations | T3 | ❌ No | All |
| Yana Zielinska | `yana.z@edu-jobs.eu` | Contracts & UA Liaison | T3 | ❌ No | **Ukrainian only** |

**Worker-level financial fields** (a worker's own salary, advance, payroll calculations) remain accessible to **all team** regardless of `can_view_financials`. The gate restricts **business-level financials** only: invoices issued to clients, revenue forecasts, executive dashboard KPIs.

---

## What each tier sees in the mobile app

Per `eej-mobile-HIDDEN/src/components/BottomNav.tsx`:

- **T1 (Manish, Anna, Liza)** → executive layout: Home · Candidates · Jobs · Alerts · More
- **T3 (Karan, Marjorie, Yana)** → operations layout: Home · Pipeline · Jobs · Alerts · More
- (T2 + T4 reserved for legal-specific + candidate-worker tiers; not provisioned in this rollout.)

Yana's worker-listing queries automatically filter to Ukrainian nationality. Other T3 users see all workers in the tenant.

---

## First-login flow (per user)

1. Open EEJ mobile app (`eej-jobs-api.fly.dev` PWA install or browser)
2. Enter your `@edu-jobs.eu` email + bootstrap password (Manish shares via secure channel — Signal, in-person, or password manager)
3. Login succeeds; you land on your tier-specific home tab
4. **Immediately rotate password:**
   - In the app: settings → change password (UI surface; binds to `POST /api/eej/auth/change-password`)
   - OR via API directly with your token:
     ```
     curl -X POST https://eej-jobs-api.fly.dev/api/eej/auth/change-password \
       -H "Authorization: Bearer <your token>" \
       -H "Content-Type: application/json" \
       -d '{"currentPassword":"<bootstrap>","newPassword":"<your new password, 8+ chars>"}'
     ```
5. Verify new password works by logging out + logging back in
6. Notify Manish that rotation is complete; Manish will rotate `EEJ_SEED_PASSWORD` after all users complete first-login rotation (closes the bootstrap window)

---

## Manish-side activation (post-commit)

After commit lands on master and deploys to production:

0. **Deploy from REPO ROOT** — never from `artifacts/api-server/`. The Docker
   build context must be the repo root so the pnpm workspace (lib/api-zod,
   lib/db, pnpm-workspace.yaml) is visible to `pnpm install` inside the
   container; deploying from `artifacts/api-server/` fails with
   `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND: @workspace/api-zod`.
   ```
   cd /Users/manishshetty/Desktop/EURO-EDU-JOBS-app   # repo root
   ~/.fly/bin/flyctl deploy -a eej-jobs-api --remote-only
   ```
   Staging:
   ```
   ~/.fly/bin/flyctl deploy --config fly.staging.toml --app eej-api --remote-only
   ```

1. **Confirm `EEJ_SEED_PASSWORD` is set on production Fly secrets:**
   ```
   ~/.fly/bin/flyctl secrets list --app eej-jobs-api | grep EEJ_SEED_PASSWORD
   ```
   If absent, set it:
   ```
   ~/.fly/bin/flyctl secrets set --app eej-jobs-api EEJ_SEED_PASSWORD='<bootstrap password>'
   ```
   Same for staging:
   ```
   ~/.fly/bin/flyctl secrets set --app eej-api EEJ_SEED_PASSWORD='<bootstrap password>'
   ```

2. **Trigger migration:** auto-runs on next deploy. Migration adds the two columns + seeds the 6 new users. Existing Anna row receives `can_view_financials=TRUE` via idempotent UPDATE.

3. **Verify each user can log in:**
   ```
   curl -X POST https://eej-jobs-api.fly.dev/api/eej/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"manish.s@edu-jobs.eu","password":"<bootstrap>"}'
   ```
   Expect 200 with token + user shape including `canViewFinancials` + `nationalityScope`.

4. **Share bootstrap password with team via secure channel.** Tell each user to rotate immediately.

5. **Deactivate historical accounts:** once team rollout stable (e.g., Day 24+), use a T1 token to remove the legacy `ceo@`, `legal@` (Marta), `ops@` (Piotr) entries:
   ```
   curl -X DELETE https://eej-jobs-api.fly.dev/api/eej/auth/users/<id> \
     -H "Authorization: Bearer <T1 token>"
   ```
   Fetch IDs via `GET /api/eej/auth/users` (T1 only).

6. **Rotate `EEJ_SEED_PASSWORD`** after all 6 users complete first-login rotation. This closes the bootstrap window — future seeded users (if any) would need a fresh bootstrap password.

---

## What happens server-side

### When a team member logs in
`POST /api/eej/auth/login` queries `system_users`, verifies scrypt-hashed password, mints a JWT carrying:
- `id`, `email`, `name`, `role` (mapped to executive/legal/operations/candidate)
- `tier` (1-4)
- `tenantId: "production"` (Stage 4)
- **`canViewFinancials`** + **`nationalityScope`** (T23 fields)

JWT lifetime: 7 days. Refresh via `POST /api/eej/auth/refresh` re-pulls flags from DB.

### When a team member accesses an invoice
- Mobile app GET `/api/invoices` with `Authorization: Bearer <token>`
- `authenticateToken` decodes JWT
- `requireFinancialAccess` checks `req.user.canViewFinancials !== false`
- Liza/Karan/Marjorie/Yana → 403 "Financial access required"
- Manish/Anna → invoices returned

### When Yana lists workers
- Mobile app GET `/api/workers`
- After tenant scoping + manager-site filter, `nationalityScope` filter kicks in
- Yana sees only workers where `nationality === "Ukrainian"`
- Manish/Anna/Liza/Karan/Marjorie see all workers (no scope set)

### When a team member rotates password
- Mobile UI calls `POST /api/eej/auth/change-password` with current + new password
- Server verifies current password via scrypt, hashes new password, UPDATEs `system_users.password_hash`
- Existing tokens remain valid until expiry (7 days); user can `POST /api/eej/auth/refresh` to invalidate old session by minting new one

---

## Per-user-flag changes after onboarding

When Manish needs to adjust `can_view_financials` or `nationality_scope` for any user post-onboarding:

```
~/.fly/bin/flyctl ssh console --app eej-jobs-api --machine <id> \
  -C "cd /app/artifacts/api-server && node -e \"const{Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.query(\\\"UPDATE system_users SET can_view_financials = TRUE WHERE email = 'user@edu-jobs.eu'\\\")).then(()=>{console.log('ok');process.exit(0)})\""
```

(Future improvement: admin UI for flag toggling — tracked as Movement 3+ hygiene.)

User must logout + login again (or call refresh) for new flags to take effect — JWT carries the flags at mint time.

---

## Discipline lineage

- **Plan-in-repo canonical:** `EEJ_CORE_PLAN.md` v1.18 §"Operator Transition Plan" lists Liza/Karan/Marj/Yana as the real EEJ team. This doc operationalizes that section.
- **Item T23 audit (Day 23):** F4 (no real team accounts) + F5 (no onboarding doc) surfaced as May 18 blockers. This doc + the T23 commit close both.
- **AC-8.X verification mechanism:** 8 new tests (T23.1 through T23.4b) verify the flags work in CI (DB-gated). Empirically observable in `integration.test.ts`.
- **HB-14 enforcement:** `migrate.ts` only INSERTs + idempotent UPDATEs the `can_view_financials` flag for Anna+Manish. No DELETEs. Marta/Piotr/ceo@ removal happens via admin-side `DELETE /api/eej/auth/users/:id` post-deploy.

---

## Maintenance

**Revision history:**
- v1: 2026-05-11 (Day 23). Initial doc landed with Item T23 commit. 6 real team accounts + per-user permission flags. Marta+Piotr+ceo@ kept in seed temporarily for backward compat; Manish deactivates via DELETE endpoint post-deploy.
