# Implementation Plan - NVIDIA NIM Hosted Provider

Date: 2026-04-07
Planning directory: `specs/feature/073-nvidia-nim-provider`
Inputs:

- `claude-spec.md`
- `claude-research.md`
- `claude-interview.md`

## 1. Objective

Implement NVIDIA NIM Hosted as a new LLM provider in SmartSpecPro without weakening the current chat routing and model-selection guarantees.

The plan must deliver three outcomes together:

1. A new provider entry point for NVIDIA Hosted
2. A safe catalog model for multi-surface synced rows
3. A conservative runtime boundary that keeps non-chat and unreviewed rows out of current chat automation

This is not a “template-only” provider addition. The feature touches provider sync, admin catalog merging, mapping writes, runtime selection, and Python-side explicit embeddings.

## 2. Delivery scope

### 2.1 In scope

- add `nvidia_nim` provider template and defaults
- native sync from `https://integrate.api.nvidia.com/v1/models`
- dedupe duplicate live model IDs before catalog merge
- preserve `ownedBy` and classify synced rows by `surface`
- add conservative rollout metadata such as `executionMode` and `autoSelectionEligible`
- keep synced rows disabled by default for current chat usage
- harden admin mutation boundaries so only public chat rows can enter `model_provider_map`
- allow a narrow reviewed NVIDIA-owned subset to participate in provider-auto and global-auto selection
- reuse standard OpenAI-compatible chat routing for mapped NVIDIA chat models
- add explicit internal NVIDIA embeddings on the Python side

### 2.2 Out of scope

- rerank routing or rerank admin support
- implicit retrieval embedding fallback changes
- re-embed or migration jobs
- self-hosted NIM container support
- owner-wide whitelisting of partner model families

## 3. Architecture summary

Phase 1 should treat `llmProviders.availableModels` as the canonical metadata layer for NVIDIA Hosted rows and keep `model_provider_map` as the canonical enablement/routing layer for chat.

The resulting architecture is:

1. Native sync pulls live rows from `/v1/models`
2. NVIDIA normalization enriches synced rows with:
   - `ownedBy`
   - `surface`
   - `executionMode`
   - `autoSelectionEligible`
   - chat `apiStyle` when applicable
3. Admin catalog renders those rows directly from `availableModels`
4. Mapping mutations re-check the catalog row before allowing enablement
5. Runtime chat uses `model_provider_map` for enabled models, while deriving `autoSelectionEligible` from the provider catalog at load time

This keeps catalog review state centralized and avoids duplicating multi-surface metadata into runtime tables unless a later feature proves that persistence is necessary.

## 4. Design decisions resolved in this plan

### 4.1 Sync the full hosted catalog, but keep it disabled by default

The user explicitly wants the full hosted catalog synced. The implementation should therefore import both NVIDIA-owned and partner-owned rows into `availableModels`, but leave all new rows inactive for chat until an admin enables them.

This preserves discovery value without turning the provider sync job into an activation job.

### 4.2 Use conservative classification for partner rows

Unknown or weakly understood partner rows must not default to chat.

The classification pipeline should follow this order:

1. exact-ID reviewed overrides
2. owner-agnostic non-chat heuristics
3. explicit reviewed chat allowlist or reviewed family rules
4. fallback to:
   - `surface = other`
   - `executionMode = deferred`
   - `autoSelectionEligible = false`

This design directly addresses live partner non-chat rows already seen in the hosted feed.

### 4.3 Keep auto-selection narrower than the synced chat catalog

Not every synced chat-capable row should enter provider-auto or global-auto mode in phase 1.

The reviewed auto-selection set should be limited to:

- `nvidia/llama-3.3-nemotron-super-49b-v1.5`
- `nvidia/llama-3.1-nemotron-70b-instruct`
- `nvidia/llama-3.1-nemotron-nano-8b-v1`
- `nvidia/llama3-chatqa-1.5-70b`

All other synced chat rows remain manual-only until reviewed.

### 4.4 Derive `autoSelectionEligible` from provider catalog metadata in phase 1

The runtime needs access to `autoSelectionEligible`, but phase 1 should avoid adding a new `model_provider_map` column unless implementation friction proves it necessary.

Preferred phase 1 design:

- store `autoSelectionEligible` in `llmProviders.availableModels`
- have admin/catalog responses expose it directly
- have `enabledLlmModels.ts` read provider catalog metadata and derive `autoSelectionEligible` for enabled rows by matching `providerModelId`
- treat missing catalog metadata as `autoSelectionEligible = false`

Why this is preferred:

