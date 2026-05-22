# Gemini Omni Suite Media Assets

## Status

Draft for implementation.

## Summary

Implement Kie.ai Gemini Omni as a coherent "Gemini Omni Suite" in SmartSpecPro instead of exposing raw provider fields directly to users.

The suite has three provider capabilities:

- Gemini Omni Video: creates videos with prompt, image references, one source video, reusable character IDs, and reusable audio IDs.
- Gemini Omni Character: creates a reusable character asset and stores the returned `characterId`.
- Gemini Omni Audio: creates a reusable voice or audio asset and stores the returned `kieAudioId`.

The user-facing UX must keep Video as the primary workflow and present Character and Audio as reusable reference asset tools. Users should not need to understand raw provider keys such as `audio_ids`, `character_ids`, or `video_list`.

## Source Documents

- Kie.ai Gemini Omni Video: `https://docs.kie.ai/market/gemini-omni-video`
- Kie.ai Gemini Omni Character: `https://docs.kie.ai/market/gemini-omni-character`
- Kie.ai Gemini Omni Audio: `https://docs.kie.ai/market/gemini-omni-audio`

Current provider contract from docs:

- Video endpoint: `POST /api/v1/jobs/createTask`, model `gemini-omni-video`.
- Character endpoint: `POST /api/v1/omni/character/create`, model `gemini-omni-character`.
- Audio endpoint: `POST /api/v1/omni/audio/create`, model `gemini-omni-audio`.
- Video input quota is 7 units:
  - each image in `image_urls` consumes 1 unit
  - each video in `video_list` consumes 2 units
  - each character ID in `character_ids` consumes 1 unit
  - maximum 1 video per request
  - maximum 3 character IDs per request
- Source-video entries use provider spelling `{ url, start?, ends? }`.
- Source-video validation should accept tenant upload URLs (`/uploads/...` and `/api/storage/files/...`) before resolving them to public/provider-fetchable URLs.
- Character creation accepts only 1 image, max 20 MB.
- `audio_ids` used by Video and Character must come from Gemini Omni Audio.

## Product Goals

- Make Gemini Omni usable without exposing provider implementation details.
- Support the updated Kie.ai Gemini Omni API family accurately.
- Fix the confusing reference image/video UX where synced fields appear as locked inputs.
- Add an asset-aware Gemini Omni prompt/director skill so users do not need to manually reason about how images, video, character IDs, and audio IDs should work together.
- Add a Gemini Omni prompt/video QA and learning loop that feeds structured improvement signals into the existing skill improvement workflow.
- Provide clear asset lifecycle:
  - create or select Character asset
  - create or select Audio asset
  - use selected assets in Video generation
- Enforce provider limits before credit reservation or provider submission.
- Keep pricing accurate across Node reserve path and Python gateway fallback path.
- Preserve existing Media Studio behavior for non-Gemini models.
- Add a centralized Media Studio Production/Director workflow for goal-driven cinematic storytelling and product campaigns.
- Add a plan/storyboard approval step after goal definition so users can review and revise the LLM-generated production plan before batch execution.
- Let Production/Director use all supported Media Studio systems for image, video, audio, TTS, sound, character, product, and reference asset preparation.
- Treat Gemini Omni Video, Seedance 2, and future qualified video models as final production-grade provider candidates selected by fit, not as hard-coded workflow assumptions.
- Build and verify required production assets before expensive final video generation.
- Loop planning, asset preparation, prompts, QA, and targeted revisions until the output is aligned with the production goal or the system reaches budget/policy/human-review limits.

## Non-goals

- Full generic asset registry redesign for every provider.
- Editing or deleting provider-side Gemini Omni assets if Kie.ai does not expose a documented delete/update API.
- Bulk import of historical Kie.ai audio or character assets.
- Making `audio_ids` or `character_ids` manually editable in the normal user flow.
- Replacing existing separate voice/music workflows.
- Replacing the existing general-purpose video prompt skills. Gemini Omni needs its own asset-aware skill because its planning constraints differ from generic video models.
- Building a separate skill self-learning system that duplicates Feature 112's QA/skill improvement architecture.
- Removing existing Image, Video, or Audio tabs from Media Studio. The Production/Director workflow coordinates them; it does not replace them.
- Guaranteeing every provider can satisfy every production-grade cinematic requirement. Provider selection must degrade or block based on actual capability.
- Auto-spending final render credits while required assets, product truth, quality gates, budget, or provider fit are unresolved.

## User Experience Requirements

### UX Architecture Decision

Gemini Omni must use a two-layer UX:

1. **Primary layer: Gemini Omni Video workflow**
   - This is the only Gemini Omni surface most users need to understand.
   - It lives in the existing Media Studio video tab and follows the existing prompt -> references -> settings -> generate structure.
   - It uses existing Reference Images and Reference Videos picker patterns where possible.
2. **Secondary layer: Gemini Omni Reference Assets**
   - Character and Audio are supporting asset creators/selectors.
   - They should appear as compact panels or modals launched from the Video workflow, not as competing "video model" choices.
   - They may also be accessible from an admin/debug model list, but that is not the default creative workflow.

This avoids presenting three unrelated Gemini Omni models to users while keeping the implementation aligned with Kie.ai's three endpoint contracts.

### Existing System Fit

The design should preserve current Media Studio mental models:

- Image and video references remain in the existing upload/drop/library picker areas.
- Model-specific settings remain in the dynamic input panel.
- Provider-specific raw fields remain hidden unless the user is in admin/debug configuration.
- Reusable provider IDs are handled by a new Gemini Omni asset picker, not by `LibraryFilePicker`, because `LibraryFilePicker` selects file URLs while Gemini Omni assets select provider IDs.

Required new UI components:

- `GeminiOmniReferenceAssetsPanel`: shows selected characters, selected voices/audio assets, and the reference-unit meter.
- `GeminiOmniCharacterCreateDialog`: creates a character asset and returns/selects the saved `characterId`.
- `GeminiOmniAudioCreateDialog`: creates a voice/audio asset and returns/selects the saved `kieAudioId`.
- `GeminiOmniAssetPicker`: multi-select picker for provider assets, filtered by asset type and tenant access.

These components should be Gemini-specific first. Do not generalize into a full provider-asset framework until at least one more provider needs the same abstraction.

### Media Studio Production Director

Media Studio should add a higher-level `Production` or `Director` tab for users who want an end-to-end cinematic/storytelling workflow instead of starting from a specific model tab.

This tab should collect a `ProductionGoal`:

- what kind of film, video, ad, product review, brand story, tutorial, customer journey, or campaign the user wants
- target audience, platform, language, duration, aspect ratio, and delivery constraints
- product or marketplace context when relevant
- character/cast requirements
- voice, narration, dialogue, sound, music, or silence strategy
- cinematic style, pacing, lighting, camera language, and continuity rules
- budget and quality target

ProductionGoal must be easy to read and adjust. It should be presented as a visual goal canvas, not a long technical form.

Recommended UI structure:

- Goal Summary Card: one short plain-language sentence describing the desired output.
- Output Type Cards: film, product review, ad, brand story, tutorial, UGC, customer journey, or custom.
- Audience/Platform Chips: audience segment, language, platform, aspect ratio, duration.
- Product/Brand Card: product, shop, brand voice, CTA, evidence readiness.
- Character/Voice Cards: cast, narrator, dialogue/voiceover strategy, reusable assets.
- Visual Style Board: selectable style cards, reference thumbnails, mood/lens/lighting tags.
- Story Arc Mini Timeline: hook, setup, proof/demo/escalation, payoff, CTA.
- Constraints and Avoid Chips: things to avoid, claim limits, policy limits, budget guardrails.
- Readiness Strip: missing inputs, estimated complexity, likely providers, and next action.

The canvas should summarize complex structured data into scannable cards, badges, thumbnails, and short labels. Advanced fields should stay collapsed until needed. Users should be able to edit the goal by clicking the relevant card instead of hunting through one large form.

Add starter templates so users do not start from a blank canvas:

- product review short
- TikTok Shop trend short
- Shopee product support video
- cinematic brand story
- UGC ad
- tutorial/demo
- customer journey campaign
- character dialogue scene

Templates should fill sensible defaults but remain editable. Applying a template should show what changed and should not overwrite imported product evidence or selected assets without confirmation.

Add an AI clarify step for incomplete goals. If the goal is too vague, Media Studio should ask for only the few missing decisions that materially affect the plan, such as audience, product, duration, platform, voice strategy, or CTA. The user should still be able to continue with reasonable defaults when policy allows it.

Recommended component map:

- `ProductionGoalCanvas`
- `GoalSummaryCard`
- `OutputTypeSelector`
- `AudiencePlatformChips`
- `ProductBrandContextCard`
- `CharacterVoiceCards`
- `VisualStyleBoard`
- `StoryArcMiniTimeline`
- `ConstraintsChips`
- `GoalReadinessStrip`
- `ProductionGoalTemplatePicker`
- `ProductionGoalRevisionDrawer`

