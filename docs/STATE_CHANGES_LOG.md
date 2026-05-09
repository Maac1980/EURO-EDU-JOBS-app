# EEJ — State Changes Log

**Purpose:** record manual SQL operations on production / staging databases that
aren't captured in `migrate.ts`. Future operations of this kind MUST be appended
here, in chronological order, with operator + reason + scope + impact.

**Why this log exists:** Item 2.7 #14 — Day 18 WhatsApp activation flipped
`whatsapp_templates.active=true` in production via manual SQL with no source-tree
trace. Caused D4/D7 test fragility (caught Day 21 via T0-A CI failure
diagnosis). Future child-branches inherit post-activation state silently, with
no greppable trace of when or why the change happened. This log closes that
gap going forward.

**Scope:**
- Operations that are **NOT** in `migrate.ts` (those are codified)
- Operations that are **NOT** Fly secrets rotation (that's password-manager-side)
- Operations that change **business-decision state** captured in the database
  (e.g., feature activation, manual data backfills, one-off corrections)

**Discipline:**
- New entries appended at top (reverse chronological — newest first)
- Every entry: date, operation summary, reason, surface impact, follow-ups
- Operations affecting child Neon branches (staging, eej-test) call out which
  branches inherit the change

---

## 2026-05-06 (Day 18) — Activate WhatsApp templates in production

**Operation:**
```sql
UPDATE whatsapp_templates
SET active = TRUE
WHERE name IN ('application_received', 'permit_status_update', 'payment_reminder')
  AND tenant_id = 'production';
```

(Plus per-template `content_sid` updates with Twilio Content API IDs from the
3 templates created in Twilio Console Day 17.)

**Reason:** Item 2.1 WhatsApp Step 3 activation. Twilio sandbox sender approved
+ 3 Content API templates created + content_sid provisioned per template. Manual
SQL ran via Neon Console (or flyctl ssh + psql equivalent) to flip the seeded
templates from `active=false` (migrate.ts default) to `active=true` (operationally
live).

**Why not codified in migrate.ts:** activation is a business decision (Twilio
Business Sender approved → templates can go live), not a migration-time
invariant. Codifying as idempotent UPDATE in migrate.ts would re-execute on
every fresh-DB recreate, locking the activation policy into code. STATE_CHANGES_LOG
is the discipline layer instead.

**Surface impact:**
- `staging` branch (created Day 20 via Item 2.4 P1 from prod parent) inherits
  `active=true` for these 3 templates
- `eej-test` branch (created Day 21 via Item 2.6 P1 from prod parent) inherits
  `active=true` for these 3 templates
- `services/whatsapp-drafter.test.ts` D4 + D7 assumed `active=false` for
  `application_received` (per migrate.ts default) — broke on first CI run with
  `TEST_DATABASE_URL` wired (Day 21). Fixed via test-controlled inactive
  template (commit `33aadf0`).

**Follow-ups:**
- Tests now use Date.now()-suffixed test-controlled inactive templates instead
  of relying on seeded fixture state (commit `33aadf0`).
- Future activations of additional templates (e.g., `expiry_nudge`,
  `salary_advance`) require a new STATE_CHANGES_LOG entry.

---

## (template for future entries)

```
## YYYY-MM-DD (Day NN) — Title

**Operation:** [SQL or operational action]

**Reason:** [why this was needed; what business event triggered it]

**Surface impact:**
- [child branches affected]
- [tests / code that depended on prior state]
- [downstream services that might assume new state]

**Follow-ups:**
- [tracked Item 2.X follow-ups created from this change, if any]
- [tests that need updating]
```
