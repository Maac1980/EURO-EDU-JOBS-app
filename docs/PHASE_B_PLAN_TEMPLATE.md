# EEJ — Phase B Plan Template + Discipline Framework

**Purpose:** codify three Phase-A-and-Phase-B disciplines that emerged operationally
during EEJ Movement 2 work. Lives in repo (per Item 2.7 #26 source-of-truth
co-location protocol) so EEJ Claude can read it as canonical reference.

**Items 2.X follow-ups closed by this document:**
- **#15** — Phase B Plan template guidance: distinguish "fresh schema" vs "branch
  from production"
- **#20** — AC-8.X "Verification Mechanism Discipline" — Phase B Plan template
  must put CI verification infrastructure before test code commits
- **#26** — Source-of-truth co-location protocol: chat-Claude artifact storage
  vs EEJ repo divergence prevention

---

# Section 1 — Phase B Plan template (#15)

## Standard Phase B Plan structure

Every Item X.Y Phase B Plan landed at `docs/ITEM_X_Y_PHASE_B_PLAN.md` follows
this structure:

```
# Item X.Y — <Title>: Phase B Plan

**Status:** Phase B Plan drafted (working draft, untracked).
**Date:** YYYY-MM-DD (Day N).
**Canonical reference:** docs/EEJ_CORE_PLAN.md vN.NN + docs/<Phase A findings>.
**Scope:** <one-sentence scope>.
**Discipline:** every fix has verification artifact (test, grep, schema check).

## Reality vs. plan note (HB-7)
[any deltas between authorization prompt and Phase A categorization]

## <Item> inventory
[per-item table: # | Item | Class | Effort | Type | Files affected]

## Per-item scope
[for each item: Why / Approach / Verification / Risk / Sequencing]

## Sequencing within <Item>
[order with reasoning]

## Bundle vs per-item commit decision
[tradeoff table; recommendation]

## Decisions needed before Phase B execution
[numbered list of decisions for Manish]

## Cross-pass discipline notes
- AC-8.X verification mechanism — applied per item
- Five-Tyre principle — re-verified per item
- Plan-in-repo as canonical reference

🛑 GATE T<item>-PHASE-B-PLAN
[awaiting Manish review on N decisions + sequencing + commit-scope]
```

## Branch data-state declaration (mandatory in Phase A)

Every Phase A audit that creates or relies on a Neon branch MUST declare branch
data-state explicitly. Three modes:

| Mode | Description | Suitable for |
|---|---|---|
| **Fresh schema** | Branch created via Neon Console "anonymized data" or post-creation `TRUNCATE` of all tables | Test isolation, deterministic fixtures |
| **Branch from production** | Default Neon branch behavior — inherits parent data at branch-create time | Drill scenarios, regression testing against real data shapes |
| **Hybrid** | Branch from production + selective data wipe per table | When some tables need real shape, others need clean slate |

**Mandatory verification step post-branch-creation:** query a representative
table immediately after branch-create to confirm expected starting state. Don't
trust the Neon Console "anonymized data" toggle without verification.

**Origin of this discipline:** Item 2.6 T0-A CI failure diagnosis (Day 21).
Plan said `eej-test` branch was "schema-only" — reality was branch inherited
production data including post-Item-2.1 `whatsapp_templates.active=true` state
that broke D4/D7 test assumptions. Discipline closes the gap: future Phase A
declares + verifies, doesn't assume.

## Standard Phase B Plan deliverables

Each Phase B Plan exits with:
1. Working draft at exact path `docs/ITEM_X_Y_PHASE_B_PLAN.md` (untracked)
2. GATE T<item>-PHASE-B-PLAN halt for Manish review
3. Decisions enumerated for Manish authorization
4. After authorization: Phase B execution proceeds per locked sequencing

---

# Section 2 — AC-8.X: Verification Mechanism Discipline (#20)

## Principle

**Verification mechanism (CI actually running tests, plan actually in repo,
secret actually wired to environment) MUST PRECEDE feature commits, not
follow them.**

If verification mechanism doesn't exist when a feature commit lands, the
feature is unverified. Not "verified locally" — *unverified*. Local-only
validation cannot exercise mock-resolution paths against real dependencies,
schema-vs-query interactions against real schema, or test-file parallelism
races against real shared infrastructure.

## Self-review at GATE T*-EDIT must explicitly acknowledge

Every Phase B execution self-review at `GATE T<item>-EDIT` includes verbatim:

> Local validation is structural-only (typecheck pass + skip-gated count
> parity + visual diff inspection). Functional verification deferred to CI.
> Pre-existing test breakage risk acknowledged.

**Don't claim "no regressions" pre-CI.** Local skip-gated runs cannot regress
DB-gated tests. Claiming "no regressions" before CI runs the full DB-gated
suite is over-confident reporting.

## Concrete examples surfaced from Days 17-21

