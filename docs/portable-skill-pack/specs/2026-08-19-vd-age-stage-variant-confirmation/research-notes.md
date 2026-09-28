# Research Notes

## Current implementation

- `verticalDramaCharacterImageGeneration.ts` derives the validator's expected
  tier from canonical `roleTier` before considering age text and sends that
  same tier as `role_tier` to the visual-bible skill.
- `createCharacterVariant` intentionally copies the parent's `roleTier` to
  preserve story identity, but stores `variantType` and `data.description`.
- `VerticalDramaCharacterStockPanel` already has an Add Look dialog,
  confirmation before paid auto-generation, and async task polling.
- Storyboard generation already exposes approved variants with their own
  `characterKey` and supports a per-shot reference override.

## Required changes

- Add an effective visual-tier calculation for `variantType="age_stage"` so a
  child age-stage variant is validated as `child` while its canonical story
  tier remains unchanged.
- Thread `variantType` into preview, portrait, candidate, and sheet prompt
  generation calls.
- Return a stable recoverable marker for a base adult character receiving an
  explicit child custom instruction, before paid prompt generation.
- Teach the character-stock panel to open the existing Add Look dialog in
  `age_stage` mode with an age-derived label/description.
- Add focused tests for the service helper, route precondition, and UI parser.

## Boundary/security notes

- All existing owner/tenant loaders remain authoritative.
- The recoverable marker contains no provider URL, token, or raw stack trace.
- Variant creation remains an explicit user action and uses existing credit
  confirmation/polling behavior.
- The dirty worktree contains unrelated user changes; only focused hunks in
  the listed files may be modified.
