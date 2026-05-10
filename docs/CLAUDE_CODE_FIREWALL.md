# Claude Code PreToolUse Firewall

**Purpose:** infrastructure-level intercept for destructive Bash commands run via Claude Code's tool-call pathway. Closes the gap between prompt-level rules (Hard Boundaries 1-16) and actual execution. Defense-in-depth alongside `permissions.deny` patterns in `.claude/settings.json`.

**Origin:** Item 3.0 sub-task 7 (`docs/EEJ_CORE_PLAN.md` v1.18). PreToolUse hook framed as "real spare for known catastrophic failure mode" per Manish architectural decision after Day 20 Five-Tyre evaluation. Closes Item 2.X follow-up backlog #22.

**Research grounding:** PocketOS (April 2026) and SaaStr/Replit (July 2025) incidents proved prompt-level safety rules don't enforce when goal-directed AI reasoning conflicts with soft guardrails. Both AIs deleted production data after acknowledging explicit rules. Infrastructure-level enforcement is the next defense layer.

---

## Architecture

**Hook contract** (per Claude Code PreToolUse spec):
- Hook receives JSON on stdin: `{ "tool_name": "Bash", "tool_input": { "command": "..." }, ... }`
- Exit 0 → approve (Bash command executes)
- Exit 2 → block + stderr feedback to Claude (Claude must find alternative pathway)
- Other non-zero → error (also blocks)

**Files:**
- `.claude/hooks/pretooluse-firewall.sh` — bash script, executable, parses JSON via `jq`
- `.claude/settings.json` — registers hook under `hooks.PreToolUse[].matcher: "Bash"`

**Scope:** hook only fires on Bash tool. Edit/Write tools fall through to existing `permissions.deny` patterns in settings.json.

**Defensive: jq fallback.** If `jq` missing, hook logs visible warning to stderr and exits 0 (fail-open). Existing `permissions.deny` covers most catastrophic patterns as fallback.

---

## Current 7-pattern blocklist

Patterns are **conservative by design** per Item 3.0 sub-task 7 Decision 8. Each pattern has no legitimate use case in EEJ Claude work; if Manish needs to bypass, override path is direct terminal execution.

| # | Pattern (regex) | Match | Reasoning |
|---|---|---|---|
| 1 | `\brm[[:space:]]+-rf?[[:space:]]+/(\s|$)` | `rm -rf /` | Root filesystem deletion. PocketOS-class blast radius. HB-12 enforcement. |
| 2 | `\brm[[:space:]]+-rf?[[:space:]]+(~|\$HOME)(\s|$)` | `rm -rf ~` or `rm -rf $HOME` | Home directory deletion. Wipes Manish's local repos + dotfiles + password manager fallback. HB-12 enforcement. |
| 3 | `\bDROP[[:space:]]+TABLE\b` | `DROP TABLE` | Schema destruction. Even with table-recreation in migrate.ts, data loss is irreversible. HB-4 enforcement (CLAUDE.md: "Never use DROP TABLE"). |
| 4 | `\bTRUNCATE\b` | `TRUNCATE` | Mass row destruction. HB-14 enforcement ("TRUNCATE, DROP, etc. forbidden absolutely"). |
| 5 | `\bgit[[:space:]]+push.*(--force\|--force-with-lease\|[[:space:]]-f[[:space:]]).*\b(master\|main)\b` | `git push --force ... master` | History rewrite on protected branch. HB-13 enforcement. |
| 6 | `\bflyctl[[:space:]]+postgres[[:space:]]+destroy\b` | `flyctl postgres destroy` | Irreversible Neon attached-DB destruction. HB-5 enforcement. |
| 7 | `\bflyctl[[:space:]]+apps[[:space:]]+destroy\b` | `flyctl apps destroy` | Irreversible Fly app destruction. HB-5 enforcement. |

---

## Override path

EEJ Claude **cannot** bypass these patterns. Override is exclusively via direct terminal execution by Manish:

```bash
# Manish in terminal (NOT via Claude Code):
flyctl apps destroy --app eej-test-stale
```

The PreToolUse hook only fires inside Claude Code's tool-call pathway. Direct terminal commands are unaffected.

---

## How to add new patterns

**Discipline: test-first, document reasoning.**

1. Identify the pattern surfaced by operational reality (e.g., a new destructive command was attempted in a session and should have been blocked)
2. Surface as Item 2.X follow-up with five-tyre evaluation: is this a working wheel (operational need now), spare (known failure mode), or fifth tyre (speculative)?
3. If wheel/spare, draft regex pattern. Test with sample matching command + sample non-matching command to confirm specificity (no false positives on legitimate commands)
4. Add pattern to `.claude/hooks/pretooluse-firewall.sh` with `block` call + reasoning comment
5. Add row to "Current blocklist" table in this doc
6. Run verification protocol below
7. Commit single change: pattern + doc + test

**Anti-pattern:** mass-adding patterns "for safety" without specific operational triggers. Every pattern is a potential false-positive blocker. Conservative scope is intentional.

---

## Verification protocol

**Manual block test (post-commit, GATE T3.0-SUBTASK-7-COMPLETE):**

1. Trigger Claude Code session in this repo
2. Attempt one blocked command via Bash tool — recommended:
   ```
   ~/.fly/bin/flyctl apps destroy --app eej-test-fake
   ```
3. Expected outcome:
   - Hook fires
   - Stderr message visible: `🛑 BLOCKED by PreToolUse firewall: flyctl apps destroy — irreversible Fly app destruction (HB-5 enforcement)`
   - Command does NOT execute (no Fly API call made)
   - Claude receives stderr and surfaces in output
4. Negative test: attempt allowed command:
   ```
   ~/.fly/bin/flyctl status --app eej-jobs-api
   ```
5. Expected outcome: command executes normally, machine status returned

**Per-pattern verification (when adding new patterns):**
- Positive test: command matching new pattern → blocked
- Negative test: command similar to pattern but legitimately needed → allowed
- Document the pair in this section under a new heading per pattern

---

## Operational notes

- **Hook performance:** ~10ms overhead per Bash call (jq parse + 7 grep checks). Negligible.
- **Hook location:** `.claude/hooks/pretooluse-firewall.sh` is in repo and tracked by git. Future hook updates ship as commits with normal review.
- **Hook permissions:** must be executable (`chmod +x`). Set at commit time; preserved by git.
- **CI impact:** none. Hook is local-only, not invoked by GitHub Actions.

---

## Maintenance

This doc is the canonical reference for the firewall. Revise when:
- New patterns added (per "How to add" above)
- jq fallback behavior changes
- Hook architecture changes (e.g., switch from bash to TypeScript)
- Override path changes

**Revision history:**
- v1: 2026-05-10 (Day 22). Initial doc landed via Item 3.0 sub-task 7 commit. 7-pattern conservative blocklist per Decision 8. Bash hook + jq parse + fail-open jq fallback.
