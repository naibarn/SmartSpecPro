---
name: Smart Landscape Designer
slug: smart-landscape-designer
description: Generate copy-ready landscape image prompts from user requests and optional reference images.
category: image_prompt_generation
execution_mode: llm-only
chainTo: image-creator
icon: image
version: "1.3.0"
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 55
creditMultiplier: 1.0
---

# Smart Landscape Designer Skill V1.3.0

This is a vendor-neutral agent skill for generating **one copy-ready landscape image prompt as a single raw string**.

It is designed to work across Gemini, OpenAI, Claude, and OpenCode style runtimes because it uses:

- Markdown instructions
- JSON input/output schemas
- A UI schema with explicit field mapping
- No vendor-specific tool calling

## Package contents

- `skill.md`
- `system_prompt.md`
- `knowledge/landscape_knowledge_base.md`
- `knowledge/quick_start_guide.md`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json`
- `review_report.md`

## What changed in V1.3.0

- **Simplified reference images** — `reference_images` is now a flat array of image URLs (strings) instead of an array of objects with `role`/`notes`
- **New ImageSourcePicker** — users can pick images from Upload, Library (personal/shared/group), or paste URLs
- **Removed hidden `role` field** — every image is always treated as `reference`; no need to show a read-only field
- **Added `referenceNotes`** — a single optional textarea for notes about all reference images (mention images by number)
- Retains `Output Language`, `Mode Override`, and the clearer variation controls

## Input contract

The runtime must send JSON matching `schemas/input.schema.json`.

Key inputs:

- `userRequest`: the landscape change or creation request
- `outputLanguage`: the language of the final returned prompt (`en` or `th`)
- `reference_images`: flat array of image URLs (strings) — all treated as visual references
- `referenceNotes`: optional free-text notes about how to use the reference images
- `modeOverride`: defaults to `mode5_text_to_landscape`
- `variationType`: controls how the skill chooses one final prompt
- `numberOfOptions`: how many internal candidates may be drafted before selecting the final prompt
- `customSelection`: clear preset creative directions for the final prompt
- `customSelectionNotes`: optional extra direction
- `maxPromptChars`: hard limit for the final single prompt

All input fields, including nested constraint fields, have explicit defaults.

## Attachment handling

Reference images are selected via the ImageSourcePicker UI (upload, library, or URL).
The JSON payload stores image URLs in the `reference_images` array.
The `referenceNotes` field provides optional context about how to use each image.

## Output contract

Return output matching `schemas/output.schema.json`.

The output must be:

- a **single raw string**
- copy-ready for an image model
- free of JSON wrappers, arrays, labels, bullet lists, and code fences

## Runtime behavior

1. Ignore missing image attachments.
2. Detect the best mode unless `modeOverride` is supplied.
3. When reference images are attached for an existing-property request, preserve the building unless disabled.
4. Build photo-real prompts ready to paste into an image model.
5. If `variationType` uses internal alternatives, draft up to `numberOfOptions` candidates, then return only the best single prompt.
6. Use `customSelection` and `customSelectionNotes` when the custom-guided path is chosen.
7. Keep the final prompt under `maxPromptChars`.
8. Return the prompt in the requested `outputLanguage`.

## Single-string rule

Do not produce:

- JSON objects
- arrays
- menus
- tutorials
- bullet explanations
- conversational wrappers such as "Here is your prompt"

## Self-review requirements

Before returning:

1. Check that the output schema is satisfied.
2. Check that the output is a single string only.
3. Check that `reference_images` URLs and `referenceNotes` are considered when present.
4. Check that preservation wording appears when required.
5. Check that every input field has a default.
