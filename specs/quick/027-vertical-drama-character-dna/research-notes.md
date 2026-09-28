# Research Notes

## Runtime path

- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts` explicitly loads
  `apps/web/skills/vertical-drama-character-visual-bible/skill.md` and passes the markdown
  body as the system prompt.
- The stale uppercase `SKILL.md` file is not used by this call path.
- `buildCharacterVisualPromptsUserPrompt` currently serializes exactly one character plus
  title/genre/tone, optional preset identity, face-source reference, own-reference fact,
  sheet type, and custom instruction.

## Current output and persistence

- The LLM output already contains `visual_identity_summary`, identity anchors, wardrobe,
  hair/makeup, performance energy, five prompt fields, and optional sheet prompt.
- Runtime Zod validation lives in `verticalDramaCharacterImageGeneration.ts` and currently
  validates the five required prompt fields.
- `verticalDramaCharacters.ts` returns only `raw.visual_bible_summary` as transient
  metadata; it does not persist the target character's selected visual identity.
- `apps/web/shared/verticalDramaSeries/characterProfile.ts` already defines
  `verticalDramaCharacterVisualBibleSchema` inside `verticalDramaCharacters.data`; it is
  passthrough-compatible and requires no migration for additive DNA fields.

## Current UI flow

- Portrait: `previewCharacterPrompt` runs the paid prompt-generation leg, the client shows
  an editable `MediaPromptPreview`, then `generateCharacterImage` receives
  `approvedPrompt` and skips a second LLM call.
- Character Sheet: direct `generateCharacterSheet` call, no prompt-preview round trip.
- The pending portrait preview state currently stores prompt, negative prompt, and model,
  but no visual-bible snapshot.
- If the user edits the portrait prompt, persisting the original DNA would be incorrect;
  the safe no-extra-LLM behavior is to render but omit persistence and notify the user.

## Data model and query boundaries

- `verticalDramaSeries` has `(tenantId, userId, updatedAt)` list indexing and JSONB bible.
- `verticalDramaCharacters` has tenant/user/series ownership, compact character fields,
  JSONB data, and variant/twin relationship columns.
- Prior-series lookup can use at most five owner-scoped series, then at most two lead-tier
  characters per series.
- Same-person variants are identity evidence, not separate contrast subjects. Twins remain
  intentionally face-linked and must not be treated as an anti-clone error.

## Existing reusable code

- `classifyCharacterRoleTier` provides the existing Thai/English role classifier.
- `extractCharacterDescription` provides legacy-tolerant description aggregation but does
  not currently render the structured personality/visual-bible object.
- `verticalDramaCharacterTypedDataSchema` and `verticalDramaCharacterVisualBibleSchema`
  provide the canonical additive JSONB boundary.
- Existing tests cover skill content, prompt serialization, role/child behavior,
  custom instruction, sheet types, model selection, and description extraction.

## Impact and risk

- SocratiCode impact for `verticalDramaCharacters.ts` identified its focused router tests
  and `verticalDramaLocations.ts`; route changes must remain additive.
- `characterProfile.ts` has no indexed callers in the current graph, but direct imports
  exist and targeted shared-schema tests remain required.
- The current SocratiCode index was resumed after reporting an interrupted/yellow state;
  exact source reads and tests remain the verification source.
- Target files already contain unrelated edits. File-specific diffs and tests are required.

## Security and privacy

- Every archive query must constrain both `tenantId` and `userId` before any prompt data is
  assembled.
- Prompt snapshots contain creative facts only. No asset URL, provider metadata, credit
  metadata, owner identifier, or arbitrary raw JSONB is allowed.
- User-authored description/custom text is data in a JSON payload, not system instruction.
- Approved snapshots received from the browser are validated and correlated to the target
  character key. They do not grant permissions or bypass existing owned-row checks.

## Test command

Primary targeted runner:

`pnpm --filter @smartspec/web test -- <test files>`

Typecheck:

`pnpm --filter @smartspec/web check`

