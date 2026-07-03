# Feature 131: Vertical Drama Series Storyboard Video Flow

Version: 0.2
Date: 2026-07-03
Status: Proposed
Owner: Dashboard / Storyboard Review / Media Studio / Skill Runtime / Video Generation / Audio / Data
Depends-on: 112-storyboard-studio-skill-based-prompt-generation-qa-loop, 117-production-director-agents-sdk-auto-storyboard-video, 122-video-segment-planner-multi-shot-storyboard-review, 127-article-to-storyboard-video-project, 130-hybrid-flow-openai-agents-sdk-runtime
External guide: https://github.com/naibarn/vertical-drama-video-flow at commit `e2dbef07d07447489d041112d862d994adeac5d4`

---

## 1. Executive Summary

Add a dedicated Dashboard workflow for creating long-running 9:16 vertical drama series projects. The workflow must feel like a production workspace for Chinese-style short vertical drama: a user can create a series, define title/premise/characters/tie-in product rules, generate durable character stock references, plan episode arcs for 10, 20, 30, or up to 100 episodes, and create each episode as a Storyboard Review project with continuity-aware shot plans.

This feature extends Feature 127. Feature 127 converts article pages into Storyboard Review video shots. Feature 131 creates a new vertical drama series entry point that owns series memory, character consistency, episode continuity, product tie-in strategy, and skill-chain orchestration, then hands each episode to Storyboard Review for review, video generation, repair, replacement, overlay/audio work, and final composition.

Target flow:

```text
Dashboard
  -> Vertical Drama Series
  -> Series project / bible / memory
  -> Character visual bible + stock reference assets
  -> Episode outline and continuity plan
  -> 9-shot vertical storyboard grid per episode
  -> 9 start-frame plans and approved frame assets
  -> video motion prompt pack / provider routing
  -> Storyboard Review project for the episode
  -> user reviews, repairs, generates video, exports episode
  -> episode memory updates the next episode
```

The GitHub guide is treated as the production recipe for the skill chain: character visual bible, storyboard shotgrid, shot start-frame render planning, video motion prompt pack, provider capability gates, dry-run/approval checkpoints, QC, repair loops, 60-second 9:16 episode planning, and optional product tie-in. SmartSpecPro must adapt that recipe into the existing `apps/web/skills` and Storyboard Review architecture rather than copying the standalone Python package structure directly.

---

## 2. Product Goals

1. Add a new Dashboard menu for **Vertical Drama Series**.
2. Support long-running series projects with 10, 20, 30, and up to 100 planned episodes.
3. Persist a complete series bible: title, logline, genre, tone, target audience, age policy, main plot, episode arc, characters, relationships, locations, props, visual style, product tie-in rules, and continuity constraints.
4. Persist character stock assets per series: portraits, full-body references, expression sheets, outfit sheets, prop references, and approved/rejected states.
5. Use series memory when planning later episodes so episode 2-100 can continue from prior story events, relationship changes, unresolved hooks, and product tie-in history.
6. Generate one Storyboard Review project per episode, with one ordered video task per shot or clip segment.
7. Keep Storyboard Review as the review/generation workspace. Do not rebuild Storyboard Review inside the series planner.
8. Import or adapt all required vertical-drama skills into `apps/web/skills` with SmartSpecPro-compatible metadata, schemas, fixtures, verification scripts, and runtime contracts.
9. Keep provider use production-grade: capability gates, model selection, credit estimates, dry-run mode, human approvals, QC, and repair loops.
10. Support optional tie-in product placement that serves the story and compliance rules instead of feeling forced.
11. Preserve voice, subtitle, safe-area, and dialogue continuity across episodes.

---

## 3. Non-Goals

1. Do not replace Feature 127 Article Video Builder.
2. Do not make vertical drama the default video workflow.
3. Do not require all 100 episodes to be generated at once.
4. Do not silently call paid image, video, or TTS providers during planning.
5. Do not bake readable text or subtitles into generated video frames unless an explicit final render mode requires it.
6. Do not store private generated face assets without tenant/user ownership metadata and lifecycle controls.
7. Do not hard-code one video provider. Veo-style first/last-frame generation may be preferred, but routing must stay provider-capability based.
8. Do not depend on the standalone GitHub Python folder layout as runtime architecture. SmartSpecPro owns auth, tenant policy, model registry, credits, skill registry, and Storyboard Review handoff.

---

## 4. Existing System Fit

### 4.1 Reuse From Feature 127

Feature 127 already defines the correct destination pattern:

- Builder creates Storyboard Review projects.
- Storyboard Review owns video generation, review, repair, replacement, overlay, audio, and final render.
- Prompt text, overlay text, voiceover, references, and model/audio metadata remain separate.
- Generation must be explicit and credit-gated.

Feature 131 should reuse these conventions, but replace article/page planning with series/episode planning.

### 4.2 New Entry Point

Add a first-class Dashboard menu item:

- Thai: `ซีรีย์แนวตั้ง`
- English: `Vertical Drama Series`

Suggested route:

```text
/dashboard/vertical-drama
/dashboard/vertical-drama/:seriesId
/dashboard/vertical-drama/:seriesId/episodes/:episodeId
```

The first screen is the actual workspace, not a landing page. It should show series list, recent episodes, status, missing approvals, and a primary create action.

### 4.3 Storyboard Review Handoff

Every episode create action eventually produces a Storyboard Review project:

```text
VerticalDramaSeriesProject
  -> VerticalDramaEpisodePlan
  -> VerticalDramaStoryboardHandoff
  -> StoryboardReviewDraft
  -> StoryboardGenerationTask[]
```

Storyboard Review task metadata must include the series ID, episode ID, episode number, shot number, character references, start-frame assets, motion prompt pack metadata, audio strategy, overlay/subtitle policy, tie-in metadata, and continuity warnings.

---

## 5. GitHub Guide Requirements To Adapt

The referenced `naibarn/vertical-drama-video-flow` guide defines an end-to-end vertical drama flow using:

- `character-visual-bible-skill`
- `storyboard-shotgrid-skill`
- `shot-start-frame-render-skill`
- `video-motion-prompt-pack-skill`
- `orchestrator/agents_workflow.py`
- schema validation, dry-run mode, approvals, provider capability gates, QC, repair queues, and assembly manifests.

SmartSpecPro should adapt the guide as follows:

| GitHub guide concept | SmartSpecPro adaptation |
| --- | --- |
| Standalone Python CLI package | Node/React app + existing Python backend/Agents SDK runtime only where needed |
| `skills/*/skill.json` packages | SmartSpecPro `apps/web/skills/<slug>/SKILL.md` plus optional `skill.json`, schemas, examples, help files |
| `outputs/{run_id}` local artifacts | Tenant-owned persisted run artifacts and existing media asset storage |
| 60s 9-shot episode | Default episode profile: 60 seconds, 9 key frames/shots, 8 first/last-frame bridge clips when provider supports it |
| Veo 3.1 first/last-frame primary | Provider-capability based route; support Veo-style first/last-frame, first-frame-only, prompt-only fallback, and external image-to-video adapter |
| OpenAI video restrictions gate | Use model registry/provider capability metadata; block or reroute unsupported human-face input references |
| Human approvals after each stage | Durable approval checkpoints in series workspace and Storyboard Review |
| QC/repair queues | Store stage-specific issues and repair commands in episode metadata |

The guide recommends generating 9 cinematic frames and using adjacent frame bridges for video continuity:

```text
frame 1 -> frame 2
frame 2 -> frame 3
...
frame 8 -> frame 9
```

SmartSpecPro should support this as the preferred `first_last_frame_bridge` motion mode, while still supporting existing Storyboard Review shot/task behavior for providers that accept only prompt or first-frame input.

GitHub manifest parity terms that must be preserved in provider policy fixtures:

- `default_flow`
- `duration_profile_default`
- `veo31_first_last_bridge_60s`
- `video_provider_default`
- `veo_3_1`
- `important_openai_video_note`
- `removed_active_video_providers`
- `openai_sora`
- `openai_videos`

The imported `default_flow` sequence must remain visible in fixture tests and migration notes: `Drama Script JSON` -> `Character Visual Bible` -> `Character reference images` -> `Storyboard 3x3 9 shots` -> `9 cinematic start frames` -> `Video motion prompts` -> `Provider render requests` -> `Clip assembly manifest`.

The upstream manifest removes OpenAI Sora/OpenAI Videos as active bridge providers. SmartSpecPro must not silently re-enable `openai_sora` or `openai_videos` for first/last-frame bridge mode; they remain capability-gated, prompt-only, or disabled unless a future provider audit updates this spec.

---

## 6. Required Skills

Import or create SmartSpecPro-compatible skills under `apps/web/skills`. These are required for production parity.

### 6.1 `vertical-drama-script-builder`

Purpose: turn a brief, series bible, product tie-in config, age policy, and memory summary into an episode script JSON.

Inputs:

- series title/logline
- main plot and season arc
- episode number and target duration
- prior episode recap and memory state
- character roster and relationship state
- product tie-in policy
- age/safety profile
- locale

Outputs:

- episode title
- hook
- 3-act or beat-level structure
- scene/dialogue summary
- cliffhanger/payoff
- character state deltas
- product tie-in usage plan
- continuity notes
- warnings and repair queue

### 6.2 `vertical-drama-character-visual-bible`

Adapted from GitHub `character-visual-bible-skill`.

Purpose: create and maintain production-ready character visual bibles and image-generation prompt packs.

Outputs must support:

- portrait prompt
- full-body prompt
- expression sheet prompt
- outfit sheet prompt
- character identity lock summary
- wardrobe/prop continuity notes
- reference asset manifest
- approval status and repair suggestions

This skill must work with existing `smart-character-creator-pro` where useful, but the vertical drama version is series-memory aware and optimized for repeatable live-action drama characters.

### 6.3 `vertical-drama-storyboard-shotgrid`

Adapted from GitHub `storyboard-shotgrid-skill`.

Purpose: convert an episode script into exactly 9 key vertical storyboard shots by default.

Outputs:

- human-readable 3x3 shotgrid
- structured shot list
- shot number, timecode, narrative purpose
- characters and required reference assets
- image prompt and negative prompt
- continuity notes
- product tie-in shot role when applicable
- repair queue

### 6.4 `vertical-drama-shot-start-frame-render`

Adapted from GitHub `shot-start-frame-render-skill`.

Purpose: convert the shotgrid into 9 start-frame render requests and QC checklists.

Outputs:

- 9 image render requests
- reference asset attachments per shot
- expected output asset IDs
- negative prompts
- QC checklist per frame
- repair prompt template per frame
- downstream video input manifest

### 6.5 `vertical-drama-video-motion-prompt-pack`

Adapted from GitHub `video-motion-prompt-pack-skill`.

Purpose: create per-clip motion prompts and provider request plans.

Outputs:

- first/last-frame bridge plan where supported
- first-frame-only fallback plan
- prompt-only fallback plan
- per-clip duration schedule
- provider feasibility decisions
- audio/native ambience policy
- assembly manifest
- video QC checklist
- repair guidance for identity drift, camera drift, bad motion, and clip transition failure

### 6.6 `vertical-drama-series-memory-planner`

New SmartSpecPro skill.

Purpose: maintain long-series continuity and decide what memory to carry into future episodes.

Outputs:

- canonical facts
- unresolved hooks
- relationship state changes
- character emotional state
- product tie-in history
- continuity risks
- episode recap for next planning run
- memory compaction summary

### 6.7 `vertical-drama-product-tie-in-planner`

New SmartSpecPro skill.

Purpose: integrate optional products into story episodes without unsupported claims or unnatural conflict resolution.

Rules:

- product cannot solve the main conflict unrealistically
- product does not need to appear in every episode
- every tie-in must have a `story_function`
- regulated claims require compliance warnings
- product visuals must be grounded by product references when available
- tie-in history must prevent repetitive placements

### 6.8 `vertical-drama-dialogue-audio-planner`

New SmartSpecPro skill.

Purpose: convert episode script beats into production-ready dialogue, narration, voice continuity, subtitle cue, native-audio, and separate-TTS planning metadata.

Outputs:

- cast-aware dialogue lines by shot/clip
- speaker-to-character mapping
- stable voice continuity map
- missing voice ID warnings
- subtitle cue plan with 9:16 safe-area hints
- audio timing estimate
- native audio prompt snippets only when allowed
- separate-TTS render plan
- repair queue for overlong speech, unsupported native audio, unsafe claims, or missing voice/provider access

### 6.9 Imported GitHub Contract Parity

The four imported GitHub-guide skills must preserve the upstream contract shape. SmartSpecPro may add fields, but it must not remove or rename these required top-level fields unless a versioned adapter maps them losslessly.

`vertical-drama-character-visual-bible` must output:

- `visual_bible_summary`
- `characters`
- `plain_text_summary`
- `storyboard_attachment_manifest`

`visual_bible_summary` must preserve:

- `story_title`
- `overall_style`
- `consistency_strategy`

Each character output must preserve:

- `character_id`
- `name`
- `role`
- `visual_identity_summary`
- `identity_anchors`
- `signature_wardrobe`
- `hair_makeup_notes`
- `performance_energy`
- `primary_portrait_prompt`
- `full_body_prompt`
- `expression_sheet_prompt`
- `outfit_sheet_prompt`
- `turnaround_prompt`
- `negative_prompt`
- `attachment_package`

