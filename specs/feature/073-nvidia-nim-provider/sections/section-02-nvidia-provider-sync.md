# Section 02 - NVIDIA Provider Sync

## Scope

This section adds the `nvidia_nim` provider template and the native NVIDIA hosted catalog sync path.

The goal is to import the full live hosted catalog from `https://integrate.api.nvidia.com/v1/models`, dedupe duplicate IDs, preserve owner metadata, and enrich each row with conservative rollout classification before the catalog reaches admin or runtime consumers.

This section does not harden write paths or runtime selection. It prepares the catalog data that later sections will consume.

## Dependencies

This section depends on the shared catalog contract work from `section-01-shared-catalog-contracts`.

It also expects the final NVIDIA rollout rules from the planning artifacts:

- sync the full hosted catalog, including partner-owned rows
- keep new synced rows disabled by default for chat usage
- classify rows conservatively
- preserve `ownedBy`
- keep unresolved or ambiguous rows out of chat-eligible rollout state

## Implementation Goals

### 1. Add the NVIDIA provider template

Add a provider template entry for:

- `providerName`: `nvidia_nim`
- display name: `NVIDIA NIM (Hosted)`
- base URL: `https://integrate.api.nvidia.com`
- default model: `nvidia/llama-3.3-nemotron-super-49b-v1.5`

The template should stay lightweight. Its purpose is to make the provider visible in admin and to define the default base URL and fallback display behavior. The full catalog must still come from live sync.

### 2. Enable native `/v1/models` sync

Extend the native sync allowlist so `nvidia_nim` uses the OpenAI-compatible models endpoint instead of falling back to OpenRouter.

The sync path should:

- call `GET /v1/models`
- decode the hosted response shape without losing raw fields needed for classification
- dedupe repeated `model.id` values before merge
- preserve `owned_by` as `ownedBy`
- normalize `name` from the hosted row when present
- keep `contextLength` when the hosted payload exposes it

If the hosted feed returns repeated IDs, the sync must keep a single normalized row and discard duplicates before catalog merge.

### 3. Classify rows conservatively

Each synced row should receive a rollout classification before it is merged into `availableModels`.

Use this decision order:

1. exact reviewed ID overrides
2. owner-agnostic non-chat heuristics
3. explicit reviewed chat allowlist or reviewed family rules
4. conservative fallback

Conservative fallback means:

- `surface = other`
- `executionMode = deferred`
- `autoSelectionEligible = false`

The implementation should classify both NVIDIA-owned and partner-owned rows. Partner rows must never default to `chat` just because they came from the NVIDIA gateway.

### 4. Add rollout metadata to synced catalog rows

Extend the normalized catalog rows stored in `llmProviders.availableModels` so they can carry:

- `ownedBy`
- `surface`
- `executionMode`
- `autoSelectionEligible`
- `apiStyle` when the row is actually chat-capable

The sync layer should also preserve any support hints that are already known from the hosted model row or from reviewed overlay metadata, such as:

- `supportsVision`
- `supportsThinking`
- `supportsResponses`
- `supportsFunctionTools`

If a capability is not confidently known, leave it false or unset rather than inferring it from the model name.

### 5. Preserve backward compatibility with existing provider metadata

The NVIDIA sync work must not break existing providers.

Important compatibility rules:

- keep the existing shared `apiStyle` enum intact, including `gemini`
- do not change how existing OpenAI-compatible providers sync unless a shared helper is reused safely
- do not introduce NVIDIA-specific aliasing unless a later section explicitly needs it

### 6. Keep synced rows disabled for chat by default

The result of sync is a discoverable catalog, not automatic enablement.

That means:

- all rows can be present in `availableModels`
- only reviewed chat rows should eventually become enabled mappings
- non-chat rows should remain catalog-visible only
- unresolved rows should remain `surface = other` and `autoSelectionEligible = false`

This section only prepares the data. It does not decide whether a row is allowed into `model_provider_map`.

## Files to change

- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/services/modelSyncService.ts`
- `apps/web/server/services/llmProviderCatalog.ts`

Optional, if the implementation team wants to keep the NVIDIA classification rules separate from code:

- a small reviewed-data file for NVIDIA bootstrap IDs and exact overrides

## Implementation Notes

### `llmProviders.ts`

Add the `nvidia_nim` provider template and make sure provider hydration merges the NVIDIA defaults correctly when the provider already exists in the database.

### `modelSyncService.ts`

Extend the native model sync branch so `nvidia_nim` fetches from `https://integrate.api.nvidia.com/v1/models`, then passes the results through the normalization layer before merge.

The intermediate sync shape should retain enough data to classify rows correctly. At minimum, that means preserving:

- `id`
- `name`
- `contextLength`
- `createdAt`
- `pricing`
- `ownedBy`

### `llmProviderCatalog.ts`

Add NVIDIA-specific classification helpers here so the same logic can be reused by admin merge, sync normalization, and later runtime decisions.

The helper should be explicit about three things:

- what counts as a reviewed chat model
- what counts as a non-chat model
- what the fallback state is when classification is uncertain

The fallback must be conservative. Unknown partner rows should not become chat-capable by accident.

## TDD Expectations

Write tests before implementation for the following behaviors:

### Provider template

- `resolveProviderCatalogDefaults()` hydrates `nvidia_nim` with the expected display name, base URL, and default model
- legacy providers still hydrate correctly after the NVIDIA template is added

### Native sync

- `nvidia_nim` uses the native `/v1/models` path instead of OpenRouter fallback
- duplicate hosted IDs are collapsed before merge
- `owned_by` is preserved as `ownedBy`
- hosted display names are normalized without losing the original provider ID

### Classification

- known NVIDIA chat rows classify as `surface = chat`
- known NVIDIA embedding rows classify as `surface = embedding`
- known NVIDIA guardrail rows classify as `surface = guardrail`
- known NVIDIA parse rows classify as `surface = parse`
- unknown partner rows fall back to `surface = other` and `autoSelectionEligible = false`

### Rollout metadata

- reviewed NVIDIA bootstrap rows are marked `autoSelectionEligible = true`
- unreviewed rows are marked manual-only
- chat-capable rows can carry `apiStyle` without breaking existing `gemini` support

### Regression safety

- existing OpenAI-compatible provider sync behavior remains unchanged
- Kie catalog defaults remain unchanged

## Exit Criteria

This section is complete when:

- `nvidia_nim` appears as an admin provider template
- the live NVIDIA hosted catalog syncs successfully
- duplicate live model IDs are deduped before merge
- `ownedBy` and `surface` metadata are preserved in `availableModels`
- uncertain partner rows are classified conservatively
- the sync output is safe for later admin and runtime gating sections to consume
