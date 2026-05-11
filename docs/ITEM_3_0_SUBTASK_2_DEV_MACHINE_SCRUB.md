# Item 3.0 sub-task 2 — Production database credentials off dev machine

**Status:** ✅ Substantively closed 2026-05-10 (Day 22). Documentation commit lands Day 23 per `docs/EOD_DAY_22.md` carry-forward row.

**Origin:** `docs/EEJ_CORE_PLAN.md` v1.18 §"Item 3.0" sub-task 2 — *"Production NEON_DATABASE_URL off developer machine — rotate to environment-only access where AI cannot read it."*

**Why it matters:** if a production-grade connection string lives in shell rc files or process environment on a developer Mac, any process that can read user env (including Claude Code itself, since it inherits the parent shell env) can exfiltrate it. The infrastructure-level fix is to keep production credentials in Fly secrets and the password manager only — never in any dev-machine surface.

---

## What was done (Manish-side, Day 22)

This was an operational workstream, not a code change. Five steps:

### 1. Tracked-file audit (clean)

```bash
grep -rn "DATABASE_URL" .env*
```

Result: only `.env.example` matched, and only with a placeholder value. No real production credential in any tracked `.env*` file. ✅

### 2. Shell-environment audit (NOT clean)

```bash
env | grep DATABASE_URL
```

Surfaced a `NEON_DATABASE_URL` export carrying the `neondb_owner` connection string with the (at-the-time-active) password. Traced to `~/.zshrc` line 5.

### 3. Timestamped backup of `~/.zshrc`

Backup made before mutation, so the change is reversible if anything in shell startup broke.

### 4. Removed line 5 from `~/.zshrc`

```bash
sed -i '' '5d' ~/.zshrc
```

The `''` argument is the macOS BSD `sed` in-place-edit empty-suffix; on Linux it'd be `sed -i '5d'`. Future-self note for any team member on Linux.

### 5. Reload + verify

```bash
source ~/.zshrc                    # reload current shell
echo $NEON_DATABASE_URL            # in current shell: still set (in-process env)
# Open fresh terminal tab → run again
echo $NEON_DATABASE_URL            # empty ✅
```

The fresh-tab check is the real verification — `source` doesn't unset variables that were already exported, only the new shell sees the post-mutation rc file.

### 6. Backup deletion

The timestamped backup contained the exposed credential. Deleted after the fresh-tab verification confirmed `~/.zshrc` was stable.

### 7. Credential rotation (security closure)

The `neondb_owner` Neon password had been visible in chat-history transcripts during earlier diagnostic work, so the credential was treated as compromised independent of the rc-file scrub. Rotated via Neon Console as part of the same Day 22 work. Subsequent production crisis (`pg`/Neon channel-binding handshake) was triggered by that rotation — root cause and recovery captured in `docs/EOD_DAY_22.md` §"PRODUCTION CRISIS".

The exposed credential value is **not** repeated in this document by deliberate policy — re-quoting it in a committed file would re-expose it. Refer to the original chat transcripts only if needed for forensic timeline.

---

## Verification commands (current state, anytime)

To confirm the dev machine remains clean:

```bash
# 1. No DATABASE_URL or NEON_DATABASE_URL in shell env
env | grep -E "DATABASE_URL|NEON_DATABASE"
# Expect: no output

# 2. No production credentials in tracked .env* files
grep -rn "neondb_owner\|aljop684" .env* 2>/dev/null
# Expect: no output (or only .env.example placeholder)

# 3. Production credential lives ONLY in Fly secrets
~/.fly/bin/flyctl secrets list --app eej-jobs-api | grep -E "^DATABASE_URL"
# Expect: DATABASE_URL row with a digest (value not displayed by flyctl)
```

If any of those return real values pointing at production, sub-task 2 has regressed and the scrub procedure above re-applies.

---

## What this does NOT close

- **Read-only role wiring (sub-task 1)** — separate workstream, re-implemented Day 23 (commit `9e8809a`) with channel_binding strip baked in.
- **Off-site immutable backups (sub-task 3)** — still gated on Manish R2 prereq.
- **Browser-stored connection strings** — if the Neon Console "Connection details" page caches strings client-side, that surface is outside the rc-file scrub. Treat browser sessions as untrusted for production credential display.
- **Future regressions** — if a teammate or future-Manish pastes a production string into `.zshrc` again, the scrub must be re-run. Defense is procedural, not automated.

---

## Lineage

- `docs/EEJ_CORE_PLAN.md` v1.18 §"Item 3.0" — original sub-task definition
- `docs/EOD_DAY_22.md:26` — status row marking substantively done, needing doc commit
- `docs/EOD_DAY_22.md:64` — carry-forward to Day 23 for this commit
- Discipline 2 (build protection / accidental deletion prevention) — Layer 0 (credentials not on dev machine where AI can read them)
- PocketOS + SaaStr/Replit incident lesson — prompt-level rules don't enforce; infrastructure separation does
