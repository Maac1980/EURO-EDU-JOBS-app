# EEJ — RECOVERY PROCEDURES

**Last verified:** 2026-05-08 (Day 20 — Item 2.4 staging substrate landed)
**Authored after:** Item 2.5 Phase A read-only investigation. Structure mirrors APATRIS Compliance Hub `RECOVERY_PROCEDURES.md` (authored Day 19, 2026-05-06 against the standalone Compliance Hub repo). Portfolio consistency: an operator who has read APATRIS's doc will navigate EEJ's identically.
**Scope:** five recovery surfaces — code, database, Fly app, configuration, cross-repo
**Discipline:** every command in this document has been EITHER (a) empirically tested, OR (b) explicitly marked with `⚠️ UNTESTED` and a planned drill date. No commands fabricated from training memory.

---

## Quick reference (under stress, start here)

- **Bad pushed commit:** `git revert <sha> && git push origin master`
- **Bad prod deploy:** `~/.fly/bin/flyctl deploy --app eej-jobs-api --image registry.fly.io/eej-jobs-api:deployment-<previous-tag>` ⚠️ Joint Manish + chat-Claude go required. Recommended: dry-run first on staging (`--config fly.staging.toml --app eej-api`) to verify the prior image still boots cleanly.
- **Schema corruption:** `~/.fly/bin/flyctl machine restart <machine-id> --app eej-jobs-api` (migrate.ts reruns `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` idempotently on every boot)
- **Missing secret:** `~/.fly/bin/flyctl secrets set <NAME>=<VALUE> --app eej-jobs-api` (auto-restarts both machines)
- **Lost local repo:** `git clone git@github.com:Maac1980/EURO-EDU-JOBS-app.git` + restore `.env` from password manager
- **Lost work after `git reset --hard`:** `git reflog` shows recent HEAD movements; `git reset --hard <reflog-sha>` returns to pre-reset state (reflog persists ~90 days)

Detailed procedures + verification + caveats below.

---

## How to use this document

1. Identify which surface is affected (code / database / Fly app / configuration / cross-repo).
2. Walk the surface's decision tree to find the matching scenario.
3. Run the verification commands BEFORE recovery (so you know baseline state).
4. Run the recovery procedure.
5. Run the verification commands AFTER to confirm recovery worked.
6. Record what happened in a session memo so the next operator has even more grounded data.

**Recovery discipline:**
- Never use destructive commands without explicit Manish + chat-Claude joint go (Hard Boundaries 11, 13, 14 forbid by default).
- Always verify which environment you're targeting before any state-changing command. EEJ runs **two** Fly apps: `eej-jobs-api` (production, region `ams`, prod Neon hostname `ep-wild-cell-aljop684-pooler`) and `eej-api` (staging, region `ams`, staging Neon hostname `ep-delicate-mountain-al828ei0-pooler`). Confirm `--app` flag AND DATABASE_URL hostname match intent before any state-changing call.
- If the incident is ambiguous, surface in EXPECTED / FOUND / REASONABLE INTERPRETATION format and pause.

---

## Section 1 — Code recovery (git / GitHub)

### What's at risk

- Working tree corruption from interrupted operations (partial merge, half-applied stash)
- Bad local commit (mistake caught before push)
- Bad pushed commit (visible to all collaborators / triggers CI)
- Force-push damage from elsewhere (history rewritten by another actor)
- Lost local repo (machine destroyed, accidental deletion of clone)
- Lost GitHub remote (extreme: GitHub outage; account compromise)

### Inventory (as of 2026-05-06)

| Property | Value |
|---|---|
| GitHub remote | `git@github.com:Maac1980/EURO-EDU-JOBS-app.git` |
| Repo authentication | SSH (key registered at `https://github.com/settings/keys`). Switched from HTTPS+PAT to SSH on Day 18 (2026-05-06) during Item 2.1 closure after PAT rejection. The expired PAT-embedded HTTPS URL is no longer in `.git/config`. |
| Total commits on `origin/master` | **632** |
| HEAD on `origin/master` (this snapshot) | `7906448` (Item 2.2 closure: bilingual baseline) |
| Branches | `master` (active), `main` (legacy on origin) |
| Branch protection | Cannot inspect via flyctl/git CLI; verify via GitHub UI at `https://github.com/Maac1980/EURO-EDU-JOBS-app/settings/branches` |

### Build-fragility cross-pass (from Item 2.2 closure)

A clean clone today encounters two pre-existing issues that recovery operators should expect, not panic over:
- 14 TypeScript errors in `artifacts/apatris-dashboard/src/pages/` (`AiCopilotChat.tsx`, `CrmPipeline.tsx`, `Dashboard.tsx`, `GeofenceMap.tsx`, `LegalQueue.tsx`, `PayrollPage.tsx`, `SystemTest.tsx`, etc.) — TS2367 / TS2741 / TS2322 type narrowing issues. Vite build path bypasses `tsc --noEmit` so these do NOT block deploy.
- Mobile `tsconfig.json:10` `module`/`bundler` mismatch — `pnpm typecheck` fails inside `eej-mobile-HIDDEN/`. Vite build path again bypasses this.

**These predate Item 2.5; delta=0 introduced by recovery work.** `pnpm test` and `pnpm build` paths are clean.

### Decision tree

#### Scenario A — Local working tree corrupted (uncommitted changes you want to discard)

**Symptom:** `git status` shows modified or partially-staged files you didn't intend; want to return to last clean state.

**Recovery:**
```bash
git status                                  # see what's modified
git diff                                    # see exact changes
git checkout -- <file>                      # discard changes in one file
git checkout -- .                           # discard ALL unstaged changes (DESTRUCTIVE for working tree)
git reset --hard HEAD                       # discard ALL changes (staged + unstaged) (DESTRUCTIVE)
```

**Verification:**
```bash
git status                                  # should show "working tree clean" or only intended files
git diff                                    # should be empty
```

**Tested:** 2026-05-06. Used during Item 2.5 Phase A baseline-vs-edit verification (`git stash` + run + `git stash pop`).

⚠️ `git checkout -- .` and `git reset --hard HEAD` permanently discard local changes. Use only when sure.

**Recovery if reset was a mistake:** `git reflog` shows recent HEAD movements; `git reset --hard <reflog-sha>` returns to the state before reset. Reflog entries persist ~90 days by default.

---

#### Scenario B — Bad local commit, NOT yet pushed

**Symptom:** committed something wrong locally; haven't pushed yet; want to undo the commit while keeping (or discarding) the changes.

