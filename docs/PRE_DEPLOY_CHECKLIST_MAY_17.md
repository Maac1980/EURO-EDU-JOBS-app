# Pre-deploy checklist — May 17 production / May 16 staging

**Branch:** `tuesday-cockpit-build`
**Last commit at time of writing:** `2cdd91d`
**Production app:** `eej-jobs-api` (Fly.io, region `ams`)
**Staging app:** `eej-api` (Fly.io)

This checklist exists because three items were surfaced across the
May 13-14 build sessions that don't fit naturally into an audit doc or
case law, but absolutely cannot be lost between now and May 18 team
rollout. Each item has a verifier and a timing window.

Pair this doc with `docs/EOD_MAY_13.md` (auth/2FA scope + risks) and
`docs/PHASE_A_AUDIT_DASHBOARD_AUTH_UNIFICATION.md` (full decision shape).

---

## 1. Open items that block May 18 if not resolved

### 1.1 Worker count discrepancy — OPEN, requires Manish

**Source of conflict:** `CLAUDE.md` says "200+ workers"; `docs/STRATEGIC_RECOMMENDATIONS.md` (Day 17, May 5) line 20 says "~70 active foreign welders at three named user-employers (Tekra, Izotechnik, Gaztech)."

**Why it matters for May 18:**
- WhatsApp template send-rate planning (200+ vs 70 changes throttle math)
- Liza's per-worker workload framing for the walkthrough demo
- AI summary cost estimates (auto-fire-on-alerts × actual headcount)

**Action:** Manish answers the canonical number. Update CLAUDE.md to the
correct figure OR clarify the 200+ figure includes cross-entity (EEJ +
APATRIS Sp. z o.o. welders + others). Whichever way it lands.

**Owner:** Manish
**Window:** anytime before May 18 rollout briefing
**Status:** OPEN

### 1.2 WhatsApp templates — flip `active = TRUE` post-Twilio-approval

Four templates were seeded by Tuesday's work (`migrate.ts`) as
`active = FALSE` because they need Twilio Business Sender approval
before they can be sent. Names:
- `trc_expiry_reminder_pl` / `trc_expiry_reminder_en`
- `documents_missing_pl` / `documents_missing_en`

Three older templates from earlier sprints are also seeded as inactive
and may need flipping at the same time:
- `application_received`
- `permit_status_update`
- `payment_reminder`

**Why it matters for May 18:** the cockpit's AI summary returns
suggested actions including `send_whatsapp` with a `templateHint` field.
If Liza/Yana taps "Send TRC reminder" and the matching template is
inactive, the picker shows empty and the action falls flat. Demo
visibly breaks.

**Action:** verify Twilio Business Sender approval status; once
approved, run:

```sql
UPDATE whatsapp_templates
SET active = TRUE
WHERE name IN (
  'trc_expiry_reminder_pl',
  'trc_expiry_reminder_en',
  'documents_missing_pl',
  'documents_missing_en',
  'application_received',
  'permit_status_update',
  'payment_reminder'
);
```

Run against the production Fly Postgres. Log the change to
`docs/STATE_CHANGES_LOG.md` per CLAUDE.md state-changes protocol.

**Owner:** Manish (Twilio approval + SQL execution)
**Window:** ideally May 17 morning before production deploy; latest
acceptable is May 18 morning before team rollout call
**Status:** OPEN (Twilio approval status unknown at time of writing)

### 1.3 Anna password heads-up — operational notification

Anna's portal login post-unification resolves through the system_users
path (commit 3 — `routes/auth.ts` queries system_users first, falls
back to users). Her password becomes the system_users seed bootstrap,
which is `EEJ_SEED_PASSWORD` env var (`EEJstart-2026!` per
`docs/TEAM_ONBOARDING.md`), NOT the legacy `EEJ_ADMIN_PASSWORD` env
var she's been using.

Her existing valid portal token (signed with the same `JWT_SECRET`,
old payload shape) continues to validate until expiry. Her NEXT login
after deploy uses the new password.

**Why it matters for May 18:** if Anna isn't told, she tries her old
password on May 18 morning, gets "Incorrect password", calls Manish,
demo workflow disrupted before the team-rollout call even starts.

**Action:** Manish messages Anna directly before May 18 morning with:
- "On May 18 your portal login uses your mobile bootstrap password
  (EEJstart-2026!), not the old portal password."
- "Your current session continues to work until it expires (24h)."
- "After first new login you can change to anything you want via
  Profile → Two-Factor Authentication card / change-password flow
  (also pair with 2FA setup on day one — your account is admin-tier,
  2FA is mandatory)."

**Owner:** Manish
**Window:** before May 18 morning. Earlier is better — Sunday afternoon
gives her time to read it.
**Status:** OPEN

---

## 2. Pre-staging-deploy checks (May 15 evening / May 16 morning)

Before running `~/.fly/bin/flyctl deploy --config fly.staging.toml --app eej-api`:

- [ ] All May 14 commits clean on CI? (typecheck + build + vitest)
  - Branch: `tuesday-cockpit-build`
  - Latest commit: confirm via `git log -1 --oneline`
  - CI status: confirm green on GitHub Actions before deploy
