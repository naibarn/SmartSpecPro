#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-$PWD}"
REVISION="${2:-${CODEX_SOURCE_REVISION:-}}"
REQUIRED="${3:-${CODEX_REQUIRED_INTEGRATED_SHA:-}}"
PURPOSE="${CODEX_SOURCE_PURPOSE:-deploy}"
CORE="$(git -C "$REPO" rev-parse --show-toplevel)/scripts/development-lifecycle/canonical_source.py"

if [[ ! -f "$CORE" ]]; then
  printf 'STATUS=CANONICAL_SOURCE_CORE_MISSING\nPATH=%s\n' "$CORE" >&2
  exit 20
fi

args=("$CORE" prepare --repository "$REPO" --purpose "$PURPOSE")
[[ -z "$REVISION" ]] || args+=(--source-revision "$REVISION")
[[ -z "$REQUIRED" ]] || args+=(--required-integrated-revision "$REQUIRED")
if [[ -n "${CODEX_SOURCE_POLICY:-}" ]]; then args+=(--policy "$CODEX_SOURCE_POLICY"); fi

python3 "${args[@]}"
