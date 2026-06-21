# Research: Feature 122 Video Segment Planner Multi-Shot Storyboard Review

## Research Decision

Codebase: yes. The project is an existing git repo with SocratiCode index ready (`93480` chunks, green status). The plan depends on existing Marketplace Capture, Auto Storyboard Review, Storyboard Review, media generation, and HyperFrames override contracts.

Web/current-provider research: yes, limited to official/provider-adjacent documentation because model video capabilities change quickly. The plan must treat capability values as data, not hardcoded prompt assumptions.

Testing: existing TypeScript/Vitest setup under `apps/web`. Focused tests already run with `npm --prefix apps/web test -- --run ...`; full static check uses `npm --prefix apps/web run check`.

## Codebase Findings

### Existing Baseline

Feature 118 records the current implemented flow:

- Marketplace Capture product detail starts Auto Review.
- Current storyboard plans contain 7-9 ordered shots.
- The implemented video path is per-shot: one generated clip per storyboard shot.
- `storyboard_3x3_split` produces a storyboard frame per shot.
- `video_shot_start_stop` produces start/stop frames per shot.
- Video prompts are built with `buildVideoPrompt`, `buildVideoVisualPrompt`, `videoReferenceContract`, and `buildVeo31StoryboardVideoPrompt`.

### Relevant Files And Symbols

- `apps/web/shared/hyperframes/autoPlan.ts`
  - `HyperframesAutoPlanOverrideInputSchema` already supports `audioStrategy`, `imageModel`, `videoModel`, `shotCount`, `frameStrategy`, and related overrides.
  - This is the right place to add `videoStructureMode` and optional `manualVideoGroupSize`.
- `apps/web/client/src/components/marketplaceCapture/AutoStoryboardAdvancedOverrides.tsx`
  - Already renders advanced selects for image model and video model.
  - Feature 122 should add video-structure controls here instead of creating a separate selector layer.
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
  - Owns the product detail launch flow and now passes `referenceAnchors.creativePresets`.
  - It should pass video-structure overrides and optional creative brief into `referenceAnchors` or the existing Auto override payload.
- `apps/web/server/services/marketplaceAutoReviewService.ts`
  - `buildStoryboardReviewOutput` currently maps `plan.shots` directly to clips.
  - `buildMarketplaceAutoReviewStoryboardReviewTasks` maps those clips to Storyboard Review tasks and stores derived metadata in `storyboardContext.extraParams`.
  - `buildVideoPrompt` currently remains shot-based and delegates to compact Marketplace video prompt builders.
  - Direct video generation uses `DirectVideoUnit[]` and `directVideoTasks`, so multi-shot should either extend `DirectVideoUnit` with segment lineage or add a compatible segment unit contract.
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
  - `planStoryboardVideoPromptsMutation` plans prompts for current tasks.
  - `regenerateTask` can re-compose a prompt and call `media.generateVideoAsync`.
  - Recent implementation already passes `creativePresetDirective` into prompt planning/regeneration context.
- `apps/web/shared/storyboardPromptAudio.ts`
  - Contains current shared prompt/audio helpers, including `buildVeo31StoryboardVideoPrompt`.
  - New segment prompt builder can reuse helper ideas, but the central contract should live in `apps/web/shared/videoSegmentPlanner/`.

### Recently Implemented Supporting Slice

The worktree already includes a creative-preset/audio-policy vertical slice:

- `apps/web/shared/hyperframes/autoReviewCreativePresets.ts`
- runtime and router schemas accept `referenceAnchors.creativePresets`
- Marketplace Capture product UI exposes preset families
- Marketplace Auto Review service snapshots presets, applies audio override, and carries `creativePresetDirective`
- Storyboard Review prompt planning/regeneration consumes `creativePresetDirective`

This should be treated as foundation for Feature 122. Do not duplicate preset logic inside `videoSegmentPlanner`; import or adapt it.

### Blast Radius Notes

SocratiCode reported limited import blast radius for the exact files, but the feature is operationally high risk because `marketplaceAutoReviewService.ts` is a large orchestration module. The plan must use phased implementation:

1. shared planner and tests only;
2. per-shot parity through planner;
3. persistence/Storyboard Review regeneration;
4. multi-shot preview;
5. generation behavior.

## Provider Capability Research

Official/current provider capabilities are unstable and should be represented by governed data profiles.

Observed official/provider-adjacent references:

- Google Veo/Gemini video docs: `https://ai.google.dev/gemini-api/docs/video`
  - Current docs describe Veo video generation and image-to-video usage, including first/last frame and reference image flows for supported models.
- Kling 3.0 Omni provider docs/search results point to multi-shot/15-second capabilities. Treat this as capability-profile data that must be verified at runtime before enabling generation.
- Seedance 2.0 provider docs/search results point to 2-15 second generation ranges. Thai native speech quality remains a product concern, so Thai narration should use separate TTS by default.
- xAI/Grok Imagine API surface should be treated as provider-specific and not assumed to support Feature 122 multi-shot until an enabled media model config provides capability data.

Planning implication: never infer multi-shot support from model display name alone at generation time. Use `VideoModelSegmentCapability` resolved from media model config/provider template, with conservative defaults and explicit fallback.

## Testing Patterns

Use existing commands and locations:

- Shared logic tests:
  - `apps/web/shared/**/__tests__/*.test.ts`
  - `apps/web/shared/*.test.ts`
- Server service tests:
  - `apps/web/server/services/__tests__/*.test.ts`
- Client component tests:
  - `apps/web/client/src/components/**/__tests__/*.test.tsx`
- Static check:
  - `npm --prefix apps/web run check`

Required focused commands for this feature:

```text
npm --prefix apps/web test -- --run shared/videoSegmentPlanner/__tests__/*.test.ts
npm --prefix apps/web test -- --run shared/hyperframes/__tests__/autoPlan.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts
npm --prefix apps/web test -- --run server/services/__tests__/marketplaceAutoReviewService.test.ts
npm --prefix apps/web test -- --run client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx
npm --prefix apps/web run check
```