Every graphic element must support the user's understanding or decision-making. Avoid decorative-only graphics that make the goal harder to scan. Reference thumbnails, style cards, icons, timelines, and badges must have text labels and accessible names.

The underlying data should still remain structured and complete for skills, QA, provider selection, and audit. The visual canvas is a presentation/editing layer, not a lossy simplification of `ProductionGoal`.

ProductionGoal edits should be versioned enough to support review and rollback:

- current goal version
- previous goal version
- template applied, if any
- changed cards/fields
- user or AI actor
- timestamp
- optional reason

When the planner revises the storyboard because the goal changed, the UI should show a concise diff of affected scenes/assets/provider assumptions before the user approves the new plan.

After the goal is saved, the system should run a dedicated planning skill under `apps/web/skills`:

`apps/web/skills/media-production-storyboard-planner`

This skill should use LLM reasoning to create a reviewable plan package before batch execution:

- production goal interpretation
- production bible draft
- creative strategy
- storyboard outline
- scene timeline
- shot plan
- asset requirements
- provider candidate plan
- batch execution plan
- credit/time estimate
- risks and assumptions
- approval checklist

The user must be able to inspect the generated plan/storyboard before any asset-generation batch, provider video generation, final render, or export work starts.

The user can:

- approve and start the batch
- revise the entire plan
- revise only a scene
- revise only a shot
- revise dialogue/voiceover
- revise product claims
- revise asset requirements
- revise provider selection
- revise batch order
- lock approved scenes/assets and revise only selected targets

The approved plan becomes the input for provider-specific Director skills. For example, Gemini Omni Video Director should convert the approved storyboard and asset plan into Gemini Omni-ready prompts, reference plans, and provider payload decisions.

After the planner produces or revises the plan, the system should run a second bounded LLM verification skill:

`apps/web/skills/media-production-plan-verifier`

This verifier checks whether the plan is likely to achieve the goal before the user approves batch execution. It should verify goal alignment, story completeness, audience/platform fit, asset requirements, provider feasibility, product truth, budget risk, batch order, missing decisions, and downstream readiness for Storyboard Review and Video Edit.

The verifier should return structured verdicts:

- `pass`
- `warning`
- `revise`
- `human_review`
- `block`

If the verifier requests revision, the planner should revise only the targeted parts where possible. Default maximum verifier-guided revisions: 2. The user sees the verified plan and any warnings before approving.

The system should convert the approved plan into a `ProductionBible`, `ProductionAssetPlan`, storyboard/scene plan, provider plan, quality gate, and final render plan.

### Orchestration Runtime Decision

The production workflow should avoid turning the MVP into a large autonomous-agent platform.

Default approach:

- use `media-production-storyboard-planner` for plan/storyboard creation
- use `media-production-plan-verifier` for LLM verification
- use deterministic state transitions in the web app/server for approval gates, credit gates, asset readiness, provider submission, and output routing

Agency Swarm:

- optional for high-risk or high-value productions as a reviewer pack
- useful when multiple specialist personas should challenge the plan, such as Product Truth, Cinematic Direction, Cost Risk, or Marketplace Journey
- not required for normal ProductionGoal planning in MVP
- must be behind feature flag/tenant policy because it adds latency, cost, and operational complexity

LangGraph:

- useful for long-running, checkpointed batch execution when the production workflow becomes too large for ordinary durable job/state-machine handling
- not required for initial plan approval or simple batch execution if the existing media task/state system can express the states safely
- should be introduced only behind a runtime adapter if checkpoint/resume/branching needs exceed the existing implementation

OpenAI Agents Python:

- may power planner/verifier execution only through the existing Python adapter/shared skill-runtime boundary when that runtime is enabled
- should not be imported directly into Node or Media Studio frontend
- should not expand the legacy `agency_swarm_adapter.py` for this feature

This keeps the solution production-grade without making the first implementation unnecessarily large.

Production output must support two downstream routes:

- Storyboard Review: for narrative/storyboard review, approvals, revision requests, and final storyboard render.
- Video Edit: for user-controlled editing, trimming, ordering, overlays, captions, audio mixing, and manual export.

These routes receive projections of the production output. They must not become the source of truth for provider submission, credit reservation, provider asset snapshots, QA/learning state, or historical generation metadata.

Image, Video, and Audio tabs remain standalone. Production mode uses them as execution surfaces for preparing assets when needed. For example, it may route the user to:

- an image model for product keyframes or mood frames
- Gemini Omni Character for reusable character assets
- Gemini Omni Audio or another audio/TTS system for voice assets
- existing video models for draft/reference clips
- Gemini Omni Video, Seedance 2, or another qualified provider for final render

Provider-specific fields must stay behind readiness summaries and advanced/debug views. The default user should see creative intent, asset readiness, cost, quality status, and next actions.

Planning and asset readiness checks must not reserve final provider credits. Credit reservation is allowed only after the production quality gate and provider preflight pass, or after an authorized human override that does not bypass hard policy, Feature 115 hard blocks, budget, or tenant restrictions.

Batch asset generation and provider submission must also wait for plan/storyboard approval. Approval bypass should be disabled for normal users and allowed only through an audited internal/admin policy.

### Gemini Omni Suite Entry

Media Studio should present Gemini Omni Video as the main model/workflow. Character and Audio should be accessible from the Video workflow as reference asset actions:

- "Create character reference"
- "Create voice/audio reference"
- "Select saved character"
- "Select saved voice/audio"

Admin surfaces may still show the three underlying capabilities for configuration and debugging.

### Video Workflow

The user-facing Video form should show:

- Prompt
- Reference Images
- Source Video
- Gemini Omni References panel:
  - Character References
  - Voice / Audio References
  - Reference-unit meter
- Duration
- Resolution
- Aspect Ratio
- Seed only when advanced settings are enabled

The form must not show raw JSON fields for `audio_ids`, `character_ids`, or `video_list`.

Recommended layout in the current Media Studio video tab:

1. Prompt editor and Auto Prompt skill area remain unchanged.
2. Existing Reference Images picker remains where users already expect it.
3. Existing Reference Videos picker remains where users already expect it, but Gemini Omni clamps it to one video.
4. Gemini Omni References panel appears below the file reference pickers and above model settings.
5. Duration, Resolution, Aspect Ratio, and advanced Seed remain in the settings grid.

The panel should be hidden for non-Gemini models.

### End-to-End User Flows

#### Flow A: One Clip Without Saved Assets

1. User selects `Gemini Omni Video`.
2. Media Studio auto-selects `Gemini Omni Video Director`.
3. User enters a brief prompt.
4. User optionally adds reference images or one source video using existing pickers.
5. Gemini Omni References panel shows:
   - no saved characters selected
   - no saved voices selected
   - current reference-unit usage
6. User clicks Auto Prompt.
7. Video Director returns prompt package.
8. Prompt QA runs.
9. If Prompt QA passes, the Generate button shows the final estimated credit cost.
10. User generates video.
11. Video QA runs after completion and appears on the completed task card.

This flow must work even if the user never creates Character or Audio assets.

#### Flow B: Create And Use Character Asset

1. User opens Gemini Omni References panel.
2. Empty state shows `Create character`.
3. User opens `GeminiOmniCharacterCreateDialog`.
4. User supplies character name, description, and one reference image.
5. Optional: user selects a saved Gemini Omni voice/audio asset.
6. System creates the provider asset through Kie.ai Character endpoint.
7. Dialog closes.
8. New character is selected automatically in the Video workflow.
9. Reference-unit meter increments by 1.

The user must not be redirected to Admin or a separate model page.

#### Flow C: Create And Use Audio Asset

1. User opens Gemini Omni References panel.
2. Empty state shows `Create voice`.
3. User opens `GeminiOmniAudioCreateDialog`.
4. User supplies display name, voice description, and example dialogue.
5. System creates the provider asset through Kie.ai Audio endpoint.
6. Dialog closes.
7. New voice/audio asset is selected automatically in the originating workflow.

The UI should describe this as a reusable voice/audio reference, not as an uploaded audio file.

#### Flow D: Multi-shot Single Video

1. User selects delivery mode `One clip - multi-shot`.
2. User chooses or accepts automatic shots per clip.
3. Video Director creates one prompt item with multiple shot beats.
4. Prompt QA checks that the beats fit the selected duration.
5. Generation creates one Gemini Omni video.
6. Video QA evaluates the one clip as a single result.

The UI should show this as one generation, not as multiple queued videos.

#### Flow E: Storyboard Multi-video

