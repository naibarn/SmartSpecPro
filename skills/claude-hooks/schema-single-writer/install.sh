#!/usr/bin/env bash
# ============================================================================
# Orchestra schema single-writer hook — Claude Code installer (one command)
#
#   Usage:
#     bash install.sh                # install into the current git repo
#     bash install.sh /path/to/repo  # install into a specific repo root
#     bash install.sh --verify       # only run checks, change nothing
#
# Idempotent & safe: backs up every file it edits (<file>.bak.<timestamp>),
# and can be re-run without duplicating anything.
# ============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_ONLY=0
ARG_REPO=""
for a in "$@"; do
  case "$a" in
    --verify) VERIFY_ONLY=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) ARG_REPO="$a" ;;
  esac
done

say()  { printf '  %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
hr()   { printf '%s\n' "────────────────────────────────────────────────────────"; }

# ---- 1. locate repo root ---------------------------------------------------
if [ -n "$ARG_REPO" ]; then
  REPO="$(cd "$ARG_REPO" 2>/dev/null && pwd)" || { err "path not found: $ARG_REPO"; exit 1; }
else
  REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || REPO="$PWD"
fi

hr; echo "  Orchestra schema single-writer hook installer"; hr
say "Repo root : $REPO"

if [ ! -f "$REPO/skills/orchestra/SKILL.md" ]; then
  warn "skills/orchestra/SKILL.md not found under this root."
  warn "Run from the target repo root (must have the orchestra skill), or pass the path:"
  warn "    bash install.sh /path/to/repo"
  [ "$VERIFY_ONLY" -eq 0 ] && { err "aborting to avoid installing in the wrong place."; exit 1; }
fi

command -v python3 >/dev/null 2>&1 || { err "python3 is required."; exit 1; }

# ---- verify-only path ------------------------------------------------------
verify() {
  hr; echo "  Verification"; hr
  local h="$REPO/.claude/hooks/schema-single-writer.sh"
  if [ -f "$h" ]; then
    if bash -n "$h" 2>/dev/null; then ok "hook present & valid syntax"; else err "hook syntax error"; fi
    [ -x "$h" ] && ok "hook is executable" || warn "hook not executable (run: chmod +x '$h')"
    # functional smoke test in a temp sandbox
    local tmp; tmp="$(mktemp -d)"; mkdir -p "$tmp/orchestra"; ( cd "$tmp" && git init -q 2>/dev/null || true )
    touch "$tmp/orchestra/.wave-active"
    local rc
    echo '{"tool_name":"Edit","tool_input":{"file_path":"apps/web/drizzle/schema.ts"}}' \
      | ( cd "$tmp" && bash "$h" >/dev/null 2>&1 ); rc=$?
    [ "$rc" -eq 2 ] && ok "smoke: schema edit BLOCKED while wave active (exit 2)" || warn "smoke: expected block (exit 2), got $rc"
    rm -f "$tmp/orchestra/.wave-active"
    echo '{"tool_name":"Edit","tool_input":{"file_path":"apps/web/drizzle/schema.ts"}}' \
      | ( cd "$tmp" && bash "$h" >/dev/null 2>&1 ); rc=$?
    [ "$rc" -eq 0 ] && ok "smoke: schema edit ALLOWED when no wave (exit 0)" || warn "smoke: expected allow (exit 0), got $rc"
    rm -rf "$tmp"
  else
    warn "hook not installed yet"
  fi
  for f in schema-single-writer.md rate-limit-safety.md; do
    [ -f "$REPO/skills/orchestra/references/$f" ] && ok "reference present: $f" || warn "missing reference: $f"
  done
  python3 - "$REPO" <<'PY'
import json,sys,os
repo=sys.argv[1]
sp=os.path.join(repo,".claude/settings.json")
slp=os.path.join(repo,".claude/settings.local.json")
def has_hook(p):
    try:d=json.load(open(p))
    except:return False
    for e in d.get("hooks",{}).get("PreToolUse",[]):
        for h in e.get("hooks",[]):
            if h.get("command","").endswith("schema-single-writer.sh"):return True
    return False
print("  \033[32m✓\033[0m settings.json hook registered" if has_hook(sp) else "  \033[33m!\033[0m settings.json hook NOT registered")
try:m=json.load(open(slp)).get("model")
except:m=None
print("  \033[32m✓\033[0m conductor model = opus" if m=="opus" else f"  \033[33m!\033[0m conductor model = {m} (expected opus)")
sk=os.path.join(repo,"skills/orchestra/SKILL.md")
t=open(sk,encoding="utf-8").read() if os.path.exists(sk) else ""
for probe,label in [("references/schema-single-writer.md","SKILL: schema reference row"),
                    ("A wave returns rate-limit","SKILL: rate-limit STOP row"),
                    ("Schema single-writer lock (REQUIRED","SKILL: wave-lock touch"),
                    ("Release the schema lock","SKILL: wave-lock release")]:
    print(("  \033[32m✓\033[0m " if probe in t else "  \033[33m!\033[0m ")+label)
PY
}

if [ "$VERIFY_ONLY" -eq 1 ]; then verify; exit 0; fi

# ---- 2. copy payload -------------------------------------------------------
hr; echo "  Installing files"; hr
mkdir -p "$REPO/.claude/hooks" "$REPO/skills/orchestra/references"
cp "$SCRIPT_DIR/payload/.claude/hooks/schema-single-writer.sh" "$REPO/.claude/hooks/"
chmod +x "$REPO/.claude/hooks/schema-single-writer.sh"
ok "hook  -> .claude/hooks/schema-single-writer.sh (+x)"
cp "$SCRIPT_DIR/payload/skills/orchestra/references/schema-single-writer.md" "$REPO/skills/orchestra/references/"
cp "$SCRIPT_DIR/payload/skills/orchestra/references/rate-limit-safety.md" "$REPO/skills/orchestra/references/"
ok "references -> skills/orchestra/references/ (2 files)"

# ---- 3. idempotent edits ---------------------------------------------------
hr; echo "  Patching settings + SKILL.md (idempotent, with backups)"; hr
python3 "$SCRIPT_DIR/lib/apply_edits.py" "$REPO"

# ---- 4. verify -------------------------------------------------------------
verify

# ---- 5. summary ------------------------------------------------------------
hr; echo "  Done"; hr
say "Backups (if any) are saved next to each edited file as <file>.bak.<timestamp>."
say "Inside Claude Code, confirm with:  /model  (Opus)   and   /memory  (new refs)"
say "Note: hook + Opus pin are Claude-only — Codex is unaffected."
