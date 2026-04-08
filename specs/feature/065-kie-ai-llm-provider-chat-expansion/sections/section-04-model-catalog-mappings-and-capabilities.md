# Section 04: Model Catalog, Mappings, and Capabilities

## Purpose

Register the requested Kie model set in a rollout-safe way and define the capability metadata the rest of the system can rely on.

## Ownership

- provider seed / setup helper
- Kie model catalog JSON
- conservative model-mapping defaults

## Target files

- `apps/web/drizzle/seed.ts`
- `apps/web/scripts/seed-multi-provider.ts`
- `apps/web/scripts/seed-kie-ai-provider.ts`
- optionally adjacent helper modules if the implementation factors catalog constants out

## Implementation notes

1. Add a `seedKieAiProvider()` helper similar in spirit to the existing seed helpers.

2. Register a Kie provider row with:
   - `providerName = "kie_ai"`
   - `displayName = "Kie AI"`
   - `baseUrl = "https://api.kie.ai"`
   - `isEnabled = false`
   - `providerType = "secondary"` or another conservative non-primary class consistent with the current rollout strategy

3. Add the requested model catalog entries to `availableModels`.
   - Include `apiStyle` per model.
   - Include nested request config per model.
   - Include capability hints only when the docs in scope justify them.

4. Do not ship guessed pricing from secondary sources.
   - Either leave mappings disabled until pricing is entered from the current Kie pricing page, or create only the provider catalog in this feature.

5. Canonical model IDs:
   - Reuse existing canonical IDs when the same model already exists in the repo.
   - Otherwise use the provider model ID directly.

6. Explicit crosswalk for ambiguous IDs:
   - canonical `gpt-5.4` -> Kie provider model `gpt-5-4`
   - all requested Claude, Codex, and Gemini IDs map 1:1 between canonical and provider IDs in this feature

7. Response-normalization notes to retain in metadata planning:
   - Kie responses families return responses-style usage plus `credits_consumed`
   - Kie Claude returns Anthropic-style usage keys
   - Kie Gemini is closest to existing chat-completions usage handling

## TDD expectations

- Seed tests first.
- Assert that rerunning the seed stays idempotent.
- Assert that the seeded provider is not auto-enabled.

## Acceptance checks

- The Kie provider row is creatable by seed and by admin template.
- The catalog contains all requested models, including the four codex model IDs implied by the single Codex doc page.
- The catalog contains documented request config metadata for each family, and per-model differences where the docs expose them.
- Capability flags are present only where documented.
- Alias handling for `gpt-5.4` versus `gpt-5-4` is explicit.

## Coordination notes

- If the implementer decides to create disabled `model_provider_map` rows in this section, section-05 must add regression coverage ensuring they are not accidentally selected by generic chat callers.
