# Feature 141 — synthesized planning specification

This file is the deep-plan synthesis of `spec.md`, the codebase/provider research
in `claude-research.md`, and the user decision in `claude-interview.md`. The
original `spec.md` remains the product specification; this file is the planning
input and must not be treated as runtime instructions.

## Objective

Replace the Feature 136 monolithic sequential authoring path for new eligible
Marketplace Auto Review runs with a staged, bounded pipeline:

1. Story Arc Planner creates one strict 90-second story with nine ten-second Thai
   shot briefs.
2. The user approves the story plan before downstream work.
3. TypeScript deterministically compiles each shot's synopsis-direct image prompt.
4. The user reviews and approves each exact image prompt before image-provider
   reservation/submission for that shot.
5. The existing image pipeline generates and validates the shot image.
6. The user accepts/rejects each generated image before video work.
7. Shot Video Director authors one bounded prompt from the accepted image.
8. The user approves each video prompt before video-provider reservation/submission.
9. Separate TTS/audio and final render/publish work each have their own mandatory
   approval checkpoint before credit-bearing provider work.
10. Failures and retries remain shot-local and idempotent.

## Scope and compatibility

- Feature 141 applies only to new sequential runs selected by a new architecture
  flag and frozen as `planningArchitecture=staged_two_skill_v2`.
- Existing Feature 136 runs, 3x3/start-stop runs, and the already-shipped legacy
  `awaiting_plan_review` gate remain compatible and are not silently converted.
- No v2 path may call `buildGatewayCreativeAutoReviewPlan`,
  `rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill`,
  `runSequentialPromptPlanStage`, or the monolithic
  `product-review-sequential-storyboard` skill.
- Current checkout has no v2 flag, v2 skill bundle, or v2 checkpoint implementation;
  this is planned work, not a deployment claim.

## Authoritative contracts

### Pipeline state

Persist architecture/version, staged plan state, plan revision, story-plan hash,
reference manifest, per-shot image/video state, and durable human checkpoints.
Legacy `sequentialStoryboard`/`finalQc` data may be a safe compatibility projection
only. `statusDetail.state=awaiting_plan_review` and
`metadataJson.planReview` remain the legacy gate shape; v2 checkpoint state must be
architecture-aware and server-authoritative.

### Human approval checkpoints

Every checkpoint records kind, run/shot scope, state, revision, content hash,
approved hash, user, timestamp, rejection reason, estimated credits, model, and
ordered reference inputs. Required kinds:

- `story_plan`;
- `image_prompt` per shot;
- `image_result` per shot;
- `video_prompt` per shot;
- `audio_plan` when separate audio/TTS is selected;
- `final_assembly` before render/library finalization.

The default policy is `all_checkpoints_required` with no opt-out. A provider task
must be blocked if the immediately preceding checkpoint is missing, stale,
rejected, already consumed, or mismatched on hash/revision/model/references/cost/
safety. Consumption is immutable evidence attached to an otherwise `approved`
checkpoint; it is not a second client-visible checkpoint state.
The worker re-checks this immediately before reservation/submission; UI button
state is never sufficient.

### Async/idempotency

Start, edit, approval, redraft, rejection, image acceptance, retry, audio, and
render operations persist an outbox/operation before provider work and return a
pollable identifier. Mutations require expected revision/state digest and an
idempotency key. Stale requests fail closed with safe reason codes; duplicate
requests resolve to the original operation.

### Spend boundaries

Text LLM calls that create a reviewable story or prompt may consume text credits,
but no image/video/audio/render media reservation or submission occurs without
the matching approved checkpoint. Actual provider usage remains chargeable and
is recorded by stage/shot/attempt.

### Safety and projection

Product identity, claims, reference mapping, speech fit, provider capability,
prompt bounds, image fidelity, and final QA remain deterministic/server-side
checks. Normal UI receives typed safe projections only; internal directives,
hashes, storage keys, signed URLs, provider IDs, and raw errors remain restricted
artifacts.

## Required implementation surfaces

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/shared/marketplaceAutoReview/contracts.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/client/src/components/marketplaceCapture/AutoReviewPlanReviewPanel.tsx`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- `apps/web/skills/` for the two new skill bundles
- focused service/router/UI tests plus provider smoke fixtures

## Verification bar

The plan must include unit, integration, UI, provider-contract, live-smoke,
cost-regression, rollback, and legacy-resume tests. The existing four-file legacy
gate baseline is 130 passing tests. Feature 141 is not ready for rollout until
the evaluation corpus, checkpoint no-spend invariants, architecture negative-call
tests, safe projections, finalization proof, provider capability evidence, and
rollback runbook all pass.