- it keeps review metadata in one place
- it avoids duplicating state across JSON catalog and mapping table
- it reduces migration scope

Fallback decision if implementation proves too awkward:

- add a boolean `autoSelectionEligible` column on `model_provider_map`
- backfill it from the synced catalog during enablement

This fallback should only be used if the derived approach materially complicates the runtime path.

### 4.5 Keep embeddings explicit/internal-only

The retrieval path is dimension-sensitive and currently assumes OpenAI-like defaults in multiple places. Therefore phase 1 embeddings should stay isolated to the internal/admin branch and should not alter default retrieval behavior.

## 5. Workstream A - Shared metadata and classification contracts

### 5.1 Files

- `apps/web/server/services/llmProviderCatalog.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`

### 5.2 Required changes

Extend the shared `availableModels` contract with the following additional metadata:

```ts
type ModelSurface =
  | "chat"
  | "embedding"
  | "parse"
  | "guardrail"
  | "reward"
  | "translation"
  | "multimodal"
  | "other";

type AvailableLlmProviderModel = {
  id: string;
  name: string;
  contextLength?: number;
  createdAt?: number;
  pricing?: { input: number; output: number };
  apiStyle?: "chat-completions" | "responses" | "messages" | "gemini";
  ownedBy?: string;
  surface?: ModelSurface;
  executionMode?: "public" | "internal-only" | "deferred";
  autoSelectionEligible?: boolean;
  embeddingDimension?: number;
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsWebSearch?: boolean;
  supportsFunctionTools?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsJsonMode?: boolean;
  supportsStrictToolSchema?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  supportsResponses?: boolean;
  config?: LlmRequestConfig;
};
```

Critical compatibility constraint:

- keep the existing `apiStyle` union exactly backward-compatible, including `gemini`

### 5.3 Classification helpers

Add NVIDIA-focused normalization helpers in `llmProviderCatalog.ts`.

Recommended signatures:

```ts
type NvidiaHostedClassification = {
  ownedBy?: string;
  surface: ModelSurface;
  executionMode: "public" | "internal-only" | "deferred";
  autoSelectionEligible: boolean;
  apiStyle?: "chat-completions";
};

function classifyNvidiaHostedModel(providerModelId: string, ownedBy?: string): NvidiaHostedClassification;

function buildNvidiaHostedCapabilityOverlay(providerModelId: string): Partial<AvailableLlmProviderModel>;
```

Responsibilities:

- exact-ID overrides for reviewed rows
- owner-agnostic non-chat heuristics
- explicit auto-selection bootstrap IDs
- conservative fallback to `other/deferred/manual-only`

### 5.4 Why this workstream comes first

All later workstreams depend on a stable shared contract. Sync, admin merge, runtime selection, and client row types all consume `availableModels`, so the type layer must be extended before changing behavior.

## 6. Workstream B - NVIDIA provider template and native sync

### 6.1 Files

- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/services/modelSyncService.ts`
- optional NVIDIA overlay data file if the team wants reviewed IDs separated from code

### 6.2 Provider template

Add a new template entry with:

- `providerName = "nvidia_nim"`
- display name `NVIDIA NIM (Hosted)`
- base URL `https://integrate.api.nvidia.com`
- default model `nvidia/llama-3.3-nemotron-super-49b-v1.5`

The template itself should stay light. Most model content comes from sync, not from a hardcoded giant template list.

### 6.3 Native sync enablement

Extend the native sync allowlist so `nvidia_nim` uses the OpenAI-compatible `/v1/models` path.

The sync pipeline for `nvidia_nim` should:

1. fetch the raw hosted model list
2. dedupe by exact model ID before merge
3. preserve `owned_by`
4. map IDs to stable display names
5. enrich rows through NVIDIA classification and capability overlay
6. merge into `availableModels` while keeping existing rows that are not removed

The sync implementation should extend its intermediate model shape so normalization can retain hosted metadata long enough to classify it. At minimum, the raw/native sync path needs fields for:

- `id`
- `name`
- `contextLength`
- `createdAt`
- `pricing`
- `ownedBy`
- optional raw provider fields needed for classification if the live contract exposes them later

### 6.4 Dedupe behavior

The dedupe must run before the normal merge so duplicate live IDs do not create duplicate catalog rows or inconsistent pricing/context comparisons.

When duplicates differ only by repeated feed rows, keep a single normalized row.

### 6.5 Catalog defaults after sync

Every synced NVIDIA row must land in one of these rollout states:

- public chat candidate
- internal-only embedding candidate
- deferred/manual-only non-chat or unresolved row

There should be no row that implicitly becomes chat-capable without explicit classification.

