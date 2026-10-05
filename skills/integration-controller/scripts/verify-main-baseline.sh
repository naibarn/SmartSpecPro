#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <expected-origin-main-sha>" >&2; exit 2; }
expected="$1"
git fetch origin main >/dev/null 2>&1 || { echo "ERROR: unable to fetch origin/main" >&2; exit 3; }
actual="$(git rev-parse origin/main)"
if [[ "$actual" != "$expected" ]]; then
  echo "MAIN_MOVED expected=$expected actual=$actual" >&2
  exit 4
fi
echo "MAIN_BASELINE_OK $actual"
