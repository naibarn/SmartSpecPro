# Deep-plan research — Feature 141

Date: 2026-07-26
Review mode: self-review

## Research decision

- Codebase research: required. SmartSpecPro is an existing git repository with
  the Marketplace Auto Review runtime, UI, database schema, skills, and focused
  Vitest suites.
- SocratiCode: unavailable in this runtime; targeted `rg`, symbol-oriented line
  reads, schema inspection, and focused test discovery were used as the fallback.
- Web research: required for the provider contracts named by the spec. Findings
  are limited to official OpenRouter, OpenAI, and Google documentation and are
  treated as capability references, not as a substitute for SmartSpecPro's
  versioned provider catalog.
- Testing research: existing `apps/web` uses Vitest through `pnpm exec vitest`
  and has focused service, router, component, and page tests for the legacy plan
  review gate.

## Current runtime boundaries

### Stage machine

`apps/web/server/services/marketplaceAutoReviewService.ts` currently defines:

```text
product_preflight
production_project
concept_story
prompt_plan
image_generation
storyboard_review
video_generation
audio_generation
video_edit
render
library_finalize
```

The existing plan-review gate is implemented at the `image_generation` boundary.
The run remains `running`, the image stage is blocked, and the durable state is
represented by `statusDetail.state=awaiting_plan_review` plus
`metadataJson.planReview.status=awaiting`. The stage machine already has durable
run/stage/outbox/lease/attempt/provider-event/artifact infrastructure that should
be reused by v2.

The current `startMarketplaceAutoReviewRun` snapshots tenant flags at start. The
checkout has `marketplaceSequentialStoryboard` for Feature 136 but no Feature 141
architecture flag or staged skill routing. Initial and redraft paths still call
the legacy authoring responsibilities represented by:

- `buildGatewayCreativeAutoReviewPlan`;
- `rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill`;
- `runSequentialPromptPlanStage`;
- `apps/web/skills/product-review-sequential-storyboard`.

No `staged_two_skill_v2`, `StoryArcPlanV1`, or Feature 141 skill bundle exists in
the current codebase. The implementation plan must therefore treat v2 as a new
architecture branch, not as a rename of the current sequential path.

### Existing API and UI

`apps/web/server/routers/marketplaceCapture.ts` currently exposes the legacy
plan-review operations:

- `approveAutoReviewPlanReview`;
- `requestAutoReviewPlanRedraft`;
- `updateAutoReviewPlanShotDialogue`;
- the existing run cancellation operation.

The current dialogue edit is sequential-only and writes the legacy
`sequentialStoryboard.shots[].dialogue`. There is no current v2 revisioned
checkpoint mutation for image prompts, image results, video prompts, audio, or
final assembly.

`AutoReviewPlanReviewPanel.tsx` is mounted from
`MarketplaceCaptureProductDetail.tsx`. The page uses a trimmed run list and
fetches heavy plan metadata only while a live run is held at the plan-review
gate. The current panel shows a per-shot table only for sequential runs, omits a
trustworthy 3x3/start-stop estimate, and supports legacy dialogue editing. The
v2 UI needs explicit checkpoint state, per-shot prompt approval, stale revision
handling, and reload-safe polling rather than relying on a modal's local state.

### Persistence surfaces

`apps/web/drizzle/schema.ts` already contains the relevant tables:

- `marketplaceAutoReviewRuns`: owner/tenant, lifecycle, current stage,
  architecture metadata, run idempotency key;
- `marketplaceAutoReviewStages`: unique stage rows and stage outputs;
- `marketplaceAutoReviewRunLeases`: worker ownership/heartbeat/expiry;
- `marketplaceAutoReviewStageAttempts`: attempt keys, reason codes, provider,
  credit, artifact, and evidence references;
- `marketplaceAutoReviewOutboxJobs`: durable jobs with unique idempotency keys;
- `marketplaceAutoReviewProviderEvents`: callback replay protection and
  reconciliation;
- `marketplaceAutoReviewArtifacts`: `artifactKind`, `contentHash`, storage
  references, status, and run/stage indexes.

The plan should first use JSON metadata plus these tables. A new table or
migration is not justified solely for approval checkpoints; the checkpoint
record can be persisted in the staged metadata and referenced from stage
attempt/outbox/artifact evidence. Any future schema migration must be additive,
backfillable, and rollback-documented.

## Required human approval model from the latest product decision

The user clarified that the workflow must pause for human inspection before each
downstream credit-bearing stage. The implementation plan must therefore include
the following mandatory policy:

