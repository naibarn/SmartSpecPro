# section-01-skill-packages

## Goal

Create the eight Vertical Drama skill packages under `apps/web/skills`, preserving the pinned GitHub guide contracts while adapting them to SmartSpecPro's existing skill registry.

## Depends On

- Pinned external guide: `naibarn/vertical-drama-video-flow` at `e2dbef07d07447489d041112d862d994adeac5d4`
- Existing skill registry conventions in `apps/web/server/services/skillRegistry.ts`

## Files

Create:

- `apps/web/skills/vertical-drama-script-builder/`
- `apps/web/skills/vertical-drama-character-visual-bible/`
- `apps/web/skills/vertical-drama-storyboard-shotgrid/`
- `apps/web/skills/vertical-drama-shot-start-frame-render/`
- `apps/web/skills/vertical-drama-video-motion-prompt-pack/`
- `apps/web/skills/vertical-drama-series-memory-planner/`
- `apps/web/skills/vertical-drama-product-tie-in-planner/`
- `apps/web/skills/vertical-drama-dialogue-audio-planner/`

> **Shipped later (verified on disk 2026-07-09, out of this section's
> original MVP scope but listed here so this file stays a trustworthy skill
> inventory):** `apps/web/skills/vertical-drama-episode-quality-review/`
> (spec §6.8.1), `apps/web/skills/vertical-drama-season-dramaturgy-critic/`
> (spec §6.8.2, task #29), `apps/web/skills/vertical-drama-ad-banner-prompt/`
> (spec §6.8.3, section-16, task #30), plus
> `apps/web/skills/vertical-drama-preset-synthesizer/` and
> `apps/web/skills/vertical-drama-shot-video-prompt/` (both predate this
> spec sync pass). 13 skill folders exist on disk in total as of this
> version.

Modify only if compatibility gaps are found:

- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/services/__tests__/skillRegistry.test.ts` or adjacent skill registry tests

## Required Package Shape

Each skill directory must include:

- `SKILL.md`
- `skill.md`
- optional `skill.json` for imported guide manifest parity
- `prompts/system.prompt.md` or a lossless equivalent embedded in `SKILL.md`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json`
- `references/input_contract.md`
- `references/output_contract.md`
- `references/maintenance.md`
- `fixtures/` with pass/fail examples
- `examples/example.input.th.json`
- `examples/example.output.sample.json`
- `tests/tests.json`
- `scripts/verify.sh`
- `help/help.th.md`
- `help/help.en.md`

### Skill Metadata Defaults

Each `skill.md` frontmatter must pin the SmartSpecPro metadata defaults so packages never auto-trigger and never bill by surprise. The full default block:

```yaml
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
```

Skills must not auto-trigger from normal chat by default; the series builder invokes them explicitly through the episode pipeline.

## Imported Guide Parity

Imported skills:

- `character-visual-bible-skill` -> `vertical-drama-character-visual-bible`
- `storyboard-shotgrid-skill` -> `vertical-drama-storyboard-shotgrid`
- `shot-start-frame-render-skill` -> `vertical-drama-shot-start-frame-render`
- `video-motion-prompt-pack-skill` -> `vertical-drama-video-motion-prompt-pack`

Preserve:

- `skill.json` fields: `name`, `display_name`, `display_name_th`, `version`, `description`, `description_th`, `entry_prompt`, `input_schema`, `ui_schema`, `output_schema`, `help_files`, `examples`, `capabilities`
- upstream names: `character_visual_bible_builder`, `storyboard_shotgrid_generator`, `shot_start_frame_render_planner`, `video_motion_prompt_pack_builder`
- upstream capabilities: `plain_text_output`, `json_handoff`, `bilingual_ui`, `character_consistency_focused`, `character_reference_driven`, `fixed_duration_60_seconds`, `fixed_grid_3x3`, `fixed_shot_count`, `shots_per_batch`, `vertical_start_frames`, `repair_queue`, `shot_start_frame_references`, `provider_agnostic`, `openai_sora_safe_mode`, `assembly_manifest`, `veo31_first`, `openai_sora_primary = false`
- imported top-level output fields: `visual_bible_summary`, `characters`, `plain_text_summary`, `storyboard_attachment_manifest`, `storyboard_summary`, `canonical_style_bible`, `shot_grid_plan`, `shots`, `plain_text_storyboard`, `storyboard_handoff_json`, `render_plan_summary`, `start_frame_requests`, `plain_text_render_plan`, `downstream_video_input_manifest`, `quality_control`, `video_plan_summary`, `provider_feasibility`, `video_clip_requests`, `plain_text_video_plan`, `final_episode_assembly_manifest`, `repair_loop`
- nested schema fields: `file_id`, `image_url`, `local_path`, `contains_human_face`, `openai_input_reference_allowed`, `external_image_to_video_request`, `veo31_request`, `reference_images`, `generate_audio`
- config/manifest parity terms: `default_flow`, `duration_profile_default`, `veo31_first_last_bridge_60s`, `video_provider_default`, `veo_3_1`, `important_openai_video_note`, `model_for_planning`, `image_provider`, `image_model`, `veo31_model`, `duration_profile`, `video_prompt_skill_dir`, `removed_active_video_providers`, `openai_sora`, `openai_videos`

`vdflow validate` maps to each skill's `scripts/verify.sh`, schema validation fixtures, and app skill-registry tests. No skill verify path may call paid image/video/TTS providers.

### Imported Input Enum-Vocabulary Round-Trip

Each of the four imported skills must ship at least one `fixtures/` round-trip case that exercises the upstream input enum vocabulary and asserts it survives normalization into `input.normalized.json` without loss:

- character-visual-bible: `style_preset` values (e.g. `cinematic_romance`, `luxury_melodrama`), `workflow_level` (`guided`/`simple`/`custom`), `rendering_profile`, `target_realism`, `target_age_group`.
- storyboard-shotgrid: `style_preset`, `view_type` (e.g. `close_up`, `medium`, `wide`, `over_the_shoulder`), `workflow_level`, `target_shot_mix`.
- shot-start-frame-render: `render_target`, `quality_bar`, `reference_image_policy`, `external_image_provider`, `workflow_level`.
- video-motion-prompt-pack: `clip_duration_strategy`, `motion_style`, `veo31_policy`, `video_target`, `workflow_level`.

App-only fields must live in a SEPARATE metadata namespace (never merged into the imported input object) so imported schemas are not corrupted, and the fixture must round-trip both the upstream enum values and the app-only namespace independently.

### Nested Imported Output Field Fixtures

Beyond top-level fields, imported-parity fixtures must assert the pinned nested GitHub output fields and literal constraints:

- storyboard-shotgrid: each shot `camera` object preserves `shot_type`, `angle`, `lens_feel`, `movement`, `composition`; `shot_grid_plan.layout = "3x3"`; `storyboard_handoff_json.handoff_type = "storyboard_shot_prompts"`.
- character-visual-bible: `storyboard_attachment_manifest.handoff_type = "character_reference_package"`.
- shot-start-frame-render: `render_plan_summary.shot_count = 9`; each `render_parameters` object preserves `provider_mode`, `model`, `size`, `quality`, `n`; downstream manifest includes `rendered_frame_slots`.
- video-motion-prompt-pack: `video_plan_summary.duration_seconds = 60`; `final_episode_assembly_manifest.handoff_type = "video_assembly_manifest"` with `target_duration_seconds = 60`.

### Provider Status Normalization

The upstream `provider_request` execution statuses (`ready`, `blocked`, `fallback_text_to_video`, `manual_review_required`, `external_provider_required`) must be retained raw in persisted metadata. SmartSpecPro normalizes the raw `fallback_text_to_video` status to the UI status label `fallback_prompt_only`, storing BOTH the upstream raw status and the normalized app status. A fixture must assert this dual-write mapping.

### Sub-Shot Decomposition Output (Feature-Flagged)

The `vertical-drama-video-motion-prompt-pack` skill's `schemas/output.schema.json` adds an optional top-level `sub_shot_plan` (per §7.4 Sub-Shot Decomposition), populated only when `verticalDramaSeriesSubShots` is enabled and omitted (or empty) when the flag is off. It preserves upstream-style snake_case field names:

- `sub_shot_plan`: per main shot, the resolved sub-shot count, and for each sub-shot its `duration_seconds`, `camera_setup`, `prompt`, and `transition_in`, plus the feasibility/degrade decisions (whether the requested count was honored, reduced, or fell back to a single parent clip).
- Sub-shot fields on `video_clip_requests`: `parent_shot_number` and `sub_shot_number` identify a clip as a sub-shot of a decomposed main shot; a non-decomposed clip omits these or sets `sub_shot_number = null`.

The field is additive and optional, so imported-parity schemas and existing clip-request contracts remain valid when the flag is off.

## SmartSpecPro-Only Skills

Create:

- `vertical-drama-script-builder`: episode script, hooks, act/beat structure, character deltas, tie-in plan, warnings.
- `vertical-drama-series-memory-planner`: canonical facts, prior episode summaries, unresolved/resolved hooks, compact memory.
- `vertical-drama-product-tie-in-planner`: story function, claims guard, product reference requirements, fatigue history.
- `vertical-drama-dialogue-audio-planner`: dialogue, speaker mapping, voice continuity, subtitle cues, native audio and separate TTS plan. Its input contract must pin the `audio_strategy` enum to exactly `separate_tts_voiceover`, `native_video_audio`, `dialogue_tts`, or `silent`. No paid audio/TTS is produced during verify.

All skills must output structured JSON only.

## Schema Validation & Debug Contract

Every skill output must validate against its `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed schema validation creates a repair request, not a silent continue.

Validation errors must carry enough debug information to repair the stage:

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

Raw model outputs may be stored only in tenant-owned debug artifacts under normal retention/redaction controls. Repair prompts may include validation summaries, `schema_path`, and compact `instance_snippet` snippets, but never chain-of-thought, full signed URLs, or provider secrets.

## UI/UX Contract

### Target User / JTBD

- Role: creator/operator indirectly using generated skill outputs.
- Goal: receive structured plans and prompts that the Dashboard can present for review.
- Entry point: episode stage runner.
- Success outcome: skill outputs are reviewable as prompts, warnings, and repair actions.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Dashboard stage output | episode workspace | consumes skill summaries and warnings |
| Skill admin/debug views | existing skill surfaces | show skill metadata if present |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Skill package files | `apps/web/skills/vertical-drama-*` | schemas/prompts/help | stage runner |
| Stage UI | section 03/04 components | display only | skill output summaries |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | stage runner shows skill executing | section 04/UI tests |
| empty | missing skill blocks with clear reason | registry test |
| error | schema validation error shown as repairable | service/UI tests |
| success | structured summary displayed | section 04 tests |
| disabled/focus/hover | N/A backend package work; UI owned by section 03/04 | N/A |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | N/A direct package UI | section 03/04 evidence |
| tablet 768x1024 | N/A direct package UI | section 03/04 evidence |
| desktop 1440x900 | N/A direct package UI | section 03/04 evidence |

### Accessibility Acceptance

- Skill output warnings must include stable text reason codes.
- Help files must have Thai and English titles.

### Copy Contract

- Skill help and user-facing stage summaries support Thai and English.
- Validation errors must avoid raw schema jargon where surfaced to users.

### Browser Evidence Required

Indirect. Covered by section 03/04 Dashboard evidence and section 06 Storyboard Review evidence.

## Tests First

Write tests before implementation:

- Test: registry loads all eight skill packages.
- Test: every package has required files and `auto_trigger: false`.
- Test: every package frontmatter pins the metadata defaults `category: video_prompt_generation`, `execution_mode: llm-only`, `enabled_by_default: false`, `credit_multiplier: 1`, `strict_provider_pin: false`, and `contract_version: 1`.
- Test: imported manifests preserve all required fields and names.
- Test: imported capabilities round-trip without lossy display-label mapping.
- Test: input and output schemas parse.
- Test: imported top-level output fields exist for all four guide skills.
- Test: imported top-level output fields preserve exact upstream snake_case names, including `storyboard_handoff_json`, `downstream_video_input_manifest`, `provider_feasibility`, `final_episode_assembly_manifest`, and `repair_loop`.
- Test: nested upstream snake_case fields round-trip.
- Test: minimal upstream input fixtures accept `story_title`, `story_brief`, `duration_seconds`, `episode_count`, `characters`, `character_id`, and `age_control`.
- Test: runtime config fixtures preserve guide defaults such as `model_for_planning = gpt-5.5`, `image_model = gpt-image-2`, and `image_size = 1024x1536`.
- Test: `scripts/verify.sh` runs without provider credentials.
- Test: app-safe `vdflow validate` equivalent runs verify scripts and schema fixtures without live provider calls.
- Test: each imported skill round-trips its upstream input enum vocabulary (e.g. `style_preset`=`cinematic_romance`/`luxury_melodrama`, `view_type`, `workflow_level`, `rendering_profile`) into `input.normalized.json` without loss, and app-only fields stay in a separate metadata namespace.
- Test: nested imported output fixtures preserve the `camera` object (`shot_type`/`angle`/`lens_feel`/`movement`/`composition`), `render_parameters` (`provider_mode`/`model`/`size`/`quality`/`n`), `rendered_frame_slots`, and the literal constraints `layout="3x3"`, `shot_count=9`, `duration_seconds=60`, plus the `handoff_type` constants.
- Test: provider status normalization dual-writes the raw upstream `fallback_text_to_video` and the normalized UI label `fallback_prompt_only`.
- Test: the motion-prompt-pack skill fixture round-trips `sub_shot_plan` — present with per-shot resolved counts and each sub-shot's `duration_seconds`/`camera_setup`/`prompt`/`transition_in` when `verticalDramaSeriesSubShots` is enabled, and absent/empty when disabled — and the clip-request `parent_shot_number`/`sub_shot_number` fields preserve their exact snake_case names.
- Test: a schema failure produces a `VerticalDramaValidationErrorReport`, opens a repair request (no silent continue), and writes a raw-output debug artifact with secret redaction applied.
- Test: missing required skill blocks the episode pipeline with a clear error.

## Implementation Tasks

1. Copy/adapt the four imported guide skill contracts into SmartSpecPro package layout.
2. Add four SmartSpecPro-only skills with schemas and fixtures.
3. Add contract versions to schema metadata and skill metadata.
4. Add fixture tests that prove imported guide parity.
5. Add deterministic pass/fail fixtures and verify scripts.
6. Preserve raw upstream snake_case in stored artifacts while exposing camelCase projections in shared app types where needed.
7. Add input adapter fixtures proving UI fields normalize into upstream-compatible `input.normalized.json`.
8. Add app-safe `vdflow validate` equivalent through verify scripts/test commands.
9. Update skill registry only if current loader cannot discover the required files.

## Acceptance

- All eight skills are discoverable through existing skill registry.
- All imported guide schema and manifest parity checks pass.
- All verification scripts pass locally without provider credentials.
- Skill outputs include stable contract version and required top-level JSON fields.
- No skill invokes live image/video/audio providers during tests.

## Verification

```bash
cd apps/web && pnpm test -- skillRegistry
find apps/web/skills -path '*vertical-drama-*' -name verify.sh -exec sh {} \;
cd apps/web && pnpm check
```
