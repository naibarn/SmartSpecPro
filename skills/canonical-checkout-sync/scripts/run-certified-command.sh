#!/usr/bin/env bash
set -euo pipefail

REPO="${CODEX_REPOSITORY_ROOT:-$PWD}"
CORE="$(git -C "$REPO" rev-parse --show-toplevel)/scripts/development-lifecycle/canonical_source.py"

if (($# < 5)) || [[ "$4" != "--" ]]; then
  echo 'Usage: run-certified-command.sh <lease-file> <lease-id> <fencing-generation> -- <command> [args...]' >&2
  exit 2
fi
LEASE_FILE="$1"
LEASE_ID="$2"
GENERATION="$3"
shift 3
[[ "$1" == "--" ]] && shift
exec python3 "$CORE" run --lease-file "$LEASE_FILE" --lease-id "$LEASE_ID" --fencing-generation "$GENERATION" -- "$@"
