# Feature 122: Video Segment Planner for Multi-Shot Storyboard Review

**Version:** 0.7.0
**Date:** 2026-06-19
**Status:** Draft
**Builds on:** Feature 118 Marketplace Auto Review Create Storyboard And Video Auto, Feature 119 HyperFrames Marketplace Auto Review Render Adapter, Feature 120 HyperFrames Creative Systems, Feature 121 MCP Connect Media Provider Sharing
**Principle:** Add a reusable video segmentation and prompt-planning component that can group existing storyboard shots into provider-appropriate video segments, starting with Auto Storyboard Review for product videos.

---

## 0. Implementation Snapshot As Of 2026-06-19

This feature spec has one supporting vertical slice already implemented in the worktree. The implemented slice does **not** complete the central `videoSegmentPlanner` or multi-shot video grouping yet. It prepares the creative-guidance, model-selection, and audio-policy layer that Feature 122 will reuse.

Implemented files and behavior:

- `apps/web/shared/hyperframes/autoReviewCreativePresets.ts`
  - adds a shared creative preset registry and schemas;
  - supports `tone_preset`, `story_arc_preset`, `pacing_preset`, `camera_motion_preset`, `visual_style_preset`, `audio_preset`, `platform_preset`, and `segment_structure_preset`;
  - normalizes conflicting preset selections by `conflictGroup`;
  - builds a safe directive that can influence tone, story structure, camera, visual style, audio behavior, and segment grouping only;
  - explicitly forbids changing product identity, product claims, character identity, reference frame roles, brand/logo/text, and provider policy;
  - maps Thai speech presets to `separate_tts_voiceover` and adds a Seedance-family guard so Seedance is not asked to generate Thai native speech directly.
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts` and `apps/web/server/routers/marketplaceCapture.ts`
  - accept `referenceAnchors.creativePresets` in Auto Storyboard Review start payloads.
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
  - exposes creative preset families on the Marketplace Capture product Auto Storyboard Review flow;
  - stores selected presets in `referenceAnchors.creativePresets`;
  - syncs `audio_preset` selections into the existing `audioStrategy` override where applicable;
  - shows Thai TTS guidance when Thai separate narration is selected.
- `apps/web/server/services/marketplaceAutoReviewService.ts`
  - resolves and snapshots creative preset selections;
  - includes preset guidance in creative planner prompts and video prompt context;
  - lets preset-requested audio strategy override the default/requested audio strategy server-side;
  - keeps `shot.voiceover` and `voiceoverScript` as the single spoken source when `separate_tts_voiceover` is active;
  - carries `creativePresets` and `creativePresetDirective` into Storyboard Review task metadata through `storyboardContext.extraParams`.
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
  - includes `creativePresetDirective` when planning or regenerating Storyboard Review video prompts, so Marketplace initial handoff and Storyboard Review repair/regeneration stay aligned.
- Tests added or extended:
  - `apps/web/shared/hyperframes/__tests__/autoReviewCreativePresets.test.ts`
  - `apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts`
  - `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`
  - `apps/web/client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx`

Verification already run for this slice:

```text
npm --prefix apps/web test -- --run shared/hyperframes/__tests__/autoReviewCreativePresets.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts server/services/__tests__/marketplaceAutoReviewService.test.ts
npm --prefix apps/web test -- --run client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx shared/hyperframes/__tests__/autoReviewCreativePresets.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts server/services/__tests__/marketplaceAutoReviewService.test.ts
npm --prefix apps/web run check
```

Remaining Feature 122 implementation scope:

- create the central `apps/web/shared/videoSegmentPlanner/` component;
- route current per-shot video behavior through the planner without regression;
- add preview/persistence for `videoSegmentPlan`;
- support Storyboard Review prompt regeneration from the stored segment plan;
- add multi-shot segment planning and provider/model capability profiles;
- add segment-level UI, stale prompt semantics, repair split fallback, and segment-based credit/access gates.

---

## 1. Goal

SmartSpecPro currently treats each storyboard shot as one video generation unit. This is safe and easy to repair, but it creates many short clips and can make product review videos feel stretched or mechanically stitched.

Feature 122 introduces a central **Video Segment Planner** that can convert a shot plan into provider-aware video segments:

- `per_shot`: current behavior, one shot per generated video clip;
- `adaptive_multi_shot`: system groups shots based on selected video model capability;
- `compact_multi_shot`: system favors fewer, longer clips when the model supports it;
- `manual_group_size`: advanced override for an explicit group size.

The first implementation target is **Marketplace Capture Auto Storyboard Review for product videos**. The component must be reusable later by short-drama, music-video, presentation, production-director, and Media Studio workflows.

---

## 2. Existing Baseline

Feature 118 records the implemented Marketplace Auto Review behavior:

- product review plans contain 7-9 ordered `shots`;
- each shot currently has one video prompt and one generated clip;
- `storyboard_3x3_split` supplies one storyboard frame per shot;
- `video_shot_start_stop` supplies start and stop frames per shot;
- direct video generation currently submits one provider job per shot;
- the Video Editor receives an ordered list of generated clips.

This baseline must remain available as the fallback path.

---

## 3. Non-Goals

- Do not remove per-shot video generation.
- Do not redesign Marketplace Capture product truth, storyboard structure, or review UX in v1.
- Do not build short-drama or music-video authoring in this feature. Only preserve extension points for those future flows.
- Do not assume every provider supports multi-shot prompts.
- Do not hardcode provider behavior inside prompt strings. Provider capabilities must live in a governed capability profile.
- Do not make multi-shot generation the only path. Users and QA must be able to fall back to per-shot generation.

---

## 4. Provider Capability Assumptions

Capabilities must be stored as data and refreshed as provider support changes. The initial profile should be conservative:

| Provider/model family | Initial duration profile | Suggested segmenting | Notes |
| --- | ---: | --- | --- |
| Veo 3 / Veo 3.1 | 4-8 seconds | 1-2 sub-shots | Use conservative motion transitions. Treat as micro-scene or start/end transformation. |
| Kling 3.0 / Kling 3.0 Omni | up to about 10-15 seconds where available | 2-4 sub-shots | Good candidate for compact multi-shot review clips. Verify selected API/MCP model constraints at runtime. |
| Seedance 2.0 | up to about 15 seconds where available | 3-6 sub-shots | Strong candidate for product review segment grouping and multi-reference continuity. |
| Unknown/default video model | existing clip duration | 1 shot | Fall back to current behavior until capabilities are known. |

The capability profile should include:

```ts
type VideoModelSegmentCapability = {
  modelId: string;
  provider: string;
  transport: "gateway_api" | "mcp";
  supportsMultiShotPrompt: boolean;
  supportsStartFrame: boolean;
  supportsStopFrame: boolean;
  supportsMultipleReferenceImages: boolean;
  supportsNativeAudio: boolean;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  recommendedDurationSeconds: number;
  maxSubShotsPerSegment: number;
  maxReferenceImagesPerSegment: number;
  promptDialect: "generic" | "veo" | "kling" | "seedance";
  repairGranularity: "segment" | "sub_shot";
};
```

---

## 5. Product Requirements

### 5.1 Auto Storyboard Review Advanced Option

Add an advanced option in Auto Storyboard Review:

- Thai label: `โครงสร้างวิดีโอ`
- English label: `Video structure`
- Options:
  - `Per shot` / `แยกแต่ละช็อต`
  - `Adaptive multi-shot` / `รวมช็อตอัตโนมัติตามโมเดล`
  - `Compact multi-shot` / `รวมหลายช็อตให้กระชับ`
  - `Manual group size` / `กำหนดจำนวนช็อตต่อคลิป`

MVP default should remain `Per shot` unless the product/team explicitly enables adaptive behavior by tenant or feature flag.

### 5.2 Segment Preview

Before paid video generation, the plan summary should be able to show:

- total storyboard shots;
- planned generated video segments;
- shot IDs included in each segment;
- estimated duration per segment;
- selected video model and why that grouping was selected;
- fallback reason when multi-shot is unavailable.

### 5.3 User Control

Users should be able to keep current behavior. If the selected video model does not support multi-shot, the UI should show a clear fallback state instead of silently pretending multi-shot is active.

### 5.4 Optional User Creative Brief

The system must support both fully automatic planning and user-guided planning.

Users may optionally enter a short creative direction before generating the first storyboard/video plan, for example:

- desired story mood;
- desired review angle;
- audience/persona;
- pacing preference;
- must-include scene idea;
- must-avoid tone or scene;
- product usage context.

Thai label: `แนวเรื่องหรือคำบรรยายเพิ่มเติม`
English label: `Creative brief`

Placeholder examples:

- Thai: `เช่น อยากให้เป็นรีวิวแนวจริงใจ เหมือนเล่าประสบการณ์หลังใช้จริง เน้นปัญหาก่อนเจอสินค้า`
- English: `Example: make it feel like an honest after-use review, start from the pain point, then show the product as the fix.`

The field is optional. Empty value means the planner uses current auto behavior. A provided value should guide story structure, sub-shot grouping, prompt wording, and regeneration, but must never override product truth, safety rules, reference-image identity, platform policy, or provider capability limits.

Recommended limits:

- max 2,000 characters in MVP;
- plain text only;
- strip HTML/Markdown control syntax before model use;
- store both original and normalized text for audit/debug;
- show a warning when the brief conflicts with locked product facts or prohibited claims.

### 5.5 Safe Creative Presets

Creative presets can be supported as reusable, structured guidance. They must shape story expression without changing product identity, character identity, or evidence-locked claims.

Supported preset families:

- `tone_preset`: sincere review, premium commercial, UGC demo, calm expert, energetic creator.
- `story_arc_preset`: problem-solution-result, before-after-bridge, proof-first, demo walkthrough, objection-handling.
- `pacing_preset`: slow premium, balanced, fast hook, compact conversion.
- `camera_motion_preset`: handheld UGC, smooth dolly, macro detail, showroom pan, static proof shot.
- `visual_style_preset`: bright clean studio, realistic home use, cinematic low-key, natural daylight, marketplace-safe neutral.
- `audio_preset`: silent, natural ambience, native voiceover, separate TTS voiceover, music bed only.
- `platform_preset`: TikTok Shop review, Shopee product proof, vertical ad, product detail demo.
- `segment_structure_preset`: per-shot, two-beat micro-scene, compact multi-shot, proof/detail cluster.

Preset families that must not be supported in this feature:

- product attribute presets that change shape, color, material, size, brand, logo, package, quantity, or ingredients;
- character identity presets that change face, age, gender presentation, ethnicity, body shape, wardrobe identity lock, or voice identity lock after a character/reference lock exists;
- claim presets that add unverified medical, financial, performance, price, guarantee, rating, sales, or review claims;
- provider bypass presets that attempt to ignore policy, watermark rules, reference locks, or moderation constraints.

Preset behavior:

- A preset is applied before free-text creative brief.
- Free-text brief may refine the preset but cannot override product/character/reference locks.
- Multiple presets may be combined only if they do not conflict.
- Conflicting presets should produce a warning and deterministic resolution.
- Preset output must be normalized into the same `VideoSegmentCreativeBrief` guidance layer.
- Thai speech presets should prefer `separate_tts_voiceover` by default for models with weak Thai native speech. Seedance 2.0-family models must not be asked to generate Thai native speech directly; Thai narration should be generated as separate TTS and aligned to storyboard shot voiceover.

---

## 6. Central Component Design

### 6.1 Component Name

Create a shared planning component:

```text
videoSegmentPlanner
```

Suggested location:

```text
apps/web/shared/videoSegmentPlanner/
```

This should be independent from Marketplace Capture. Marketplace Auto Review is the first caller, not the owner of the planner.

### 6.2 Core Input

```ts
type VideoSegmentPlannerInput = {
  sourceSurface:
    | "marketplace_auto_review"
    | "storyboard_review"
    | "media_studio"
    | "production_director"
    | "short_drama"
    | "music_video";
  mode: "per_shot" | "adaptive_multi_shot" | "compact_multi_shot" | "manual_group_size";
  manualGroupSize?: number;
  videoModelId: string;
  aspectRatio: string;
  audioStrategy: "auto" | "native_video_audio" | "separate_tts_voiceover" | "silent";
  referenceMode: "single_storyboard_frame" | "start_stop";
  creativeBrief?: VideoSegmentCreativeBrief | null;
  creativePresets?: VideoSegmentCreativePresetSelection[];
  shots: VideoSegmentPlannerShot[];
  references: VideoSegmentPlannerReferenceSet;
};
```

### 6.2.1 Creative Brief Contract

```ts
type VideoSegmentCreativeBrief = {
  mode: "auto" | "user_guided";
  presetSelections?: VideoSegmentCreativePresetSelection[];
  originalText?: string;
  normalizedText?: string;
  language?: "auto" | "th" | "en" | string;
  sourceSurface: "marketplace_auto_review" | "storyboard_review" | "media_studio";
  createdByUserId: string;
  updatedAt: string;
  conflictWarnings?: VideoSegmentCreativeBriefWarning[];
};

