# Feature 118: Marketplace Auto Review Create Storyboard And Video Review Auto

Version: 1.0.0
Date: 2026-05-31
Status: Implemented snapshot
Related future spec: `specs/feature/117-production-director-agents-sdk-auto-storyboard-video/spec.md`
Note: Feature 117 remains a proposed future Agents SDK replacement spec. This Feature 118 file records the currently implemented Marketplace Auto Review behavior only.

---

## Purpose

This file records the behavior that is implemented now for Marketplace Capture product auto review creation. It is a factual reference for future work and should be updated when the shipped behavior changes.

This snapshot covers only implemented behavior. It does not describe future Agents SDK replacement work, future QA repair loops, or other planned behavior that is not currently wired in code.

---

## Main Entry Point

The implemented user entry point is the Marketplace Capture product detail page:

- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`

From an opened marketplace product, the user can start `Marketplace Auto Review`.

The UI lets the user choose:

- output mode:
  - `storyboard_images`: create a Production Director Project, generate storyboard images, and create a Storyboard Review handoff.
  - `full_video`: create a Production Director Project, generate images, create Storyboard Review, generate video clips, optionally handle audio, create a Video Editor project, render, and save the final video to Library.
- frame strategy:
  - `auto`
  - `storyboard_3x3_split`
  - `video_shot_start_stop`
- audio strategy for full video:
  - `auto`
  - `native_video_audio`
  - `separate_tts_voiceover`
  - `silent`

If output mode is `storyboard_images`, the UI resets audio strategy to `auto`, and the backend resolves audio to silent because no video audio is generated for storyboard-only output.

The page also shows the current active run, latest run status, stage progress, links to generated downstream surfaces, manual status check, and cancel.

The product detail page includes a back button to return to Marketplace Capture.

---

## API Surface

The tRPC API is implemented in:

- `apps/web/server/routers/marketplaceCapture.ts`

Implemented procedures:

- `startAutoReview`
  - input: `productId`, `outputMode`, `frameStrategy`, `audioStrategy`
  - starts or returns an existing active auto-review run for the same user/product.
- `getAutoReviewRun`
  - returns one durable run and its stages.
  - queues background advancement for active runs.
- `listAutoReviewRuns`
  - returns recent runs, optionally filtered by product.
  - queues background advancement for active runs.
- `advanceAutoReviewRun`
  - manually advances one run.
- `cancelAutoReviewRun`
  - marks a non-terminal run as cancelled.

The router creates a temporary bearer token for media generation when `ctx.userToken` is not present. That token is passed into the run runtime context.

The web server initializes and shuts down the marketplace auto-review background job from:

- `apps/web/server/_core/index.ts`

Startup calls `initializeMarketplaceAutoReviewJob`. SIGTERM and SIGINT shutdown paths call `shutdownMarketplaceAutoReviewJob`.

---

## Data Model

Auto review persistence is implemented by:

- `apps/web/drizzle/0193_marketplace_auto_review_runs.sql`
- `apps/web/drizzle/schema.ts`

Tables:

- `marketplace_auto_review_runs`
- `marketplace_auto_review_stages`

Important run fields:

- `id`
- `tenantId`
- `userId`
- `productId`
- `productionRunId`
- `outputMode`
- `frameStrategy`
- `status`
- `currentStage`
- `stageIndex`
- `stageCount`
- `selectedConceptId`
- `storyboardReviewId`
- `videoEditorProjectId`
- `renderJobId`
- `resultLibraryItemId`
- `resultJson`
- `metadataJson`
- `errorMessage`
- `idempotencyKey`
- `createdAt`
- `updatedAt`
- `completedAt`

Important indexes:

- unique idempotency index on `(userId, idempotencyKey)`.
- partial unique active-run index on `(userId, productId)` where status is `queued`, `running`, or `waiting_provider`.
- product, user/status, and production-run lookup indexes.

Run statuses currently used:

- `queued`
- `running`
- `waiting_provider`
- `completed`
- `failed`
- `cancelled`

Stage rows store:

- stage key and order.
- stage status.
- provider task IDs.
- output JSON.
- error message.
- started/completed timestamps.

---

## Durable Stages

The implemented stage sets are defined in:

- `apps/web/server/services/marketplaceAutoReviewService.ts`

Storyboard-only mode uses:

1. `product_preflight`
2. `production_project`
3. `concept_story`
4. `prompt_plan`
5. `image_generation`
6. `storyboard_review`

Full-video mode uses all storyboard-only stages plus:

7. `video_generation`
8. `audio_generation`
9. `video_edit`
10. `render`
11. `library_finalize`

The service updates `currentStage`, `stageIndex`, and `stageCount` as the run advances so the UI can show where the job is.

---

## Product Truth And Plan Creation

The current planner is deterministic and is implemented in:

- `buildAutoReviewPlan`
- `buildProductTruth`
- `buildProductDetailText`

The service loads product data and supporting Marketplace Capture insights, then builds:

- `ProductTruth`
  - product ID
  - product name
  - brand
  - platform
  - source URL
  - affiliate URL
  - shop
  - price/rating/sold/review signals
  - description
  - specs
  - up to 8 product image URLs
- `productDetail`
  - a `PRODUCT FACTS LOCK` string used in prompts.
  - states that product category, shape, proportions, material, visible construction, label/logo placement, and usage must not be altered beyond product references and facts.
- `storyboardGuide`
  - deterministic 9-shot product review structure.
- `voiceoverScript`
  - Thai narration by shot.
- `shots`
  - 9 shots.
  - each shot is 5 seconds.
  - total default duration is 45 seconds.

The 9-shot structure is:

1. open problem
2. expand pain point
3. product enters as solution
4. proof/detail close-up
5. real usage
6. result
7. expectation guard
8. overall confirmation
9. CTA

The plan is stored in run metadata and is also copied into Production Director project artifacts.

---

## Production Director Project Creation

Every auto-review run creates a Production Director Project using:

- `insertInitialProductionProject`
- `buildInitialProductionSpace`

The project records:

- production run ID.
- production goal.
- production bible.
- plan version.
- approval state.
- product evidence manifest.
- shot product usage.
- generation defaults.
- story concept wizard data.

Current implementation uses `ProductionSpace` and `flowNodes` as the execution substrate for image/video generation.

Image nodes are created according to frame strategy:

- `storyboard_3x3_split`
  - one image node named `storyboard-grid-image`.
  - prompt asks for one 9:16 final canvas containing exactly 9 equal vertical frames in a 3x3 storyboard grid.
- `video_shot_start_stop`
  - 18 image nodes: start and stop frame for each of 9 shots.
  - each node is a single 9:16 photorealistic cinematic frame.

The generated project is auto-approved for this automated flow.

The auto-review service schedules provider work through `scheduleProductionExecution` with:

- `forceExecutionGates: true`
- `forceProviderDispatch: true`

These flags are implemented in `apps/web/server/services/productionSpaceService.ts` and allow this approved automation path to dispatch provider jobs even when normal manual execution gates or global provider dispatch defaults would otherwise block the Production workspace action.

---

## Image Prompt Behavior

Implemented prompt builders:

- `build3x3StoryboardPrompt`
- `buildShotFramePrompt`
- `promptReferenceSection`

Prompt locks include:

- Storyboard Guide is the shot contract.
- Voiceover Script is the dialogue/narration contract.
- Product Detail/Product Facts Lock controls product identity and claims.
- product reference images are immutable.
- cinematic photorealistic commercial style.
- natural skin texture and believable human anatomy.
- real lens depth, grounded shadows, and coherent lighting.
- no text, captions, labels, watermarks, UI, price badges, or random glyphs.
- face should be clearly visible when a person appears unless the shot is explicitly locked as never turning back in video.
- product must not gain drawers, panels, handles, extra shelves, extra logos, alternate materials, alternate colors, or changed proportions.

The 3x3 storyboard prompt requires the image to stay aligned with the corresponding shot narration and not drift into a different story.

---

## Image Generation And Frame Extraction

Image generation is scheduled through the existing Production execution service:

- `scheduleProductionExecution`
- `reconcileProductionExecution`

The automation passes the runtime user token and public URL into production execution so provider tasks and status reconciliation can run without requiring the user to manually open the node canvas.

The run stores:

- `imageAttemptId`
- image node IDs
- media task IDs
- provider task IDs

For `storyboard_3x3_split`:

- the completed grid image is read from the `storyboard-grid-image` output.
- the grid is split into 9 images by `splitStoryboardGrid`.
- `sharp` extracts each cell and stores it under `marketplace-auto-review/{tenantId}/{runId}/frames/...`.
- extracted frame URLs are saved as `storyboardFrameUrls`.

For `video_shot_start_stop`:

- the service reads generated start and stop frame URLs from per-shot nodes.
- frame URLs are saved as `startFrameUrls` and `stopFrameUrls`.
- `storyboardFrameUrls` uses the start frames as the storyboard-visible frame set.

Generated frames are added to Library as image items by `addFrameImagesToLibrary`.

Library metadata includes:

- source type: `marketplace_auto_review_frame`
- marketplace product ID
- production run ID
- auto review run ID
- concept ID
- frame strategy
- output mode
- shot ID/order
- frame role
- product name
- source URL
- storyboard guide
- voiceover

For start/stop strategy, the current code can persist both start and stop frame items, not only the first 9 storyboard frames.

---

## Storyboard Review Handoff

Storyboard Review output is built by:

- `buildStoryboardReviewOutput`
- `createStoryboardReview`

The handoff includes:

- title
- concept ID
- product ID
- production run ID
- output mode
- frame strategy
- audio strategy
- resolved audio strategy
- concept details/product facts
- storyboard guide
- voiceover script
- duration and aspect ratio
- ordered clips

Each clip includes:

- shot ID/order/title
- frame URL/thumbnail URL
- start frame URL
- stop frame URL when available
- generated video prompt
- storyboard guide
- voiceover
- timing
- metadata tying the clip back to product, production run, concept, audio strategy, and reference mode.

The service creates a `mediaStudioStoryboardReviews` record and a `mediaProductionOutputProjections` record for the `storyboard_review` surface.

Storyboard-only runs complete after this stage.

---

## Video Prompt Behavior

Video prompts are built by:

- `buildVideoPrompt`
- `buildVideoVisualPrompt`
- `videoReferenceContract`
- `buildVeo31StoryboardVideoPrompt` in `apps/web/shared/storyboardPromptAudio.ts`

The video prompt always ties the shot to:

- shot title.
- shot storyboard guide.
- shot voiceover/story beat.
- camera movement and camera language.
- visual action.
- product facts lock.
- reference-image contract.

Reference modes:

- `start_stop`
  - `@Image1` is the strict start frame.
  - `@Image2` is the strict stop/end frame.
  - remaining images are product references only.
- `single_storyboard_frame`
  - `@Image1` is the single storyboard frame and the only visual timing anchor.
  - remaining images are immutable product references only.
  - they are not alternate frames and not a stop/end frame.
  - motion should be subtle from the storyboard frame without inventing a second endpoint.

This distinction is implemented to prevent 3x3-cut video prompts from treating product references as stop frames.

---

## Video Generation

Full-video runs add video nodes after Storyboard Review:

- `ensureVideoNodes`
- `buildVideoNode`

For `video_shot_start_stop`, each video node receives:

- start frame URL
- stop frame URL
- up to 3 product reference images
- reference mode: `start_stop`

For `storyboard_3x3_split`, each video node receives:

- one sliced storyboard frame
- up to 4 product reference images
- reference mode: `single_storyboard_frame`

Video generation uses:

- model: `veo3/generate-veo-3-video-lite`
- aspect ratio: `9:16`
- duration: 5 seconds per shot
- fps: 24

Video generation is also scheduled through the existing Production execution service with forced execution gates/provider dispatch for the approved automation run.

The run stores:

- `videoAttemptId`
- video node IDs
- media task IDs
- provider task IDs
- completed `videoClipUrls`

Before continuing, the service verifies that every expected video clip URL exists through `assertCompleteMarketplaceAutoReviewVideoClips`.

---

## Audio Modes

Audio strategy resolution is implemented by:

- `resolveMarketplaceAutoReviewAudioStrategy`

Rules:

- storyboard-only output resolves to `silent`.
- explicit `native_video_audio` stays native video audio.
- explicit `separate_tts_voiceover` stays separate TTS voiceover.
- explicit `silent` stays silent.
- `auto` on Veo 3 / Veo 3.1 style models resolves to `native_video_audio`.
- `auto` on non-native-audio models resolves to `separate_tts_voiceover`.

Native video audio:

- per-shot Thai dialogue is embedded in the Veo prompt.
- non-final shots expand short voiceover text to reduce silent tails.
- native speech target seconds are slightly longer than clip duration for short clips.
- prompts state that Veo can finish a slightly longer line and should avoid a 5-6 second short line or silent tail.

Separate TTS voiceover:

- the video prompt is visual-only and forbids generated speech, dialogue, narration, lip-sync audio, music, sound effects, ambient audio, subtitles, captions, lower thirds, readable text, logos with letters, or random glyphs.
- the service generates one full voiceover script with `mediaGenerationService.generateAudioAsync`.
- completed audio URL and provider task metadata are stored on the run.
- when duration metadata is available, actual audio duration is stored as `audioActualDurationSeconds`.

Silent:

- video prompt forbids generated audio and spoken dialogue.

---

## Video Editor Projection

After all clips and audio state are ready, the service creates a Video Editor project through:

- `buildVideoEditorProject`
- `createVideoEditorProjection`

The editor project includes:

- 1080x1920 settings.
- 30 fps.
- one video track containing ordered generated clips.
- one audio track containing a generated voiceover clip when using `separate_tts_voiceover`.
- generated video assets with prompt, references, product metadata, audio strategy, concept ID, run ID, and shot ID.
- transitions with small fades.
- video asset volume muted when using separate TTS or silent mode.
- source references on each asset:
  - start/stop mode stores start and stop frame references.
  - 3x3 mode stores the sliced storyboard frame reference.

The service creates:

- a `videoEditorProjects` record.
- a `mediaProductionOutputProjections` record for the `video_edit` surface.

---

## Render And Library Finalize

Final render is implemented by:

- `ensureRender`
- `submitRenderJob`
- `addRenderResultToLibrary`

The render project is hashed with `computeRenderHash`.

If a matching render output already exists in storage, the service uses the cached MP4 and completes the run without dispatching a new render job.

Render cache checks use `storageExists` and `storageResolveUrl`. `storageExists` is implemented for:

- local storage.
- S3/R2 through `HeadObjectCommand`.
- Forge storage through signed/download URL lookup.

If render is not cached:

- a render job ID is created.
- render metadata, status, and spec are written to Redis.
- render job TTL is 24 hours.
- the job is added to the user's active and recent render job lists.
- the render is dispatched either to Cloud Tasks or to the Python backend `/api/v1/media/tasks/process-video`, depending on dispatch mode.

Render polling:

- waits while status is queued/running.
- fails if status is `error`.
- fails if status/result disappears or remains incomplete past the stale timeout.
- default stale timeout is 12 hours.
- timeout can be controlled with `MARKETPLACE_AUTO_REVIEW_RENDER_TIMEOUT_MS`, with a 30-minute minimum.

When render completes:

- the first artifact URL is extracted.
- the active render job is removed.
- final MP4 is added to Library.
- `render` stage is completed.
- `library_finalize` stage is completed.
- run status becomes `completed`.

Final Library metadata includes:

- source type: `marketplace_auto_review_render`
- media job ID
- marketplace product ID
- product ID
- production run ID
- auto review run ID
- concept ID
- frame strategy
- output mode
- audio strategy
- resolved audio strategy
- voiceover source
- audio URL when present
- product name
- product source URL

The Library item uses the Production run ID as `projectId`.

---

## Media Studio Render-To-Library Sessions

Media Studio now persists pending render-to-library sessions in local storage for both:

- Storyboard Review compound render.
- Video Shot compound render.

Implemented helpers are in:

- `apps/web/client/src/pages/MediaStudio.tsx`

The stored session includes:

- source: `storyboard_review` or `video_shot`.
- render job ID.
- production run ID when known.
- title.
- traceability metadata.
- started/updated timestamps.

Sessions expire after 7 days. When the user reopens the same Production run, Media Studio resumes tracking the pending render job and restores the metadata needed to save the completed render to Library.

When a render completes, Media Studio removes the local session and calls the Library save mutation with stored metadata. If in-memory metadata is missing, it builds fallback traceability metadata from the current storyboard/video-shot context before saving to Library.

The Storyboard Review standalone page also builds fallback traceability metadata before saving completed compound renders to Library if the original in-memory metadata is no longer available.

---

## Video Shot Workspace QA And Project-Scoped Sync

The Video Shot workspace exposes an `Auto Image QA` switch.

Implemented files:

- `apps/web/client/src/features/media-production/components/VideoShotWorkspace.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`

Behavior:

- the switch controls whether completed start/stop image tasks automatically run image QA.
- the preference is persisted in local storage.
- when disabled, completed image tasks are not automatically sent through image QA.
- video QA for completed video tasks remains automatic.

Media Studio also maps completed image QA status back into History Gallery/Media History cards for production shot frame tasks. The summary can show role, status, mode, and QA summary.

Shot media synchronization is scoped by `productionRunId`. This prevents completed shot media from another Production run from being attached to or displayed as the newest start/stop frame for the currently open run.

---

## Media Studio Production Reference Storyboard Sync

Media Studio Production syncs the selected story concept and product context into the Image tab reference-storyboard skill form.

Implemented in:

- `apps/web/client/src/pages/MediaStudio.tsx`

Current behavior:

- detects the appropriate production reference storyboard skill from the Production space.
- detects product category from the Production space/product context.
- switches the Image tab into advanced mode and selects the resolved storyboard skill.
- syncs these skill fields when available:
  - `generation_mode`: `multi_frame_storyboard`
  - `product_category`
  - `storyboard_layout_preset`: `canvas_9_16_grid_3x3_frame_9_16_exact`
  - `aspect_ratio`
  - `production_concept_details`
  - `storyboard_guide`
  - `voiceover_script`
  - `reference_product_images`
  - `reference_character_images`
  - `reference_environment_images`
  - `marketplace_platform`
  - `product_shop_id`
  - `product_item_id`
  - `product_source_url`
  - `product_shop_name`
  - `product_title`

The force-synced fields keep the image storyboard generation aligned with selected concept details, Storyboard Guide, voiceover script, product references, character references, environment references, and marketplace product metadata.

This implemented sync is the current bridge from Production concept selection to Create Storyboard image generation in the Image tab.

---

## Media Studio Audio TTS Seeding From Selected Concept

When a Production story concept is selected, Media Studio builds a TTS script from that concept and seeds the Audio tab TTS prompt.

Implemented behavior:

- derives the selected concept from the Production story concept wizard.
- builds a TTS script from the selected concept's voiceover beats.
- switches the Audio workflow to `tts`.
- fills the Audio tab prompt when it is empty or still matches the previous auto-seeded script.
- preserves user-edited audio prompt text unless concept selection is forced.
- when the user selects a different concept, the TTS script is force-synced to match that selected concept.

This means a selected Production concept can carry its voiceover into Audio TTS without requiring the user to manually copy the script.

---

## Media Studio History Gallery Project Filter

Media Studio History Gallery supports a project filter tied to the active Production run.

Implemented behavior:

- derives the active Production run ID from the Production Director state or Production space draft.
- default behavior is project-filtered when a Production run ID exists.
- UI shows a switch-style segmented control with:
  - `All`
  - `This project`
- when the filter is on, History Gallery uses the active production run ID to build the project index and show media that belongs to that project.
- when the filter is off, History Gallery shows all recent assets for the selected media tab.
- total counts and pagination behavior account for whether the project filter is active.

This prevents frames, clips, and audio from unrelated projects from appearing as the default working set while still allowing the user to intentionally browse all media.

---

## Background Advancement

Background advancement is implemented in:

- `apps/web/server/jobs/marketplaceAutoReviewJob.ts`
- `queueMarketplaceAutoReviewAdvance`

Active statuses are:

- `queued`
- `running`
- `waiting_provider`

Advancement can happen through:

- product detail UI queries that list or fetch active runs.
- manual `advanceAutoReviewRun`.
- in-process background timers.
- the marketplace auto-review background job.

The background job:

- scans active runs.
- orders them by oldest `updatedAt` first.
- signs a short-lived background token with `media:generate` scope.
- advances each run with durable runtime context.
- skips runs that cannot be advanced because tenant ID is missing.

The in-process timer only schedules advancement when a user token is available.

---

## Active Run Dedupe

The service prevents duplicate active runs for the same user/product in two layers:

1. Server pre-check:
   - before creating a run, the service queries for active runs on the same user/product.
   - if found, it queues advancement and returns the existing run.
2. Database guard:
   - partial unique index on `(userId, productId)` for active statuses.
   - if concurrent inserts race, the service returns the conflicting active run when possible.

---

## Media Panel And Product Asset Attachment

The Marketplace Capture product detail page includes a right-side Media Panel.

Implemented panel tabs:

- History
- Library
- Product

Implemented media tabs:

- Image
- Video
- Audio

The panel has a product filter switch:

- on: show assets that match the opened product.
- off: show all recent assets for the selected media tab.

Users can:

- drag images from History/Library/Product panel into Product Images.
- upload local image files.
- remove attached product images.

Attached product images are then usable as product references in later generation because product truth reads the product image set.

---

## Provenance And Traceability

The implemented flow carries product and project identity across major outputs.

Common metadata keys include:

- marketplace product ID
- product ID
- product name
- source URL
- production run ID
- auto review run ID
- concept ID
- shot ID/order
- frame strategy
- output mode
- audio strategy
- resolved audio strategy
- voiceover source

This metadata is attached to:

- Production Director project artifacts.
- Storyboard Review projection and clip metadata.
- generated image Library items.
- generated video assets in Video Editor.
- render Library item.
- media generation extra params.

---

## Tests Covering The Implemented Behavior

Current focused tests include:

- `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`
- `apps/web/shared/storyboardPromptAudio.test.ts`
- `apps/web/client/src/features/media-production/productionSkillContext.test.ts`
- `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`
- `apps/web/server/routers/__tests__/mediaProduction.execution.test.ts`
- `apps/web/server/services/__tests__/productionSpaceService.test.ts`

Verified behaviors include:

- full video on Veo 3.1 Lite resolves to native video audio when audio strategy is `auto`.
- storyboard-only output resolves to silent even if native audio is requested.
- short non-final native speech is expanded to reduce silent tails.
- Veo prompts contain Thai dialogue pacing guidance.
- separate TTS video prompts remain visual-only.
- incomplete video clip sets fail assembly.
- 3x3 split video prompts treat the sliced frame as one storyboard frame plus product references, not as start/stop frames.
- shared video prompt helper does not invent `@Image2` for single storyboard frame mode.

Recent verification commands used for this implementation:

```bash
npm --prefix apps/web run test -- server/services/__tests__/marketplaceAutoReviewService.test.ts shared/storyboardPromptAudio.test.ts
NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check
npm --prefix apps/web run test -- client/src/features/media-production/productionSkillContext.test.ts client/src/lib/storyboardReviewWorkspace.test.ts shared/storyboardPromptAudio.test.ts server/routers/__tests__/mediaProduction.execution.test.ts server/services/__tests__/productionSpaceService.test.ts server/services/__tests__/marketplaceAutoReviewService.test.ts
git diff --check
```
