# Section 01 — Catalog and Migration

## Ownership boundary

Own only the two model catalog definitions, the task migration, its journal registration, and catalog/migration tests. Do not edit the user-owned 0288 migration or unrelated model rows.

## Target files

- `apps/web/server/services/modelRegistry.ts`
- `apps/web/scripts/seed-media-models-kie-ai.ts`
- `apps/web/drizzle/0289_gpt_image_2_5_media_models.sql`
- `apps/web/drizzle/meta/_journal.json`
- `apps/web/server/services/__tests__/gptImage25MediaModels.test.ts`

## TDD expectations

- Assert the two canonical IDs, names, provider/type, 70-credit value, optional 16-image `input_urls`, and paired reference IDs.
- Assert the seed and static registry contain no standalone image-to-image rows.
- Assert SQL is idempotent and non-destructive, and the journal contains the migration.

## Acceptance checks

- Catalog/API model listing exposes exactly one row per Flare/Sunburst variant.
- Model configuration declares the same routing contract in static registry, seed, and persisted SQL.
- Existing catalog definitions remain unchanged outside the focused insertion/update blocks.

Implementation result: the static registry, Kie seed, `0289_gpt_image_2_5_media_models.sql`, journal entry, and `gptImage25MediaModels.test.ts` now cover both variants. The user-owned 0288 migration was not modified.

## Risks

The dirty worktree contains a user-owned 0288 SQL file not present in the visible journal tail. Preserve it, use a unique task migration filename, and validate the journal ordering before editing it.
