# TDD Guidance

## Tests first

Add a focused Vitest file covering:

1. Static registry lookup for both canonical IDs.
2. Alias lookup for both paired I2I IDs.
3. Exact `kieModelId`, paired `kie_model_id_with_references`, `image_urls` field, max 3, and documented options.
4. `calculateCreditCost` at 1K, 2K, and default selections.
5. Seed source contains both definitions and the same paired IDs/options.
6. Migration source contains both model IDs, quoted columns, idempotent conflict handling, and journal tag.

If the existing Python model-resolution suite lacks a Qwen3 case, add one that calls the declarative resolver with no refs and one ref, asserting the selected model IDs and `image_urls` key. Mock HTTP/upload boundaries; never call Kie.ai.

## Expected red state

The new catalog lookup tests should initially fail because the two IDs are absent. The routing assertion should fail or be absent until the new `apiConfig` metadata is present.

## Green and regression checks

- Run the new Vitest file and existing GPT Image 2.5/provider-resolution tests.
- Run the relevant Python provider test file with `DEBUG=false .venv/bin/pytest -q --no-cov ...` when Python coverage is added.
- Run `npm --workspace apps/web run check` and classify unrelated baseline errors separately.
- Run migration and SQL verification after code tests; repeat the migration command to verify idempotent state without submitting a provider task.
