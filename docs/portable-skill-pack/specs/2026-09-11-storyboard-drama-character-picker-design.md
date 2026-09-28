# Storyboard Drama Character Picker and Review Panel Overflow

## Goal

Make the Skill Framework storyboard wizard able to reuse characters already
created in Drama Series, including their managed portrait assets, and keep the
Storyboards Review project panel usable at narrow widths.

## Design

The Characters tab will provide two explicit sources:

1. Existing Shared Character Library characters.
2. Drama Series characters imported through an owner-scoped picker.

The picker selects a user-owned Series and character, displays the current
primary portrait preview when one exists, and imports a snapshot into the
Shared Character Library. Import links existing `media_assets` by logical ID;
it does not copy binary data, call a provider, or charge credits. The imported
character is then selectable in the storyboard. Selecting it automatically
adds its primary portrait asset ID to the skill's
`character_reference_images`; the user may remove or add references before
confirmation.

The server validates tenant, user, Series, character, and asset ownership in a
single import boundary. The snapshot stores source Series/character metadata,
skill/profile data, revision, and managed asset links. A missing portrait is a
valid import outcome and is shown as an empty state rather than silently using
an external URL.

The Storyboard Review left project panel will use a wrapping action row with
bounded button widths, text truncation, and a narrow-screen stacked layout.
New Blank Project keeps its existing action and navigation behavior.

## Alternatives and trade-offs

- Directly reference Drama rows from Storyboard: smaller schema change, but
  later Drama edits would silently change old storyboard identity. Rejected.
- Copy image binaries during import: simpler rendering, but duplicates storage
  and breaks the managed-asset boundary. Rejected.
- Inline Series/character lists without an explicit picker surface: fewer clicks,
  but consumes too much vertical space and makes source/revision confirmation
  unclear. The expandable picker section in the Characters tab keeps the source
  boundary explicit without leaving the storyboard wizard.

## Error and loading states

- Series and character lists show loading and empty states.
- Import failures are shown as a user-safe status message; no partial library
  record is left behind.
- Characters without a primary portrait remain importable but clearly show
  that the user must add a reference image.
- Buttons are disabled while mutations are pending and remain keyboard/focus
  accessible.

## Verification

- Unit/service contract tests cover owner scoping, asset selection, no-credit
  import, and missing-portrait behavior.
- UI checks cover character selection adding/removing a reference and narrow
  panel action wrapping.
- Existing Drama character tests and Storyboard Review behavior remain
  unchanged.
- Migration, provider, billing, deployment, and authenticated browser checks
  remain separate environment gates.
