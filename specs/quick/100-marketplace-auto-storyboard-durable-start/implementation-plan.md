# Implementation Plan

## Objective

Make Marketplace Auto Storyboard start a short, durable API operation. Persist a
queued run and initialization job atomically, let the worker perform planning,
and ensure the client recovers correctly from ambiguous proxy failures.

## Current-codebase fit

The repository already has a Marketplace Auto Review outbox, interval/external
worker modes, run/stage checkpoints, short-lived background auth, idempotency,
and optimistic client polling. The implementation extends those control-plane
patterns rather than adding infrastructure.

## Implementation approach

### 1. Extract durable acceptance and initialization

Extract an internal request-time acceptance primitive plus an exported worker
initialization path. Add a durable enqueue entry point used by
`startAutoStoryboardReviewForApi`. Preserve the separate direct
`startMarketplaceAutoReviewRun` caller's current semantics by composing the
same acceptance primitive with inline initialization until that route is
separately audited. Acceptance retains access checks, feature/capability checks,
normalization, product preflight, idempotency, and durable initialization
intent. Expensive concept/storyboard/voiceover and sequential prompt planning
moves behind the initialization boundary. A deterministic job is created
immediately; API idempotency recovery and the active-run scanner self-heal a
missing job without disturbing a queued/running/completed one.

Persist a versioned initialization payload that contains normalized inputs and
policy snapshots. The worker validates the payload version and run state before
spending credits or calling the LLM. The failing Auto Storyboard API receives
the queued-run contract; the legacy direct start and resume behavior remain
unchanged.

### 2. Extend the outbox worker safely

Recognize `initialize_run`, atomically claim one ready/retry/expired-lock job,
heartbeat its lock during planning, and dispatch to the initialization service.
On success, complete the job and allow the initialized run to schedule or enter
the existing `advance_run`/plan-review flow.

On retryable failures, preserve bounded backoff. On exhausted or permanent
validation failures, update job, run, and current stage consistently with safe
copy and a structured reason. Skip terminal/cancelled/already-initialized runs.

### 3. Repair sequential output and client recovery

Reuse the sequential planner's existing bounded authoring and mapping-repair
passes. Forward the final prompt-plan metadata into production-project
construction so valid sequential prompts are available to its unit builders.

Expose a reusable lost-upstream error classifier from the diagnostics module.
For this mutation only, keep optimistic polling active on an ambiguous lost
connection and show recovery copy; clear it for definitive client/server
validation failures. Existing run polling remains the source of truth.

## Affected modules

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/jobs/marketplaceAutoReviewJob.ts`
- `apps/web/client/src/lib/apiResponseDiagnostics.ts`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- focused service, worker, API, diagnostics, and client tests

No router or schema edit is expected unless tests expose a missing contract.

## Risks and mitigations

- Duplicate LLM/credit spend: atomic claim, deterministic job key, run
  checkpoint check, and heartbeat.
- Partial persistence: versioned intent plus idempotent API/scanner job repair.
- Stuck queued run: exhausted retries also fail run/stage.
- Feature drift: persist the resolved policy snapshot at acceptance.
- Legacy data: only backfill payload versions that can be fully validated.
- UI duplicate start: retain idempotency and continue polling ambiguous starts.

## Acceptance criteria

- Start response no longer waits for LLM planning.
- Exactly one run and one `initialize_run` job exist per idempotency key.
- Worker initialization survives retry/restart without duplicate completed work.
- Missing sequential prompts are repaired once or fail visibly with affected
  unit IDs.
- HTML 524/lost-connection errors keep run polling active.
- Existing resume, plan-review hold, and later-stage advancement tests pass.
- The separate direct-start route retains its existing response semantics.
- No migration, new dependency, or production mutation is introduced.

## Verification and rollout

Run focused Vitest files first, then the web type check if baseline output can
be attributed. Inspect scoped diffs and run formatting/diff checks. Do not
deploy in this task. A later deployment should verify API latency, job
deduplication, worker claims, run transitions, and absence of duplicate credit
spend.
