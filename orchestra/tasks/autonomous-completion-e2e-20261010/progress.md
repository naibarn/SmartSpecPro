# Progress and evidence

## Baseline

- User checkpoint: `b274a2c0`.
- Latest `origin/main` checked and fast-forwarded into this isolated worktree: `056922d71912f5bededd06d173a9e57580a9fcb9`.
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

## Verification

- `python3 -m unittest scripts.development-lifecycle.test_workspace_authority`: 50 passed.
- `python3 -m py_compile scripts/development-lifecycle/workspace_authority.py`: passed.
- `pnpm exec vitest run --maxWorkers=1 server/jobs/workspaceAuthorityGithub.test.ts server/jobs/workspaceAuthoritySafeActionJob.test.ts`: 23 passed. Used a temporary symlink to an existing dependency installation; removed it after the run.
- `git diff --check`: passed.
- Native disposable PostgreSQL exists, but no current-schema task-owned fixture is implemented or run in this checkpoint.

## Not yet proven

- GitHub PR workflow has not yet run against a pushed candidate.
- No live autonomous CI repair/conflict-resolution WorkUnit or end-to-end GitHub trial has been executed. Do not claim a completed vertical slice or production readiness from the local tests.
- No PostgreSQL DB-backed restart/lease/CAS/duplicate-dispatch trial has been run.
- Next action: fast-gate, commit/push this candidate, create a normal PR, wait for the new focused CI check, repair any candidate failure, verify exact SHA/readiness/policy, and only then merge through GitHub if checks permit. Record merge SHA, post-merge test, cleanup receipt, and remaining gaps.