1. User selects delivery mode `Storyboard - multiple clips`.
2. User chooses clip count and shots-per-clip guidance.
3. Video Director creates one prompt item per clip.
4. Prompt QA checks per-clip feasibility and cross-clip continuity.
5. Media Studio queues multiple Gemini Omni video generations.
6. Each clip may contain multiple planned shots in one Gemini Omni generation.
7. Video QA runs per completed clip.
8. Storyboard review shows clip-level QA and global continuity status.

The UI should make clear that credits are charged per generated clip.

Storyboard review should reuse the existing Storyboard Review workspace as a downstream review surface through a Gemini Omni handoff adapter. The Gemini Omni run remains authoritative for provider submission, credit reservation/refund, callback/polling recovery, QA, learning, and provider asset snapshots.

The handoff adapter should create or update review-task projections with:

- `storyboardRunId`
- `clipId`
- clip order
- prompt and shot list
- model, duration, aspect ratio, and resolution
- selected reference asset snapshot
- backend/provider task identifiers when available
- generated platform media URL when available
- Prompt QA and Video QA summaries
- review status and source surface `gemini_omni_video`

Review-only placeholders created before actual generation must not submit provider jobs or reserve credits. Storyboard Review comments, approvals, and revision requests should return to Gemini Omni as review feedback or a new revision attempt, not as direct edits to provider assets, credit records, or historical task metadata.

Video Edit should also be available as a downstream output target. The Video Edit handoff should create or update an editable project with:

- production run ID / storyboard run ID
- scene and clip order
- generated clip media
- prompt and shot metadata
- selected reference asset snapshots
- voiceover/dialogue text
- audio/music/sound references where available
- captions/subtitle drafts when available
- product evidence and claim warnings when relevant
- QA badges and known issues
- provider/model metadata
- edit-safe provenance IDs

Implementation should reuse the existing Video Editor project contract where possible, especially `VideoEditorProject` and the storyboard-to-editor helper pattern used by `buildStoryboardVideoProject`. Do not invent a second timeline/project format for Gemini Omni or Production Director unless the existing contract is proven insufficient.

If the production output has reviewable prompts but not completed media yet, the Video Edit handoff may create a draft project with non-renderable placeholders only when the existing editor can represent them safely. Otherwise `Open in Video Edit` should remain disabled until at least one usable media clip exists, with a clear reason.

Video Edit changes are edit-layer changes. Trims, splits, reorders, overlays, caption edits, audio mixes, manual clip replacements, and exported media must not mutate the original provider submission payload, credit ledger, provider asset records, generated media metadata, or QA/learning evidence. If the platform later wants to learn from edited outputs, that must be a separate explicit learning action with consent/policy handling.

Media Studio should show two separate actions when output is ready:

- `Review Storyboard`
- `Open in Video Edit`

Both actions can be used on the same production output without duplicating provider jobs or charging final provider credits again.

Storyboard Review render and Video Edit export may still have their own render/export cost or queue behavior if the existing video pipeline charges or schedules those operations separately. That cost must be shown as composition/export cost, not confused with provider generation credits.

#### Flow F: Cinematic Storyboard Production

Gemini Omni should support a higher-level production mode for story-driven videos, not only isolated clip generation. This mode lives in Media Studio but must stay connected to Storyboard Review.

The user should be able to define:

- story premise / campaign objective
- target audience and platform
- narrative arc: hook, setup, escalation, payoff, call-to-action
- cinematic style: genre, lens/camera language, lighting, pacing, color, transition style
- cast/characters from Gemini Omni Character assets
- voice strategy:
  - no voice
  - voiceover narration using Gemini Omni Audio assets
  - character dialogue/lipsync using character + audio assets when provider capability supports it
  - mixed narration + dialogue
- sound/music direction
- per-scene duration and emotional beat

Media Studio should present this as a `Cinematic Storyboard` layer above clip settings:

1. Story Bible: global premise, characters, voice/audio, cinematic style, continuity rules.
2. Scene/Beat Timeline: ordered scenes, per-scene intent, shot beats, dialogue/voiceover, references, duration.
3. Gemini Omni Clip Plan: provider-ready clip prompts with selected image/video/character/audio refs and quota usage.
4. Storyboard Review: downstream review for continuity, timing, QA, clip approval, revisions, and storyboard render.
5. Video Edit: downstream manual editing workspace for trimming, ordering, overlays, captions, audio mix, and user-controlled export.

Storyboard Review should show the generated clips as a coherent story timeline, not only independent task cards. It should surface:

- scene number and narrative beat
- continuity notes from the Director skill
- character/voice/audio assets used per clip
- voiceover/dialogue text attached to the clip
- lipsync/dialogue intent when applicable
- cinematic QA badges for continuity, framing, motion, lighting, pacing, and audio alignment
- global story quality score and per-clip issue markers

If Gemini Omni or Kie only supports audio-driven output through `audio_ids` but not a dedicated lipsync flag, the UI must describe the mode as `character dialogue/audio-guided performance` rather than guaranteeing lipsync. The plan should still preserve lipsync intent in the prompt/QA metadata so future provider support can be enabled without changing the user workflow.

### UI State Requirements

Gemini Omni UI must define these states explicitly:

- **No model selected**: hide Gemini Omni panels.
- **Gemini Omni selected, no assets**: show reference asset empty states with create actions.
- **Provider unavailable or API key missing**: disable asset creation and generation with provider readiness message.
- **Asset creation pending**: show inline progress in the dialog and prevent duplicate submissions.
- **Asset creation failed**: keep form values, show actionable provider error, and allow retry.
- **Prompt QA pending**: show a compact checking state before generation.
- **Prompt QA blocked**: show blocking issues and disable generation unless the issue is explicitly override-safe.
- **Prompt QA warnings only**: allow `Revise prompt` or `Use anyway`.
- **Video generation pending**: show normal Media Studio task progress.
- **Video QA pending**: show completed media with a "checking quality" badge, not a blocking spinner.
- **Video QA failed**: show retry/revise actions according to QA recommendation.

### Credit and Cost UX

Gemini Omni Video must show estimated cost in a way users can understand:

- For one clip: show one estimated cost.
- For storyboard mode: show cost per clip and total estimated cost.
- If source video is selected, explain that video input changes the pricing branch.
- Prompt QA must run before credit reservation whenever possible.
- Video QA must not charge extra unless it triggers a user-approved regeneration.
- Regeneration or prompt revision that generates another video must show the new cost before submission.

### Progressive Disclosure

Default Gemini Omni UI should stay compact:

- Always visible:
  - prompt
  - image/video references
  - Gemini Omni References panel summary
  - duration, resolution, aspect ratio
  - delivery mode
  - estimated cost
- Collapsed advanced details:
  - seed
  - reference plan
  - full QA comments
  - provider payload preview
  - raw asset IDs

Raw provider IDs may appear only in advanced/debug views, never as required normal-user inputs.

### Localization Requirements

All new user-facing labels must have Thai and English strings. Minimum Thai labels:

- `ผู้กำกับวิดีโอ Gemini Omni`
- `ตัวละครอ้างอิง`
- `เสียงอ้างอิง`
- `สร้างตัวละคร`
- `สร้างเสียง`
- `ใช้แล้ว {{used}} / {{limit}} reference units`
- `วิดีโออ้างอิงใช้ 2 units`
- `ตรวจ Prompt`
- `ตรวจคุณภาพวิดีโอ`
- `แก้ Prompt`
- `สร้างใหม่`

Do not hard-code English-only labels in Media Studio for Gemini Omni-specific controls.

### Responsive and Accessibility Requirements

The Gemini Omni References panel must work on desktop and mobile:

- Desktop: show selected character/audio assets in compact rows or chips with thumbnails when available.
- Mobile: stack pickers and quota meter vertically; action buttons must remain reachable without horizontal scrolling.
- Long asset names must truncate safely with tooltip/title text.
- All create/select/remove buttons must have accessible labels.
- Dialogs must trap focus, support keyboard close, and return focus to the launching button.
- Quota errors and QA blocking messages must be announced in the same pattern as existing form validation.
- Color-coded pass/warn/fail states must also include text labels, not color alone.

### Review Surface Placement

Gemini Omni QA results should appear in two places:

1. **Before generation**
   - Prompt QA summary appears near the Auto Prompt area and Generate button.
   - Blocking issues prevent generation.
   - Warning-only issues allow `Revise prompt` or `Use anyway`.
2. **After generation**
   - Video QA summary appears on the task/result card.
   - Storyboard mode also surfaces clip-level QA in the existing Storyboard Review flow.

Full QA details should be expandable. The default collapsed view should show only:

- score/pass state
- top issue
- recommended action

### Feature Flags and Rollout UX

Add rollout controls so the suite can ship safely:

