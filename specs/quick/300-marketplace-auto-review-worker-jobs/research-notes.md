# Research Notes

## Current flow

- `startMarketplaceAutoReviewDraftQualityQc` and repair persist `creativeQc.status=queued`, then call `upsertMarketplaceAutoReviewOutboxJob` with `jobType=draft_quality_qc`.
- `marketplaceAutoReviewJob.ts` polls the feature-specific `marketplace_auto_review_outbox_jobs` table and directly invokes QC, initialization and run advancement. The current “กำลังรอคิวตรวจ” UI reflects this domain status; it does not prove a canonical `worker_jobs` admission.
- `marketplaceAutoReviewStagedCheckpointRouterService.ts` also has request-path LLM calls for story redraft and per-shot prompt generation. Its shared mutation helper persists a feature-local outbox row after running the mutation callback.
- Other staged state reads can launch `advanceMarketplaceAutoReviewRun` with a fire-and-forget call. `queueMarketplaceAutoReviewAdvance` uses an in-process timer, and the legacy scheduler directly advances active runs.
- The run and stage metadata remain the domain source of truth; it already supports polling every four seconds and includes `creativeQc` status.

## Existing canonical patterns

- `createFeature186VerticalDramaJobRef` wraps `createControlPlaneJob`, which atomically creates `worker_jobs` and its canonical dispatch outbox, with idempotency, durable admission and bounded execution deadlines.
- `jobExecutorRegistry.ts` registers typed long jobs and can wrap domain execution with lease heartbeats.
- `POSTGRES_NODE_JOB_TYPES` is the allowlist for Node worker execution.
- Canonical jobs require an authenticated server context, tenant and requester binding. Executor input must be bounded and avoid raw credentials; execution reloads the domain run under the bound owner.
- Existing `marketplaceAutoReviewOutboxJobs` rows may already be queued in the development database and need a compatibility/recovery path during cutover.

## Relevant validation surfaces

- `apps/web/server/services/__tests__/` Marketplace Auto Review service and staged checkpoint tests.
- `apps/web/server/jobs/__tests__/marketplaceAutoReviewJob.test.ts` for old scheduler behavior.
- `apps/web/server/services/__tests__/feature186VerticalDramaJobAdapter.test.ts` for canonical admission behavior.
- `apps/web/client/src/components/marketplaceCapture/__tests__/StagedCheckpointReviewPanel.test.tsx` for user-visible QC status and approval gating.

## Risks

- Duplicate execution if the feature-local scheduler and canonical worker both run an operation; cutover must ensure only one executor owns new work.
- State could be left queued if run state commits but job admission fails; enqueue errors must make a visible recoverable state.
- Existing pending local-outbox rows must be translated with stable idempotency and retained run/user/tenant identity.
- In-flight LLM operations must keep existing credit reservations, checkpoint gates, run revision checks and failure/refund behavior.
- Do not expose raw LLM/provider errors, bearer tokens or internal job diagnostics in the customer UI.