Each `attachment_package` item must preserve:

- `asset_type`
- `purpose`
- `recommended_filename`

`storyboard_attachment_manifest` must preserve:

- `handoff_type = "character_reference_package"`
- `characters`
- `usage_note`

`vertical-drama-storyboard-shotgrid` must output:

- `storyboard_summary`
- `canonical_style_bible`
- `shot_grid_plan`
- `shots`
- `plain_text_storyboard`
- `storyboard_handoff_json`

`storyboard_summary` must preserve:

- `episode_title`
- `episode_number`
- `duration_seconds`
- `core_emotion`
- `visual_promise`

`canonical_style_bible` must preserve:

- `overall_style`
- `lighting_language`
- `camera_language`
- `color_language`
- `continuity_rules`

`shot_grid_plan` must preserve:

- `layout = "3x3"`
- `aspect_ratio = "9:16"`
- `contact_sheet_instruction`
- `grid_reading_order`

Each shot must preserve:

- `shot_number`
- `timecode`
- `duration_seconds`
- `narrative_purpose`
- `emotion`
- `characters`
- `required_character_refs`
- `location`
- `action`
- `visual_description`
- `camera`
- `lighting`
- `dialogue_excerpt`
- `subtitle_text`
- `continuity_notes`
- `image_prompt`
- `negative_prompt`
- `age_suitability`

Each shot `camera` object must preserve:

- `shot_type`
- `angle`
- `lens_feel`
- `movement`
- `composition`

`storyboard_handoff_json` must preserve:

- `schema_version`
- `handoff_type = "storyboard_shot_prompts"`
- `grid_layout`
- `shots`
- `character_attachment_manifest`
- `rendering_notes`

`vertical-drama-shot-start-frame-render` must output:

- `render_plan_summary`
- `start_frame_requests`
- `plain_text_render_plan`
- `downstream_video_input_manifest`
- `quality_control`

`render_plan_summary` must preserve:

- `episode_title`
- `shot_count = 9`
- `target_aspect_ratio = "9:16"`
- `image_size`
- `reference_strategy`

Each start-frame request must preserve:

- `shot_number`
- `shot_title`
- `timecode`
- `prompt`
- `negative_prompt`
- `reference_assets`
- `render_parameters`
- `continuity_notes`
- `qc_checklist`
- `repair_prompt_template`
- `expected_output_asset_id`

Each start-frame `reference_assets` item must preserve:

- `character_id`
- `asset_id`
- `asset_type`
- `file_id`
- `image_url`
- `local_path`

Each `render_parameters` object must preserve:

- `provider_mode`
- `model`
- `size`
- `quality`
- `n`

The downstream manifest must include `rendered_frame_slots`; Storyboard Review handoff must not proceed to first/last-frame bridge mode until required frame slots have approved asset IDs or an explicit provider fallback is selected.

The downstream manifest and quality object must preserve:

- `episode_duration_seconds`
- `notes_for_video_skill`
- `must_check_before_video`
- `common_failure_repairs`

`vertical-drama-video-motion-prompt-pack` must output:

- `video_plan_summary`
- `provider_feasibility`
- `video_clip_requests`
- `sub_shot_plan` (present when `verticalDramaSeriesSubShots` is enabled; the per-shot sub-shot decomposition per §7.4 Sub-Shot Decomposition, incl. resolved counts, durations, camera setups, transitions, and feasibility/degrade decisions)
- `plain_text_video_plan`
- `final_episode_assembly_manifest`
- `repair_loop`

`video_plan_summary` must preserve:

- `episode_title`
- `duration_seconds = 60`
- `clip_count`
- `aspect_ratio = "9:16"`
- `strategy`

`provider_feasibility` must preserve:

- `blocking_reasons`
- `recommended_provider_path`
- `notes`
- `veo31_executable`

Each clip request must preserve:

- `clip_number`
- `source_shot_numbers`
- `duration_seconds`
- `start_frame_reference`
- `end_frame_reference` when first/last-frame bridge is used
- `prompt`
- `negative_motion_prompt`
- `subtitle_or_dialogue`
- `camera_motion`
- `continuity_notes`
- `provider_request`
- `parent_shot_number` and `sub_shot_number` when the clip is a sub-shot of a decomposed main shot (§7.4 Sub-Shot Decomposition); a non-decomposed clip omits these or sets `sub_shot_number = null`

Reference objects inside `start_frame_reference` and `end_frame_reference` must preserve upstream asset fields:

- `asset_id`
- `file_id`
- `image_url`
- `local_path`
- `contains_human_face`
- `openai_input_reference_allowed` on start-frame references

`provider_request` must preserve the upstream provider payload shape:

- `provider`
- `external_image_to_video_request`
- `execution_status`
- `veo31_request`

`veo31_request` must preserve:

- `model`
- `mode`
- `prompt`
- `first_frame`
- `last_frame`
- `reference_images`
- `duration_seconds`
- `aspect_ratio`
- `resolution`
- `generate_audio`

`provider_request` must preserve the upstream execution statuses:

- `ready`
- `blocked`
- `fallback_text_to_video`
- `manual_review_required`
- `external_provider_required`

SmartSpecPro may normalize `fallback_text_to_video` to its UI label `fallback_prompt_only`, but persisted metadata must retain the upstream raw status and the normalized app status.

`final_episode_assembly_manifest` must preserve:

- `handoff_type = "video_assembly_manifest"`
- `target_duration_seconds = 60`
- `clips`
- `ffmpeg_concat_plan`
- `subtitle_plan`
- `audio_bgm_plan`
- `export_settings`

`repair_loop` must preserve:

- `clip_qc_checklist`
- `common_video_repairs`
- `regenerate_rules`

Raw imported GitHub artifact JSON must keep upstream snake_case field names. SmartSpecPro shared types may expose camelCase projections, but the adapter must round-trip both directions without losing unknown provider fields.

---

### 6.10 Imported GitHub Input Schema Parity

The SmartSpecPro input adapters for the four imported GitHub-guide skills must preserve the upstream input vocabulary and enum values. The app may expose friendlier UI labels, but the persisted skill input snapshot and fixture tests must round-trip these terms without loss.

`vertical-drama-character-visual-bible` input parity terms:

- `age_control`
- `age_range`
- `allow_secondary_outfits`
- `background`
- `cinematic_romance`
- `clean_editorial`
- `continuity_controls`
- `custom`
- `custom_style`
- `deliverables`
- `do_not_make`
- `expression_count`
- `family_all`
- `gender_presentation`
- `generate_expression_sheet_prompt`
- `generate_full_body_prompt`
- `generate_outfit_sheet_prompt`
- `generate_primary_portrait_prompt`
- `generate_turnaround_prompt`
- `guided`
- `hair_notes`
- `include_image_generation_prompts`
- `include_plain_text_summary`
- `include_storyboard_attachment_manifest`
- `lock_face_identity`
- `lock_hair_identity`
- `lock_signature_wardrobe`
- `luxury_melodrama`
- `maintain_same_ethnicity_cues`
- `must_feel_like`
- `output_options`
- `premium_live_action`
- `preschool`
- `primary_reference_aspect_ratio`
- `rendering_profile`
- `script_json`
- `script_text`
- `sheet_aspect_ratio`
- `simple`
- `story_context`
- `style_preset`
- `stylized_realistic`
- `target_age_group`
- `target_rating`
- `target_realism`
- `tweens`
- `ultra_realistic`
- `visual_tone`
- `wardrobe_notes`
- `workflow_level`
- `workplace_drama`
- `young_adults`

`vertical-drama-storyboard-shotgrid` input parity terms:

- `age_control`
- `allow_episode_specific_outfit_change`
- `balanced`
- `camera_feel`
- `carry_forward_from_previous_episode`
- `cinematic_quality_target`
- `close_up`
- `color_mood`
- `continuity_controls`
- `custom`
- `custom_style`
- `drama_skill_json`
- `emotion_first`
- `episode_brief`
- `establishing`
- `extreme_close_up`
- `family_all`
- `family_melodrama`
- `guided`
- `half_body`
- `identity_lock`
- `include_3x3_contact_sheet_instruction`
- `include_image_generation_prompts`
- `include_json_handoff`
- `include_negative_prompts`
- `include_plain_text_storyboard`
- `insert`
- `keep_face_consistent`
- `keep_hair_consistent`
- `keep_outfit_consistent`
- `luxury_melodrama`
- `medium`
- `minimum_visual_variety`
- `must_preserve_story_beats`
- `narrative_goal`
- `output_options`
- `over_the_shoulder`
- `plain_text_script`
- `plot_first`
- `premium`
- `premium_vertical_cinema`
- `preschool`
- `preserve_character_positions`
- `preserve_emotional_progression`
- `preserve_lighting_logic`
- `preserve_props_continuity`
- `previous_episode_visual_notes`
- `reaction`
- `ref_label`
- `ref_source`
- `reveal_first`
- `romantic_drama`
- `shot_planning`
- `shots_per_minute`
- `simple`
- `source_json`
- `source_text`
- `source_type`
- `story_source`
- `style_preset`
- `target_age_group`
- `target_rating`
- `target_shot_mix`
- `tweens`
- `ultra_premium`
- `view_type`
- `visual_style`
- `wide`
- `workflow_level`
- `workplace_thriller`
- `young_adults`

`vertical-drama-shot-start-frame-render` input parity terms:

- `attach_character_refs`
- `avoid_contact_sheet_generation`
- `character_reference_manifest`
- `cinematic_controls`
- `enable_repair_prompts`
- `enable_visual_qc_checklist`
- `external_image_provider`
- `guided`
- `include_downstream_video_input_manifest`
- `include_image_api_requests`
- `include_plain_text_render_plan`
- `max_variants_per_shot`
- `medium`
- `openai_image_api`
- `output_options`
- `premium`
- `prompt_describe_only`
- `qa_controls`
- `quality_bar`
- `reference_image_policy`
- `render_target`
- `require_emotional_readability`
- `require_prop_continuity`
- `responses_image_tool`
- `simple`
- `single_image_per_shot`
- `ultra_premium`
- `vertical_frame`
- `workflow_level`

`vertical-drama-video-motion-prompt-pack` input parity terms:

- `1024x1792`
- `acting_style`
- `allow_native_audio`
- `assembly_options`
- `balanced`
- `camera_motion_intensity`
- `clip_duration_strategy`
- `continuity_priority`
- `dialogue_sync`
- `dramatic`
- `first_last_frame_to_video`
- `guided`
- `if_end_frame_missing`
- `if_provider_rejects_reference`
- `include_audio_bgm_plan`
- `include_ffmpeg_concat_plan`
- `include_final_episode_assembly_manifest`
- `include_plain_text_video_plan`
- `include_provider_request_json`
- `include_repair_loop`
- `include_subtitle_plan`
- `lip_sync_required`
- `medium`
- `motion_style`
- `output_options`
- `prefer_first_last_frame`
- `preserve_character_identity_over_motion`
- `provider_auto`
- `reference_image_limit`
- `reference_to_video`
- `simple`
- `subtitle_only`
- `subtle`
- `synthesize_end_frame_prompt`
- `use_first_last_frame_pairs`
- `use_start_frame_as_input_reference`
- `use_start_frame_only`
- `veo-3.1`
- `veo-3.1-fast`
- `veo-3.1-quality`
- `veo31_8_clips_trim_to_60`
- `veo31_first_last_bridge_60s`
- `veo31_policy`
- `veo_3_1`
- `video_target`
- `voiceover_later`
- `workflow_level`

Input adapter requirements:

- normalize SmartSpecPro UI inputs into the upstream-compatible field names before invoking imported skills;
- store `input.normalized.json` with the upstream field vocabulary for audit/debug parity;
- keep app-only fields in a separate metadata namespace to avoid corrupting imported schemas;
- validate one fixture per imported skill that uses the upstream enum/value vocabulary above.

---

## 7. Data Model

MVP decision: use normalized first-class series tables for the durable series/episode state, and use JSONB metadata inside those tables for stage manifests that evolve quickly. Do not store 10-100 episode state only inside Storyboard Review metadata.

Storyboard Review remains the per-episode review/generation workspace. The series workspace remains the canonical owner for series bible, character stock, episode memory, approvals, and cross-episode continuity.

### 7.1 Persistence Decision

Add dedicated Drizzle tables unless an implementation audit proves an existing project table already provides the same tenant/user/project/index semantics:

```text
vertical_drama_series
vertical_drama_characters
vertical_drama_character_assets
vertical_drama_episodes
vertical_drama_episode_runs
vertical_drama_memory_events
vertical_drama_approvals
vertical_drama_qc_reports
```

Minimum indexing:

- `(tenantId, ownerUserId, updatedAt)` for series list.
- `(tenantId, seriesId, episodeNumber)` unique for episodes.
- `(tenantId, seriesId, characterId)` for character lookup.
- `(tenantId, seriesId, status)` for active/needs-repair dashboards.
- `(tenantId, seriesId, memoryKind, createdAt)` for memory retrieval.

