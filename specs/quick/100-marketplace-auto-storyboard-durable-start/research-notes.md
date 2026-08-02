# Research Notes

## Current flow

- `apps/web/server/routers/marketplaceCapture.ts` routes
  `startAutoStoryboardReview` into
  `startAutoStoryboardReviewForApi`.
- `apps/web/server/services/hyperframesRuntimeApiService.ts` resolves the plan
  and directly awaits `startMarketplaceAutoReviewRun`.
- `startMarketplaceAutoReviewRun` also has a direct router caller outside the
  failing API adapter. Its synchronous return semantics must remain compatible
  unless separately audited.
- `apps/web/server/services/marketplaceAutoReviewService.ts` persists the run
  and then performs concept/storyboard/prompt LLM planning before returning.
- The sequential validator can throw
  `Missing sequential shot prompt for unit ...`.
- `apps/web/server/jobs/marketplaceAutoReviewJob.ts` already scans active runs
  and processes `advance_run` and `provider_reconciliation_recovery` outbox
  jobs.
- The outbox has JSONB `payloadJson`, a unique `idempotencyKey`, retry fields,
  lock fields, and ready-state indexes. No schema migration is required.
- The worker currently selects then updates an outbox row without a conditional
  compare-and-set claim. Initialization must not inherit that concurrency race.
- The client already polls run lists while
  `optimisticAutoStoryboardStart` is true, but the mutation error handler clears
  the flag even for a lost connection.
- `apiResponseDiagnostics.ts` already recognizes HTML 524 as a likely lost
  upstream connection, but its classifier is not exposed for mutation-specific
  recovery behavior.

## Existing tests and patterns

- `server/services/__tests__/hyperframesRuntimeApiResume.test.ts` covers start
  forwarding and resume behavior.
- `server/jobs/__tests__/marketplaceAutoReviewJob.test.ts` covers outbox job
  types and worker behavior.
- `server/services/__tests__/marketplaceAutoReviewService.test.ts` covers run
  persistence and outbox behavior.
- `client/src/pages/__tests__/MarketplaceCaptureProductDetail.autoReviewPolling.test.ts`
  covers optimistic polling.
- Relevant test command:
  `npm test --workspace @smartspec/web -- <focused test files>`.

## Boundaries and risks

- Auth context is reconstructed from the stored run owner and tenant, using the
  worker's existing short-lived token pattern.
- Initialization input must be normalized, versioned, and persisted without
  secrets so worker retries are deterministic.
- Run creation, initial stages, and the initialization job must be atomic.
- Retry exhaustion must update both job and run; otherwise the UI can remain
  queued forever.
- Long LLM planning requires job-lock heartbeat.
- Old runs can only be backfilled when a complete recognized initialization
  payload exists.
- The durable enqueue entry point should share an internal acceptance primitive
  with the legacy direct start rather than silently changing every caller's
  contract.
- SocratiCode was unavailable in this session, so discovery used targeted
  source reads and searches.