- `GEMINI_OMNI_SUITE_ENABLED`
- `GEMINI_OMNI_ASSET_CREATION_ENABLED`
- `GEMINI_OMNI_PROMPT_QA_ENABLED`
- `GEMINI_OMNI_VIDEO_QA_ENABLED`
- `GEMINI_OMNI_AUTO_LEARNING_ENABLED`
- `MEDIA_PRODUCTION_DIRECTOR_ENABLED`
- `MEDIA_PRODUCTION_GOAL_CANVAS_ENABLED`
- `MEDIA_PRODUCTION_STORYBOARD_PLANNER_ENABLED`
- `MEDIA_PRODUCTION_PLAN_VERIFIER_ENABLED`
- `MEDIA_PRODUCTION_DUAL_OUTPUT_ENABLED`
- `MEDIA_PRODUCTION_AGENCY_REVIEWERS_ENABLED`
- `MEDIA_PRODUCTION_LANGGRAPH_BATCH_ENABLED`

Safe default:

- suite enabled only when Kie.ai provider is configured and model is enabled
- asset creation enabled only for internal/admin rollout first
- prompt QA enabled before video QA
- Production Director disabled until persistence, planner, verifier, and approval gates are ready
- goal canvas can be enabled for planning-only preview before batch execution is enabled
- plan verifier required before normal-user batch start when Production Director is enabled
- dual output enabled only after Storyboard Review and Video Edit projection mappings are durable and idempotent
- Agency reviewer packs and LangGraph batch runtime disabled by default
- auto-learning records can be collected before recommendations are surfaced
- auto skill patching remains disabled

Delivery must be slice-gated. Each slice should be independently releasable, testable, and rollbackable, and later slices must not be enabled unless earlier data contracts, migrations, flags, and tests have passed:

1. Foundation and persistence: additive metadata, pricing, provider asset records, production run/version records, feature flags, and diagnostics only.
2. Gemini Omni base video: prompt/image/video references and corrected credit calculation, without saved character/audio asset creation for broad users.
3. Goal canvas planning preview: visual `ProductionGoal` editing and saved goal versions, with no provider submission.
4. Planner/verifier approval: skills produce and verify a reviewable plan/storyboard package, but batch execution remains disabled until approval records persist.
5. Provider asset creation/selection: Gemini Omni Character and Audio assets can be created, stored, selected, audited, and rolled back without affecting non-Gemini flows.
6. Cross-modal asset readiness: ProductionAssetPlan can prepare or request required assets through existing Image, Video, and Audio tabs without final render submission.
7. Internal batch execution: gated asset/video generation and quality loop for internal/admin tenants only.
8. Dual output projections: idempotent Storyboard Review and Video Edit handoffs after projection mappings and stale-write checks are proven.
9. Marketplace/Feature 115 storytelling: product truth, claim map, image fidelity, and customer journey checks enabled for product campaigns.
10. Optional advanced runtimes: Agency reviewer packs and LangGraph batch runtime only after default deterministic workflow is stable.

When a flag is disabled, the UI should degrade gracefully:

- asset creation disabled: picker still shows existing assets if available; create buttons show disabled reason
- prompt QA disabled: generation still works with a small "QA disabled" debug note only in admin/debug context
- video QA disabled: completed task cards do not show QA state
- Production Director disabled: Image, Video, Audio, Gemini Omni, Storyboard Review, and Video Edit remain usable through existing flows
- planner/verifier disabled: batch execution disabled for normal users; internal/admin manual test paths require audited override
- dual output disabled: completed production media remains accessible, but handoff buttons show disabled reason

### Gemini Omni Director Skill UX

Gemini Omni Video should default to a dedicated Auto Prompt skill:

- Skill ID: `gemini-omni-video-director`
- Display name: `Gemini Omni Video Director`
- Thai display name: `ผู้กำกับวิดีโอ Gemini Omni`

The skill appears in the existing Auto Prompt skill area when Gemini Omni Video is selected. It should be selected by default for this model, while still allowing the user to change skills if the current system supports that.

The skill must support three output modes:

1. **Single shot**
   - One final prompt for one generated video.
   - Best for simple prompt-only or prompt-plus-reference requests.
2. **Multi-shot single video**
   - One generated video containing multiple planned beats/shots.
   - The output is still one final prompt, plus an internal shot plan.
   - Best when the selected duration is enough for several beats in the same clip.
3. **Storyboard multi-video**
   - Multiple video clip prompts, each clip can contain its own multi-shot plan.
   - Best for product stories, campaigns, explainers, and longer narratives assembled from multiple Gemini Omni generations.

The UI should expose this as one concise mode selector:

- `One clip - simple shot`
- `One clip - multi-shot`
- `Storyboard - multiple clips`

The user should not need to understand implementation terms such as `prompt_sequence`, `character_ids`, or `audio_ids`.

### Reference Image and Video UX

Reference image and source video fields must use picker-backed controls, not read-only text boxes that look disabled.

The dynamic input panel may show synced fields as informational status, but the editable controls must be the actual upload/library/drop pickers.

Requirements:

- Reference Images picker accepts model-supported image files.
- Source Video picker accepts exactly one video for Gemini Omni Video.
- If the model does not support a reference type, the picker is disabled with an explicit reason.
- If the model supports the reference type, the picker must be interactive.
- The helper text should explain where the selected assets will be sent, e.g. "Sent to Kie.ai as image_urls" only in advanced/debug contexts.

### Character Asset UX

Users can create a Gemini Omni Character asset from:

- character name
- description
- exactly one reference image
- optional audio reference selected from saved Gemini Omni Audio assets

On success the system stores:

- provider: `kie.ai`
- capability: `gemini-omni-character`
- provider asset ID: `characterId`
- character name
- image URL returned by Kie.ai when available
- source reference image metadata
- tenant/user ownership metadata

The Video workflow lets users select up to 3 saved character assets.

The create dialog must close by returning to the Video workflow with the newly created character selected by default. This prevents the user from feeling sent to a separate product area.

Empty state:

- Title: "No saved characters yet"
- Primary action: "Create character"
- Secondary text: "Characters can be reused in future Gemini Omni videos."

### Audio Asset UX

Users can create a Gemini Omni Audio asset from:

- audio ID slug or system-generated slug
- display name
- voice description
- example dialogue

On success the system stores:

- provider: `kie.ai`
- capability: `gemini-omni-audio`
- provider asset ID: `kieAudioId`
- display name
- voice description
- example dialogue
- tenant/user ownership metadata

The Video and Character workflows let users select saved Gemini Omni Audio assets.

The create dialog must close by returning to the originating workflow with the newly created audio asset selected by default.

Empty state:

- Title: "No saved voices yet"
- Primary action: "Create voice"
- Secondary text: "Voices can be reused in Gemini Omni videos and character creation."

### Quota Meter

Gemini Omni Video must show a quota meter before generation:

- Image references: 1 unit each
- Source video: 2 units
- Character references: 1 unit each
- Total limit: 7 units

The UI must block generation with a clear message when:

- total units exceed 7
- more than 1 source video is selected
- more than 3 characters are selected
- an invalid asset type is selected

Example labels:

- `4 / 7 reference units used`
- `1 source video uses 2 units`
- `Character references are limited to 3`

The Gemini Omni Director skill must read the same quota context and produce warnings instead of silently planning prompts that require unavailable references or exceed limits.

## Gemini Omni Video Director Skill Requirements

### Skill Package

Create a new skill package under:

`apps/web/skills/gemini-omni-video-director`

Required files:

