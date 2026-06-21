# Implementation Plan: Feature 122 Video Segment Planner Multi-Shot Storyboard Review

## 1. Objective

Build a reusable `videoSegmentPlanner` for SmartSpecPro that turns storyboard shots into video generation segments. The first production caller is Marketplace Capture Auto Storyboard Review and Storyboard Review regeneration. The implementation must preserve current per-shot behavior first, then enable model-capability-gated multi-shot planning.

This plan builds on the already implemented creative preset/audio-policy slice. Do not duplicate preset logic; consume the shared preset registry and directive helpers.

## 2. Baseline To Preserve

Preserve:

- current Marketplace Capture Auto Storyboard Review start flow;
- current `storyboard_3x3_split` and `video_shot_start_stop` frame strategies;
- current one-task-per-shot Storyboard Review behavior when effective mode is `per_shot`;
- current media generation, media history, downloaded output handling, MCP transport metadata, and credit behavior;
- current Thai separate TTS semantics where storyboard `voiceoverScript` and each `shot.voiceover` are the single spoken source.

## 3. Architecture

Target flow:

```text
MarketplaceCaptureProductDetail
  -> Hyperframes Auto overrides and creative brief/presets
  -> startAutoStoryboardReview
  -> marketplaceAutoReviewService
  -> videoSegmentPlanner.planVideoSegments
  -> videoSegmentPlanner.buildVideoSegmentPrompt
  -> buildStoryboardReviewOutput
  -> createStoryboardReview
  -> StoryboardReviewPage regenerate/generate through stored segment state
```

New shared module:

```text
apps/web/shared/videoSegmentPlanner/
  contracts.ts
  capabilityProfiles.ts
  planner.ts
  promptBuilder.ts
  legacySynthesis.ts
  index.ts
  __tests__/
```

The module must be framework-independent. It should not import React, tRPC, database code, or Marketplace-only services.

## 4. Data Contracts

Create shared contracts in `contracts.ts`:

- `VideoSegmentStructureMode`
- `VideoModelSegmentCapability`
- `VideoSegmentPlannerInput`
- `VideoSegmentPlannerShot`
- `VideoSegmentPlan`
- `VideoSegment`
- `VideoSegmentSubShot`
- `VideoSegmentCreativeBrief`
- `VideoSegmentWarning`
- `VideoSegmentPlanWarning`

Important fields:

- `sourceSurface`
- `mode`
- `effectiveMode`
- `manualGroupSize`
- `videoModelId`
- `transport`
- `provider`
- `audioStrategy`
- `referenceMode`
- `creativeBrief`
- `creativePresets`
- `segments[].shotIds`
- `segments[].referenceImageUrls`
- `segments[].startFrameUrl`
- `segments[].stopFrameUrl`
- `segments[].subShots`
- `fallbackReason`
- `warnings`

Use zod schemas and exported TypeScript types, following `apps/web/shared/hyperframes/autoPlan.ts` style.

## 5. Capability Profiles

Create `capabilityProfiles.ts` with conservative defaults and helpers:

- `UNKNOWN_VIDEO_SEGMENT_CAPABILITY`: no multi-shot support, max 1 sub-shot.
- `resolveVideoModelSegmentCapability(input)`: accepts model ID, provider, transport, optional media model config metadata.
- `capabilityFromMediaModelConfig(config)`: reads structured capability data when available.

Do not infer final capability solely from display name. Name heuristics may provide a warning-level fallback only when no config exists, and must default to per-shot for generation.

Add optional metadata keys to media model config planning:

```text
capabilities.videoSegment.supportsMultiShotPrompt
capabilities.videoSegment.maxDurationSeconds
capabilities.videoSegment.recommendedDurationSeconds
capabilities.videoSegment.maxSubShotsPerSegment
capabilities.videoSegment.maxReferenceImagesPerSegment
capabilities.videoSegment.promptDialect
capabilities.videoSegment.repairGranularity
```

Capability source priority:

1. structured media model config metadata, preferably `capabilities.videoSegment`;
2. provider-template hints for known MCP templates, only as conservative defaults;
3. display-name heuristics for warnings/suggestions only.

