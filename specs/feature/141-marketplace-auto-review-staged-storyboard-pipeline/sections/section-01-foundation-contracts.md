# Section 01 — foundation contracts and fixtures

## Purpose and scope

This section establishes the shared vocabulary and immutable fixtures for Feature
141. It is the first implementation unit for the future
`staged_two_skill_v2` Marketplace Auto Review architecture. It must not change
runtime routing or create provider work. Existing Feature 136, 3x3/start-stop,
and the shipped legacy `awaiting_plan_review` behavior remain the regression
baseline.

The product rule is strict: story approval, each image prompt approval, each
image-result acceptance, each video prompt approval, separate audio/TTS approval,
and final assembly approval are separate durable checkpoints. The shared types
must make it difficult for later sections to omit one.

## Dependencies and outputs

Dependencies: none beyond the current repository contracts and Vitest setup.

Blocks: architecture dispatch, checkpoint guard, all skill/media stages, UI, and
rollout evidence.

Outputs:

- canonical staged metadata/checkpoint types;
- safe reason-code and state-transition validators;
- deterministic nine-shot/90-second fixtures;
- provider-independent test helpers and legacy regression command.

## Tests first

Create the test stubs before implementation:

- `apps/web/shared/__tests__/marketplaceAutoReviewStagedContracts.test.ts`
  validates required metadata, checkpoint kinds/scopes, states, revision/hash
  fields, actor/timestamp, estimated credits, model, safety, and ordered
  reference-manifest fields;
- transition fixtures prove `not_ready → awaiting → approved`, immutable
  one-use consumption evidence, and rejection/supersession paths, while rejecting
  approval from the wrong state;
- a nine-shot fixture proves exactly nine shots, ten seconds per shot, and 90
  seconds total, with continuous Thai dialogue fields present;
- a bulk-approval fixture proves one approval record is required per shot and
  rejects atomically if any item has a stale revision/hash;
- safe-reason fixtures reject raw provider HTML, signed URLs, internal prompt
  markers, and unbounded provider error text;
- `apps/web/shared/__tests__/marketplaceAutoReviewContracts.test.ts` and the
  four existing legacy plan-review suites remain green.

Run the baseline from `apps/web`:

```text
pnpm exec vitest run \
  server/services/__tests__/marketplaceAutoReview.planReviewGate.test.ts \
  server/routers/__tests__/marketplaceCapture.planReviewGate.test.ts \
  client/src/components/marketplaceCapture/__tests__/AutoReviewPlanReviewPanel.test.tsx \
  client/src/pages/__tests__/MarketplaceCaptureProductDetail.planReviewGate.test.ts
```

Expected baseline before Feature 141 implementation: four files and 130 tests.

## Implementation contract

### Files

- `apps/web/shared/marketplaceAutoReview/contracts.ts` remains the shared
  compatibility entry point;
- add `apps/web/shared/marketplaceAutoReview/stagedContracts.ts` for the v2
  metadata, checkpoint, operation, safe projection, and reason-code contracts;
- add `apps/web/shared/marketplaceAutoReview/stagedFixtures.ts` for safe
  versioned test fixtures and immutable fixture builders;
- add the focused shared test file named above;
- add safe fixture metadata under
  `specs/feature/141-marketplace-auto-review-staged-storyboard-pipeline/fixtures/`.

### Canonical types

The v2 metadata must contain:

- `planningArchitecture: "staged_two_skill_v2"`;
- `planningArchitectureVersion: 1`;
- `humanApprovalPolicy: "all_checkpoints_required"`;
- the API-compatible `planReview` envelope with plan revision, approved revision,
  redraft count, and last operation ID;
- `stagedSequentialStoryboard` containing story status, reference manifest,
  per-shot state, hashes, media references, and `reviewCheckpoints`.

Each `HumanApprovalCheckpointV1` must include checkpoint ID, kind, run/shot
scope, shot ID when applicable, state, revision, content hash, approved hash,
approver, timestamp, rejection reason, estimated credits, approved model,
provider, safety verdict, and ordered reference-manifest hash. If a later
section needs more detail, it extends this contract deliberately rather than
silently creating a second shape.

Required kinds are `story_plan`, `image_prompt`, `image_result`, `video_prompt`,
`audio_plan`, and `final_assembly`. `audio_plan` is created only when separate
TTS/audio is selected; native video audio must not create a duplicate charge.

### Validation and compatibility

Validators must be pure where possible and must distinguish invalid input from a
valid but not-yet-ready checkpoint. They must never trust browser booleans as
approval evidence. `stagedSequentialStoryboard.storyPlanStatus` is authoritative
for v2; `statusDetail.state=awaiting_plan_review` and `metadataJson.planReview`
remain compatibility projections for existing clients.

No new database table is created here. Later implementation may use existing JSON
metadata and artifact references. A schema/index change is allowed only when a
concrete query/concurrency test proves JSON cannot safely represent it, and must
be additive with rollback/backfill evidence.

## Acceptance criteria

- A new implementation can import one canonical v2 contract module rather than
  inventing checkpoint names or state shapes.
- Every required approval kind is represented in the type and fixture corpus.
- Hash/revision/model/reference/safety/cost drift is representable and testable.
- Existing legacy tests pass without changing legacy semantics.
- No provider adapter, queue job, credit reservation, or runtime flag is enabled
  by this section.

## Handoff

Section 02 consumes these types to freeze architecture and define durable
operations. Section 03 consumes the same checkpoint type to implement the sole
server-side spend guard. No later section may add a parallel checkpoint enum.

## Implementation record

Implemented:

- `apps/web/shared/marketplaceAutoReview/stagedContracts.ts` with the v2
  architecture/checkpoint enums, Zod contracts, approval-match guard, nine-shot
  validator, and deterministic approval idempotency key;
- `apps/web/shared/marketplaceAutoReview/stagedFixtures.ts` with checkpoint and
  nine-shot fixtures;
- `apps/web/shared/__tests__/marketplaceAutoReviewStagedContracts.test.ts` with
  eight focused tests, including one-use consumption and scope validation.

Verification: the focused staged contract plus existing shared contract and
Feature 136 flag suites pass (`3 files, 40 tests`). SocratiCode was unavailable
in this runtime, so discovery used targeted repository reads and focused tests.