- `SKILL.md`
- `skill.md`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json`
- `references/input_contract.md`
- `references/output_contract.md`
- `references/maintenance.md`
- `scripts/verify.sh`
- optional implementation runtime under `python/` or `js/` only if the repo's skill execution path requires it

The schemas must be complete and must follow existing skill conventions:

- JSON Schema for input/output contracts.
- Section-based `ui.schema.json` compatible with the current DynamicSkillForm loader.
- No nested-only fields that become invisible in the UI.
- Rich nested structures may exist in input/output schema, but the UI schema must provide practical flat controls for normal users.

### Skill Purpose

The skill is an asset-aware video director for Gemini Omni. It must not behave like a generic text-to-video prompt enhancer.

It must reason about:

- how selected images should be used: product, character, style, setting, composition, outfit, prop, or continuity reference
- how the optional source video should be used: motion source, edit target, style source, pacing reference, or visual continuity source
- how selected Gemini Omni Character assets should appear and remain consistent
- how selected Gemini Omni Audio assets should be used as voice identity, narration identity, dialogue voice, or sound/mood reference
- how the 7-unit reference budget affects prompt planning
- how to preserve continuity across multi-shot and multi-video outputs
- when to ask the user to create a missing Character or Audio asset before generation

### Input Contract

The input schema must support these logical groups:

- `request`
  - user's plain-language goal
  - required
- `delivery_mode`
  - `single_shot`
  - `multi_shot_single_video`
  - `storyboard_multi_video`
- `clip_count`
  - 1 for single clip modes
  - 2-12 for storyboard mode
- `shots_per_clip`
  - 1-8
  - may be `auto`
- `duration_seconds`
  - 4, 6, 8, or 10 per Gemini Omni clip
- `aspect_ratio`
  - `16:9`, `9:16`, or provider-supported values
- `resolution`
  - `720p`, `1080p`, `4K`
- `language`
  - `auto`, `th`, `en`
- `creative_goal`
  - `cinematic`
  - `product_demo`
  - `ugc_ad`
  - `story`
  - `character_scene`
  - `music_video`
  - `explainer`
- `reference_context`
  - selected image reference summaries and URLs
  - selected source video summary and URL
  - selected character asset names and provider IDs
  - selected audio asset names and provider IDs
  - unit costs and total unit limit
- `continuity_preferences`
  - preserve character identity
  - preserve product identity
  - preserve environment
  - preserve camera style
  - preserve voice identity
- `avoid`
  - things to avoid, including text overlays, new logos, distorted faces, extra limbs, product changes, or unsupported claims

UI schema should flatten the common controls:

- Request / concept textarea
- Delivery mode select
- Clip count number, shown only for storyboard mode if the UI system supports conditional fields; otherwise clearly labeled as storyboard-only
- Shots per clip select or number
- Creative goal select
- Tone / style textarea
- Avoid textarea
- Language select
- Include voice/dialogue direction toggle
- Include sound/music direction toggle

Reference context should be auto-filled by Media Studio from selected assets. Users should not manually paste provider IDs in the normal UI.

### Output Contract

The output schema must return structured JSON with:

- `skill_name`
- `skill_version`
- `delivery_mode`
- `reference_plan`
- `continuity_rules`
- `quota_assessment`
- `final_prompt`
- `prompt_sequence`
- `storyboard`
- `warnings`
- `generation_readiness`

`reference_plan` must explain:

- which images are used and their role
- whether the source video is used and its role
- which character assets are used and their role
- which audio assets are used and their role
- total reference units used

`prompt_sequence` must support all modes:

- Single shot: exactly one prompt item.
- Multi-shot single video: exactly one prompt item with multiple `shots`.
- Storyboard multi-video: one prompt item per clip, and each prompt item may contain multiple `shots`.

Each prompt item must include:

- `clip_id`
- `clip_index`
- `duration_seconds`
- `final_prompt`
- `short_prompt`
- `shots`
- `reference_usage`
- `audio_direction`
- `negative_guidance`
- `quality_notes`

Each shot must include:

- `shot_index`
- `time_range`
- `visual_action`
- `camera_direction`
- `subject_continuity`
- `reference_usage`
- `audio_or_dialogue_intent`

`generation_readiness` must be:

- `ready`
- `needs_character_asset`
- `needs_audio_asset`
- `needs_reference_adjustment`
- `blocked`

The skill must return warnings when:

- planned reference usage exceeds 7 units
- more than one source video is selected
- more than 3 character assets are selected
- the user's request requires a character or voice identity but no reusable asset exists
- selected references conflict with each other
- prompt asks for unsupported claims or visible text overlays

### Prompting Rules

The skill must:

- write provider-facing prompts in natural creative language
- avoid exposing raw IDs in the final prompt body
- keep provider IDs only in structured `reference_usage`
- keep Gemini Omni prompt wording focused on how to use references, not on generic cinematic filler
- explicitly preserve selected product/character/voice identity when relevant
- avoid asking the model to create new logos, unreadable text, or unsupported product claims
- keep each clip feasible for the chosen duration
- keep each storyboard clip independently generatable while preserving continuity across clips

### Integration Rules

Media Studio should pass this skill:

- current prompt
- selected image refs
- selected source video
- selected Gemini Omni character assets
- selected Gemini Omni audio assets
- duration/resolution/aspect ratio
- delivery mode
- storyboard clip count and shots-per-clip preferences

Media Studio should consume:

- `final_prompt` for single-clip generation
- `prompt_sequence` for multi-video/storyboard generation
- `warnings` for inline user feedback
- `reference_plan` for preview/debug display

For storyboard mode:

- each generated video clip uses its own prompt item
- each prompt item may contain multiple shots in one Gemini Omni generation
- selected character and audio assets should carry across clips unless the skill explicitly marks a clip-specific override

### Tests for Skill

Add skill verification that checks:

- required files exist
- input schema validates a single-shot request
- input schema validates a multi-shot single-video request
- input schema validates a storyboard multi-video request
- output schema validates examples for all three delivery modes
- no normal UI field requires manual `character_ids` or `audio_ids`
- `ui.schema.json` uses the section format expected by the app
- quota warnings appear in over-limit fixture output
- cinematic storyboard fixture validates story bible, cast map, voice map, scene timeline, continuity graph, and provider plan
- learning recommendation fixture validates issue categories and evidence shape
- schema snapshots fail if required Media Studio handoff fields are removed
- `scripts/verify.sh` validates schemas, fixtures, and contract snapshots without calling live providers

### Skill Package Completeness Checklist

Each Gemini Omni skill package must follow the app's existing skill conventions and include:

- `SKILL.md` for runtime instructions
- `skill.md` manifest/frontmatter with stable `name`, `description`, `category`, `version`, `icon`, `tags`, `auto_trigger`, `enabled_by_default`, `credit_multiplier`, `priority`, and `execution_mode`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json`
- `references/input_contract.md`
- `references/output_contract.md`
- `references/maintenance.md`
- `fixtures/` with passing and failing examples
- `tests/tests.json` or equivalent structured fixture assertions used by existing skill verification
- `scripts/verify.sh`
- optional `skill.lock.json` or version snapshot when the existing registry expects lock metadata

All three skills must use structured JSON outputs. Free-form prose may appear only inside fields such as `final_prompt`, `comments`, or `revision_instructions`.

The Director output schema must include these top-level fields:

- `skill_name`
- `skill_version`
- `contract_version`
- `delivery_mode`
- `generation_readiness`
- `story_bible`
- `narrative_arc`
- `cast_map`
- `voice_map`
- `audio_map`
- `scene_timeline`
- `continuity_graph`
- `prompt_sequence`
- `reference_plan`
- `provider_plan`
- `pricing_hint`
- `qa_handoff`
- `warnings`
- `learning_context`

For non-cinematic single-shot requests, story-level fields may be minimal but must still exist as empty or defaulted structures so Media Studio can consume one contract shape.

The Prompt QA and Video QA output schemas must include:

- stable issue categories
- severity
- target level: `story`, `scene`, `clip`, `shot`, `voice_line`, `asset`, `provider_quota`, `pricing`, or `policy`
- revisability
- recommended action
- revision instructions
- learning signal candidates
- contract version

Fixture matrix:

- single-shot no assets
- single-shot with image references
- source-video branch
- character + audio references
- over-quota failure
- missing character asset
- missing audio asset
- multi-shot single video
- storyboard multi-video
- cinematic storyboard with voiceover
- cinematic storyboard with audio-guided character dialogue
- metadata-only video QA
- visual/video-inspection video QA placeholder
- QA failure producing learning recommendation candidate
- invalid output missing required handoff fields

Skill maintenance rules:

- instruction changes must not remove schema fields
- learning recommendations default to pending human review
- auto-apply is disabled unless tenant policy explicitly enables it
- every recommendation includes evidence count, issue category, affected contract version, proposed patch, risk level, and rollback note

### Production-Grade Skill Verification Loop

Gemini Omni skills must support a verification loop before any expensive video provider call. The loop exists to reduce wasted credits from weak prompts, wrong assets, broken continuity, unsupported audio/lipsync expectations, and over-quota provider payloads.

The pre-generation loop should be:

```text
User brief + selected assets
  -> Director produces structured plan
  -> Script validators check schema, quota, pricing, references, and provider contract
  -> Reviewer subagents inspect specialized dimensions
  -> Prompt QA aggregates reviewer verdicts
  -> If blocked/revisable: Director revises with reviewer feedback
  -> Repeat until pass, max attempts, budget limit, or human review
  -> Only then reserve credits and submit Gemini Omni Video
```

Required reviewer subagent roles:

- Story Continuity Reviewer: narrative arc, scene order, emotional beats, continuity graph.
- Gemini Omni Provider Constraint Reviewer: 7-unit reference quota, source video limit, character cap, audio/character ID validity, duration/resolution support, provider-safe lipsync wording.
- Cinematic Direction Reviewer: camera language, framing, lighting, motion, pacing, transitions, production value.
- Character & Identity Reviewer: character asset consistency, role continuity, wardrobe/pose/motion changes, product/brand identity.
- Voice & Audio Reviewer: voiceover/dialogue fit, audio asset assignment, timing, audio-guided performance intent.
- Cost & Risk Reviewer: per-clip and total credits, skill/QA costs, retry budget, probability of wasted generation, missing inputs.
- Safety/Policy Reviewer: claims, visible text/logo risks, private media handling, consent/policy requirements.

