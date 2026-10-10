# Progress and evidence

## Baseline

- User checkpoint: `b274a2c0`.
- Initial `origin/main` checked and fast-forwarded into this isolated worktree: `056922d71912f5bededd06d173a9e57580a9fcb9`; latest checked and reconciled: `06021cdcfef7f91508576d2261776de20beb59ac`.
- PR #528–530 are included in that baseline. Dirty primary checkout and all other worktrees were left unchanged.
- GitHub reports no branch protection for `main` and no repository rulesets. `.github/workflows/ci.yml` only runs on `push: main` or `workflow_dispatch`; it does not run on PRs. A focused PR workflow is added in this task so its changes can receive real CI evidence before any merge.

## Implemented in task worktree

- Workspace authority Git commands now honor a resolver-only 15 second deadline and individual command cap; SQLite lock wait also honors the remaining deadline.
- Foreign/unregistered/active worktrees are skipped before their status is read. Discovery is capped at 16 linked worktrees and records partial/failed outcomes. Registry corruption yields `AUTHORITY_UNAVAILABLE` without rebuilding its content.
- Removed the second full `git status` observation from inside the SQLite write transaction; retain path, identity, Git-dir and HEAD race checks.
- GitHub remote parsing reads the promisified `{ stdout }` result. PR list facts are enriched only for same-repository candidates with bounded batches and exact current head/base checks; unknown readiness stays excluded.
- Restart recovery now requests `mergedAt` and `mergeCommit` from `gh pr view`.
- Safe retirement now requires successful dry-run before apply. Automated post-merge cleanup no longer depends on a clean canonical user checkout; the retirement tool independently checks task ownership, integration, clean state, and generation.
- Added a bounded pull-request CI workflow for the Python resolver suite and focused web safe-action/adapter tests.
- Added lease fencing immediately before GitHub merge, convergence, recovery, and retirement side effects; the canonical worker executor supplies the live lease assertion callback.

## Verification

- `python3 -m unittest scripts.development-lifecycle.test_workspace_authority`: 50 passed.
- `python3 -m py_compile scripts/development-lifecycle/workspace_authority.py`: passed.
- `pnpm exec vitest run --maxWorkers=1 server/jobs/workspaceAuthorityGithub.test.ts server/jobs/workspaceAuthoritySafeActionJob.test.ts`: 23 passed for PR #536; 24 passed after lease-fencing changes. Used a temporary symlink to an existing dependency installation; it will be removed before finishing.
- `pnpm exec esbuild server/services/jobExecutorRegistry.ts --format=esm --platform=node`: passed after wiring the lease assertion callback.
- Added explicit tests for list-API mergeability omission, per-PR detail enrichment, and stale head rejection; the combined targeted Vitest suite is now 26/26.
- `git diff --check`: passed.
- Native disposable PostgreSQL exists, but no current-schema task-owned fixture is implemented or run in this checkpoint.

## Not yet proven

- PR [#536](https://github.com/naibarn/SmartSpecPro/pull/536) merged normally at `6d3b74a733d891538ca25e0347b3fef3cfc92ad0`; `git merge-base --is-ancestor` confirmed the PR head is in `origin/main`. Its focused PR workflow succeeded (`38043402003`). `build-preview` was `SKIPPED`, not passed. GitHub reported no branch protection/rulesets, no required review, and `mergeStateStatus=CLEAN` before merge.
- Full post-merge CI was queued at SHA `6d3b74a733d891538ca25e0347b3fef3cfc92ad0` as run `38043542429`; it was still queued at last observation. An unrelated migration workflow also showed failure with no jobs/log; the same failure existed on the prior main SHA. It is not treated as candidate CI success or failure.
- No live autonomous CI repair/conflict-resolution WorkUnit or full plan-to-cleanup trial has been executed. Do not claim the requested vertical slice is complete or production ready.
- No PostgreSQL DB-backed restart/lease/CAS/duplicate-dispatch trial has been run.
- Next action: fast-gate, push the lease-fencing follow-up as a normal PR, wait for focused CI, merge only if GitHub readiness/policy allow, then continue CI repair/DB fixture work and record exact-SHA verification and cleanup evidence.
