# Smart Character Creator Pro Skill Package

Files included:

- `SKILL.md` — complete operational skill instructions.
- `schemas/input.schema.json` — full input/profile schema.
- `schemas/ui.schema.json` — bilingual Thai/English UI schema.
- `output.schema.json` — output contract for plain-text prompt generation.
- `knowledge/` — original knowledge files copied into the skill package.

Primary output behavior: generated prompts are rendered as normal descriptive plain text, not JSON.


## v1.1 updates

- Expanded enum choices across all character and generation inputs.
- Added `auto` to every selectable input so the system can infer coherent values.
- Added optional reference image upload support through drag-and-drop or file picker.
- Added image roles for person, face, body, clothing, pose, background, environment, lighting, mood, and style references.
- Set default UI language to English while preserving full Thai UI labels.
