# Qwen Image 3 Kie.ai Media Models

## Goal

Add Qwen Image 3 to SmartAIHub as two user-facing image models. Each row owns a
text-to-image endpoint and automatically switches to its paired image-to-image
endpoint when one or more reference images are attached.

## Product shape

The catalog exposes exactly two rows:

| Row | Canonical model ID | No reference images | With reference images |
| --- | --- | --- | --- |
| Qwen Image 3 Pro | `qwen3/pro-text-to-image` | `qwen3/pro-text-to-image` | `qwen3/pro-image-to-image` |
| Qwen Image 3 | `qwen3/text-to-image` | `qwen3/text-to-image` | `qwen3/image-to-image` |

The operation is not a second user-visible model choice. Existing catalog
reference handling remains authoritative: an empty/absent reference list keeps
the canonical model; a non-empty list selects the configured paired model.

## Catalog and payload contract

Both rows are declared in the static registry and Kie seed with matching
metadata. The paired image-to-image ID is stored in
`configJson.apiConfig.kie_model_id_with_references`; the input field uses
`image_urls`, is optional for the unified row, is synced to
`reference_images`, and is capped at three items.

Because the existing generic image builder supplies `aspect_ratio` by default
while Qwen3 expects `image_size`, each row also declares
`apiConfig.drop_params: ["aspect_ratio"]`. The visible `image_size` field is
therefore the only aspect/size value sent to Kie3.

The provider payload declares the Kie fields from the current model contract:

- `prompt`
- `image_urls` reference array when editing
- `resolution`: `1K` or `2K`
- `image_size`: `1:1`, `3:2`, `2:3`, `4:3`, `3:4`, `16:9`, `9:16`, or `21:9`
- `output_format`: `png` or `jpeg`
- `prompt_extend`: boolean, default `true`
- `negative_prompt`: optional text
- `seed`: optional integer from `0` through `2147483647`
- `nsfw_checker`: boolean, default `false` in SmartAIHub

The existing generic Kie provider performs reference URL preparation/upload,
variant resolution, request submission, and polling. No provider-specific
branch is added unless a focused payload test proves the declarative contract
cannot represent this model.

## Pricing

Use the existing SmartAIHub image pricing convention for this initial catalog:
30 credits at 1K and 50 credits at 2K for both rows, with no separate
user-facing reference-image surcharge. `creditCost` and the pricing tiers are
declared in static metadata, seed data, and the migration so estimates and
runtime billing remain aligned.

This is an application pricing decision, not a claim that SmartAIHub credits
are identical to Kie.ai provider credits. The provider's current page lists
1K/2K output and up to three input images; the app's credit values remain
controlled by the existing catalog pricing policy.

## Persistence and migration

Create one idempotent Drizzle migration after the current journal head. It
upserts only the two new `modelId` values, preserves existing rows, marks both
models enabled, and updates the migration journal. The conductor applies the
migration to the configured local PostgreSQL database and verifies the two rows
and their JSON contract with SQL. No provider task is submitted during
verification.

## Failure handling and safety

- More than three reference images are rejected or trimmed by existing catalog
  limits before submission; the provider must never receive an over-limit list.
- Empty, blank, or unauthorized managed references continue through the existing
  broker/upload validation and fail closed without falling back to text-to-image.
- If the paired model ID is absent or malformed, the catalog remains invalid for
  that route and tests catch it; no silent guessed endpoint is introduced.
- Existing tenant authorization, credit reservation, callback/polling, and
  failure-refund paths are unchanged.

## Tests and acceptance criteria

Add focused tests that prove:

1. Both static rows exist with exact provider/model IDs and matching seed
   definitions.
2. Each row switches to I2I only when references are non-empty.
3. The input field cap is three and the declared options match Kie.ai.
4. Pricing resolves to 30 for 1K and 50 for 2K.
5. The migration is present in the journal and its SQL is idempotent.
6. Existing Qwen legacy rows and unrelated Kie models remain unchanged.

Run focused Vitest/TypeScript checks, migration checks, and the relevant Python
provider tests if the implementation touches Python. Apply the migration and
query the local database after code verification. Live Kie generation,
deployment, and browser replay are outside this local gate and are not run.

## Alternatives considered

1. **Recommended: two unified rows with declarative reference routing.** Matches
   the requested grouping, keeps the catalog readable, and reuses the tested
   generic Kie path.
2. Four visible rows. Simpler IDs per row, but duplicates one logical model in
   the UI and makes the user choose an implementation detail.
3. One row with a Pro/Standard selector. Fewer rows, but adds client state and
   makes pricing/endpoint selection more complex than the requested two groups.
