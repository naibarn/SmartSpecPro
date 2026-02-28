# Smart Landscape Designer Skill V1.2.2

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

## What changed in this version
- Keeps the output as **one final prompt string only**
- Replaces separate image fields with a single `reference_images` array
- Uses structured image metadata with `role` and `notes`
- Sets the image `role` to a fixed value of `reference` for this skill
- Keeps the actual image attachments outside the JSON payload so the runtime can pass them natively
- Retains `Output Language`, `Mode Override`, and the clearer variation controls

## Input contract
The runtime must send JSON matching `schemas/input.schema.json`.

Key inputs:
- `userRequest`: the landscape change or creation request
- `outputLanguage`: the language of the final returned prompt (`en` or `th`)
- `reference_images`: ordered metadata for attached images
  - `role`: always `reference` for this skill
  - `notes`: optional notes for that image
- `modeOverride`: defaults to `mode5_text_to_landscape`
- `variationType`: controls how the skill chooses one final prompt
- `numberOfOptions`: how many internal candidates may be drafted before selecting the final prompt
- `customSelection`: clear preset creative directions for the final prompt
- `customSelectionNotes`: optional extra direction
- `maxPromptChars`: hard limit for the final single prompt

All input fields, including nested constraint fields, have explicit defaults.

## Attachment handling
Actual image files are attached in the runtime UI, not as text values in JSON.
The JSON payload stores only the ordered metadata in `reference_images`.
The runtime should keep the attachment order aligned with the `reference_images` array order.

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
3. Check that image attachments are represented as `reference_images` metadata in the input schema and UI schema.
4. Check that preservation wording appears when required.
5. Check that every input field has a default.
