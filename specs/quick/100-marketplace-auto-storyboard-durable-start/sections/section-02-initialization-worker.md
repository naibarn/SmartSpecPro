# Section 02: Initialization Worker

## Ownership

- `apps/web/server/jobs/marketplaceAutoReviewJob.ts`
- `apps/web/server/services/marketplaceAutoReviewService.ts`
- worker/service tests

Depends on Section 01's payload and initializer contract.

## Work

1. Write failing tests for `initialize_run` dispatch and job lifecycle.
2. Replace select-then-blind-update for relevant outbox jobs with an atomic
   claim predicate and returned claimed row.
3. Heartbeat the outbox lock while initialization performs long LLM work.
4. Validate payload version and run state before calling the initializer.
5. Complete the job only after a persisted initialized/hold/terminal outcome.
6. Retry transient failures with existing bounded backoff.
7. When retry budget is exhausted, fail job, run, and current stage together.
8. Reuse the sequential runner's bounded repair passes and forward its returned
   prompt metadata into production-project construction.
9. Ensure already initialized, cancelled, or terminal runs cannot repeat work.

## Acceptance checks

- Two concurrent worker invocations cannot both claim the job.
- An active initializer extends its lock.
- Retry does not repeat completed planning/provider work.
- Successful initialization enters the existing hold or advancement path.
- Permanent prompt failure is visible through run polling.

## Risks

- Job heartbeat must be stopped in `finally`.
- Permanent versus transient classification must not retry deterministic
  validation errors.
- No placeholder content may bypass product-grounding validation.

## Implemented

- Added `initialize_run` dispatch, atomic conditional claim, expired-lock
  recovery, heartbeat, owner-checked completion/retry, and exhausted-run
  failure.
- Rehydrated worker initialization from versioned run metadata.
- Forwarded sequential prompt-plan metadata into production-project creation,
  fixing the false missing-shot-prompt failure.
