# TDD Plan: Feature 122 Video Segment Planner Multi-Shot Storyboard Review

## 1. Shared Contracts And Capability Profiles

Write tests first in `apps/web/shared/videoSegmentPlanner/__tests__/contracts.test.ts` and `capabilityProfiles.test.ts`.

Test stubs:

- schema accepts a valid per-shot `VideoSegmentPlannerInput`;
- schema rejects missing shot IDs, invalid mode, invalid duration, and unknown audio strategy;
- unknown capability falls back to `supportsMultiShotPrompt: false`;
- media model config capability overrides display-name heuristics;
- MCP/gateway transport is preserved in capability output;
- provider/model display names alone cannot enable paid multi-shot generation.
- `capabilities.videoSegment` config is read as the primary capability source;
- provider-template hints can enable only conservative reviewed defaults.

## 2. Planner Core

Write tests first in `apps/web/shared/videoSegmentPlanner/__tests__/planner.test.ts`.

Test stubs:

- `per_shot` creates one segment per input shot and preserves order/duration;
- `adaptive_multi_shot` groups 9 review shots into natural adjacent groups under capability limits;
- `compact_multi_shot` produces fewer segments than adaptive when allowed;
- `manual_group_size` clamps down to `maxSubShotsPerSegment`;
- model max duration prevents overlong segments;
- reference image limit fallback produces deterministic warning;
- unsupported/unknown model returns per-shot with fallback reason;
- segment IDs are deterministic across runs.

## 3. Prompt Builder

Write tests first in `apps/web/shared/videoSegmentPlanner/__tests__/promptBuilder.test.ts`.

Test stubs:

- per-shot prompt output remains plain text and includes reference contract;
- multi-shot prompt includes timeline with sub-shot durations;
- `single_storyboard_frame`, `start_stop`, and `segment_start_end` reference modes produce distinct role text;
- `separate_tts_voiceover` forbids native speech and points to storyboard voiceover as source;
- `native_video_audio` includes concise dialogue only when capability allows native audio;
- creative preset directive appears as guidance without weakening product/character locks;
- user creative brief is included as guidance and unsafe product-claim additions are warned/omitted;
- Seedance Thai TTS guard remains present when Thai preset/brief requires speech.

## 4. Marketplace Auto Review Integration

Write tests first in `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`.

Test stubs:

- per-shot planner output produces the same count and reference modes as current Storyboard Review tasks;
- `metadataJson.videoSegmentPlan` is added in shadow/per-shot mode;
- creative presets and creative brief are passed into planner input;
- `storyboard_3x3_split` produces single storyboard-frame segment references;
- `video_shot_start_stop` produces start/stop references;
- unsupported model keeps per-shot fallback and records warning;
- direct video task refs preserve shot lineage and media history output metadata.
- `getVideoSegmentPlanPreview` returns plan, access decision, credit estimate, warnings, and fallback reason;
- preview warnings use `VideoSegmentPlanWarning[]` for planner, creative-brief, access, credit, and fallback warnings;
- preview credit estimate separates `basis` from `creditSource`;
- preview and regeneration responses do not expose provider OAuth tokens, provider session references, or signed upload URLs;
- generated output canonical URLs are SmartSpecPro stored media-history URLs, not provider temporary URLs.

## 5. Runtime Schemas And Auto Overrides

Write tests first in:

- `apps/web/shared/hyperframes/__tests__/autoPlan.test.ts`
- `apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts`
- `apps/web/client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx`

Test stubs:

- overrides schema accepts `videoStructureMode`;
- manual group size is accepted only for manual mode and within safe bounds;
- Advanced Auto overrides render video model and video structure controls;
- audio preset Thai TTS still syncs with `audioStrategy`;
- reset-to-auto removes video structure overrides;
- Thai labels fit and are accessible through `aria-label`.

## 6. Storyboard Review Integration

Write tests first in existing Storyboard Review test locations:

- `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts`
- `apps/web/server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts`
- `apps/web/shared/hyperframes/__tests__/storyboardReviewState.test.ts` if shared review-state helpers are extended.

Test stubs:

- legacy review without `videoSegmentState` synthesizes per-shot plan;
- regeneration uses stored `segmentId`, `shotIds`, frame roles, model, creative preset directive, and creative brief;
- changing creative brief marks affected prompts stale without rewriting manual prompts;
- split fallback turns one multi-shot segment into per-shot tasks preserving references;
- lost MCP access blocks generation with a clear error instead of silent gateway fallback;
- generated task metadata preserves segment/shot lineage for Media History and Video Editor projection.
- stale auto-generated prompts block paid generation until regenerated or explicitly kept;
- split fallback requires user confirmation before paid retry.

## 7. UI And Browser Evidence

Component tests first, browser evidence after implementation.

Test/evidence stubs:

- Marketplace Product advanced controls show loading, disabled, fallback warning, and success states;
- Marketplace Product preview summary comes from `getVideoSegmentPlanPreview`, not page-local planner logic;
- Storyboard Review segment badges and actions render empty/error/success states;
- mobile/tablet/desktop screenshots show no text overflow in Thai;
- keyboard path reaches video structure, manual group size, creative brief, regenerate, and split actions;
- console has no new errors on Marketplace Capture product and Storyboard Review routes.

## 8. Verification Command Set

Run focused tests after each phase:

```text
npm --prefix apps/web test -- --run shared/videoSegmentPlanner/__tests__/*.test.ts
npm --prefix apps/web test -- --run shared/hyperframes/__tests__/autoPlan.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts
npm --prefix apps/web test -- --run server/services/__tests__/marketplaceAutoReviewService.test.ts
npm --prefix apps/web test -- --run client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx
npm --prefix apps/web run check
```
