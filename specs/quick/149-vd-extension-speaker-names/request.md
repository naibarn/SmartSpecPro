# Request

Fix the SmartAIHub Marketplace Capture Chrome extension's Vertical Drama shot
dialogue cards so they display real character names instead of internal values
such as `character-2`.

## Assumptions

- The canonical display name is already available in
  `vertical_drama_characters.name` for the selected series.
- Existing persisted episodes must be corrected on read; no data migration is
  required.
- The extension response shape and UI layout should remain unchanged.

## Non-goals

- Rewriting historical dialogue-audio plans.
- Changing character keys or database schema.
- Repackaging the extension when no extension source changes.