Use existing `media_assets` as the canonical asset registry for uploaded/generated character, product, start-frame, clip, audio, subtitle, and thumbnail assets. Store `projectId = verticalDrama:<seriesId>` or the closest existing project-scoped convention, `sourceType` values such as `vertical_drama_character_reference`, `vertical_drama_start_frame`, `vertical_drama_product_reference`, and store per-feature relationships in `vertical_drama_character_assets` or episode metadata. Provider-hosted output URLs must be re-hosted or staged through the app's approved storage layer before they become durable references.

Asset metadata parity with the GitHub guide:

```ts
type VerticalDramaAssetRecordSnapshot = {
  asset_id: string;
  run_id: string;
  stage: VerticalDramaPipelineStage | string;
  asset_type:
    | "character_reference"
    | "product_reference"
    | "start_frame"
    | "video_clip"
    | "audio"
    | "subtitle"
    | "thumbnail"
    | string;
  local_path?: string;
  file_id?: string;
  image_url?: string;
  mediaAssetId?: string;
  contains_human_face?: boolean;
  approved: boolean;
  qc_status: "pending" | "passed" | "failed" | "needs_repair" | string;
  created_at: string;
};
```

SmartSpecPro may not expose `local_path`, `file_id`, or temporary `image_url` directly to browsers unless the value has been redacted, signed through the approved asset service, or transformed into a tenant-scoped media asset reference.

The Storyboard Review draft/task metadata stores episode handoff state only:

- enough to regenerate/repair the episode review;
- the backlink to `seriesId` and `episodeId`;
- reference asset IDs and temporary signed URLs resolved at display/generation time;
- no canonical series memory blobs and no provider credentials/signed URLs.

### 7.2 Core Types (Series & Character)

```ts
type VerticalDramaUpstreamAssetReference = {
  asset_id?: string;
  file_id?: string;
  image_url?: string;
  local_path?: string;
  contains_human_face?: boolean;
  openai_input_reference_allowed?: boolean;
};

type VerticalDramaVeo31RequestSnapshot = {
  model?: string;
  mode?: "first_last_frame" | "first_frame" | "text_to_video" | string;
  prompt: string;
  first_frame?: VerticalDramaUpstreamAssetReference | Record<string, unknown>;
  last_frame?: VerticalDramaUpstreamAssetReference | Record<string, unknown> | null;
  reference_images?: Array<VerticalDramaUpstreamAssetReference | Record<string, unknown>>;
  duration_seconds: number;
  aspect_ratio: "9:16" | string;
  resolution?: string;
  generate_audio?: boolean;
};

type VerticalDramaProviderRequestSnapshot = {
  provider: string;
  execution_status:
    | "ready"
    | "blocked"
    | "fallback_text_to_video"
    | "manual_review_required"
    | "external_provider_required"
    | string;
  normalizedStatus:
    | "ready"
    | "blocked"
    | "fallback_prompt_only"
    | "manual_review_required"
    | "external_provider_required";
  external_image_to_video_request?: Record<string, unknown>;
  veo31_request?: VerticalDramaVeo31RequestSnapshot;
};

type VerticalDramaSeriesProject = {
  id: string;
  tenantId: string;
  ownerUserId: string;
  title: string;
  locale: "th" | "en";
  aspectRatio: "9:16";
  status: "draft" | "planning" | "active" | "paused" | "completed" | "archived";
  targetEpisodeCount: 10 | 20 | 30 | 100 | number;
  defaultEpisodeDurationSeconds: 60;
  genre: string;
  tone: string;
  targetAudience: string;
  agePolicyId?: string;
  bible: VerticalDramaSeriesBible;
  memory: VerticalDramaSeriesMemory;
  productTieIn?: VerticalDramaProductTieInConfig;
  policy: VerticalDramaSeriesPolicy;
  createdAt: string;
  updatedAt: string;
};
```

### 7.2.1 Minimal Input Contract

The user must be able to start with a minimal brief. The full wizard may collect richer information, but quick-create must accept this shape and infer the rest through the skill chain:

```ts
type VerticalDramaMinimalInput = {
  locale?: "th" | "en";
  storyTitle: string;
  durationSeconds?: 60;
  storyBrief: string;
  characters: Array<{
    characterId: string;
    name: string;
    role: string;
  }>;
  episodeCount?: number;
  ageControl?: {
    targetAgeGroup: "children" | "teens" | "adults";
    targetRating?: string;
  };
  tieIn?: VerticalDramaProductTieInConfig;
};
```

The app-facing `ageControl.targetAgeGroup` (`"children" | "teens" | "adults"`) is a narrowed projection of the wider upstream `age_control.target_age_group`. Quick-create must map upstream values into the app enum as follows: `preschool → children`, `children → children`, `tweens → teens`, `young_adults → adults`, `adults → adults` (upstream `teens`, if present, → `teens`). The raw upstream value must be preserved losslessly in `input.normalized.json`.

The imported GitHub minimal example must also be accepted and stored losslessly as the raw upstream input shape:

```ts
type VerticalDramaUpstreamMinimalEpisodeInput = {
  story_title: string;
  duration_seconds: 60;
  story_brief: string;
  characters: Array<{
    character_id: string;
    name: string;
    role: string;
  }>;
  episode_count: number;
  age_control?: {
    target_age_group: "preschool" | "children" | "tweens" | "teens" | "young_adults" | "adults" | string;
    target_rating?: string;
  };
};
```

Quick-create must map SmartSpecPro camelCase fields into upstream snake_case fields inside `input.normalized.json` while preserving the app-facing shape for UI state.

Quick-create behavior:

- infer genre, tone, initial bible, episode 1 outline, and missing character visual details;
- never block because optional character styling fields are absent;
- surface inferred fields for user review before paid generation;
- preserve the original brief and inferred fields separately for audit and repair.

### 7.3 Core Types (Episode, Run & Manifest)

```ts
type VerticalDramaSeriesPolicy = {
  visibility: "private" | "tenant" | "shared_group";
  generationMode: "dry_run" | "approval_required" | "auto_after_approval";
  maxConcurrentEpisodeRuns: number;
  maxProviderSpendPerEpisodeCredits?: number;
  requireTieInApproval: boolean;
  requireCharacterAssetApproval: boolean;
  retentionPolicyId?: string;
};
```

`maxProviderSpendPerEpisodeCredits` is an enforced budget, not just a stored number. When the cumulative estimated credits for an episode (already-charged plus the next paid stage estimate) would exceed `maxProviderSpendPerEpisodeCredits`, the stage runner MUST block the paid stage before any provider call, return `RunResult.status = "approval_required"` with `next_action = "approve"`, and emit a `blocking`-severity `VerticalDramaWarning`. The paid stage may proceed only after explicit user approval or a raised budget.

```ts
type VerticalDramaSeriesBible = {
  logline: string;
  mainPlot: string;
  seasonArc: string;
  visualStyle: string;
  pacingStyle: string;
  cameraGrammar: string;
  locations: VerticalDramaLocation[];
  characters: VerticalDramaCharacter[];
  relationshipMap: VerticalDramaRelationship[];
  recurringProps: VerticalDramaProp[];
  continuityRules: string[];
};
```

```ts
type VerticalDramaLocation = {
  id: string;
  name: string;
  description?: string;
};

type VerticalDramaRelationship = {
  fromCharacterId: string;
  toCharacterId: string;
  kind: string;
  notes?: string;
};

type VerticalDramaProp = {
  id: string;
  name: string;
  recurring: boolean;
  notes?: string;
};
```

```ts
type VerticalDramaCharacter = {
  characterId: string;
  name: string;
  role: string;
  personality: string;
  backstory?: string;
  identityLock: string;
  wardrobeRules: string[];
  approvedReferenceAssetIds: string[];
  rejectedReferenceAssetIds: string[];
  visualBibleSkillRunId?: string;
  currentState: {
    emotionalState?: string;
    relationshipNotes?: string[];
    storyKnowledge?: string[];
    injuryOrWardrobeContinuity?: string[];
  };
};
```

```ts
type VerticalDramaCharacterDelta = {
  characterId: string;
  episodeNumber: number;
  changedFields: string[];
  summary: string;
};
```

```ts
type VerticalDramaSeriesMemory = {
  canonicalFacts: string[];
  episodeSummaries: Array<{
    episodeId: string;
    episodeNumber: number;
    summary: string;
    cliffhanger?: string;
    characterDeltas: VerticalDramaCharacterDelta[];
    productTieInUsage?: VerticalDramaTieInUsage;
  }>;
  unresolvedHooks: string[];
  resolvedHooks: string[];
  continuityWarnings: string[];
  compactedMemoryText: string;
  retrievalPolicy: VerticalDramaMemoryRetrievalPolicy;
  updatedAt: string;
};
```

```ts
type VerticalDramaMemoryRetrievalPolicy = {
  includeCanonicalFacts: true;
  includeLastEpisodeCount: number; // default 3
  includeOpenHooks: true;
  includeResolvedHookLookbackCount: number; // default 10
  includeCharacterState: true;
  includeProductTieInHistory: true;
  maxPromptTokens: number;
  compactionStrategy: "rolling_summary_plus_events";
};
```

```ts
type VerticalDramaEpisode = {
  id: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  status:
    | "draft"
    | "script_planned"
    | "characters_ready"
    | "storyboard_ready"
    | "start_frames_ready"
    | "motion_prompts_ready"
    | "storyboard_review_created"
    | "rendering"
    | "completed"
    | "needs_repair";
  targetDurationSeconds: 60;
  durationProfileId: "vertical_drama_60s_9_frames_8_clips" | string;
  script?: VerticalDramaEpisodeScript;
  storyboard?: VerticalDramaShotgrid;
  startFramePlan?: VerticalDramaStartFramePlan;
  dialogueAudioPlan?: VerticalDramaDialogueAudioPlan;
  motionPromptPack?: VerticalDramaMotionPromptPack;
  assemblyManifest?: VerticalDramaAssemblyManifest;
  storyboardReviewId?: string;
  approvals: VerticalDramaApprovalState[];
  qcReports: VerticalDramaQcResult[];
  createdAt: string;
  updatedAt: string;
};
```

`VerticalDramaApprovalState` is the compact per-stage approval status projected from the durable checkpoint artifact (§11.2):

```ts
type VerticalDramaApprovalState = Pick<
  VerticalDramaApprovalCheckpointArtifact,
  "stage" | "state" | "checkpointId"
>;
```

Note: `script`, `storyboard`, `startFramePlan`, and `motionPromptPack` mirror the imported GitHub output schemas defined in §6.9 (`drama_script`, `storyboard_shotgrid`, `start_frame_render_plan`/`shot_start_frames`, `video_motion_prompt_pack`); their TS shapes (`VerticalDramaEpisodeScript`, `VerticalDramaShotgrid`, `VerticalDramaStartFramePlan`, `VerticalDramaMotionPromptPack`) are the typed projections of those §6.9 output objects.

```ts
type VerticalDramaRunArtifact = {
  artifactId: string;
  seriesId: string;
  episodeId: string;
  runId: string;
  stage:
    | "input_normalized"
    | "drama_script"
    | "character_visual_bible"
    | "character_assets_manifest"
    | "storyboard_shotgrid"
    | "start_frame_render_plan"
    | "contact_sheet_batch_plan"
    | "contact_sheet_assets_manifest"
    | "candidate_frame_selection"
    | "start_frame_manifest"
    | "video_motion_prompt_pack"
    | "video_clip_manifest"
    | "assembly_manifest"
    | "qc_report"
    | "readable_summary"
    | "run_log";
  storageKey?: string;
  jsonPayload?: unknown;
  mediaAssetIds?: string[];
  checksumSha256?: string;
  createdAt: string;
};
```

Required artifact ledger per episode run:

```text
input.normalized.json
01_drama_script.json
02_character_visual_bible.json
03_character_assets_manifest.json
04_storyboard_shotgrid.json
05_start_frame_render_plan.json
05a_contact_sheet_batch_plan.json
05b_contact_sheet_assets_manifest.json
05c_candidate_frame_selection.json
06_start_frame_manifest.json
07_video_motion_prompt_pack.json
08_video_clip_manifest.json
09_assembly_manifest.json
10_qc_report.json
readable_summary.md
run_log.jsonl
```

In SmartSpecPro these may be stored as JSONB rows, platform storage objects, or both. The artifact IDs and hashes must remain durable and visible in audit/debug UI.

```ts
type VerticalDramaAssemblyManifest = {
  handoffType: "video_assembly_manifest";
  targetDurationSeconds: 60;
  clips: Array<{
    clipNumber: number;
    sourceShotNumbers: number[];
    durationSeconds: number;
    mediaAssetId?: string;
    trimStartSeconds?: number;
    trimEndSeconds?: number;
    status: "planned" | "rendering" | "ready" | "failed" | "skipped";
  }>;
  ffmpegConcatPlan: string[];
  subtitlePlan: Array<{
    subtitleCueId: string;
    startSeconds: number;
    endSeconds: number;
    text: string;
    safeArea: "bottom_safe" | "middle_safe" | "top_safe";
  }>;
  audioBgmPlan: Array<{
    trackType: "dialogue" | "voiceover" | "bgm" | "ambience";
    mediaAssetId?: string;
    startSeconds: number;
    endSeconds: number;
    volumeDb?: number;
  }>;
  exportSettings: {
    aspectRatio: "9:16";
    resolution: "1080p" | "720p" | string;
    fps: 24 | 30 | number;
    container: "mp4";
  };
};
```