type VideoSegmentCreativePresetSelection = {
  presetId: string;
  family:
    | "tone_preset"
    | "story_arc_preset"
    | "pacing_preset"
    | "camera_motion_preset"
    | "visual_style_preset"
    | "audio_preset"
    | "platform_preset"
    | "segment_structure_preset";
  label: string;
  version: number;
  source: "system" | "tenant" | "user_saved";
};

type VideoSegmentCreativeBriefWarning = {
  code:
    | "product_truth_conflict"
    | "policy_risk"
    | "reference_identity_conflict"
    | "provider_capability_conflict"
    | "too_vague";
  message: string;
  severity: "info" | "warning" | "blocking";
};
```

Brief priority order:

1. Safety, legal, tenant policy, and provider restrictions.
2. Product truth and evidence lock.
3. Reference image/video identity and continuity locks.
4. Selected model capability profile.
5. User creative brief.
6. Auto planner defaults.

If the brief conflicts with higher-priority constraints, the planner must preserve the higher-priority constraint and either adapt the brief or surface a warning.

### 6.2.2 Creative Preset Definition Contract

Presets should be stored as declarative guidance, not arbitrary prompt fragments.

```ts
type VideoSegmentCreativePreset = {
  id: string;
  family: VideoSegmentCreativePresetSelection["family"];
  label: string;
  description?: string;
  version: number;
  source: "system" | "tenant" | "user_saved";
  isEnabled: boolean;
  directives: {
    tone?: string;
    storyArc?: string;
    pacing?: string;
    cameraMotion?: string;
    visualStyle?: string;
    audioBehavior?: string;
    platformFit?: string;
    segmentStructure?: string;
  };
  allowedInfluence:
    | "tone_only"
    | "story_structure"
    | "camera_motion"
    | "visual_style"
    | "audio_behavior"
    | "segment_grouping";
  forbiddenInfluence: Array<
    | "product_identity"
    | "product_claims"
    | "character_identity"
    | "reference_frame_roles"
    | "brand_logo_text"
    | "provider_policy"
  >;
  compatibleSourceSurfaces: VideoSegmentPlannerInput["sourceSurface"][];
  compatibleMediaTypes: Array<"image" | "video">;
  conflictGroup?: string;
};
```

Preset validation rules:

- `forbiddenInfluence` must always include `product_identity`, `product_claims`, `character_identity`, `reference_frame_roles`, `brand_logo_text`, and `provider_policy` unless a later reviewed feature creates a narrower exception.
- Tenant/user presets must be validated and normalized before use; raw preset text must not be injected directly into provider prompts.
- Presets that mention product traits, character traits, or factual claims should be converted into warnings, not applied.
- If two selected presets share a `conflictGroup`, the latest explicit user selection wins and the discarded preset is recorded as a warning.
- System presets should be versioned so old Storyboard Review records can replay the original guidance.

### 6.3 Shot Contract

```ts
type VideoSegmentPlannerShot = {
  shotId: string;
  order: number;
  title: string;
  storyboardGuide: string;
  visualAction: string;
  voiceover?: string;
  durationSeconds: number;
  startFrameUrl?: string | null;
  stopFrameUrl?: string | null;
  storyboardFrameUrl?: string | null;
  productReferenceUrls?: string[];
  userNotes?: string;
};
```

### 6.4 Output Contract

```ts
type VideoSegmentPlan = {
  schemaVersion: 1;
  mode: VideoSegmentPlannerInput["mode"];
  effectiveMode: "per_shot" | "multi_shot";
  videoModelId: string;
  capability: VideoModelSegmentCapability;
  creativeBrief?: VideoSegmentCreativeBrief | null;
  creativePresets?: VideoSegmentCreativePresetSelection[];
  fallbackReason?: string;
  segments: VideoSegment[];
};

