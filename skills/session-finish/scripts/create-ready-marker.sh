#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 <verified-origin-main-sha> <task> <verification-lane> <verification-scope> [skipped-checks] [baseline-issues] [deferred-heavy-checks]" >&2
  exit 2
}

[[ $# -ge 4 && $# -le 7 ]] || usage
verified_main="$1"
task="$2"
lane="$3"
scope="$4"
skipped="${5:-NONE}"
baseline_issues="${6:-NONE}"
deferred="${7:-NONE}"

case "$lane" in FAST|TARGETED|HEAVY_PENDING) ;; *) echo "ERROR: invalid verification lane: $lane" >&2; exit 2;; esac

for value_name in task lane scope skipped baseline_issues deferred; do
  value="${!value_name}"
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* || "$value" == *$'\t'* ]]; then
    echo "ERROR: $value_name must be single-line and tab-free" >&2
    exit 2
  fi
done
[[ -n "$task" && -n "$scope" ]] || { echo "ERROR: task and verification scope must be non-empty" >&2; exit 2; }

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: not in git worktree" >&2; exit 2; }
branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
[[ -n "$branch" ]] || { echo "ERROR: detached HEAD; create/reuse a dedicated session branch first" >&2; exit 3; }
case "$branch" in main|master) echo "ERROR: refusing READY marker on shared branch $branch" >&2; exit 3;; esac

if [[ -n "$(git status --porcelain=v1)" ]]; then
  echo "ERROR: worktree is not clean" >&2
  git status --short >&2
  exit 4
fi

git cat-file -e "${verified_main}^{commit}" 2>/dev/null || { echo "ERROR: verified main SHA is not a commit: $verified_main" >&2; exit 5; }

git fetch origin main >/dev/null 2>&1 || { echo "ERROR: unable to fetch origin/main" >&2; exit 6; }
current_main="$(git rev-parse origin/main)"
if [[ "$current_main" != "$verified_main" ]]; then
  echo "ERROR: origin/main moved after verification" >&2
  echo "verified=$verified_main" >&2
  echo "current=$current_main" >&2
  exit 7
fi

head="$(git rev-parse HEAD)"
head_body="$(git log -1 --format=%B "$head")"
head_status="$(printf '%s\n' "$head_body" | sed -n 's/^Codex-Session-Status:[[:space:]]*//p' | tail -1)"
head_verified="$(printf '%s\n' "$head_body" | sed -n 's/^Codex-Verified-Origin-Main:[[:space:]]*//p' | tail -1)"
head_branch="$(printf '%s\n' "$head_body" | sed -n 's/^Codex-Session-Branch:[[:space:]]*//p' | tail -1)"

# Idempotent re-run after a successful finish: reuse the existing terminal marker.
if [[ -n "$head_status" ]]; then
  if [[ "$head_verified" == "$verified_main" && "$head_branch" == "$branch" ]]; then
    echo "ready_marker=$head"
    echo "session_status=$head_status"
    echo "verification=$(printf '%s\n' "$head_body" | sed -n 's/^Codex-Verification:[[:space:]]*//p' | tail -1)"
    echo "verification_lane=$(printf '%s\n' "$head_body" | sed -n 's/^Codex-Verification-Lane:[[:space:]]*//p' | tail -1)"
    echo "implementation_tip=$(printf '%s\n' "$head_body" | sed -n 's/^Codex-Implementation-Tip:[[:space:]]*//p' | tail -1)"
    echo "verified_origin_main=$head_verified"
    echo "branch=$branch"
    echo "idempotent_reuse=yes"
    exit 0
  fi
  echo "ERROR: branch already ends in a readiness marker for a different baseline/state; do not stack markers" >&2
  echo "existing_marker=$head existing_verified_main=$head_verified requested_verified_main=$verified_main" >&2
  exit 9
fi

# A marker deeper in this branch means the session was already closed and then reopened.
# Refuse to create marker-on-marker ancestry; start a new session branch instead.
prior_marker="$(git log --format='%H' --grep='^Codex-Session-Status:' HEAD | head -1)"
if [[ -n "$prior_marker" ]]; then
  echo "ERROR: readiness marker already exists in branch ancestry ($prior_marker); session branch was reopened after completion" >&2
  echo "ACTION: create a new task/session branch from the desired implementation/main baseline rather than stacking lifecycle markers" >&2
  exit 10
fi

if ! git merge-base --is-ancestor "$verified_main" HEAD; then
  echo "ERROR: verified origin/main SHA is not an ancestor of implementation HEAD; branch is not reconciled to the claimed baseline" >&2
  echo "verified=$verified_main head=$head" >&2
  exit 11
fi

if [[ "$lane" == "HEAVY_PENDING" ]]; then
  session_status="READY_FOR_HEAVY_VERIFICATION"
  verification="SCOPED_PASS_HEAVY_PENDING"
  [[ -n "$deferred" && "$deferred" != "NONE" ]] || { echo "ERROR: HEAVY_PENDING requires deferred-heavy-checks" >&2; exit 8; }
elif [[ "$baseline_issues" == "NONE" || -z "$baseline_issues" ]]; then
  session_status="READY_FOR_INTEGRATION"
  verification="PASS_SCOPED"
  baseline_issues="NONE"
else
  session_status="READY_FOR_INTEGRATION_WITH_BASELINE_ISSUES"
  verification="PASS_SCOPED_WITH_BASELINE_ISSUES"
fi

implementation_tip="$head"
msgfile="$(mktemp)"
trap 'rm -f "$msgfile"' EXIT
cat > "$msgfile" <<MSG
chore(codex): mark session ready for integration lifecycle

Codex-Session-Status: $session_status
Codex-Verified-Origin-Main: $verified_main
Codex-Verification: $verification
Codex-Verification-Lane: $lane
Codex-Verification-Scope: $scope
Codex-Verification-Skipped: $skipped
Codex-Baseline-Issues: $baseline_issues
Codex-Deferred-Checks: $deferred
Codex-Implementation-Tip: $implementation_tip
Codex-Task: $task
Codex-Session-Branch: $branch
MSG

git commit --allow-empty -F "$msgfile" >/dev/null
marker="$(git rev-parse HEAD)"
echo "ready_marker=$marker"
echo "session_status=$session_status"
echo "verification=$verification"
echo "verification_lane=$lane"
echo "implementation_tip=$implementation_tip"
echo "verified_origin_main=$verified_main"
echo "branch=$branch"
echo "idempotent_reuse=no"