## 7. Workstream C - Admin catalog and mutation hardening

### 7.1 Files

- `apps/web/server/routers/multiProvider.ts`
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`
- `apps/web/client/src/locales/en/admin.json`
- `apps/web/client/src/locales/th/admin.json`

### 7.2 Read-side admin behavior

Extend admin catalog rows with:

- `surface`
- `ownedBy`
- `executionMode`
- `autoSelectionEligible`
- `catalogEligibility`
- `catalogInvalidReason`

Recommended admin row contract:

- `catalogEligibility`: `"public-chat" | "manual-only" | "internal-only" | "deferred" | "invalid"`
- `catalogInvalidReason?`: `"missing-catalog-row" | "surface-not-chat" | "execution-mode-not-public" | "provider-disabled" | "unknown"`

The catalog page should visually distinguish:

- chat vs non-chat
- public vs internal/deferred
- auto-eligible vs manual-only
- stale/invalid mapped rows vs still-valid catalog rows

This is important because phase 1 syncs all hosted rows, not only rows that can be enabled immediately.

Mapped rows whose current catalog row is missing or no longer eligible should remain visible, but they must surface `catalogEligibility = invalid` with an explicit reason instead of silently looking healthy.

### 7.3 Write-side hardening

The three critical write paths are:

- `bulkSetAdminModelCatalogEnabled`
- `bulkSetModelMappingsEnabled`
- `upsertModelMapping`

Before writing or enabling a mapping, each path must:

1. load the provider catalog row by `providerId + providerModelId`
2. fail if no catalog row exists
3. fail if `surface !== "chat"`
4. fail if `executionMode !== "public"`

This is the main server-side protection that keeps multi-surface provider sync from contaminating chat routing.

Important implementation detail:

- `bulkSetModelMappingsEnabled` currently works from mapping IDs only, so it must first load the affected mappings to recover `providerId + providerModelId`, then perform the same catalog revalidation before re-enabling anything
- any preloaded lookup or cache used for validation or priority/context hydration must be keyed by `${providerId}:${providerModelId}`, never by `providerModelId` alone
- the same provider-scoped lookup rule applies when deriving synced metadata such as `createdAt`, `pricing`, or `contextLength` during bulk enable flows

### 7.4 Canonical model IDs

Continue using the existing canonical ID helper pattern, but do not introduce NVIDIA-specific aliasing unless a specific model ID needs it. Phase 1 should keep canonical IDs close to provider model IDs unless the existing system already expects a cross-provider alias.

### 7.5 Reconciliation behavior for existing mappings

The sync job and admin layer must define how previously enabled mappings behave when the hosted catalog changes.

Phase 1 should be non-destructive by default:

- do not automatically delete existing `model_provider_map` rows when a synced NVIDIA catalog row disappears or is reclassified
- do mark such mappings as invalid in admin views when their catalog row is missing, non-chat, or no longer public
- do populate `catalogEligibility = invalid` plus a stable `catalogInvalidReason` for those rows
- do exclude invalid mappings from provider-auto and global-auto resolution
- do suppress invalid NVIDIA mappings from the enabled-runtime loader so they cannot be selected or routed while their catalog state is invalid
- do prevent invalid mappings from being re-enabled once disabled

This keeps sync safe for operators while still honoring the current live catalog as the source of truth for future activation.

## 8. Workstream D - Enabled-model loading and auto-selection

### 8.1 Files

- `apps/web/server/services/enabledLlmModels.ts`
- `apps/web/server/services/chatModelSelection.ts`
- `apps/web/server/services/intelligentModelSelector.ts`
- `apps/web/server/services/capabilityRegistry.ts`

### 8.2 Enabled-model loader

Extend `enabledLlmModels.ts` so enabled runtime rows can derive `autoSelectionEligible` by looking up the provider’s catalog row for the same `providerModelId`.

Recommended output shape extension:

```ts
type EnabledLlmModelRow = {
  // existing fields...
  autoSelectionEligible?: boolean | null;
  catalogEligibility?: "public-chat" | "manual-only" | "internal-only" | "deferred" | "invalid" | null;
  catalogInvalidReason?: "missing-catalog-row" | "surface-not-chat" | "execution-mode-not-public" | "provider-disabled" | "unknown" | null;
};
```

Loading rule:

- if provider catalog metadata exists, use its `autoSelectionEligible`
- if the catalog row is missing or unresolved, treat as `false`
- for `nvidia_nim`, if the current catalog row is missing, non-chat, or non-public, exclude the row from the enabled runtime result entirely
- derive the same provider-scoped catalog snapshot from `${providerId}:${providerModelId}` that admin mutations use, so runtime cannot disagree with admin on which row was validated
- implement this as a shared helper or shared loader fragment that can also be reused by `capabilityRegistry.ts`

### 8.3 Auto-selection filter

Update provider-auto and global-auto resolution so they require:

- enabled mapping
- chat-capable mapping
- `autoSelectionEligible = true`
- a current catalog row that still resolves to public chat metadata

Explicit model selection must still be allowed for enabled chat rows even when `autoSelectionEligible = false`.

For NVIDIA specifically, “enabled chat row” means a row whose current catalog metadata still resolves to public chat. This prevents stale enabled mappings from bypassing the catalog safety model after a later sync.

The same rule must apply to capability-driven automatic policy resolution. Any requirements-based automatic path that consumes `capabilityRegistry.ts` should only see NVIDIA rows when:

- `catalogEligibility = public-chat`
- `autoSelectionEligible = true`

Phase 1 should keep manual-only NVIDIA rows out of automatic capability/policy resolution entirely. Supporting explicit policy pinning for manual-only NVIDIA rows can be considered later if a real use case appears.

### 8.4 Capability behavior

The reviewed auto-selection subset needs explicit capability metadata. Phase 1 should not try to perfect the entire hosted NVIDIA catalog.

Recommended phase 1 capability strategy:

- provide reviewed capability flags only for the four auto-eligible NVIDIA-owned rows
- leave unreviewed rows conservative
- do not attempt capability inference for partner chat rows in phase 1
- make `loadEnabledModelsWithCapabilities()` and `loadEnabledModelsWithPricing()` reuse the same catalog-aware suppression logic as `loadEnabledLlmModelRows()`
- ensure capability-registry policy resolution cannot accidentally reintroduce invalid or manual-only NVIDIA rows through its separate loaders

### 8.5 Priority behavior

No new scoring algorithm is needed. The existing scoring and filtering model should continue to work once the reviewed subset has correct capability metadata.

## 9. Workstream E - Chat runtime integration

### 9.1 Files

- `apps/web/server/_core/llmRoutes.ts`
- existing route-family tests

### 9.2 Runtime behavior

NVIDIA chat traffic should fit the generic OpenAI-compatible route family.

Phase 1 target behavior:

- a mapped NVIDIA chat model routes through `/v1/chat/completions`
- no provider-specific request-body transformation beyond standard chat-completions behavior
- no Kie-style model-family path branching

### 9.3 Expected code change size

This should be the smallest workstream. Most of the effort is upstream of routing: safe catalog ingestion and safe selection.

## 10. Workstream F - Python internal embeddings

### 10.1 Files

- `python-backend/app/api/internal_embeddings.py`
- `python-backend/app/core/config.py`
- `python-backend/app/llm_proxy/providers/nvidia_nim_provider.py`
- `python-backend/app/llm_proxy/providers/__init__.py` if the shared provider import pattern remains in use
- related unit tests
- `apps/web/server/services/queryEmbeddingService.ts` should remain unchanged in phase 1 and should be called out explicitly in review so implicit retrieval behavior is not widened by accident

### 10.2 Provider abstraction

Follow the KNPLabs explicit embedding pattern.

Recommended provider surface:

```python
class NvidiaNimProvider:
    EMBEDDING_MODELS: frozenset[str]
    EMBEDDING_DIMENSIONS: dict[str, int]

    async def create_embedding(
        self,
        model: str,
        input_text: str,
        dimensions: int | None = None,
    ) -> list[float]:
        """Create a single embedding vector for an allowlisted NVIDIA hosted model."""
