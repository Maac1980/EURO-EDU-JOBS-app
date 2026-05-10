#!/usr/bin/env bash
# .claude/hooks/pretooluse-firewall.sh
#
# Item 3.0 sub-task 7 — PreToolUse destructive-command firewall.
#
# Defense-in-depth alongside `permissions.deny` patterns in settings.json.
# Reads tool-call JSON from stdin, evaluates Bash commands against a
# conservative blocklist, exits 2 (block + stderr feedback to Claude) on
# match. PocketOS + SaaStr/Replit incidents proved prompt-level rules don't
# enforce; this hook closes the infrastructure-level gap.
#
# Override: Manish can bypass by running blocked commands directly in his
# terminal (this hook only fires inside Claude Code's tool-call pathway).
#
# See docs/CLAUDE_CODE_FIREWALL.md for full pattern reasoning + how to add
# new patterns + verification protocol.

set -e

# Defensive: jq fallback. If jq is not installed, fail-open (let
# permissions.deny handle the most catastrophic patterns) but log a visible
# warning so Manish notices and installs jq.
if ! command -v jq >/dev/null 2>&1; then
  echo "[firewall] jq not found — install via 'brew install jq' to enable PreToolUse firewall. Falling back to permissions.deny only." >&2
  exit 0
fi

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Only enforce on Bash tool. Edit/Write have their own deny patterns.
if [ "$tool_name" != "Bash" ]; then
  exit 0
fi

if [ -z "$command" ]; then
  exit 0
fi

# Per-pattern block helper. Echoes block message + the offending command,
# explains override path, exits 2 (Claude sees stderr + must find alternative).
block() {
  local message="$1"
  echo "🛑 BLOCKED by PreToolUse firewall: $message" >&2
  echo "Command: $command" >&2
  echo "Override path: Manish can run this directly in terminal. EEJ Claude cannot bypass." >&2
  echo "Documented at docs/CLAUDE_CODE_FIREWALL.md." >&2
  exit 2
}

# 7-pattern conservative blocklist — Item 3.0 sub-task 7 Decision 8.
# Reasoning per pattern documented in docs/CLAUDE_CODE_FIREWALL.md.

# 1. rm -rf / (root deletion)
if echo "$command" | grep -qE '\brm[[:space:]]+-rf?[[:space:]]+/(\s|$)'; then
  block "rm -rf / — root filesystem deletion (HB-12 enforcement)"
fi

# 2. rm -rf ~ or rm -rf $HOME (home deletion)
if echo "$command" | grep -qE '\brm[[:space:]]+-rf?[[:space:]]+(~|\$HOME)(\s|$)'; then
  block "rm -rf ~/\$HOME — home directory deletion (HB-12 enforcement)"
fi

# 3. DROP TABLE (schema destruction)
if echo "$command" | grep -qE '\bDROP[[:space:]]+TABLE\b'; then
  block "DROP TABLE — schema destruction (HB-4 enforcement)"
fi

# 4. TRUNCATE (mass row destruction)
if echo "$command" | grep -qE '\bTRUNCATE\b'; then
  block "TRUNCATE — mass row destruction (HB-14 enforcement)"
fi

# 5. git push --force / --force-with-lease / -f to master/main (history rewrite on protected branch)
if echo "$command" | grep -qE '\bgit[[:space:]]+push.*(--force|--force-with-lease|[[:space:]]-f[[:space:]]).*\b(master|main)\b'; then
  block "git push --force to master/main — history rewrite on protected branch (HB-13 enforcement)"
fi

# 6. flyctl postgres destroy (irreversible Neon destruction)
if echo "$command" | grep -qE '\bflyctl[[:space:]]+postgres[[:space:]]+destroy\b'; then
  block "flyctl postgres destroy — irreversible Neon destruction (HB-5 enforcement)"
fi

# 7. flyctl apps destroy (irreversible Fly app destruction)
if echo "$command" | grep -qE '\bflyctl[[:space:]]+apps[[:space:]]+destroy\b'; then
  block "flyctl apps destroy — irreversible Fly app destruction (HB-5 enforcement)"
fi

# Default: approve.
exit 0
