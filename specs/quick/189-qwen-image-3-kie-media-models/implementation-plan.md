# Implementation Plan

## Objective

Register Qwen Image 3 Pro and Standard as enabled Kie.ai image models, with one canonical T2I row per edition and automatic I2I routing when reference images are present. Persist the same contract through seed and migration, then prove it with focused tests and a local DB query.

## Current-codebase fit

Follow the GPT Image 2.5 unified-row pattern. Keep the existing Kie provider generic: `apiConfig.kie_model_id_with_references` selects the endpoint and `reference_image_input_key: "image_urls"` selects the provider payload field. Because the generic image builder supplies `aspect_ratio` but Qwen3 expects `image_size`, declare `drop_params: ["aspect_ratio"]` and expose `image_size` through `inputFields`. The frontend already renders declarative `inputFields` and enforces `maxItems`.

## Affected files

- `apps/web/server/services/modelRegistry.ts`: add two static fallback definitions.
- `apps/web/scripts/seed-media-models-kie-ai.ts`: add matching Kie seed definitions without overwriting existing dirty changes.
- `apps/web/drizzle/0302_qwen_image_3_media_models.sql`: idempotently upsert the two DB rows.
- `apps/web/drizzle/meta/_journal.json`: append the migration journal entry.
- `apps/web/server/services/__tests__/qwenImage3MediaModels.test.ts`: static/seed/contract/pricing parity tests.
- `python-backend/tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py` or a focused companion: verify Qwen3 variant and `image_urls` payload routing if existing coverage does not already prove it.

## Implementation approach

1. Add test-backed expectations for both rows, exact paired IDs, field options, reference cap, and resolution pricing.
2. Add equivalent definitions to static registry and Kie seed. Use canonical IDs `qwen3/pro-text-to-image` and `qwen3/text-to-image`; put paired IDs only in `apiConfig` and aliases.
3. Create migration `0302` with explicit quoted camelCase columns and `ON CONFLICT ("modelId") DO UPDATE`, including all catalog JSON and pricing fields.
4. Append the correct journal entry only after confirming the current journal head.
5. Run focused Vitest and Python tests, TypeScript check as a warning-level baseline gate, and `git diff --check`.
6. Apply `npm --workspace apps/web run db:migrate` using the user's local `DATABASE_URL`, then query both rows and their JSON routing fields. Re-run migration to prove idempotency if the migration tool safely reports no pending work.

## Safety and failure handling

- Do not touch unrelated dirty files or normalize the whole seed/registry file.
- Do not use `input_urls` for Qwen3; Kie requires `image_urls`.
- Do not leave the generic `aspect_ratio` default in a Qwen3 payload; Kie requires `image_size`.
- Keep `image_urls` optional on the unified row, but let the existing provider require a non-empty list before selecting I2I.
- Keep `maxReferenceImages` and field `maxItems` at 3 so the user cannot submit more than the provider limit through catalog-driven flows.
- Preserve managed reference URL authorization/upload and fail closed on inaccessible references.
- Do not run live Kie requests, retries, deployment, or credit-consuming actions.

## Acceptance criteria

- Both rows appear in static fallback and DB-backed seed definitions with exact IDs and provider `kie.ai`.
- No reference uses T2I; one or more references uses the paired I2I model.
- Payload metadata uses `image_urls`, max 3, `image_size`, and the documented Qwen3 options without `aspect_ratio`.
- Pricing is 30/50 credits for 1K/2K in static metadata, seed, migration, and calculator tests.
- Migration `0302` is journaled, applies successfully to local PostgreSQL, and leaves two correct rows.
- Focused tests pass; unrelated baseline failures, if any, are reported separately.

## Rollout and proof

Local catalog/migration proof is required. Provider/deployment/browser proof is not required for this request and will remain explicitly unverified.
