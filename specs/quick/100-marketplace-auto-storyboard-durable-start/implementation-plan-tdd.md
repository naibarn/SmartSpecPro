# TDD Plan

## Red

1. Add service tests proving start returns a queued run without invoking the
   planning gateway and records recoverable initialization intent plus
   `initialize_run`.
2. Add idempotency tests proving repeated starts produce one run/job.
3. Add worker tests for initialization dispatch, conditional claim, heartbeat,
   retry, exhausted failure, and already-initialized no-op.
4. Add sequential-plan tests for one repair and structured terminal failure.
5. Add diagnostics/client tests proving lost-upstream errors preserve polling
   while definitive errors clear it.

## Green

Implement the smallest extraction and worker dispatch required to satisfy each
test group in section order. Reuse existing builders, persistence helpers,
leases, status-copy helpers, and polling constants.

## Refactor

- Keep normalized initialization payload types and validation near the service
  boundary.
- Keep worker orchestration separate from planning implementation.
- Avoid duplicating the synchronous planner body; move it behind one callable
  initialization function.
- Review every retry boundary for duplicate provider/credit work.

## Focused verification

Run:

`npm test --workspace @smartspec/web -- server/services/__tests__/marketplaceAutoReviewService.test.ts server/services/__tests__/hyperframesRuntimeApiResume.test.ts server/jobs/__tests__/marketplaceAutoReviewJob.test.ts client/src/pages/__tests__/MarketplaceCaptureProductDetail.autoReviewPolling.test.ts`

Add new focused test files to the same command if the implementation separates
the initialization and diagnostics contracts.
