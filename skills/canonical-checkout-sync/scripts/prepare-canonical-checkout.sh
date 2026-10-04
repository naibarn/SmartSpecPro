#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${1:-${CODEX_CANONICAL_CHECKOUT:-/home/dev/projects/SmartSpecPro}}"
EXPECTED="${2:-${CODEX_VALIDATED_MAIN_SHA:-}}"
REQUIRED_INTEGRATED="${3:-${CODEX_REQUIRED_INTEGRATED_SHA:-}}"

extract_status() { awk -F= '$1=="STATUS"{print $2; exit}'; }

[[ -d "$REPO" ]] || { echo 'STATUS=CANONICAL_CHECKOUT_MISSING'; exit 80; }
git -C "$REPO" fetch origin main >/dev/null 2>&1 || { echo 'STATUS=FETCH_FAILED'; exit 80; }
TARGET="${EXPECTED:-$(git -C "$REPO" rev-parse origin/main)}"

echo "TARGET_SHA=$TARGET"
if [[ -n "$REQUIRED_INTEGRATED" ]]; then
  if ! git -C "$REPO" cat-file -e "${REQUIRED_INTEGRATED}^{commit}" 2>/dev/null; then
    printf 'STATUS=CANONICAL_TARGET_MISSING_REQUIRED_CHANGE\nREQUIRED_INTEGRATED_SHA=%s\nTARGET_SHA=%s\nNEXT_ACTION=Run integration-controller and pass the resulting integrated main commit SHA; the canonical branch and worktree were left untouched.\n' "$REQUIRED_INTEGRATED" "$TARGET"
    exit 20
  fi
  if ! git -C "$REPO" merge-base --is-ancestor "$REQUIRED_INTEGRATED" "$TARGET"; then
    printf 'STATUS=CANONICAL_TARGET_MISSING_REQUIRED_CHANGE\nREQUIRED_INTEGRATED_SHA=%s\nTARGET_SHA=%s\nNEXT_ACTION=The requested change is not in the validated build target. Return to integration-controller, complete or repair integration, then retry with its integrated main SHA; the canonical branch and worktree were left untouched.\n' "$REQUIRED_INTEGRATED" "$TARGET"
    exit 20
  fi
  printf 'REQUIRED_INTEGRATED_SHA=%s\nREQUIRED_CHANGE_INCLUDED=yes\n' "$REQUIRED_INTEGRATED"
fi

run_preflight() {
  set +e
  PREFLIGHT_OUT="$($SCRIPT_DIR/canonical-sync-preflight.sh "$REPO" "$TARGET" "$REQUIRED_INTEGRATED" 2>&1)"
  PREFLIGHT_RC=$?
  set -e
  PREFLIGHT_STATUS="$(printf '%s\n' "$PREFLIGHT_OUT" | extract_status)"
}

for step in 1 2 3 4 5; do
  run_preflight
  case "$PREFLIGHT_STATUS" in
    CANONICAL_PREFLIGHT_OK)
      set +e
      SYNC_OUT="$($SCRIPT_DIR/sync-canonical-main.sh "$REPO" "$TARGET" 2>&1)"
      SYNC_RC=$?
      set -e
      SYNC_STATUS="$(printf '%s\n' "$SYNC_OUT" | extract_status)"
      printf '%s\n' "$SYNC_OUT"
      if [[ "$SYNC_RC" -eq 0 && "$SYNC_STATUS" == "CANONICAL_CHECKOUT_READY" ]]; then
        "$SCRIPT_DIR/verify-build-source.sh" "$REPO" "$TARGET"
        printf 'STATUS=CANONICAL_CHECKOUT_PREPARED\nCHECKOUT=%s\nTARGET_SHA=%s\nREQUIRED_CHANGE_INCLUDED=%s\nNEXT_ACTION=Run the build under run-certified-command.sh for this exact target SHA; deployment and runtime verification are separate stages.\n' "$REPO" "$TARGET" "$([[ -n "$REQUIRED_INTEGRATED" ]] && echo yes || echo not_requested)"
        exit 0
      fi
      case "$SYNC_STATUS" in
        CANONICAL_SYNC_NEEDS_SAFE_REALIGN_AHEAD|CANONICAL_SYNC_NEEDS_SAFE_REALIGN_DIVERGED)
          "$SCRIPT_DIR/preserve-and-realign-canonical.sh" "$REPO" "$TARGET"
          continue
          ;;
        *) exit "$SYNC_RC" ;;
      esac
      ;;
    CANONICAL_SYNC_NEEDS_DIRTY_RECOVERY)
      "$SCRIPT_DIR/recover-dirty-canonical.sh" "$REPO" "$TARGET"
      continue
      ;;
    CANONICAL_SYNC_NEEDS_SAFE_REALIGN_AHEAD|CANONICAL_SYNC_NEEDS_SAFE_REALIGN_DIVERGED)
      "$SCRIPT_DIR/preserve-and-realign-canonical.sh" "$REPO" "$TARGET"
      continue
      ;;
    *)
      printf '%s\n' "$PREFLIGHT_OUT"
      exit "${PREFLIGHT_RC:-80}"
      ;;
  esac
done

echo 'STATUS=CANONICAL_PREPARE_LOOP_EXCEEDED'
echo 'NEXT_ACTION=Inspect concurrent mutations of the canonical checkout; no build/deploy is authorized.'
exit 89
