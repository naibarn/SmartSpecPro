#!/usr/bin/env bash
# validate-agents-registry.sh
# Validates consistency between agent definition files and the registry README.
#
# Checks:
#   1. Every deep_plan/skills/sub-agents/agents/*.md has a row in README registry table
#   2. Every .claude/agents/ssp-*.md has a row in the README native cross-reference table
#   3. README 17-agent count matches actual file count (both directories)
#   4. Each .claude/agents/ssp-*.md has required YAML frontmatter fields
#
# Usage: ./scripts/validate-agents-registry.sh
# Exit code 0 = PASS, 1 = FAIL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SUB_AGENTS_DIR="$REPO_ROOT/skills/sub-agents/agents"
NATIVE_AGENTS_DIR="$REPO_ROOT/.claude/agents"
README_FILE="$REPO_ROOT/skills/sub-agents/README.md"

ERRORS=0
WARNINGS=0

pass() { echo "  ✓ $*"; }
fail() { echo "  ✗ FAIL: $*"; ERRORS=$((ERRORS + 1)); }
warn() { echo "  ⚠ WARN: $*"; WARNINGS=$((WARNINGS + 1)); }

echo ""
echo "════════════════════════════════════════════════════════"
echo " Agent Registry Consistency Validator"
echo "════════════════════════════════════════════════════════"
echo ""

# ── Check 1: sub-agents/agents/*.md present in README ────────────────────────
echo "── Check 1: sub-agents/agents/*.md → README registry table"

if [ ! -d "$SUB_AGENTS_DIR" ]; then
  fail "Directory not found: $SUB_AGENTS_DIR"
else
  SUB_AGENT_COUNT=0
  for agent_file in "$SUB_AGENTS_DIR"/*.md; do
    [ -f "$agent_file" ] || continue
    agent_name="$(basename "$agent_file" .md)"
    SUB_AGENT_COUNT=$((SUB_AGENT_COUNT + 1))
    if grep -qE "\`${agent_name}\.md\`|[| ]${agent_name}[. |]" "$README_FILE" 2>/dev/null; then
      pass "$agent_name in README"
    else
      fail "$agent_name NOT found in README registry table"
    fi
  done
  echo "  → $SUB_AGENT_COUNT agent files checked"
fi

echo ""

# ── Check 2: .claude/agents/ssp-*.md present in README cross-reference ───────
echo "── Check 2: .claude/agents/ssp-*.md → README native cross-reference"

if [ ! -d "$NATIVE_AGENTS_DIR" ]; then
  fail "Directory not found: $NATIVE_AGENTS_DIR"
else
  NATIVE_AGENT_COUNT=0
  for agent_file in "$NATIVE_AGENTS_DIR"/ssp-*.md; do
    [ -f "$agent_file" ] || continue
    agent_name="$(basename "$agent_file" .md)"
    NATIVE_AGENT_COUNT=$((NATIVE_AGENT_COUNT + 1))
    if grep -q "$agent_name" "$README_FILE" 2>/dev/null; then
      pass "$agent_name in README"
    else
      fail "$agent_name NOT found in README cross-reference"
    fi
  done
  echo "  → $NATIVE_AGENT_COUNT native agent files checked"
fi

echo ""

# ── Check 3: File counts match expected 17 ───────────────────────────────────
echo "── Check 3: Agent file counts"

EXPECTED=17
if [ "${SUB_AGENT_COUNT:-0}" -eq "$EXPECTED" ]; then
  pass "sub-agents/agents/ count = $EXPECTED (expected $EXPECTED)"
else
  fail "sub-agents/agents/ count = ${SUB_AGENT_COUNT:-0} (expected $EXPECTED)"
fi

if [ "${NATIVE_AGENT_COUNT:-0}" -eq "$EXPECTED" ]; then
  pass ".claude/agents/ ssp-* count = $EXPECTED (expected $EXPECTED)"
else
  fail ".claude/agents/ ssp-* count = ${NATIVE_AGENT_COUNT:-0} (expected $EXPECTED)"
fi

echo ""

# ── Check 4: Required YAML frontmatter fields in .claude/agents/ssp-*.md ─────
echo "── Check 4: Required YAML frontmatter in native agent files"

REQUIRED_FIELDS=("name:" "description:" "tools:" "model:" "permissionMode:" "maxTurns:")

for agent_file in "$NATIVE_AGENTS_DIR"/ssp-*.md; do
  [ -f "$agent_file" ] || continue
  agent_name="$(basename "$agent_file" .md)"
  agent_errors=0
  for field in "${REQUIRED_FIELDS[@]}"; do
    if ! grep -q "^$field" "$agent_file" 2>/dev/null; then
      fail "$agent_name: missing frontmatter field '$field'"
      agent_errors=$((agent_errors + 1))
    fi
  done
  if [ "$agent_errors" -eq 0 ]; then
    pass "$agent_name: all required frontmatter fields present"
  fi
done

echo ""

# ── Check 5: README exists and has required sections ─────────────────────────
echo "── Check 5: README structure"

if [ ! -f "$README_FILE" ]; then
  fail "README not found: $README_FILE"
else
  for section in "Agent Registry" "Platform Compatibility" "How to Add a New Agent" "Native .claude/agents"; do
    if grep -q "$section" "$README_FILE"; then
      pass "README has section: $section"
    else
      warn "README missing section: $section"
    fi
  done
fi

echo ""

# ── Check 6: orchestra/ runtime directory exists ─────────────────────────────
echo "── Check 6: orchestra/ runtime directory"

ORCHESTRA_DIR="$REPO_ROOT/orchestra"
if [ -d "$ORCHESTRA_DIR" ]; then
  pass "orchestra/ directory exists"
  for f in "risk_register.md" "decisions.md"; do
    if [ -f "$ORCHESTRA_DIR/$f" ]; then
      pass "orchestra/$f exists"
    else
      warn "orchestra/$f missing (will be created at runtime)"
    fi
  done
else
  fail "orchestra/ directory NOT found — create with: mkdir -p orchestra"
fi

echo ""

# ── Summary ──────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ]; then
  echo " RESULT: PASS ($WARNINGS warnings)"
  echo "════════════════════════════════════════════════════════"
  echo ""
  exit 0
else
  echo " RESULT: FAIL ($ERRORS errors, $WARNINGS warnings)"
  echo "════════════════════════════════════════════════════════"
  echo ""
  exit 1
fi
