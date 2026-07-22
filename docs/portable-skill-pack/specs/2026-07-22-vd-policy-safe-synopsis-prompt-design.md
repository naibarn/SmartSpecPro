# Vertical Drama Policy-Safe Synopsis Prompt

Date: 2026-07-22
Status: Approved design, pending implementation planning

## Problem

The per-sub-episode image-prompt option labeled "เรื่องย่อโดยตรง" currently
routes to `vertical-drama-shot-synopsis-image-prompt`, but that skill does more
than policy normalization. It selects a decisive instant and adds blocking,
facial expressions, wardrobe locks, lighting, camera treatment, weather, and
other cinematic prose. The resulting prompt is therefore a newly authored
image prompt rather than the shot synopsis with only policy-sensitive wording
adjusted.

The UI selection, persistence, model-family default, and skill dispatch are
already wired correctly. The defect is the Option 1 output contract and the
lack of a deterministic final-prompt boundary.

## Product Contract

Each sub-episode exposes two user-selectable image-prompt modes:

1. **Policy-safe synopsis** (`policy_safe_rewrite`, displayed as
   "เรื่องย่อโดยตรง (ปลอดภัยตามนโยบาย)")
   - Send the authoritative shot synopsis to
     `vertical-drama-shot-synopsis-image-prompt`.
   - Preserve the synopsis language, facts, event order, location, characters,
     emotional intent, and narrative beat.
   - Rewrite only wording needed to establish adult characters, consent,
     non-threatening behavior, non-graphic violence, and absence of sexual
     content.
   - Do not invent or add blocking, poses, facial expressions, wardrobe,
     lighting, camera direction, weather, props, dialogue, people, locations,
     or events.
   - The final image prompt is assembled deterministically as:
     `REFERENCE MAPPING + rewritten_synopsis`.
2. **Cinematic narrative** (`cinematic_narrative`)
   - Continue using `vertical-drama-cinematic-narrative-image-prompt`.
   - May interpret the synopsis and author a full cinematic image prompt under
     its existing continuity, reference, quality, and safety rules.

The default remains model-family aware:

- GPT Image family -> Policy-safe synopsis.
- Every other image-model family -> Cinematic narrative.
- An explicit user selection overrides the default and remains stored on the
  sub-episode's `startFramePlan.imagePromptMode`.

## Option 1 Output Contract

The policy-safe skill returns structured JSON only:

```json
{
  "rewritten_synopsis": "string",
  "safety_adjustments": [
    {
      "original": "string",
      "rewritten": "string",
      "reason": "adult_consent | threat | violence | sexual_content | other_policy"
    }
  ]
}
```

Rules:

- `rewritten_synopsis` must remain in the source synopsis language.
- If no policy-sensitive wording exists, it must equal the normalized source
  synopsis without creative expansion.
- `safety_adjustments` must describe every substantive replacement; an empty
  array means no policy rewrite was needed.
- Each adjustment's `original` value must be an exact substring of the source
  synopsis at the point where that adjustment is applied. The service applies
  the declared replacements sequentially to the normalized source synopsis
  and requires the reconstructed result to equal `rewritten_synopsis` exactly.
  This makes undeclared additions or deletions a schema/contract failure rather
  than trusting the LLM to self-police creative expansion.
- A missing or ambiguous replacement target fails validation and enters the
  existing bounded retry path. It is never guessed or applied globally.
- The skill must not emit the reference mapping, negative prompt, cinematic
  analysis, or final composed image prompt.
- The service must ignore/reject undeclared creative fields rather than append
  them to the final prompt.

## Deterministic Prompt Assembly

The TypeScript service owns final assembly for Option 1:

1. Build one reference-mapping declaration from the authoritative character
   manifest and attached location reference, preserving attachment order. Omit
   the declaration when no reference image will be attached.
2. Append the trimmed `rewritten_synopsis` exactly once.
3. Do not apply `PROMPT LANGUAGE`; the source language is authoritative.
4. Do not append series visual-identity prose, product-placement prose,
   framing overrides, identity-lock prose, camera facts, or generated negative
   prompt text in this mode.
5. Return an empty `negativePrompt` for newly authored Option 1 prompts. Do not
   reuse a stale cinematic negative prompt from an older frame.
