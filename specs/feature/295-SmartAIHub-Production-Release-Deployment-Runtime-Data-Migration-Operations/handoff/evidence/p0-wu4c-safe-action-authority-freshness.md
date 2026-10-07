# P0-WU-4C Safe-Action Authority Freshness Checkpoint

- Requirement scope: authenticated safe-action dispatch must use fresh authoritative Runner facts and must not select a host by database row order.
- Reproduced RED: an expired Runner workspace snapshot still queued a `worker_jobs` action; an ambiguous project/repository with no workspace selector chose the first Runner.
- Change: dispatch now requires `snapshotObservedAt <= now < snapshotExpiresAt`; missing/invalid, expired, or future observations return `WORKSPACE_ACTION_AUTHORITY_STALE`. Multiple fresh Runner IDs return `WORKSPACE_ACTION_AUTHORITY_CONFLICT`.
- Verification command: `pnpm --dir apps/web exec vitest run server/services/workspaceAuthoritySafeActions.test.ts server/jobs/workspaceAuthoritySafeActionJob.test.ts server/jobs/workspaceAuthorityAuditJob.test.ts server/services/workspaceAuthorityProjectReadModel.test.ts server/services/internalRuntimeEvidence.test.ts server/services/drizzleMigrationEvidence.test.ts server/routers/__tests__/spec226DevelopmentControl.test.ts`
- Result: 7 files, 49 tests passed. `git diff --check` passed.
- Candidate source SHA: `13266879192cf761a45a0f2a8a70d19eff3a0317`.
- Integrated `origin/main` SHA: `5a66c4ee6f09464718fdf34453a7bede2f73a0dc` (PR #189, merge commit).
- Residual boundary: no live Runner host or production deployment was exercised. P0 implementation remains partial; stale remote parity, task/provider assignment without explicit facts, and migration failed-attempt source discovery remain open.