- [ ] Fly staging secrets confirmed set:
  - `JWT_SECRET` (must match production so auth-unification token portability holds)
  - `DATABASE_URL` (staging Neon branch — `eej-staging` per recent docs)
  - `EEJ_SEED_PASSWORD` — required for the team-members seed to run; if absent, only Anna's row exists in system_users
  - `EEJ_ADMIN_PASSWORD` — legacy admin login, kept for fallback path
  - `EEJ_ENCRYPTION_KEY` — PESEL/IBAN encryption
  - `ANTHROPIC_API_KEY` — AI summary, scan flow, legal-answer engine
  - `PERPLEXITY_API_KEY` — immigration search
  - `BREVO_SMTP_USER` + `BREVO_SMTP_PASS` — email alerts
  - `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` — WhatsApp send
  - `ALLOWED_ORIGINS` — verify staging origin (`eej-api.fly.dev`) is
    in the list OR confirm code default in `app.ts` covers it (commit
    `9041a14` added it to the default)
- [ ] Migration idempotency confirmed:
  - All new columns from commits 2, 4 use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  - Backfill UPDATE statements use `AND col = FALSE` (or equivalent)
    so re-runs are no-ops
  - No `DROP` statements added
- [ ] Quick smoke after deploy (manual, 5 min):
  - `GET /api/healthz` returns 200
  - `GET /` serves the dashboard SPA (commit `9041a14` CORS fix
    confirmed this works on staging)
  - Login as Anna → workers list loads
  - Click a worker → WorkerProfilePanel opens
  - Click "View full cockpit →" → cockpit loads with 11 panels

---

## 3. May 16 walkthrough — Manish-led, single user, low-noise window

After staging deploy, Manish walks through the full Liza-flow:
- [ ] Login as Anna (admin) → 2FA setup-required flow fires → QR + verify → JWT issued
- [ ] Workers list → click any worker → cockpit opens
- [ ] Cockpit shows all 11 panels in executive role-order
- [ ] AI summary auto-fires when worker has alerts
- [ ] Tap action button → correct dashboard route opens
- [ ] On a worker with REJECTED TRC: "Ask AI about appeal" button appears
- [ ] Tap → structured legal response with Polish KPA Art. 127 references
- [ ] Logout
- [ ] Login as Liza (coordinator) → 2FA opt-in (not mandatory) → cockpit access
- [ ] LegalCommandCenter accessible from nav
- [ ] WhatsApp send-upload-link button works for a worker with phone on file

Walkthrough findings get committed as docs/EOD_MAY_16.md before next
work session.

---

## 4. Pre-production-deploy checks (May 17 afternoon)

Before running `~/.fly/bin/flyctl deploy -a eej-jobs-api`:

- [ ] May 16 walkthrough findings either resolved on branch OR named
  iteration items with explicit defer-reason
- [ ] Section 1 open items resolved:
  - 1.1 worker count answered
  - 1.2 WhatsApp templates flipped active OR explicit deferral
  - 1.3 Anna messaged
- [ ] Branch merged to master via `git merge tuesday-cockpit-build` on
  master (NOT force-pushed; create a merge commit)
- [ ] Production Fly secrets verified match the staging set
- [ ] Production database backup confirmed taken before migration
  runs (Neon point-in-time recovery; verify the snapshot exists)
- [ ] `~/.fly/bin/flyctl deploy -a eej-jobs-api` runs cleanly
- [ ] Post-deploy: `GET /api/healthz` returns 200
- [ ] Post-deploy: Manish logs in, smokes the Anna flow once

---

## 5. May 18 team rollout

In order:
1. Anna + Manish set up 2FA first thing (mandatory, requires_2fa = TRUE)
2. Anna confirms login working with new password
3. Manish messages Liza/Karan/Marjorie/Yana with their bootstrap
   password and the portal URL
4. Yana stays on mobile-only (nationalityScope dashboard 24-gap
   deferral per FUTURE.md §3)
5. Liza/Karan/Marjorie log in on dashboard, change password, optional
   2FA setup
6. Monitor for: failed-login spikes, 5xx errors, audit-trail
   anomalies for first 24 hours

---

## 6. Rollback plan if production deploy goes sideways

Per `docs/PHASE_A_AUDIT_DASHBOARD_AUTH_UNIFICATION.md` §10:
- `git revert <sha>` on master + `flyctl deploy` = ~5 min back to
  pre-unification state
- Anna's tokens stay valid (signed with same secret across revert)
- Team members lose access to portal but still have mobile app
- No data state change to revert — auth unification was read-only on
  user tables; canEditWorkers / TOTP / requires_2fa columns stay in
  the DB but are unused by the reverted code (additive, dormant)

Tighter rollback if specific commit breaks: `git revert <specific-sha>`
preserves the rest. Granular per commit per the discipline established
in EOD_MAY_13.md.

---

End of checklist. Update this doc as items resolve. Empty checkboxes
flagged at deploy time = deploy holds.