These reviewers may be implemented as internal skill calls, subagent-like orchestration roles, deterministic scripts, or a hybrid. The user experience should show one concise quality gate result, not seven separate noisy reports.

Allowed helper scripts:

- Python or JavaScript scripts may be added under the skill package, for example `scripts/validate_contract.py`, `scripts/score_story_plan.js`, `scripts/check_quota.py`, or `scripts/fixture_eval.py`.
- Scripts must run offline against JSON fixtures and local schemas by default.
- Scripts must not call live Kie/provider endpoints unless a separate explicit live-smoke flag is set.
- Script output must be machine-readable so CI and Media Studio can distinguish pass, warning, revisable, blocked, and contract-drift states.

Quality gate outputs must include:

- `gate_status`: `pass`, `warning`, `revise`, `human_review`, or `block`
- `confidence_score`
- `credit_risk_score`
- `expected_quality_score`
- `blocking_issues`
- `revision_instructions`
- `reviewer_verdicts`
- `max_attempts_reached`
- `allowed_next_actions`

Default loop limits:

- max Director revision attempts before generation: 3
- max reviewer aggregation passes per revision: 1
- max total pre-generation loop attempts: 4
- stop early when credit risk remains high after two revisions
- require human review when reviewers disagree on a high-risk issue

Media Studio must not reserve provider generation credits while this pre-generation quality gate is `revise`, `human_review`, or `block`.

## Gemini Omni QA and Learning Loop

### Design Principle

Gemini Omni should reuse the existing skill QA and improvement architecture described in Feature 112 instead of inventing a second learning system.

This feature adds Gemini-specific QA skills and telemetry hooks:

- Prompt QA runs after `gemini-omni-video-director` returns a prompt package and before video generation.
- Video Quality QA runs after each generated Gemini Omni video completes.
- Repeated QA failures become structured skill improvement recommendations using the existing `media-studio-auto-learning` recommendation path.
- Applying skill changes remains reviewable, versioned, and rollback-safe.

### Required QA Skill Packages

Create these additional skills under `apps/web/skills`:

1. `gemini-omni-prompt-qa`
2. `gemini-omni-video-quality-qa`

Both skills must include:

- `SKILL.md`
- `skill.md`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json`
- `references/input_contract.md`
- `references/output_contract.md`
- `references/maintenance.md`
- `scripts/verify.sh`

### Prompt QA Skill

Skill ID: `gemini-omni-prompt-qa`

Purpose:

- Review the structured output from `gemini-omni-video-director` before credits are spent on video generation.

Prompt QA must check:

- final prompt exists and is usable
- prompt matches delivery mode
- single-shot prompt is not over-complicated
- multi-shot single-video prompt fits selected duration
- storyboard mode has one prompt item per requested clip
- each storyboard clip can be generated independently
- continuity rules are clear across clips
- selected character/audio assets are used consistently
- reference roles are explicit but not raw-ID-heavy
- total planned reference units stay within 7
- source video use is clear when selected
- prompt avoids visible text overlays, fake claims, product deformation risks, and conflicting instructions

Output schema must include:

- `skill_name`
- `skill_version`
- `passed`
- `score`
- `threshold`
- `comments`
- `blocking_issues`
- `recommended_action`
- `revision_instructions`
- `learning_signals`

`recommended_action` values:

- `approve`
- `revise_prompt`
- `ask_user`
- `create_missing_asset`
- `block`

If `recommended_action` is `revise_prompt`, Media Studio may call `gemini-omni-video-director` again with `revision_instructions`, subject to max-attempt limits.

### Video Quality QA Skill

Skill ID: `gemini-omni-video-quality-qa`

Purpose:

- Review generated Gemini Omni video outputs against the original request, prompt package, selected references, and provider constraints.

Video QA should support both automatic metadata-based review and future vision/video model review. If frame/video inspection is unavailable, it should return `inspection_mode: metadata_only` and avoid overclaiming visual judgments.

Video QA must check:

- output exists and is playable
- duration is close to requested duration when metadata is available
- aspect ratio/resolution match request when metadata is available
- prompt adherence when visual inspection is available
- reference image/product/character continuity when visual inspection is available
- source video intent adherence when a source video was used
- audio/voice intent adherence when audio metadata or inspection is available
- visible text artifacts or unsupported claims when visual inspection is available
- whether the clip is suitable for storyboard assembly

Output schema must include:

- `skill_name`
- `skill_version`
- `inspection_mode`
- `passed`
- `score`
- `threshold`
- `comments`
- `blocking_issues`
- `regeneration_recommendation`
- `prompt_revision_instructions`
- `learning_signals`

`regeneration_recommendation` values:

- `keep`
- `regenerate_same_prompt`
- `revise_prompt_then_regenerate`
- `request_new_reference`
- `manual_review`
- `block`

### QA Loop State Machine

Gemini Omni generation should support this loop:

```text
User brief and selected references
  -> Gemini Omni Video Director
  -> Gemini Omni Prompt QA
  -> if prompt QA passes: reserve credits and generate video
  -> if prompt QA fails and is revisable: revise with Video Director
  -> Generated Gemini Omni Video
  -> Gemini Omni Video Quality QA
  -> if video QA passes: complete
  -> if video QA suggests same-prompt regenerate: retry within limits
  -> if video QA suggests prompt revision: revise prompt and regenerate within limits
  -> if attempts exhausted or blocked: route to human review
