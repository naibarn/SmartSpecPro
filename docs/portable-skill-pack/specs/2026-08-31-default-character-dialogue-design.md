# Default character dialogue mode for special tie-in creation

## Decision

New `SpecialTieInEpisodeDialog` forms default to `character_dialogue` (ให้ตัวละครพูด).

## Behavior boundaries

- An existing `initialInput.dialogueMode` remains authoritative when editing or reopening saved input.
- Users can still explicitly switch to `none` (ไม่มีบทพูด).
- No server contract, database schema, migration, model catalog, or normal-series flow changes are required.

## Verification

Add focused unit coverage for the new-form fallback and preservation of an explicitly saved mode.
