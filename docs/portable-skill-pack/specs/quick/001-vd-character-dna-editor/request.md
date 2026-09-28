# Request

## Original request

Add a clear, editable Character DNA area inside the Vertical Drama Character
tab. The UI must expose the exact DNA source used by image generation so a user
can inspect and correct values such as age. Saving DNA must not automatically
generate an image or consume credits.

## Approved product decisions

- Editing happens inside the existing Character tab for each selected character.
- Identity DNA is editable; story/design DNA is visible but read-only.
- Save DNA only. Prompt/image generation is an explicit later action.
- Existing portraits and unrelated character data remain intact.
- The current persisted source is `character.data.visualBible`, especially
  `ageRange` and `designDna.faceIdentity`.

## Likely affected areas

- Shared Character DNA schemas and age precedence helpers.
- `verticalDramaCharacters` router and tenant-scoped persistence.
- Character prompt/visual-bible persistence and DNA revision metadata.
- `VerticalDramaCharacterStockPanel` Character-tab detail UI.
- Shared/server/client tests and browser verification.

## Constraints and assumptions

- Preserve the heavily dirty worktree; edit only owned task files.
- Prefer a dedicated DNA mutation over replacing the whole `data` JSONB blob.
- No SQL migration is needed for additive JSONB metadata.
- Existing rows may have no DNA, legacy DNA, or no revision metadata.
- SocratiCode discovery was unavailable in this session; targeted shell
  discovery is the fallback.

## Non-goals

- No standalone DNA page.
- No raw JSON editor in the first version.
- No automatic generation after save.
- No deletion or replacement of existing portraits.
