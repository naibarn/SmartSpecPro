# Vertical Drama Phone Caller Virtual Screen Design

## Objective

Make the phone-call contract consistent for every Vertical Drama shot. A remote
caller must never be part of the physical scene cast. The phone held by the
physical actor is an ordinary device with no caller portrait rendered on its
display; the remote caller is represented by a separate virtual phone/video
screen in the generated composition.

## Contract

- `required_character_refs` / `characters` contain physical scene presence only.
- `screen_caller_refs` contains remote phone/video callers only.
- Base characters and outfit/look variants are one family for role partitioning.
  If either family member is an explicit screen caller, all sibling look keys
  are removed from the physical scene list. Twin character families remain
  separate because a twin is a distinct person, not a look variant.
- An explicit empty caller list is meaningful and must not be replaced by a
  stale storyboard caller list during manual start-frame regeneration.

## Data flow

1. Storyboard normalization applies family-aware scene/caller partitioning after
   validating real character keys.
2. Start-frame planning preserves the storyboard caller list when a manual frame
   has no caller field yet, while honoring an explicitly saved empty list.
3. Paid attachment resolution uses the same family-aware partition, so caller
   portraits remain available as screen-only references and are excluded from
   physical-cast references.
4. Prompt construction states that the held phone display is ordinary/blank or
   non-identifying and that the caller appears only in a separate virtual screen.
5. UI applies the same deterministic family-aware partition before rendering the
   physical and caller sections, with no role re-inference from synopsis text.

## Failure handling

Same-family physical/caller overlap is deterministically corrected. Ambiguous
overlap between unrelated character families remains visible for review rather
than silently changing story intent. No provider retry, credit reservation, or
database backfill is part of this code change.

## Tests and acceptance

- Base caller plus outfit variant in physical refs produces disjoint scene and
  caller outputs.
- Caller variant plus base physical ref produces the same family-aware result.
- Existing exact-key role behavior remains unchanged.
- Phone prompt includes the separate virtual-screen contract and excludes a
  caller portrait from the held-device display.
- Manual start-frame regeneration preserves storyboard callers when the frame
  predates the caller field, but preserves an explicit empty caller list.
- Focused Vertical Drama role/prompt tests pass.
