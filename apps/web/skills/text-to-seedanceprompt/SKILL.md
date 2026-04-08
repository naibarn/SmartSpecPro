---
name: text-to-seedanceprompt
description: Imported from shared skill bundle (Text-To-SeedancePrompt.zip)
category: video_prompt_generation
version: 1.0.0
icon: sparkles
tags:
  - shared-skill
  - imported
auto_trigger: false
trigger_patterns: []
enabled_by_default: true
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
---
# Seedance 2.0 Prompt Builder Skill

Builds complete Seedance 2.0 prompts as a single natural-language prompt block. The skill is designed for WaveSpeed-style Seedance 2.0 prompting, including multimodal `@` references, multi-shot prompting in one prompt, video extension, and video editing.

## Design goals

1. Render prompts in **subject → action → camera → style → constraints** order to reduce drift.
2. Keep **avoid / constraint language inside the main prompt**, not as a separate negative prompt block.
3. Support **multi-shot prompting in a single prompt**.
4. Support typed reference instructions for the common Seedance 2.0 patterns:
   - `@Image1 as the first frame`
   - `Reference @Video1 for the fighting choreography`
   - `Follow @Video1's camera movements and transitions`
   - `Use @Audio1 for the background music`
   - `Extend @Video1 by 5 seconds`
   - `Replace the woman in @Video1 with @Image1`
5. Support **Universal Reference Mode** by allowing images, videos, audio, and text guidance in the same request.

## Rendering rules

### 1) Global reference preamble
Render all global `reference_directives` first. Use these canonical patterns:

- `first_frame` → `@ImageN as the first frame.`
- `motion_reference` → `Reference @VideoN for the [reference_target].`
- `camera_reference` → `Follow @VideoN's camera movements and transitions.`
- `audio_reference`:
  - `background_music` → `Use @AudioN for the background music.`
  - `rhythm` → `Use @AudioN for the rhythm and pacing.`
  - `sound_effects` → `Use @AudioN for the sound effects.`
  - `dialogue_timing` → `Use @AudioN for dialogue timing and delivery.`
- `extend_video` → `Extend @VideoN by X seconds.`
- `replace_character` → `Replace [target_description] in @VideoN with @ImageN.`
- `appearance_reference` → `Preserve the [appearance_scope] appearance from @ImageN.`
- `universal_reference` → `Reference @AssetN for [comma-separated reference_elements]. [custom_instruction if present]`

### 2) Global context
If provided, render global context next as plain natural language:
- subject
- action
- camera
- style
- audio

### 3) Shot rendering
Render each shot in order, still as one final prompt. Recommended structure:

`Shot N: [subject]. [action]. [camera]. [style]. [audio if any]. [shot-level references]. [constraints]. [transition to next].`

For multi-shot requests, keep all shots in the same output prompt instead of splitting into separate prompts.

### 4) Constraints
Merge all global and shot-level constraints into the main prompt with natural-language guardrails, for example:
- `Maintain facial consistency, stable anatomy, and smooth motion.`
- `No flicker, no extra limbs, no warped hands, no background deformation.`

Do not emit a separate `Negative prompt:` section.

## Validation rules

- `reference_assets` must use handles like `@Image1`, `@Video1`, `@Audio1`.
- `duration_seconds` must be 4–15.
- `shots` must contain at least 1 shot.
- `replace_character` requires both a target video and a replacement image.
- `extend_video` should align with the requested duration.
- For `image_to_video`, recommend at least one image reference.
- For `universal_reference`, allow mixed image + video + audio assets.

## Output contract

The skill returns:
- `prompt`: the final natural-language prompt
- `prompt_sections`: structured breakdown of how the prompt was rendered
- `api_ready`: provider hints for WaveSpeed / Seedance 2.0
- `reference_map`: rendered reference instructions
- `validation`: errors, warnings, and suggestions

## Notes

This skill package uses:
- `input.schema.json` for the input contract
- `ui.schema.json` for an RJSF-style editor layout
- `output.schema.json` for the output contract
