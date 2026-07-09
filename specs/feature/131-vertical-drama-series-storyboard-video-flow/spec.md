# Feature 131: Vertical Drama Series Storyboard Video Flow

Version: 0.5
Date: 2026-07-09
Status: Proposed (§8.1-§8.4, §8.7 updated 2026-07-04 to match the shipped UI redesign — see section-10-ui-redesign-genre-presets-story-generation.md. 2026-07-07 production-grade upgrade: §7.7 story density/speech budget, §8.8 guided production wizard, §13.1 tie-in naturalness QC, §14.1 dialogue coverage, §16.1 quality-review auto-improve loop, §23 traceability — see section-13/section-14 and reviews/production-grade-upgrade-audit-2026-07-07.md. 2026-07-08 to 2026-07-09 sync-to-shipped pass (this version): async story jobs + deep story drafts §8.2.3, season dramaturgy critic §6.8.2/§16.2, length-aware format profiles §7.8, tie-in aware deep drafts §13.2, ad banner overlay §13.3, beyond-plan sanity §11.8, final render suite §12.4, character reference v2 §9.3, voice casting §14.2, read-only share links §24 (proposed, not yet built) — see §0 Changelog, §23.1, and reviews/spec-sync-audit-2026-07-09.md)
Owner: Dashboard / Storyboard Review / Media Studio / Skill Runtime / Video Generation / Audio / Data
Depends-on: 112-storyboard-studio-skill-based-prompt-generation-qa-loop, 117-production-director-agents-sdk-auto-storyboard-video, 122-video-segment-planner-multi-shot-storyboard-review, 127-article-to-storyboard-video-project, 130-hybrid-flow-openai-agents-sdk-runtime
External guide: https://github.com/naibarn/vertical-drama-video-flow at commit `e2dbef07d07447489d041112d862d994adeac5d4`

---

## 0. Changelog

### [0.5] - 2026-07-09

Sync-to-shipped pass. Between v0.4 (2026-07-07) and this version, roughly ten
production waves shipped and deployed against this feature (see
`planning/vertical-drama-production-grade-upgrade/plan.md` progress log,
`planning/vertical-drama-ad-banner-overlay/plan.md`,
`planning/vertical-drama-tie-in-replan/plan.md`). This version brings the
spec back in sync with what is actually on disk and deployed. §7.7.2 tieIn
type, §7.7.3 deliberate-replan paragraph, §13.1 defer path, section-08, and
section-13 were already updated in-flight by task #31's implementation pass
(2026-07-09) and are carried forward unchanged here.