Paid multi-shot generation must require source 1 or an explicitly reviewed provider-template default from source 2. Display-name heuristics must not enable paid multi-shot by themselves.

## 6. Planner Behavior

Implement `planVideoSegments(input)` in `planner.ts`.

Rules:

- `per_shot` returns one segment per shot.
- Unknown/unsupported capability falls back to `per_shot` with `fallbackReason`.
- `manual_group_size` clamps group size to capability limits.
- `adaptive_multi_shot` groups adjacent shots by max sub-shots, max duration, and natural review beats.
- `compact_multi_shot` groups more aggressively but still respects capability and reference limits.
- Grouping must preserve shot order and product/character/reference locks.
- Segment IDs must be deterministic from shot IDs and mode.
- Warnings must be deterministic and testable.

Natural grouping for 9-shot review:

- problem + pain expansion;
- product reveal + proof detail;
- usage + result;
- expectation guard + CTA.

## 7. Prompt Builder

Implement `buildVideoSegmentPrompt(input)` in `promptBuilder.ts`.

Prompt requirements:

- output plain text only;
- include segment objective, reference contract, timeline/sub-shots, product facts lock, audio policy, and negative constraints;
- support dialects: `generic`, `veo`, `kling`, `seedance`;
- include creative preset directive and optional creative brief as guidance, not authoritative truth;
- for `separate_tts_voiceover` and `silent`, forbid native narration, subtitles, captions, random glyphs, and unsourced spoken text;
- for `native_video_audio`, allow concise dialogue timing only when model capability supports native audio.

The builder should be reusable by Marketplace initial handoff and Storyboard Review regeneration.

## 8. Marketplace Auto Review Integration

Modify `apps/web/server/services/marketplaceAutoReviewService.ts` in a narrow adapter layer.

Add helpers:

- `buildMarketplaceAutoReviewVideoSegmentPlannerInput`
- `buildMarketplaceAutoReviewVideoSegmentPlan`
- `buildMarketplaceAutoReviewVideoSegmentPrompt`
- `videoSegmentPlanFromRunMetadata`

Integration sequence:

1. Resolve selected video model and transport.
2. Resolve capability profile.
3. Build planner input from `AutoReviewPlan`, frame strategy, frame URLs, product references, audio strategy, creative presets, and creative brief.
4. Persist `metadataJson.videoSegmentPlan` in shadow mode.
5. For per-shot mode, keep the existing task shape but derive prompts/references through the planner.
6. For multi-shot preview, create segment-shaped Storyboard Review tasks only when feature flag allows.

Do not change provider generation behavior until per-shot parity tests pass.

### 8.1 API Contracts

Add explicit server contracts instead of page-local planning.

Marketplace Capture preview owner:

- procedure/service: `getVideoSegmentPlanPreview` on the Marketplace Capture or Auto Storyboard Review API surface;
- input: product/run/storyboard context, selected model, structure mode, manual group size, creative brief, creative presets;
- output: `videoSegmentPlan`, `accessDecision`, `creditEstimate`, `warnings`, `fallbackReason`.
- `accessDecision` includes only safe internal connection/share identifiers and must never expose provider OAuth tokens, provider session references, signed provider upload URLs, or other credentials.
- `creditEstimate` separates count basis from source: `basis` is `jobs`, `segments`, or `seconds`; `creditSource` is `gateway_api` or `mcp_provider_account`.
- `warnings` uses the shared `VideoSegmentPlanWarning[]` union so planner, creative-brief, access, credit, and fallback warnings can be surfaced consistently.

Storyboard Review regeneration owner:

- procedure/service: `regenerateVideoSegmentPrompt` on the saved Storyboard Review/video editor project surface;
- input: `storyboardReviewId`, `segmentId`, optional manual notes/creative brief override;
- output: plain-text prompt, prompt source, creative brief hash, `VideoSegmentPlanWarning[]`, stale task IDs.

Both contracts must call `videoSegmentPlanner` and `buildVideoSegmentPrompt`. Client pages must not recreate planner logic.

## 9. Storyboard Review Integration

