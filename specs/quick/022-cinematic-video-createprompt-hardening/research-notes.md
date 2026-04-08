# Research Notes

## Codebase scan
- `apps/web/server/routers/skills.ts` only treats `ui.schema.json` as usable when it contains a custom `sections` format.
- If `ui.schema.json` is missing that format, the router falls back to converting `input.schema.json`.
- The converter skips arrays and nested objects, so rich structures in plain JSON Schema do not become usable form fields automatically.

## Current skill issues
- The current skill prompt is framed as a Seedance 2.0 / WaveSpeed-specific builder rather than a cinematic prompt-writing assistant.
- The current input contract is powerful but too technical for general users:
  - `reference_assets`
  - `reference_directives`
  - nested `shots`
  - nested camera/style/audio blocks
- The current `ui.schema.json` is RJSF-style and is not in the custom `sections` format the app expects here, so it is effectively ignored by the dynamic form loader.
- Because of that fallback behavior, important fields such as arrays/objects are likely invisible in the rendered form.

## Existing patterns to follow
- `apps/web/skills/storyboard-writer` uses simple `reference_images` wording and a custom section-based `ui.schema.json`.
- `apps/web/skills/grok-imagine-prompt-planner` uses `reference_images` and `referenceNotes` for media prompt planning instead of forcing asset-handle syntax.
- `DynamicSkillForm.tsx` supports:
  - `select`
  - `boolean`
  - `number`
  - `textarea`
  - `images`
  - simple `array` fields with inline text/textarea subfields

## Risks
- A custom `ui.schema.json` select field returns string values, so number-like inputs should stay as explicit number fields unless string presets are acceptable.
- Over-simplifying too far could remove useful cinematic structure; the design should stay rich enough to produce strong prompts.
- Output examples must be updated too, or the package will feel internally inconsistent.

## Recommended direction
- Reframe the skill as a model-agnostic cinematic video prompt builder.
- Replace provider-native reference objects with:
  - top-level `reference_images`
  - plain-language `reference_image_notes`
  - optional simple `scene_beats`
- Build a custom `ui.schema.json` using sectioned fields so the UI actually renders the intended controls.
- Keep the final prompt contract cinematic, concise, and easy to adapt to multiple video models.
