# Implementation plan: Character DNA editor in the Character tab

## Objective

Expose the persisted Character DNA used by Vertical Drama image generation in
the existing Character tab, permit safe editing of identity-critical fields,
and make the edited age/identity authoritative for the next explicit prompt or
image generation without automatic generation or credit use.

## Current-codebase fit

The authorized character DTO already includes `data`, and the generation path
already reads `data.visualBible.designDna` and `data.visualBible.ageRange`. The
implementation should add a typed, owner-scoped patch boundary rather than
introducing another storage location or replacing the entire JSONB object.

## Work sequence

### 1. Shared contract and pure helpers

Target:

- `apps/web/shared/verticalDramaSeries/characterProfile.ts`
- `apps/web/shared/verticalDramaSeries/characterCastingAge.ts`
- focused shared tests

Add a small identity-DNA edit schema/type for `ageRange` plus the eight existing
`designDna.faceIdentity` fields, bounded by the existing DNA text limits. Add
optional typed visual-bible revision metadata. Add pure helpers to:

- normalize and validate the edit payload;
- merge identity fields while preserving all non-editable DNA and unrelated
  character data;
- synchronize both age locations;
- calculate DNA revision/staleness state for UI and server use.

The age resolver must recognize the canonical persisted visual-bible age as an
explicit story fact before approved DNA and role inference. Free-form casting
notes remain secondary guidance and must not become the age source.

### 2. Owner-scoped server mutation and generation lineage

Target:

- `apps/web/server/routers/verticalDramaCharacters.ts`
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts` if
  snapshot persistence needs a narrow change
- router/service tests

Add `updateCharacterIdentityDna` to the existing router. It must:

1. parse `seriesId`, `characterId`, edit payload, and current revision;
2. load the character through the existing tenant/user/series ownership path;
3. require a valid existing `visualBible.designDna`;
4. reject stale revisions with a precondition/conflict error;
5. merge only editable fields;
6. write synchronized age fields and revision metadata;
7. return the refreshed DTO without invoking generation or billing.

When prompt/visual-bible generation persists a new snapshot, carry forward the
current identity revision and set `promptDnaRevision` to the revision actually
used. Ensure the approved-DNA pinning path remains authoritative after a user
edit. `designDna.ageRange` and `designDna.faceIdentity` must remain
authoritative over older derived strings such as `visualIdentitySummary`,
`identityAnchors`, and `hairMakeupNotes`; those derived views may be displayed
as stale until the explicit prompt generation refreshes them. Existing
prompts/portraits stay available; only their stale status changes.

### 3. Character-tab editor and user-facing states

Target:

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts` if
  shared copy is useful
- focused Character-tab tests

Add a default-open `Character DNA — ข้อมูลหลักที่ใช้สร้างภาพ` section in the
selected character detail card. Bind fields to the persisted visual bible,
keep a per-character draft, and use the dedicated mutation on save. Show the
source value, revision/status, model/timestamp, read-only story/design DNA,
validation errors, empty legacy state, stale state, pending state, cancel, and
success feedback. Keep casting additional details visible but label it as
non-canonical notes.

The save handler must only call the DNA mutation. The explicit existing prompt
or image actions remain the only generation path.

## Security and data boundaries

- Reuse `verticalDramaProcedure`, `requireTenantId`, `loadOwnedSeries`, and
  `loadOwnedCharacter`.
- Never accept a browser-supplied full `data` replacement for this action.
- Validate all text bounds server-side even if the UI validates first.
- Do not expose new private media identifiers.
- Treat revision conflicts as recoverable UI errors, not silent overwrites.

## Acceptance criteria

- Character tab displays the persisted age and identity DNA used by generation.
- User can edit and save age and identity fields in that tab.
- Save updates both age locations and preserves story/design DNA and unrelated
  data.
- Save does not call prompt/image generation or create a credit transaction.
- Next explicit generation uses edited canonical age/identity before approved
  DNA/role inference.
- Existing portraits remain and are visibly marked potentially stale.
- No-DNA, validation-error, permission-error, and stale-revision states are
  understandable and recoverable.

## Verification and rollout

Run focused shared/router/UI tests first, then the affected workspace test
command. Perform a browser pass in the Character tab using an existing DNA row:
observe the current age, edit to `20`, save, confirm no generation request, then
explicitly generate and verify the resulting prompt uses the edited age. No DB
migration, deploy, or production credit-consuming generation is part of this
implementation wave.
