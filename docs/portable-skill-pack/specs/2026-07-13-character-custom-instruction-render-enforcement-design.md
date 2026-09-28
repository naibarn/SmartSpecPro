# Character Custom Instruction Render Enforcement

## Problem

The character-image UI sends `custom_instruction` to the Character Visual Bible skill, but the image actually rendered can still ignore part of that instruction. Production trace `kZA-xRA1AAbX_XsdmP3BH` shows the Thai brief `ภาพเต็มตัว บรรยากาศแสงแดดยามเช้า ห้องสว่าง` reached the planner intact. The planner applied the morning light but returned a close portrait in `primary_portrait_prompt`; `generateCharacterImage` then rendered that field unconditionally.

Existing tests prove only that `customInstruction` reaches the planner. They do not prove that the final media-provider prompt contains and prioritizes the user's requested visible details. The approved-prompt branch also currently treats `customInstruction` as a no-op.

## Approved Approach A

Use layered enforcement:

1. Keep the skill responsible for interpreting the brief naturally and weaving it into the generated prompt fields.
2. Add a bounded render-time requirement block derived from the original `customInstruction` to the previewed prompt and the exact prompt submitted to the image provider.
3. Apply the same pure prompt-builder to direct generation and approved-preview branches.
4. Keep immutable identity, attached-reference locks, child safety, and provider safety above the per-generation brief. Reject or ignore only the conflicting part; retain every non-conflicting requirement.

This avoids brittle Thai/English keyword parsing and covers arbitrary visible requests such as framing, crop, pose, lighting, setting, props, colors, and mood.

## Data Flow

```text
UI customInstruction
  -> previewCharacterPrompt / generateCharacterImage
  -> Character Visual Bible custom_instruction
  -> skill-authored primary prompt
  -> render requirement envelope containing the original bounded brief
  -> mediaGenerationService.generateImageAsync.prompt
  -> selected image provider
```

The requirement envelope is added exactly once and only when the trimmed brief is non-empty. A stable marker makes the builder idempotent. If an approved preview already contains the marker, the builder preserves it when the brief is unchanged and replaces the prior bounded block when the caller supplies a changed brief. It must be clearly delimited as user-provided visual requirements, encode the brief as a JSON string, and state that identity/reference/safety locks retain precedence. It must not alter the persisted canonical Character DNA.

## Skill Contract

Retain and strengthen the existing `custom_instruction` section in `skill.md`:

- `primary_portrait_prompt` must honor framing and visible scene requirements for the current generation.
- `full_body_prompt` remains a reusable full-body deliverable, not the only place allowed to honor a full-body request.
- Non-conflicting details must not be silently dropped.
- Canonical face identity must not be redesigned because of an ephemeral brief.

The static input schema continues to cap `custom_instruction`; no database migration or new dependency is required.

## Failure Handling and Safety

- Empty/absent instruction preserves legacy behavior byte-for-byte.
- The requirement block is bounded by the existing input length validation.
- User text is treated as data inside explicit delimiters, not as a system instruction.
- Marker-like text inside the brief cannot terminate the block because the value is JSON-encoded and the builder owns the surrounding marker lines.
- Provider safety remains authoritative.
- Reference-image face/identity locks and child-safety constraints remain authoritative.
- If a requested detail conflicts with a lock, only that detail is ignored; framing, lighting, setting, and other compatible details remain mandatory.

## Tests

Add regression coverage that verifies the final `generateImageAsync` payload, not only planner flow-through:

1. Direct generation includes the Thai brief in a delimited requirement block.
2. Prompt preview returns the same enforceable prompt the renderer will receive.
3. Approved-preview generation preserves the existing block and replaces it when the brief changes.
4. Empty/absent instruction leaves the final prompt unchanged.
5. The block is added once only.
6. The prompt states lock/safety precedence while retaining non-conflicting requirements.
7. Skill-content tests retain explicit Thai and English full-body examples and require `primary_portrait_prompt` compliance.

Run focused router, service, and skill-content tests plus the web TypeScript check.

## Scope

Expected files:

- `apps/web/skills/vertical-drama-character-visual-bible/skill.md`
- `apps/web/server/routers/verticalDramaCharacters.ts`
- `apps/web/server/routers/__tests__/verticalDramaCharacters.customInstruction.test.ts`
- `apps/web/server/services/__tests__/verticalDramaCharacterVisualBible.skillContent.test.ts`

No UI layout, database schema, model catalog, credit calculation, identity persistence, or provider-selection behavior changes are included.