```

Required behavior:

- allowlist only curated NVIDIA embedding models
- post to `/v1/embeddings`
- validate numeric vector payload
- validate expected dimensions when known

### 10.3 Internal API integration

Wire the new provider into `internal_embeddings.py` as an explicit provider option, similar to the existing branching for OpenAI and KNPLabs.

Configuration and packaging requirements:

- add `NVIDIA_NIM_API_KEY` to `python-backend/app/core/config.py`
- add `NVIDIA_NIM_BASE_URL` to `python-backend/app/core/config.py`, defaulting to `https://integrate.api.nvidia.com/v1`
- return a clear configuration error when NVIDIA is explicitly requested but `NVIDIA_NIM_API_KEY` is missing
- export `NvidiaNimProvider` from `python-backend/app/llm_proxy/providers/__init__.py` if `internal_embeddings.py` continues using the shared provider package import style

Phase 1 must not change:

- default retrieval embedding provider
- query embedding dimensions
- vector store assumptions

## 11. Testing strategy

### 11.1 Web / Node tests

Primary test targets:

- `apps/web/server/routers/multiProvider.test.ts`
- `apps/web/server/routers/llmProviders.test.ts`
- `apps/web/server/services/chatModelSelection.test.ts`
- `apps/web/server/services/intelligentModelSelector.test.ts`
- `apps/web/server/services/capabilityRegistry.test.ts`
- `apps/web/server/_core/llmRoutes.unit.test.ts`