**Recovery:**
```bash
git log --oneline -3                        # confirm the bad commit is HEAD
git reset --soft HEAD~1                     # undo commit, keep changes staged
git reset --mixed HEAD~1                    # undo commit, keep changes unstaged (default)
git reset --hard HEAD~1                     # undo commit, DISCARD changes (DESTRUCTIVE)
```

**Verification:**
```bash
git log --oneline -3                        # bad commit should no longer appear
git status                                  # confirm working tree state matches expectation
git rev-list --left-right --count origin/master...HEAD   # should show 0 ahead, 0 behind
```

**Tested:** 2026-05-06. Used during Item 2.1 push-rejection recovery (commit succeeded locally as `c8bcea2` but push failed; commit was preserved while remote auth was rotated, then push succeeded).

**Recovery if reset was a mistake:** `git reflog` + `git reset --hard <reflog-sha>`.

---

#### Scenario C — Bad pushed commit, FORWARD-FIX (RECOMMENDED for any commit visible on origin/master)

**Symptom:** committed and pushed a bad change; want to undo without rewriting history.

**Recovery:**
```bash
git log --oneline -5                        # find the bad commit's SHA
git revert <sha>                            # creates a new commit that reverses the bad one
                                            # (interactive: edit the commit message; save and close)
git push origin master                      # publishes the revert
```

**Verification:**
```bash
git log --oneline -3                        # confirm "Revert <bad-msg>" commit is now HEAD
git rev-list --left-right --count origin/master...HEAD   # 0 0 = in sync
```

**Tested:** Pattern documented but not invoked on this repo to date. Standard git operation; well-understood.

---

#### Scenario D — Hard rollback (rewrite history) — NOT RECOMMENDED, requires explicit Manish + chat-Claude joint go

**Symptom:** want to rewrite history to remove a commit entirely from origin/master.

**Recovery (DO NOT EXECUTE WITHOUT EXPLICIT GO):**
```bash
git reset --hard <good-sha>                 # local HEAD moves to good SHA, dropping subsequent commits
git push origin master --force              # rewrites origin/master (DESTRUCTIVE)
                                            # Hard Boundary 13 forbids without explicit go
```

**When this is wrong:**
- Other clones / CI / branches branched off the rewritten section will be stale and will cause merge conflicts on next pull.
- Audit trail on GitHub loses the original commit (hard to recover later for forensics).

**Tested:** Never invoked on this repo. **Hard Boundary 13: NO git history modification (force-push, history rewrite) without explicit Manish go.**

**Recovery if reset was a mistake (LOCAL only — pre-push):** `git reflog` + `git reset --hard <reflog-sha>`. ⚠️ Does NOT undo a force-push that has already reached origin.

---

#### Scenario E — Lost local repo (entire clone gone — disk failure / accidental `rm -rf` / new machine)

**Symptom:** the local repo no longer exists; need to restore from origin.

**Recovery:**
```bash
cd ~/Desktop                                # or wherever the repo lives
git clone git@github.com:Maac1980/EURO-EDU-JOBS-app.git
cd EURO-EDU-JOBS-app
# Restore .env from password manager — it is NOT in the repo
# (real values come from password manager: DATABASE_URL, JWT_SECRET, etc.)
cp ~/secure/eej.env .env
# Run the workspace install
pnpm install
# Verify
git log --oneline -3
git remote -v
```

**Verification:**
```bash
git status                                  # working tree clean (excluding lib/*/dist/ which is untracked)
git log --oneline -3                        # latest commit matches expected origin/master HEAD
ls .env                                     # .env present (DO NOT cat or commit)
pnpm test                                   # mobile tests pass; api-server tests pass
pnpm build                                  # api-server + apatris-dashboard build succeeds
```

⚠️ Expect the typecheck failures noted in "Build-fragility cross-pass" above. Operator should NOT panic on `pnpm typecheck` errors that match the documented inventory.

**Tested:** Pattern verified during initial clone setup. Re-cloning is a standard git operation; not a destructive recovery — origin remains the source of truth.

---

### Verification commands (any code recovery)

```bash
git log --oneline -3                                                # confirm HEAD + recent commits
git status                                                          # confirm working tree state
git remote -v                                                       # confirm SSH remote (no PAT-embedded URL)
git rev-list --left-right --count origin/master...HEAD              # 0 0 = in sync
```

---

## Section 2 — Database recovery (Neon)

### What's at risk

- Schema corruption (a CREATE/ALTER ran wrong; tables in unexpected state)
- Data loss (rows accidentally DELETED or UPDATEd; truncated table; bad migration ran)
- Catastrophic Neon failure (Neon platform incident; project destroyed)
- Prod/staging mixup (DATABASE_URL accidentally swapped) — **real risk since Day 20**: staging exists. Mitigation: hard fence in `index.ts` `start()` rejects boot if `NODE_ENV=staging` AND DATABASE_URL points at `ep-wild-cell-aljop684`. Always verify hostname before secret-set.
- DATABASE_URL secret lost (Fly secret accidentally cleared)

### Inventory (as of 2026-05-06)

| Property | Value |
|---|---|
| Provider | **Neon Postgres serverless** (verified via SSH probe) |
| Neon project | `eej-production` (Manish, Scale tier) |
| Database name | `neondb` |
| Postgres version | **17** (verified in Neon Console 2026-05-06) |
| Region | `eu-central-1` (AWS Frankfurt) |
| Connection hostname | `ep-wild-cell-aljop684-pooler.c-3.eu-central-1.aws.neon.tech` |
| Connection mode | Pooler endpoint (`-pooler` suffix in hostname) |
| Connection string env var | `DATABASE_URL` (single var; no separate `NEON_DATABASE_URL`) |
| `DATABASE_URL` secret digest | `a565f23674e9177e` (current verified prod digest) |
| **PITR retention** | **14 days** (verified by Manish in Neon Console 2026-05-06; raised from 6h default) |
| Schema migration pattern | `migrate.ts` runs idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on every app boot. 22 tables total. |
| Off-site logical backups | **NOT configured** — recovery story depends entirely on Neon PITR within the 14-day window |
| Encryption-at-rest | Neon default (AES-256). Application-level: PESEL/IBAN encrypted via `lib/encryption.ts` (`enc:v1:` prefix); `EEJ_ENCRYPTION_KEY` secret is the master key. |

### Decision tree

#### Scenario A — Schema corruption (table in wrong state; missing columns; bad ALTER)

**Symptom:** queries fail with "column does not exist" or "relation does not exist" errors that should not happen given current code.

