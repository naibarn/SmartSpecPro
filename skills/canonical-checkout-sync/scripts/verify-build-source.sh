#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-${CODEX_CANONICAL_CHECKOUT:-/home/dev/projects/SmartSpecPro}}"
EXPECTED="${2:-${CODEX_VALIDATED_MAIN_SHA:-}}"

if [[ -z "$EXPECTED" ]]; then
  echo 'STATUS=BUILD_GUARD_MISSING_TARGET_SHA'
  exit 40
fi

[[ -d "$REPO" ]] || { echo 'STATUS=BUILD_GUARD_CHECKOUT_MISSING'; exit 40; }
git -C "$REPO" cat-file -e "${EXPECTED}^{commit}" 2>/dev/null || { echo 'STATUS=BUILD_GUARD_INVALID_TARGET_SHA'; exit 40; }
HEAD="$(git -C "$REPO" rev-parse HEAD)"
BRANCH="$(git -C "$REPO" symbolic-ref --quiet --short HEAD || true)"
DIRTY="$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)"

[[ "$BRANCH" == "main" ]] || { printf 'STATUS=BUILD_GUARD_WRONG_BRANCH\nBRANCH=%s\n' "${BRANCH:-DETACHED}"; exit 41; }
[[ -z "$DIRTY" ]] || { echo 'STATUS=BUILD_GUARD_DIRTY_CHECKOUT'; printf '%s\n' "$DIRTY"; exit 42; }
[[ "$HEAD" == "$EXPECTED" ]] || { printf 'STATUS=BUILD_SOURCE_SHA_MISMATCH\nEXPECTED=%s\nHEAD=%s\n' "$EXPECTED" "$HEAD"; exit 43; }

git -C "$REPO" fetch origin main >/dev/null 2>&1 || { echo 'STATUS=BUILD_GUARD_FETCH_FAILED'; exit 44; }
REMOTE="$(git -C "$REPO" rev-parse origin/main)"
git -C "$REPO" merge-base --is-ancestor "$EXPECTED" "$REMOTE" || { printf 'STATUS=BUILD_GUARD_TARGET_NOT_IN_MAIN_HISTORY\nEXPECTED=%s\nORIGIN_MAIN=%s\n' "$EXPECTED" "$REMOTE"; exit 45; }

printf 'STATUS=BUILD_SOURCE_VERIFIED\n'
printf 'CHECKOUT=%s\n' "$REPO"
printf 'BUILD_SOURCE_SHA=%s\n' "$HEAD"
printf 'ORIGIN_MAIN=%s\n' "$REMOTE"
printf 'WORKING_TREE=CLEAN\n'