type VideoSegment = {
  segmentId: string;
  order: number;
  shotIds: string[];
  durationSeconds: number;
  promptMode: "single_shot" | "multi_shot";
  referenceMode: "single_storyboard_frame" | "start_stop" | "segment_start_end";
  startFrameUrl?: string | null;
  stopFrameUrl?: string | null;
  referenceImageUrls: string[];
  subShots: VideoSegmentSubShot[];
};

type VideoSegmentSubShot = {
  shotId: string;
  order: number;
  durationSeconds: number;
  beatLabel: string;
  visualAction: string;
  cameraInstruction: string;
  transitionInstruction?: string;
  voiceover?: string;
  creativeBriefInfluence?: string;
};
```

---

## 7. Segmenting Rules

### 7.1 Per-Shot Mode

Per-shot mode must reproduce current behavior:

- one segment per shot;
- segment duration equals shot duration;
- references match the existing `single_storyboard_frame` or `start_stop` mode;
- downstream Video Editor projection remains unchanged except for optional segment metadata.

### 7.2 Adaptive Multi-Shot Mode

Adaptive mode should:

1. Load selected video model capability.
2. Choose group size from `maxSubShotsPerSegment`, `maxDurationSeconds`, and shot count.
3. Keep story beats in order.
4. Avoid grouping CTA with unrelated setup beats unless the model supports enough duration.
5. Prefer grouping adjacent beats that form a natural micro-scene:
   - problem + pain expansion;
   - product reveal + proof detail;
   - usage + result;
   - expectation guard + CTA.

### 7.3 Compact Multi-Shot Mode

Compact mode can group more aggressively, but must still:

- preserve product identity;
- preserve factual claims;
- keep segment prompt readable;
- respect provider max duration and reference limits;
- avoid overloading models that only support short coherent clips.

### 7.4 Manual Group Size

Manual group size is an advanced override. The planner may clamp it down when the selected model cannot support the requested group.

---

## 8. Prompt Requirements

### 8.1 Generic Multi-Shot Prompt Shape

Multi-shot prompts must be plain text and must not return JSON to providers.

Prompt sections:

1. segment objective;
2. reference contract;
3. sub-shot timeline with durations;
4. camera and motion continuity;
5. product facts lock;
6. audio/dialogue policy;
7. negative constraints.

Example shape:

```text
Create one continuous 12-second vertical product review video from the supplied reference frames.

