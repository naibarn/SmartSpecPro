# Section 03 — checkpoint state machine and provider spend guard

## Purpose and scope

This is the safety-critical section. It makes every human approval durable,
revision-bound, shot-local, idempotent, and rechecked immediately before a media
provider task is reserved or submitted. UI button state and old approval flags
are never sufficient.

Dependencies: Sections 01 and 02.

Blocks: Story Arc release, image generation, image-result acceptance, video
prompt/provider work, audio/TTS, render, and library-finalize.

## Tests first

Write these before implementation:

- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedCheckpointGuard.test.ts`
  covers `not_ready`, `awaiting`, `approved`, `rejected`, and `superseded` plus
  immutable one-use consumption evidence for every checkpoint kind;
- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedSpendInvariant.test.ts`
  asserts zero image/video/audio/render reservations and zero provider tasks when
  the matching approval is absent or stale;
- missing, rejected, consumed, revision, content-hash, model, provider,
  ordered-reference, safety-verdict, and estimated-cost mismatches fail closed;
- approval for shot 1 releases only shot 1, and bulk approval creates one record
  per shot or atomically fails on any drift;
- a second worker/retry cannot consume the same approval twice;
- a stale queued job is cancelled before provider submission and records a typed
  `checkpoint_invalidated` reason;
- transaction rollback fixtures prove failed authorization/validation/provider
  preflight leaves no half-written approval or credit reservation;
- router tests prove only the authorized owner/tenant can mutate a checkpoint.

## Implementation contract

### Files

- `apps/web/server/services/marketplaceAutoReviewService.ts` implements the
  transaction helpers, checkpoint transitions, worker guard, and provider
  boundary assertions;
- `apps/web/shared/marketplaceAutoReview/stagedContracts.ts` supplies the types
  and validators from Section 01;
- `apps/web/server/routers/marketplaceCapture.ts` invokes the architecture-aware
  mutations from Section 02;
- `apps/web/drizzle/schema.ts` changes only if an additive index/field is proven
  necessary by a query/concurrency test;
- existing stage-attempt, outbox, artifact, lease, and provider-event fixtures
  are extended rather than replaced.

### Checkpoint lifecycle

Create the required checkpoint after its reviewable artifact is valid. A server
mutation carrying current content hash, plan/shot revision, authorized user,
timestamp, estimated cost, model/provider, safety verdict, and ordered reference
manifest can move it from `awaiting` to `approved`. Rejection stores a reason and
the invalidation scope. Any source edit, redraft, model/reference/cost/safety
change, retry, or downstream invalidation supersedes the approval and creates a
new revision.

The six required checkpoint kinds are:

1. `story_plan` — releases prompt compilation only;
2. `image_prompt` per shot — releases image reservation/submission for that shot;
3. `image_result` per shot — releases Shot Video Director work;
4. `video_prompt` per shot — releases video reservation/submission for that shot;
5. `audio_plan` when separate TTS/audio is selected — releases audio provider work;
6. `final_assembly` — releases paid render and library-finalize work.

Approval remains in `approved` state but is consumed once by immutable
`consumedAt`/operation evidence for the exact attempt. A retry or changed attempt
must create a new checkpoint revision and approval. Native video audio follows the
approved video path and does not create a duplicate TTS checkpoint/charge.

### Worker-side spend guard

Every worker handler must call a shared guard after claiming its outbox job and
again immediately before creating/reserving/submitting the provider task. The
guard checks architecture, run/shot scope, checkpoint state, approved hash,
revision, model/provider, ordered-reference hash, safety verdict, estimated cost,
attempt idempotency, authorization context, and cancellation. It atomically marks
the approval consumed with the operation/attempt evidence only when the task can
be created safely.

The guard is required for image, video, separate audio/TTS, paid render, and
library-finalize work. Text-only Story Arc or reviewable Video Director calls may
spend text credits to create an artifact, but they do not release media spend.

### Persistence and projections

Use staged metadata for compact authoritative state and existing stage attempts,
outbox jobs, provider events, and artifacts for operations/evidence. The legacy
`statusDetail.state=awaiting_plan_review` projection remains available where
existing clients need it, but it is not a second v2 state machine.

Return safe summary/heavy projections only. Raw prompt directives, provider IDs,
storage keys, signed URLs, and raw errors remain restricted artifacts.

## Acceptance criteria

- It is impossible for a media provider task or reservation to exist without the
  immediately preceding matching approval evidence.
- Approval is per shot, revision/hash bound, one-use, and resilient to retries,
  duplicate requests, worker races, and browser reloads.
- Every rejection/stale/drift path is durable, safe, and recoverable without
  silently advancing or charging the next stage.
- The invariant is proven in service integration tests and later live smoke.

## Handoff

Section 04 uses the `story_plan` gate. Sections 05–07 use the same guard for each
credit-bearing provider boundary. Section 08 consumes safe projections and
operation statuses; Section 09 consumes checkpoint/credit evidence and alerts.

## Implementation record

Implemented the shared checkpoint transitions, exact approval expectation,
one-use consumption evidence, state-digest optimistic concurrency, owner/tenant
authorization, idempotent outbox operation envelope, safe projections, and
worker-side provider rechecks. Image/video prompt payload hashes are recomputed
from the actual payload immediately before consumption; audio and final assembly
hashes are rechecked before their boundaries. Provider submission failures refund
the just-reserved credit idempotently and persist a correction-required state.
Shot/image/video/audio retry mutations supersede the old checkpoint or task
record and require a new approval.

Proof: `marketplaceAutoReview.stagedCheckpointGuard.test.ts` (6),
`marketplaceAutoReview.stagedCheckpointOperations.test.ts` (3), plus the
staged pipeline/legacy router suites. SocratiCode was unavailable in this
runtime, so discovery used targeted file reads and focused tests.
