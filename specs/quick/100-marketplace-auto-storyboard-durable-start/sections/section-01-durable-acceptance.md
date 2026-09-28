# Section 01: Durable Acceptance

## Ownership

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- related service/API tests

Do not edit worker or client behavior in this section.

## Work

1. Write failing tests for short start, atomic run/stage/job persistence, and
   idempotent reuse.
2. Define a versioned, runtime-validated initialization payload without tokens
   or secrets.
3. Extract one internal acceptance primitive and the current expensive planning
   body behind a worker-callable initialization function.
4. Keep authorization, feature gates, normalized input, deterministic
   idempotency, preflight, and policy snapshot in acceptance.
5. Persist versioned initialization intent on the queued run, then create
   initial stages and the deterministic `initialize_run` job.
6. Self-heal a missing job from API idempotency recovery and the active-run
   scanner without resetting an existing job.
7. Add a durable enqueue entry point for the API adapter and return the queued
   run without awaiting planning.
8. Preserve the separate direct `startMarketplaceAutoReviewRun` behavior by
   composing the shared acceptance and initialization primitives.

## Acceptance checks

- A mocked planning gateway is not called during API start.
- A persisted run with a missing job is repaired idempotently.
- Repeated idempotency key returns the existing run and one job.
- Existing resume and plan hash behavior remains unchanged.
- Existing direct-start router response behavior remains unchanged.

## Risks

- Moving builders across the persistence boundary can change generated plans.
  Keep the existing planning sequence intact behind the new function.
- Product preflight may legitimately block before job creation; preserve its
  current no-credit behavior.

## Implemented

- Added a durable enqueue entry point used only by Auto Storyboard API.
- Persisted versioned initialization intent and deterministic job identity.
- Added API-retry and active-scanner recovery for a missing job.
- Preserved the direct-start entry point.
