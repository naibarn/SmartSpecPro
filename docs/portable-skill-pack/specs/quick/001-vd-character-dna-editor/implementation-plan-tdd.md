# TDD guidance

## Test-first order

1. Add shared schema/helper tests for valid edits, field bounds, synchronized
   age fields, preservation of non-editable DNA, and stale revision detection.
2. Add age resolver regression coverage proving canonical visual-bible age wins
   over approved DNA, role inference, and free-form casting notes.
3. Add router tests for tenant/user/series ownership, missing DNA precondition,
   successful focused JSONB merge, conflict response, and no generation/billing
   side effects.
4. Add Character-tab tests for displaying persisted DNA, editing/saving,
   read-only story metadata, no-DNA state, validation errors, pending state, and
   stale status.
5. Run existing character profile, casting age, casting, character CRUD, and
   DNA snapshot tests to catch compatibility regressions.

## Expected initial failures

- The new identity edit schema and mutation do not exist.
- `resolveCharacterCastingAgeProfile` does not yet accept the canonical
  visual-bible age path.
- The Character tab has no DNA editor or revision/stale rendering.

## Test setup and fixtures

- Reuse existing `VerticalDramaCharacter` fixtures and character profile DNA
  fixtures rather than creating a new broad fixture format.
- Include one complete approved DNA row, one legacy/no-DNA row, and one row with
  missing revision metadata.
- Mock the router mutation at the UI boundary and assert the generation
  mutations are not called by the save action.
- For server tests, use the existing tenant-scoped router fixture conventions;
  never use an unowned row as a successful fixture.

## Regression checks

- `castingPreferences.additionalDetails` remains persisted and remains
  secondary to canonical age.
- Generic `updateCharacter` behavior remains unchanged.
- Prompt preview/portrait candidate paths still pin approved identity DNA.
- Existing character cards and portrait/reference workflows render with legacy
  rows.