Modify Storyboard Review in two phases.

Phase A:

- normalize loaded review data;
- if `reviewData.videoSegmentState` is missing, synthesize a per-shot plan from current tasks;
- keep current UI behavior unchanged;
- include segment metadata in `storyboardContext.extraParams`.

Phase B:

- add segment-aware prompt regeneration path;
- regenerate prompts from stored `videoSegmentPlan`, selected model, frame roles, audio strategy, creative presets, and creative brief;
- mark affected prompts stale when creative brief or video structure changes;
- support fallback split for one failed multi-shot segment back into per-shot tasks.
- block paid generation for stale auto-generated prompts until the user regenerates them or explicitly keeps the current prompt.
- require explicit confirmation before a paid retry after splitting a failed multi-shot segment into per-shot tasks.

Existing `skills.planStoryboardVideoPrompts` and `skills.generateStoryboardVideoPrompt` may remain as text improvement helpers, but final provider prompt composition must call the shared prompt builder.

## 10. UI/UX Contract

### Target User / JTBD

- Role: marketplace creative operator.
- Goal: create product review storyboard/video prompts with the right model, references, audio policy, and optional multi-shot structure.
- Entry points: Marketplace Capture product detail and Storyboard Review.
- Success outcome: user can keep per-shot generation or choose model-gated multi-shot planning without losing product/character locks.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Marketplace Capture product detail | `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx` | pass creative brief and video structure overrides |
| Advanced Auto overrides | `apps/web/client/src/components/marketplaceCapture/AutoStoryboardAdvancedOverrides.tsx` | add video structure and manual group size controls |
| Storyboard Review | `apps/web/client/src/pages/StoryboardReviewPage.tsx` | show segment metadata, stale prompt state, regenerate/split actions |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `AutoStoryboardAdvancedOverrides` | existing | video model and video structure input | plan defaults/options |
| `VideoSegmentPlanSummary` | new client component if needed | preview rows and fallback warnings | `VideoSegmentPlan` |
| `StoryboardSegmentBadge` | new or inline | segment shot count/provider/model label | task extra params |
| `StoryboardSegmentActions` | new or inline | regenerate/split/mark stale controls | Storyboard Review mutations |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | existing skeleton/status preserved | component tests |
| empty | no segment preview until enough storyboard data exists | component tests |
| error | fallback reason/warning shown, generation disabled if access fails | tests and browser evidence |
| success | selected model, structure, segment count visible | tests and browser evidence |
| partial success | multi-shot unavailable but per-shot preview shown | tests |
| disabled/focus/hover | controls keyboard reachable and focus-visible | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | controls stack vertically, segment summary scrolls without horizontal overflow | screenshot/manual |
| tablet 768x1024 | two-column advanced controls where room allows | screenshot/manual |
| desktop 1440x900 | dense but readable summary near existing controls | screenshot/manual |
| small-mobile 360x800 | no clipped labels in Thai | screenshot/manual if risky |
| laptop 1024x768 | Storyboard Review right/left panels remain usable | screenshot/manual |
| wide-desktop 1280x800 | no excessive whitespace or nested cards | screenshot/manual |

### Accessibility Acceptance

- Keyboard path reaches video structure, group size, creative brief, regenerate, and split controls.
- Focus rings use existing shadcn/Tailwind focus styling.
- Selects and buttons have Thai/English labels.
- Status/fallback messages are text, not color-only.
- Reduced motion: no new required animation.

### Visual Direction

Use existing shadcn-style controls, compact labels, `rounded-md`/`rounded-lg`, current slate/sky/amber/emerald status language. Do not introduce a new palette.

### Copy Contract

Primary labels:

- Thai: `โครงสร้างวิดีโอ`, `แยกแต่ละช็อต`, `รวมช็อตอัตโนมัติตามโมเดล`, `รวมหลายช็อตให้กระชับ`, `กำหนดจำนวนช็อตต่อคลิป`, `แนวเรื่องหรือคำบรรยายเพิ่มเติม`
- English: `Video structure`, `Per shot`, `Adaptive multi-shot`, `Compact multi-shot`, `Manual group size`, `Creative brief`

