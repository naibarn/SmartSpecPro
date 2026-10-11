# Cross-session coordination and integration recovery evidence

## Baseline

- Repository policy: `origin`, `refs/heads/main`.
- Fetched canonical revision before implementation: `2cdd7443a5c3ddbc9e446a952a3f2f058f7e1775`.
- Primary checkout: `/mnt/SmartSpecDev/projects/SmartSpecPro`, local `main` at
  `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`, 576 commits behind the fetched
  canonical tip, with 9 dirty paths. All were preserved.
- Task worktree: `/home/dev/worktrees/cross-session-integration-recovery-20261012`,
  registered as `TASK_WORKTREE`, task `cross-session-integration-recovery-20261012`.

## PR #781 / progressive integration gate

- PR: https://github.com/naibarn/SmartSpecPro/pull/781
- State: `MERGED`; head `92a3b451eb111efa3d6ef3d1eb9a02e528e72907`; merge
  commit `c947278f90429e90043dab68f17a65c956abdfa4`.
- Gate run: https://github.com/naibarn/SmartSpecPro/actions/runs/38167870084
  (job `114554097530`), reported `SUCCESS`.
- Exact job evidence: checkout succeeded on `ubuntu-24.04`, runner image
  `20261004.327.1`, Git `2.55.0`. The test step then emitted
  `/home/runner/work/_temp/...sh: line 2: rg: command not found`, followed by
  `No progressive-integration policy changes; gate is not applicable.`
- Root cause: `.github/workflows/progressive-integration.yml` used `if ! rg`
  without installing ripgrep. The missing executable returned nonzero, which
  the negated condition treated as an ordinary no-match. The gate therefore
  reported success without running the lifecycle or Integration Controller
  tests. This is a CI gate false green, not a checkout failure.
- A separate run whose logs were queried had no job/log payload; it is not used
  to attribute a checkout or application failure.

## Workspaces and leases

- Git reports 466 registered worktree paths in the shared common directory.
- The workspace-authority registry contains 465 rows: 422
  `UNKNOWN_WORKSPACE`, 23 recorded dirty, 10 `TASK_WORKTREE` rows with lease
  state `LEASED`, and 2 `INTEGRATION_WORKTREE` rows.
- 12 rows have an expired lease timestamp and zero have a currently valid lease
  timestamp. Expiry is not proof of a dead session; it requires process/runtime
  verification before reclamation.
- The old primary checkout's `workspace_authority resolve` was interrupted
  after it spent over 20 seconds running `git status --untracked-files=all`
  across discovered worktrees. The fetched canonical source has a bounded
  resolver that skips foreign/unregistered and active worktrees, with a limit
  of 16. This discrepancy is due to the primary checkout being stale, not
  evidence that another session caused the delay.

## Existing capabilities confirmed in canonical source

- Task-scoped worktree registration with PID/process-start verification and
  expiring leases in `workspace_authority.py`.
- Dirty-worktree preservation and ownership-aware retirement in the same
  authority service.
- Progressive executor's common-Git-dir nonblocking promotion lock, exact
  head/base preflight, normal non-force GitHub merge, durable receipt, and
  continuation only after verified merge.
- Shared lifecycle policy rejects stale dependency evidence and selects ready
  independent WorkUnits. Existing tests cover non-overlapping slices, stale
  base, merge serialization, failed worker receipts, and no-delta retry loops.

## Current repair

Replace the undeclared `rg` runtime dependency with a small Python standard
library scope classifier. Its CLI emits only `run` or `skip`; read/encoding
errors exit nonzero so GitHub Actions' `set -e` fails the gate closed. Focused
tests cover relevant and unrelated paths, malformed/unreadable input, use with
an empty PATH, and workflow wiring.

## Checkpoint 1 — PR #822

- PR: https://github.com/naibarn/SmartSpecPro/pull/822
- Source head: `79207eadbbb7e957a081b7dbc9ef86e24a4d5a6a`.
- `progressive_integration_gate`: run `38184675273`, job `114604348402`, passed
  in 59 seconds with checkout, setup-python, and the full affected-skill test
  command all completed.
- Normal merge: `46228e296c9ae711325ad350fd3f403cde5d2076`; verified reachable
  from fetched `origin/main` at the time of verification.
- Metrics: branch age `0.0339h`; merge latency `UNKNOWN`; delta 1 commit / 5
  files / 234 insertions / 5 deletions; 0 conflicts; main build health pending
  on the integrated SHA; preview timing `UNKNOWN`.
- Canonical user workspace convergence remains pending. The registered
  workspace is dirty and 576 commits behind at task start; resolver verification
  exceeded its deadline. No checkout sync or destructive cleanup was attempted.
- Post-merge run `38184773842` (CI) was still in progress when checked.
  Migration run `38184773054` failed but GitHub returned no jobs/log payload;
  failure class remains `UNKNOWN` and is not attributed to application code,
  checkout, a session, or DB contention.

## Checkpoint 2 — current recovery slice

- New WorkUnit baseline: `46228e296c9ae711325ad350fd3f403cde5d2076`.
- Added live-PR-state reconciliation for merged-by-another-session, closed, and
  superseded PRs; already-merged state requires fresh canonical fetch plus
  merge-SHA ancestry proof before continuation.
- Added bounded three-attempt exponential retry for classified transport and
  command-timeout failures. Receipts retain attempt number, failure class,
  diagnostic digest, and a short redacted excerpt. Application, authority, and
  conflict failures are not retried.
- Tests use isolated temporary Git repositories for merge-lock behavior; they
  never contend with the host repository's integration lock.
