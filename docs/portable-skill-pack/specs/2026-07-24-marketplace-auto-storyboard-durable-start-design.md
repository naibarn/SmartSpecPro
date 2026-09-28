# Marketplace Auto Storyboard Durable Start Design

Date: 2026-07-24

## Problem

`marketplaceCapture.startAutoStoryboardReview` currently waits for concept,
storyboard, and prompt planning before returning. Those steps can call the LLM
gateway and exceed the public HTTP connection lifetime, producing an HTML 524
response even after a run has been persisted or work has continued.

The start path also rejects an incomplete sequential-shot plan with
`Missing sequential shot prompt for unit ...`. That failure must be recorded on
the run and surfaced through normal run polling; it must not be confused with a
transport failure or trigger a duplicate start.

## Selected Approach

Move run initialization behind the existing
`marketplace_auto_review_outbox_jobs` control plane.

The API performs validation, access checks, idempotency resolution, and a
transaction that creates the durable run, its initial stage rows, and one
`initialize_run` outbox job. It then returns the queued run immediately. The
Marketplace Auto Review worker claims `initialize_run`, performs the existing
concept/storyboard/prompt planning, persists checkpoints, and schedules the
existing `advance_run` work.

This uses the current database and worker rather than introducing a new queue
service. The trade-off is up to one worker polling interval of additional start
latency, which is acceptable because the UI already polls run state.

## Architecture and Responsibilities

### Start service

- Keep request-time validation and authorization before accepting work.
- Resolve or reuse the idempotency key before creating a run.
- Create the run in `queued` state, persist a versioned initialization intent
  in the run metadata, create its initial stage/checkpoint records, and enqueue
  one unique `initialize_run` outbox job.
- If job insertion is interrupted after the run insert, an idempotent API retry
  or the active-run scanner reconstructs the missing job from the persisted
  initialization intent without resetting a job that is already running.
- Return the persisted run without calling the LLM gateway.
- Return the existing run for a repeated idempotency key and never create a
  second initialization job.

### Initialization worker

- Add `initialize_run` to the Marketplace Auto Review outbox allowlist.
- Claim jobs with a compare-and-set update that requires a ready/retry state or
  an expired lock. This closes the current multi-worker race where selecting a
  row and updating it are separate operations.
- Heartbeat and extend the job lock during long LLM planning so another worker
  cannot reclaim the same initialization after the five-minute lock expires.
- Rehydrate the normalized start input and authenticated tenant/user context
  from persisted data.
- Run the current concept, storyboard, voiceover, and sequential prompt
  planning logic.
- Persist checkpoints before transitioning to later stages.
- Queue `advance_run` only after initialization succeeds or reaches a supported
  plan-review hold.
- Mark terminal validation failures on the run and stage with a safe user-facing
  message and structured reason code.

### Client

- Continue using the existing optimistic run-start polling.
- On a lost upstream/server-proxy response, keep polling instead of immediately
  clearing the optimistic start state because the transaction may have
  committed.
- Stop polling when the run appears, reaches a terminal state, or the bounded
  polling window expires.
- Display persisted run failures, including incomplete sequential-shot plans,
  instead of showing the raw proxy HTML.

## Data and Compatibility

Use the existing outbox table and its `jsonb` `payloadJson` column. The existing
unique index on `idempotencyKey` supplies the job-level deduplication boundary,
so no schema migration is required.

The initialization payload is versioned and contains normalized scalar inputs,
reference-anchor identifiers/URLs, transport metadata, and the resolved
feature-policy snapshot needed for deterministic execution. Secrets and bearer
tokens are not persisted. The worker creates its short-lived background token
using the stored run owner and tenant, following the existing `advance_run`
pattern.

Existing active runs remain compatible:

- runs with completed initialization continue through `advance_run`;
- old `concept_story` runs are backfilled only when their metadata contains a
  complete, recognized initialization-input version;
- old runs without a complete initialization payload remain on the existing
  resume/manual-recovery path rather than guessing missing inputs;
- terminal or cancelled runs are never reinitialized.

## Idempotency and Concurrency

- The run idempotency key remains the user-visible deduplication boundary.
- `initialize_run` uses a deterministic key:
  `marketplace-auto-review:<runId>:initialize:v1`.
- A worker lease prevents concurrent initialization.
- The outbox claim itself is atomic; the run lease/checkpoint is the second
  defense against duplicate planning or credit spend.
- Before LLM spend, the worker checks whether initialization output or a
  terminal/hold checkpoint already exists.
- Retries resume from persisted checkpoints where possible and do not repeat
  completed provider work.

## Sequential Prompt Failure Handling

The existing sequential planner already performs bounded authoring rounds and a
corrective reference-mapping retry. The initialization path must pass the final
persisted prompt-plan metadata into production-project construction; otherwise
valid prompts are invisible to the next stage and produce a false
`Missing sequential shot prompt` error.

No placeholder prompt should be silently generated because that would weaken
storyboard quality and product-grounding guarantees.

## Failure Modes

- **Job write fails after run persistence:** API retry or the active-run scanner
  recreates the deterministic job from the versioned run metadata.
- **Connection closes after commit:** retrying with the same idempotency key
  returns the existing run; client polling discovers it.
- **Worker restarts:** the leased outbox job becomes retryable and resumes from
  persisted state.
- **LLM/provider timeout:** job follows bounded retry/backoff; run remains
  observable.
- **Retry budget exhausted:** the job and run are both marked failed; the run
  receives the final safe error and reason code rather than remaining queued.
- **Permanent planning validation failure:** run and current stage become
  `failed` with a safe message and reason code.
- **Feature flag changes after acceptance:** the persisted policy snapshot
  governs the run, avoiding mid-run behavior drift.

## Verification

Add or update focused tests for:

1. API start returns after durable persistence and does not invoke planning.
2. Run and `initialize_run` job are created atomically.
3. Repeated idempotency keys return one run and one initialization job.
4. Worker claims and initializes a run, then schedules `advance_run`.
5. Concurrent workers cannot both claim the same job, and a long-running worker
   heartbeats its lock.
6. Worker retry does not repeat completed initialization work.
7. Missing sequential prompts receive one repair attempt and then persist a
   structured terminal failure when still invalid.
8. Lost-connection client errors retain optimistic polling.
9. Existing resume and plan-review-hold flows remain compatible.
10. Legacy runs are backfilled only when their initialization payload version
    is complete and recognized.

Run the focused service, worker, router/API, and client polling suites, followed
by the relevant web workspace type check if its baseline permits an attributable
result.

## Rollout

Deploy application code without a destructive migration. Verify:

- API response time is independent of LLM planning duration;
- one `initialize_run` job exists per accepted run;
- worker claims and completes initialization;
- no increase in duplicate runs or duplicate credit spend;
- eligible old active runs with a complete initialization payload receive one
  backfill job, while incomplete legacy runs remain unchanged;
- UI transitions from queued to running/hold/failed without surfacing raw 524
  HTML.

Rollback is code-only: stop producing `initialize_run` jobs and restore the
previous synchronous entry point. Existing initialization jobs must be drained
or explicitly marked cancelled before rollback to avoid mixed execution paths.
