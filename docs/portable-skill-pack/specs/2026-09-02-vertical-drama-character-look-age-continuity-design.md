# Vertical Drama Character Look Age and Continuity Design

## Goal

Prevent storyboard look selection from treating relational wording such as
`ผู้ใหญ่ทั้งสอง` (the two adults) as an age-stage request for every character in
the shot. Preserve authoritative character age, reuse an adult character's
existing base look, and keep storyboard creation non-blocking when the model
returns an incompatible look.

## Scope

- Update the shared deterministic selector in
  `apps/web/shared/verticalDramaSeries/characterLookSelection.ts`.
- Pass the authoritative character age band from the episode pipeline into the
  selector catalog.
- Normalize incompatible or redundant automatic look references to a safe
  existing look before persisting the storyboard projection.
- Keep manual look selections authoritative.
- Add focused regression tests for relational adult wording, child-to-adult
  mismatch, and redundant adult requests for an adult character.
- Do not mutate existing episode rows or add a blocking validation gate.

## Design

The selector will distinguish an age-stage cue from a relational reference to
other people. Generic adult-group wording is ignored unless it explicitly names
the current character. Explicit age-stage cues remain eligible for selection,
but are checked against an authoritative age band derived from the character's
stored age facts, approved DNA, role, and description.

When an automatic request is incompatible with the authoritative age band, the
selector keeps the most recent compatible look or the base character and emits
an advisory assignment reason. When an adult request targets a character whose
authoritative band is already adult, the base/current outfit look is reused and
no new age-stage suggestion is created. Manual selections bypass this automatic
normalization.

The episode pipeline will compute the age band once per catalog row using the
existing shared age-profile resolver. This is metadata-only and requires no
database migration. The existing cross-episode wardrobe handoff remains
context-aware and continues to decide whether wardrobe should carry across an
episode boundary.

## Failure handling

Missing or uncertain age facts do not block storyboard creation. If the age
profile cannot be resolved, the selector preserves the existing behavior and
continues with the best available look. Selector errors remain degradable at the
pipeline boundary; the original storyboard can still be returned.

## Verification

- Regression tests prove `ผู้ใหญ่ทั้งสอง` does not create an adult look for a
  child character.
- Tests prove an explicit incompatible adult request falls back to a compatible
  child look without a new suggestion.
- Tests prove an adult character does not receive a redundant adult age-stage
  suggestion.
- Existing character-look and cross-episode continuity tests remain green.
- Typecheck is run for the touched TypeScript paths where the repository allows;
  unrelated pre-existing worktree errors are reported separately.
