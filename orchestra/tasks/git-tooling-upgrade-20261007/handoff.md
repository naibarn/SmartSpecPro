# Git 2.56 Conflict Resolution Handoff

Status: implementation complete on task branch; canonical integration pending.

## Environment

- OS: Debian GNU/Linux 13 (trixie)
- Previous effective Git: `2.47.3`, `/usr/bin/git`
- New effective Git: `2.56.0`, `/usr/local/bin/git`
- Source: official kernel.org Git 2.56.0 release tarball; built into `/usr/local`
- Optional Tcl/Tk and gettext integrations were disabled; no unrelated OS packages were upgraded.
- Canonical base at task start: `origin/main` `5928f373f7c395d1e0cf900615df3b116aae9fee`
- Primary checkout's unrelated `finance-ocr-debug.jsonl` and `.tmp-audit-download/` changes were preserved.

## Implementation

- Added `skills/development-lifecycle/git_capabilities.py`, the shared version,
  operation-state, path inventory, and conflict-resolution policy.
- Git 2.56+ uses `git add --resolved -- <explicit paths>`.
- Older Git warns and uses explicit per-path `git add` only after marker checks.
- The policy records staged-before, intended resolution paths, and staged-after;
  it blocks pre-existing/unexpected staged paths outside ownership and unlisted
  unmerged paths. It runs `git diff --cached --check` after staging.
- `--resolved` is documented as a textual-marker guard, not semantic approval.
- Updated Orchestra, session-finish, integration-controller,
  canonical-checkout-sync, deep-implement, the development lifecycle contract,
  AGENTS.md, session preflight, and the tracked Kilo deep-implement copy.
- Updated the corresponding installed runtime skill copies and verified mirror
  parity.

## Verification

- Conflict-policy tests: 21 total, 20 passed, 1 Windows-only test skipped on Debian.
- Lifecycle alignment tests: 6 passed.
- Skill audit: passed, including 330 existing deep-implement tests.
- `bash -n skills/session-finish/scripts/session-preflight.sh`: passed.
- `git diff --check` and `git diff --cached --check`: passed before staging.
- Native behavior exercised against Git 2.56.0; legacy fallback exercised with
  the capability path forced off.
- Ten review classes completed: feature semantics; broad staging; pre-staged
  contamination; worktree isolation; Windows paths; Debian/Linux installation;
  legacy compatibility; merge/rebase/cherry-pick recovery; handoff/canonical
  state; test/documentation maintainability.

## Staging review

No broad `git add -u`, `git add -A`, or `git add .` was removed because the
discovered occurrences are ordinary explicit task staging or historical/sample
guidance, not conflict-resolution shortcuts. Conflict resolution now uses the
shared policy exclusively.

## Remaining work

- Commit only task-owned files and push this task branch through the normal
  non-force path.
- Canonical/main integration and any PR protection path remain pending until
  the pushed revision is checked against the latest configured canonical ref.
- Actual Windows execution remains unverified; Windows path normalization has
  a Windows-only automated test.
