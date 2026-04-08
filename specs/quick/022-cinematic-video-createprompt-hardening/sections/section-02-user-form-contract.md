# Section 02: User Form Contract

## Goal
Create a user-facing input contract that works inside the SmartSpecPro dynamic form system and feels approachable to non-technical users.

## Deliverables
- New `input.schema.json`
- New custom `ui.schema.json`
- Updated examples

## Key details
- Use selects for cinematic presets and stylistic choices.
- Use textareas for descriptive creative intent.
- Use `reference_images` for up to 4 images with plain-language notes.
- Use optional `scene_beats` for simple sequence planning without a complex shot grammar.

## Risks
- UI field IDs must stay in lockstep with schema property names.
- The array UI should stay lightweight and text-oriented so it works with current form support.
