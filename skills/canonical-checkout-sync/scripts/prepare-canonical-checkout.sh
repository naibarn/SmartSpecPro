#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${1:-${CODEX_CANONICAL_CHECKOUT:-/home/dev/projects/SmartSpecPro}}"
EXPECTED="${2:-${CODEX_VALIDATED_MAIN_SHA:-}}"

extract_status() { awk -F= '$1=="STATUS"{print $2; exit}'; }

[[ -d "$REPO" ]] || { echo 'STATUS=CANONICAL_CHECKOUT_MISSING'; exit 80; }
git -C "$REPO" fetch origin main >/dev/null 2>&1 || { echo 'STATUS=FETCH_FAILED'; exit 80; }
TARGET="${EXPECTED:-$(git -C "$REPO" rev-parse origin/main)}"

echo "TARGET_SHA=$TARGET"

run_preflight() {
  set +e
  PREFLIGHT_OUT="$($SCRIPT_DIR/canonical-sync-preflight.sh "$REPO" "$TARGET" 2>&1)"
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
        printf 'STATUS=CANONICAL_CHECKOUT_PREPARED\nCHECKOUT=%s\nTARGET_SHA=%s\nNEXT_ACTION=Run the build under run-certified-command.sh for this exact target SHA.\n' "$REPO" "$TARGET"
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
