#!/usr/bin/env bash
# PreToolUse guard — DB schema/migration single-writer enforcement for this repo.
#
# Covers all three schema surfaces in this repo:
#   - Prisma  : control-plane/prisma/schema.prisma
#   - Drizzle : apps/web/drizzle/schema.ts  and  apps/web/drizzle/*.sql
#   - Alembic : python-backend/migrations/*.py
#
# Rules enforced:
#   1. A subagent (running inside .claude/worktrees/...) may NEVER edit a schema
#      or migration. It must return `NEEDS_SCHEMA_CHANGE: <desc>` to the conductor.
#   2. In the main tree, schema/migration edits are BLOCKED while a wave is active
#      (marker file orchestra/.wave-active) or while fresh agent worktrees exist.
#      The conductor must finish/close the wave, then edit the schema SERIALLY.
#
# Exit 2 = block the tool call and feed the message back to Claude.
# Exit 0 = allow.

set -uo pipefail

input="$(cat)"

# Extract the target file path from the tool input JSON.
file="$(printf '%s' "$input" | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))
except Exception:
    print("")' 2>/dev/null || true)"

[ -z "$file" ] && exit 0

# Only guard the schema / migration surfaces.
case "$file" in
  *schema.prisma) ;;
  */drizzle/schema.ts) ;;
  */drizzle/*.sql) ;;
  */python-backend/migrations/*.py) ;;
  *) exit 0 ;;
esac

# Rule 1 — subagents run inside a worktree and must never touch schema.
case "$PWD" in
  */.claude/worktrees/*)
    echo "BLOCKED (schema single-writer): subagents must not edit DB schema or migrations. Stop and return 'NEEDS_SCHEMA_CHANGE: <one-line description>' to the conductor. The conductor will apply the change serially from the main tree." >&2
    exit 2 ;;
esac

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# Rule 2a — explicit wave marker managed by the conductor (see orchestra reference).
if [ -f "$repo_root/orchestra/.wave-active" ]; then
  echo "BLOCKED (schema single-writer): a dispatch wave is active (orchestra/.wave-active). DB schema/migrations are single-writer. Integrate and close the current wave, remove orchestra/.wave-active, then edit the schema serially before dispatching the next wave." >&2
  exit 2
fi

# Rule 2b — fallback: block if fresh agent worktrees exist (< 30 min old).
if [ -d "$repo_root/.claude/worktrees" ]; then
  fresh="$(find "$repo_root/.claude/worktrees" -maxdepth 1 -name 'agent-*' -mmin -30 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${fresh:-0}" -gt 0 ]; then
    echo "BLOCKED (schema single-writer): $fresh recently-active agent worktree(s) detected. Ensure no parallel wave is running, then edit the schema serially. If these worktrees are stale, run 'git worktree prune' and remove .claude/worktrees/agent-* before retrying." >&2
    exit 2
  fi
fi

exit 0
