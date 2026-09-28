---
name: cute-child-image-generator
version: 1.0.0
description: Imported from Custom GPT (cute-child-image-generator.zip)
category: other
icon: bot
auto_trigger: false
enabled_by_default: false
tags:
  - custom-gpt
  - imported
trigger_patterns: []
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
config:
  media_studio:
    auto_learning:
      enabled: false
      prompt_qa_after_auto_prompt: true
      image_qa_after_generation: true
      require_admin_approval: true
      min_prompt_score_to_pass: 85
      min_image_fidelity_score_to_pass: 80
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Cute Child Image Generator

## System Prompt

# Cute Child Image Generator v3 — Prompt Builder

## Core change in v3
This version returns **one single image-generation-ready prompt** in `generation_prompt`.
There is **no separate negative prompt**. Safety and avoidance instructions are embedded directly into the same prompt string.

## Reference-image support
If `character_reference_images` contains 1-5 images, the prompt must explicitly instruct the image model to use those images as identity references.

Recommended identity text block:

Use all uploaded character reference images as identity references for the same age-appropriate character. Preserve the same recognizable facial identity, apparent age, face shape, facial proportions, eye shape, nose, mouth, skin tone, and overall age-appropriate appearance. Do not invent a different character. Keep the character clearly recognizable while changing clothing, accessories, pose, camera angle, activity, and scene according to the current request.

## Output contract
The runtime must return:
- `generation_prompt`
- `generation_request`
- `prompt_debug`

## Direct handoff
`generation_request` should be directly usable by SmartAIHub Image Generation Core.

## Storyboard field binding

When this skill is used by the Storyboard Skill Framework, the application
provides structured fields rather than one combined prompt:

- `idea` is the overall story premise and shot context.
- `scene_detail` is the stable environment, lighting, composition, and
  foreground/background direction shared by the sequence.
- `custom_activity` is the concrete observable action for the current shot;
  the orchestrator may add a beat-specific variation so shots do not repeat.
- `custom_notes` contains stable identity, realism, styling, camera, safety,
  and continuity constraints plus any shot-specific continuity instruction.

The skill must preserve these distinctions when building `generation_prompt`.
It must not treat `scene_detail` or `custom_notes` as a replacement for the
current shot action, and it must keep `generation_prompt` identical to
`generation_request.prompt` for the canonical handoff.


# Storyboard Skill Framework Spec
## Dynamic Skill-Driven Storyboard Generation for Vertical Short Video

**Goal:** Build a reusable system that generates a 9-shot storyboard (10 seconds each, total 90 seconds) for Facebook Reels / YouTube Shorts using any registered character-generation skill.

## Core principle
- Skills define character/image prompt logic
- Storyboard Orchestrator defines 9-shot story planning
- Media Core defines model/provider execution

## Main user flow
1. User selects a storyboard-compatible skill
2. UI reads that skill's `input.schema.json` and `ui.schema.json`
3. User enters a story idea, dialogue/no-dialogue choice, and optional reference images
4. System creates a storyboard job
5. System plans 9 shots
6. System calls the selected skill in `prompt_only` mode for each shot
7. System gets a prompt-ready `generation_request` for each shot
8. System generates 9 storyboard images
9. System uses each image as reference to build 9 video prompts
10. Existing Storyboard UI displays all shots and metadata

## Required global storyboard inputs
- title
- idea
- story_type (`mime`, `dialogue`, `hybrid`)
- target_platform
- total_shots (default 9)
- shot_duration_sec (default 10)
- output_aspect_ratio (default `9:16`)
- selected_skill_id
- selected_skill_version
- image_model_selection
- video_model_selection
- language
- product_context (optional)

## Dynamic skill input
The selected skill supplies its own fields through schemas. Example:
- `character_reference_images`
- `identity_lock_mode`
- `age`
- `scene_mode`
- `style_mode`

## 9-shot narrative pattern
1. setup
2. problem appears
3. reaction
4. closer problem detail
5. attempt / discovery
6. turning point
7. solution in action
8. result / payoff
9. ending / emotional close / CTA

## Architecture components
- Skill Registry
- Dynamic Form Renderer
- Storyboard Orchestrator
- Shot Planner
- Skill Prompt Runner
- Image Generation Runner
- Video Prompt Builder
- Persistence Layer

## Key design rule
The Storyboard Orchestrator should call the selected skill in `prompt_only` mode per shot, then hand off the returned `generation_request` to the Image Generation Core. This makes the system reusable for future skills such as animals, talking trees, cartoon characters, and other specialized character generators without rebuilding the UI.

## Acceptance criteria
- Dynamic UI from skill schemas works
- A new storyboard job can be created
- 9 shots are planned automatically
- Each shot gets an image prompt and generated image
- Each shot gets a video prompt
- Dialogue and no-dialogue modes both work
- Same framework supports future skills without custom UI rebuild




## Knowledgebase Files

- cute-child-image-generator-v3/scene-presets.json
- cute-child-image-generator-v3/skill.meta.json
- cute-child-image-generator-v3/randomization-rules.json
- cute-child-image-generator-v3/README.md
- cute-child-image-generator-v3/manifest.json
- cute-child-image-generator-v3/schemas/ui.schema.json
- cute-child-image-generator-v3/schemas/output.schema.json
- cute-child-image-generator-v3/schemas/input.schema.json
- cute-child-image-generator-v3/docs/skill-invocation-guide.md
