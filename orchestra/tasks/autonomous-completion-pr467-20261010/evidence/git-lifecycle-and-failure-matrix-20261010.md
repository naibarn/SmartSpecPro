# Git Lifecycle Reconciliation and Failure Matrix

Observed 2026-10-10 Asia/Bangkok. Current canonical SHA at this report refresh: `e67aeaf86f81ea2645188536c3e58ec7282af662` (`origin/main`).

## GitHub lifecycle reconciliation

| Item | Result | Evidence |
|---|---|---|
| PR #471 | Merged normally; merge SHA `d72bb64b9e9e8dc326b872f6bb249126591c1642`, reachable from current main. | `gh pr view 471`; `git merge-base --is-ancestor`; PR tree was task-only and merge-tree clean. Original branch/worktree retained. |
| Old 18 ahead / 7 behind report | Stale compare snapshot. The last refreshed comparison observed 18 ahead / 33 behind because main advanced. GitHub base metadata lagged. Duplicate patch IDs explained excess history; no unrelated changed implementation files were found. | PR compare and task audit snapshots; no replacement candidate needed. |
| PR #471 CI | Preview/cleanup are `SKIPPED` (not passed). On merge SHA `d72bb64b…`, six jobs completed successfully, `turbo_build` and `python` failed, and `smartspecweb` remained in progress at the latest observation. The build job reported broad type errors; none pointed to the PR #471 added lines, and its `jobControlPlane.ts` diagnostics point to unchanged sections. Python failed collection on eight import errors for absent modules, then reported 18.37% coverage. | Check-runs/log API snapshot for run `38037427821`; no local full check was run. CI remains incomplete and is not called passed. |
| Required-check merge guard PR #504 | Merged normally at `890658e999cd3020d2944d5d7c898d5e52ec8f4f`; its exact targeted test passed 22/22. Preview/cleanup were `SKIPPED`. | [github-check-gate-20261010.md](github-check-gate-20261010.md). |
| Canonical SPEC-267 handoff PR #507 | Merged normally at `37343171309688381f0c881bfbcf156545513bdd`; Handoff refresh is in current main. Preview was `SKIPPED`. | PR #507 state and `tools.spec_handoff` writer output. |
| Capability-aware claim scan PR #516 | Merged normally at `f706b573873484c90af08e265ac2dfd98d14325a`; exact merge-SHA focused suite passed 205 tests across 9 files, with 2 DB-dependent skips. | `capability-aware-claim-scan-20261010.md`; the scan uses existing worker claim CAS/lease fencing. |
| SPEC-267 evidence refresh PR #520 | Merged normally at `35947a6d5bd1716919110a1f5f512e17cbe77bd6`; SPEC-267 handoff validates with no structural errors and remains non-completion-eligible. Preview/cleanup are `SKIPPED`. | PR #520, `spec_handoff validate`, and canonical requirement ledger. |
| Protection | No branch protection required checks (HTTP 404) and no branch rulesets (`[]`) were configured at merge-time observations. No protection/review bypass was used. | GitHub REST API results. This is a time-bound observation. |
| Worktrees/branches | The PR #471 source branch/worktree and active continuation branch/worktree were retained. Primary user checkout was dirty and untouched. No unowned resource was deleted. | Workspace authority registrations and Git worktree inventory; cleanup intentionally pending because work remains active. |

## Failure-oriented evidence

| Scenario | Evidence / status |
|---|---|
| Backlog with available compatible worker | Capability-aware worker claim pagination advances beyond the first 10 incompatible jobs; exact PR #516 merge-SHA suite passed 205 tests across 9 files, with 2 DB tests skipped. The aggregate dashboard signal remains informational; actual advancement occurs through the existing authenticated worker claim and CAS/lease path. |
| No worker has required capability | Existing worker-selection/claim tests ran in the same suite. Unsupported adapter/runtime is rejected before lease. No generic persisted `no_compatible_worker` diagnosis has been implemented. |
| Worker loss / expired lease | Existing lease fencing and reconciler recovery tests ran; focused suite passed. No live remote-worker kill was performed. |
| Dependency deadlock | Claim-time bounded scan (128 nodes) fails only a proven cycle once, requests operator review and leaves over-budget/inconclusive scans queued; independent claims remain eligible. Targeted current-main run: 10 passed, 63 name-filtered skips. |
| Git merge conflict | Real reconciliation of task branches with current canonical main completed without textual conflicts; `git merge-tree --write-tree` succeeded. A synthetic conflicting commit was not created because no safe isolated fixture was needed for the actual merge. |
| CI failure and repair | Required-check gate unit tests prove required `failure`, `pending`, `skipped`, and missing contexts block merge; 22 tests passed. PR #471 checks now show two non-required failures (broad TypeScript errors in unchanged paths; Python collection errors for absent modules) and one long-running web job. No failure was attributed to the PR #471 added lines; automatic CI repair is not implemented. `SKIPPED` preview jobs are not passes. |
| Branch / worktree reconciliation | PR #471, #504, #507, #509, #516, and #520 merges were verified by merge SHA and ancestry. Task worktrees remain active; ownership is known, but cleanup is deferred while the task remains open. |
| Recovery after restart | Existing startup/periodic reconciler, outbox and lease recovery coverage ran in the 8-file suite. Actual process/database restart UAT was not run. `DATABASE_URL`, `API_BASE_URL`, and `RUN_DB_INTEGRATION_TESTS` were unset. |
| Ordinary work without human approval | Existing due-retry, claim, dependency-ready and non-operator-review job tests passed in the focused suites. Human/security gates remain unchanged. |
| Final verified completion | PR #471 implementation, PR #504 safe-check gate, PR #516 claim advancement, and PR #520 SPEC-267 ledger update are integrated. Focused runs passed; overall RFC outcome remains PARTIAL/VALIDATION_PENDING, merge-SHA CI remains incomplete, and no deployment or production-ready claim is made. |

Exact current-main focused verification:

- `pnpm exec vitest run server/jobs/workspaceAuthoritySafeActionJob.test.ts` — 1 file, 22 passed.
- `pnpm exec vitest run server/services/__tests__/jobControlPlane.test.ts -t 'does not claim a dependent Job|fails a dependent Job closed|fails a multi-job dependency cycle|detects a dependency cycle through|keeps oversized dependency scans|rejects a known adapter|fences stale workers|increments the business attempt once|does not auto-dispatch an operator-review retry|recovers a lease-expired story checkpoint'` — 1 file, 10 passed, 63 skipped by filter.
- Focused 8-file scheduler/reconciler/outbox/worker/monitor/router suite — 8 files, 181 passed, 2 database-dependent tests skipped.
- Exact PR #516 merge-SHA suite — 9 files, 205 passed, 2 database-dependent tests skipped (see the linked claim-scan evidence for the command).

## Benchmark and remaining boundary

No multi-machine default was enabled. A representative throughput/latency benchmark needs an isolated current-schema database and stable runner capacity; this workspace has no database/API test endpoint configured. No synthetic in-memory microbenchmark is reported as scheduler performance. Benchmark remains a precondition before enabling multi-machine execution by default.

`SKIPPED` is never equivalent to `PASSED`. Required check contexts are enforced by the merged safe-action gate; when the repository configures no required checks, the gate records `NO_REQUIRED_CHECKS_CONFIGURED` and preserves the observed check states.
