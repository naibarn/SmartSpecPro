# Research Notes

## Current Catalog

- `apps/web/drizzle/0163_gpt_image_2_media_model.sql` creates two enabled rows.
- `apps/web/drizzle/0164_gpt_image_2_short_aliases.sql` adds short aliases only
  to the text-to-image row.
- `apps/web/scripts/seed-media-models-kie-ai.ts` can reseed both rows as enabled.

## Current Request Flow

- Media Studio derives reference upload support from `configJson`.
- `mediaGenerationService.generateImage()` sends the canonical selected model,
  flattened `apiConfig`, and normalized `reference_image_urls` to Python.
- `LLMGateway.generate_image()` passes those fields to `KieAIProvider.generate_image()`.
- `KieAIProvider.resolve_api_model()` already prefers explicit catalog-derived
  `kie_model_id` over the public model name.

## Provider Contract

Kie uses `/api/v1/jobs/createTask` for both variants. Text-to-image uses
`gpt-image-2-text-to-image`. Image-to-image uses
`gpt-image-2-image-to-image` and requires `input_urls`.

## Impact

The shared TypeScript media resolver has a broad blast radius. The narrower
provider-level variant resolver is preferable because it activates only when
the catalog supplies an explicit reference variant.

## Data Boundary

No schema column changes are required. The migration updates existing catalog
rows and their JSON configuration. No tenant, auth, or credit boundary changes.
