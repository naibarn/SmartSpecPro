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
