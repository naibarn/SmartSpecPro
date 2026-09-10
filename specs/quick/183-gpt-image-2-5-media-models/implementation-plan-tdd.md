# TDD Guidance

## Red tests first

1. Add a catalog/migration parity test that expects both canonical rows, exact paired Kie IDs, 70 credits, optional `input_urls`, max 16, generated aspect-ratio/resolution fields, and no standalone image-to-image row.
2. Add provider routing parameterization for Flare and Sunburst. The no-reference case must select the text-to-image ID and omit `input_urls`; the one-reference case must select the image-to-image ID and include the Kie-hosted `input_urls` array.
3. Add SQL safety assertions for both model IDs, `ON CONFLICT`/update behavior, migration journal registration, and absence of broad `DELETE` statements.

## Fixtures and setup

- Reuse the existing `KieAIProvider` unit-test mocks for `create_task`, `wait_for_task`, and reference upload.
- Use non-sensitive fixture URLs and assert only the provider payload shape and selected model ID.
- Do not require `KIE_API_KEY`, database credentials, or a live Kie task.

## Regression checks

- Existing legacy two-way GPT Image 2 routing remains unchanged.
- A model without `kie_model_id_with_references` does not switch merely because references are present.
- Seed and static registry IDs remain aligned.
- The migration is non-destructive and does not touch the unrelated 0288 migration.

## Verification commands

```bash
cd apps/web && pnpm exec vitest run server/services/__tests__/gptImage25MediaModels.test.ts server/services/__tests__/enabledMediaModelSelection.test.ts
cd ../../python-backend && DEBUG=false .venv/bin/pytest -q --no-cov tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py tests/unit/llm_proxy/test_kie_ai_mode_routing.py
cd ../apps/web && pnpm check
git diff --check
```

If the focused test filename or Python environment differs at execution time, use the discovered equivalent command and report the exact command run.
