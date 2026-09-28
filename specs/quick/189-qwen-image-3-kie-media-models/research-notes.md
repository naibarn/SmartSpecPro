# Research Notes

## Codebase findings

- `apps/web/server/services/modelRegistry.ts` is the static fallback catalog. Existing GPT Image 2.5 rows use one canonical T2I row and `configJson.apiConfig.kie_model_id_with_references` for automatic I2I selection.
- `apps/web/scripts/seed-media-models-kie-ai.ts` is the Kie.ai DB seed source and currently contains legacy `qwen/text-to-image` and `qwen/image-edit` rows. The file has unrelated dirty-worktree thinking-mode changes that must be preserved.
- `python-backend/app/api/v1/media_generation.py` resolves configured Kie model variants for async task records. `python-backend/app/llm_proxy/providers/kie_ai_provider.py` already resolves the reference variant, prepares managed reference URLs, and submits the generic Kie market payload.
- `apps/web/client/src/lib/mediaModelInputs.ts` reads `configJson.inputFields`, applies defaults, enforces reference `maxItems`, and forwards provider fields. No new client component is required.
- The generic Kie image builder always initializes `aspect_ratio`; Qwen3 calls this field `image_size`, so the declarative config must drop `aspect_ratio` after merging extra params.
- `apps/web/server/services/pricingCalculator.ts` supports resolution pricing tiers and optional reference surcharge; this feature only needs resolution tiers.
- `apps/web/drizzle/schema.ts` already has the required `media_models` shape. No ORM schema change is needed; only an idempotent data migration is required.

## Provider findings

- Current Kie.ai Qwen Image 3 documentation lists exact IDs `qwen3/pro-text-to-image`, `qwen3/pro-image-to-image`, `qwen3/text-to-image`, and `qwen3/image-to-image`.
- Qwen3 accepts up to 3 image URLs, 10 MB per image, resolutions `1K`/`2K`, sizes `1:1`, `3:2`, `2:3`, `4:3`, `3:4`, `16:9`, `9:16`, `21:9`, output `png`/`jpeg`, prompt extension, negative prompt, seed, and NSFW checker.
- Qwen3 image-to-image examples use `image_urls`; this must not inherit GPT Image 2's `input_urls` key.
- Qwen3 uses `image_size` rather than `aspect_ratio`; the payload must not contain the generic default `aspect_ratio`.

## Worktree and operational findings

- The worktree is broadly dirty, including the Kie seed and media server files. Changes must be narrow and unrelated files must remain untouched.
- The current Drizzle journal head is `0301_feature_185_skill_framework_storyboard`; the new migration should be `0302_qwen_image_3_media_models.sql` with the next journal index.
- No SocratiCode MCP tool is available, so bounded `rg`, line-range reads, focused tests, and SQL inspection are the discovery/verification path.