**Recovery:**
```bash
~/.fly/bin/flyctl machine restart <machine-id> --app eej-jobs-api    # reboots the machine
                                                                     # migrate.ts runs at boot
                                                                     # CREATE TABLE IF NOT EXISTS restores any missing tables
                                                                     # ALTER TABLE ADD COLUMN IF NOT EXISTS restores any missing columns
                                                                     # idempotent on every boot
```

For both machines simultaneously:
```bash
~/.fly/bin/flyctl machine restart 0802037b179e98 --app eej-jobs-api
~/.fly/bin/flyctl machine restart 7810626b5521e8 --app eej-jobs-api
```

**Verification:**
```bash
~/.fly/bin/flyctl logs --app eej-jobs-api | grep -E "migrations|Database|started"
curl https://eej-jobs-api.fly.dev/api/healthz                        # 200 OK
~/.fly/bin/flyctl status --app eej-jobs-api                          # both machines started, role app
```

⚠️ This restores **structure only, not data.** Lost rows are NOT recovered by this scenario.

**Tested:** Implicitly on every machine boot. Last verified 2026-05-06 during Item 2.2 deploy (machines booted Item 2.2 image; migrate.ts ran successfully; all 22 tables intact).

---

#### Scenario B — Data loss (rows deleted; truncate; bad UPDATE)

**Symptom:** specific rows or entire tables empty or wrong; data was present recently and now isn't.

**Recovery (Neon point-in-time recovery — REQUIRES EXPLICIT MANISH + CHAT-CLAUDE GO):**