Reference contract:
@Image1 is the opening visual anchor for the segment.
@Image2 is the ending visual anchor for the segment.
Product reference images are immutable product identity references, not extra scene frames.

Timeline:
0.0-4.0s: Shot 3 — product appears as the solution...
4.0-8.0s: Shot 4 — proof/detail close-up...
8.0-12.0s: Shot 5 — realistic usage result...

Keep this as one coherent scene progression, not three unrelated clips.
...
```

### 8.2 Model Dialects

The prompt builder should support dialect hints:

- `veo`: concise motion instructions, limited sub-shots, native audio behavior when selected;
- `kling`: explicit shot markers and camera transitions;
- `seedance`: more detailed storyboard timeline and multi-reference continuity;
- `generic`: conservative text for unknown models.

### 8.3 Audio Strategy Interaction

For `native_video_audio`, segment prompts may include dialogue timing.
For `separate_tts_voiceover` and `silent`, segment prompts must forbid generated narration, speech, subtitles, captions, text overlays, and random glyphs unless explicitly enabled by a later feature.

For `separate_tts_voiceover`, the storyboard `voiceoverScript` and each `shot.voiceover` are the single source of spoken content. The TTS script must follow the same story beat, timing, product proof, and visual intent as the storyboard. Regenerated video prompts must not introduce a different spoken story, and provider video prompts must not request native speech when separate TTS is selected.

### 8.4 Creative Brief Prompt Rules

When a user creative brief or preset is present, prompt builders should include it as guidance, not as raw authoritative truth.

Rules:

- convert the brief into concise direction lines;
- convert presets into normalized direction lines by family;
- preserve user intent without copying unsafe, unverifiable, or contradictory claims;
- do not allow the brief to add facts about the product that are absent from product truth;
- do not let the brief change reference identities, product geometry, brand/logo details, or countable parts;
- apply the brief consistently across all segments unless a per-segment/manual edit overrides it;
- keep final provider prompts plain text;
- include enough provenance metadata to explain whether a prompt came from `auto` or `user_guided`.

Example insertion:

```text
Creative direction:
Use an honest after-use review tone. Start from the pain point, then make the product feel like a practical fix. Keep the story calm, realistic, and evidence-backed.
```

The prompt builder may rewrite the user text for clarity, but should not silently invert intent.

Example preset-safe insertion:

```text
Creative preset guidance:
Tone: sincere after-use review.
Story arc: problem-solution-result.
Camera: smooth handheld UGC with clear product proof moments.