| Item | Verification mechanism missing | Outcome |
|---|---|---|
| Item 2.6 T0-A commit `5eb6373` (Portal) | `TEST_DATABASE_URL` not wired in `ci.yml` env block (P3 set GH secret but T0-E env-wire was Phase B Plan's last step, not first) | CI showed 77 skipped; "ran" test added 16 skips, didn't actually verify |
| Item 2.6 T0-C commit `0f6e35e` (WhatsApp outbound) | Local skip-gated run claimed "no regressions" | CI surfaced 7 failures (5 webhook 403 + D2 col + Sd2 race) — 3 distinct clusters |
| Item 2.6 T0-C fix-forward `c3101cb` (vi.mock spread) | Local validation cannot exercise twilio CJS module resolution | CI still 5 failures — second fix-forward needed (`21989e1` explicit named exports) |
| Movement 3 Phase A (Day 21) | EEJ_CORE_PLAN.md referenced in prompt but absent from repo | EEJ Claude halted at GATE T3-PHASE-A; plan written to repo before re-entry |

In every case, the discipline of "verification before claim" caught the gap.
In two cases (T0-A, T0-C), the gap had been latent — the missing verification
mechanism would have been caught earlier had the discipline been formally
encoded.

## How to apply at Phase B drafting

When drafting Phase B Plan:
1. Identify what verification mechanism the work depends on
2. If verification mechanism doesn't exist yet, plan its creation **before** the
   feature work, not after
3. T0-E pull-forward precedent (commit `e53174b`) — CI env-wire moved from
   "last step" to "first step" once discovered missing

When self-reviewing at GATE T*-EDIT:
1. List local validation done (typecheck, skip-gated suite, grep)
2. Explicitly acknowledge what local validation **cannot** verify (real DB
   queries, mock module resolution, parallel test file races, deploy behavior,
   external API responses)
3. Surface CI as canonical, don't pre-empt CI verdict

When CI fails:
1. Treat surfaced gap as discipline operating, not as embarrassment
2. Diagnose root cause (audit pattern weakness lesson — verify with multiple
   greps + actual reality before accepting hypothesis)
3. Fix-forward in single commit; if fix-forward fails twice, escalate to
   architectural reframe or revert (per Item 2.6 T0-C precedent)

## Three-attempt fix-forward limit

Per Item 2.6 T0-C precedent: maximum 3 fix-forward attempts before structural
step-back. Beyond 3 attempts signals structural problem requiring revert or
re-plan, not continued patching.

---

# Section 3 — Source-of-truth co-location protocol (#26)

## Principle

**Plan / framework / discipline content referenced in EEJ Claude's Phase A
prompts MUST land in the EEJ repo (`docs/`) before being referenced.** No
exceptions.

chat-Claude artifact storage at `/mnt/user-data/outputs/` and other ephemeral
locations is fine for chat-Claude's own working notes. But content that EEJ
Claude must read to interpret a prompt — plan numbering, principle definitions,
backlog item numbering, framework concepts — must be repo-resident.

## Why this exists

Day 21 GATE T3-PHASE-A halt: Manish's authorization prompt referenced:
- `EEJ_CORE_PLAN.md` (didn't exist on disk in repo)
- "Five-Tyre Principle" (zero hits across `*.md` files)
- "Daily Health Check self-healing" (zero hits)
- "Item 3.0 PreToolUse hook (#22)" (mismatch with EEJ Claude's running #22)
- "Day 20 framework review" (no matching doc)

EEJ Claude correctly halted at the verification gate rather than fabricate
Movement 3 content from imagination. Manish landed `EEJ_CORE_PLAN.md` v1.18
into repo (commit `27e0528` Day 21); Phase A re-entered with verifiable
source-of-truth.

## Mandatory Phase A pre-flight check

Every Phase A audit begins with:
```bash
# Verify all referenced docs/concepts exist in repo
grep -r -i "<concept-name>" docs/ --include="*.md"
find . -maxdepth 3 -name "<doc-filename>"
```

If any prompt reference returns zero hits in repo, Phase A halts at GATE T*-PHASE-A
verification gate. EEJ Claude reports gap; chat-Claude lands missing content into
repo OR re-authorizes Phase A on subset that IS verifiable.

## Backlog numbering reconciliation

When chat-Claude session and EEJ Claude session backlog numbering diverge,
plan-in-repo takes precedence. Renumber EEJ Claude items to non-conflicting
positions; preserve historical context in renumbering note (e.g., "EEJ Claude
#22 (AC-test-file-parallelism-isolation) renumbered to #25 per Day 21
reconciliation; chat-Claude #22 (PreToolUse hook) takes plan-canonical
position per EEJ_CORE_PLAN.md v1.18").

## Standard pre-Phase-A workflow

1. chat-Claude drafts authorization prompt
2. chat-Claude verifies any referenced docs/concepts exist in EEJ repo
3. If any reference is missing: chat-Claude lands content into `docs/` first,
   then sends authorization prompt
4. EEJ Claude re-verifies via `grep -r` before accepting plan numbers
5. Phase A proceeds on verifiable scope only

## Discipline lineage

This protocol pairs with:
- **HB-7 reality-vs-plan escalation** (Hard Boundary 7) — operates when EEJ
  Claude finds reality differs from plan; this protocol prevents the divergence
  upstream
- **Audit pattern weakness lesson** — verify with multiple grep patterns + git
  tracking + actual reality before accepting plan numbers; this protocol
  formalizes pre-Phase-A verification step
- **AC-8.X verification mechanism discipline** — verification mechanism (plan
  in repo) must precede dependent work (Phase A using plan as reference)

---

🏁 **End of PHASE_B_PLAN_TEMPLATE.md**

**Maintenance:** revise this doc as new disciplines emerge from operational
experience. Each revision appends to a "Revision history" footer (similar to
EEJ_CORE_PLAN.md version history pattern).

**Revision history:**
- v1: 2026-05-09 (Day 21). Initial doc landed via Item 2.7 closeout commit.
  Bundles #15 (Phase B Plan template + branch data-state declaration), #20
  (AC-8.X Verification Mechanism Discipline), #26 (Source-of-truth co-location
  protocol).