### 7.4 Duration Profiles

#### Conflict Resolution From GitHub Guide

The referenced GitHub package contains two duration strategies:

1. Updated Veo 3.1-first strategy: 9 frames produce 8 first/last-frame bridge clips, assembled as `8+8+8+8+8+8+8+4 = 60`.
2. OpenAI-compatible legacy/fallback strategy: 9 prompt/input-reference clip requests with durations `[8, 8, 8, 4, 8, 8, 4, 8, 4]`.

Feature 131 chooses strategy 1 as the MVP default for Veo-compatible providers because it preserves continuity better. Strategy 2 remains a fallback/legacy profile when the selected provider cannot bridge adjacent start/end frames.

Default:

```ts
{
  id: "vertical_drama_60s_9_frames_8_clips",
  totalSeconds: 60,
  frameCount: 9,
  clipCount: 8,
  clipDurationsSeconds: [8, 8, 8, 8, 8, 8, 8, 4],
  motionMode: "first_last_frame_bridge"
}
```

Fallback for providers without first/last-frame support:

```ts
{
  id: "vertical_drama_60s_9_shots",
  totalSeconds: 60,
  shotCount: 9,
  shotDurationsSeconds: [8, 8, 8, 4, 8, 8, 4, 8, 4],
  motionMode: "per_shot_first_frame_or_prompt"
}
```

Validation rules:

- sum must equal target duration
- every clip duration must be supported by selected provider
- every generated Storyboard Review task must have stable timing metadata
- final clip trimming must be represented in `VerticalDramaAssemblyManifest.clips`

#### Sub-Shot Decomposition (Intra-Shot Cuts)

To make an episode feel edited like real footage — quick cuts, changing angles, faster
scene changes — instead of one stretched 8-second motion, each main shot may be decomposed
into **sub-shots**: 2-5 short sub-clips whose durations SUM to the parent main-shot duration.
This preserves the 60-second total and the 9-frame/9-shot storyboard; it only subdivides each
main shot's screen time into ordered cuts.

Sub-shots are **opt-in** (feature flag `verticalDramaSeriesSubShots`, default off) and
**capability-gated**: the motion-prompt/provider-routing stage attempts the requested
decomposition only when the resolved provider supports the resulting short clip durations and
input mode, and degrades gracefully otherwise ("as feasible" — reduce the count or fall back to
a single parent clip). Default behavior with the flag off is unchanged.

```ts
type VerticalDramaSubShotPolicy = {
  enabled: boolean;              // gated by verticalDramaSeriesSubShots; default false
  mode: "auto" | "fixed";        // "auto" tries targetPerShot as feasible; "fixed" forces it
  targetPerShot: number;         // default 2-3 (auto aims here)
  maxPerShot: number;            // hard cap 5 (option to raise from 2-3 up to 4-5)
  minSubShotSeconds: number;     // default 1.2 — provider-feasibility + anti-choppy floor
  perSubShotStartFrames: boolean; // default false: sub-shots reframe the parent start frame; true: own start frames
  fallbackOnUnsupported: "fewer_sub_shots" | "single_clip"; // graceful degrade
};

type VerticalDramaSubShot = {
  subShotNumber: number;         // 1-based order within the parent shot
  parentShotNumber: number;      // one of the 9 storyboard shots
  durationSeconds: number;       // sub-shot durations sum to the parent main-shot duration
  cameraSetup: string;           // angle / framing / lens feel / movement for this cut
  prompt: string;                // motion prompt for this sub-shot
  negativeMotionPrompt?: string;
  transitionIn: "cut" | "match_cut" | "smash_cut" | "continuous"; // how it follows the prior sub-shot
  startFrameAssetId?: string;    // optional own start frame; else derived from the parent shot frame
  endFrameAssetId?: string;      // optional (bridged sub-shots)
  providerClipRequestId?: string;// set when the sub-shot is its own provider clip
  status: "planned" | "ready" | "rendering" | "failed" | "skipped";
};
```

Sub-shot timing and mapping rules:

- for a main shot of duration `D` decomposed into `N` sub-shots, sub-shot durations sum to `D`
  and each is `>= minSubShotSeconds`; in `auto` mode `N = min(targetPerShot, floor(D / minSubShotSeconds))`,
  so a short main shot (e.g. the trailing 4s) receives fewer sub-shots;
- the episode total stays 60 seconds and the storyboard stays 9 shots/frames — sub-shots never
  change the shot count or episode duration;
- when enabled and provider-feasible, each sub-shot becomes its own short `video_clip_requests`
  entry so assembly concatenates them as ordered cuts; each sub-clip keeps `parentShotNumber` +
  `subShotNumber`, and `source_shot_numbers` still maps back to the 9 storyboard shots;
- by default sub-shots reuse the parent shot's approved start frame (reframed via `cameraSetup`);
  `perSubShotStartFrames: true` opts into distinct per-sub-shot start frames;
- if the provider cannot support the durations/count, degrade per `fallbackOnUnsupported`
  (reduce `N` toward feasible, or collapse to the single parent clip) and record the reason in
  `provider_feasibility.blocking_reasons`;
- dialogue/subtitle timing may span across sub-shot cuts within a main shot; subtitle 9:16 safe
  areas are preserved per sub-shot;
- QC validates sub-shot count/floor/sum-per-parent and identity/continuity across cuts (§16);
- sub-shot prompts, camera setups, durations, and transitions are visible and editable before
  paid generation, and are repairable per sub-shot (`repair_sub_shot`).

### 7.5 Contact Sheet Start-Frame Generation And Selection

Feature 131 must support two start-frame generation modes:

1. `single_frame_per_shot`: generate/import one start-frame asset per shot.
2. `contact_sheet_3x3_batch`: generate one or more 3x3 contact-sheet images, crop each sheet into 9 candidate frames, then let the user select the best frame for each shot.

The MVP default for generated episode start frames is `contact_sheet_3x3_batch` because it is faster to review and cheaper when using the selected default image model. The default image model for this feature is `google-banana-2-lite` (`Nano Banana 2 Lite`). This feature-level default overrides older global defaults only inside the vertical-drama workflow, and must still be resolved through the app model registry so tenants can allow, disable, or override it.

Supported image model policy:

- the image model dropdown must list every enabled `type = "image"` model from the current model registry;
- models that cannot directly produce 9:16-compatible images must remain selectable only when the contact-sheet crop/pad/resize path can produce valid 9:16 candidate frames, otherwise they are shown with a clear incompatibility reason;
- known currently supported examples include `google-nano-banana-pro`, `google-banana-2`, `google-banana-2-lite`, `flux-2.0`, `z-image`, `grok-imagine`, `gpt-image-1.5-all`, and `gemini-3.1-flash-image-preview`;
- `google-banana-2-lite` is preselected for vertical-drama contact sheets unless tenant policy or model availability says otherwise;
- the UI must show model credit estimate before any paid image generation;
- paid generation is blocked until the user approves the visible prompts and model choice.

Contact-sheet batch contract:

```ts
type VerticalDramaContactSheetBatchPlan = {
  mode: "contact_sheet_3x3_batch";
  selectedImageModelId: string; // default: google-banana-2-lite
  gridLayout: "3x3";
  shotsPerSheet: 9;
  sheetCount: number; // e.g. 3 or 6
  totalCandidateFrames: number; // sheetCount * 9
  aspectRatio: "9:16";
  promptVisibility: "all_prompts_visible";
  promptSets: Array<{
    promptSetId: string;
    sheetIndex: number;
    contactSheetPrompt: string;
    negativePrompt: string;
    perCellPrompts: Array<{
      shotNumber: number;
      cellIndex: number; // 1-9
      row: 1 | 2 | 3;
      col: 1 | 2 | 3;
      imagePrompt: string;
      continuityNotes: string[];
      requiredCharacterRefs: string[];
      productReferenceAssetIds: string[];
    }>;
  }>;
};

type VerticalDramaContactSheetGenerationJobGroup = {
  jobGroupId: string;
  runId: string;
  episodeId: string;
  selectedImageModelId: string;
  sheetCount: number;
  parallelJobLimit: number;
  requestedAt: string;
  status: "planned" | "approved" | "generating" | "cropping" | "ready_for_selection" | "failed" | "cancelled";
  contactSheetJobIds: string[];
  expectedCandidateFrameCount: number;
  completedCandidateFrameCount: number;
  creditEstimate: number;
};

type VerticalDramaContactSheetAsset = {
  contactSheetId: string;
  runId: string;
  episodeId: string;
  promptSetId: string;
  imageModelId: string;
  fullSheetMediaAssetId: string;
  cropStatus: "pending" | "cropped" | "failed";
  croppedFrames: Array<{
    candidateFrameId: string;
    sourceContactSheetId: string;
    shotNumber: number;
    cellIndex: number;
    row: 1 | 2 | 3;
    col: 1 | 2 | 3;
    cropBox: { x: number; y: number; width: number; height: number };
    croppedMediaAssetId: string;
    promptSetId: string;
    imagePrompt: string;
    negativePrompt: string;
    qcStatus: "pending" | "passed" | "failed" | "needs_repair";
  }>;
};

type VerticalDramaSelectedStartFrame = {
  shotNumber: number;
  selectedCandidateFrameId: string;
  selectedMediaAssetId: string;
  sourceContactSheetId: string;
  promptSetId: string;
  selectedByUserId: string;
  selectedAt: string;
  selectionReason?: string;
};
```

Batch examples:

- `sheetCount = 3` creates 3 full 3x3 images and 27 cropped candidate frames.
- `sheetCount = 6` creates 6 full 3x3 images and 54 cropped candidate frames.

User review requirements:

- all contact-sheet prompts, per-cell prompts, negative prompts, model IDs, credit estimates, and source references are visible before generation;
- multiple contact-sheet jobs may run concurrently under the job group's `parallelJobLimit`, with per-sheet status and retry/cancel controls;
- after generation, the user can compare full contact sheets and cropped frames;
- the user can select the best candidate per shot, regenerate a whole sheet, regenerate a single prompt set, or replace a single cropped frame;
- selected frames become the approved start-frame assets for 8 first/last-frame bridge clips or 9 per-shot fallback clips;
- the full contact-sheet asset and cropped candidate frames remain linked for audit, repair, and later prompt tuning.

Cropping requirements:

- crop must be deterministic from the 3x3 grid coordinates;
- every cropped candidate frame must validate or be padded/resized into the selected output frame aspect ratio before it can become an approved start frame;
- crop metadata must persist source sheet ID, prompt set ID, shot number, cell index, crop box, and resulting media asset ID;
- failed crop or wrong-frame QC creates a repair request without deleting the full contact sheet.

### 7.6 Long-Series Memory Policy

For every new episode plan, build the skill input memory bundle in this order:

1. series bible canonical facts;
2. current character state and relationship state;
3. unresolved hooks and required future payoffs;
4. last 3 episode summaries by default;
5. any resolved hook in the last 10 episodes that might affect continuity;
6. product tie-in history and fatigue limits;
7. continuity warnings from the previous episode run;
8. compacted memory text when the full event list is too large.

Memory writes must be append-only events plus a refreshed compacted summary. If a new episode contradicts canonical memory, the pipeline must stop at a repair checkpoint instead of silently rewriting the past.

Memory event kinds:

```ts
type VerticalDramaMemoryKind =
  | "canonical_fact"
  | "episode_summary"
  | "character_delta"
  | "relationship_delta"
  | "hook_opened"
  | "hook_resolved"
  | "product_tie_in_usage"
  | "continuity_warning"
  | "retcon_proposal";
```

Retcons are explicit proposals requiring user approval. Approved retcons create new memory events; they do not mutate older events in place.

---

## 8. User Experience

### 8.1 Series List

The Dashboard menu opens to a production workspace:

- project search/filter
- status chips
- next episode number
- last edited time
- missing approval badges
- product tie-in enabled marker
- button: `สร้างซีรีย์แนวตั้ง`

### 8.2 Create Series Wizard

Steps:

1. Basic setup: title, genre, logline, target episode count, language, target duration.
2. Story setup: main plot, season arc, tone, cliffhanger style.
3. Characters: add/import characters, roles, relationships, initial state.
4. Visual bible: generate or upload character references.
5. Product tie-in: optional product, references, placement policy, forbidden claims.
6. Review: memory seed, skill chain, provider mode, credit estimate.

### 8.3 Series Workspace

Tabs:

- Overview
- Bible
- Characters
- Episodes
- Memory
- Product Tie-in
- Assets
- Settings

### 8.4 Episode Builder

For each episode (stage order is canonical per §11.1):

1. Generate episode script from series memory.
2. Review script and product tie-in plan.
3. Generate 9-shot storyboard.
4. Review 3x3 shotgrid.
5. Generate 9 start-frame requests.
6. Render/import start frames.
7. Approve or repair frames.
8. Generate dialogue/audio/subtitle plan.
9. Generate video motion prompt pack. When `verticalDramaSeriesSubShots` is on, this step also plans sub-shots per main shot (§7.4): a sub-shot editor lets the user set the target count (auto 2-3, raise up to 4-5), and view/edit each sub-shot's camera setup, motion prompt, duration, and transition, with a preview of the cut sequence. Sub-shot prompts/timings are visible and editable before paid generation and repairable per sub-shot.
10. Create Storyboard Review project.
11. Open Storyboard Review.
12. After completion, write episode summary back into series memory.