```

Default controls:

- max prompt revision attempts: 2
- max same-prompt regenerate attempts: 1
- max total attempts per clip: 3
- human review required after max attempts
- auto skill patching disabled by default

Storyboard mode applies the loop per clip, while retaining global continuity signals across clips.

### Learning Data Capture

Every Gemini Omni skill run and QA result should store enough data to support later improvement:

- skill ID and version
- input hash
- selected model ID
- delivery mode
- sanitized reference summary
- prompt package
- prompt QA result
- media task ID
- provider task ID when available
- generated result URL or library item ID
- video QA result
- user feedback if provided
- final outcome: accepted, regenerated, revised, rejected, or manually overridden

Do not store raw private media content in learning records. Store asset IDs, summaries, hashes, URLs already allowed by existing task/library policy, and redacted provider metadata.

### Planner, Verifier, And Evidence Security

Production planner and verifier inputs can include untrusted evidence from marketplace pages, Feature 115 handoffs, user-provided briefs, reference media metadata, OCR/DOM text, comments, and prior AI output.

Security rules:

- Treat marketplace DOM/OCR/review text, product descriptions, comments, filenames, captions, and prior model output as untrusted evidence.
- Put untrusted evidence in clearly labeled evidence blocks, never inside system instructions.
- Do not allow untrusted evidence to redefine the production goal, policy, tool permissions, provider choice, budget, approval state, or output routing.
- Prefer normalized product/insight records and evidence IDs over raw HTML, raw OCR, or long free-form marketplace text.
- Cap evidence size and summarize before planner/verifier calls.
- Strip or neutralize prompt-control text, script tags, hidden page text, tracking URLs, signed URL query strings, and account/contact/header noise.
- Validate planner/verifier JSON output against schema and reject tool/action instructions that are not part of the contract.
- Persist redacted prompts, summaries, hashes, IDs, and contract versions; avoid storing raw marketplace DOM, raw private media content, or unbounded planner/verifier transcripts by default.
- Apply tenant retention policy to ProductionGoal versions, plan versions, verifier results, and approval records.

Planner/verifier cost and token usage should be tracked separately from provider generation credits. Users should see planning/verification cost policy when it is not included by tenant plan.

### Skill Improvement Recommendations

The system should aggregate recurring Gemini Omni issues into pending recommendations instead of editing skills automatically.

Recommendation source:

- `media_studio_auto_learning`

Recommendation triggers:

- repeated prompt QA failures for the same issue category
- repeated video QA failures after prompt QA passed
- user repeatedly regenerates or rejects clips with similar QA comments
- quota misuse patterns caused by skill planning
- continuity failures in storyboard mode

Recommendation output must include:

- affected skill: usually `gemini-omni-video-director`, sometimes QA skill itself
- issue categories
- evidence count
- example redacted cases
- proposed instruction changes
- risk level
- expected contract impact

Skill patching must follow the existing review/apply/rollback flow used by `skillUpgradeApplier`. No automatic production skill edits should happen in the MVP.

### Human Review UX

Media Studio should surface QA results without overwhelming users:

- Prompt QA warnings appear before generation with actions:
  - `Use anyway`
  - `Revise prompt`
  - `Create missing asset`
- Video QA results appear on completed task cards or storyboard review:
  - pass/fail score
  - top 1-3 issues
  - recommended action
  - retry/revise buttons when allowed
- Advanced details can expand to show full QA comments and reference plan.

### QA and Learning Tests

Add tests that verify:

- prompt QA blocks over-limit reference plans before credit reservation
- prompt QA can request a revision and the director receives revision instructions
- video QA metadata-only mode does not claim visual inspection
- failed video QA can recommend regenerate-same-prompt or revise-prompt flows
- max attempts route to human review
- learning records are redacted and include skill version/input hash
- repeated QA failures produce a pending skill improvement recommendation, not an auto-applied patch

## Data Model Requirements

Introduce a dedicated provider asset table for Gemini Omni reusable IDs. Do not store `characterId` or `kieAudioId` only as `library_items`, because existing library pickers are URL/file-oriented and would blur the difference between a reusable provider ID and a normal media file.

Recommended table: `media_provider_assets`.

Required logical fields:

- `id`
- `tenantId`
- `ownerUserId`
- `provider`
- `capability`
- `assetType`: `gemini_omni_character` or `gemini_omni_audio`
- `providerAssetId`
- `displayName`
- `description`
- `thumbnailUrl`
- `sourceMetadata`
- `providerResponse`
- `status`: `ready`, `failed`, or `archived`
- `visibility`: `private` initially; future-compatible with team sharing
- `libraryItemId`: nullable link to `library_items` when the asset also has a useful preview/source file
- `createdAt`
- `updatedAt`

Uniqueness:

- `(tenantId, provider, capability, providerAssetId)` should be unique.

Relationship to `library_items`:

- Use `media_provider_assets` as the source of truth for provider IDs.
- Optionally create or link a `library_items` row only when there is a usable preview file, source reference image, or generated media file that belongs in the library.
- Asset pickers must query provider assets by `assetType`, not library files by extension.

Access:

- Users may only select assets owned by their tenant or otherwise explicitly shared.
- Admin/domain admin rules should follow existing media/library tenant rules.

Provider response storage:

- Store redacted provider response metadata for debugging.
- Do not store API keys, request headers, signed callback secrets, or raw sensitive payloads.

## Model Catalog and Config Requirements

### Gemini Omni Video

Seed and static fallback metadata must include:

- `modelId`: `gemini-omni-video`
- `modelType`: `video`
- `provider`: `kie.ai`
- `apiEndpoint`: `/api/v1/jobs/createTask`
- `apiQueryEndpoint`: `/api/v1/jobs/recordInfo`
- `apiPayloadFormat`: `market`
- `kieModelId`: `gemini-omni-video`
- `generateType`: `multimodal-video`
- `maxReferenceImages`: 7, but constrained by quota when video/characters are selected
- `maxReferenceVideos`: 1
- `maxCharacterReferences`: 3
- `referenceUnitLimit`: 7
- `supportedDurations`: 4, 6, 8, 10
- `supportedResolutions`: 720p, 1080p, 4K

Input fields:

- `image_urls`, type `image_urls`, sync with `reference_images`, hidden from dynamic editable fields
- `video_list`, type `video_urls`, sync with `reference_videos`, hidden from dynamic editable fields, max 1
- `character_ids`, type `provider_asset_picker`, asset type `gemini_omni_character`, max 3
- `audio_ids`, type `provider_asset_picker`, asset type `gemini_omni_audio`
- `duration`, select, pricing field
- `resolution`, select, pricing field
- `aspect_ratio`, select, sync with Media Studio aspect ratio if the API continues to accept it; omit if docs no longer support it
- `seed`, number, advanced only

Payload shape:

```json
{
  "model": "gemini-omni-video",
  "callBackUrl": "https://example.com/callback",
  "input": {
    "prompt": "Create a cinematic product video.",
    "image_urls": ["https://.../image.png"],
    "video_list": [{ "url": "https://.../source.mp4", "start": 0, "ends": 8 }],
    "character_ids": ["character_id"],
    "audio_ids": ["kie_audio_id"],
    "duration": "4"
  }
}
```

### Gemini Omni Character

Seed and static fallback metadata must include:

- `modelId`: `gemini-omni-character`
- `modelType`: `asset`
- `provider`: `kie.ai`
- `apiEndpoint`: `/api/v1/omni/character/create`
- `apiPayloadFormat`: `asset_create`
- `kieModelId`: `gemini-omni-character`
- `generateType`: `asset-character`

Input fields:

- `character_name`, text, required
- `description`, text/textarea, required
- `image_urls`, image picker, required, max 1, max 20 MB
- `audio_ids`, type `provider_asset_picker`, asset type `gemini_omni_audio`, optional

Response handling:

- Extract `data.characterId`.
- Extract `data.characterName` when present.
- Extract `data.imageUrl` when present.
- Store as `gemini_omni_character` asset.

### Gemini Omni Audio

Seed and static fallback metadata must include:

- `modelId`: `gemini-omni-audio`
- `modelType`: `asset`
- `provider`: `kie.ai`
- `apiEndpoint`: `/api/v1/omni/audio/create`
- `apiPayloadFormat`: `asset_create`
- `kieModelId`: `gemini-omni-audio`
- `generateType`: `asset-audio`

Input fields:

- `audio_id`, text, optional if the system can generate a stable slug
- `name`, text, required
- `voice_description`, textarea, required
- `example_dialogue`, textarea, required

Response handling:

- Extract `data.kieAudioId`.
- Extract `data.name`.
- Store as `gemini_omni_audio` asset.

## Pricing Requirements

Gemini Omni Video pricing must follow the matrix supplied by the user:

Without video input:

- 720P/1080P: 4s 450, 6s 600, 8s 750, 10s 900 platform credits
- 4K: 4s 1050, 6s 1200, 8s 1350, 10s 1500 platform credits

With video input:

- 720P/1080P: 1200 platform credits per generation
- 4K: 1800 platform credits per generation

Pricing implementation requirements:

- Normalize duration for pricing keys separately from provider payload values.
- Provider payload may use `"4"` while pricing tier key may use `4s`.
- Presence of a source video must select the `with-video` branch.
- Absence of a source video must select the `without-video` branch.
- Character and audio asset selection should not change Video pricing unless Kie.ai publishes separate pricing.
- Character and Audio asset creation must have separate credit costs configured in their own model records.

## Backend Requirements

### Node/Web Layer

- Media Studio request building must send:
  - `referenceImageUrls`
  - `referenceVideoUrls`
  - selected `character_ids`
  - selected `audio_ids`
  - normalized `duration`
  - normalized `resolution`
- Credit estimation must include source-video presence when computing Gemini Omni Video pricing.
- Validation must run before credit reservation.
- Feature flags must gate Gemini Omni Suite, asset creation, prompt QA, video QA, and auto-learning independently.
- Storyboard mode must create one media task per clip while preserving shared run metadata for review and learning.
- Existing image/video/audio generation paths must not regress for other models.

### Frontend State Ownership

Media Studio should keep Gemini Omni state separate from generic model input values:

- generic `modelInputValues` handles standard dynamic fields such as duration/resolution/seed
- existing `referenceImages` and `referenceVideos` remain the source of truth for file references
- new Gemini Omni state owns selected provider assets:
  - selected character asset IDs
  - selected audio asset IDs
  - delivery mode
  - clip count
  - shots per clip
  - prompt QA result
  - video QA result summaries keyed by task/clip

This separation prevents `character_ids` and `audio_ids` from becoming user-editable raw JSON fields.

### Python Provider Layer

- Keep Gemini Omni Video on the existing async task submission and polling path.
- Add provider support for non-task asset creation endpoints:
  - `/api/v1/omni/character/create`
  - `/api/v1/omni/audio/create`
- Asset creation endpoints must not require a task ID.
- Asset creation responses must be parsed by capability:
  - Character returns `characterId`
  - Audio returns `kieAudioId`
- Provider errors must surface actionable messages without leaking sensitive headers or raw credentials.

## Validation Requirements

Client and server validation must enforce the same rules:

- Gemini Omni Video:
  - prompt required
  - reference unit total <= 7
  - source videos <= 1
  - character references <= 3
  - selected character assets must be `gemini_omni_character`
  - selected audio assets must be `gemini_omni_audio`
  - duration must be one of 4, 6, 8, 10
  - resolution must be one of 720p, 1080p, 4K
- Gemini Omni Character:
  - character name required
  - description required
  - exactly one image required
  - image size <= 20 MB when size metadata is known
  - selected audio assets must be `gemini_omni_audio`
- Gemini Omni Audio:
  - name required
  - voice description required
  - example dialogue required
  - generated or user-entered `audio_id` must be slug-safe

## Admin UX Requirements

Admin > Media Models must support the metadata needed for Gemini Omni without requiring manual JSON edits:

- `provider_asset_picker` field type or equivalent metadata
- hidden user-facing synced fields
- max item counts
- reference unit weights
- pricing aliases and presence labels
- advanced-only fields
- endpoint payload format: `market` vs `asset_create`

Quick Presets must include:

- Kie Gemini Omni Video
- Kie Gemini Omni Character
- Kie Gemini Omni Audio

Applying presets must not silently discard unsupported metadata.

Admin separation:

- Admin > Media Models configures the provider/model contracts.
- Normal users create/select Gemini Omni assets from Media Studio.
- Admin UI may inspect provider asset records in a future Admin > Media Assets view, but that is not required for the first implementation.

## Migration and Rollout Requirements

- Existing `gemini-omni-video` DB rows must be updateable via seed without duplicate rows.
- Existing incomplete Gemini Omni configs should be overwritten only for known managed fields.
- If old configs contain raw `audio_ids` fields, migration should preserve them only in admin/debug context and hide them from normal users.
- Feature should be safe when no Gemini Omni assets exist yet:
  - Video generation remains possible with prompt/images/video only.
  - Character and Audio pickers show empty states with create actions.

Rollout sequence:

1. Ship foundation and persistence changes with all new Gemini Omni/Production UI hidden behind flags.
2. Enable Gemini Omni Video with prompt/image/video references and corrected pricing only.
3. Enable Gemini Omni Video Director skill and Prompt QA.
4. Enable visual ProductionGoal canvas as planning-only preview; provider submission remains disabled.
5. Enable Production Storyboard Planner and Plan Verifier with approval records, still without batch execution for normal users.
6. Enable provider asset creation for internal/admin users, then Character/Audio asset selection for broader users.
7. Enable cross-modal ProductionAssetPlan readiness and routing to existing Image, Video, and Audio tabs.
8. Enable internal/admin batch execution with quality gate, budget/concurrency preflight, and post-generation QA.
9. Enable idempotent Storyboard Review and Video Edit output projections.
10. Enable marketplace/Feature 115 product storytelling checks after product evidence contracts are verified.
11. Enable Video QA summaries and learning recommendation surfacing after enough QA data exists.
12. Consider optional Agency reviewer packs or LangGraph batch runtime only after default deterministic workflow is stable.

Rollback:

- Disabling `GEMINI_OMNI_SUITE_ENABLED` hides new Gemini Omni panels but should not delete provider assets.
- Existing generated media and provider assets remain available in admin/debug surfaces.
- Existing non-Gemini Media Studio flows must remain usable during rollback.

## Test Plan

### Unit Tests

- `mediaModelInputs` parses hidden/synced/asset picker metadata.
- Gemini Omni Video Director skill package contains all required files and valid schemas.
- Gemini Omni Video Director input schema accepts single-shot, multi-shot single-video, and storyboard multi-video fixtures.
- Gemini Omni Video Director output schema accepts structured outputs for all three delivery modes.
- Gemini Omni Prompt QA and Video Quality QA skill packages contain all required files and valid schemas.
- Gemini Omni Prompt QA output schema validates approve, revise, create-missing-asset, and block examples.
- Gemini Omni Video Quality QA output schema validates metadata-only and visual-inspection examples.
- Gemini Omni reference support reports image and video support correctly.
- Gemini Omni video limit returns max 1 video.
- Gemini Omni quota validation rejects over-limit combinations.
- Gemini Omni learning signal aggregation creates pending recommendations without auto-applying skill patches.
- Pricing calculator selects:
  - 1080p 4s without video -> 450
  - 1080p 10s without video -> 900
  - 4K 4s without video -> 1050
  - 4K 10s without video -> 1500
  - 1080p with video -> 1200
  - 4K with video -> 1800
- Duration normalization supports provider value `4` and pricing key `4s`.

### Frontend Tests

- Gemini Omni Video shows interactive reference image and source video pickers.
- Dynamic synced fields do not render as confusing disabled editable inputs.
- Source Video picker blocks a second video.
- Quota meter updates for images, one video, and character selections.
- Character/audio empty states offer create actions.
- Raw `audio_ids`, `character_ids`, and `video_list` are not shown as JSON text fields in normal mode.
- Gemini Omni Video defaults to the Gemini Omni Video Director Auto Prompt skill.
- Gemini Omni Video Director UI shows normal creative controls and does not require manual provider IDs.
- Prompt QA warnings appear before generation and support revise/use-anyway paths.
- Video QA summary appears on completed Gemini Omni task cards or storyboard review clips.
- Mobile layout stacks the Gemini Omni References panel without horizontal overflow.
- Feature flags hide or disable Gemini Omni controls with clear user-facing reasons.
- Storyboard mode shows per-clip estimated cost and total estimated cost.

### Backend Tests

- Node media router forwards selected reference asset IDs into `extraParams`.
- Node credit reservation uses video presence pricing branch.
- Node generation flow runs prompt QA before credit reservation when Gemini Omni QA is enabled.
- Node generation flow stores skill run and QA learning records with redacted references.
- Python provider builds Gemini Omni Video payload with:
  - `image_urls`
  - `video_list: [{ url, start?, ends? }]`
  - `character_ids`
  - `audio_ids`
  - `duration`
- Python provider parses Gemini Omni Character response into an asset result.
- Python provider parses Gemini Omni Audio response into an asset result.
- Non-Gemini Kie models keep current submit/poll behavior.

### Integration/Smoke Tests

- Create Gemini Omni Audio asset.
- Create Gemini Omni Character asset using one image and optional audio asset.
- Run Gemini Omni Video Director for a single-shot clip and generate one Gemini Omni Video.
- Run Gemini Omni Prompt QA before the single-shot clip generation.
- Run Gemini Omni Video Quality QA after the single-shot clip completes.
- Run Gemini Omni Video Director for a multi-shot single clip and generate one Gemini Omni Video with the generated prompt.
- Run Gemini Omni Video Director for a storyboard multi-video plan and generate multiple Gemini Omni Videos, with each clip using its own multi-shot prompt.
- Generate Gemini Omni Video with:
  - prompt only
  - prompt + images
  - prompt + one source video
  - prompt + character asset
  - prompt + audio asset
  - prompt + all valid reference types under 7 units

## Acceptance Criteria

- Users can generate Gemini Omni Video without seeing provider raw JSON fields.
- Users can create and reuse Gemini Omni Character assets.
- Users can create and reuse Gemini Omni Audio assets.
- Reference image and source video controls are interactive for Gemini Omni Video.
- Video generation blocks invalid reference combinations before charging credits.
- Pricing matches the published/user-provided matrix.
- Provider payloads match Kie.ai docs.
- Character and Audio responses are stored as reusable assets, not treated as media result URLs.
- Existing non-Gemini Media Studio models and reference picker behavior continue to pass tests.

## Implementation Slices

### Slice 1: Metadata and Validation Foundation

- Extend model input metadata for hidden fields, asset picker fields, reference unit weights, max video references, and advanced-only fields.
- Add Gemini Omni validation helpers and tests.
- Normalize duration for pricing.

### Slice 2: Gemini Omni Video Director Skill

- Create `apps/web/skills/gemini-omni-video-director`.
- Add complete `SKILL.md`, `skill.md`, input/output/ui schemas, references, examples, and verification script.
- Add fixtures for single-shot, multi-shot single-video, and storyboard multi-video outputs.
- Wire Gemini Omni Video to default to this Auto Prompt skill when selected.

### Slice 3: Gemini Omni QA and Learning Loop

- Create `apps/web/skills/gemini-omni-prompt-qa`.
- Create `apps/web/skills/gemini-omni-video-quality-qa`.
- Add prompt QA before credit reservation and generation.
- Add video QA after Gemini Omni task completion.
- Store redacted skill run, QA, and outcome records for learning.
- Create pending skill improvement recommendations from repeated QA failures.
- Keep automatic skill patching disabled by default.

### Slice 4: Provider Asset Contract

- Add storage and service APIs for Gemini Omni provider assets.
- Add Python provider asset creation handling for Character and Audio.
- Add tests for response parsing and error handling.

### Slice 5: Admin Presets and Seeds

- Add complete presets for Video, Character, and Audio.
- Update seed scripts and static fallback registry.
- Ensure existing Gemini Omni Video rows are updated.

### Slice 6: Media Studio UX

- Replace confusing synced read-only controls with picker-backed Gemini Omni reference controls.
- Add Character and Audio selection/create flows.
- Add quota meter and validation messages.
- Add prompt QA and video QA summaries with revise/regenerate actions.

### Slice 7: End-to-End Verification

- Run targeted unit tests.
- Run type checks.
- Run provider payload smoke tests with mocked Kie responses.
- Optionally run live Kie smoke tests only with explicit confirmation and valid credentials.
