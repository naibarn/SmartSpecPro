# Implementation Plan

## Objective

Register GPT Image 2.5 Flare and GPT Image 2.5 Sunburst as two enabled Kie.ai image models, each with one canonical catalog row and automatic text-to-image versus image-to-image provider routing based solely on whether reference images are present.

## Current-codebase fit

The existing `kie_model_id_with_references` contract is sufficient. `mediaGenerationService.ts` already forwards model `apiConfig`; the Python provider already chooses the alternate Kie model when the normalized reference-image list is non-empty and sends the configured reference key as an array. No runtime resolver change is expected unless focused tests expose a parity gap.

## Affected files

- `apps/web/server/services/modelRegistry.ts`: add the two static catalog definitions for cold-start and capability lookup, including the generated form fields for references, aspect ratio, and resolution.
- `apps/web/scripts/seed-media-models-kie-ai.ts`: add the same two definitions to the Kie seed catalog.
- `apps/web/server/services/enabledMediaModelSelection.ts`: keep explicit Flare/Sunburst natural-language hints from being caught by the legacy GPT Image 2 matcher.
- `apps/web/server/services/__tests__/enabledMediaModelSelection.test.ts`: regression coverage for those explicit hints.
- `apps/web/drizzle/0289_gpt_image_2_5_media_models.sql`: add idempotent insert/update statements for both rows, using the next unique migration filename without modifying the user-owned 0288 file.
- `apps/web/drizzle/meta/_journal.json`: register the task migration at the next valid journal index while preserving all existing entries and unrelated dirty changes.
- `apps/web/server/services/__tests__/gptImage25MediaModels.test.ts`: assert SQL/seed/catalog parity and non-destructive migration shape.
- `python-backend/tests/unit/llm_proxy/test_gpt_image_25_routing.py`: assert both variants route to the exact text/image Kie model IDs and emit `input_urls` only for image references.

## Implementation approach

1. Add the two model definitions to the static registry with canonical IDs equal to each text-to-image Kie ID, display names without mode suffixes, provider `kie.ai`, image type, enabled status, 70-credit flat pricing, the documented aspect ratios/resolutions, optional `input_urls` capped at 16, and `apiConfig.kie_model_id_with_references` pointing to the matching image-to-image ID.
2. Mirror the definitions in the Kie seed script, retaining aliases for both endpoint IDs while keeping the image-to-image IDs out of the catalog as standalone `modelId` entries.
3. Add one idempotent SQL migration that upserts only the two canonical rows. Preserve existing aliases/config fields where practical, merge required routing metadata, set the current model metadata, and do not delete or disable unrelated rows.
4. Register the migration in the Drizzle journal using the repository's current index/timestamp convention. Do not modify `0288_feature_184_video_editor_revisions.sql`.
5. Add tests before or alongside the implementation: catalog parity, migration safety, zero-reference routing, one-reference routing, and no duplicate image-to-image rows.

## Acceptance criteria

- Exactly two new enabled catalog rows exist: `gpt-image-2-5-flare-text-to-image` and `gpt-image-2-5-sunburst-text-to-image`.
- No standalone `gpt-image-2-5-*-image-to-image` catalog row is added.
- Both rows cost 70 credits and expose optional `input_urls` with max 16 references.
- For each variant, no image selects the `*-text-to-image` Kie ID.
- For each variant, at least one image selects the matching `*-image-to-image` Kie ID and sends an array `input_urls`.
- Existing GPT Image 2 and Seedream routing tests remain green.
- Migration is idempotent/non-destructive and does not overwrite the user-owned 0288 migration.

## Risks and mitigations

- Catalog drift: keep registry, seed, SQL, and tests in the same patch and assert exact IDs.
- Billing mismatch: use flat 70 credits in both definitions and test it explicitly.
- Kie input mismatch: use the documented `input_urls` array and test the provider payload without a paid request.
- Migration ledger collision: inspect and preserve the dirty 0288 state; use a unique filename and journal entry.
- Baseline noise: run focused tests/checks first and report full typecheck separately if unrelated existing errors appear.

## Rollout and verification

Run focused Vitest and Python pytest commands, TypeScript check only if practical, and `git diff --check`. Do not run the full seed script against a real database, make live Kie calls, deploy, restart services, or claim production availability.
