# SPEC-224 thread observability regression recheck — 2026-10-29

Source: `731ac46ebb62f9775b98947edcf9d5f248662b83` (`origin/main`).

## Closed source/test defect

The PostgreSQL Thread and Task Observability integration tests previously failed because the Vitest worker did not define the test signing secret captured by the cursor/snapshot service modules. Added a test-only `JWT_SECRET` to the Vitest environment. The signed cursor and snapshot validation remains enabled; no runtime authentication or signing policy was weakened.

Verification: `pnpm exec vitest run server/services/__tests__/conversationThreadPostgres.integration.test.ts server/services/__tests__/taskObservabilityPostgres.integration.test.ts --reporter=dot` — 2 files passed, 12/12 tests.

## Live boundary

Read-only inspection of `smartspec_dev` found tenant `tenant-001` and zero `approval_requests` and `worker_jobs` for that tenant. There is no real Goal/Run/Job to resume; no approval or execution was fabricated. SPEC-224 remains incomplete until an authenticated owner starts and authorizes an actual Goal, then genuine Runner receipts, automatic phase continuation, settlement, and independent Final Verify are observed.

The browser-control sidecar was unavailable in this session. No hosted authenticated UI acceptance is claimed.