6. Enforce the hard prompt-length cap without invoking the creative prompt
   refiner. A synopsis that cannot fit together with the mandatory reference
   mapping must fail clearly rather than be creatively summarized.

Reference images remain attached by the existing paid image-render path. This
change controls text authoring only; it does not change attachment ordering,
model selection, provider routing, or media generation.

## Compatibility

- Retain the stored enum value `policy_safe_rewrite`; no JSON migration is
  required.
- Preserve existing explicit user selections and `auto` behavior.
- Preserve `promptMode` stamping and the user-visible badge.
- Preserve `cinematic_narrative` behavior byte-for-byte except for shared code
  changes needed to support the Option 1 schema.
- Existing Option 1 prompts are not rewritten automatically. They change only
  when the user regenerates the prompt.
- Keep `skill.md` and `SKILL.md` byte-identical because the runtime may load
  either case variant.

## Entry-Point Boundary

The structured policy-safe contract applies when the normal "สร้าง prompt +
ภาพ" flow supplies an authoritative `canonicalShotSummary`.

The separate "ให้ AI ปรับ" workflow supplies an explicit user edit instruction
against an existing prompt and is not a synopsis-normalization operation. Keep
that workflow on the existing general start-frame prompt editing behavior so a
user can intentionally request changes such as wardrobe or framing. An edit
result must not be stamped or displayed as though it were the deterministic
Policy-safe synopsis output unless it independently passes the same
source-plus-declared-adjustments validation.

When the normal generation entry point has no authoritative synopsis, resolve
it from the frame's persisted `canonicalShotSummary` before considering any
older generated `imagePrompt`. If neither the request nor the frame contains an
authoritative synopsis, fail with a user-facing precondition error; never treat
the old generated prompt as the synopsis.

## Failure Handling

- Missing authoritative synopsis: keep the existing explicit fallback/error
  boundary above; never turn an old generated prompt into a new synopsis
  silently.
- Invalid or empty `rewritten_synopsis`: fail the prompt-authoring operation and
  leave the persisted frame unchanged.
- Undeclared additions/deletions or a mismatch between the sequentially applied
  adjustments and `rewritten_synopsis`: retry once through the bounded schema
  repair path, then fail without persistence.
- Schema mismatch: retry through the existing bounded JSON-schema retry path;
  never fall back to cinematic narrative for an explicit Option 1 selection.
- Reference-manifest inconsistency: build the mapping from code-owned data, so
  the LLM cannot swap image indices.
- Provider/model failure: preserve the existing error and credit semantics.

## Tests

Add focused regression coverage proving:

1. GPT-family `auto` resolves to `policy_safe_rewrite`; non-GPT resolves to
   `cinematic_narrative`; explicit user choice wins.
2. Option 1 sends the authoritative synopsis to the policy-safe skill and does
   not apply the selected prompt-language translation instruction.
3. Option 1 final output equals the code-built reference mapping followed by
   `rewritten_synopsis`, with no model-authored prefix or suffix.
4. An unchanged safe synopsis remains unchanged after assembly.
5. A risky synopsis may change only through declared `safety_adjustments`, and
   applying those replacements to the source reproduces `rewritten_synopsis`
   exactly.
6. Invalid/empty Option 1 output is not persisted.
7. Option 2 still loads the cinematic skill and returns its existing full
   prompt contract.
8. Real `skill.md`/`SKILL.md` twins declare the new structured contract and
   remain byte-identical.
9. The explicit "ให้ AI ปรับ" workflow retains general prompt-edit behavior and
   cannot falsely receive a Policy-safe synopsis stamp.
10. An Option 1 prompt over the hard cap fails without invoking the creative
    prompt refiner.

## Non-Goals

- Changing the image-model catalog or provider routing.
- Changing the cinematic-narrative skill's creative behavior.
- Migrating or bulk-rewriting historical prompts.
- Adding a third UI mode.
- Replacing provider-side safety enforcement.

## Acceptance Criteria

- Selecting Policy-safe synopsis produces a prompt containing only the
  deterministic reference mapping and the policy-adjusted synopsis in its
  original language.
- No cinematic details absent from the synopsis appear in Option 1 output.
- Selecting Cinematic narrative preserves the current full cinematic output.
- Automatic defaults and explicit per-sub-episode override behave exactly as
  specified above.
- Focused service, router, real-skill-file, and client mode tests pass.
