# Section 01: Catalog Contract

## Ownership

Conductor-owned files:

- `apps/web/server/services/modelRegistry.ts`
- `apps/web/scripts/seed-media-models-kie-ai.ts`
- `apps/web/server/services/__tests__/qwenImage3MediaModels.test.ts`

## Work

Add two image definitions. Use `qwen3/pro-text-to-image` and `qwen3/text-to-image` as canonical IDs. Each definition stores its paired I2I ID in `configJson.apiConfig.kie_model_id_with_references`, sets the reference key to `image_urls`, caps it at 3, declares `drop_params: ["aspect_ratio"]`, and exposes Qwen3's `image_size`, resolution, output-format, prompt-extension, negative-prompt, seed, and NSFW fields. Keep static and seed metadata identical, including 30/50 resolution pricing.

## TDD expectations

The focused test must assert both rows, exact IDs, paired routing, reference cap, options, aliases, and pricing. It must read the seed source or import the seed definition in the same manner as the existing GPT Image 2.5 parity test.

## Acceptance checks

- Paired I2I aliases resolve to the corresponding canonical row.
- No new UI component or provider branch is needed.
- Existing legacy Qwen rows remain present and unchanged.
- `git diff --check` is clean for the owned hunks.

## Risks

The seed file already has unrelated thinking-mode changes. Patch only the Qwen region and do not revert or reformat surrounding content.
