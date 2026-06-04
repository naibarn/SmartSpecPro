---
name: product-reference-storyboard-prompt-optimizer
description: Post-processes product-reference-storyboard prompts by rewriting and compressing unnecessary text until the final plain image prompt is at or below 4500 characters while preserving the critical storyboard, product fidelity, camera/light, text policy, and 9-frame generation contract.
category: image_prompt_generation
version: 1.0.0
icon: minify
tags:
  - shared-skill
  - prompt-optimizer
  - product-fidelity
  - production-reference-storyboard
  - prompt-length-control
auto_trigger: false
triggerPatterns:
  - product reference storyboard prompt optimizer
  - prompt length optimizer
  - compress storyboard prompt
trigger_patterns:
  - product reference storyboard prompt optimizer
  - prompt length optimizer
  - compress storyboard prompt
enabled_by_default: false
credit_multiplier: 1
priority: 49
execution_mode: llm-only
strict_provider_pin: false
execution_policy:
  mode: requirements
  requirements:
    supportsVision: false
    contextLength: 128000
  allowConversationOverride: false
  allowFreeModels: false
  fallbackPolicy: error
config:
  media_studio:
    production_reference_storyboard:
      enabled: true
    auto_learning:
      enabled: true
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
# Prompt Optimizer Logic

## Purpose

Use this skill after `product-reference-storyboard` when the generated prompt is too long, repetitive, or likely to exceed an image provider prompt limit. Return a shorter plain prompt that remains directly usable for image generation.

The normal hard limit is 4500 characters. Prefer 4300 characters or less to leave safety margin, but never return a partial storyboard. If the input is already short enough and complete, lightly clean duplicates and return it without unnecessary rewriting.

## Input Meaning

- `source_prompt`: the prompt to optimize. Treat it as the source of truth.
- `target_max_chars`: target hard maximum. Default and normal value is 4500.
- `preferred_target_chars`: softer target. Default and normal value is 4300.
- `preserve_storyboard_contract`: when true, keep every detected frame and critical storyboard labels.

Do not invent new product facts, shots, characters, claims, prices, ratings, badges, or visible text. Only compress, merge, reorder, and remove redundant wording from the source prompt.

## Required Output

Return plain prompt text only. Do not return JSON, Markdown fences, explanations, audit notes, character counts, alternatives, or a before/after comparison.

The final prompt must be complete and must not end mid-field or mid-frame.

If the source prompt is a 3x3 storyboard, preserve:

- one single 9:16 image / strict 3x3 grid / exactly 9 frames;
- `Frame 1` through `Frame 9`;
- non-empty visual-only prose in every frame;
- `CINEMATIC REALISM LOCK`;
- `PRODUCT REFERENCE LOCK`;
- `TEXT RENDERING POLICY`;
- one shared `CAMERA/LIGHT/DEPTH:` block;
- one shared `PRODUCT VERIFY:` block;
- explicit wording that the attached product reference image is a strict product visual lock and the product must match that reference exactly;
- human realism requirements in natural visual prose only, never as a `HUMAN REALISM:` label.

## Compression Rules

First remove or merge content that does not change image quality:

1. Remove repeated `CAMERA/LIGHT/DEPTH:` blocks inside frames; keep one shared compact block.
2. Remove repeated `PRODUCT VERIFY:` lists inside frames; keep one shared compact block.
3. Merge repeated human realism details into one short global line unless a frame needs a specific hands-only or face-visible note.
4. Remove duplicated adjectives, repeated negative prompts, repeated no-text phrases, and repeated grid constraints.
5. Remove examples, explanations, validation metadata, field names from schemas, and process notes.
6. Shorten long global locks to one compact sentence each.
7. Shorten each frame to the concrete visual action plus the story/voiceover meaning.

Then optimize the frame section:

- Keep frame order unchanged.
- Keep the explicit product-reference instruction. The optimized prompt must still say that the attached product reference image is a strict product visual lock, the product must match that reference exactly, and the reference image controls appearance, proportions, construction, material, color, countable parts, and scale.
- Keep the product role visible in product-relevant frames, but write it as a short cue, not a full verification list.
- Keep character identity only where people appear.
- Prefer one concise visual-only sentence per `Frame N:`.
- If still too long, shorten story-intent wording before shortening concrete visual/product cues.
- If still too long, compress global locks further before removing any frame content.

## Rewrite Loop

Perform a hidden rewrite loop before returning:

1. Draft a compact version.
2. Count whether it is at or below `target_max_chars`.
3. Check that every required frame/label still exists.
4. If over the limit, rewrite again more aggressively.
5. Repeat until the prompt is within limit and complete.

Do not show this loop. Only return the final optimized prompt.

## Hard Failure Avoidance

Never return:

- a prompt over `target_max_chars`;
- a partial prompt;
- a prompt ending with `Frame N:`, `VISUAL:`, `STORY MATCH:`, `PRODUCT VERIFY:`, `CAMERA/LIGHT/DEPTH:`, or `HUMAN REALISM:`;
- frame text containing `STORY MATCH:`, `HUMAN REALISM:`, `VISUAL:`, quoted voiceover lines, timecodes, subtitles, captions, or other text likely to be rendered in the image;
- only lock headers without all required frames;
- JSON or wrapper fields such as `prompt`, `output`, `scenes`, or `frames`.

If the source prompt is extremely long, keep the minimal complete structure:

OUTPUT FORMAT LOCK, CINEMATIC REALISM LOCK, PRODUCT REFERENCE LOCK, TEXT RENDERING POLICY, CAMERA/LIGHT/DEPTH, PRODUCT VERIFY, and Frame 1-9 with compact visual-only frame prose.
