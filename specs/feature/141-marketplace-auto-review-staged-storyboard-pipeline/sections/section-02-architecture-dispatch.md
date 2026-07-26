# Section 02 — architecture dispatch and durable operation boundary

## Purpose and scope

This section adds the Feature 141 architecture branch without altering legacy
runs. New eligible sequential Marketplace Auto Review runs may snapshot
`staged_two_skill_v2`; all resume, redraft, retry, worker, lease-recovery, and
provider paths dispatch from that persisted value. The current tenant flag is
not consulted to reinterpret an existing run.

Dependencies: Section 01 shared contracts and fixtures.

Blocks: checkpoint guard and all v2 stage implementations.

## Tests first

Write tests before production changes:

- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedArchitecture.test.ts`
  proves the v2 and gated live-smoke flags default off, start snapshots the
  architecture/version once, and the snapshot is not changed by later flag edits;
- start/resume/redraft/retry/worker/recovery fixtures prove a v2 run never calls
  `buildGatewayCreativeAutoReviewPlan`,
  `rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill`,
  `runSequentialPromptPlanStage`, or the monolithic
  `product-review-sequential-storyboard` skill;
- legacy Feature 136, 3x3/start-stop, and legacy plan-review fixtures prove the
  old dispatch and `awaiting_plan_review` projection remain selected;
- duplicate starts and duplicate mutation requests return the same operation ID
  and enqueue once;
- wrong owner/tenant, cancelled run, stale revision, wrong architecture, and
  unauthorized mutations fail without partial writes;
- lease expiry and recovery resume the frozen architecture rather than selecting
  the current flag.

`apps/web/server/routers/__tests__/marketplaceCapture.stagedCheckpoint.test.ts`
must cover the router authorization/input envelope separately from service
dispatch.

## Implementation contract

### Files

- `apps/web/shared/featureFlags.ts` adds
  `marketplaceStagedSequentialStoryboardV2` and a separately gated live-smoke
  flag, both defaulting off;
- `apps/web/server/services/marketplaceAutoReviewService.ts` owns architecture
  snapshotting, dispatch, transaction boundaries, and operation persistence;
- `apps/web/server/routers/marketplaceCapture.ts` owns caller authorization,
  input validation, and pollable operation responses;
- outbox/lease/attempt helpers remain in the Marketplace Auto Review service area;
- the two focused test files above cover service and router contracts.

### Start and dispatch rules

At start, after eligibility, capability, reference, safety, and budget preflight,
persist the architecture and version before any worker authoring. Persist the
run idempotency key, reference/evidence manifest, and a durable start operation.
The start response is asynchronous; it does not contain a provider response.

Dispatch must be explicit:

| Persisted architecture | Dispatch |
|---|---|
| `monolithic_sequential_v1` | Existing Feature 136 functions and current legacy gate. |
| `staged_two_skill_v2` | Feature 141 stages, checkpoints, and guards. |
| missing/unknown | Fail closed with a safe wrong-architecture reason. |

Resume, redraft, shot retry, worker claim, and lease recovery use the persisted
architecture. A v2 run never silently falls back to the monolith, and a legacy
run is never silently converted to v2.

### Durable operation contract

The architecture-aware router must expose or extend these operations:

- `getStagedAutoReviewCheckpointState`;
- `editStagedShot`;
- `approveStagedCheckpoint`;
- `rejectStagedCheckpoint`;
- `acceptStagedImage`;
- `retryStagedShot`.

Every mutation accepts run ID, expected plan/shot revision, state digest, and an
idempotency key. Every response returns `{ operationId, runId, stateDigest,
planRevision, status }` and returns before provider completion. Router procedures
must never accept client-supplied tenant/user ownership values.

Persist operations in the existing `marketplaceAutoReviewOutboxJobs` and related
run/stage/attempt/artifact surfaces. Do not create a parallel operation table.
The transaction must compare authorization, architecture, revision/digest,
cancellation, and idempotency before writing the operation or invalidating state.

### Authorization and failure behavior

Use the existing Marketplace Auto Review ownership/tenant checks. Wrong owner,
wrong tenant, unknown architecture, cancelled run, malformed input, and stale
state return safe reason codes with no partial state write. A proxy timeout after
the transaction is not proof of failure; retrying the same idempotency key returns
the existing operation.

## Acceptance criteria

- New v2 routing is unreachable unless its flag and all start preflight gates pass.
- The persisted architecture is immutable for normal resume/redraft/retry flows.
- No v2 code path calls the Feature 136 authoring responsibilities.
- Every mutation is authorized, revisioned, idempotent, asynchronous, and
  recoverable after a browser/network timeout.
- Existing legacy flows and tests remain unchanged in behavior.

## Handoff

Section 03 uses the operation envelope and frozen architecture to implement one
server-authoritative checkpoint/spend guard. Section 04 and later sections must
not add direct router mutations that bypass Section 03.

## Implementation record

Implementation record (updated after Sections 03–09):

- registered `marketplaceStagedSequentialStoryboardV2` and
  `marketplaceStagedSequentialStoryboardLiveSmoke` as dark-by-default tenant
  flags;
- added `resolveMarketplaceAutoReviewPlanningArchitecture` so only eligible
  sequential runs snapshot either `monolithic_sequential_v1` or
  `staged_two_skill_v2`;
- persisted the architecture/version/human-approval policy in run metadata;
- added the persisted-architecture dispatch predicate and the live staged
  worker branch. A v2 run now initializes the Story Arc checkpoint and routes
  every resume/advance through the staged pipeline; it cannot fall through to
  the legacy image scheduler.
- added staged redraft dispatch through the existing plan-redraft endpoint and
  kept the architecture snapshot immutable for normal resume/retry flows.

Tests: staged flag suite (2 tests), architecture suite (3 tests), legacy
plan-review service suite (31 tests), and the staged focused suites pass. The
service file already contained unrelated dirty-worktree edits, so it remains
intentionally unstaged until its Feature 141 hunks can be committed without
capturing those edits.
