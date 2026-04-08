# Implementation Plan

## Objective
Turn `cinematic-video-createprompt` into a high-quality cinematic prompt-building skill that general users can understand quickly while still giving the model enough structure to write strong video prompts.

## Approach
1. Rewrite the skill instructions so they behave like a cinematic prompt director, not a provider-internal config translator.
2. Replace the technical input contract with a clearer, flatter schema built around:
   - idea / prompt goal
   - subject / setting / action
   - cinematic style selects
   - optional scene beats
   - optional reference images
   - simple guardrail notes
3. Add a real custom `ui.schema.json` with sections, Thai labels, selects, images support, and a lightweight scene-beat array.
4. Refresh examples and output schema so the skill package looks coherent end to end.

## Affected files
- `apps/web/skills/cinematic-video-createprompt/SKILL.md`
- `apps/web/skills/cinematic-video-createprompt/skill.md`
- `apps/web/skills/cinematic-video-createprompt/schemas/input.schema.json`
- `apps/web/skills/cinematic-video-createprompt/schemas/ui.schema.json`
- `apps/web/skills/cinematic-video-createprompt/schemas/output.schema.json`
- `apps/web/skills/cinematic-video-createprompt/example.input.json`
- `apps/web/skills/cinematic-video-createprompt/example.output.json`

## Contract redesign
- Keep only the most useful user-facing fields as top-level inputs.
- Convert suitable creative controls into selects:
  - generation mode
  - language
  - aspect ratio
  - scene arc
  - visual style
  - mood
  - camera movement
  - shot composition
  - lens look
  - lighting style
  - color palette
  - editing rhythm
- Use plain textareas for nuanced creative details:
  - prompt goal
  - main subject
  - setting
  - action
  - dialogue / on-screen text
  - must include
  - avoid / guardrails
  - additional notes

## Reference image support
- Add `reference_images` as an optional array with up to 4 items.
- Add `reference_image_notes` so users can explain what each image should guide:
  - character identity
  - wardrobe / product details
  - environment
  - composition / mood
- Keep image handling generic enough for uploads, URLs, and internal asset paths.

## UI strategy
- Use custom section-based UI schema because the current router supports that format directly.
- Keep the form organized into:
  - brief
  - story
  - cinematic look
  - references
  - guardrails

## Acceptance criteria
- The skill prompt text describes a cinematic prompt-writing workflow rather than provider-native reference syntax.
- The input schema is readable for general users and uses clear descriptions and titles.
- The app-visible form supports `reference_images` up to 4 and guided selects for key cinematic controls.
- Examples reflect the new contract.
- No stale Seedance/WaveSpeed terminology remains in the skill package.