New test cases should cover:

1. NVIDIA provider template hydration
2. sync dedupe for duplicate model IDs
3. preservation of `ownedBy`
4. classification of NVIDIA-owned chat/embedding/guardrail/etc. rows
5. classification of partner non-chat rows such as:
   - `ibm/granite-guardian-3.0-8b`
   - `meta/llama-guard-4-12b`
   - `snowflake/arctic-embed-l`
6. rejection of non-chat rows in bulk enable flow
7. rejection of non-chat rows in direct upsert flow
8. explicit selection allowed for manual-only chat rows
9. provider-auto/global-auto excluding manual-only rows
10. preservation of existing `gemini` contract compatibility

### 11.2 Python tests

Primary test targets:

- `python-backend/tests/unit/api/test_internal_embeddings.py`
- new tests for `nvidia_nim_provider.py`
- existing provider-pattern tests as reference

New test cases should cover:

1. allowlisted model acceptance
2. unknown model rejection
3. numeric vector validation
4. dimension mismatch validation
5. internal API provider branching for NVIDIA

## 12. Rollout and migration considerations

### 12.1 Database migration stance

Preferred phase 1 approach avoids a migration for `model_provider_map` by deriving `autoSelectionEligible` from provider catalog metadata at runtime.

Mandatory type updates still include:

- `llm_providers.availableModels` JSON typing
- client/admin row typing

If a migration becomes necessary during implementation, it should be limited to a single boolean runtime field and should not duplicate the full multi-surface catalog metadata.

### 12.2 Backward compatibility

The plan must preserve behavior for existing providers, especially:

- Kie model metadata and `apiStyle`
- Google/Gemini `apiStyle = gemini`
- current OpenRouter and generic OpenAI-compatible sync behavior

### 12.3 Seed behavior

No giant hardcoded NVIDIA catalog seed is required. The provider template should be light, and the first real catalog should come from native sync.

If a seed/update script is used, it should create the provider row and defaults, not freeze a large live model inventory into source control.

## 13. Implementation sequence

The implementation should proceed in this order:

1. Extend shared metadata contracts in:
   - `llmProviderCatalog.ts`
   - `schema.ts`
   - admin client row types
2. Add NVIDIA provider template and native sync normalization
3. Add classification helpers and reviewed bootstrap metadata
4. Harden admin write paths in `multiProvider.ts`
5. Extend enabled-model loading and auto-selection gating
6. Add or adjust route coverage for standard NVIDIA chat behavior
7. Add Python explicit NVIDIA embeddings
8. Run focused Node and Python tests

This order minimizes the chance of enabling invalid runtime behavior before the catalog and admin boundaries are safe.

## 14. Risks and mitigations

### 14.1 Misclassification risk

Risk:

- partner rows or ambiguous NVIDIA rows become chat-eligible accidentally

Mitigation:

- explicit reviewed allowlist for chat
- non-chat heuristics before chat heuristics
- fallback to `other/deferred/manual-only`
- mutation rejection tests

### 14.2 Runtime drift risk

Risk:

- sync metadata and runtime-enabled mappings diverge

Mitigation:

- re-check catalog metadata on every mapping write
- derive auto-selection state from provider catalog during enabled-model loading

### 14.3 Capability drift risk

Risk:

- NVIDIA rows appear selectable but perform poorly in auto modes because capability flags are missing

Mitigation:

- narrow auto-selection subset
- conservative capability defaults
- explicit selection remains available

### 14.4 Embedding regression risk

Risk:

- NVIDIA embeddings break existing retrieval assumptions

Mitigation:

- internal/admin-only phase 1
- no default retrieval fallback changes
- strict dimension validation

## 15. Completion criteria

The implementation is complete when:

- admins can add and sync `nvidia_nim`
- sync imports the full hosted catalog with dedupe and owner preservation
- catalog rows show correct rollout metadata
- invalid rows cannot be enabled as chat mappings
- explicit NVIDIA chat models route successfully through chat-completions
- only the reviewed NVIDIA subset participates in provider-auto or global-auto selection
- explicit internal NVIDIA embeddings work with allowlist and dimension validation
- rerank remains deferred and inactive
