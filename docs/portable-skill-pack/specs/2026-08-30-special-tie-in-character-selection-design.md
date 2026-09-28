# Special tie-in character selection

## Goal

When a user selects a series character while creating a special tie-in episode,
the character should be usable immediately. The user should not need to know or
perform an internal `approved portrait` action.

## Contract

The special tie-in flow accepts the character's current usable character
reference (normally the `primary_portrait` shown in the UI) when the linked
media asset is owned by the same tenant/user/series, is a
`character_reference`, has a non-empty URL, and is not expired.
`approved=true` is not a prerequisite for this flow. The ownership, asset type,
non-expired and URL checks remain server-side and authoritative.

Characters without a ready portrait remain visible and selectable so the user
can correct the selection. Final creation stays disabled until every selected
character has a usable portrait, and the dialog provides a direct link to the
Characters tab for the exceptional no-image case.

## Scope and compatibility

The change is isolated to special tie-in character binding and its dialog. The
general character-stock approval/QC lifecycle and normal episode generation are
unchanged.

## Verification

- Unit-test the server admission predicate for accessible unapproved and
  expired assets.
- Unit-test the client portrait eligibility predicate.
- Run the focused special tie-in tests and `git diff --check`.