| Checkpoint | Must be approved before |
|---|---|
| `story_plan` | Image-prompt compilation is released for the approved revision. |
| `image_prompt` per shot | Image reservation/provider submission for that shot. |
| `image_result` per shot | Video Director invocation and downstream video work. |
| `video_prompt` per shot | Video reservation/provider submission for that shot. |
| `audio_plan` | Separate TTS/audio-provider request. |
| `final_assembly` | Paid render and library-finalize/publish work. |

Each checkpoint needs a durable state, revision, content hash, approving user,
timestamp, estimated credit amount, and the exact model/reference inputs that
were approved. The worker must verify those values again immediately before
provider submission. Approval of one shot must never implicitly approve another.

Text LLM calls that author the story, repair a response, or generate a reviewable
video prompt may already consume text credits before the user can inspect their
output. The no-spend invariant applies to the next provider/media stage: no image,
video, audio, or render reservation is allowed without its own matching approval.

## Existing testing surface

`apps/web` package scripts use Vitest. Relevant existing suites include:

- `server/services/__tests__/marketplaceAutoReview.planReviewGate.test.ts`;
- `server/routers/__tests__/marketplaceCapture.planReviewGate.test.ts`;
- `client/src/components/marketplaceCapture/__tests__/AutoReviewPlanReviewPanel.test.tsx`;
- `client/src/pages/__tests__/MarketplaceCaptureProductDetail.planReviewGate.test.ts`;
- sequential pipeline, references, alternates, and shot-regeneration suites;
- `productReviewSequentialStoryboardSkill.test.ts` and runner-specific tests;
- Vertical Drama image-prompt mode tests for the synopsis-direct reference
  pattern.

The focused legacy gate command currently passes 4 files and 130 tests. These
tests are a regression baseline, not Feature 141 proof. New v2 suites must add
checkpoint, stale-hash, per-shot approval, no-preapproval-spend, architecture
negative-call, safe-projection, and end-to-end finalization coverage.

## Provider research

### OpenRouter structured outputs

OpenRouter's official structured-output documentation describes a
`response_format.type=json_schema` request with a strict JSON schema for
compatible models. It recommends checking model parameter support and using
`require_parameters=true` when the schema contract is mandatory. The plan must
therefore keep provider capability detection in the versioned catalog and fail
closed when the selected route cannot enforce the required schema.

Source: https://openrouter.ai/docs/guides/features/structured-outputs

### GPT Image 2

The official OpenAI model page identifies `gpt-image-2` as an image generation
and editing model with image input/output and the image-generation/image-edit
endpoints. It does not advertise structured outputs; image requests must remain
media-provider submissions guarded by the image-prompt checkpoint and the
compiled/submitted prompt/reference hashes. Provider limits must still be read
from SmartSpecPro's catalog at implementation time rather than copied from a
stale spec value.

Source: https://developers.openai.com/api/docs/models/gpt-image-2

### Nano Banana 2

Google's official Gemini image-generation documentation identifies Nano Banana 2
as the Gemini 3.1 Flash Image model and describes native multimodal image
generation/editing with reference inputs. The model page and image-generation
guide are current capability references, but attachment limits and provider-route
aliases must remain catalog-driven in SmartSpecPro.

Sources:

- https://ai.google.dev/gemini-api/docs/image-generation
- https://ai.google.dev/gemini-api/docs/models

## Planning implications

1. Introduce one shared checkpoint guard/transition contract used by API mutations,
   worker advancement, media submission, audio submission, and render/finalize
   paths. UI-only disabling is insufficient.
2. Keep the legacy `awaiting_plan_review` gate unchanged for Feature 136 and
   3x3/start-stop runs. v2 dispatch must be selected at creation and frozen in
   metadata.
3. Make image prompt review a per-shot checkpoint after deterministic compilation
   and before image credit reservation. A changed story, reference manifest,
   model, attachment list, cost, or safety verdict supersedes the approval.
4. Make generated image acceptance a separate per-shot checkpoint before Skill B
   or video work, so the user can reject/regenerate an image without paying for a
   downstream prompt or video task.
5. Apply the same pattern to video prompt, separate audio/TTS, and final assembly
   stages. Native video audio should not create a duplicate TTS checkpoint/charge.
6. Use explicit approval operations with idempotency keys, expected revision and
   content hash. A browser timeout or worker retry must resolve to the same
   operation and must not create a duplicate credit reservation.
7. Treat provider documentation as capability evidence only. The implementation
   must verify current model aliases, route capabilities, attachment limits,
   structured-output support, and pricing in the repository's catalog and live
   smoke harness.
