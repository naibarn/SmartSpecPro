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
