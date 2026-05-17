# Background Scene Prompt Skill

This package contains:

- `SKILL.md`
- `schemas/input.schema.json`
- `schemas/ui.schema.json`
- `schemas/output.schema.json`

Main design choices:

- Output schema is a plain text string, not a JSON object.
- Multiple prompts must remain the same exact location, with camera-angle variation only.
- Multi-prompt output is a shot list for one locked set, not multiple design alternatives.
- Interior scenes lock furniture inventory, furniture design, upholstery, materials, hardware, fixture details, placement, floor/rug/curtain patterns, and built-ins across every prompt.
- Interior scenes also lock room topology: table position, sofa orientation, coffee-table/rug alignment, door/window wall, frame design, panel count, opening direction, ceiling lights, built-in wall, plant placement, and exterior view.
- UI metadata includes both English and Thai labels, help text, placeholders, and option names.
- Input supports Thai, English, and major languages.