#### Added
- feat(§8.2.3): async story-job flow for `generateStoryBibleDeep`,
  `extendStoryDraftHorizon`, `critiqueSeasonDrafts`, `applySeasonCritique`
  (submit → enqueue on BullMQ queue `vertical_drama_story_jobs` → `{jobId}` →
  poll `getStoryJobStatus`/`getActiveStoryJob` → resume-on-mount), replacing
  the earlier synchronous framing (task #28, #29, #24).
- feat(§6.8.2, §16.2): `vertical-drama-season-dramaturgy-critic` skill and
  the season-level critique/apply workflow — 10 finding kinds (7
  deterministic incl. `tie_in_distribution`, 2 LLM-only, 1 fallback) (task
  #29, #22).
- feat(§7.8): length-aware format profiles (`ultra_short` ≤5 episodes /
  `short` 6-12 / `standard` ≥13) tuning deep-draft density prompts, cold-open
  hook timing, dramaturgy critic thresholds, premium judge hook floor, and
  prorated tie-in budget; flag F131X (task #23).
- feat(§13.2): tie-in aware deep story drafts — season-level tie-in
  placement bootstrap, per-chunk PRODUCT TIE-IN prompt sections, per-shot
  `tie_in` marking, reconciliation warnings, `tie_in_naturalness` premium
  judge dimension, Overview badges (task #22).
- feat(§13.3): ad banner overlay — series-level banner design studio (10
  style presets, 3 placements), per-episode banner plan, composited by the
  Node ffmpeg render engine; explicitly separate from in-story product
  tie-in and exempt from its brand-neutrality guards; flag F131W (task #30).
- feat(§11.8): beyond-plan sanity — fail-fast `VD_EPISODE_BEYOND_PLAN` when
  an episode number exceeds the planned season length, with a grandfather
  path for legacy series without a breakdown (task #26).
- feat(§12.4): final render suite — Node ffmpeg dialogue-audio mixdown, ASS
  subtitle burn-in (10 presets incl. "none"), banner overlay compositing,
  per-episode render options, batch season render; explicitly no
  upload/publish/scheduling (task #21).
- feat(§9.3): character reference resolution v2 — a second identity-lock
  reference image (best character sheet) per character alongside the
  primary portrait, zero additional provider cost; flag F131Z (task #27-A).
- feat(§14.2): voice casting and whole-episode dialogue audio generation
  (voice chain); flag F131U (task #15/W12).
- feat(§24, proposed): read-only series share links (Collab-lite L1) —
  design complete, **not yet implemented** on disk; flag F131AA reserved
  (task #32).
- feat(§17): register flags F131T-F131AA (10 flags) that shipped after v0.4
  and were missing from the flag table.

#### Changed
- refactor(§8.2.1): corrected — `generateStoryBible` is no longer "the one
  paid exception in this flow"; superseded in practice by the deep-draft
  actions in §8.2.3. Framing updated, not removed (both remain valid entry
  points).
- refactor(§16.1): quality-review scorecard is invoked synchronously (not
  jobified); async jobification (task #28) applies only to the
  season/deep-draft story actions in §8.2.3, not the per-episode quality
  loop — clarified to avoid confusion between the two.

#### Fixed
- fix(§23.1): added post-2026-07-07 traceability rows for tasks #21-#32.
- Self-audit: corrected stale claims in the spec that no longer match
  shipped behavior — "single reference image" per character (§9.3 now
  documents the v2 resolver), "concat-only" final assembly (§12.4), "the one
  paid exception"/"the one action... genuinely paid" framing in §8.2.1/§8.7,
  and the pre-task-#23 skill-folder count in §10.1/§15/section-01. Also
  noted (§23.1 footer): `videoPrompts.stale` was never a spec-documented
  concept at all (it was an internal wizard-resolver simplification noted
  only in code comments/plan.md) and is now a real signal — recorded here so
  this gap in what the spec used to cover doesn't recur.

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

Inputs (added 2026-07-07, §7.7): the episode speech budget (target speech
seconds + per-shot band) and the active breakdown item's `contentBudget`.

Outputs:

- episode title
- hook
- 3-act or beat-level structure with per-beat `power_shift`, `is_reversal`,
  `intensity` (1-10), and `character_emotional_arcs[]` (Phase 3B narrative
  grammar; >= 2 reversals per episode)
- **dialogue-complete beats** (§7.7.2): per-beat `dialogue_lines[]` with
  `speaker`, `line`, `delivery`, `subtext`, and computed
  `estimated_speech_seconds` — dialogue is authored here, sized by the
  canonical estimator, not reconstructed downstream
- scene/dialogue summary
- cliffhanger/payoff
- character state deltas
- product tie-in usage plan
- continuity notes
- warnings and repair queue (an episode below `MIN_EPISODE_COVERAGE_RATIO`
  ends `needs_repair`, §7.7.2)

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
- arc drift signals (added 2026-07-07, §7.7.3): beats consumed early, hooks
  resolved off-plan, content-budget overruns — inputs to the deterministic
  drift check that may raise an `arc_replan_proposal`

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

- cast-aware dialogue lines by shot/clip — sourced from the
  dialogue-complete script (§7.7.2): this skill distributes and enriches
  script lines (timing, voice continuity, per-line `delivery`/`subtext`,
  spoken-register Thai); it must not invent a parallel script
- speaker-to-character mapping
- stable voice continuity map
- missing voice ID warnings
- subtitle cue plan with 9:16 safe-area hints
- audio timing estimate (via the canonical estimator, §7.7.1)
- native audio prompt snippets only when allowed
- separate-TTS render plan
- repair queue for overlong speech, underfilled coverage, unsupported native
  audio, unsafe claims, or missing voice/provider access

### 6.8.1 `vertical-drama-episode-quality-review` (shipped 2026-07-05; formalized 2026-07-07)

SmartSpecPro-only skill, already implemented (see §16.1). LLM-only, cheap,
runs BEFORE any paid image/video credit spend.

Purpose: score a finished script + storyboard (+ optional dialogue plan) as a
short scorecard, list concrete flat spots, and feed the auto-improve loop.

Outputs (contract v1 shipped / v2 target, §16.1):

- scorecard: `reversal_count`, `reversal_sharpness` (1-5), `emotion_variety`
  (1-5), `dialogue_naturalness` (1-5 | null), `pacing` (1-5), `overall` (1-5);
  v2 adds `hook_strength`, `cliffhanger_strength`, `continuity_consistency`,
  `tie_in_naturalness` (1-5 | null) and echoes deterministic density metrics
- summary (short Thai-first readable verdict)
- `issues[]`: `{ location, problem, suggested_fix }` — locations parseable to
  a pipeline stage (`beat N` → script, `shot N` → storyboard)
- warnings and repair queue

### 6.8.2 `vertical-drama-season-dramaturgy-critic` (shipped 2026-07-09, task #29)

SmartSpecPro-only skill. A SEPARATE, on-demand, SEASON-level pass — distinct
from the per-episode §6.8.1 quality review and never runs inside the §11
premium multi-round draft pipeline (§8.2.3) or changes its behavior. Invoked
by the async story-job mutations `critiqueSeasonDrafts` / `applySeasonCritique`
(§8.2.3).

Purpose: judge whether an entire drafted season holds together dramaturgically
— stakes, world-rule consistency, character introduction pacing, character
agency, antagonist variety, finale cost, dialogue subtext, and pacing — and
propose targeted revisions without corrupting the story spine.

Findings are produced across exactly 10 stable kinds
(`VdSeasonCritiqueFindingKind`, `shared` via
`server/services/verticalDramaStoryBible.ts`):

| # | Kind | Source |
| --- | --- | --- |
| 1 | `protagonist_no_stake` | LLM-only |
| 2 | `world_rules_undefined` | deterministic |
| 3 | `key_character_late_intro` | deterministic |
| 4 | `character_agency_zero_decisions` | deterministic |
| 5 | `antagonist_tactic_repetition` | deterministic |
| 6 | `finale_no_price_paid` | deterministic |
| 7 | `on_the_nose_dialogue` | deterministic (abstract-word-density proxy) |
| 8 | `info_heavy_low_action` | LLM-only |
| 9 | `tie_in_distribution` | deterministic (task #22 — bunched or unmarked planned placements, §13.2) |
| 10 | `other` | fallback |

The 6 pure deterministic checks (kinds 2-7) run via `analyzeSeasonDramaturgy`
BEFORE the LLM critic call and are injected into its prompt as established
facts (so the LLM never re-derives what code can already prove), and AGAIN
after `applySeasonCritique` applies a fix as a regression guard: a revision
that introduces a NEW deterministic finding touching an already-passing
episode is rejected. Kinds 1 and 8 need semantic judgment no code signal can
approximate and are produced ONLY by the LLM critic. Thresholds for kinds 3
("late intro"), 5 ("tactic repetition"), and 4's minimum-decisions bar are
tunable per length tier — see §7.8 Format Profiles.

Model resolution is capability-based, never hard-coded:
`selectBestLlmModel({ supportsThinking: true, supportsStructuredOutputs: true,
contextLength >= VD_SEASON_CRITIQUE_MIN_CONTEXT_LENGTH (100k) })`, falling
back to `resolveStoryBibleModel()` when no model clears that bar. Applies to
both the critique call and the apply/revise call.

Outputs:

- `findings[]`: `{ kind, evidenceEpisodes[], detail }` for both deterministic
  and LLM-judged findings, merged into one report;
- a revise-mode contract for `applySeasonCritique` producing a corrected
  breakdown/draft consistent with the story-lock rule (§16.3): execution-only
  rewrites, never a new story spine.

### 6.8.3 `vertical-drama-ad-banner-prompt` (shipped 2026-07-09, task #30)

SmartSpecPro-only skill supporting the ad banner overlay subsystem (§13.3).
Purpose: turn a product's name/category/copy plus product reference images
into an on-brand banner image prompt for one of the 10 style presets (§13.3).
Model resolution: `selectBestLlmModel({ supportsVision: true,
supportsStructuredOutputs: true })` when a product image is available,
falling back to `resolveStoryBibleModel()`. Full input/output contract and
UI flow are documented in §13.3 to keep the banner-overlay narrative in one
place; this entry exists so §6's skill inventory stays complete.

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
  | "retcon_proposal"
  | "arc_replan_proposal"   // added 2026-07-07 (§7.7): proposed forward re-plan of the episode breakdown
  | "arc_replan_applied";   // added 2026-07-07 (§7.7): approved re-plan outcome (new breakdown version activated)
```

Retcons are explicit proposals requiring user approval. Approved retcons create new memory events; they do not mutate older events in place.

Arc re-plans follow the same append-only discipline as retcons but face FORWARD:
a retcon corrects the recorded past, an `arc_replan_proposal` proposes changing
the planned future (`episodeBreakdown` entries of episodes that have not been
produced yet). See §7.7 for triggers, approval semantics, and versioning.

### 7.7 Story Density And Speech Budget (added 2026-07-07)

> Requirement source: production feedback 2026-07-07 — episodes feel hollow
> because each 8-second shot carries only 1-2 seconds of speech. Repairing a
> single shot cannot fix this: with 9 fixed shots and 60 fixed seconds, more
> speech per shot means more STORY per episode, and more story per episode
> shifts the season arc. Density must therefore be planned top-down (bible →
> script → shots → dialogue → QC), not patched bottom-up.

#### 7.7.1 Canonical Speech Estimator And Budget Constants

`apps/web/shared/verticalDramaSeries/dialogueQuality.ts` is the ONE canonical
speech-budget module. It already ships and is provider-free/deterministic; all
layers (LLM prompt construction, post-generation gates, UI meters, TTS timing)
MUST use it — no second estimator may be introduced. Its pinned constants are
spec-level contract values:

```ts
// speech-rate model (deterministic)
THAI_CHARS_PER_SECOND = 8.5          // th locale: characters per spoken second
NON_THAI_WORDS_PER_SECOND = 2.7      // non-Thai locales: words per spoken second
MIN_DIALOGUE_SECONDS_PER_LINE = 0.75 // floor per delivered line

// coverage targets (ratio of clip/episode duration that is spoken)
TARGET_CLIP_COVERAGE_RATIO = 0.68    // per-clip target
MIN_CLIP_COVERAGE_RATIO = 0.45      // per-clip warning floor
ERROR_CLIP_COVERAGE_RATIO = 0.25    // per-clip error floor
MIN_EPISODE_COVERAGE_RATIO = 0.58   // whole-episode warning floor (~35s of 60s)
ERROR_EPISODE_COVERAGE_RATIO = 0.33 // whole-episode error floor (~20s of 60s)

// per-clip speech target for duration d (seconds)
targetVerticalDramaSpeechSeconds(d) = clamp(d * 0.68, 2.5, d - 0.75)
```

Exported functions treated as contract: `estimateVerticalDramaSpeechSeconds`,
`targetVerticalDramaSpeechSeconds`, `analyzeVerticalDramaClipDialogueQuality`,
`analyzeVerticalDramaEpisodeDialogueQuality`, and the stable issue codes
`VD_DIALOGUE_EMPTY | VD_DIALOGUE_STAGE_DIRECTION | VD_DIALOGUE_SCRIPT_FALLBACK |
VD_DIALOGUE_UNDERFILLED | VD_DIALOGUE_EPISODE_UNDERFILLED | VD_DIALOGUE_DUPLICATE`.

For a 60-second episode this yields the operating band the wizard's dialogue
QC gate (§8.8, section-12) enforces: roughly **35-50 seconds of spoken
content**, with an 8-second dialogue clip targeting ~5.4s (2-3 lines) and the
trailing 4-second clip ~2.7s, unless a shot is explicitly visual-only.

#### 7.7.2 Density-First Planning Ladder (the reform)

The speech budget stops being a post-hoc analyzer and becomes a MANDATORY
INPUT at every planning layer. Status today: the budget is only consulted
after generation (gate + repair); first-pass script and video prompts are not
duration-sized. That is the root cause being fixed.

Layer 1 — Series bible (`generateStoryBible`, and future re-plans):

Every `episodeBreakdown[]` item gains a content budget so an episode is
CONCEIVED with enough narrative material, not padded later:

```ts
type VerticalDramaEpisodeContentBudget = {
  beatCount: number;                 // default 5-7 per 60s episode
  estimatedSpeechSeconds: number;    // must satisfy MIN_EPISODE_COVERAGE_RATIO
  conflictLevel: 1 | 2 | 3 | 4 | 5;  // escalation curve across the season
  reversalTarget: number;            // default >= 2 (Phase 3B reversal grammar)
  arcThreads: string[];              // season threads this episode advances
};

type VerticalDramaEpisodeBreakdownItem = {
  episodeNumber: number;
  workingTitle: string;
  logline: string;
  keyBeats: string[];
  contentBudget: VerticalDramaEpisodeContentBudget; // NEW — required for new series
  tieIn?: VerticalDramaEpisodeTieInPlacement; // NEW (task #31, added 2026-07-09) — see §7.7.3
};

// Task #31 (added 2026-07-09) — season-level per-episode tie-in placement
// decision, elevating "does this episode carry a product" from a reactive
// script-time signal to a first-class planned field (§7.7.3).
type VerticalDramaEpisodeTieInPlacement = {
  planned: boolean;
  intensity?: "light" | "featured";
  benefitFocus?: string;
  source: "planned" | "deferred" | "manual";
  movedFromEpisodeNumber?: number; // present iff source === "deferred"
};
```

The story-bible generation prompt must state the per-episode speech budget in
seconds and require enough plot per episode to fill it. Legacy series without
`contentBudget` remain readable; planning derives defaults. A legacy series
can ADOPT Layer-1 density planning by re-running "Generate story" /
"Regenerate" (§8.3): the regenerated breakdown carries `contentBudget` and is
appended as a NEW breakdown version (approval-gated like an arc re-plan,
§7.7.3) — produced episodes stay untouched, so re-conception is available
without a migration.

Layer 2 — Episode script (`plan_episode_script` /
`verticalDramaScriptGeneration.ts` + `vertical-drama-script-builder` skill):

The script becomes **dialogue-complete**: dialogue is authored AT SCRIPT
STAGE, sized by the estimator, instead of being reconstructed later from
scene summaries.

- every beat carries `dialogue_lines[]` (`speaker`, `line`, plus Phase 3B
  `delivery`/`subtext`) and a computed `estimated_speech_seconds`;
- the script prompt receives the episode speech budget (target seconds and
  the per-shot band) and the `contentBudget` from the active breakdown item;
- script output validation computes `estimatedSpeechSeconds` for the whole
  episode with the canonical estimator; a result below
  `MIN_EPISODE_COVERAGE_RATIO` is `VD_DIALOGUE_EPISODE_UNDERFILLED` and the
  script stage ends `needs_repair` — the storyboard stage is NOT reachable
  from an underfilled script in guided mode;
- the existing Phase 3B narrative grammar (per-beat `power_shift`,
  `is_reversal`, `intensity` 1-10, `character_emotional_arcs[]`) is a spec
  requirement, not an implementation detail: >= 2 reversals per episode, no
  flat escalation curve.

Layer 3 — Storyboard allocation (`storyboard_shotgrid`):

- each of the 9 shots receives an explicit per-shot speech budget derived
  from its clip duration via `targetVerticalDramaSpeechSeconds`;
- the shot-to-scene/beat mapping is PERSISTED (`sourceBeatIndexes[]` per
  shot) — replacing today's positional/proportional guess — so dialogue,
  repair, and QC can attribute lines to shots deterministically;
- a shot may be declared visual-only with an explicit
  `silenceIntent: "dramatic_pause" | "action_visual" | "montage" | "establishing"`;
  at most 2 of 9 shots may be visual-only unless the episode is explicitly
  marked visual-first; visual-only shots are excluded from per-clip coverage
  gates but still count toward the episode floor.

```ts
type VerticalDramaPerShotSpeechBudget = {
  shotNumber: number;
  clipDurationSeconds: number;
  targetSpeechSeconds: number;   // targetVerticalDramaSpeechSeconds(duration)
  minSpeechSeconds: number;      // MIN_CLIP_COVERAGE_RATIO * duration
  sourceBeatIndexes: number[];   // persisted beat attribution
  silenceIntent?: "dramatic_pause" | "action_visual" | "montage" | "establishing";
};
```

Layer 4 — Dialogue plan and video prompts:

- `dialogue_audio_plan` and `resolveShotDialogueLines` treat the
  dialogue-complete script as the SOURCE OF TRUTH: the plan distributes and
  enriches script lines (timing, voice, delivery) and may not invent a
  parallel script; `script_fallback` parsing of freeform scene summaries
  becomes a legacy path that always carries a warning;
- `buildShotVideoPromptUserPrompt` (first-pass video prompt builder) MUST
  receive `shotDurationSeconds` and the shot's `targetSpeechSeconds` — today
  only the repair/regeneration path is duration-aware, which is the reform's
  most direct fix;
- silent-gap rule: within a speaking clip, estimated continuous silence may
  not exceed 2.5 seconds; violations surface as `VD_DIALOGUE_UNDERFILLED`
  with the gap location.

#### 7.7.3 Cross-Episode Propagation: Arc Drift And Re-Plan

Raising density per episode consumes season material faster. The system must
detect and manage this instead of letting episode N+1 silently contradict the
plan.

Drift detection (deterministic; runs after script approval, after
`summarize_episode_to_series_memory`, and again whenever an
already-approved episode script is later repaired/regenerated — evaluated on
its re-approval, so late edits to a produced episode cannot bypass the
check):

- beats consumed that the active breakdown assigned to LATER episodes;
- hooks resolved earlier than planned / new hooks not in the plan;
- episode `estimatedSpeechSeconds` or beat count materially exceeding the
  breakdown `contentBudget` (default threshold: > 25% over);
- conflictLevel realized out of order (escalation curve broken).

On material drift the pipeline appends an `arc_replan_proposal` memory event
and creates a repair checkpoint:

```ts
type VerticalDramaArcReplanProposal = {
  proposalId: string;
  seriesId: string;
  triggeredByEpisodeNumber: number;
  driftReasons: string[];                 // stable codes, e.g. VD_ARC_BEATS_CONSUMED_EARLY
  affectedEpisodeNumbers: number[];       // FUTURE, non-produced episodes only
  proposedBreakdown: VerticalDramaEpisodeBreakdownItem[]; // replacement entries
  rationale: string;
  status: "proposed" | "approved" | "rejected";
};
```

Approval semantics (mirrors retcon review, §7.6 / section-04):

- the series bible keeps append-only breakdown versions:
  `bible.breakdownVersions[]` plus an `activeBreakdownVersionId` pointer;
  approving a proposal appends a NEW version, appends an
  `arc_replan_applied` memory event, and moves the pointer — nothing is
  mutated in place;
- episodes already produced (any run past `plan_episode_script` approval)
  are NEVER rewritten by a re-plan; only future episode entries change;
- rejecting keeps the old plan and leaves a standing continuity warning on
  affected future episodes;
- `plan_episode_script` for episode N always consumes the ACTIVE breakdown
  version plus drift warnings, so continuity into the next episode is
  explicit instead of accidental.

**Deliberate re-plan: tie-in defer (task #31, added 2026-07-09).** A 6th
`driftReasons` code, `VD_ARC_TIE_IN_DEFERRED`, is DELIBERATE rather than
detected: it marks a proposal the user triggered directly via
`deferEpisodeTieIn` (§13.1) instead of one `detectArcDrift` found in an
approved script. Behind flag `verticalDramaSeriesTieInReplan`, deferring
episode E's product placement builds a real `arc_replan_proposal` that
moves `tieIn.planned` from episode E to the nearest eligible future episode
E' (not yet produced, not already planned, within the
`maxEpisodesWithTieInPerTenEpisodes` fatigue window) and persists it
through the identical channel a detected-drift proposal uses, so it appears
on the SAME review card. Because every OTHER field on this proposal type
must stay byte-identical to the active version (approval-time guard —
`applyApprovedArcReplan` rejects a `VD_ARC_TIE_IN_DEFERRED` proposal that
changes anything besides `tieIn`), the review UI shows a compact
"placement moved E → E'" diff instead of the full breakdown diff. When no
eligible future episode exists (or the fatigue cap is already exhausted
everywhere), no proposal is built and the mutation falls back to the
pre-#31 `scheduleAtRisk` signal instead. A legacy series whose breakdown
has never adopted `tieIn` planning is bootstrapped in-memory (an even,
budget-respecting initial spread, `planSeasonTieInPlacements`) the first
time it defers — the bootstrap is only durably adopted if that first
proposal is approved.

`plan_episode_script` also reads `tieIn` for the episode it is about to
generate: `planned: true` REQUIRES the placement in that episode's prompt
(no "skip if unnatural" escape hatch), `planned: false` EXCLUDES it even
though the series-level tie-in policy is enabled, and an absent `tieIn`
field preserves the pre-#31 fully-reactive behavior (the model decides
per episode, scored after the fact by the §13.1 naturalness report).

#### 7.7.4 Acceptance (density reform)

- new-series story bibles carry `contentBudget` per episode and state the
  speech budget in the generation prompt;
- an approved episode script is dialogue-complete and never below
  `MIN_EPISODE_COVERAGE_RATIO` without an explicit visual-first override;
- storyboard shots persist `sourceBeatIndexes` and per-shot speech budgets;
- first-pass video prompt generation is duration- and budget-aware (not only
  the repair path);
- a drift-triggering episode yields an `arc_replan_proposal` that the user
  can review/approve/reject from the Memory surface, with produced episodes
  untouched and future planning following the approved version;
- every layer uses `dialogueQuality.ts` — no duplicate estimator exists.

### 7.8 Length-Aware Format Profiles (added 2026-07-08, task #23)

> Requirement source: owner feedback 2026-07-08 — "ซีรีส์สั้นมาก 3 ตอน
> คิดได้ดีเทียบกันไหม" (can a 3-episode series plan as well as a 20-episode
> one?). Before this module, deep-draft prompts, the premium judge's floors,
> and the §6.8.2 dramaturgy critic's thresholds all silently assumed
> long-season pacing (e.g. "a key character can wait until roughly a third of
> the way in" is fine for 20 episodes and actively wrong for 3).

`shared/verticalDramaSeries/formatProfiles.ts` is the single source of truth
for how generation/critique/judge/tie-in behavior differs by season length.
Pure, side-effect-free, isomorphic (safe for both server and client).

Three tiers, resolved from `plannedEpisodeCount` and never throwing (garbage
input clamps to `standard`):

```ts
type VerticalDramaFormatProfileTier = "ultra_short" | "short" | "standard";
// plannedEpisodeCount <= 5  -> "ultra_short"
// plannedEpisodeCount 6-12  -> "short"
// plannedEpisodeCount >= 13 -> "standard" (also the fallback for unusable input)
```

Each resolved profile (`resolveVerticalDramaFormatProfile(plannedEpisodeCount)`)
carries:

- `beatDensityGuidanceTh`/`beatDensityGuidanceEn` — injected into the deep-draft
  generation prompt (§8.2.3) as a "FORMAT PROFILE" block for non-`standard`
  tiers only; `ultra_short` requires every episode to carry 2-3 standard
  episodes' worth of plot with no filler/pure-setup episodes and an in-medias-res
  open from shot 1; `short` requires every episode to visibly move plot or
  relationship by at least one concrete beat;
- `perEpisodeHookRule: { requireColdOpenHook, hookWithinSeconds }` — a hard
  cold-open requirement for `ultra_short` (hook within **3s**) and `short`
  (hook within **5s**); `standard` keeps the original, softer expectation
  (`requireColdOpenHook: false`, indicative `8s`);
- `dramaturgy` — tier-fixed (not formula-scaled) overrides for the §6.8.2
  critic's `keyCharacterLateIntroMaxEpisode`, `antagonistTacticRepetitionWindow`,
  and `agencyMinDecisionsBeforeFinale`; a fixed bar reads correctly across a
  tier's whole episode-count band where a `total/N` formula would drift.
  `analyzeSeasonDramaturgy` only reads these fields for a non-`standard`
  profile — an absent profile or the `standard` tier always falls back to
  its original formulas/constants, which is what keeps flag-off and
  long-season behavior byte-identical;
- `judge.hookStrengthFloorDelta` — added to the premium judge's per-dimension
  floor (§8.2.3) for the `hook_strength` dimension only; `+1` for
  `ultra_short` (the cold open is the single highest-leverage craft element
  in a 3-5 episode season), `0` for `short`/`standard`;
- `tieIn.maxEpisodesWithTieIn(plannedCount, perTenCap)` — same formula for
  every tier (proration is a function of season length, not tier label):
  `resolveTieInEpisodeBudget` prorates the admin-configured
  `maxEpisodesWithTieInPerTenEpisodes` (§13) down to
  `ceil(perTenCap * plannedCount / 10)`, floored at **1** whenever
  `plannedCount >= 3` so a short season is never accidentally rounded to zero
  tie-in episodes. Consumed by §13.2's `planSeasonTieInPlacements`.

Feature flag: `verticalDramaSeriesFormatProfiles` (F131X, §17; default off).
Real callers thread a `formatProfilesEnabled` boolean resolved from this flag
rather than importing the flag check directly (keeps the module
server/client-import-free). **Side effect of wiring this flag on:** the
conductor swap of the format-profiles gate at the series-router executor
sites also passes `totalEpisodeCount` for the first time, which wakes up the
previously-dormant `finale_no_price_paid` dramaturgy-critic rule (kind 6,
§6.8.2) — that rule existed in code since task #29 but was inert until this
wiring supplied the total-episode-count input it needs.

---

## 8. User Experience

> **2026-07-04 addendum:** §8.1-§8.4 and §8.7 below reflect the shipped
> "Presentation-Builder-style" redesign (route moved off `/dashboard`, a
> persistent left project sidebar, genre presets, always-navigable tabs, and a
> real LLM-backed "Generate story" action). See
> `section-10-ui-redesign-genre-presets-story-generation.md` for the full
> implementation record; `section-03` has been updated to match.

### 8.1 Series List

The entry point is `/drama-series` (moved off the `/dashboard` prefix; the
legacy `/dashboard/vertical-drama*` paths redirect client-side so old links
keep working). A shared `VerticalDramaShell` wraps all three routes
(series list, series detail, episode workspace) with:

- a persistent, collapsible left sidebar listing every series ("project") the
  user owns, with a search box, a "New" trigger, and the current series
  highlighted — desktop/tablet-landscape show it as a real 18rem/20rem column
  (collapsible to a 3.25rem icon rail); below that breakpoint it reflows to a
  slim top strip the user can expand
- the series list page itself keeps its own richer view inside that shell:
  project search/filter, status chips, next episode number, last edited time,
  missing approval badges, product tie-in enabled marker, button:
  `สร้างซีรีย์แนวตั้ง`

### 8.2 Create Series Wizard

The wizard's 6 steps are rendered as a **tab bar where every step is always
clickable** (not gated behind a linear `Next`/`Back` flow) — each tab shows a
small completion dot (green = required content present, amber = still needs
attention) so the user can jump around and see at a glance what's filled in:

1. Basic setup: title, genre, logline, target episode count, language, target
   duration. This step also surfaces a **genre preset picker** (search + card
   grid) — selecting a preset prefills genre/logline/main plot/season
   arc/tone/cliffhanger style/characters/visual bible from a curated library
   (title stays user-entered); the user can still edit every field afterward.
2. Story setup: main plot, season arc, tone, cliffhanger style.
3. Characters: add/import characters, roles, relationships, initial state.
4. Visual bible: generate or upload character references.
5. Product tie-in: optional product, references, placement policy, forbidden
   claims.
6. Review: confirm memory seed, skill chain, provider mode, credit estimate;
   the `Create` action is only gated on title + a valid episode count (not on
   which tab is active).

On `Create`, the wizard creates the series shell (dry-run, as before) and then
**automatically calls the new `generateStoryBible` action** (see §8.2.1) to
expand the gathered bible into a full episode-by-episode story before routing
to the new series. A failure here is non-fatal — the series shell still
exists and "Generate story" is retryable from the Series Workspace Overview
tab (§8.3).

#### 8.2.1 Generate Story (real LLM call)

> **2026-07-08 correction:** this was originally "the one paid exception in
> this flow." It no longer is — §8.2.3 (Deep Story Drafts) added several more
> genuinely paid, credit-consuming actions on the same series. This
> subsection now documents the ORIGINAL bible-expansion action; §8.2.3
> documents the deeper per-episode draft actions that a series typically
> runs next.

Every other action in this feature (series create, series update, episode
stage runs in `dry_run`/`plan_only` mode) is metadata-only or provider-mocked.
`generateStoryBible` is a genuinely paid, credit-consuming LLM call in the
vertical-drama surface: given the series' bible fields, it produces an
expanded season arc, refined character profiles, and a per-episode breakdown
(`episodeNumber`, `workingTitle`, `logline`, `keyBeats[]`), written back into
the series' existing `bible` jsonb column (no schema change). It follows the
same credit-check → call → deduct convention as `skills.ts`'s `enhancePrompt`,
and is conceptually the series-level counterpart to the `plan_only` run mode
already described in §11.4 (real LLM planning allowed, no image/video/TTS
calls) — it does not violate Non-Goal §3.4, which is scoped to image/video/TTS
providers.

#### 8.2.2 Genre Preset Visual Identity And Real Mix (added 2026-07-07)

> Requirement source: production feedback 2026-07-07 (with 5 reference
> images — neon bio-jungle techwear, girl-and-giant-mecha bond, cyborg-arm
> battlefield, desert spider-mech: high-tech sci-fi aesthetics with a human
> lead and a machine/creature companion). Two asks: (a) presets must be able
> to REPRODUCE a look like this end-to-end — not just seed a logline — and
> (b) preset mixing must genuinely blend every selected preset, verifiably.

**A. Structured visual identity on presets.** Today
`vertical_drama_genre_presets.visualBible` is one text blob, so a preset's
look degrades into prose that later prompts paraphrase. Add a nullable
additive `visualIdentityJson` column:

```ts
type VerticalDramaPresetVisualIdentity = {
  styleName: string;                 // e.g. "Neon Bio-Jungle Tech", "Battered Mecha Hangar"
  palette: string[];                 // 3-6 dominant colors (names or hex)
  lighting: string;                  // e.g. bioluminescent rim light, overcast hangar glow
  environmentMotifs: string[];       // neon orchids, jungle waterfall, desert dunes, mech bay
  wardrobeGrammar: string[];         // tactical straps, techwear knit, plated armor accents
  signaturePropsAndCompanions: string[]; // giant robot companion, cyber cat, spider-mech mount
  cameraGrammar: string;             // low-angle hero portrait, shallow DOF, centered 9:16
  characterArchetypes: Array<{ role: string; look: string }>;
  imagePromptFragments: {
    positive: string[];              // reusable tokens appended to image prompts
    negative: string[];              // style-breaking tokens to suppress
  };
  referenceAssetIds?: string[];      // optional curated reference images (tenant-owned)
};
```

**Flow-through rule (what makes the look real):** when a series is created
from (or applies) a preset carrying `visualIdentityJson`, the identity must
flow into every visual layer, not just the bible text: series
`bible.visualStyle`/`cameraGrammar` fields; character visual bible and
character reference generation prompts (archetype `look` + wardrobe +
palette); start-frame / contact-sheet per-cell prompts (append
`imagePromptFragments.positive`, merge `negative`); and motion prompts
(style/lighting tokens). Start-frame QC gains a "visual identity adherence"
checklist line for preset-driven series. Without this rule a mecha preset
produces mecha loglines and generic frames — the exact failure being fixed.

**B. Seeded preset family for this aesthetic.** Seed (via
`apps/web/scripts/seed-vertical-drama-genre-presets.ts`, th + en locales) a
`sci_fi_mecha` category with at least 4 presets, each with full
`visualIdentityJson` grounded in the reference images:

1. `องครักษ์ป่านีออน / Neon Jungle Guardian` — bioluminescent jungle, neon
   orchids, teal-green palette, techwear scout + animal companion.
2. `สหายเหล็ก / My Giant Companion` — girl and battle-worn giant robot,
   hangar/industrial light, ivory-gold or gunmetal palette, bond/protection
   drama.
3. `แขนกลสมรภูมิ / Cyborg Arm Battlefield` — post-war base, overcast light,
   cyborg-arm lead, leather-over-armor wardrobe, military mecha background.
4. `นักเร่ร่อนกลทะเลทราย / Desert Mech Nomad` — desert dunes, spider-mech
   mount, monochrome-black armor against sand, survival wandering drama.

Presets in this family default `blockPaidGenerationBelowFloor`-compatible
quality policy unchanged; they are content seeds, not policy changes.

**C. Real mix (synthesis v2).** The shipped `synthesizeGenrePreset` ("Mix
and Match", 2-5 selections, `mixRecipe{primaryFlavor, supportingFlavors,
rationale}`) collapses non-primary presets into unverifiable "flavor". V2
makes blending explicit and checkable:

1. **Weights**: each selection carries `weight` 1-5 (UI slider; default
   equal). The primary spine (mainPlot/seasonArc skeleton) comes from
   `primarySelectionId`; weights scale every other facet's contribution.
2. **Facet assignment before the LLM call**: a deterministic pre-pass builds
   a `facetAssignments` table over facets `{story_spine, situations,
   characters, tone, cliffhanger_style, world_texture, visual_identity,
   product_fit}` and REQUIRES every selected preset to contribute concrete
   elements to at least `minFacetsPerPreset` (default 2) facets. The LLM
   fills the assigned slots; it may not silently drop a preset.
3. **Deterministic visual-identity merge**: `visualIdentityJson` facets merge
   in code, not prose — palette weighted-merge (primary-heavy, capped 6),
   motif/wardrobe/prop union with dedupe, negative-fragment union; the LLM
   only writes the blended `styleName` and a coherence pass.
4. **Blend provenance report**: output v2 extends `mixRecipe` with
   `blendReport`: per-facet `contributions[]` (`presetId`, `element`,
   `kept`) plus `contributionCoverage` (presetId → facet count). The
   create-wizard preset step renders this report so the user SEES what each
   preset contributed.
5. **Blend QC gate (deterministic)**: after synthesis, code verifies every
   selected preset reached `minFacetsPerPreset`; on failure it auto-retries
   once with a corrective instruction naming the under-blended preset, then
   surfaces a visible warning ("preset X ยังไม่ถูกผสมจริง — ปรับน้ำหนักหรือเลือกใหม่")
   with the coverage numbers. Blending quality is verified, never assumed.
6. Contract remains a superset: v1 outputs (`contract_version: 1`) stay
   parseable; v2 sets `contract_version: 2`.

Feature flag: `verticalDramaSeriesPresetMixV2` (§17; default off — flags-off
keeps shipped Mix and Match byte-identical). Implementation: section-15.

#### 8.2.3 Deep Story Drafts And Async Story Jobs (added 2026-07-08/09, tasks #28, #10/W10-W11)

> Requirement source: production feedback 2026-07-08 — a per-episode
> breakdown (`workingTitle`/`logline`/`keyBeats[]`) is not a usable script.
> Deep Story Drafts generate a full 9-shot, speakable-dialogue draft for
> EVERY planned episode directly from the season chunk, ahead of per-episode
> generation, so a creator can review the whole season's actual dialogue
> before spending per-episode credits.

**What it generates.** `generateStoryBibleDeep` (new series, no existing
breakdown) and `extendStoryDraftHorizon` (extend an existing draft) chunk the
season 5 episodes per call, carrying a continuous recap and `open_threads`
between chunks, and draft 9 shots with full `dialogue_lines[]` per episode —
the SAME dialogue-complete shape §7.7.2 requires from `plan_episode_script`,
produced earlier, at bible/season-generation time. Output passes through the
same speakability auto-clean (§14.1 item 6b) and draft-completeness check
(the canonical `dialogueQuality.ts` estimator, §7.7.1) as per-episode
generation. Partial failures keep whatever chunks succeeded; credits are
charged per completed chunk, not all-or-nothing. `deepDraftSummary` surfaces
on the series list/detail so a creator can see draft coverage without
opening every episode. Hydration into the real per-episode pipeline
(`generate_or_import_character_refs`/`storyboard_shotgrid` etc.) happens at
the actual call site in `refine` mode — the deep draft seeds the script and
storyboard skills' input as a superset, it does not bypass them.

**Format-profile awareness.** When `verticalDramaSeriesFormatProfiles`
(F131X, §7.8) is on, the chunk prompt is prefixed with the resolved tier's
`beatDensityGuidanceTh`/`En` and the per-episode cold-open hook rule.

**Premium multi-round mode (task #11/W11, added 2026-07-08).** An opt-in,
more expensive draft mode selectable AT BOOTSTRAP (series creation) or when
generating/extending: fan out 3 narrative lenses per chunk in parallel →
deterministic gates → one inline LLM judge call scoring 8 dimensions (1-5,
floor 4 on `hook_strength` + format-profile delta from §7.8, floor 3 on the
rest) → targeted revision of only the episodes that failed (max 2 rounds,
per-episode regression guard, early-stop once all pass) → one continuous-
season sweep pass at the end (plus a targeted spot-revise if the sweep finds
an issue) → a `draftScorecard` per episode plus season-level
`premiumMetrics` (`roundsUsedPerChunk`, `firstPassGatePassRate`,
`episodesBelowFloorAfter`, `sweepIssuesFound`, `callsMade`) persisted into
the deep-draft metadata. Credit pre-estimate: `chunks × 6 calls + 2` (fan-out
3 + judge 1 + up to 2 revise rounds averaged, + the season sweep); actual
deduction follows calls really made, including partial runs. A best-effort
call failure preserves the prior state rather than corrupting it.

**Season Dramaturgy Critic (§6.8.2, added 2026-07-09, task #29).**
`critiqueSeasonDrafts` and `applySeasonCritique` are the other two async
story-job kinds: critique produces the 10-finding-kind report (§6.8.2)
against the current draft; apply revises flagged episodes under the
Story Lock guard (§16.3) and re-runs the deterministic checks as a
regression guard before accepting the revision.

**Async job pattern (task #28, added 2026-07-08).** All four mutations above
(`generateStoryBibleDeep`, `extendStoryDraftHorizon`, `critiqueSeasonDrafts`,
`applySeasonCritique`) share ONE generic, kind-agnostic async job mechanism
instead of an inline synchronous `await` — this replaced an earlier stopgap
of raising Node's request-timeout to ~620s:

- submit → the router does fast synchronous validation (ownership, flag,
  input shape), then enqueues onto a BullMQ queue named
  `vertical_drama_story_jobs` and returns `{ jobId, deduped? }` immediately;
- **per-series exclusivity**: at most ONE story job of ANY of the four kinds
  may be active per series at a time, enforced by a separate Redis pointer
  key (not BullMQ worker concurrency, which is queue-wide across every
  tenant) — resubmitting while a job is active returns the SAME `jobId`
  (`deduped: true`) instead of double-submitting; the pointer clears on every
  terminal outcome;
- job status/progress/result is a small Redis-JSON record per `jobId`
  (`vd:story-job:<jobId>`), not a new DB table/column — this is dispatch
  bookkeeping, not durable series state; durable output still lands in the
  series `bible` jsonb / breakdown versions as before;
- poll — the client calls `getStoryJobStatus({ seriesId, jobId })` on an
  interval (2.5s) and `getActiveStoryJob({ seriesId })` on mount to
  resume-safely reattach to an in-flight job after a refresh/navigation,
  with progress phases `outline` → `draft` → `review` → `fix` → `reading`
  surfaced to the UI;
- on completion (success or failure), a notification is created through the
  existing `notificationService` so the user is alerted even if they
  navigated away while the job ran; notification failures are caught and
  never fail the underlying job;
- **breaking change from the pre-#28 shape**: these four mutations now
  return `{ jobId }` immediately instead of the final result directly — no
  other caller in the codebase invoked them synchronously, so this had no
  external breaking blast radius at ship time.

### 8.3 Series Workspace

Tabs (all eight are **always visible and clickable** — see §8.7 for why
progressive disclosure was dropped):

- Overview — also renders the generated season arc + episode breakdown once
  `generateStoryBible` has run, with a "Generate story" / "Regenerate" action
  when it hasn't (or the wizard-time attempt failed)
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

**Episode workspace surface (2026-07-04 redesign):** the 15 canonical stages
above render as a phase-grouped grid of cards (grouped under the same ~4
phases as §8.7) — **every card is independently clickable regardless of its
status**, not only the current one. Clicking a card focuses it and renders its
full detail below the grid: a generic read-only run-ledger view
(`VerticalDramaRunDetailView`, backed by `assembly.listRuns`/`getRunDetail`)
for stages without a bespoke view, and the dedicated
`VerticalDramaDialogueAudioPanel` for the `dialogue_audio_plan` stage. The
existing start-frame contact-sheet picker (`VerticalDramaContactSheetPicker`)
is now reachable from its stage cards at any time, not only while it is the
current stage. The single primary CTA (§8.7) is unchanged and still drives the
actual "run this stage" action; the stage-card grid adds a parallel,
always-available *viewing* surface on top of it. The `VerticalDramaSubShotEditor`
(step 9's sub-shot editor) is not yet wired into this click-to-view flow — no
query/mutation exists yet shaped for its per-sub-shot edit contract; it remains
backlog (see section-10).

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

### 8.7 Simplicity And Progressive Disclosure (updated 2026-07-04)

The workspace must stay easy to understand despite its depth. The original
design used tab-hiding progressive disclosure; that was replaced with an
**always-visible-plus-attention-indicator** pattern so users can freely check
what's filled in vs. missing on any tab/stage, per direct user feedback that
hiding tabs made it harder to audit a series before generating:

- The 15 canonical `VerticalDramaPipelineStage` stages are grouped into ~4 labeled phases
  (Plan → Frames → Prompt & Handoff → Generate & Assemble) with a phase progress indicator;
  exactly ONE primary CTA is still driven by `RunResult.next_action` for the *current*
  actionable stage, but every stage card in the grid is independently clickable to view its
  own detail regardless of status (§8.4).
- Workspace tabs (§8.3) and wizard steps (§8.2) are **always visible/clickable** — no tab or
  step is hidden behind a "more" affordance. Instead, tabs/steps whose underlying content is
  still empty show a small amber completion dot (green once populated) so the user can see at
  a glance what still needs attention without losing the ability to jump there directly.
- Planning, prompt generation, and PAID generation are always visually and textually distinct
  so paid actions are never triggered by accident — this now also covers "Generate story"
  (§8.2.1) and every §8.2.3 deep-draft/critique async action, all of which are genuinely paid and
  labeled/confirmed accordingly (credits-used toast, distinct button copy, up-front credit
  estimate for async jobs since a job may run many LLM calls before it resolves).
- A breadcrumb (Series › Episode › Storyboard Review) makes deep navigation reversible.

### 8.8 Guided Production Wizard (added 2026-07-07 — primary episode UX)

> Requirement source: production feedback 2026-07-07 — users currently have
> to MEMORIZE the production order. The episode surface is one long scrolling
> panel (`VerticalDramaStoryboardPanel`) where every action is available at
> once; the only stepper in the product is the series-CREATION wizard. Users
> guess what to run next and in what order.

The guided Production Wizard (full contract: section-12) becomes the PRIMARY
episode-production surface, not an optional overlay:

1. **One visible ordered path.** The wizard stepper renders the production
   order for the episode: series setup → episode script → storyboard shots →
   script quality QC → start frames → dialogue/audio plan → dialogue & density
   QC → video prompts → shot repair → video clips → final episode. Exactly one
   primary CTA points at the next safe step (reusing `RunResult.next_action`).
   Script quality QC sits after the storyboard because the shipped review
   skill scores script + storyboard together (§6.8.1) and tie-in checks need
   shot data (§13.1); it sits before start frames because that is the first
   paid stage. The script step itself carries the deterministic density gate
   (§7.7.2), which needs no storyboard.
2. **Quality gates are wizard steps, not hidden checks.** The script-quality
   auto-improve loop (§16.1) and the dialogue/density gate (§7.7, §14) render
   as first-class steps with their scorecard/coverage evidence inline, so a
   user always sees WHY progress is blocked and which repair unblocks it.
3. **Custom work never forces a restart.** Every step exposes "view/edit
   artifact" and per-target repair (shot, clip, frame, line, tie-in). A spot
   repair marks only DOWNSTREAM artifacts stale (section-12 stale-propagation
   table); the wizard then re-enters at the earliest stale step. The user
   never re-runs unaffected stages and never rebuilds the episode to fix one
   shot.
4. **Expert mode stays.** The existing stage-card grid / long panel remains
   available behind an "Advanced stages" disclosure for power users and
   debugging; it must not compete with the wizard's single primary CTA.
5. **Paid actions stay explicit.** Every step carries its credit-spend label
   (`none | llm | image | video | tts`); paid steps keep the existing
   credit-estimate confirmation.
6. **Resume-safe.** Wizard state is derived from persisted artifacts/runs
   (no separate wizard table), so refresh, another device, or a crashed tab
   re-derives the same active step.

Feature flag: `verticalDramaSeriesProductionWizard` (§17). Rollout follows
section-12: render read-only first, then take over the primary CTA, then
enforce server-side gates.

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

### 9.3 Character Reference Resolution V2 (added 2026-07-08, task #27-A)

> Requirement source: research
> `planning/vertical-drama-character-consistency/research-2026-07-09.md` —
> shipped generation always sent exactly ONE reference image per character
> (the primary portrait), even though the character stock already PERSISTS
> additional sheets (`character_sheet_turnaround`, `character_sheet_full`)
> that were generated but never read back for generation. The gap was the
> resolver, not the data.

Behind flag `verticalDramaSeriesCharacterRefV2` (F131Z, §17; default off),
character reference resolution sends a SECOND identity-lock image per
character — the character's best available sheet asset, chosen by
`pickBestCharacterSheetAsset` with priority **approved > turnaround > full >
most-recently-updated** — alongside the existing primary portrait, into
start-frame and video-clip generation. This costs nothing extra in provider
fees; it reuses assets already generated and stored.

Ordering matters for reference-budget trimming: when multiple characters'
references are merged and the combined count exceeds the provider's
`maxReferenceImages`, `resolveShotCharacterReferenceUrls` orders the merged
list as **all portraits first, then all sheets**, so trimming from the end
always drops sheets before it ever drops a primary portrait. `getPrimaryPortraitUrl`
itself stays byte-identical (unchanged single-portrait behavior) for callers
that only need the portrait; `getCharacterReferenceUrls` is the new resolver
that additionally returns the best sheet. With the flag off, resolution is a
literal duplicate of the pre-#27-A single-reference logic — not merely gated,
so existing narrow test mocks are unaffected.

This is Option A of the character-consistency research's option table (S
effort, $0 cost). The research also evaluated and explicitly DEFERRED,
pending owner decision or dedicated follow-up work: switching the default
image model to a stronger-consistency model (owner must approve before
defaulting — cost is ~4x), wiring provider-native consistency mechanisms
(Gemini Omni `character_ids`, Higgsfield `soul_cast`) that other features in
this codebase already use but vertical drama never adopted, and an opt-in
vision-LLM identity-drift QC pass (non-deterministic, has a per-shot cost).

---

## 10. Skill Runtime And Import Contract

### 10.1 Location

Required new skill folders (original MVP wave — 4 imported from the GitHub
guide, 4 SmartSpecPro-only):

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

> **Shipped folders beyond the original 8 (verified on disk 2026-07-09):**
> `apps/web/skills/vertical-drama-episode-quality-review/` (§6.8.1, shipped
> 2026-07-05), `apps/web/skills/vertical-drama-season-dramaturgy-critic/`
> (§6.8.2, task #29), `apps/web/skills/vertical-drama-ad-banner-prompt/`
> (§6.8.3, task #30), `apps/web/skills/vertical-drama-preset-synthesizer/`
> and `apps/web/skills/vertical-drama-shot-video-prompt/` (both predate this
> version's sync pass and are out of scope for the 2026-07-09 delta list —
> flagged here so this location list stays a complete, trustworthy index
> rather than silently going stale again; see section-15 and section-06 for
> whichever of these two already has implementation-section coverage). 13
> skill folders exist on disk in total as of this version.

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

### 11.8 Beyond-Plan Sanity (added 2026-07-08, task #26)

An episode number that exceeds the series' planned season length
(`episodeNumber > plannedEpisodeCount` from the active breakdown) is an
inconsistent state, not a valid "extra episode" — it means the season plan
was never extended to cover this episode.

- `getEpisodeDetail` reports `breakdownStatus: "beyond_plan"` for such an
  episode instead of silently treating it as in-plan;
- script generation for a beyond-plan episode fails fast with a stable error
  prefix `VD_EPISODE_BEYOND_PLAN` and a Thai guidance message directing the
  user to extend the season plan from the series Overview before generating
  this episode's script;
- cadence/window math (used by tie-in fatigue and arc-drift bookkeeping)
  guards against reading past the end of the planned breakdown;
- **grandfathering**: legacy series that have no breakdown at all (predate
  `generateStoryBible`/deep drafts entirely) are exempt from this check —
  there is no plan length to exceed;
- the client renders a warning banner on a beyond-plan episode with a direct
  link to extend the season plan.

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

> **2026-07-09 note:** "final MP4/media asset ID when export completes" is no
> longer concat-only — see §12.4 Final Render Suite for the shipped Node
> ffmpeg render graph (dialogue mixdown, subtitle burn-in, banner
> compositing) that now produces that final asset.

### 12.3 Archival Behavior

Archiving a series is a soft operation. Setting series `status = "archived"` hides its assets from the active workspace but MUST preserve Storyboard Review history and the handoff linkage (`seriesId`/`episodeId` backlinks, idempotency keys, approval checkpoints, and audit events). Archival must never orphan Storyboard Review projects and must never hard-delete artifacts that participate in the audit chain. Restoring the series must re-surface the same linked history intact.

### 12.4 Final Render Suite (added 2026-07-09, task #21)

> Requirement source: Wave 7 §7 acceptance ("final assembly manifest
> round-trips...") described the CONTRACT; the actual render path shipped
> 2026-07-09 as a pure, unit-testable Node ffmpeg filter-graph builder
> (`server/services/verticalDramaFinalRenderGraph.ts`), replacing the
> earlier concat-only assumption implicit in §7.3's `ffmpegConcatPlan`.
> Explicitly **NOT** in scope: upload, publish, or scheduling to any
> platform — this suite produces a durable MP4 media asset and stops there.

**Concat regression lock.** The pre-existing plain-concatenation path
(`buildConcatFfmpegArgs`) stays byte-identical and is protected by a
regression test — every new capability below is ADDITIVE to the render
graph, gated by whether its inputs are present, never a replacement of the
concat baseline.

**Dialogue-audio mixdown.** When per-line dialogue audio exists (§14.2 voice
chain), the render graph mixes it into the final audio track: a
`dialogueAudioTimeline` resolves each line's shot-local timing to the
episode's absolute timeline (with a speech-estimator fallback for lines that
never got a real audio render), then the graph applies
`adelay`/`volume`/`loudnorm` (`amix`) to lay the dialogue over the clip
audio. Optional `loudnessNormalize` and a currently-no-op `duckClipAudioDb`
parameter (accepted, not yet wired) round out the mix options.

**Subtitle burn-in.** ASS-format subtitles burned into the final render,
reusing the SAME 10 caption presets already shipped for HyperFrames captions
(`classic_box`, `minimal_shadow`, `creator_pop`, `karaoke_word`,
`highlight_bar`, `lower_third`, `cinematic_wide`, `neon_glow`,
`review_bubble`, and `no_subtitle_style` as the 10th/"no burn-in" option) —
ported 1:1 from the shipped `hyperframesRenderWorker.buildFinalCompositeAss`
precedent, not a new preset system. A speaking line's speaker name renders
as an inline override within the same Dialogue line (avoiding a
separate-drawtext-per-name approach that risked filter-graph blowup).

**Banner overlay compositing.** When an episode has an `adBannerPlan` (§13.3),
resolved banners are composited into the SAME render graph: scale + crop to
the placement box, fade in/out (0.3s), `enable='between(t,S,E)'` windowing,
in z-order video → band/side banners → subtitles → fullscreen banners. An
"entire"-duration banner resolves its window to `[0, actualClipDuration]`
AFTER the clip is ffprobe'd (not before) — an earlier version resolved
against the target duration before probing, which could fail validation on a
clip shorter than expected; this was fixed in the same wave (task #21-B).

**Per-episode render options** (`assembleEpisodeVideo`):

```ts
type VerticalDramaRenderOptions = {
  includeDialogueAudio: boolean;   // gated by verticalDramaSeriesVoiceChain (§14.2)
  loudnessNormalize: boolean;
  subtitlePreset?: CaptionPresetId; // one of the 10 presets above, or omitted
};
```

The response includes counts (clips included/excluded) and
`excludedAdBanners` (banners that could not be included, with reasons —
e.g. regulated category pending approval, validation failure) so a partial
render is never silently different from what the user configured.

**Batch season render** (`assembleSeasonVideos`, added 2026-07-09): submits
a render job for every render-ready episode in the season up front (job IDs
minted immediately, so progress is visible even before execution starts),
then executes strictly sequentially with continue-on-failure (one episode's
failure does not stop the rest). **Ad banners are excluded from batch
render in v1** — banner compositing remains per-episode-only until the
banner-input resolver is promoted to a shared service (documented backlog).

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

### 13.1 Production-Grade Tie-In Naturalness QC (added 2026-07-07)

> Requirement source: production feedback 2026-07-07 — tie-ins must be woven
> in at production grade, and the SCRIPT quality of a placement must be
> measured, not assumed. The shipped placement machinery
> (`product_tie_in_plan.tie_ins[]` with `shot_numbers[]`, `story_function`,
> `placement_style ∈ {hero_prop, background, in_use_moment}`,
> `benefit_talking_point`; claim screening; fatigue window 10;
> `sanitizeBrandMentionsInPrompt`; Thai ad compliance) stays as-is — this
> section adds the missing QUALITY MEASUREMENT and repair loop on top.

#### Naturalness scorecard

Every episode with a tie-in produces a `VerticalDramaTieInQualityReport`
before paid generation. Scoring is hybrid: deterministic checks computed in
code, qualitative dimensions judged by the quality-review skill (§6.8.1 v2,
as the `tie_in_naturalness` dimension plus a detailed tie-in block).

```ts
type VerticalDramaTieInQualityReport = {
  reportId: string;
  episodeId: string;
  runId: string;
  // qualitative (LLM-judged, 1-5)
  storyIntegration: number;      // would the beat still work without the product? (should ride an existing need)
  characterMotivation: number;   // does the character have an in-story reason to touch/mention it?
  toneMatch: number;             // placement matches genre/tone (no sudden ad-voice)
  // deterministic (computed, not judged)
  spokenMentionCount: number;    // default max 2 per episode
  visualShotCount: number;       // default max 3 of 9 shots
  adSpeakViolations: string[];   // locale ad-speak lexicon hits in dialogue (superlatives,
                                 // CTA phrasing) outside an allowed soft_cta story function
  claimViolations: string[];     // forbiddenClaims + regulated-category patterns (existing screenClaims)
  disclosureSeparated: boolean;  // existing isDisclosureSeparateFromPrompt
  fatigueOk: boolean;            // existing evaluateFatigue within maxEpisodesWithTieInPerTenEpisodes
  // verdict
  naturalnessScore: number;      // 0-100 — exact formula below
  passed: boolean;               // naturalnessScore >= floor AND no deterministic violation
};
```

`naturalnessScore` formula (deterministic, so telemetry averages are
comparable): `round(mean(storyIntegration, characterMotivation, toneMatch)
/ 5 * 100)`; if ANY deterministic violation exists (`adSpeakViolations`,
`claimViolations`, mention/shot-count overruns, `disclosureSeparated ===
false`, `fatigueOk === false`), the stored score is capped at `min(score,
69)` — one point below the default pass floor — so a violation can never be
masked by high qualitative scores, in the gate or in averages.

`VerticalDramaTieInUsage.placementNaturalnessScore` (§13) is henceforth
DEFINED as this report's `naturalnessScore` (0-100 scale). Default pass
threshold: **70**, per-tenant/per-series configurable via the quality policy
(§16.1); regulated categories may only RAISE it.

#### Gates and repair loop

- a failing tie-in report BLOCKS paid image/video generation for tie-in
  shots in guided mode and blocks Storyboard Review handoff of the episode
  until resolved (repair, removal, or explicit human override); the report
  is produced at the wizard's script-quality step (§8.8) — after the
  storyboard exists, since its deterministic checks count storyboard shots —
  and always before the first paid stage;
- tie-in issues join the §16.1 auto-improve loop as the `tie_in` repair
  group — FOURTH in the §16.1 canonical order (script → storyboard →
  dialogue → tie_in): the rewrite touches ONLY tie-in-carrying
  beats/lines/shots and preserves the story spine — story beats may not be
  restructured to sell the product;
- if the loop exhausts `maxAutoImproveRounds` and the report still fails,
  the recommended repair becomes `remove_or_rewrite_tie_in` with default
  action **defer**: strip the placement from this episode (deterministic,
  no LLM call) and record the deferral in tie-in history/fatigue. Behind
  flag `verticalDramaSeriesTieInReplan` (task #31, added 2026-07-09), this
  ALSO attempts to build a real `arc_replan_proposal` (§7.7.3,
  `driftReasons: ["VD_ARC_TIE_IN_DEFERRED"]`) that re-places the product on
  the nearest eligible future episode's season plan — the user reviews and
  approves it on the SAME arc re-plan card as a detected-drift proposal.
  `scheduleAtRisk: true` is now the FALLBACK signal, only returned when no
  eligible future episode exists or the fatigue cap is already exhausted
  everywhere (or the flag is off) — see §7.7.3's "Deliberate re-plan: tie-in
  defer" for the full mechanism;
- an explicit human override (ship below threshold) is allowed for
  non-regulated categories only and is recorded with `approvedByUserId`,
  the failing report id, and an audit event.

#### Visual grounding QC

- every tie-in shot must attach at least one APPROVED product reference
  asset when references exist (cap stays 3); a tie-in shot rendered without
  its product reference is a QC error, not a silent fallback;
- start-frame QC for tie-in shots adds a product-fidelity checklist: product
  visible per `placement_style`, label/branding not warped or hallucinated,
  scale plausible; failure creates a prefilled `regenerate_start_frame`
  repair with the product-lock instruction enforced;
- brand-name sanitization for provider prompts (existing behavior) must
  never remove the product from the DISCLOSURE layer — disclosure text stays
  intact and separate.

#### Measurement and telemetry

- the tie-in report persists as a run artifact per episode (append-only,
  like quality reviews);
- the series Product Tie-in tab shows: placements used vs
  `maxEpisodesWithTieInPerTenEpisodes`, average `naturalnessScore`, deferral
  count, claim/ad-speak violation count, and per-episode pass/fail history;
- acceptance: no episode ships a tie-in with a failing report without a
  recorded human override.

### 13.2 Tie-In Aware Deep Story Drafts (added 2026-07-09, task #22)

> Requirement source: gap identified during the 2026-07-08 roadmap review —
> season-level deep drafts (§8.2.3) were generated with NO knowledge of
> product tie-in at all; placement was purely a REACTIVE, per-episode
> decision made by `evaluateFatigue` looking backward at the last 10
> episodes' scripts. Task #31 (§7.7.3) built the `tieIn` field and the
> propose→approve→apply plumbing for MOVING a placement; this task is what
> actually POPULATES that field at season-generation time and threads it
> through deep drafting.

Gate: `productTieIn.enabled && verticalDramaSeriesTieInReplan` (F131Y, §17)
— no new flag introduced; this task extends the same flag §7.7.3 introduced.

**Season-level bootstrap.** `planSeasonTieInPlacements` (§7.7.3) runs at
season generation time (the `generate_story` source), persisting an initial
`tieIn` placement onto each relevant breakdown item of the NEW breakdown
version — evenly spaced, respecting the format-profile-prorated budget
(§7.8's `resolveTieInEpisodeBudget`), avoiding episode 1 (hook-only) by
default.

**Chunk prompts.** Deep-draft chunk prompts (§8.2.3, both standard and the
premium fan-out/revise paths) gain a PRODUCT TIE-IN section for any episode
in the chunk whose breakdown item has `tieIn.planned === true`, carrying
`benefitFocus`/`intensity` into the drafting context.

**Shot marking.** Drafted shots additively carry:

```ts
type VerticalDramaDraftShotTieIn = {
  has_product_moment: boolean;
  benefit_line?: string;
};
```

**Reconciliation.** `reconcileTieInDraftMarking` deterministically compares
the plan (`tieIn.planned`) against what the draft actually marked
(`has_product_moment`) and raises `tie_in_placement_mismatch` warnings plus a
`tieInMismatchCount` when they disagree in either direction (planned-but-
unmarked, or marked-but-unplanned).

**Premium judge dimension.** `tie_in_naturalness` is scored by the premium
multi-round judge (§8.2.3) as a SEPARATE dimension outside the 8 core
dimensions — separate because it only applies to episodes that actually
place the product, whereas the 8 core dimensions score every episode.

**Season Dramaturgy Critic kind 9.** `tie_in_distribution` (§6.8.2) is the
season-wide, whole-draft-granularity version of the same mismatch signal —
it also catches BUNCHING (two adjacent episodes both planned, instead of the
even spread `planSeasonTieInPlacements` targets), which a per-run
reconciliation cannot see across multiple generate/extend calls.

**Overview badges.** The series Overview renders two badge states on
episodes with a planned placement: normal ("planned") when the draft marks
it, and a destructive/warning state when the draft does not mark it despite
being planned — giving the same signal the reconciliation warnings carry, at
a glance.

### 13.3 Ad Banner Overlay (Story-External Ad Layer) (added 2026-07-08/09, task #30)

> Requirement source: owner directive 2026-07-08 — in the Product Tie-in
> tab, add an option to overlay ad banners on top of the rendered video:
> bottom band / side vertical / fullscreen; the system reads product
> image+details and generates a prompt following one of 10 current
> (2026) ad-design trends; the user picks a media model and size the model
> supports; the prompt is editable before generation; banners display for a
> time window or the whole clip; 1-5 banners per video; composited at
> render time; production grade.

**This is explicitly NOT in-story tie-in (§13-§13.2).** Story tie-in means
the product exists WITHIN the narrative (dialogue, scene, shot) with
naturalness QC. Ad banner overlay is a deliberate advertising LAYER
composited ON TOP of a rendered clip — the TV equivalent of an L-band,
lower-third, or interstitial. The two systems are independent: a series can
use either, both, or neither, and enabling one does not touch the other's
data, prompts, or storyboard.

**Architectural consequence — guard exemption.** Because a banner IS
intentionally an advertisement, the banner prompt path deliberately does
**NOT** pass through the story-side brand-neutrality guards
(`VD_PRODUCT_LOCK_INSTRUCTION`, `sanitizeBrandMentionsInPrompt` —
`verticalDramaProductTieIn.ts`) that exist specifically to stop an
IN-STORY shot from reading like an ad poster. What DOES still apply to
banners: `forbiddenClaims[]` (checked deterministically in the banner prompt
and every copy field, before generation AND before render), `regulatedCategory`
(forces `requireHumanApproval` before a banner may enter a render), and
`disclosurePolicy` (v1: recommended in-prompt; a deterministic drawtext
disclosure badge is backlog, pending the same drawtext capability §13.3
already uses for other overlays via §12.4).

**Data model.** Two layers — design is series-scoped (a product's banner
designs are reusable across episodes), usage is episode-scoped:

```ts
// Series layer — new `adBanners` key inside the EXISTING
// vertical_drama_series.productTieIn jsonb column (merge-patched, no migration)
type VerticalDramaAdBannerDesign = {
  id: string;
  stylePresetId: VdAdBannerStyleId;              // one of 10 style presets, below
  placementId: "bottom_band" | "side_vertical" | "fullscreen";
  sideAlign?: "left" | "right";                  // side_vertical only
  copy: { headline?: string; subtext?: string; priceText?: string; ctaText?: string };
  prompt: { generated?: string; negative?: string; final?: string; editedAt?: string };
  generation: { modelId?: string; aspectRatio?: string; size?: string };
  imageAsset?: { url: string; taskId?: string; width?: number; height?: number; generatedAt: string };
  defaultTiming: { mode: "entire" | "window"; startSec?: number; durationSec?: number };
  status: "draft" | "prompt_ready" | "generating" | "ready" | "failed";
  approval?: { required: boolean; approvedBy?: string; approvedAt?: string };
}; // max 5 designs per series

// Episode layer — new nullable column vertical_drama_episodes.adBannerPlan jsonb
// (manual SQL + provenance file; series continues to use the existing
// productTieIn jsonb, so only the episode side needed a schema change)
type VerticalDramaAdBannerPlan = {
  enabled: boolean;
  selections: Array<{
    bannerId: string;
    timing?: { mode: "entire" | "window"; startSec: number; durationSec: number }; // overrides defaultTiming
  }>; // max 5 selections per episode; fullscreen selections must not overlap each other in time
};
```

**Placement presets** (coordinate boxes on a 1080×1920 frame):

| id | box (x, y, w, h) | target aspect | default timing | notes |
| --- | --- | --- | --- | --- |
| `bottom_band` | 0, 1400, 1080, 360 | 3:1 | entire clip | sits above the bottom 160px safe zone (platform UI / subtitles) |
| `side_vertical` | 20 or 760, 480, 300, 960 | ~1:3 | entire clip | hugs left/right edge, vertically centered, clears TikTok-style right-edge UI |
| `fullscreen` | 0, 0, 1080, 1920 | 9:16 | 3s window | interstitial/end-card, 0.3s fade, fully opaque |

Media models do not natively offer 3:1/1:3 aspect ratios, so generation
targets the model's closest supported aspect (band → 16:9, side → 9:16 or
2:3, fullscreen → 9:16 exactly) and the render graph (§12.4) cover-fits +
center-crops into the placement box; the banner-prompt skill (§6.8.3) is
instructed to compose crop-safely (e.g. "critical content within center 60%
height" for a band).

**Style presets** (`shared/verticalDramaSeries/adBannerPresets.ts`,
`VD_AD_BANNER_STYLE_IDS`) — 10 2026 ad-design trends, each with
`promptTokens` (style/composition/texture/lighting), `negativeTokens`,
`fitCategories` (used to auto-recommend presets against the tie-in's
`productCategory`), and a `textInImageRisk` rating (AI image generation
renders non-Latin script, including Thai, unreliably — surfaced as a UI
warning, not silently hidden):

`imperfect_by_design`, `reality_warp`, `tactile_sensory`, `bold_typography`,
`retro_futurism`, `documentary_realism`, `multi_dimensional`,
`emotional_gradient`, `collage_mixed_media`, `vertical_first`.

**Generation flow (series-level banner studio, in the Product Tie-in tab):**

1. pick a style preset (recommended presets surface first, by
   `fitCategories` match) and a placement, fill in copy fields;
2. pick a media model + aspect/size the model supports (same filtering
   pattern as Media Studio);
3. "Generate prompt" invokes `vertical-drama-ad-banner-prompt` (§6.8.3),
   which reads the product's reference images + copy and produces
   `{ imagePrompt, negativePrompt, textInImage[], compositionNotes,
   complianceNotes }`; the prompt renders in the same reusable
   `InlineEditablePromptBox` used elsewhere in this feature and is EDITABLE
   before generation;
4. "Generate banner image" submits to the existing async media-generation
   pipeline with the product's reference images attached (same
   reference-resolution/cap-3 convention as story tie-in shots), then polls
   to completion and previews the result on a mock 9:16 frame at its
   placement;
5. a regulated-category product shows a "needs approval before use" badge
   and an explicit approve action before the banner may enter a render.

**Per-episode usage:** in the episode assembly UI, "banners in this video"
lets the user pick from the series' `ready` banner designs and adjust timing
per selection (entire clip, or a start-second + duration window); validation
enforces the max-5 cap and that fullscreen selections do not overlap, with a
non-blocking warning if fullscreen banners together exceed 20% of the clip's
length or if a band and a side banner run simultaneously for the whole clip
("ad fatigue" — allowed, just flagged).

**Compositing:** see §12.4 Final Render Suite — banners share the same Node
ffmpeg render graph as subtitles/dialogue mixdown, z-ordered video → band/side
→ subtitles → fullscreen, and are the reason the render graph moved from
concat-only to a full filter-graph builder in the same wave.

Feature flag: `verticalDramaSeriesAdBannerOverlay` (F131W, §17; default off).

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

### 14.1 Dialogue Density And Speech Coverage (added 2026-07-07)

These rules make §7.7's budget enforceable at the audio layer. All numbers
come from the canonical module (§7.7.1) — never re-declared locally.

1. The dialogue-complete SCRIPT is the source of truth for lines (§7.7.2).
   The dialogue/audio plan distributes, times, and enriches those lines
   (voice, `delivery`, `subtext`, spoken-register Thai); inventing new story
   content at this stage is a contract violation. The legacy
   `script_fallback` chain (parsing freeform scene summaries, positional
   shot mapping) always tags its output `origin: "script_fallback"` and
   carries a warning until reviewed or regenerated.
2. Per-clip coverage: estimated speech seconds for a speaking clip must
   reach `MIN_CLIP_COVERAGE_RATIO` (warning) and never sit below
   `ERROR_CLIP_COVERAGE_RATIO` (error). Target is
   `targetVerticalDramaSpeechSeconds(clipDuration)`.
3. Whole-episode coverage: total estimated speech must reach
   `MIN_EPISODE_COVERAGE_RATIO` (warning below) /
   `ERROR_EPISODE_COVERAGE_RATIO` (blocking error below) unless the episode
   is explicitly visual-first.
4. Silent-gap rule: continuous estimated silence inside a speaking clip may
   not exceed 2.5 seconds; the analyzer reports the gap position.
5. Duplicate lines across unrelated shots (`VD_DIALOGUE_DUPLICATE`) and
   stage directions / sound cues inside dialogue
   (`VD_DIALOGUE_STAGE_DIRECTION`) are errors.
6. Thai dialogue must be spoken-register (ภาษาพูด: natural sentence-final
   particles, short clauses, no written/translated register) — a hard rule
   in the dialogue skills with good/bad examples (shipped Phase 3B behavior,
   now contract).
6b. **Speakability (added 2026-07-08, owner feedback with live evidence)**:
   every dialogue line must be literally speakable by TTS/a human actor —
   no wrapping quote marks (“ ” " '), no parenthetical stage directions in
   the speaker or the line (`หนูนา(สะดุ้ง)` → speaker `หนูนา`, delivery
   `สะดุ้ง`), no tildes/asterisks/brackets/slashes/markup, no em-dash as a
   spoken beat (use a comma or a new line), ellipsis runs collapsed (max
   one `…` per line), no emoji. A deterministic analyzer
   (`VD_DIALOGUE_UNSPEAKABLE_SYMBOLS`, in `dialogueQuality.ts`) flags
   violations with the offending characters and a cleaned suggestion; the
   dialogue skills carry the prohibition as a hard rule with the real
   observed bad examples; TTS/native-audio consumption paths sanitize
   wrapper punctuation before rendering; non-verbal "lines" (animal sounds,
   ambient voices) must be declared as sound cues, not dialogue lines.
7. After separate-TTS rendering, actual audio durations reconcile against
   estimates; per-clip drift > 15% raises an `adjust_audio_subtitle` repair
   suggestion instead of silently stretching or truncating.
8. Underfilled coverage found at this stage routes repair UPSTREAM by
   default: "repair whole-episode dialogue plan" first, per-shot rewrite
   second, because density failures are usually story-material failures
   (§7.7). The wizard's dialogue QC step (§8.8, section-12) owns this gate.

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

### 14.2 Voice Casting And Dialogue Audio Generation (voice chain, added 2026-07-08, task #15/W12)

> This subsection makes real what §14 Rule 1 ("each named character should
> have a stable voice assignment") describes only abstractly. Before this
> task, voice continuity was schema-shaped but had no UI or generation path.

Behind flag `verticalDramaSeriesVoiceChain` (F131U, §17; default off):

- a per-character voice-casting surface on the Characters tab lets a creator
  pick a voice from the existing TTS voice catalog (reusing the same voice
  source already used by the series-trailer TTS feature), preview it (a
  real, credit-charged async media-generation call, `previewCharacterVoice`,
  mirroring the same async submit/poll convention as clip generation), and
  lock the selection — this populates
  `VerticalDramaDialogueAudioPlan.voiceContinuityMap` for real instead of
  leaving it empty;
- an episode-level "generate dialogue speech for this episode" action
  (`generateEpisodeDialogueAudio`) renders every dialogue line's TTS audio
  in one batch, resumable per line (mirrors the existing per-clip video-task
  resume pattern rather than introducing a new async primitive), with
  per-line playback and status in the dialogue panel;
- the resulting per-line audio is what §12.4's dialogue-audio mixdown
  (`dialogueAudioTimeline`) consumes to build the final episode audio track.

Missing voice IDs continue to block only PAID TTS generation, not
script/storyboard planning, per §14 Rule 2 — voice chain does not change
that rule, it is the first UI that lets a user actually resolve the
missing-voice state.

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

- the `apps/web/skills/vertical-drama-*` folders listed in §10.1 — 8 from the
  original MVP wave plus 5 shipped later (13 total as of this version; see
  §10.1's shipped-folders note)

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

### 16.1 Episode Quality Review And Auto-Improve Loop (v1 shipped 2026-07-05; v2 added 2026-07-07)

> Requirement source: production feedback 2026-07-07 — story intensity and QC
> quality must rise together with dialogue density, and post-QC improvement
> must run automatically. A v1 of this loop already shipped (Phase 3B of
> `planning/vertical-drama-storyboard-complete/plan.md`); this section makes
> it spec-level contract and defines the v2 extension.

#### Shipped v1 contract (record — do not regress)

- Skill `vertical-drama-episode-quality-review` (§6.8.1) invoked by
  `runVerticalDramaEpisodeQualityReview`
  (`server/services/verticalDramaEpisodeQualityReview.ts`); LLM-only, ~20
  credit estimate, never blocks by itself — always returns a full scorecard.
- Scorecard v1: `reversal_count`, `reversal_sharpness` (1-5),
  `emotion_variety` (1-5), `dialogue_naturalness` (1-5 | null), `pacing`
  (1-5), `overall` (1-5); plus `summary`, `issues[]`
  (`{location, problem, suggested_fix}`), `warnings[]`, `repair_queue[]`.
- Router procedures on `verticalDramaEpisodes`: `runEpisodeQualityReview`
  (supports `avoidPrevious` re-review: feeds prior issues back and asks for
  DIFFERENT fixes) and `applyQualityReviewSuggestions` ("อนุมัติและปรับเรื่อง
  ตามคำแนะนำ"): groups issues by stage via
  `classifyQualityReviewIssueLocation` (`beat N` → `plan_episode_script`;
  `shot N` / unrecognized → `storyboard_shotgrid`), composes ONE combined
  Thai repair instruction per stage
  (`composeQualityReviewRepairInstruction`), calls
  `verticalDramaEpisodePipeline.repairStage(...)` script-before-storyboard,
  then auto re-runs the review once and persists it.
- Persistence: run/artifact ledger rows with stage tag
  `episode_quality_review` (append-only; latest read back by
  `getEpisodeDetail`).

#### v2 extension: thresholds, loop control, unified signals

1. **Scorecard v2 (superset, `contract_version: 2`).** Adds `hook_strength`
   (1-5), `cliffhanger_strength` (1-5), `continuity_consistency` (1-5), and
   `tie_in_naturalness` (1-5 | null when tie-in disabled). v1 fields keep
   their exact names/scales so persisted v1 artifacts stay readable.
2. **Hybrid scoring — deterministic metrics join the report.** The review
   input AND the persisted report embed the deterministic density metrics
   from §7.7.1 (`estimatedSpeechSeconds`, per-clip coverage, silent gaps,
   duplicate-line and stage-direction counts, reversal count from script
   markers, consecutive-emotion repeats). The LLM judges qualitative
   dimensions only; deterministic facts are computed in code and never
   re-estimated by the LLM. This unifies today's two disconnected signals
   (LLM scorecard vs `dialogueQuality.ts` analyzer) into one report.
3. **Quality policy (per-tenant/per-series, preset-carriable).**

```ts
type VerticalDramaQualityPolicy = {
  minOverall: number;              // default 4 (of 5)
  minPerDimension: number;         // default 3 (of 5)
  tieInMinNaturalnessScore: number;// default 70 (of 100, §13.1); regulated categories may only raise
  maxAutoImproveRounds: number;    // default 2, allowed 0-3; 0 = manual apply only
  autoRunReviewAfterStoryboard: boolean;   // default true in guided mode — the review scores
                                           // script + storyboard together (§6.8.1), so it
                                           // auto-runs once the storyboard exists
  blockPaidGenerationBelowFloor: boolean; // default true in guided mode, false in expert mode
};
```

4. **Auto-improve loop contract.** One loop round =
   `review → group → repair → re-review`, with the CANONICAL repair-group
   order declared once here and referenced everywhere else:
   `plan_episode_script` → `storyboard_shotgrid` → `dialogue_audio_plan` →
   `tie_in`. v1 shipped the first two; v2 adds `dialogue_audio_plan` as the
   third group (density issues repairable in-loop) and, when tie-in QC is
   enabled, `tie_in` as the fourth (§13.1 — rewrites scoped to
   tie-in-carrying beats/lines/shots only);
   - the loop repeats while the scorecard is below policy floors and rounds
     remain; every round's artifacts are append-only and audited, and each
     LLM call is credit-tracked with the estimate shown up-front for the
     whole loop (rounds × per-round estimate);
   - **regression guard**: if a round's re-review scores LOWER overall than
     the pre-round review, the loop stops, the pre-round artifact version
     stays the active candidate (repairs superseded, not deleted), and the
     episode escalates to `needs_human_review` with both reports visible;
   - after `maxAutoImproveRounds` without a pass the loop stops and
     escalates the same way — auto-improvement never spins unbounded;
   - the loop is LLM-only (plan_only class): it may never trigger paid
     image/video/TTS generation;
   - known v1 limitation becomes a v2 requirement: the storyboard repair
     instruction must be composed against the CURRENT (post-script-repair)
     review round, not the original review.
5. **Gate semantics.** Expert mode keeps v1 behavior (advisory scorecard,
   user decides). Guided/wizard mode (§8.8) treats a scorecard below policy
   floors as BLOCKING for every PAID step downstream of the storyboard —
   start frames first (the first paid stage), then video prompts and paid
   generation — with the loop offered as the primary unblock CTA. The
   scorecard itself requires script + storyboard (§6.8.1), so it can never
   gate the storyboard step; the deterministic density gate (§7.7.2) covers
   the script→storyboard transition instead. Tie-in gating additionally
   follows §13.1.
6. **Surfaces.** The scorecard panel shows: current scores vs policy floors,
   deterministic density metrics, loop round history (round, action taken,
   score delta), and escalation state. Every issue keeps a one-click
   prefilled repair (existing pattern).

#### Acceptance (quality loop)

- running the loop on an episode below floor either reaches the floor within
  `maxAutoImproveRounds` or escalates with both reports preserved;
- a score regression never replaces the better version;
- v1 artifacts remain readable after v2 ships;
- the loop never issues a paid media call;
- guided mode cannot reach paid video generation with a below-floor
  scorecard, expert mode can (recorded as an explicit override).

### 16.2 Season Dramaturgy Critic Workflow (added 2026-07-09, task #29)

The skill contract, model resolution, and 10 finding kinds are defined in
§6.8.2 — this subsection covers the review/apply WORKFLOW that surfaces it.

- entry point: a "วิจารณ์ซีซั่นนี้" (critique this season) action on the
  series Overview, available once at least one episode is deep-drafted
  (§8.2.3); runs as an async story job (§8.2.3) and persists as
  `lastCritique` on the series;
- `applySeasonCritique` revises only the episodes a finding names, under the
  SAME Story Lock guard (§16.3) as any other post-lock repair — a
  season-critic revision may not restructure the approved story spine;
- **regression guard**: after applying, `analyzeSeasonDramaturgy`'s 6
  deterministic checks (kinds 2-7, §6.8.2) re-run; if the revision
  introduces a NEW deterministic finding on an episode that was previously
  passing, the revision is rejected rather than accepted with a worse
  season than before;
- this is a SEASON-granularity, on-demand pass — separate from, and never
  invoked by, the per-episode §16.1 auto-improve loop or the §8.2.3 premium
  multi-round judge; none of the three change each other's behavior.

### 16.3 Story Lock (added 2026-07-08, task #19, flag F131V)

> Once a story is finalized on the series Overview (a script/storyboard has
> been approved), episode-level "improve"/"repair" actions — including the
> §16.1 auto-improve loop, the §16.2 season critic's apply step, and manual
> per-shot repairs — may change EXECUTION only (phrasing, delivery, pacing
> polish, dialogue smoothing) and may never rewrite story content (beats,
> reversals, hook, cliffhanger, plot events). This is mechanically enforced,
> not merely a policy statement.

- a deterministic post-repair guard computes similarity across beats,
  reversal count/positions, and hook/cliffhanger overlap between the
  pre-repair and post-repair script; a repair that drops the overlap below a
  **0.6** similarity floor is rejected as a story-content violation rather
  than silently accepted;
- the §16.1/§14.1 quality scorecard UI is split into two zones: a
  **story zone** (hook, reversals, escalation, cliffhanger — read-only once
  locked, with a link back to the series Overview/season-critic surface,
  which is the only place story content itself may change) and a
  **delivery zone** (dialogue naturalness, pacing polish — repairable
  in-place);
- repair action copy was renamed from language implying rewriting to
  "เกลี่ยบท / ปรับถ้อยคำ" (smooth the script / adjust phrasing) to make the
  execution-only scope explicit to the user, not just to the guard;
- flag `verticalDramaSeriesStoryLock` (F131V, §17; default off; fail-closed
  — with it off, repairs behave exactly as documented in §16.1 with no
  additional restriction).

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
verticalDramaSeriesSpeechBudget        // §7.7 density-first planning + coverage gates (2026-07-07)
verticalDramaSeriesArcReplan           // §7.7.3 arc drift detection + re-plan proposals (2026-07-07)
verticalDramaSeriesQualityLoopV2       // §16.1 scorecard v2 + auto-improve loop control (2026-07-07)
verticalDramaSeriesTieInQc             // §13.1 tie-in naturalness QC gates (2026-07-07)
verticalDramaSeriesProductionWizard    // §8.8 guided production wizard (2026-07-07)
verticalDramaSeriesPresetMixV2         // §8.2.2 preset visual identity + verifiable blending (2026-07-07)
verticalDramaSeriesDeepStoryDrafts     // F131T — §8.2.3 deep story drafts (chunked, 9-shot, speakable-dialogue) (2026-07-08)
verticalDramaSeriesVoiceChain          // F131U — §14.2 voice casting + whole-episode dialogue TTS + audio timeline handoff (2026-07-08)
verticalDramaSeriesStoryLock           // F131V — §16.3 story lock: post-lock repairs are execution-only, mechanically enforced (2026-07-08)
verticalDramaSeriesAdBannerOverlay     // F131W — §13.3 ad banner overlay: series banner studio + per-episode compositing (2026-07-08)
verticalDramaSeriesFormatProfiles      // F131X — §7.8 length-aware format profiles (ultra_short/short/standard tiers) (2026-07-08)
verticalDramaSeriesTieInReplan         // F131Y — §7.7.3/§13.1 tie-in defer -> real arc-replan proposal; also gates §13.2 (2026-07-09)
verticalDramaSeriesCharacterRefV2      // F131Z — §9.3 second character reference image (best sheet) alongside the primary portrait (2026-07-08)
verticalDramaSeriesShareLinks          // F131AA — §24 read-only series share links — RESERVED, NOT YET REGISTERED in shared/featureFlags.ts (2026-07-09, design-only)
```

2026-07-07 flag semantics: the five 2026-07-07 flags default OFF and layer on
top of shipped behavior without changing it — with them off, the shipped v1
quality loop, post-hoc dialogue analyzer, tie-in machinery, and stage-grid UX
behave exactly as today. `verticalDramaSeriesQualityLoopV2` requires
`verticalDramaSeriesSpeechBudget` (deterministic metrics feed the report).
`verticalDramaSeriesTieInQc` requires BOTH `verticalDramaSeriesSpeechBudget`
AND `verticalDramaSeriesQualityLoopV2` — a failing tie-in report's repair
path is the §16.1 loop, so tie-in QC without the loop would create blocked
states with no defined unblock. `verticalDramaSeriesProductionWizard`
requires `verticalDramaSeriesQualityLoopV2` for its gate steps.
`verticalDramaSeriesPresetMixV2` (§8.2.2) is independent — it gates preset
visual identity flow-through and synthesis v2 only, and with it off the
shipped Mix and Match behavior is unchanged.

2026-07-08/09 flag semantics (all fail-closed, default OFF, all additive over
shipped behavior with the flag off): `verticalDramaSeriesFormatProfiles`
(F131X) is read by real callers as a threaded `formatProfilesEnabled`
boolean rather than a direct flag import (keeps §7.8's module
server/client-import-free) — with it off, `analyzeSeasonDramaturgy` and the
premium judge always use their original, non-tiered formulas/constants.
`verticalDramaSeriesTieInReplan` (F131Y) gates BOTH the §7.7.3/§13.1 defer→
replan mechanism AND §13.2's season-level tie-in bootstrap/chunk-prompt/
shot-marking/critic-kind-9 behavior — with it off, tie-in placement stays
fully reactive (`evaluateFatigue` looking backward only), exactly as before
task #22/#31. `verticalDramaSeriesAdBannerOverlay` (F131W) and
`verticalDramaSeriesCharacterRefV2` (F131Z) are independent of every other
2026-07-07/08/09 flag — banners are a wholly separate layer (§13.3) and
character-ref-v2 only changes which reference images are attached to
generation (§9.3). `verticalDramaSeriesDeepStoryDrafts` (F131T) gates
whether §8.2.3's actions exist at all; `verticalDramaSeriesVoiceChain`
(F131U, §14.2) and `verticalDramaSeriesStoryLock` (F131V, §16.3) are each
independent single-purpose gates.

**Current tenant rollout** (verified directly against the `tenants` table,
`featureFlags` column, 2026-07-09): `tenant-001` and `tenant-ZCSKEM9s` both
have ENABLED — `verticalDramaSeriesAdBannerOverlay` (F131W),
`verticalDramaSeriesFormatProfiles` (F131X),
`verticalDramaSeriesTieInReplan` (F131Y),
`verticalDramaSeriesCharacterRefV2` (F131Z),
`verticalDramaSeriesDeepStoryDrafts` (F131T), and
`verticalDramaSeriesVoiceChain` (F131U) — alongside every 2026-07-07 flag and
all base-feature flags. **`verticalDramaSeriesStoryLock` (F131V) is NOT
present in either tenant's `featureFlags` JSON** — the code shipped and the
plan's progress log marks task #19 done, but the flag has not actually been
turned on for any tenant, so Story Lock enforcement (§16.3) is not yet
observable in production despite being deployed. `verticalDramaSeriesShareLinks`
(F131AA) does not exist as a registerable flag at all yet (§24 — not
implemented). Every flag DEFAULT in `shared/featureFlags.ts` itself remains
`false`; the tenant values above are runtime overrides, not code defaults.

Grandfathering rule (flags turned ON mid-series): enabling any of these
flags never retro-locks existing work. Previously completed stages,
artifacts, and approvals remain valid; gates evaluate only stage runs
STARTED after enablement. An in-flight episode continues from its current
stage — the next NEW run of a gated stage is the first thing gated. No
historical scorecard/report is required for work that predates the flag.

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
10. `section-10-ui-redesign-genre-presets-story-generation.md` (implementation record, shipped 2026-07-04)
11. `section-11-user-and-admin-preset-ownership.md`
12. `section-12-production-wizard-guided-workflow.md` (§8.8)
13. `section-13-story-dialogue-density-reform.md` (§7.7, §14.1 — added 2026-07-07)
14. `section-14-script-quality-qc-auto-improve.md` (§16.1, §13.1 loop wiring — added 2026-07-07)
15. `section-15-genre-preset-visual-identity-and-mix.md` (§8.2.2 — added 2026-07-07)
16. `section-16-ad-banner-overlay.md` (§13.3, §6.8.3 — implementation record, shipped 2026-07-08/09)

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
- speech-budget estimator determinism and coverage classification (§7.7.1: target/min/error bands per clip and per episode)
- dialogue-complete script validation (underfilled script ends `needs_repair`; per-beat `dialogue_lines[]` + `estimated_speech_seconds` present)
- per-shot speech budget derivation and persisted `sourceBeatIndexes` mapping
- visual-only shot rules (`silenceIntent` required, max 2 of 9, excluded from clip gate but counted in episode floor)
- arc drift detection triggers and `arc_replan_proposal` construction (future-episodes-only invariant)
- breakdown versioning (append-only `breakdownVersions[]`, active pointer moves, produced episodes untouched)
- quality scorecard v2 superset validation (v1 artifacts still parse; deterministic metrics embedded)
- quality policy floors and gate semantics (guided blocks, expert advisory)
- auto-improve loop: round counting, canonical repair-group order (script → storyboard → dialogue → tie_in when enabled), regression guard keeps best version, escalation after max rounds
- flag grandfathering: enabling wizard/gate flags mid-series never invalidates completed stages; gates apply only to stage runs started after enablement
- tie-in naturalness report: qualitative + deterministic merge, 0-100 mapping, pass threshold, ad-speak lexicon hits
- tie-in defer fallback updates fatigue history and raises arc re-plan when schedule breaks
- production wizard state derivation (per section-12 resolver test list, incl. new `script_qc` step and density gate reason codes)
- preset visual identity flow-through (bible → character prompts → start-frame/contact-sheet prompts → motion prompts) and deterministic visual-identity merge rules (§8.2.2)
- preset mix v2: weights, `facetAssignments` pre-pass, `blendReport` coverage per preset, deterministic blend QC gate with one corrective retry, v1 output still parseable

Integration:

- create series -> plan episode 1 dry-run -> create Storyboard Review handoff preview
- complete episode 1 -> memory update -> plan episode 2 uses prior memory
- character reference update marks storyboard/start-frame/prompt stages stale
- product tie-in rejection removes tie-in from downstream prompts
- native audio unsupported -> fallback requires visible approval
- duplicate handoff key opens existing Storyboard Review project
- final assembly manifest imports generated clips and creates pending memory update
- underfilled episode 1 script -> quality loop runs -> reaches floor or escalates with both reports preserved -> wizard unblocks video prompts only on pass
- episode with tie-in below naturalness threshold -> auto tie-in rewrite -> still failing -> defer removes placement, updates fatigue, and future planning re-places the product
- dense episode consumes future beats -> `arc_replan_proposal` raised -> approval versions the breakdown -> episode N+1 plans from the new active version

Browser/E2E:

- Dashboard menu visible only when flag is on
- create series wizard
- episode builder approval checkpoints
- production wizard: one primary CTA per state, gate steps show scorecard/coverage evidence, spot repair re-enters at earliest stale step (no full re-run)
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
5. ~~Final MP4 assembly should use the existing SmartSpecPro/Storyboard Review render-export path when available. If unavailable, the run enters `assembly_ready` with `final_episode_assembly_manifest`, concat/subtitle/audio/export metadata, and no automatic memory mutation.~~ **Superseded 2026-07-09 (task #21, spec §12.4):** rather than reusing an existing render-export path, a dedicated Node ffmpeg render graph (`verticalDramaFinalRenderGraph.ts`) was built for this feature — concat-only stays as the byte-identical regression-locked baseline, with dialogue-audio mixdown, subtitle burn-in, and ad-banner compositing added on top. `assembly_ready` (deterministic inputs present, render not yet executed) remains a valid intermediate state, but "final render is unavailable" is no longer the expected steady state — it is now available and shipped.

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

Production-grade upgrade acceptance (2026-07-07 — all six must hold with the
§17 upgrade flags on):

- A 60-second episode plans and passes with ~35-50 seconds of estimated
  speech; no speaking clip sits below the error coverage floor; density is a
  generation INPUT (bible `contentBudget`, dialogue-complete script,
  duration-aware first-pass prompts), not only a post-hoc gate.
- Adding story material to one episode cannot silently corrupt the season:
  material drift raises an `arc_replan_proposal`, produced episodes stay
  immutable, and the next episode plans from the approved active breakdown
  version.
- The guided production wizard is the primary episode path: one primary CTA,
  quality/density gates as visible steps, per-target spot repair with stale
  propagation only (never a full rebuild), expert stage surface still
  reachable.
- The quality loop measures intensity (hook, reversals, escalation,
  cliffhanger, continuity) plus deterministic density metrics, auto-improves
  up to policy rounds with a regression guard, and escalates with evidence
  instead of spinning.
- A tie-in episode ships only with a passing naturalness report (>= 70) or a
  recorded human override (non-regulated only); failed placements defer with
  fatigue/schedule bookkeeping instead of shipping forced ads.
- A series created from a `sci_fi_mecha`-family preset carries its visual
  identity to pixels (character refs, start frames, motion prompts), and a
  mixed preset's `blendReport` proves every selected preset contributed to
  at least `minFacetsPerPreset` facets (§8.2.2).

---

## 23. Production-Grade Upgrade Traceability (2026-07-07)

Requirement-to-spec mapping for the five production-feedback requirements.
The completeness audit for this upgrade lives in
`reviews/production-grade-upgrade-audit-2026-07-07.md`.

| # | Requirement (2026-07-07 feedback) | Spec sections | Section files | Key contracts |
|---|---|---|---|---|
| 1 | Dialogue continuity/density: eliminate silent gaps by reforming story planning top-down (bible → episode → shots), with safe cross-episode propagation | §7.7 (ladder, budget, arc re-plan), §6.1, §6.6, §14.1, §7.6 (new memory kinds) | section-13; section-04/07 interplay | `dialogueQuality.ts` constants, `VerticalDramaEpisodeContentBudget`, `VerticalDramaPerShotSpeechBudget`, `arc_replan_proposal`/`arc_replan_applied`, `breakdownVersions[]` |
| 2 | Wizard-guided flow (no memorized step order) that still allows spot fixes without rebuilding | §8.8, §8.2 (series wizard, unchanged) | section-12 (updated), section-13/14 gates | `VerticalDramaProductionWizardStep` (+ `script_qc`), stale propagation table, `verticalDramaSeriesProductionWizard` |
| 3 | Story intensity + better QC + automatic post-QC improvement | §16.1 (v1 record + v2 loop), §6.8.1 | section-14 | scorecard v2, `VerticalDramaQualityPolicy`, auto-improve loop w/ regression guard, `runEpisodeQualityReview` / `applyQualityReviewSuggestions` |
| 4 | Production-grade tie-in seamlessness with measured script quality | §13.1, §16.1 (tie_in dimension), §6.7 | section-08 (updated), section-14 | `VerticalDramaTieInQualityReport`, naturalness >= 70 gate, defer fallback, visual grounding QC |
| 5 | Sci-fi/mecha aesthetic presets that reproduce the look end-to-end + verifiably real preset blending (2026-07-07, with reference images) | §8.2.2, §17 | section-15 | `VerticalDramaPresetVisualIdentity`, flow-through rule, `sci_fi_mecha` seed family, mix v2 weights + `blendReport` + deterministic blend QC gate |

Cross-requirement invariants:

- every new gate is flag-layered (§17) and additive — shipped v1 behavior is
  the flags-off baseline;
- every automated rewrite is append-only, audited, credit-tracked, LLM-only;
- every blocking state names its unblock repair and the wizard surfaces it.

### 23.1 Post-Upgrade Deltas Traceability (2026-07-08 to 2026-07-09)

Requirement-to-spec mapping for tasks shipped after the 2026-07-07 upgrade
above. Ground truth for this table: `planning/vertical-drama-production-grade-upgrade/plan.md`
progress log, `planning/vertical-drama-ad-banner-overlay/plan.md`,
`planning/vertical-drama-tie-in-replan/plan.md`, and direct code/DB
verification (feature flag file, schema.ts, tenant `featureFlags` rows).

| Task | Delta | Spec sections | Flag | Status (2026-07-09) |
|---|---|---|---|---|
| #28 | Async story-job plumbing (submit/enqueue/poll) for the 4 story mutations | §8.2.3 | (mechanism only — gated by each action's own flag) | Deployed |
| #10/W10-W11 | Deep story drafts + premium multi-round mode | §8.2.3 | `verticalDramaSeriesDeepStoryDrafts` (F131T) | Deployed, enabled both tenants |
| #29 | Season dramaturgy critic skill + workflow, 10 finding kinds | §6.8.2, §16.2 | (rides `verticalDramaSeriesDeepStoryDrafts`, no dedicated flag) | Deployed |
| #23 | Length-aware format profiles | §7.8 | `verticalDramaSeriesFormatProfiles` (F131X) | Deployed, enabled both tenants |
| #22 | Tie-in aware deep story drafts | §13.2 | `verticalDramaSeriesTieInReplan` (F131Y) | Deployed, enabled both tenants |
| #31 | Tie-in defer → real arc-replan proposal | §7.7.3, §13.1 (already updated in-flight) | `verticalDramaSeriesTieInReplan` (F131Y) | Deployed, enabled both tenants |
| #30 | Ad banner overlay (studio + per-episode + compositing) | §6.8.3, §13.3, §12.4 | `verticalDramaSeriesAdBannerOverlay` (F131W) | Deployed, enabled both tenants |
| #26 | Beyond-plan sanity | §11.8 | (no dedicated flag — always-on guard) | Deployed |
| #21 | Final render suite (mixdown, subtitle burn-in, banner compositing, batch render) | §12.4 | (no dedicated flag — reads §14.2/§13.3 flags for optional inputs) | Deployed |
| #27-A | Character reference resolution v2 | §9.3 | `verticalDramaSeriesCharacterRefV2` (F131Z) | Deployed, enabled both tenants |
| #15/W12 | Voice casting + dialogue audio generation | §14.2 | `verticalDramaSeriesVoiceChain` (F131U) | Deployed, enabled both tenants |
| #19 | Story Lock | §16.3 | `verticalDramaSeriesStoryLock` (F131V) | Deployed, **NOT enabled on any tenant** (verified against `tenants.featureFlags`) |
| #20 | Editable draft dialogue | §8.2.3 (implicit — draft editing UI) | rides `verticalDramaSeriesDeepStoryDrafts` | Deployed |
| #32 | Read-only series share links (Collab-lite L1) | §24 | `verticalDramaSeriesShareLinks` (F131AA) — reserved name only | **NOT implemented** — design-only |

Known small debts closed in the same waves (not previously spec-documented
at all, so nothing above needed correcting — noted here only so this spec
now covers them going forward): the production wizard's `videoPrompts.stale`
input is a real artifact-timestamp signal computed from
`verticalDramaRunArtifacts` (storyboard newer than the motion-prompt pack =
stale), not the internal placeholder it started as (that framing lived only
in code comments / the implementation plan log, never in this spec);
job-finish notifications exist for the async story jobs (§8.2.3); premium
deep-draft mode is selectable at series bootstrap, not only after creation
(§8.2.3).

---

## 24. Collaboration — Read-Only Series Share Links (Collab-lite L1) (proposed 2026-07-09; NOT YET IMPLEMENTED)

> Status flag for this entire section: **PROPOSED / DESIGN-LOCKED, NOT ON
> DISK.** Verified 2026-07-09: no `vertical_drama_series_share_links` table
> in `apps/web/drizzle/schema.ts`, no `verticalDramaShare` router, no
> `createSeriesShareLink`/`SeriesShareLink` symbol anywhere in
> `apps/web`, and no `verticalDramaSeriesShareLinks` flag registered in
> `shared/featureFlags.ts`. The only artifact that exists is the design
> document this section summarizes: `planning/vertical-drama-share-links/plan.md`
> (owner-approved 2026-07-09, "ทำให้เลย"). This section exists so a future
> developer implementing task #32 has the agreed design in the spec, not
> only in a planning doc, and so nobody mistakes the ABSENCE of code for an
> undocumented gap.

### 24.1 Scope And Principle

Read-only, Google-Docs-view-only-style share links for a series — NOT
real-time co-editing. Scoped down deliberately from a fuller "collaborator"
model because ownership checks are currently scattered across ~40 call sites
in the episodes router with no centralized authorization layer; rather than
retrofit all 40, this design adds one narrow, easy-to-audit READ path:
one new table, one public (unauthenticated) procedure, one viewer page. Full
co-editing is an explicitly separate, later phase.

Whitelist projection is the core safety property: a share-link viewer must
see ONLY story content. Credits/pricing/cost, provider/model IDs, API
config, any user's email/name, tenant settings, `forbiddenClaims`, and
internal IDs beyond what the viewer UI needs are never included in the
response shape — this is an allow-list projection (explicit fields listed
in the DTO), not a deny-list redaction of a full row.

### 24.2 Proposed Schema

New table (would require the standard Database Safety Protocol backup/verify
cycle at implementation time — not yet run):

```text
vertical_drama_series_share_links
  id serial PK
  tenantId varchar
  seriesId int (FK -> vertical_drama_series, cascade)
  createdByUserId int
  tokenHash varchar(64) UNIQUE       -- SHA-256 of the raw token; raw token NEVER stored
  scope varchar default 'series_read'
  expiresAt timestamptz NOT NULL
  revokedAt timestamptz NULL
  createdAt timestamptz default now()
  lastAccessedAt timestamptz NULL
  accessCount int default 0
  -- + index on tokenHash
```

Token handling follows the SAME pattern this codebase already uses for
`opencode_api_keys.key_hash`: a 32-byte random token is base64url-encoded,
shown to the creating user EXACTLY ONCE at creation time, and only its
SHA-256 hash is ever persisted. A dead link (expired or revoked) and an
unknown token both return the SAME generic error ("ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว")
so the endpoint cannot be used to enumerate valid tokens.

### 24.3 Proposed API

Owner-side mutations (on the existing `verticalDramaSeries` router,
ownership-scoped like every other mutation on that router):

- `createSeriesShareLink({ seriesId, expiresInDays: 7 | 30 })` → generates
  the token, stores only its hash, returns `{ url, expiresAt }` ONCE;
- `listSeriesShareLinks({ seriesId })` → metadata only (created/expires/
  access count/revoked state) — never the token or its hash;
- `revokeSeriesShareLink({ seriesId, linkId })` → sets `revokedAt`;
- hard cap: 5 active links per series.

Public (unauthenticated) query, on a new `verticalDramaShare` router:

- `verticalDramaShare.getSharedSeries({ token })` → hashes the token, looks
  up the row, checks `expiresAt`/`revokedAt` server-side on EVERY request,
  bumps `accessCount`/`lastAccessedAt`, applies the same rate limiter this
  codebase already uses for other public/login endpoints, and returns the
  whitelist DTO: series `{ title, genre, tone, plannedEpisodeCount }`,
  overview `{ logline, mainPlot, seasonArc }`, `episodes[]` `{ episodeNumber,
  title, status (coarse: draft/scripted/has-video), logline }`, with an
  optional per-episode dialogue-text-only view (no image/video prompts ever
  exposed).

### 24.4 Proposed Client

- series detail page: a "แชร์" (share) button opens a dialog to create a
  link (choose 7 or 30-day expiry), shows the URL with a copy button and a
  "this link will not be shown again" warning, and lists existing links with
  a revoke action;
- a new unauthenticated route `/share/vd/:token` (same "route bypasses auth"
  pattern already used by `/login`/`/signup`) renders the read-only viewer:
  title, overview, episode list, Thai status chips, a persistent "มุมมองผู้เยี่ยมชม
  (อ่านอย่างเดียว)" banner, no action buttons of any kind, and a clear dead-link
  error state.

### 24.5 Rollout (proposed)

Flag `verticalDramaSeriesShareLinks` (F131AA) would gate the owner-side
share button; the public viewer route would itself check for the link row's
existence rather than the flag (since a link can only be CREATED while the
flag is on, this still fully controls exposure at the source). A dedicated
read-only security review (token handling, projection leak surface, rate
limiting, tenant isolation of the public path) is planned BEFORE deploy, per
the design doc.

### 24.6 Acceptance (once implemented)

- creating a link never stores the raw token, only its hash;
- an expired, revoked, or unknown token all produce the identical generic
  error;
- the public DTO contains none of the forbidden fields (asserted by an
  explicit absence test list, not just "looks right");
- at most 5 active links per series; revoking a link takes effect
  immediately (no caching window);
- owner-side mutations enforce series ownership identically to every other
  mutation on `verticalDramaSeries`.