### 8.5 Storyboard Review Episode Panel

Storyboard Review must show vertical drama metadata:

- series title and episode number
- shot/clip order
- character references attached to each shot
- start-frame asset status
- motion mode: first/last-frame bridge, first-frame-only, or prompt-only
- product tie-in usage for this episode
- continuity warnings
- audio/subtitle/overlay strategy
- voice casting and subtitle safe-area status
- repair queue
- back link to series workspace

### 8.6 History, Review, And Repair Surfaces

The durable data model (append-only memory events, immutable/superseded approval
checkpoints with `sourceArtifactIds`/`repairRequestIds`, per-`runId` artifact ledger,
preserved contact sheets and sibling candidates) must be BROWSABLE by the user, not just
stored. The UI must provide:

- **Run history** — each episode lists its runs (runId, mode, status, timestamp). Selecting
  a run opens a read-only Run Detail view of that run's full artifact ledger
  (`input.normalized.json` … `10_qc_report.json`, `readable_summary.md`, `run_log.jsonl`)
  including per-clip provider job IDs and their stable statuses.
- **Version / lineage browsing** — for any shot, frame, prompt, or clip the user can walk the
  supersede chain (old superseded candidate → repaired candidate) and compare old-vs-new, then
  re-select the fixed version. Replaced/unselected contact-sheet candidates remain viewable.
- **Memory timeline** — the Memory surface is a browsable append-only event timeline
  (filterable by kind/episode, including past `retcon_proposal` events) alongside the current
  compacted summary, so creators see how series memory evolved.
- **Retcon proposal review** — a `retcon_proposal` is an explicit user decision and must have a
  review/approval surface (proposed change + rationale → approve/reject); approval writes a new
  append-only event and never mutates prior events.
- **Re-view prompts used** — reopening a completed episode/run shows the exact prompts (per
  shot / per cell / per clip) actually used, including edited-prompt versions from the
  append-only edit history — not only the pre-generation preview.
- **Repair a specific image** — every problematic frame/clip is fixable end-to-end from the UI:
  a per-target reject/flag control (with reason) and a "Repair" dialog that captures a user
  instruction (prefilled from the repair-prompt template where available) and calls the repair
  route with the exact `stage` + `artifactId` + target `shotNumber`/`clipNumber`; QC
  `recommendedRepairs[]` render as clickable buttons pre-filled with their action/instruction/
  target. Paid repair (regeneration) shows a credit estimate and confirmation; the repair
  produces a new non-destructive version.
- **Always available** — all history/review/repair surfaces stay reachable read-only for
  completed episodes and archived series (archive is soft; nothing is hidden or orphaned).

### 8.7 Simplicity And Progressive Disclosure

The workspace must stay easy to understand despite its depth:

- The 15 canonical `VerticalDramaPipelineStage` stages are grouped into ~4 labeled phases
  (Plan → Frames → Prompt & Handoff → Generate & Assemble) with a phase progress indicator;
  exactly ONE primary CTA is driven by `RunResult.next_action`.
- Workspace tabs use progressive disclosure: a fresh series surfaces only the essential tabs
  (Overview, Episodes); advanced tabs (Memory, Product Tie-in, Assets, Settings) appear once
  relevant/populated.
- Planning, prompt generation, and PAID generation are always visually and textually distinct
  so paid actions are never triggered by accident.
- A breadcrumb (Series › Episode › Storyboard Review) makes deep navigation reversible.

---

## 9. Provider Routing And Safety

Provider routing must be capability-based.

```ts
type VerticalDramaProviderCapabilities = {
  supportsImageGeneration: boolean;
  supportsImageReferences: boolean;
  supportsVideoGeneration: boolean;
  supportsVideoInputReference: boolean;
  supportsFirstLastFrameVideo: boolean;
  supportsHumanFaceInputReference: boolean;
  supportsHumanLikenessCharacterAsset: boolean;
  supportsNativeAudio: boolean;
  supportsThaiNativeAudio: boolean;
  supportsSeparateTts: boolean;
  supportsDialogueTts: boolean;
  supportsSubtitleBurnIn: boolean;
  allowedVideoSeconds: number[];
  allowedVideoSizes: Array<"720x1280" | "1024x1792" | "1080x1920" | string>;
  allowedAspectRatios: Array<"9:16" | "16:9" | "1:1">;
};
```

### 9.1 Provider Adapter Lifecycle

Provider routing must be implemented through adapter interfaces, not one-off provider calls inside UI code.

Required adapters:

- `OpenAIVideoProvider`
- `ExternalImageToVideoProvider`
- `MockVideoProvider`
- `VeoCompatibleVideoProvider` or a config-driven provider entry that implements the same contract

Provider adapter contract:

```ts
type VerticalDramaVideoProviderAdapter = {
  providerId: string;
  capabilities: VerticalDramaProviderCapabilities;
  createClip(request: VerticalDramaVideoClipProviderRequest): Promise<VerticalDramaProviderJob>;
  getJob(jobId: string): Promise<VerticalDramaProviderJob>;
  downloadResult(jobId: string): Promise<VerticalDramaProviderDownloadResult>;
  cancelJob?(jobId: string): Promise<void>;
};
```

```ts
type VerticalDramaVideoClipProviderRequest = {
  // opaque provider-shaped payload; preserves unknown upstream fields per the round-trip clause
  raw: unknown;
  normalized: {
    provider: string;
    motionMode: string;
    prompt: string;
    durationSeconds: number;
    aspectRatio: "9:16" | string;
    startFrameAssetId?: string;
    endFrameAssetId?: string;
    referenceAssetIds?: string[];
    generateAudio?: boolean;
  };
};

type VerticalDramaProviderDownloadResult = {
  // opaque provider-shaped payload; preserves unknown upstream fields per the round-trip clause
  raw: unknown;
  normalized: {
    providerJobId: string;
    resultUrl?: string;
    stagedMediaAssetId?: string;
    checksumSha256?: string;
    contentType?: string;
  };
};
```

Job lifecycle:

```ts
type VerticalDramaProviderJob = {
  providerJobId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
  provider: string;
  createdAt: string;
  updatedAt: string;
  pollAfterSeconds?: number;
  resultUrl?: string;
  stagedMediaAssetId?: string;
  errorCode?: string;
  errorMessage?: string;
};
```

Provider behavior requirements:

- create job only after approval and credit gate pass;
- support polling and webhook/callback where provider supports it;
- enforce timeout, retry, and cancellation policy;
- map provider errors into stable app error codes;
- never persist provider credentials, raw signed upload URLs, or unredacted request headers;
- re-host or stage provider results into app-controlled storage before saving them as durable media assets;
- in tests, `MockVideoProvider` must produce deterministic placeholder artifacts.

Routing outcomes (app-normalized):

- `ready`
- `blocked`
- `fallback_prompt_only` (raw upstream `execution_status`: `fallback_text_to_video`)
- `external_provider_required`
- `manual_review_required`

Rules:

1. If a start frame contains a human face and the provider does not support human-face input references, do not attach it silently.
2. If first/last-frame bridge is unsupported, use first-frame-only or prompt-only fallback after warning.
3. Native audio is allowed only when model capability supports the language and audio policy.
4. Product tie-in claims must be checked before prompt generation and before final render.
5. Under-18 or youth-oriented projects must apply age-safe framing, wardrobe, and dialogue constraints across every skill.
6. Dialogue TTS and subtitles must use separate audio/subtitle artifacts unless the provider explicitly supports native dialogue and the user approves regeneration cost.
7. Preserve both upstream raw status and normalized app status when importing GitHub `provider_request.execution_status`.
8. `OpenAIVideoProvider` is not a first/last-frame human-face bridge provider for MVP. It may be used only for prompt-only or explicitly allowed provider modes after capability checks.
9. `VeoCompatibleVideoProvider` is the MVP first/last-frame bridge path only when tenant/provider config confirms 9:16, required durations, first/last-frame input, and audio policy support. Otherwise the stage must stop with `manual_review_required` or route to `ExternalImageToVideoProvider`.

Video model selection policy:

- the video model dropdown must list every enabled `type = "video"` model from the current model registry that can satisfy the chosen clip mode, duration, aspect ratio, reference-frame policy, and tenant policy;
- the motion prompt skill must create provider-ready prompt payloads from the approved script, selected start frames, selected model, and selected motion mode;
- prompt generation and model routing must not hard-code only Veo. Veo-compatible first/last-frame is preferred only when capabilities match;
- known currently supported examples include `veo3/generate-veo-3-video-lite` (Veo 3.1 Lite), `veo-3-1` (Veo 3.1 Quality), `veo3/generate-veo-3-video-fast`, `gemini-omni-video` (Omni/Gemini Omni Flash), `grok-imagine/text-to-video`, `grok-imagine/image-to-video`, `grok-imagine-video-1-5-preview`, `seedance-1-0-lite-t2v-250428`, `seedance-1-0-lite-i2v-250428`, `seedance-1-0-pro-fast-251015`, `seedance-1-0-pro-250528`, and `bytedance/seedance-1.5-pro` when seeded/enabled;
- user-facing aliases such as `veo 3.1 lite`, `veo 3.1`, `omni flash`, `seedance 2.0 mini`, `seedance 2.0`, and `Grok Imagine 1.5` must resolve through model aliases/config rather than custom branching in this feature;
- unsupported aliases must fail with a clear model resolution error and a suggested enabled model;
- the canonical registry model ID form for Veo 3.1 is `veo-3.1`, `veo-3.1-quality`, and `veo-3.1-fast`; `veo_3_1` is the GitHub manifest parity term and other spellings (`veo-3-1`, `veo 3.1`) are aliases that must resolve to the canonical registry ID rather than being treated as distinct models.

```ts
type VerticalDramaVideoModelRoutingPlan = {
  selectedVideoModelId: string;
  resolvedProvider: string;
  resolvedApiModelId: string;
  motionMode:
    | "first_last_frame_bridge"
    | "first_frame_to_video"
    | "image_to_video"
    | "text_to_video"
    | "reference_to_video"
    | "prompt_only";
  durationProfileId: string;
  supportsSelectedStartFrames: boolean;
  supportsNativeAudio: boolean;
  providerInputFields: Record<string, unknown>;
  promptPackArtifactId: string;
  clipRequests: VerticalDramaProviderRequestSnapshot[];
  creditEstimate: {
    modelId: string;
    clipCount: number;
    estimatedCredits: number;
  };
};
```

Storyboard Review requirements for video models:

- Storyboard Review must show the selected model, resolved provider/API model ID, motion mode, duration, credit estimate, prompt text, negative/motion prompt, start frame, and end frame before paid generation;
- every prompt generated by `vertical-drama-video-motion-prompt-pack` must be inspectable and editable in Storyboard Review;
- changing the video model invalidates provider payloads and marks affected clips stale while preserving the approved start frames;
- changing a selected start frame invalidates the relevant video prompt/request and requires repair or regeneration before paid video generation.

OpenAI video request parity:

- prompt-only requests must preserve model, prompt, seconds, and size fields in the provider request snapshot;
- default OpenAI-compatible seconds are `4`, `8`, and `12`, and vertical sizes include `720x1280` and `1024x1792`;
- if `input_reference` is allowed, it must be represented as `file_id` or `image_url`;
- if `input_reference` is blocked by human-face/human-likeness policy, the persisted decision must include the blocking reason and selected fallback path;
- upstream examples mention `sora-2-pro` as a request skeleton model, but SmartSpecPro must resolve actual model IDs through the model registry and provider policy before any paid call.

External image-to-video adapter parity:

```ts
type VerticalDramaExternalImageToVideoConfig = {
  base_url: string;
  api_key_env: string;
  create_endpoint: string;
  status_endpoint: string;
  download_endpoint: string;
};
```

The external adapter must support dry-run payload creation, create job, poll job, download clip, timeout, retries, cancellation when available, and stable error mapping.

### 9.2 Runtime Configuration And Tenant Policy Mapping

The GitHub guide's `.env.example` and `config/default.yaml` are implementation guidance, not SmartSpecPro runtime architecture. SmartSpecPro must map those settings into existing feature flags, model registry/provider config, tenant policy, and secret storage.

Configuration areas:

```ts
type VerticalDramaRuntimeConfig = {
  default_mode: "dry_run" | "plan_only" | "render_images" | "render_video" | "full";
  model_for_planning?: string;
  max_skill_retries: number;
  modelForPlanning: string;
  image: {
    provider: string;
    model: string; // feature default: google-banana-2-lite
    defaultModelId: "google-banana-2-lite" | string;
    image_model?: string;
    image_size: string;
    image_quality: "standard" | "high" | string;
    auto_approve_generated_character_refs: boolean;
    auto_approve_start_frames: boolean;
    startFrameGenerationMode: "contact_sheet_3x3_batch" | "single_frame_per_shot";
    contactSheetDefaultCount: number;
    contactSheetAllowedCounts: number[];
    cropContactSheetIntoFrames: boolean;
  };
  video: {
    provider: "veo_compatible" | "external_i2v" | "openai_videos" | "mock" | string;
    veo31_model?: string;
    openaiModel?: string;
    mode: "first_last_frame" | "first_frame" | "text_to_video" | string;
    aspectRatio: "9:16";
    resolution: string;
    generate_audio: boolean;
  };
  policy: {
    if_human_face_start_frame:
      | "route_to_external_provider"
      | "prompt_only_fallback"
      | "manual_review_required"
      | "blocked";
    allow_prompt_only_fallback: boolean;
    enforce_openai_current_restrictions: boolean;
  };
  assembly: {
    fps: 24 | 30 | number;
    format: "mp4";
    resolution: "1080x1920" | "720x1280" | string;
  };
};
```

