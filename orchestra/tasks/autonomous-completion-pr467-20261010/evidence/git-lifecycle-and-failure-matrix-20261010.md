# Git Lifecycle Reconciliation and Failure Matrix

Observed 2026-10-10 Asia/Bangkok. Current canonical SHA at the focused run: `37343171309688381f0c881bfbcf156545513bdd` (`origin/main`).

## GitHub lifecycle reconciliation

| Item | Result | Evidence |
|---|---|---|
| PR #471 | Merged normally; merge SHA `d72bb64b9e9e8dc326b872f6bb249126591c1642`, reachable from current main. | `gh pr view 471`; `git merge-base --is-ancestor`; PR tree was task-only and merge-tree clean. Original branch/worktree retained. |
| Old 18 ahead / 7 behind report | Stale compare snapshot. The last refreshed comparison observed 18 ahead / 33 behind because main advanced. GitHub base metadata lagged. Duplicate patch IDs explained excess history; no unrelated changed implementation files were found. | PR compare and task audit snapshots; no replacement candidate needed. |
| PR #471 CI | `build-preview`/cleanup are `SKIPPED`; nine merge-SHA jobs remain `queued` at the last API observation. | Check-runs API on `d72bb64b…`. No CI pass claim. |
| Required-check merge guard PR #504 | Merged normally at `890658e999cd3020d2944d5d7c898d5e52ec8f4f`; its exact targeted test passed 22/22. Preview/cleanup were `SKIPPED`. | [github-check-gate-20261010.md](github-check-gate-20261010.md). |
| Canonical SPEC-267 handoff PR #507 | Merged normally at `37343171309688381f0c881bfbcf156545513bdd`; Handoff refresh is in current main. Preview was `SKIPPED`. | PR #507 state and `tools.spec_handoff` writer output. |
| Protection | No branch protection required checks (HTTP 404) and no branch rulesets (`[]`) were configured at merge-time observations. No protection/review bypass was used. | GitHub REST API results. This is a time-bound observation. |
| Worktrees/branches | The PR #471 source branch/worktree and active continuation branch/worktree were retained. Primary user checkout was dirty and untouched. No unowned resource was deleted. | Workspace authority registrations and Git worktree inventory; cleanup intentionally pending because work remains active. |

## Failure-oriented evidence

| Scenario | Evidence / status |
|---|---|
| Backlog with available compatible worker | Existing worker scheduler/registry and monitor tests ran in the focused 8-file suite; 181 passed, 2 DB tests skipped. Aggregate dashboard capacity remains informational, not dispatch authority. |
| No worker has required capability | Existing worker-selection/claim tests ran in the same suite. Unsupported adapter/runtime is rejected before lease. No generic persisted `no_compatible_worker` diagnosis has been implemented. |
| Worker loss / expired lease | Existing lease fencing and reconciler recovery tests ran; focused suite passed. No live remote-worker kill was performed. |
| Dependency deadlock | Claim-time bounded scan (128 nodes) fails only a proven cycle once, requests operator review and leaves over-budget/inconclusive scans queued; independent claims remain eligible. Targeted current-main run: 10 passed, 63 name-filtered skips. |
| Git merge conflict | Real reconciliation of task branches with current canonical main completed without textual conflicts; `git merge-tree --write-tree` succeeded. A synthetic conflicting commit was not created because no safe isolated fixture was needed for the actual merge. |
| CI failure and repair | Required-check gate unit tests prove required `failure`, `pending`, `skipped`, and missing contexts block merge; 22 tests passed. Automatic CI-failure repair is not implemented. PR #471's nine queued checks are an external runner/workflow wait, not a repairable failing result. |
| Branch / worktree reconciliation | PR #471 and PR #504/#507 merges were verified by merge SHAs and ancestry. Task worktrees remain active; ownership was known, but cleanup was deferred while the task remains open. |
| Recovery after restart | Existing startup/periodic reconciler, outbox and lease recovery coverage ran in the 8-file suite. Actual process/database restart UAT was not run. `DATABASE_URL`, `API_BASE_URL`, and `RUN_DB_INTEGRATION_TESTS` were unset. |
| Ordinary work without human approval | Existing due-retry, claim, dependency-ready and non-operator-review job tests passed in the focused suites. Human/security gates remain unchanged. |
| Final verified completion | PR #471 integration, PR #504 check gate, and PR #507 handoff are verified in main; exact-main focused runs passed. Overall RFC outcome remains PARTIAL/VALIDATION_PENDING; no deployment or production-ready claim. |

Exact current-main focused verification:

- `pnpm exec vitest run server/jobs/workspaceAuthoritySafeActionJob.test.ts` — 1 file, 22 passed.
- `pnpm exec vitest run server/services/__tests__/jobControlPlane.test.ts -t 'does not claim a dependent Job|fails a dependent Job closed|fails a multi-job dependency cycle|detects a dependency cycle through|keeps oversized dependency scans|rejects a known adapter|fences stale workers|increments the business attempt once|does not auto-dispatch an operator-review retry|recovers a lease-expired story checkpoint'` — 1 file, 10 passed, 63 skipped by filter.
- Focused 8-file scheduler/reconciler/outbox/worker/monitor/router suite — 8 files, 181 passed, 2 database-dependent tests skipped.

## Benchmark and remaining boundary

No multi-machine default was enabled. A representative throughput/latency benchmark needs an isolated current-schema database and stable runner capacity; this workspace has no database/API test endpoint configured. No synthetic in-memory microbenchmark is reported as scheduler performance. Benchmark remains a precondition before enabling multi-machine execution by default.

`SKIPPED` is never equivalent to `PASSED`. Required check contexts are enforced by the merged safe-action gate; when the repository configures no required checks, the gate records `NO_REQUIRED_CHECKS_CONFIGURED` and preserves the observed check states.
