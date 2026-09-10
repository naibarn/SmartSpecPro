# Research Notes

## Repository patterns

- `apps/web/server/services/modelRegistry.ts` contains the static image catalog used for cold-start and capability logic. GPT Image 2 and Seedream 5 Pro are unified rows with optional reference-image routing.
- `apps/web/scripts/seed-media-models-kie-ai.ts` contains the database seed definitions. The GPT Image 2 block is the closest parity template.
- `apps/web/server/services/mediaGenerationService.ts` copies `configJson.apiConfig` into the provider config and already preserves model defaults and reference inputs.
- `python-backend/app/llm_proxy/providers/kie_ai_provider.py` resolves the base Kie model versus `kie_model_id_with_references` from non-empty normalized reference images, and writes the selected URLs using the configured key/type.
- `python-backend/tests/unit/llm_proxy/test_kie_ai_mode_routing.py` and `test_kie_ai_provider_model_resolution.py` already prove the legacy two-way switch and provider payload shape.
- `apps/web/server/__tests__/kieGptImage2AutoRouting.migration.test.ts` demonstrates migration and seed parity assertions for a unified image row.

## Kie contract research

Kie documents the following exact operation IDs:

- Flare: `gpt-image-2-5-flare-text-to-image` and `gpt-image-2-5-flare-image-to-image`.
- Sunburst: `gpt-image-2-5-sunburst-text-to-image` and `gpt-image-2-5-sunburst-image-to-image`.
- image-to-image input is an `input_urls` array; the model page documents up to 16 images.
- GPT Image 2.5 supports aspect-ratio selection and `1K`, `2K`, and `4K` resolution values.

Sources:

- https://docs.kie.ai/43283988e0
- https://docs.kie.ai/43285205e0
- https://docs.kie.ai/43287106e0
- https://docs.kie.ai/43287109e0

## Worktree and migration state

- The worktree contains many unrelated modified and untracked files; edits must remain task-scoped.
- Numeric SQL files currently reach `0288_feature_184_video_editor_revisions.sql` in the worktree, but the visible Drizzle journal tail reaches `0287_worker_runtime_runner_artifacts` and does not yet list 0288. The 0288 file is user-owned and must not be edited.
- Implementation must use a unique next migration filename and register only the task migration in the journal, preserving the existing 0288 file and documenting the ledger condition in the final evidence.

## Risk scan

- Billing risk is controlled by matching the existing GPT Image 2 flat 70-credit catalog value and testing the row data.
- Routing risk is controlled by testing both zero-reference and non-empty-reference calls for both variants.
- Data risk is controlled by idempotent insert/update SQL with no deletes and by avoiding broad seed execution.
- Authorization/upload boundaries are unchanged because the feature only adds catalog metadata; existing managed-reference resolution remains authoritative.
