# Auto Cinematic Video Prompt Skill v1.0.0

This package contains a complete skill for generating cinematic video prompts for Seedance 2-style workflows.

## Folder Structure

- `SKILL.md` — main operating instructions
- `skill.json` — skill metadata
- `schemas/input.schema.json` — complete input schema
- `schemas/ui.schema.json` — UI form schema
- `schemas/output.schema.json` — output schema
- `templates/` — reusable prompt templates
- `presets/cinematic_video_presets.json` — style, motion, start/stop, and storyboard presets
- `examples/` — ready-to-adapt input examples

## Supported Workflows

- Text to video
- Image to video
- Reference to video with 1 to 5 images
- Start-frame-only video
- Start-frame and stop-frame video
- Multi-shot storyboard video
- Multiple separate video prompts from one reference set

## Important Rule

For start/stop workflows, start and stop frames must differ by at least two visual axes unless micro-motion is explicitly requested.