Do not change the referenced product, character identity, wardrobe lock, brand/logo details, or factual claims.
```

---

## 9. Marketplace Auto Review MVP

### 9.1 Integration Points

MVP caller:

```text
startAutoStoryboardReview
  -> getAutoStoryboardReviewPlan
  -> startMarketplaceAutoReviewRun
  -> ensureVideoNodes / direct video generation
  -> videoSegmentPlanner
  -> buildVideoSegmentPrompt
  -> mediaGenerationService.generateVideoAsync
  -> Video Editor projection
```

Current codebase audit notes:

- Marketplace Capture product starts the run from `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`.
- Runtime API passes selected defaults, including `videoModel`, through `startAutoStoryboardReviewForApi` in `apps/web/server/services/hyperframesRuntimeApiService.ts`.
- Initial Storyboard Review handoff is built by `buildStoryboardReviewOutput`, `buildMarketplaceAutoReviewStoryboardReviewTasks`, and `createStoryboardReview` in `apps/web/server/services/marketplaceAutoReviewService.ts`.
- The handoff currently creates one video task per storyboard shot and stores prompt/model/reference metadata on each task.
- Storyboard Review can later regenerate prompts and clips from `apps/web/client/src/pages/StoryboardReviewPage.tsx` using `skills.planStoryboardVideoPrompts`, `skills.generateStoryboardVideoPrompt`, and `media.generateVideoAsync`.
- Storyboard Review also has local task construction in `apps/web/client/src/lib/storyboardReviewWorkspace.ts` that builds prompts with `buildVeo31StoryboardVideoPrompt`.

Because prompt creation exists in both Marketplace Capture initial automation and Storyboard Review regeneration, Feature 122 must make the planner/prompt contract shared. Marketplace Capture is the first caller, but Storyboard Review must be able to rebuild or repair prompts from the same segment plan without drifting back to incompatible per-shot-only logic.

### 9.2 Metadata Additions

Run metadata should store:

```ts
{
  videoStructureMode: "per_shot" | "adaptive_multi_shot" | "compact_multi_shot" | "manual_group_size";
  creativePresets?: VideoSegmentCreativePresetSelection[];
  creativeBrief?: VideoSegmentCreativeBrief;
  videoSegmentPlan: VideoSegmentPlan;
  videoSegmentAttemptId: string;
  videoSegmentRefs: DirectMediaTaskRef[];
}
```

Keep existing `directVideoTasks`, `videoClipUrls`, `videoUnitIds`, and repair metadata compatible. If a segment contains multiple shots, downstream projections must retain shot lineage.

### 9.3 Video Editor Projection

Generated segment clips should become Video Editor clips. Each clip asset must include:

- segment ID;
- shot IDs included;
- model ID;
- prompt;
- references;
- duration;
- source run and concept ID.

If one segment covers multiple shots, the Video Editor should show one video asset/clip, but metadata must allow the user to understand which storyboard shots it represents.

---

## 10. Storyboard Review Handoff and Regeneration

### 10.1 Initial Handoff Contract

When Marketplace Capture creates the first Storyboard Review workspace, it must persist enough data for later prompt regeneration:

```ts
type StoryboardReviewVideoSegmentState = {
  videoSegmentPlan: VideoSegmentPlan;
  creativePresets?: VideoSegmentCreativePresetSelection[];
  creativeBrief?: VideoSegmentCreativeBrief | null;
  promptVersion: string;
  sourceSurface: "marketplace_auto_review";
  sourceRunId: string;
  sourceProductId: string;
  selectedVideoModelId: string;
};
```

The state should be stored in the Storyboard Review `reviewData` and copied into each task/clip only as derived metadata. The segment plan remains the canonical structure.

Each Storyboard Review task created from a segment must include:

- `segmentId`;
- `shotIds`;
- selected video model ID;
- transport/provider identity when known;
- reference mode;
- reference image URLs and frame roles;
- current prompt;
- prompt source: `initial`, `regenerated`, or `manual_edit`;
- product/run/concept lineage.

For compatibility, per-shot tasks should map one task to one segment with a single `shotId`.

### 10.2 Regeneration Contract

Storyboard Review must support regenerating prompts from the same central contract, not from a separate page-local prompt recipe.

Required regeneration inputs:

```ts
type RegenerateVideoSegmentPromptInput = {
  storyboardReviewId: string;
  segmentId: string;
  target: "segment" | "sub_shot" | "shot";
  requestedVideoModelId?: string;
  currentPrompt?: string;
  manualNotes?: string;
  creativeBriefOverride?: VideoSegmentCreativeBrief | null;
  includeVoiceover: boolean;
  includeSound: boolean;
};
```

Regeneration must:

1. Load `videoSegmentPlan` from Storyboard Review state.
2. Resolve the current model capability profile.
3. Rebuild prompt through `buildVideoSegmentPrompt`.
4. Preserve product facts lock, character/reference anchors, frame roles, and audio strategy.
5. Return plain-text prompt only.
6. Update the task/segment prompt without destroying manual edits on unrelated segments.
7. Preserve the original creative brief unless the user explicitly edits or clears it in Storyboard Review.

If regeneration targets a sub-shot but the model cannot safely regenerate only part of a multi-shot segment, the system should either:

- regenerate the whole segment with the updated sub-shot instruction; or
- split the segment back to per-shot tasks and continue with per-shot fallback.

### 10.3 Storyboard Review UI Requirements

Storyboard Review must expose the segment structure clearly enough for review work:

- show whether the current clip is one shot or a multi-shot segment;
- show included shot numbers/titles;
- allow edit and regenerate at segment level;
- allow fallback split for a failed multi-shot segment;
- show selected video model and transport/provider;
- show selected presets and explain which creative layer they affect;
- show the active creative brief and allow editing/clearing it before regenerating prompts;
- keep existing per-shot review UX unchanged when `effectiveMode` is `per_shot`.

The current Storyboard Review paths that call `skills.planStoryboardVideoPrompts` or `skills.generateStoryboardVideoPrompt` should become adapters over this contract. They may keep their existing skill behavior for text improvement, but final provider prompts must be composed by the shared prompt builder so Marketplace initial prompts and Storyboard Review regenerated prompts stay compatible.

### 10.4 Marketplace Capture Product Page Requirements

Marketplace Capture product remains the first planning surface. It must:

- create the initial `videoSegmentPlan` before Storyboard Review handoff;
- pass selected image/video model choices and advanced video structure mode into the run;
- pass optional creative preset selections into the run;
- pass optional user creative brief into the run;
- include product references and generated frame URLs in planner input;
- persist segment plan in run metadata and Storyboard Review state;
- show a preview or summary of segment grouping before provider spend once multi-shot mode is enabled.

If a user only creates storyboard images first, Storyboard Review must still have enough plan context to generate video prompts later.

### 10.5 Creative Brief Edit Semantics

The creative brief can be created or edited in two places:

1. Marketplace Capture product page before starting the initial plan.
2. Storyboard Review before regenerating prompt(s).

Editing the brief in Storyboard Review should not automatically rewrite every existing prompt. It should mark affected segment prompts as stale and let the user choose one of:

- regenerate selected segment;
- regenerate all queued/not-yet-generated segments;
- keep current prompts and use the new brief only for future regeneration.

Manual prompt edits have priority over regenerated text for that specific segment until the user explicitly regenerates it again.

The system should store brief history lightly enough for debugging:

- current brief;
- last applied brief hash per segment;
- prompt source and generated-at timestamp.

No provider call should receive stale auto-only prompt text when the UI says a user-guided brief is active for that segment.

MVP decision: changing or clearing the creative brief marks affected prompts stale. Paid generation is blocked for stale auto-generated prompts until the user regenerates selected segment(s), regenerates all queued/not-yet-generated segments, or explicitly keeps the existing prompt for that segment. Manual prompt edits remain authoritative for that segment until the user chooses to regenerate.

---

## 11. Resolved MVP Decisions Before Implementation

The spec is structurally complete for a first implementation. The following details are now decided for MVP:

- `creativeBrief` is per-run/per-review text in MVP. Reusable saved briefs/presets remain future work.
- Conflict warnings are non-blocking unless they touch product truth, reference identity, provider capability, policy, access, or paid stale-prompt safety.
- Prompt tests must verify that brief guidance appears as guidance while unsafe or contradictory product claims are omitted or downgraded to warnings.
- Paid generation is blocked for stale auto-generated prompts until the user regenerates or explicitly keeps that prompt.
- Paid retry after split fallback requires explicit user confirmation.

---

## 12. Implementation Decision Defaults

These defaults should be used unless implementation discovers a concrete blocker.

### 12.1 Persistence Defaults

Store planner state in both run metadata and Storyboard Review state:

```ts
run.metadataJson.videoSegmentPlan
run.metadataJson.creativeBrief
reviewData.videoSegmentState.videoSegmentPlan
reviewData.videoSegmentState.creativeBrief
```

Each Storyboard Review task should keep derived lookup fields in `storyboardContext.extraParams`:

```ts
{
  segmentId: string;
  shotIds: string[];
  videoSegmentPlanVersion: number;
  promptSource: "initial" | "regenerated" | "manual_edit";
  creativeBriefHash?: string;
  lastPromptGeneratedAt?: string;
}
```

The canonical plan is the top-level `videoSegmentState`. Task-level fields are denormalized for UI and legacy compatibility only.

### 12.2 API Surface Defaults

MVP should prefer a small dedicated server contract instead of adding more page-local prompt logic:

- `getVideoSegmentPlanPreview`
  - input: product/run/storyboard context, selected video model, video structure mode, creative brief.
  - output: deterministic `VideoSegmentPlan`, fallback reason, warnings, credit estimate.
- `regenerateVideoSegmentPrompt`
  - input: `storyboardReviewId`, `segmentId`, optional edited creative brief/manual notes.
  - output: plain-text prompt, updated segment/task metadata, warnings.

Existing `skills.planStoryboardVideoPrompts` and `skills.generateStoryboardVideoPrompt` can remain as internal helpers, but Storyboard Review should call the shared segment contract for final prompts.

Initial ownership decision:

- Marketplace Capture preview should live on the Marketplace Capture/API surface that already owns Auto Storyboard Review planning, not inside the client page.
- Storyboard Review regeneration should live on the Storyboard Review/video editor project router/service surface that already owns saved review data.
- Both procedures must call the shared `videoSegmentPlanner` and prompt builder instead of reimplementing planner logic locally.

Minimum preview response shape:

```ts
type VideoSegmentPlanWarning =
  | VideoSegmentWarning
  | VideoSegmentCreativeBriefWarning
  | {
      code: string;
      message: string;
      severity: "info" | "warning" | "error";
      source: "planner" | "creative_brief" | "access" | "credit" | "fallback";
    };

