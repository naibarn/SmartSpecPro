#!/usr/bin/env bash
set -euo pipefail

branch="${1:-$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)}"
[[ -n "$branch" ]] || { echo "ERROR: branch argument required for detached HEAD" >&2; exit 2; }
case "$branch" in main|master) echo "ERROR: refusing shared branch $branch" >&2; exit 2;; esac

git fetch origin "$branch" >/dev/null 2>&1 || { echo "ERROR: remote branch origin/$branch not found" >&2; exit 3; }
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "origin/$branch")"
[[ "$local_sha" == "$remote_sha" ]] || { echo "ERROR: local/remote SHA mismatch local=$local_sha remote=$remote_sha" >&2; exit 4; }

body="$(git log -1 --format=%B "$remote_sha")"
get_trailer() { printf '%s\n' "$body" | sed -n "s/^$1:[[:space:]]*//p" | tail -1; }
status="$(get_trailer 'Codex-Session-Status')"
verified="$(get_trailer 'Codex-Verified-Origin-Main')"
verification="$(get_trailer 'Codex-Verification')"
lane="$(get_trailer 'Codex-Verification-Lane')"
impl="$(get_trailer 'Codex-Implementation-Tip')"
baseline="$(get_trailer 'Codex-Baseline-Issues')"
deferred="$(get_trailer 'Codex-Deferred-Checks')"
marker_branch="$(get_trailer 'Codex-Session-Branch')"

case "$status:$verification:$lane" in
  READY_FOR_INTEGRATION:PASS_SCOPED:FAST|READY_FOR_INTEGRATION:PASS_SCOPED:TARGETED) ;;
  READY_FOR_INTEGRATION_WITH_BASELINE_ISSUES:PASS_SCOPED_WITH_BASELINE_ISSUES:FAST|READY_FOR_INTEGRATION_WITH_BASELINE_ISSUES:PASS_SCOPED_WITH_BASELINE_ISSUES:TARGETED)
    [[ -n "$baseline" && "$baseline" != "NONE" ]] || { echo "ERROR: baseline-ready marker missing baseline issues" >&2; exit 5; }
    ;;
  READY_FOR_HEAVY_VERIFICATION:SCOPED_PASS_HEAVY_PENDING:HEAVY_PENDING)
    [[ -n "$deferred" && "$deferred" != "NONE" ]] || { echo "ERROR: heavy-pending marker missing deferred checks" >&2; exit 5; }
    ;;
  *) echo "ERROR: invalid readiness marker status=$status verification=$verification lane=$lane" >&2; exit 5;;
esac

[[ -n "$verified" && -n "$impl" && -n "$marker_branch" ]] || { echo "ERROR: incomplete readiness trailers" >&2; exit 5; }
[[ "$marker_branch" == "$branch" ]] || { echo "ERROR: readiness marker branch trailer ($marker_branch) != remote branch ($branch)" >&2; exit 6; }
git cat-file -e "${verified}^{commit}" 2>/dev/null || { echo "ERROR: verified baseline commit missing: $verified" >&2; exit 6; }
git cat-file -e "${impl}^{commit}" 2>/dev/null || { echo "ERROR: implementation commit missing: $impl" >&2; exit 6; }
parent="$(git rev-parse "${remote_sha}^")"
[[ "$impl" == "$parent" ]] || { echo "ERROR: implementation tip trailer ($impl) != marker parent ($parent)" >&2; exit 6; }
git merge-base --is-ancestor "$verified" "$impl" || { echo "ERROR: verified baseline is not an ancestor of implementation tip" >&2; exit 7; }

# A terminal marker must be the only readiness marker on this branch ancestry.
marker_count="$(git log --format='%H' --grep='^Codex-Session-Status:' "$remote_sha" | wc -l | tr -d ' ')"
[[ "$marker_count" -eq 1 ]] || { echo "ERROR: expected exactly one readiness marker in branch ancestry, found $marker_count" >&2; exit 8; }

echo "REMOTE_READY_OK branch=$branch tip=$remote_sha implementation=$impl verified_main=$verified status=$status verification=$verification lane=$lane baseline_issues=${baseline:-NONE} deferred_checks=${deferred:-NONE}"
