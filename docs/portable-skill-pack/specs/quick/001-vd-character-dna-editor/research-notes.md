# Research notes

## Current authoritative flow

- `apps/web/server/services/verticalDramaCharacterDesignContext.ts` extracts
  `data.visualBible.designDna` into `approvedDesignDna`.
- `apps/web/server/routers/verticalDramaCharacters.ts` calls
  `resolveCharacterCastingAgeProfile` with character age fields and
  `approvedDnaAgeRange`; the current router does not pass free-form casting
  details into the age resolver.
- `apps/web/shared/verticalDramaSeries/characterCastingAge.ts` prioritizes
  explicit story age, then approved DNA, then age-stage/role context.
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts` sends
  `casting_preferences` and `casting_age_profile` separately and explicitly
  prevents free-form `additional_details` from overriding age or approved
  identity/reference locks.

## Current persistence and UI

- `characterRowToDto` returns the character `data` object to the authorized
  Character-tab client, so the existing UI can already read the visual bible.
- The Character tab currently displays a description, role controls, casting
  region/look, and `castingPreferences.additionalDetails`; it does not render
  `data.visualBible.designDna` or `data.visualBible.ageRange`.
- `updateCharacter` can replace `data`, but a generic browser-side replacement
  risks deleting unrelated JSONB keys. A dedicated mutation is safer.
- Existing `verticalDramaCharacterDesignDnaSchema` has bounded fields for
  `designDna`, including the eight `faceIdentity` fields, age range, body
  language, recall stack, story metadata, anti-clone checks, scores, and
  comparison evidence.
- `verticalDramaCharacterVisualBibleSchema` is passthrough-compatible and
  already contains `ageRange`, `designDna`, summary, identity anchors, model,
  and creation time.

## Existing test patterns

- Age precedence coverage exists in
  `apps/web/shared/verticalDramaSeries/__tests__/characterCastingAge.test.ts`.
- Character DNA schema coverage exists in
  `apps/web/shared/verticalDramaSeries/characterProfile.test.ts`.
- Character-tab behavior has focused tests under
  `apps/web/client/src/components/verticalDramaSeries/__tests__/`.
- Router tests should use owned-row fixtures and verify tenant/user/series
  scoping; avoid broad app tests for this change.

## Dirty-worktree note

Relevant files are already modified/untracked from prior work, including the
Character tab, character router, age resolver, and the approved design spec.
Implementation must preserve unrelated hunks and inspect diffs narrowly.

## Scope assessment

Standard quick-plan scope: medium, three bounded sections. The task touches UI,
server, shared schema, and prompt persistence, but no new service, table, or
external provider contract is required.