Warnings must state whether a limit counts jobs, segments, seconds, or concurrent queued/processing jobs.

### Browser Evidence Required

Record implementation evidence in `specs/feature/122-video-segment-planner-multi-shot-storyboard-review/implementation/ui-browser-evidence.md` or section files. Required viewports: mobile, tablet, desktop. Include console, keyboard path, overflow, labels, and error state checks.

## 11. Access, Model Eligibility, And Credits

Before preview or generation:

- Gateway API models must be enabled in media model config.
- MCP models are eligible only when current user owns a configured connection or has group-shared access.
- Storyboard Review regeneration must re-check access at generation time.
- Preview should show fallback when selected MCP model loses access.
- Segment-based credit estimate should be added before enabling multi-shot spend.
- Shared MCP daily/concurrency limits must count generated jobs for the account/group and be shown in user copy.

Credit estimate formula:

- per-shot mode uses the current per-video-job estimate path;
- multi-shot modes estimate by planned segment count, selected model, and planned segment duration;
- manual group mode adds a clamp warning when the request exceeds capability;
- split fallback adjusts only the affected segment where possible;
- shared MCP usage is labeled as provider-account usage, not SmartSpecPro gateway credit usage.

## 12. Persistence And Migration

Persist:

```text
run.metadataJson.videoSegmentPlan
run.metadataJson.videoStructureMode
run.metadataJson.creativeBrief
reviewData.videoSegmentState.videoSegmentPlan
reviewData.videoSegmentState.creativeBrief
storyboardContext.extraParams.segmentId
storyboardContext.extraParams.shotIds
storyboardContext.extraParams.videoSegmentPlanVersion
storyboardContext.extraParams.promptSource
storyboardContext.extraParams.creativeBriefHash
```

Migration strategy:

- No database table migration is required for MVP if existing JSON metadata can hold the state.
- Legacy reads synthesize a per-shot segment plan.
- Persist synthesized state only on save/regenerate/generation.

If media model capability needs durable config columns later, create a separate migration in the media-model config feature area; do not block MVP on this if JSON metadata already exists.

Generated output persistence:

- segment video outputs must be imported/stored through the same durable media-history/storage path as current generated videos;
- Storyboard Review, Media History, Video Editor, and Library should use SmartSpecPro-managed stored URLs when available;
- provider temporary URLs are transient fetch inputs only and must not be the canonical saved output.

## 13. Observability

Add redacted logs/events:

- `video_segment_plan_created`
- `video_segment_plan_fallback`
- `video_segment_prompt_built`
- `video_segment_prompt_regenerated`
- `video_segment_split_fallback`
- `video_segment_access_blocked`

Do not log private reference URLs, provider tokens, or raw provider responses.

## 14. Rollout

Phase 1: shared planner and tests only.

Phase 2: per-shot through planner in shadow mode, persisted but no UI behavior change.

Phase 3: Marketplace advanced controls and segment preview.

Phase 4: Storyboard Review regeneration from segment state.

Phase 5: multi-shot beta for allowlisted tenants/models.

Feature flags:

- `videoSegmentPlannerShadow`
- `videoSegmentPlannerPerShot`
- `videoSegmentPlannerPreview`
- `videoSegmentPlannerMultiShotBeta`

## 15. Verification

Required before merge:

```text
npm --prefix apps/web test -- --run shared/videoSegmentPlanner/__tests__/*.test.ts
npm --prefix apps/web test -- --run shared/hyperframes/__tests__/autoPlan.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts
npm --prefix apps/web test -- --run server/services/__tests__/marketplaceAutoReviewService.test.ts
npm --prefix apps/web test -- --run client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx
npm --prefix apps/web run check
```

Required before enabling UI/beta:

- Playwright or manual browser evidence on Marketplace Capture product detail.
- Storyboard Review regeneration smoke test.
- One per-shot parity run confirms media history thumbnails/output URLs still work.
- One generated MCP/API segment-output check confirms canonical URLs are SmartSpecPro stored URLs, not provider temporary URLs.
- One MCP shared-account access test confirms hidden/blocked models cannot generate.