type VideoSegmentPlanPreviewResponse = {
  videoSegmentPlan: VideoSegmentPlan;
  accessDecision: {
    allowed: boolean;
    reasonCode?: string;
    message?: string;
    transport?: "gateway_api" | "mcp";
    provider?: string;
    mcpConnectionId?: string;
    sharedGroupId?: number;
  };
  creditEstimate: {
    mode: "per_shot" | "segment_duration";
    estimatedCredits: number;
    basis: "jobs" | "segments" | "seconds";
    creditSource: "gateway_api" | "mcp_provider_account";
    notes: string[];
  };
  warnings: VideoSegmentPlanWarning[];
  fallbackReason?: string;
};
```

`accessDecision` may include internal connection/share identifiers needed for follow-up calls, but responses must never expose provider OAuth tokens, provider session references, signed provider upload URLs, or other credentials.

Minimum regeneration response shape:

```ts
type RegenerateVideoSegmentPromptResponse = {
  segmentId: string;
  prompt: string;
  promptSource: "regenerated";
  creativeBriefHash?: string;
  warnings: VideoSegmentPlanWarning[];
  staleTaskIds: string[];
};
```

### 12.3 Access, Model Eligibility, and Credits

Before showing or using a model in planning/generation:

- Gateway API models must be enabled in media model config.
- MCP models must be shown only when the current user owns a configured MCP account or belongs to a group with shared access.
- Regeneration in Storyboard Review must re-check model access at the time of generation, not only at initial handoff.
- Credit estimate should be segment-based:
  - per-shot mode: current behavior;
  - multi-shot mode: estimate by segment duration/model/provider;
  - fallback split: reserve/refund or adjust only the affected segment.
- If a shared MCP account has daily/concurrency limits, the planner preview should show a warning before paid generation when the chosen grouping is likely to exceed available quota.

Credit estimate MVP:

- `per_shot`: use the current per-video-job estimate path.
- `adaptive_multi_shot` / `compact_multi_shot`: estimate by segment count, selected model, and planned segment duration.
- `manual_group_size`: same as multi-shot, but include a warning when the manual group is clamped.
- fallback split: adjust only the affected segment when possible; do not recalculate unrelated completed segments.
- shared MCP provider-account credits must be labeled as provider-account usage, not SmartSpecPro gateway credits.

Media model capability source:

- The resolver should first read structured media-model config metadata, for example `capabilities.videoSegment`.
- Provider-template hints may supply conservative defaults for known MCP templates.
- Display-name heuristics may add warnings or suggested defaults only; they must not enable paid multi-shot generation by themselves.
- If no durable config field exists yet, store capability metadata in existing model config JSON and document any later schema migration separately.

### 12.4 Legacy Migration and Backward Compatibility

Existing Storyboard Review records without `videoSegmentState` must still work.

On read:

1. Detect missing `videoSegmentState`.
2. Synthesize a per-shot `VideoSegmentPlan` from existing tasks.
3. Preserve existing prompt/model/reference fields.
4. Mark `videoSegmentPlan.source = "legacy_synthesized"` in metadata.
5. Persist the synthesized state only when the user saves, regenerates, or starts generation.

This avoids breaking old review pages while letting new regeneration logic operate through the shared contract.

Media History and stored output rule:

- Generated segment output must be imported/stored through the same durable media-history/storage path as existing API/MCP generated videos.
- Storyboard Review, Media History, Video Editor, and Library projections must use SmartSpecPro-managed stored URLs when available.
- Provider temporary URLs may be used only as transient fetch inputs and must not be the canonical saved output URL.

### 12.5 Focused Test Matrix

Required tests before enabling generation behavior:

- planner per-shot parity from existing 9-shot Marketplace plan;
- adaptive grouping for Veo/Kling/Seedance capability profiles;
- fallback when model capability is unknown or too short;
- creative brief accepted, normalized, and included as guidance;
- creative brief conflict warning when it contradicts product truth/reference locks;
- Marketplace Capture handoff persists `videoSegmentState`;
- Storyboard Review legacy record synthesizes per-shot plan;
- Storyboard Review regenerate uses stored segment plan and selected model;
- Storyboard Review edited creative brief marks affected prompts stale;
- stale auto-generated prompts cannot be submitted for paid generation until regenerated or explicitly kept;
- MCP shared model is hidden/blocked when user lacks owned/shared access;
- generated segment outputs are persisted to durable SmartSpecPro media-history/storage URLs rather than saved as provider temporary URLs;
- segment-based credit estimate and fallback adjustment preserve lineage.

---

## 13. Repair and Fallback

### 13.1 Segment Failure

When a multi-shot segment fails:

1. Retry the same segment if the provider error is transient.
2. If content quality fails for one sub-shot, allow targeted repair on the segment.
3. If repeated repair fails, split that segment back to per-shot mode and continue.

For MVP, splitting a paid multi-shot segment back to per-shot tasks requires explicit user confirmation before any paid retry. The UI may prepare the split plan automatically, but it must not submit new paid jobs until the user confirms.

### 13.2 Fallback Conditions

Fallback to per-shot when:

- selected model capability is unknown;
- selected model duration is too short;
- required references exceed provider limits;
- provider rejects multi-shot prompt payload;
- quality checks detect story beat loss across multiple sub-shots;
- user creative brief creates an unresolved conflict with product truth or reference locks;
- user chooses per-shot mode.

---

## 14. Security and Data Safety

- Reference URLs must use the same public URL resolution and SSRF protections as existing media generation.
- Do not expose private storage credentials or provider tokens in segment plans.
- Do not persist raw provider errors that contain temporary media URLs or tokens.
- Segment prompt metadata may include product facts, but must not include private user secrets.
- Provider capability profiles must be admin-governed, not user-editable free text.
- User creative briefs are user-authored content. Sanitize before rendering, audit source user ID, and do not treat brief text as trusted instructions above platform policy.

---

## 15. Observability

Add redacted events for:

- segment plan created;
- creative brief accepted, edited, cleared, or warning-issued;
- segment prompt regenerated from Storyboard Review;
- segment plan fallback;
- segment video submitted;
- segment video completed;
- segment repair requested;
- segment split fallback.

Metrics:

- average segments per run;
- provider jobs saved vs per-shot baseline;
- failure rate by model and mode;
- repair rate by segment group size;
- average generated duration;
- user-selected mode distribution.
- creative brief usage rate and warning rate.

---

## 16. Rollout

### Phase 1: Planning-Only

- Add shared schemas and planner tests.
- Add plan preview behind feature flag.
- No provider generation behavior change.
- Persist planner state into Storyboard Review in shadow mode.
- Persist creative brief in shadow mode and validate conflict warnings without changing prompt output yet.
- Add legacy synthesis on read, but do not persist unless the user saves or regenerates.

### Phase 2: Per-Shot Through Planner

- Route current per-shot behavior through `videoSegmentPlanner`.
- Validate no regression in prompts, references, media history, and Video Editor.
- Route Storyboard Review prompt regeneration through the shared planner/prompt builder while preserving existing UI behavior.
- Enable creative brief to influence per-shot prompts behind feature flag.
- Enforce model access and MCP shared-account eligibility before preview/regeneration.

### Phase 3: Adaptive Multi-Shot Beta

- Enable only for selected video models and tenants.
- Start with conservative grouping:
  - Veo: max 2 sub-shots;
  - Kling: max 3 sub-shots;
  - Seedance: max 4 sub-shots.

### Phase 4: Compact Multi-Shot

- Expand grouping after QA data confirms better quality and lower repair rates.

---

## 17. Future Expansion

This feature intentionally designs for later workflows:

- **Short drama**: scenes, acts, dialogue turns, character continuity, episode arcs.
- **Music video**: beat maps, chorus/verse segmentation, performance/B-roll alternation.
- **Presentation video**: slide groups, narration segments, visual emphasis timing.
- **Media Studio**: user-authored multi-shot prompts from selected images/video references.
- **Production Director**: agent-generated segment planning before storyboard/video execution.
- **Reusable creative brief presets**: saved tone/story directives per brand, product category, campaign, or creator style.

Future expansions should reuse the planner contract and add new `sourceSurface` adapters instead of rewriting segmentation logic per surface.

---

## 18. Acceptance Criteria

MVP is acceptable when:

- Auto Storyboard Review can produce the same per-shot plan through the new planner with no behavior regression.
- Marketplace Capture product initial prompt creation and Storyboard Review prompt regeneration use the same segment planner/prompt-builder contract.
- Advanced Auto options can store and pass a video structure mode.
- Users can optionally provide a creative brief on Marketplace Capture product before starting the plan.
- Storyboard Review can show, edit, clear, and apply the creative brief when regenerating prompts.
- Storyboard Review legacy records without `videoSegmentState` continue to work through synthesized per-shot plans.
- Model availability honors Gateway API config and MCP owned/shared access at preview and generation time.
- The planner can produce deterministic multi-shot segment plans for seeded model capabilities.
- The prompt builder can produce plain-text multi-shot prompts for at least generic and Seedance-style dialects.
- The prompt builder applies user creative brief guidance while preserving product truth, reference locks, model capability limits, and policy constraints.
- The generation path can fall back from multi-shot to per-shot without losing run lineage.
- Paid split fallback requires explicit user confirmation before submitting new paid jobs.
- Storyboard Review can regenerate a prompt after handoff using the stored segment plan, selected video model, frame roles, and product/reference anchors.
- Storyboard Review blocks paid generation for stale auto-generated prompts until regenerated or explicitly kept.
- Storyboard Review can create video prompts later even when the Marketplace run originally stopped at storyboard-only output.
- Video Editor and Media History retain correct output URLs and shot/segment metadata.
- Video Editor and Media History use SmartSpecPro durable stored URLs as canonical outputs, not provider temporary URLs.
- Focused tests cover per-shot parity, adaptive grouping, capability fallback, prompt text, creative brief conflict handling, Storyboard Review regeneration, MCP access eligibility, legacy synthesis, stale prompt blocking, durable output URL persistence, and repair fallback.

---

## 19. Deferred Non-MVP Questions

- Should adaptive multi-shot be default for Seedance 2 after beta, or remain opt-in?
- Should segment grouping be visible before generation as an editable plan, or only summarized?
- How should native audio dialogue timing work when one generated segment contains multiple narration beats?
- Should a segment-level QA model evaluate every sub-shot individually before marking the clip accepted?
- Should creative briefs become reusable saved presets per tenant/brand in a later feature?

---

## 20. Implementation Addenda

### 20.1 Storyboard Source Trim And Disabled Middle Ranges

Implemented Storyboard Review source-trim behavior is captured in:

- `sections/section-07-storyboard-source-trim-and-disabled-ranges.md`

This addendum documents:

- task-level `sourceTrim` metadata;
- head/tail source trim;
- disabled middle ranges for cutting out internal portions of a shot;
- tablet-friendly mark-from-current-frame UX;
- preview playback that skips disabled ranges;
- Capture Preview and Final Composite expectations;
- subtitle/transcription implications;
- future hooks for silence-based auto cuts and derived per-shot rendering.
