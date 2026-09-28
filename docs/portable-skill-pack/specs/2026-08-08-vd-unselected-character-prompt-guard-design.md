# Vertical Drama Unselected Character Prompt Guard

## Problem

A shot can mention a roster character who is not physically present and was
not selected in `requiredCharacterRefs`. Image models may still depict that
character because their name remains in the positive prompt, even when an
exact-cast instruction says not to add anyone else.

## Approved rule

`requiredCharacterRefs` remains the authoritative physical-cast contract.
`screenCallerCharacterRefs` remains the authoritative device-only contract.
Narrative mention alone never grants visual presence.

Before any generated start-frame prompt is returned or persisted:

1. Build the excluded-name set from the series roster minus the shot's
   physical and screen-caller selections.
2. Remove excluded roster names and parenthetical explanations containing
   them from positive image-prompt text.
3. Preserve selected character names, environment continuity, action, and
   approved screen callers.
4. Validate the final positive prompt. If an excluded roster name remains,
   fail closed before paid image generation can use it.

This applies to policy-safe, cinematic, legacy, repair, and retry output paths.
It adds no LLM call and no additional credit cost.

## Non-goals

- Do not infer presence from synopsis wording.
- Do not introduce a second presence model.
- Do not alter `requiredCharacterRefs` or automatically select characters.
- Do not modify historical images; users regenerate the prompt/image to apply
  the corrected contract.

## Verification

- A one-person shot mentioning an unselected character contains only the
  selected name in its final positive prompt.
- Explicit screen callers remain allowed in mapping/device-only instructions.
- Overlapping names do not corrupt an allowed selected name.
- Policy-safe and normal prompt paths both enforce the same guard.
- Existing reference-mapping, exact-cast, and prompt-mode tests remain green.