The upstream config defaults must have explicit SmartSpecPro equivalents:

```yaml
model_for_planning: gpt-5.5
video_prompt_skill_dir: ../skills/video-motion-prompt-pack-skill
image_provider: openai_image_api
image_model: gpt-image-2
veo31_model: veo-3.1
duration_profile: veo31_first_last_bridge_60s
```

- `model_for_planning = "gpt-5.5"` maps to the app's configured planning model unless tenant/model policy overrides it.
- `image_provider = "openai_image_api"` maps to a provider registry capability, not to a hard-coded runtime client.
- `image_model = "gpt-image-2"` maps to the app image model registry entry for image/start-frame planning.
- `image_size = "1024x1536"` is the imported guide default for vertical start-frame image requests; SmartSpecPro may expose another UI label but must preserve this value in upstream-compatible fixtures.
- `veo31_model = "veo-3.1"` maps to the selected video model registry entry for first/last-frame bridge mode.
- `duration_profile = "veo31_first_last_bridge_60s"` maps to `duration_profile_default` and the SmartSpecPro `vertical_drama_60s_9_frames_8_clips` duration profile.
- `drama_skill_dir`, `character_skill_dir`, `storyboard_skill_dir`, `start_frame_skill_dir`, and `video_prompt_skill_dir` are guide-local paths only and map to the eight `apps/web/skills/vertical-drama-*` folders.
- Feature 131 overrides the imported image default for production contact-sheet generation: default image model is `google-banana-2-lite`, mode is `contact_sheet_3x3_batch`, and default `sheetCount` is tenant-configurable with UI presets such as 3 and 6.
- The imported `gpt-image-2`/`1024x1536` defaults remain supported only as compatibility fixtures or when selected by model policy.

Tenant policy requirements:

- beta default is `default_mode = "dry_run"` and `auto_approve_generated_character_refs = false`;
- `auto_approve_start_frames` defaults to false for human characters and product tie-in scenes;
- tenant admins may restrict providers, max episode count, native audio, regulated product categories, and prompt-only fallback;
- changes to provider policy, auto-approval policy, and product approval policy must be audit logged;
- generated/provider assets inherit tenant and project ownership checks before they can be reused as references.

Secret and environment mapping:

- upstream names `OPENAI_AGENTS_DISABLE_TRACING`, `EXTERNAL_I2V_API_KEY`, `EXTERNAL_I2V_BASE_URL`, `VDFLOW_DEFAULT_MODEL`, `VDFLOW_IMAGE_MODEL`, and `VDFLOW_VIDEO_MODEL` are guide names only;
- SmartSpecPro must use its existing secret/config conventions for equivalent provider keys and model defaults;
- no API key, bearer token, signed upload URL, or provider webhook secret may be stored in series tables, Storyboard Review metadata, run artifacts, or browser-visible JSON.

---

## 10. Skill Runtime And Import Contract

### 10.1 Location

Required new skill folders:

```text
apps/web/skills/vertical-drama-script-builder/
apps/web/skills/vertical-drama-character-visual-bible/
apps/web/skills/vertical-drama-storyboard-shotgrid/
apps/web/skills/vertical-drama-shot-start-frame-render/
apps/web/skills/vertical-drama-dialogue-audio-planner/
apps/web/skills/vertical-drama-video-motion-prompt-pack/
apps/web/skills/vertical-drama-series-memory-planner/
apps/web/skills/vertical-drama-product-tie-in-planner/
```

Each folder must include:

- `SKILL.md`
- `skill.md` manifest/frontmatter for legacy skill registry compatibility
- `skill.json` when imported from the GitHub guide or when structured schema metadata is useful
- `prompts/system.prompt.md` or a lossless equivalent embedded in `SKILL.md` when importing GitHub `entry_prompt`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json` when form generation is required
- `references/input_contract.md`
- `references/output_contract.md`
- `references/maintenance.md`
- `fixtures/` with passing and failing examples
- `examples/example.input.th.json`
- `examples/example.output.sample.json`
- `tests/tests.json` or equivalent structured assertions
- `scripts/verify.sh`
- `help/help.th.md`
- `help/help.en.md`
- optional `skill.lock.json` or version snapshot if current registry tooling expects it

Imported `skill.json` manifest parity fields:

- `name`
- `display_name`
- `display_name_th`
- `version`
- `description`
- `description_th`
- `entry_prompt`
- `input_schema`
- `ui_schema`
- `output_schema`
- `help_files`
- `examples`
- `capabilities`

Imported skill manifest names must be mapped losslessly:

- `character_visual_bible_builder`
- `storyboard_shotgrid_generator`
- `shot_start_frame_render_planner`
- `video_motion_prompt_pack_builder`

Imported capability flags must be preserved in fixtures where applicable:

- `plain_text_output`
- `json_handoff`
- `bilingual_ui`
- `character_consistency_focused`
- `character_reference_driven`
- `fixed_duration_60_seconds`
- `fixed_grid_3x3`
- `shots_per_batch`
- `fixed_shot_count`
- `vertical_start_frames`
- `repair_queue`
- `shot_start_frame_references`
- `provider_agnostic`
- `openai_sora_safe_mode`
- `assembly_manifest`
- `veo31_first`
- `openai_sora_primary = false`

### 10.2 Metadata Defaults

Use SmartSpecPro metadata style:

```yaml
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
```

Skills must not auto-trigger from normal chat by default. The series builder invokes them explicitly through the episode pipeline.

### 10.3 Schema Validation

Every skill output must validate before it is persisted or handed to the next stage. Failed validation should create a repair request, not silently continue.

All vertical-drama skills must return structured JSON only. Free-form prose is allowed only inside explicitly named fields such as `human_summary`, `final_prompt`, `dialogue_line`, `revision_instruction`, or `notes`.

Validation error reporting must preserve enough debug information to repair the stage:

```ts
type VerticalDramaValidationErrorReport = {
  path: string;
  message: string;
  schema_path: string;
  instance_snippet: unknown;
};

type VerticalDramaSkillRunDebugSnapshot = {
  runId: string;
  stage: VerticalDramaPipelineStage;
  skillName: string;
  model: string;
  trace_id?: string;
  attempt: number;
  inputArtifactId: string;
  rawOutputArtifactId?: string;
  parsedOutputArtifactId?: string;
  validationErrors: VerticalDramaValidationErrorReport[];
  savedAt: string;
};
```

Raw model outputs may be stored only in tenant-owned debug artifacts with normal retention/redaction controls. Do not expose chain-of-thought or provider secrets. Repair prompts may include validation summaries, schema paths, and compact snippets, but not full signed URLs or credentials.

Recommended tests:

- validate every required skill has metadata
- validate input/output schemas parse
- validate example inputs/outputs
- validate skill registry can load the folders
- validate missing required skill blocks episode generation with a clear error
- run every `scripts/verify.sh` without live provider calls
- snapshot required top-level output fields and contract versions
- schema failure creates `VerticalDramaValidationErrorReport`, a repair request, and a raw-output debug artifact with redaction

### 10.4 Dialogue And Audio Skill

`vertical-drama-dialogue-audio-planner` is required for production parity.

Purpose: turn the episode script into cast-aware dialogue, narration, voice casting, subtitle, and timing metadata without creating paid audio.

Inputs:

- episode script JSON;
- character roster and voice continuity map;
- target language;
- audio strategy: `separate_tts_voiceover`, `native_video_audio`, `dialogue_tts`, or `silent`;
- target duration and shot/clip timing;
- age and product tie-in policy.

Outputs:

- dialogue lines by shot/clip;
- speaker-to-character mapping;
- selected or required voice IDs;
- subtitle cues with 9:16 safe-area hints;
- audio timing estimate;
- native-audio prompt snippets only when allowed;
- separate-TTS render plan;
- warnings for missing voices, overlong speech, unsafe claims, or unsupported native audio.

The first implementation may reuse rules from `article-storytelling-voiceover-script`, but it must have its own vertical-drama schema because series character voice continuity and multi-episode dialogue history are core requirements.

---

## 11. Episode Pipeline

### 11.1 Stages

```text
normalize_series_input
  -> plan_episode_script
  -> update_character_visual_bible
  -> generate_or_import_character_refs
  -> storyboard_shotgrid
  -> start_frame_render_plan
  -> render_or_import_start_frames
  -> approve_start_frames
  -> dialogue_audio_plan
  -> video_motion_prompt_pack
  -> create_storyboard_review_project
  -> review_generate_repair_in_storyboard_review
  -> render_or_import_video_clips
  -> assemble_episode_manifest
  -> summarize_episode_to_series_memory
