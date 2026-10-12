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

## Checkpoint 2 — PR #824 integration and handoff

- PR: https://github.com/naibarn/SmartSpecPro/pull/824
- Final source head: `72b7aa6430f601dea22b7ef36645bb40e9edc1a2`.
- The first preflight correctly blocked while the required gate was in progress.
  That observation exposed a reporter-only classification bug: pending checks
  were labeled `APPLICATION`. Removed that mapping and added a regression test;
  pending now stays `UNKNOWN` while remaining a merge blocker.
- Required `progressive_integration_gate` run `38185418652`, job
  `114606579858`, passed in 58 seconds on the final head. Checkout, setup-python,
  and the affected lifecycle test command all completed successfully.
- Integration Controller revalidated the exact head and clean merge state, then
  used the normal GitHub squash merge. PR merged at 2026-10-11 23:46:10 UTC as
  `a94e824375f3c63050296e70df1f7084a1a1c907`; the SHA was verified reachable
  from fetched `origin/main` before this handoff.
- Local regression slice: 32 focused lifecycle/integration tests passed. The
  pending-check classification test then passed with the follow-up change
  (15 tests in the PR-controller suite). `git diff --check` and Python
  compilation passed. No full local typecheck or repository-wide suite ran.
- Post-merge CI run `38185524332` was queued/running at handoff. Track all its
  jobs against merge SHA `a94e8243`; do not interpret a pending result as a
  failure. The vertical migration run `38185523545` reported failure but
  exposes no jobs or logs, so its cause remains `UNKNOWN`; next action is to
  inspect the run again when GitHub exposes logs or request the workflow owner
  to recover the missing run evidence. No migration was attempted here.
- The registered canonical user workspace remains unresolved: authority verify
  for the integrated SHA returned `CONVERGENCE_PENDING` with
  `WORKSPACE_AUTHORITY_DEADLINE_EXCEEDED` and `WORKSPACE_STATE_UNKNOWN`. Preserve
  the dirty primary checkout; next action is a bounded authority/runtime audit
  from a current canonical checkout before any convergence or retirement.
- At the initial task snapshot, the stale primary checkout lacked
  `skills/development-lifecycle/git_capabilities.py`; the current canonical
  source has it. Final verification invoked `inspect` from the canonical-based
  repair worktree. No branch force-push, destructive cleanup, or primary
  workspace sync occurred.

## Final verification follow-up — current repair PR

- PR #824 merge SHA `a94e8243` CI run `38185524332` and PR #825 merge SHA
  `78c63822` CI run `38185697789` both completed `python` and `turbo_build`
  with failures; the `smartspecweb` job was still running when this was
  recorded. Python reported 67 failures / 4660 passes / 40 skips on both SHAs.
  The ordered failing-test list digest was identical on both runs and on the
  parent-base CI run `38185248946` at `a6ba7ddd`. Turbo reported the same 498
  TypeScript diagnostic sites on parent-base run `38185248946` and `a94e8243`.
  PR #824 changes no application TypeScript or Python runtime files; these are
  pre-existing baseline failures and are not repaired in this task. The exact
  run and job logs remain the evidence source; no local full typecheck ran.
- The migration workflow runs `38185523545` and `38185697126` both have event
  `push`, zero jobs, zero check runs, and no downloadable logs. A no-op manual
  dispatch probe (wrong confirmation, no staging connection) was rejected by
  GitHub validation with `Line: 32, Col: 31: Unrecognized named-value: 'runner'`.
  At line 32, `runner.temp` was used in a job-level `env`, where the runner
  context is unavailable. This is the proven pre-job parse failure behind the
  empty failed runs; no migration job started and no staging database was
  touched. The fix moves that value to the two steps that use it and explicitly
  requires both `workflow_dispatch` and the exact confirmation token.
- The current canonical Skill contract contains
  `skills/development-lifecycle/git_capabilities.py`; invoking its `inspect`
  command on the repair worktree reported Git 2.56.0, no merge/rebase/cherry
  pick, no unmerged/staged paths. The root session-finish Skill invokes the
  same command. `actionlint` is not installed on this host; the existing
  workflow-validation script previously omitted this manual migration
  workflow, so the current repair adds it and adds a static manual-trigger
  contract test to the progressive gate.
- Initial authority probing was bounded: read-only SQLite inspection found 474
  workspace records, 429 `UNKNOWN_WORKSPACE`, 24 recorded dirty, and 12 expired
  owner leases. For expired leases with a PID, `/proc` showed no live matching
  process; entries without a PID remain unverified and none were reclaimed.
  Both task worktrees are owned by the live recorded PID with a matching
  process-start token. No other worktree was changed or removed.
- The authority timeout was isolated to `git fetch --no-tags origin
  +refs/heads/main:refs/remotes/origin/main`: its 3-second per-command timeout
  fired while the same fetch completed successfully in 3.07 seconds. Other
  canonical workspace status probing completed in 0.068 seconds. The fix lets
  Git commands use the remaining 15-second operation budget and has a focused
  regression test. A subsequent verify completed and returned the authoritative
  state `CONVERGENCE_PENDING` with `USER_WORKSPACE_NOT_SYNCED` and
  `USER_WORKSPACE_DIRTY`, canonical SHA `a2546d0d3fad4ed45aeb0592e783e8c70d2cc7f7`,
  and primary workspace SHA `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`.
  The primary is 584 commits behind and has 10 dirty paths; it was not synced.
