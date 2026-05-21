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

## Non-goals

- Full generic asset registry redesign for every provider.
- Editing or deleting provider-side Gemini Omni assets if Kie.ai does not expose a documented delete/update API.
- Bulk import of historical Kie.ai audio or character assets.
- Making `audio_ids` or `character_ids` manually editable in the normal user flow.
- Replacing existing separate voice/music workflows.
- Replacing the existing general-purpose video prompt skills. Gemini Omni needs its own asset-aware skill because its planning constraints differ from generic video models.
- Building a separate skill self-learning system that duplicates Feature 112's QA/skill improvement architecture.

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

Safe default:

- suite enabled only when Kie.ai provider is configured and model is enabled
- asset creation enabled only for internal/admin rollout first
- prompt QA enabled before video QA
- auto-learning records can be collected before recommendations are surfaced
- auto skill patching remains disabled

When a flag is disabled, the UI should degrade gracefully:

- asset creation disabled: picker still shows existing assets if available; create buttons show disabled reason
- prompt QA disabled: generation still works with a small "QA disabled" debug note only in admin/debug context
- video QA disabled: completed task cards do not show QA state

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
    "video_list": [{ "url": "https://.../source.mp4" }],
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

1. Ship metadata, validation, and pricing fixes with Gemini Omni Suite UI hidden behind flag.
2. Enable Gemini Omni Video with prompt/image/video references only.
3. Enable Gemini Omni Video Director skill and Prompt QA.
4. Enable provider asset creation for internal/admin users.
5. Enable Character/Audio asset selection for broader users.
6. Enable Video QA summaries.
7. Enable learning recommendation surfacing after enough QA data exists.

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
  - `video_list: [{ url }]`
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