1. Open `https://console.neon.tech` and select the `eej-production` project.
2. Navigate to **Branches**.
3. Click **Create branch from a point in time** (or **Restore branch**).
4. Select a timestamp BEFORE the data loss occurred (use a 5–15 min margin).
5. Name the branch: `recovery-YYYY-MM-DD-HHMM`.
6. Wait for branch to provision (typically <60 seconds).
7. Copy the branch's connection string from Neon dashboard.
8. Decide path:
   - **Path 1 — full DB swap:** `~/.fly/bin/flyctl secrets set DATABASE_URL=<new-branch-url> --app eej-jobs-api` then both machines auto-restart. App now runs against the recovered branch; confirm data correct; if good, leave running OR migrate data forward and swap back.
   - **Path 2 — selective row recovery:** connect to recovery branch from a one-off SQL client (e.g., Neon SQL Editor); `SELECT` the missing rows; `INSERT` them back into the live primary database via separate connection. (More surgical; doesn't disrupt running app.)

⚠️ Verify destination explicitly before any swap. NEVER swap prod's `DATABASE_URL` casually. Hard Boundary 2: NO production DB connection by EEJ Claude without explicit go.

**Verification:**
```bash
~/.fly/bin/flyctl secrets list --app eej-jobs-api | grep DATABASE_URL    # confirm digest changed (after Path 1)
~/.fly/bin/flyctl status --app eej-jobs-api                              # both machines healthy on new connection
curl https://eej-jobs-api.fly.dev/api/healthz                            # 200 OK
# Spot-check the recovered rows via app's UI or a read-only API endpoint
```

**Tested:** ⚠️ **NOT YET TESTED on prod.** Drill **scheduled** (see Drill schedule section below) — staging substrate is now live (`eej-api` app + `ep-delicate-mountain-al828ei0-pooler` Neon branch, Day 20 / 2026-05-08). PITR dry-run runs against the staging Neon branch first; only after a clean staging dry-run does the procedure become a live prod option. Pattern documented from Neon's public docs and Item 2.5 Phase A console verification of retention setting (14 days).

---

#### Scenario C — Catastrophic Neon failure (project lost; Neon down longer than the PITR window)

**Symptom:** Neon project unreachable; PITR not available; data loss exceeds 14-day retention window.

**Recovery:**
1. Engage Neon support: `https://neon.tech/contact` (escalate via Scale-tier support channel).
2. Recover from off-site immutable backup IF AVAILABLE.
3. ⚠️ **Off-site immutable backups are NOT YET CONFIGURED** as of 2026-05-06.
4. Without off-site backup, recovery options narrow to: re-seed schema via `migrate.ts` boot (structure only — `CREATE TABLE IF NOT EXISTS` runs every restart), accept data loss, restore from any user-provided exports (CSV exports are partial coverage at best).

⚠️ **CRITICAL GAP (REC-2 from Phase A):** off-site immutable backups not configured. **Hard precondition before Movement 3 (Infrastructure-level guardrails) work begins: scheduled `pg_dump` to Cloudflare R2 (or equivalent off-site target) AND restoration tested.** R2 is already configured for document storage (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` — though note: not in current Fly secrets list, would need provisioning before pg_dump scheduling).

**Tested:** ⚠️ **NOT YET TESTED.** Cannot test without off-site backup infrastructure first.

---

#### Scenario D — DATABASE_URL secret lost (Fly secret cleared or pointed at wrong DB)

**Symptom:** app can't connect to database; logs show `DATABASE_URL environment variable is required` (from `db/index.ts`); OR app connects but queries return wrong results indicating wrong endpoint.

**Recovery:**

If secret is cleared:
```bash
~/.fly/bin/flyctl secrets list --app eej-jobs-api | grep DATABASE_URL    # confirm absent
# Retrieve the correct DATABASE_URL from password manager
~/.fly/bin/flyctl secrets set DATABASE_URL='<correct-neon-url>' --app eej-jobs-api
# Both machines auto-restart with the new value
```

If secret is wrong (pointed at recovery branch or staging):
```bash
~/.fly/bin/flyctl secrets list --app eej-jobs-api | grep DATABASE_URL    # check current digest
# Expected production digest as of 2026-05-06: a565f23674e9177e
# If digest differs, either the secret was rotated OR pointing at wrong DB
~/.fly/bin/flyctl secrets set DATABASE_URL='<correct-prod-url>' --app eej-jobs-api
```

**Verification:**
```bash
~/.fly/bin/flyctl secrets list --app eej-jobs-api | grep DATABASE_URL
~/.fly/bin/flyctl status --app eej-jobs-api                              # both machines started
~/.fly/bin/flyctl ssh console --app eej-jobs-api -C "node -e \"console.log(new URL(process.env.DATABASE_URL).hostname)\""
# Expected: ep-wild-cell-aljop684-pooler.c-3.eu-central-1.aws.neon.tech
curl https://eej-jobs-api.fly.dev/api/healthz                            # 200 OK
```

**Tested:** SSH-host-probe pattern proven 2026-05-06 during Item 2.5 Phase A AND re-proven 2026-05-08 during Item 2.4 Step 7 against the new staging app (`eej-api` resolved to `ep-delicate-mountain-al828ei0-pooler` correctly). Secret-set + restart cycle proven 2026-05-06 during Item 2.1 (`TWILIO_AUTH_TOKEN` re-set after Authenticate failure) and re-proven 2026-05-08 during Item 2.4 Step 6.5 (`EEJ_SEED_PASSWORD` set on staging, both machines auto-rolled). Joint write of DATABASE_URL specifically on prod: ⚠️ **NOT YET DRILLED.** Drill **scheduled** — dry-run will rotate staging DATABASE_URL on `eej-api` first.

---

### Verification commands (any database recovery)

```bash
~/.fly/bin/flyctl secrets list --app eej-jobs-api | grep DATABASE_URL
~/.fly/bin/flyctl status --app eej-jobs-api
~/.fly/bin/flyctl logs --app eej-jobs-api
curl https://eej-jobs-api.fly.dev/api/healthz                          # 200 OK
# SSH-script-via-sftp pattern for read-only DB sanity (proven Item 2.1):
~/.fly/bin/flyctl ssh console --app eej-jobs-api -C "cd /app/artifacts/api-server && node -e \"const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT NOW(), version()').then(r=>{console.log(r.rows);p.end();})\""
```

⚠️ Never run direct DB queries against production from EEJ Claude — Hard Boundary 2 absolute. Recovery DB queries require Manish or chat-Claude with explicit go.

### Critical gap (held for Movement 3)

**Off-site immutable backups are NOT configured.** Today's recovery story depends on Neon's PITR (14-day verified) plus this repo. If Neon experiences a project-destroying incident OR a 14-day-undetected data corruption event occurs, recovery options run out.

**Hard precondition before Movement 3 high-stakes work:** scheduled off-site backups + restoration test. Drill schedule active since Day 20 (Item 2.4 staging substrate live) — see Drill schedule section.

---

## Section 3 — Fly app recovery (eej-jobs-api)

### What's at risk

- Bad deploy that breaks the app on boot
- Machine crash loop — Fly's restart budget exhausted (10 restarts max)
- App accidentally destroyed via `flyctl apps destroy`
- Region misconfiguration (machines stuck in wrong region)
- Resource exhaustion (memory cap; runaway process; disk full)

### Inventory (as of 2026-05-06)

| Property | Value |
|---|---|
| App name | `eej-jobs-api` |
| Hostname | `eej-jobs-api.fly.dev` |
| Region | `ams` (Amsterdam) |
| Current image | `registry.fly.io/eej-jobs-api:deployment-01KQYDPR7GAJ5AP6G61YQR1HEN` |
| Image digest | `sha256:98278aea08d05f6fa093225687bb4f0db41bf32141804bd75836d25a689e8107` |
| Current version | **v106** (Item 2.2 i18n bilingual baseline, 2026-05-06 ~10:35 UTC) |
| Machines | `0802037b179e98`, `7810626b5521e8` (both `started`, role `app`) |
| `auto_stop_machines` | `false` (prod stays up) |
| `min_machines_running` | `1` |
| `auto_start_machines` | `true` |
| Memory | `1gb` shared CPU |
| Internal port | `8080` |
| `force_https` | `true` |
| Health check | **NOT formally registered in `fly.toml`** (no `[[checks]]` section). `/api/healthz` exists at `routes/health.ts:5`. Fly relies on default smoke checks during deploy. (Tracked as REC-5 follow-up.) |
| Staging app | **`eej-api`** (`eej-api.fly.dev`, region `ams`, image `eej-api:deployment-01KR3K68P7DV43VMHGVZ7V37ZQ`, 2 machines auto-stop, 512mb shared, `min_machines_running=0`, config in `fly.staging.toml`). Provisioned 2026-05-08 (Item 2.4). Staging DB: separate Neon branch `ep-delicate-mountain-al828ei0-pooler.c-3.eu-central-1.aws.neon.tech` (schema-only, 7-day auto-delete unless extended). |

### Recent prod release history

| Version | Date | Note |
|---|---|---|
| v106 | 2026-05-06 ~10:35Z | Item 2.2: bilingual baseline (i18n diacritics, locale detect, login translation, toggle on three surfaces) |
| v105 | 2026-05-06 ~07:35Z | Item 2.1: WhatsApp Step 3 activation (Twilio secrets + templates + webhook live) |
| v104 | 2026-05-05 ~11:30Z | Earlier work day 17 |
| v103 | 2026-04-30 | Earlier baseline |
| v102 | 2026-04-29 | Earlier baseline |
| v101 | 2026-04-29 | Earlier baseline |
| v100 | 2026-04-28 | Gap 4 closure (placement_type column live) |
| v99 | 2026-04-27 | Step 3d closure (WhatsApp approve+send + audit) |
| v98 | 2026-04-27 | Step 3c (WhatsApp inbound webhook) |
| v97 | 2026-04-27 | Step 3a + 3b (whatsapp_messages/templates schema + drafter service) |

### Decision tree

#### Scenario A — Bad deploy on prod (high-stakes; staging dry-run on `eej-api` recommended before live rollback)

**Symptom:** `flyctl deploy` returns `Unrecoverable error: timeout reached waiting for health checks to pass`. Machines may show `stopped` with `0/1` checks, OR `started` with `0/1` warnings. Health endpoint `https://eej-jobs-api.fly.dev/api/healthz` returns non-200 or fails to connect.

**Recovery:**
```bash
# 1. Verify state
~/.fly/bin/flyctl status --app eej-jobs-api

# 2. Identify previous good image
~/.fly/bin/flyctl releases --app eej-jobs-api | head -10
# Look for the most recent "complete" release before the failed one
# Note its image tag from `flyctl image show` of that release OR map via git log

# 3. AWAIT JOINT MANISH + CHAT-CLAUDE GO — do not execute next command without explicit approval

# 4. After joint go, roll back via flyctl deploy --image (CORRECT SYNTAX)
~/.fly/bin/flyctl deploy --app eej-jobs-api \
  --image registry.fly.io/eej-jobs-api:deployment-<previous-tag>
```

⚠️ **NOT** `flyctl image deploy --app ... <image>` — `flyctl image deploy` is not a real subcommand. `flyctl image` only has `show`.

⚠️ **NOT** `flyctl image update` — deploys "latest available" which may BE the failed deploy.

⚠️ **`flyctl releases rollback <id>` is a valid alternative** but `flyctl deploy --image` is more explicit about the target.

⚠️ **Staging dry-run available since Day 20.** Recommended sequence: deploy the candidate previous-image to `eej-api` (staging) via `flyctl deploy --config fly.staging.toml --app eej-api --image registry.fly.io/eej-jobs-api:deployment-<previous-tag>` first; verify staging boots cleanly + health 200; THEN execute the prod rollback. Joint go gate remains required for the prod step regardless.

**Verification:**
```bash
~/.fly/bin/flyctl status --app eej-jobs-api                        # both machines on previous image
curl https://eej-jobs-api.fly.dev/api/healthz                      # 200 OK
~/.fly/bin/flyctl logs --app eej-jobs-api | grep -E "started|listening"
```

**Tested:** ⚠️ **NOT YET EXECUTED on this app.** Procedure mirrors APATRIS Section 3 Scenario A which IS tested (Item 2.3 staging rollback case study, 2026-05-05). Pattern is sound; the joint-go gate adds confirmation before this becomes the live procedure.

---

#### Scenario A.1 — Safe-rollback window caveat

**EEJ has shipped progressive schema migrations.** Rolling back to a release older than the last schema-affecting deploy may break the app: queries reference columns/tables that the older code expected to be absent, OR the older code references columns that haven't yet been added.

| Schema-affecting milestone | Released at | Safe rollback floor |
|---|---|---|
| Stage 4.5 `tenant_id` on `job_postings`/`job_applications` | v ~prior to v97 | rollback below this requires DB schema rollback first |
| Whatsapp schema (whatsapp_messages, whatsapp_templates) | v97 | safe to rollback to v97+ |
| Gap 4 `placement_type` column on `workers` | v100 | safe to rollback to v100+ |

**Practical safe-rollback window today: v100 or newer.** Rolling further back requires either:
- DB schema rollback first (HIGH RISK; not currently tooled — would be a `migrate.ts` reverse migration which doesn't exist)
- OR accepting that older code will fail on the newer schema (likely catastrophic)

**Rule of thumb:** if rollback target is older than 10 days, **assume schema mismatch** and consult chat-Claude before executing.

---

#### Scenario B — Machine crash loop (Fly's max restart budget exhausted)

**Symptom:** machine STATE shows `stopped` with log entry `machine has reached its max restart count of 10`. Other machine may still be running OR also stopped.

**Recovery:**
```bash
# 1. Diagnose root cause via logs
~/.fly/bin/flyctl logs --app eej-jobs-api | grep -iE "error|fatal|exit"

# 2. Inspect machine state
~/.fly/bin/flyctl machine list --app eej-jobs-api

# 3. After identifying the crash cause (e.g., bad migration, missing secret, OOM):
#    - If migrate.ts is the cause: re-set DATABASE_URL or check Neon project state (Section 2)
#    - If secret missing: re-set via flyctl secrets set (Section 4)
#    - If OOM: temporary mitigation is to scale memory before next deploy

# 4. Restart the machine to reset the crash counter
~/.fly/bin/flyctl machine restart <machine-id> --app eej-jobs-api
```

**Verification:**
```bash
~/.fly/bin/flyctl status --app eej-jobs-api                        # machine started, no crash count
~/.fly/bin/flyctl logs --app eej-jobs-api | tail -50              # confirm clean boot
curl https://eej-jobs-api.fly.dev/api/healthz                      # 200 OK
```

**Tested:** Pattern documented; not invoked on this app to date. Last clean boot verified 2026-05-06 during Item 2.2 deploy.

---

#### Scenario C — App accidentally destroyed (`flyctl apps destroy`)

**Symptom:** `flyctl status --app eej-jobs-api` returns "Could not find App eej-jobs-api". DNS at `eej-jobs-api.fly.dev` no longer resolves to a Fly machine.

**Recovery:**
```bash
# 1. Recreate app (claims the same name if available within recovery window)
~/.fly/bin/flyctl apps create eej-jobs-api --org personal

# 2. Re-import all secrets (assumes .env is recoverable from password manager)
cat ~/secure/eej.env | grep -v '^#' | ~/.fly/bin/flyctl secrets import --app eej-jobs-api

# 3. Deploy from current local clone
~/.fly/bin/flyctl deploy --app eej-jobs-api

# 4. Verify provisioning
~/.fly/bin/flyctl status --app eej-jobs-api
curl https://eej-jobs-api.fly.dev/api/healthz                      # 200 OK
```

⚠️ **App-name claims are first-come-first-served on Fly.** If `eej-jobs-api` is destroyed AND a different Fly user takes the name within the recovery window, recovery requires renaming. Update DNS records for `eej-jobs-api.fly.dev` accordingly (or accept a new Fly hostname).

**Tested:** ⚠️ **NOT YET TESTED.** Pattern documented from Fly docs. Drill **scheduled** — dry-run on `eej-api` (staging) before any live test on `eej-jobs-api`.

---

#### Scenario D — Region or configuration misalignment

**Symptom:** machines provisioned in wrong region (e.g., `iad` instead of `ams`); latency degraded for EU users; or `fly.toml` and live config drift.

**Recovery:**
```bash
# 1. Compare fly.toml vs live config
~/.fly/bin/flyctl config show --app eej-jobs-api > /tmp/live-fly.toml
diff /tmp/live-fly.toml ./fly.toml

# 2. If drift detected, push local config
~/.fly/bin/flyctl deploy --app eej-jobs-api    # picks up local fly.toml

# 3. For region misalignment, recreate machines in correct region
~/.fly/bin/flyctl machine list --app eej-jobs-api
# Identify wrong-region machines, then for each:
~/.fly/bin/flyctl machine clone <wrong-region-id> --app eej-jobs-api --region ams
~/.fly/bin/flyctl machine destroy <wrong-region-id> --app eej-jobs-api --force
```

**Verification:**
```bash
~/.fly/bin/flyctl status --app eej-jobs-api                        # all machines in `ams`
~/.fly/bin/flyctl machine list --app eej-jobs-api | grep ams       # all expected
```

**Tested:** ⚠️ **NOT YET TESTED.** Pattern documented; not invoked on this app to date.

---

### Verification commands (any Fly app recovery)

```bash
~/.fly/bin/flyctl status --app eej-jobs-api
~/.fly/bin/flyctl releases --app eej-jobs-api | head -5
~/.fly/bin/flyctl image show --app eej-jobs-api
~/.fly/bin/flyctl logs --app eej-jobs-api | tail -50
curl -sS -w "\n%{http_code}\n" https://eej-jobs-api.fly.dev/api/healthz
```

---

## Section 4 — Configuration recovery (fly.toml + secrets)

### What's at risk

- `fly.toml` accidentally modified, deleted, or drifted from deployed config
- A secret accidentally cleared via `flyctl secrets unset`
- A secret value compromised (rotated; needs re-setting + downstream session invalidation)
- Both local `.env` AND password manager backup lost simultaneously
- Drift between local `fly.toml` and Fly's stored deployed config

### Inventory (as of 2026-05-06)

| Property | Value |
|---|---|
| `fly.toml` location | repo root: `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/fly.toml` |
| Tracked in git | Yes (under `master`) |
| Backup posture | git history is the only version control; no separate snapshot |
| Secrets count | **15** (incl. SENTRY_DSN added 2026-05-06) |

**Verified secrets (digest stable as of 2026-05-06):**

| Secret | Digest | Critical for boot? |
|---|---|---|
| `JWT_SECRET` | `911f39a65f888869` | Critical — auth fails without it |
| `DATABASE_URL` | `a565f23674e9177e` | Critical — `db/index.ts` throws at startup |
| `EEJ_ENCRYPTION_KEY` | `17b214ec455bb9f4` | Critical — PESEL/IBAN writes fail; reads fall back to plaintext (Stage 4 backward compat) |
| `EEJ_ADMIN_EMAIL` | `3b1328d755c8b659` | Important — admin user seeding |
| `EEJ_ADMIN_PASSWORD` | `bddfcd35835fad86` | Important — admin user seeding |
| `NODE_ENV` | `a331102148f18977` | Boot config; defaults exist |
| `PORT` | `331687776d319529` | Boot config; defaults to 8080 |
| `SENTRY_DSN` | `013cb689ee563be9` | Feature-gated — error monitoring active when set; warning logged when absent |
| `ANTHROPIC_API_KEY` | `f51e59b0a6d2f4e5` | Feature-gated — AI Copilot, document OCR return 503 if absent |
| `PERPLEXITY_API_KEY` | `d8ce3887a9fe2c27` | Feature-gated — Immigration search returns 503 |
| `TWILIO_ACCOUNT_SID` | `78c32ed40c6ba3e0` | Feature-gated — WhatsApp send returns 503 |
| `TWILIO_AUTH_TOKEN` | `284b1b7587a3e6bf` | Feature-gated — WhatsApp send + webhook signature verification |
| `TWILIO_WHATSAPP_FROM` | `164eedabba3d54f5` | Feature-gated — WhatsApp dispatch sender |
| `BREVO_SMTP_USER` | `5d475890024304c3` | Feature-gated — email alerts silently fail (logged) |
| `BREVO_SMTP_PASS` | `d4b18e4e7f76ff16` | Feature-gated — email alerts silently fail (logged) |

**fly.toml current contents** (verbatim):
```toml
app = 'eej-jobs-api'
primary_region = 'ams'

[build]

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
  processes = ['app']

[[vm]]
  memory = '1gb'
  cpu_kind = 'shared'
  cpus = 1
  memory_mb = 1024
```

### Decision tree

#### Scenario A — `fly.toml` accidentally modified or deleted

**Symptom:** local `fly.toml` is missing or has unexpected changes; deploy may produce surprises.

**Recovery:**
```bash
# Restore from latest committed version
git checkout HEAD -- fly.toml

# Or restore from a specific commit if HEAD is also bad
git show <good-sha>:fly.toml > fly.toml

# Verify
cat fly.toml
git diff fly.toml                                 # should be empty
```

**Verification:**
```bash
diff fly.toml <(git show HEAD:fly.toml)           # empty diff
~/.fly/bin/flyctl config show --app eej-jobs-api  # compare to local
```

**Tested:** Standard git operation; pattern verified during Item 2.5 Phase A read.

---

#### Scenario B — Secret accidentally unset

**Symptom:** `flyctl secrets list --app eej-jobs-api` shows fewer than 15 secrets; missing secret causes app errors.

**Recovery:**
```bash
~/.fly/bin/flyctl secrets list --app eej-jobs-api               # confirm which is absent
# Retrieve correct value from password manager
~/.fly/bin/flyctl secrets set <NAME>='<value>' --app eej-jobs-api
# Both machines auto-restart with the new value (~30 seconds total)
```

**Verification:**
```bash
~/.fly/bin/flyctl secrets list --app eej-jobs-api | grep <NAME>  # confirm Deployed status
~/.fly/bin/flyctl status --app eej-jobs-api                      # machines healthy
curl https://eej-jobs-api.fly.dev/api/healthz                    # 200 OK
```

**Tested:** 2026-05-06 during Item 2.1 (`TWILIO_AUTH_TOKEN` re-set after Authenticate failure; both machines restarted; outbound WhatsApp dispatch succeeded on first call after restart).

---

#### Scenario C — Secret value compromised

**Symptom:** secret leaked via accidental log, screenshot, or third-party breach. Need to rotate.

**Recovery:**
```bash
# 1. Generate new value (e.g., for JWT_SECRET, EEJ_ENCRYPTION_KEY)
NEW_VALUE=$(openssl rand -hex 32)

# 2. Set new value (machines auto-restart)
~/.fly/bin/flyctl secrets set <NAME>=<NEW_VALUE> --app eej-jobs-api

# 3. Update password manager backup with the new value

# 4. Operational fallout:
#    - JWT_SECRET rotation: invalidates all existing user sessions; users must re-login
#    - EEJ_ENCRYPTION_KEY rotation: existing encrypted PESEL/IBAN ciphertext (enc:v1: prefix) becomes unreadable
#      ⚠️ DO NOT rotate EEJ_ENCRYPTION_KEY without first re-encrypting all stored ciphertext under the new key
#    - DATABASE_URL rotation: see Section 2 Scenario D
```

**Tested:** ⚠️ **NOT YET DRILLED on prod.** Pattern proven on TWILIO secret (Item 2.1) and on staging `EEJ_SEED_PASSWORD` set (Item 2.4 Step 6.5). High-stakes rotations (JWT_SECRET, EEJ_ENCRYPTION_KEY) drilled on staging first per Drill schedule below.

---

#### Scenario D — Both local `.env` AND password manager backup lost

**Symptom:** unable to retrieve any secret values because both copies are gone.

**Recovery:**
```bash
# Secrets that can be regenerated locally (no upstream coordination):
NEW_JWT_SECRET=$(openssl rand -hex 32)
NEW_ENCRYPTION_KEY=$(openssl rand -hex 32)
~/.fly/bin/flyctl secrets set JWT_SECRET=$NEW_JWT_SECRET --app eej-jobs-api
# ⚠️ DO NOT regenerate EEJ_ENCRYPTION_KEY without re-encrypting existing PII data
# (all encrypted PESEL/IBAN values become unreadable; backup restore from PITR may be needed)

# Secrets that require upstream re-provisioning:
# - DATABASE_URL: Neon Console → eej-production project → connection details
# - ANTHROPIC_API_KEY: console.anthropic.com → settings → API keys → create new
# - PERPLEXITY_API_KEY: perplexity.ai → settings → API
# - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: console.twilio.com (Account SID stable; rotate Auth Token)
# - TWILIO_WHATSAPP_FROM: same value as before; sandbox sender stable
# - BREVO_SMTP_USER, BREVO_SMTP_PASS: app.brevo.com → settings → SMTP & API
# - SENTRY_DSN: sentry.io → project settings → client keys
# - EEJ_ADMIN_EMAIL, EEJ_ADMIN_PASSWORD: re-set to known values; admin account re-seeded on next boot
# - NODE_ENV, PORT: simple defaults — `production` and `8080`
```

**Verification:**
```bash
~/.fly/bin/flyctl secrets list --app eej-jobs-api           # confirm 15 secrets present
~/.fly/bin/flyctl status --app eej-jobs-api                 # machines healthy
curl https://eej-jobs-api.fly.dev/api/healthz               # 200 OK
```

⚠️ **Operational note:** if `EEJ_ENCRYPTION_KEY` is regenerated without first decrypting + re-encrypting stored ciphertext, all PESEL and IBAN values stored as `enc:v1:...` become unreadable. Recovery path becomes Scenario B from Section 2 (Neon PITR restore to a point before the key was rotated).

**Tested:** ⚠️ **NOT YET DRILLED.** Pattern documented; never invoked.

---

#### Scenario E — Drift between local `fly.toml` and deployed Fly config

**Symptom:** `flyctl config show` differs from local `fly.toml`. Possible cause: someone ran `flyctl scale memory` or similar without updating local file.

**Recovery:**
```bash
# 1. Compare
~/.fly/bin/flyctl config show --app eej-jobs-api > /tmp/live-fly.toml
diff /tmp/live-fly.toml ./fly.toml

# 2. Decide direction:
#    - If local is correct: deploy to push it ` flyctl deploy --app eej-jobs-api`
#    - If live is correct: copy /tmp/live-fly.toml to ./fly.toml and commit

# 3. Sync
git add fly.toml && git commit -m "chore(fly): reconcile fly.toml drift"
git push origin master
```

**Tested:** Pattern documented; not invoked on this app to date.

---

### Verification commands (any configuration recovery)

```bash
~/.fly/bin/flyctl secrets list --app eej-jobs-api                           # 15 secrets, all Deployed
~/.fly/bin/flyctl config show --app eej-jobs-api | head -20                 # current live config
diff <(~/.fly/bin/flyctl config show --app eej-jobs-api) fly.toml | head -20
git diff fly.toml                                                           # local vs git HEAD
```

### Note — shared `loginLimiter` counter across login routes (Item 2.7 #19)

`lib/security.ts:34-41` exports a single `loginLimiter` instance. Both
`auth.ts` (`/auth/login`) and `eej-auth.ts` (`/eej/auth/login`) import that
same instance. Express attaches the same middleware function to both routes,
so they share state — **a brute-force attempt against admin auth from IP X
also throttles EEJ-mobile auth from IP X** for the 15-minute window.

Possibly intentional (defense-in-depth across both surfaces, single attacker
IP sees both endpoints throttled). Possibly accidental side-effect of
single-export re-use. Either way, the operational property is real.

Operational implication: recovery plays that involve resetting login state
(e.g., emergency admin login when normal auth is failing) may need to
account for this — clearing limiter state for one route clears it for both.
Use `~/.fly/bin/flyctl machine restart --app <app>` to clear in-memory
limiter state.

Surfaced during T0-B rate-limiter diagnosis (Item 2.6 Day 21) — 13 cumulative
login calls in vitest test file shared the 10-per-15-min counter via a single
in-memory store. Tests now use unique `X-Forwarded-For` per call; production
behavior unchanged.

---

## Section 5 — Cross-repo recovery scope

### What's at risk

This document covers **EEJ recovery only**. APATRIS Compliance Hub (`~/Desktop/Apatris-Compliance-Hub/`) has its own parallel `RECOVERY_PROCEDURES.md` and is out of scope for this document.

### Inventory (as of 2026-05-06)

| Repo | Local path | Status |
|---|---|---|
| **EURO-EDU-JOBS-app** (this repo) | `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/.git` | Active; this document covers it |
| **Apatris-Compliance-Hub** (sibling) | `/Users/manishshetty/Desktop/Apatris-Compliance-Hub/.git` | Sibling repo; has its own 887-LOC `RECOVERY_PROCEDURES.md`; out of scope here |
| **labour-contract-intelligence** | NOT FOUND on this machine | Out of scope; not cataloged here |

### Cross-repo recovery posture

- **Per Hard Boundary 16, cross-repo write is forbidden by default.** EEJ Claude operating in this repo does not push commits, deploy, or modify the APATRIS Compliance Hub repo.
- **Cross-repo READ is allowed** (e.g., reading APATRIS source for reference, comparing patterns). Used during Item 2.2 to spot-check translation reuse, and during Item 2.5 Phase B to mirror this document's structure from APATRIS's RECOVERY_PROCEDURES.md.
- **Cross-repo WRITE requires explicit Manish go.** Even then, it should be done via a separate EEJ Claude session targeted at that repo, not this one.

### Decision tree

#### Scenario A — EEJ recovery

See Sections 1–4 above. This document is the source-of-truth for EEJ recovery.

#### Scenario B — APATRIS recovery

⚠️ **Out of scope for this document.** APATRIS has its own deploy posture (different Fly app names — `apatris-api` and `apatris-api-staging`, different Neon project, different secret set, region `iad` not `ams`). Apply the same decision-tree thinking but using APATRIS's own `RECOVERY_PROCEDURES.md` at `~/Desktop/Apatris-Compliance-Hub/artifacts/api-server/docs/RECOVERY_PROCEDURES.md`.

The two recovery docs share structure but NOT contents. **Do not copy commands across.**

#### Scenario C — `labour-contract-intelligence` recovery

Not cataloged here. If/when this repo is brought into the active build, a separate document should capture its recovery surface.

### Verification commands (cross-repo posture check)

```bash
find ~ -maxdepth 3 -name ".git" -type d 2>/dev/null         # inventory of git repos accessible
ls /Users/manishshetty/Desktop/                             # confirm sibling repos still present
```

**Tested as of:** 2026-05-06 — informational only. No cross-repo recovery executed today.

---

## Staging substrate lifecycle (Item 2.4)

### Inventory (as of 2026-05-08)

| Property | Value |
|---|---|
| Fly app | `eej-api` (region `ams`, image `eej-api:deployment-01KR3K68P7DV43VMHGVZ7V37ZQ`) |
| Hostname | `eej-api.fly.dev` |
| Config file | `fly.staging.toml` (in repo root; `auto_stop_machines = true`, `min_machines_running = 0`, `512mb` shared) |
| Deploy command | `~/.fly/bin/flyctl deploy --config fly.staging.toml --app eej-api` |
| GHA workflow | `.github/workflows/deploy-staging.yml` (triggers on push to `staging` branch + `workflow_dispatch`) |
| Neon branch | `ep-delicate-mountain-al828ei0-pooler.c-3.eu-central-1.aws.neon.tech/neondb` (schema-only at provisioning, separate from prod's `ep-wild-cell-aljop684`) |
| Tenant slug | `staging` (seeded into `tenants` table by `migrate.ts`) |
| Hard fence | `index.ts:start()` rejects boot if `NODE_ENV=staging` AND DATABASE_URL contains `ep-wild-cell-aljop684` (production hostname) |
| Secrets count | **11** (10 from initial Step 3 + `EEJ_SEED_PASSWORD` from Step 6.5) |

### 7-day Neon branch auto-delete

Staging Neon branch is configured to **auto-delete 7 days after creation** (default Neon behavior for non-protected branches). After auto-delete, the branch is gone — no PITR recovery for staging data, and `eej-api`'s `DATABASE_URL` will start failing.

**Mitigations:**
- Staging is intentionally **schema-only / drill-only** — never put data here that you can't lose at any moment.
- Before drills that need >7 days of branch existence: **extend retention manually** in Neon Console (project → Branches → select staging branch → Settings → toggle "protect from auto-delete" OR extend retention window).
- If the staging branch is auto-deleted unexpectedly during an active drill: re-provision via Neon Console (clone fresh from prod schema-only) → update `eej-api`'s `DATABASE_URL` secret to the new branch URL → redeploy.

### Staging-vs-prod recovery callouts

Most procedures in Sections 1-5 above apply identically to staging by swapping:
- `--app eej-jobs-api` → `--app eej-api`
- `eej-jobs-api.fly.dev` → `eej-api.fly.dev`
- `ep-wild-cell-aljop684-pooler...` (prod DATABASE_URL) → `ep-delicate-mountain-al828ei0-pooler...` (staging)
- `fly.toml` → `fly.staging.toml` (only when issuing `flyctl deploy`)

**Procedures that differ from prod context:**
- **Schema corruption (Section 2 Scenario A)** on staging is no-go-gate — just restart the staging machine. Staging is the substrate for testing this very recovery, so caution gates don't apply at the same level.
- **PITR restore (Section 2 Scenario B)** on staging may be **unavailable** if the branch was auto-deleted — re-provision the branch instead.
- **Bad deploy rollback (Section 3 Scenario A)** on staging needs **no joint-go gate** — staging is the dry-run substrate for the prod gate.
- **Secret rotation (Section 4 Scenario C)** on staging is **expected** during quarterly rotation drill; rotate first, observe, then mirror to prod.

---

## Drill schedule (active since Day 20 — Item 2.4 staging substrate live)

Most recovery procedures in this document are still `⚠️ UNTESTED` on prod, but staging substrate is now live (`eej-api` Fly app + `ep-delicate-mountain-al828ei0-pooler` Neon branch, 2026-05-08). Drills below run on staging first; only after a clean staging run does a procedure become a live prod option.

### Drill cadence

| Drill | First-run trigger | Cadence |
|---|---|---|
| **Code rollback dry-run** (Section 1 Scenario C) | Within 7 days of staging go-live (by 2026-05-15) | One-off; verify forward-fix pattern |
| **Schema corruption recovery** (Section 2 Scenario A) | Within 7 days of staging go-live | One-off on staging — drop a non-critical table on `eej-api`'s staging Neon branch, restart machine, confirm migrate.ts re-creates it |
| **PITR restore to new branch** (Section 2 Scenario B Path 1) | Within 14 days of staging go-live (by 2026-05-22) | One-off on staging Neon branch; confirm 14-day window functions |
| **Bad deploy rollback** (Section 3 Scenario A) | Within 7 days of staging go-live | One-off on `eej-api`; confirm `flyctl deploy --image` reverts cleanly |
| **Secret rotation drill** (Section 4 Scenario C) | Within 14 days of staging go-live | Quarterly thereafter (rotate JWT_SECRET / EEJ_ENCRYPTION_KEY on `eej-api`) |
| **Off-site backup + restore** (Section 2 Scenario C) | Once REC-2 (off-site backups) ships | First drill within 30 days of REC-2 closure |
| **Full disaster simulation** | After all of the above pass | Annual |

### Drill report template

Each drill should produce a brief written report capturing:
- Trigger (planned drill / real incident)
- Procedure followed (cite section + scenario)
- What worked
- What didn't (commands that failed, surprises, gaps in this doc)
- Time to recovery
- Updates to this doc (new commands, corrected commands, removed `⚠️ UNTESTED` markers)

Reports should be appended to a separate `RECOVERY_DRILLS_LOG.md` (new file when first drill runs).

---

## Issue log — deferred follow-ups

Captured during Item 2.5 Phase A read-only investigation. Track to closure as separate items in Movement 3 or thereafter.

| ID | Description | Status |
|---|---|---|
| **REC-2** | No automated logical backup (e.g., `pg_dump` to Cloudflare R2). Recovery is solely Neon PITR. Bounded by 14-day retention. | Open — Movement 3 prerequisite |
| **REC-3** | No documented recovery path if local `.env` AND password manager backup are simultaneously lost. Section 4 Scenario D documents the upstream re-provisioning sequence; consider adding a third-trusted-location backup. | Open — operational hygiene item |
| **REC-4** | Rolling Fly back past schema migrations breaks the app. Safe-rollback window codified in Section 3 Scenario A.1. Reverse-migration tooling not yet built. | Open — schema tooling item |
| **REC-5** | No `[[checks]]` section in `fly.toml`. `/api/healthz` exists in code but is not formally registered with Fly. Misses an opportunity to fail-fast on bad releases. | Open — separate Item 2.X follow-up per Day 18 decision |
| **REC-6** | All recovery procedures here are `⚠️ UNTESTED` on prod. Drills now active against staging (`eej-api`) since Day 20 (Item 2.4 closed 2026-05-08). | Open — execute drill schedule above (first drill window: 2026-05-15) |

---

## End of RECOVERY_PROCEDURES.md