```

Each stage must be resumable and idempotent where possible.

### 11.2 Checkpoints

Approval checkpoints:

1. episode script
2. character visual bible changes
3. character reference assets
4. 9-shot storyboard grid
5. start-frame render requests
6. rendered/imported start frames
7. dialogue/audio/subtitle plan
8. motion prompt pack
9. Storyboard Review project creation
10. rendered/imported video clips
11. final assembly manifest
12. final episode memory update

Each approval checkpoint must persist a durable artifact equivalent to GitHub `checkpoints/{stage_name}.approval.json`:

```ts
type VerticalDramaApprovalCheckpointArtifact = {
  checkpointId: string;
  runId: string;
  seriesId: string;
  episodeId: string;
  stage: VerticalDramaPipelineStage;
  state: "pending" | "approved" | "rejected" | "repaired" | "superseded";
  approvedByUserId?: string;
  rejectedByUserId?: string;
  sourceArtifactIds: string[];
  repairRequestIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
```

Approving a checkpoint never mutates the prior artifact in place. Repairs create a new artifact/version, supersede the previous approval candidate, and keep the full audit chain.

### 11.3 Dry-Run Mode

Dry-run mode must:

- create structured plans and manifests
- avoid paid image/video/TTS calls
- produce mock provider decisions
- allow UI review of cost and missing inputs
- be usable in tests without API keys

### 11.4 Run Modes

Episode runs must support these modes:

- `dry_run`: no provider calls; may use mocked skill/provider output.
- `plan_only`: real LLM skill planning is allowed, no image/video/TTS provider calls.
- `render_images`: create or import character/start-frame images only.
- `render_video`: render approved video clips only.
- `full`: run all approved provider stages and assembly.

Each stage must be independently callable and resumable from persisted artifacts.

### 11.5 Stage Result, Run Result, And Routing Decision Contracts

The GitHub guide includes `NormalizedEpisodeInput`, `RunResult`, `VideoRoutingDecision`, and `QCResult` concepts. SmartSpecPro must expose equivalent contracts through shared TypeScript types and tRPC responses so the Dashboard can resume, repair, and hand off safely.

```ts
type VerticalDramaPipelineStage =
  | "normalize_series_input"
  | "plan_episode_script"
  | "update_character_visual_bible"
  | "generate_or_import_character_refs"
  | "storyboard_shotgrid"
  | "start_frame_render_plan"
  | "render_or_import_start_frames"
  | "approve_start_frames"
  | "dialogue_audio_plan"
  | "video_motion_prompt_pack"
  | "create_storyboard_review_project"
  | "review_generate_repair_in_storyboard_review"
  | "render_or_import_video_clips"
  | "assemble_episode_manifest"
  | "summarize_episode_to_series_memory";

type VerticalDramaWarning = {
  code: string;
  severity: "info" | "warning" | "error" | "blocking";
  message: string;
  targetStage?: VerticalDramaPipelineStage;
  targetShotNumber?: number;
  targetClipNumber?: number;
  repairable: boolean;
};

type NormalizedEpisodeInput = {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  locale: "th" | "en";
  targetDurationSeconds: 60;
  aspectRatio: "9:16";
  storyBrief: string;
  memoryBundle: VerticalDramaSeriesMemory;
  characters: VerticalDramaCharacter[];
  tieIn?: VerticalDramaProductTieInConfig;
  ageControl?: VerticalDramaMinimalInput["ageControl"];
};

type RunResult = {
  runId: string;
  seriesId: string;
  episodeId: string;
  stage: VerticalDramaPipelineStage;
  status: "queued" | "running" | "approval_required" | "succeeded" | "failed" | "cancelled";
  next_action:
    | "approve"
    | "repair"
    | "resume_next_stage"
    | "open_storyboard_review"
    | "wait_for_provider"
    | "none";
  artifactIds: string[];
  errors: Array<{
    code: string;
    message: string;
    targetArtifactId?: string;
    repairable: boolean;
  }>;
  warnings: VerticalDramaWarning[];
  qc?: QCResult;
};

type VideoRoutingDecision = {
  provider: string;
  provider_caps: VerticalDramaProviderCapabilities;
  recommended_provider_path:
    | "veo_first_last_frame"
    | "external_image_to_video"
    | "openai_prompt_only"
    | "manual_review";
  execution_status:
    | "ready"
    | "blocked"
    | "fallback_text_to_video"
    | "manual_review_required"
    | "external_provider_required";
  normalizedStatus:
    | "ready"
    | "blocked"
    | "fallback_prompt_only"
    | "manual_review_required"
    | "external_provider_required";
  blockingReasons: string[];
  provider_request: VerticalDramaProviderRequestSnapshot;
};

type QCResult = VerticalDramaQcResult;
```

API response requirements:

- every stage run returns `RunResult`, even when the stage only creates a repair request;
- `next_action` must drive the primary Dashboard CTA and may not be inferred from free-form text;
- `VideoRoutingDecision.provider_request` stores raw upstream snake_case payloads and normalized app status together;
- `QCResult` is persisted with the stage artifact and surfaced in repair UI;
- failed schema validation must set `status = "failed"` and `next_action = "repair"` with a stable error code.

### 11.6 Developer Command Equivalents

SmartSpecPro does not ship the standalone GitHub CLI, but implementation must provide equivalent safe development and admin paths:

| GitHub command concept | SmartSpecPro equivalent |
| --- | --- |
| `vdflow validate` | skill `scripts/verify.sh`, schema tests, and app test commands |
| `vdflow run` | episode stage runner via tRPC/service in `dry_run`, `plan_only`, or `full` mode |
| `vdflow render-images` | image generation/import stage for character refs and start frames |
| `vdflow render-video` | provider job stage for approved clip requests |
| `vdflow assemble` | assembly/export service using existing render/export path |
| `vdflow repair` | repair single stage output route with artifact ID, stage, target shot/clip, and instruction |

The repair endpoint must accept the same logical inputs as the GitHub repair command: stage, artifact ID, target shot/clip when applicable, and user instruction. It must create a new repair artifact instead of overwriting the previous approved artifact.

### 11.7 Audit Events

Every paid generation, approval, repair, and archive action MUST emit a durable audit event. Audit events are append-only and part of the audit chain; they must never be mutated or deleted. This is a spec rule, not only a test assertion in §20.

```ts
type VerticalDramaAuditEvent = {
  eventId: string;
  seriesId: string;
  episodeId?: string;
  runId?: string;
  action: "paid_generation" | "approval" | "repair" | "archive";
  actorUserId: string;
  targetArtifactId?: string;
  creditsCharged?: number;
  createdAt: string;
};
```

- `paid_generation` events must record `creditsCharged` and the target artifact.
- `approval` and `repair` events must reference the checkpoint/repair artifact they act on.
- `archive` events must reference the archived series (and episode when applicable).

---

## 12. Storyboard Review Mapping

Recommended mapping:

```ts
type VerticalDramaTaskExtraParams = {
  source: "vertical_drama_series";
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  shotNumber: number;
  clipNumber?: number;
  parentShotNumber?: number;   // set when this task is a sub-shot of a decomposed main shot (§7.4)
  subShotNumber?: number;      // 1-based order within the parent shot
  subShotCount?: number;       // total sub-shots for the parent shot
  subShotTransitionIn?: "cut" | "match_cut" | "smash_cut" | "continuous";
  durationProfileId: string;
  motionMode:
    | "first_last_frame_bridge"
    | "first_frame_to_video"
    | "image_to_video"
    | "text_to_video"
    | "reference_to_video"
    | "prompt_only";
  characterReferenceAssetIds: string[];
  productReferenceAssetIds?: string[];
  startFrameAssetId?: string;
  endFrameAssetId?: string;
  contactSheetIds: string[];
  candidateFrameAssetIds: string[];
  selectedStartFrameCandidateId?: string;
  selectedEndFrameCandidateId?: string;
  promptSetId?: string;
  referenceFrameRoles: Array<"start" | "stop" | "character" | "product" | "style">;
  dialogueAudioPlanId?: string;
  subtitleCueIds?: string[];
  videoPromptSkillId: "vertical-drama-video-motion-prompt-pack";
  storyboardSkillId: "vertical-drama-storyboard-shotgrid";
  characterBibleSkillId: "vertical-drama-character-visual-bible";
  dialogueAudioSkillId: "vertical-drama-dialogue-audio-planner";
  productTieIn?: VerticalDramaTieInUsage;
  continuityWarnings: string[];
  providerRoutingDecision?: VideoRoutingDecision;
  assemblyManifestId?: string;
};
```

Task rules:

- `StoryboardGenerationTask.type` should be `video`.
- `prompt` stores only the video generation prompt.
- overlay/subtitle text stays in overlay/subtitle metadata.
- image prompt, contact-sheet prompt, per-cell prompt, negative prompt, selected image model ID, selected video model ID, selected candidate frame, and source contact-sheet lineage must be visible in Storyboard Review metadata panels.
- all image prompts, video prompts, selected start frames, model selections, and provider payload previews must be visible before paid generation.
- candidate start frames generated from 3x3 sheets must be reviewable before they become `storyboardContext.referenceImages`.
- for `first_last_frame_bridge`, `storyboardContext.referenceImages[0]` is the start frame and `referenceImages[1]` is the stop/end frame.
- set `storyboardContext.extraParams.referenceFrameRoles = ["start", "stop"]` when two bridge frames are present so existing Storyboard Review helpers infer `start_stop`.
- character references stay out of the start/stop pair unless they are also listed separately in `extraParams.characterReferenceAssetIds`.
- product references stay out of the start/stop pair unless explicitly used as a scene frame; otherwise store them in `extraParams.productReferenceAssetIds`.
- product tie-in metadata stays reviewable and auditable.
- changing model/provider capability marks affected prompts/tasks stale.
- initialize `videoSegmentState.videoSegmentPlan.referenceMode` as `start_stop` for bridge mode and keep `staleTaskIds` empty only after all prompt/frame references validate.
- preserve existing `companionAudio`, `companionAudioUpdatedAt`, `voiceoverFullScript`, and per-task `durationSeconds` conventions.

### 12.1 Storyboard Review Idempotency

Handoff must use an idempotency key:

```text
vertical-drama:<seriesId>:episode:<episodeId>:handoff:<episodePlanHash>
```

Retrying the same approved episode plan must open or update the existing Storyboard Review project, not create a duplicate. Creating a new project requires a new approved plan hash or explicit user action.

### 12.2 Render And Assembly Completion

Storyboard Review remains the review and generation workspace. After video clips are generated or imported, the series workspace must ingest:

- generated clip media asset IDs;
- provider job IDs and stable statuses;
- clip QC results;
- updated `VerticalDramaAssemblyManifest`;
- final MP4/media asset ID when export completes;
- memory update candidate for the next episode.

Export completion must not mutate canonical series memory automatically. It creates a pending memory update checkpoint that the user can approve or repair.

### 12.3 Archival Behavior

Archiving a series is a soft operation. Setting series `status = "archived"` hides its assets from the active workspace but MUST preserve Storyboard Review history and the handoff linkage (`seriesId`/`episodeId` backlinks, idempotency keys, approval checkpoints, and audit events). Archival must never orphan Storyboard Review projects and must never hard-delete artifacts that participate in the audit chain. Restoring the series must re-surface the same linked history intact.

---

## 13. Product Tie-In

Tie-in config:

```ts
type VerticalDramaProductTieInConfig = {
  enabled: boolean;
  productName?: string;
  productDescription?: string;
  referenceAssetIds: string[];
  productSource?: "manual" | "marketplace" | "library" | "uploaded_reference";
  disclosurePolicy: "not_required" | "show_overlay_disclosure" | "caption_disclosure" | "manual_review";
  regulatedCategory?: "none" | "health" | "beauty" | "finance" | "medical" | "baby_kids" | "other";
  allowedStoryFunctions: Array<
    | "memory_trigger"
    | "relationship_token"
    | "status_symbol"
    | "daily_use"
    | "plot_clue"
    | "soft_cta"
  >;
  forbiddenClaims: string[];
  maxEpisodesWithTieInPerTenEpisodes: number;
  requireHumanApproval: boolean;
};
```

Tie-in output:

```ts
type VerticalDramaTieInUsage = {
  enabled: boolean;
  episodeHasTieIn: boolean;
  shotNumbers: number[];
  storyFunction: string;
  placementNaturalnessScore: number;
  claimsReview: {
    unsupportedClaimsDetected: boolean;
    warnings: string[];
  };
  disclosureRequired: boolean;
  disclosureText?: string;
  approvedByUserId?: string;
};
```

Acceptance:

- product appears only when it serves the scene
- product references are available to image/start-frame prompts when needed
- no unsupported claims are introduced
- repeated placement is tracked across series memory
- user can approve, remove, or repair a tie-in before Storyboard Review creation
- regulated categories require manual review before paid generation
- disclosure/caption/overlay text is stored separately from the video prompt
- product provenance is retained for audit and later Library/marketplace workflows

---

## 14. Audio, Dialogue, And Subtitles

Vertical drama is dialogue-heavy. Audio must be planned as a first-class layer rather than a note inside the video prompt.

Supported strategies:

- `separate_tts_voiceover`: dialogue/narration is generated separately and mixed later.
- `dialogue_tts`: provider-native multi-speaker TTS when available, otherwise segment-and-merge.
- `native_video_audio`: speech/ambience is part of generated video only when the video model supports it and the user accepts regeneration cost.
- `silent`: internal fallback or visual-only planning state.

Rules:

1. Each named character should have a stable voice assignment across the series.
2. Missing voice IDs block paid TTS generation but do not block script/storyboard planning.
3. Dialogue lines must fit shot/clip timing budgets.
4. Subtitle cues must respect 9:16 safe areas and avoid covering faces/products.
5. Subtitle and overlay text remain separate from video prompt text.
6. If native video audio is selected, Storyboard Review must show that script changes require video regeneration.
7. If separate TTS is selected, Storyboard Review must be able to regenerate audio without changing video prompts or frame references.

Recommended metadata:

```ts
type VerticalDramaDialogueAudioPlan = {
  audioStrategy: "separate_tts_voiceover" | "dialogue_tts" | "native_video_audio" | "silent";
  language: "th-TH" | "en-US" | string;
  voiceContinuityMap: Array<{
    characterId: string;
    speakerName: string;
    voiceProvider?: string;
    voiceModelId?: string;
    voiceId?: string;
    fallbackVoiceId?: string;
  }>;
  shotLines: Array<{
    shotNumber: number;
    clipNumber?: number;
    speakerCharacterId?: string;
    text: string;
    targetDurationSeconds: number;
    subtitleCueId?: string;
  }>;
  subtitleSafeArea: {
    position: "bottom_safe" | "middle_safe" | "top_safe";
    maxLines: number;
    avoidFaceArea: boolean;
  };
  warnings: VerticalDramaWarning[];
};
```

---

## 15. API, Routes, And File Ownership

Expected file/module ownership for implementation planning:

Shared contracts:

- `apps/web/shared/verticalDramaSeries/`
- `apps/web/shared/featureFlags.ts`
- shared tests under `apps/web/shared/__tests__/`

Server:

- `apps/web/server/routers/verticalDramaSeries.ts`
- router registration in the server router barrel/index used by this repo
- `apps/web/server/services/verticalDramaSeriesService.ts`
- `apps/web/server/services/verticalDramaEpisodePipelineService.ts`
- `apps/web/server/services/verticalDramaMemoryService.ts`
- `apps/web/server/services/verticalDramaProviderRoutingService.ts`
- `apps/web/server/services/verticalDramaStoryboardHandoffService.ts`
- `apps/web/server/services/__tests__/verticalDrama*.test.ts`
- Drizzle schema and migration files for dedicated tables

Client:

- Dashboard/menu registration using the existing menu/route convention
- `apps/web/client/src/pages/VerticalDramaSeriesPage.tsx`
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/`
- route registration in the app route file used by this repo
- Storyboard Review metadata panel/backlink integration

Skills:

- the eight `apps/web/skills/vertical-drama-*` folders listed in Section 10

API boundaries:

- list/create/update/archive series
- create/update characters and character asset links
- create/update episode draft
- run or resume episode stage in dry-run
- approve/reject stage output
- create Storyboard Review handoff
- update series memory after Storyboard Review completion
- repair single stage output

Every mutating route must enforce tenant ownership, feature flag access, user authorization, idempotency, and audit logging.

---

## 16. QC And Repair

QC stages:

- script QC
- series continuity QC
- character visual QC
- storyboard QC
- start-frame prompt QC
- start-frame image QC
- video prompt QC
- provider routing QC
- product tie-in QC
- Storyboard Review handoff QC
- episode memory update QC

Required checks:

- 9:16 output
- duration sums correctly
- when sub-shots are enabled: each main shot's sub-shot durations sum to the parent shot duration, every sub-shot meets `minSubShotSeconds`, sub-shot count is within `maxPerShot`, and identity/continuity is preserved across cuts (not too choppy, not stretched) (§7.4)
- character identity and wardrobe consistency
- relationship/plot continuity
- no duplicate or contradictory episode memory
- no forced or unsupported product claims
- prompt/overlay/audio separation
- provider capability policy honored
- repair queue exists for every failed stage
- skill contract version matches the persisted episode run
- audio/subtitle timing stays within episode duration
- Storyboard Review start/stop frame roles are valid
- generated/provider assets are tenant-owned and not stale/deleted

Typed QC schema:

```ts
type VerticalDramaQcResult = {
  qcReportId: string;
  seriesId: string;
  episodeId: string;
  runId: string;
  stage:
    | "script"
    | "character_visual"
    | "storyboard"
    | "start_frame_prompt"
    | "start_frame_image"
    | "video_prompt"
    | "provider_routing"
    | "video_clip"
    | "assembly"
    | "product_tie_in"
    | "storyboard_review_handoff"
    | "episode_memory_update";
  passed: boolean;
  score: number;
  issues: Array<{
    issueId: string;
    severity: "info" | "warning" | "error" | "blocking";
    targetType: "series" | "episode" | "character" | "shot" | "clip" | "asset" | "provider" | "audio" | "subtitle" | "tie_in";
    targetId?: string;
    message: string;
    evidence?: string;
  }>;
  recommendedRepairs: Array<{
    repairId: string;
    stage: VerticalDramaQcResult["stage"];
    action:
      | "rewrite_script"
      | "regenerate_character"
      | "repair_storyboard_shot"
      | "repair_start_frame_prompt"
      | "regenerate_start_frame"
      | "repair_motion_prompt"
      | "reroute_provider"
      | "regenerate_clip"
      | "repair_sub_shot"
      | "adjust_sub_shot_timing"
      | "adjust_audio_subtitle"
      | "remove_or_rewrite_tie_in"
      | "repair_assembly";
    instruction: string;
    autoRunnable: boolean;
  }>;
  createdAt: string;
};
```

---

## 17. Feature Flags And Rollout

Flags:

```ts
verticalDramaSeries
verticalDramaSeriesDashboardMenu
verticalDramaSeriesSkillChain
verticalDramaSeriesCharacterStock
verticalDramaSeriesMemory
verticalDramaSeriesProductTieIn
verticalDramaSeriesStartFrames
verticalDramaSeriesFirstLastFrameBridge
verticalDramaSeriesStoryboardReviewHandoff
verticalDramaSeriesProviderRouting
verticalDramaSeriesQcRepair
verticalDramaSeriesDialogueAudio
verticalDramaSeriesSubtitles
verticalDramaSeriesSubShots
```

Rollout:

1. Hidden developer flag.
2. Import/adapt skills and schema validation tests.
3. Read-only series bible and character stock workspace.
4. Dry-run episode planning with mock provider decisions.
5. Start-frame plan and approval checkpoints.
6. Storyboard Review handoff.
7. Provider routing and paid generation gates.
8. Product tie-in beta.
9. Long-series memory beta for 30+ episodes.
10. Production allowlist.

---

## 18. Implementation Waves

### Wave 1: Skill Import And Contracts

Tasks:

1. Create SmartSpecPro-compatible skill folders under `apps/web/skills`.
2. Adapt GitHub skill prompts into `SKILL.md` without losing schema requirements.
3. Add input/output schemas, examples, and help files.
4. Add skill registry tests for discovery and metadata.
5. Add validation fixtures for the four imported skills and four SmartSpecPro-only skills.
6. Add `scripts/verify.sh`, contract references, and passing/failing fixtures for every skill.

Acceptance:

- all eight skills load through the existing skill registry
- examples validate
- fixture verification scripts pass without live provider calls
- missing skill produces a clear blocked state
- no paid provider calls are made by skills directly

### Wave 2: Series Project And Memory Model

Tasks:

1. Add series project contracts.
2. Add CRUD API for series projects, characters, assets, episodes, and memory.
3. Add feature flags and tenant policy checks.
4. Add memory compaction/update helpers.
5. Add media asset ownership mapping for character/product/start-frame/clip/audio/subtitle assets.

Acceptance:

- user can create a 10/20/30/100 episode series shell
- characters and memory persist and reload
- episode summaries update series memory without losing canonical facts

### Wave 3: Dashboard UI

Tasks:

1. Add Dashboard menu and route.
2. Build series list, create wizard, workspace tabs, and episode builder.
3. Show approvals, repair queues, provider warnings, and credit estimates.
4. Use Astryx components where this repo's UI path uses them.
5. Add feature-flagged route/menu tests and Thai/English copy.

Acceptance:

- no existing Dashboard or Article Video Builder behavior changes
- user can create a series and plan episode 1 in dry-run mode
- UI separates planning from paid generation

### Wave 4: Episode Pipeline

Tasks:

1. Implement resumable pipeline state.
2. Invoke skills in order.
3. Validate each output.
4. Persist artifacts and approvals.
5. Generate QC reports and repair requests.
6. Add dialogue/audio/subtitle planning stage and timing validation.
7. Persist required run artifacts from `input.normalized.json` through `10_qc_report.json`.
8. Add contact-sheet start-frame generation planning with configurable `sheetCount`, visible prompt sets, deterministic 3x3 crop metadata, and candidate-frame selection.

Acceptance:

- dry-run episode creates script, dialogue/audio plan, character bible delta, shotgrid, start-frame plan, motion prompt pack, and handoff preview
- run artifact ledger contains every required stage artifact
- failed schema validation stops the stage with repair guidance
- dry-run can plan 3 and 6 contact-sheet batches without paid image calls and reports 27/54 candidate frames respectively

### Wave 5: Storyboard Review Handoff

Tasks:

1. Map episode plan into Storyboard Review draft/tasks.
2. Persist vertical drama metadata in task extra params.
3. Attach character references and start/end frames distinctly.
4. Add back link and metadata panel in Storyboard Review.
5. Prevent duplicate handoff on retry.
6. Initialize `referenceFrameRoles`, `videoSegmentState`, and audio/subtitle metadata.
7. Surface contact-sheet prompts, per-cell prompts, candidate frames, selected start frames, selected image/video models, and provider payloads in Storyboard Review.

Acceptance:

- one 60s episode creates ordered Storyboard Review video tasks with valid start/stop frame roles
- prompts, references, tie-in, continuity warnings, and provider routing decisions round-trip
- task order and duration profile remain stable
- user can inspect and edit image/video prompts and verify start frames before paid video generation

### Wave 6: Provider Routing, QC, And Repair

Tasks:

1. Add provider capability checks for first/last-frame, human-face references, allowed duration, native audio, and aspect ratio.
2. Add repair actions per failed stage.
3. Add product tie-in compliance checks.
4. Add Storyboard Review stale-state handling when provider/model changes.
5. Add asset lifecycle and signed URL redaction checks.
6. Add provider adapter job lifecycle for create/poll/webhook/download/cancel.
7. Resolve image/video model selection from the live model registry, with feature default image model `google-banana-2-lite`.
8. Add model routing support for Veo 3.1 Lite/Quality/Fast, Gemini Omni/Omni Flash, Grok Imagine variants, Seedance variants, and any future enabled video model with compatible capabilities.

Acceptance:

- unsupported human-face input references are blocked/rerouted with visible reason
- provider fallbacks never happen silently
- repair can regenerate a single character, shot, start frame, prompt pack, or tie-in plan
- model aliases resolve through registry; unsupported models fail with clear repair guidance

### Wave 7: Assembly And Export

Tasks:

1. Persist `final_episode_assembly_manifest`.
2. Map Storyboard Review generated/imported clip assets back to the series episode.
3. Build concat, subtitle, audio/BGM, and export settings metadata.
4. Trigger or hand off final render/export through the existing render system where available.
5. Store final MP4/media asset ID and QC result.
6. Create a pending memory update checkpoint after export completion.
7. Persist export-adjacent artifacts equivalent to GitHub `concat.txt`, `subtitles.srt`, `audio_plan.json`, `ffmpeg_command.sh`, and `final_episode_60s_vertical.mp4` metadata when the render path produces them.
8. Mark runs as `assembly_ready` when final render cannot be executed automatically but all deterministic assembly inputs are present.

Acceptance:

- final assembly manifest round-trips with clips, subtitle plan, audio/BGM plan, and export settings;
- final MP4/export asset is tenant-owned and linked to the episode;
- failed assembly creates a repair action without rewriting series memory;
- completed export can be used to seed the next episode summary after user approval.

---

## 19. Section Plan

Implementation should be decomposed into section files under:

```text
specs/feature/131-vertical-drama-series-storyboard-video-flow/sections/
```

Required sections:

1. `section-01-skill-packages.md`
2. `section-02-contracts-persistence-assets.md`
3. `section-03-dashboard-routes-feature-flags.md`
4. `section-04-series-memory-and-episode-pipeline.md`
5. `section-05-character-stock-and-start-frames.md`
6. `section-06-storyboard-review-handoff.md`
7. `section-07-audio-dialogue-subtitles.md`
8. `section-08-provider-qc-product-tie-in.md`
9. `section-09-assembly-export-artifacts.md`

Each section must include goal, dependencies, files, test-first list, implementation tasks, acceptance, and verification commands.

---

## 20. Test Plan

Unit:

- skill schema validation
- skill fixture and `scripts/verify.sh` validation
- image model resolver lists every enabled image model and preselects `google-banana-2-lite` for vertical-drama contact sheets
- contact-sheet 3x3 batch plan validates `sheetCount`, prompt visibility, deterministic crop boxes, candidate frame count, and selected-frame provenance
- video model resolver lists every enabled compatible video model and maps aliases for Veo, Omni/Gemini Omni, Seedance, and Grok Imagine variants
- duration profile validation
- provider routing decisions
- provider adapter job lifecycle
- memory compaction
- memory retrieval bundle construction for episode 2, 30, and 100
- run artifact ledger shape
- product tie-in claim checks
- dialogue/audio timing and missing voice ID checks
- subtitle safe-area metadata checks
- Storyboard Review handoff mapping
- duplicate handoff prevention
- media asset tenant/project ownership checks

Integration:

- create series -> plan episode 1 dry-run -> create Storyboard Review handoff preview
- complete episode 1 -> memory update -> plan episode 2 uses prior memory
- character reference update marks storyboard/start-frame/prompt stages stale
- product tie-in rejection removes tie-in from downstream prompts
- native audio unsupported -> fallback requires visible approval
- duplicate handoff key opens existing Storyboard Review project
- final assembly manifest imports generated clips and creates pending memory update

Browser/E2E:

- Dashboard menu visible only when flag is on
- create series wizard
- episode builder approval checkpoints
- Storyboard Review opens from episode handoff
- mobile/tablet/desktop responsive checks for the workspace

Security/data:

- tenant isolation for series, assets, and Storyboard Review drafts
- no signed URLs or provider credentials in skill prompts
- no cross-tenant asset IDs in references
- audit log for paid generation, approvals, and repair actions
- provider result URLs are re-hosted/staged before becoming durable assets
- deletion/archival hides series assets without orphaning Storyboard Review history

---

## 21. Resolved MVP Decisions And Deferred Choices

MVP decisions:

1. Episode duration is fixed at 60 seconds for MVP. Additional 30/90 second profiles are deferred until the 60-second path has production evidence and tests.
2. The first/last-frame bridge production allowlist is `VeoCompatibleVideoProvider` only, backed by tenant/provider config that proves 9:16, duration, first/last-frame input, and audio policy support. `MockVideoProvider` is allowed for dry-run/tests. `ExternalImageToVideoProvider` requires explicit tenant/provider configuration. `OpenAIVideoProvider` is prompt-only or capability-gated fallback for MVP, not the human-face bridge default.
3. Product tie-in approval is mandatory for MVP and beta, including all regulated categories. Post-beta tenant configurability may be added only after audit logs, disclosure storage, and claim review metrics are stable.
4. Long-series memory uses append-only events plus compact summaries for MVP. Search/vector memory is deferred until 30+ episode pilots show that summary retrieval is insufficient.
5. Final MP4 assembly should use the existing SmartSpecPro/Storyboard Review render-export path when available. If unavailable, the run enters `assembly_ready` with `final_episode_assembly_manifest`, concat/subtitle/audio/export metadata, and no automatic memory mutation.

Deferred choices must not block implementation. They become follow-up specs only after MVP acceptance passes.

---

## 22. MVP Acceptance Summary

MVP is acceptable when:

- Dashboard has a feature-flagged Vertical Drama Series workspace.
- A user can create a series with title, bible, characters, target episode count, and optional product tie-in.
- Required vertical drama skills exist under `apps/web/skills` and validate with schemas, fixtures, and `scripts/verify.sh`.
- Episode 1 can run in dry-run mode through script, dialogue/audio plan, character bible, 9-shot shotgrid, start-frame plan, and motion prompt pack.
- User can approve or repair each major stage.
- The approved episode creates a Storyboard Review project with ordered video tasks, valid `referenceFrameRoles`, audio/subtitle metadata, and durable extra params.
- Generated/imported clips create a final assembly manifest and export-ready artifact metadata.
- Episode summary updates series memory.
- Episode 2 planning uses prior memory and character state.
- Provider capability gates prevent unsupported human-face/start-frame/native-audio behavior.
- Product tie-in metadata is natural, auditable, removable, and disclosure-aware.
- Tests prove skill loading, imported GitHub contract parity, schema validation, duration, routing, provider job lifecycle, run artifact ledger, final assembly, memory continuity, asset ownership, audio/subtitle handling, and Storyboard Review handoff.
