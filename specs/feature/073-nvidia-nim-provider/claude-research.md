# Research - NVIDIA NIM Hosted Provider

Date: 2026-04-07
Source spec: `specs/feature/073-nvidia-nim-provider/spec.md`
Workflow: deep-plan / self-review / file-based

## 1. Summary

This codebase already has the right extension points for an NVIDIA-hosted provider, but the change is not isolated to a single provider template.

The implementation naturally breaks into five surfaces:

1. Node provider catalog and sync
2. Admin catalog merge and mapping mutations
3. Enabled-model runtime and auto-selection
4. Chat route/runtime
5. Python internal embeddings

The highest-risk part is not the base chat route. It is the catalog-to-mapping pipeline:

- `availableModels` is still effectively chat-centric in several places
- unmapped catalog rows are auto-materialized into admin rows
- write paths can insert mappings without re-checking synced model metadata
- auto-selection treats missing capabilities as false

For embeddings, the cleanest integration point already exists in Python:

- `python-backend/app/api/internal_embeddings.py`

That path already supports provider branching for `openai` and `knplabs`, and is safer than trying to silently swap the main retrieval embedding provider.

## 2. Codebase Findings

### 2.1 Node server - provider template and catalog contracts

Relevant files:

- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/services/llmProviderCatalog.ts`
- `apps/web/drizzle/schema.ts`

Key findings:

- `llmProviders.ts` owns provider templates and merges template `availableModels` into database state. This is the entry point for adding `nvidia_nim`.
- `llmProviderCatalog.ts` already provides the strongest precedent for per-model metadata. Kie uses:
  - `apiStyle`
  - capability booleans
  - `config` with safe relative endpoint validation
- The shared `llmApiStyleSchema` already allows:
  - `chat-completions`
  - `responses`
  - `messages`
  - `gemini`
- `schema.ts` types `llm_providers.availableModels` as JSON with the same chat-oriented fields. This is where `ownedBy`, `surface`, `executionMode`, and optionally `autoSelectionEligible` need to be added.
- `model_provider_map` is still the runtime source of truth for enabled chat models. Any runtime-only flag such as `autoSelectionEligible` must flow into this table or into the enabled-model loader path.

Practical implication:

- Adding only a provider template is not enough. The JSON contract, admin response types, and mapping/runtime pipeline must move together.

### 2.2 Node server - model sync and normalization

Relevant file:

- `apps/web/server/services/modelSyncService.ts`

Key findings:

- Native OpenAI-compatible providers already sync from `GET /v1/models`.
- `fetchOpenAICompatibleModels()` currently returns only:
  - `id`
  - `name`
  - `contextLength`
  - `provider`
- It currently drops:
  - `owned_by`
  - any model type/surface hint
  - any extra provider metadata
- It also does not dedupe duplicate IDs before merging.
- The native provider allowlist in `fetchProviderNativeModels()` does not currently include `nvidia_nim`.
- The sync merge keeps all old models and appends new models. That is good for availability, but it means incorrect metadata can persist unless normalization is part of sync or post-sync catalog merge.

Practical implication:

- NVIDIA support needs both:
  - native sync enablement
  - a normalization layer that dedupes IDs and enriches rows with owner/surface metadata before admin/runtime consume them

### 2.3 Node server - admin catalog merge and mapping writes

Relevant files:

- `apps/web/server/routers/multiProvider.ts`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`

Key findings:

- `mergeAdminModelCatalogRows()` auto-creates admin rows from `availableModels` even when there is no mapping yet.
- For unmapped rows, it currently defaults `apiStyle` from provider name if the model does not define one.
- `bulkSetAdminModelCatalogEnabled` can create new mappings directly from catalog rows.
- `upsertModelMapping` can create/update rows directly from submitted input.
- Current write paths do not re-check a synced catalog row for non-chat eligibility.
- Current client/admin row types do not include `surface`, `ownedBy`, or `autoSelectionEligible`.

Existing test coverage is already good here:

- `apps/web/server/routers/multiProvider.test.ts`
  - catalog merge behavior
  - list/admin catalog behavior
  - `upsertModelMapping`
  - `bulkSetAdminModelCatalogEnabled`
  - priority assignment

Practical implication:

- This router is the main safety boundary for the feature.
- The feature should add read-side filtering and write-side rejection in the same patch.

### 2.4 Node server - enabled model loading, auto-selection, and chat runtime

Relevant files:

- `apps/web/server/services/enabledLlmModels.ts`
- `apps/web/server/services/chatModelSelection.ts`
- `apps/web/server/services/intelligentModelSelector.ts`
- `apps/web/server/services/capabilityRegistry.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/llmRoutes.unit.test.ts`
- `apps/web/server/_core/llmRoutes.kie.test.ts`

Key findings:

- `enabledLlmModels.ts` loads enabled runtime rows only from `model_provider_map`.
- `chatModelSelection.ts` derives capability requirements from chat mode:
  - web search
  - computer use
  - photo search
  - structured output
  - tool calling
  - background
  - responses
- `chatModelSelection.ts` filters rows by capability booleans and treats missing flags as not supported.
- `intelligentModelSelector.ts` also scores priority based on capabilities, recency, and cost. Missing capability flags reduce priority quality.
- `llmRoutes.ts` already handles multiple route families via `apiStyle`.
- Kie-specific tests show the current stack can support provider-specific routing, request transformation, and SSE normalization when needed.
- For NVIDIA chat, the likely path is much simpler than Kie:
  - standard OpenAI-compatible `/v1/chat/completions`
  - no family-specific path branch expected in phase 1

Practical implication:

- If NVIDIA rows are enabled without reviewed capability metadata, they will either:
  - be filtered out from auto-selection for advanced cases
  - or receive weak/default priority scoring
- If `autoSelectionEligible` is part of the feature, it must flow through `enabledLlmModels.ts` and be enforced in `chatModelSelection.ts`.

### 2.5 Python backend - embeddings and provider patterns

Relevant files:

- `python-backend/app/api/internal_embeddings.py`
- `python-backend/app/llm_proxy/providers/knplabai_provider.py`
- `python-backend/app/services/embedding_service.py`
- `python-backend/app/orchestrator/vector_store/embedding_service.py`
- `python-backend/app/llm_proxy/unified_client.py`
- `python-backend/app/llm_proxy/gateway_unified.py`

Key findings:

- `internal_embeddings.py` already exposes an internal-only embeddings API and branches by provider:
  - `openai`
  - `knplabs` / `knplabai`
- This is the cleanest place to add explicit NVIDIA embedding support.
- `KNPLabsProvider.create_embedding()` is a strong pattern reference:
  - allowlist model IDs
  - pass optional dimensions
  - assert numeric vector payload
  - assert expected vector length
- `app/services/embedding_service.py` is a general embedding service abstraction with OpenAI/local providers.
- `app/orchestrator/vector_store/embedding_service.py` is a separate vector-store embedding abstraction with hardcoded model enum/dimensions.
- `queryEmbeddingService.ts` in the web app currently assumes the internal embedding endpoint returns exactly 1536 dimensions and currently requests `text-embedding-3-small`.

Practical implication:

- Explicit NVIDIA embedding support is straightforward in `internal_embeddings.py`.
- Implicit retrieval fallback is not safe in phase 1 because the web query embedding path is hardcoded to 1536 dimensions.
- If the product eventually wants NVIDIA retrieval embeddings in the main search path, it will need a separate retrieval/vector migration plan.

## 3. External Research

### 3.1 Official NVIDIA sources

Reviewed:

- NVIDIA LLM APIs
  - https://docs.api.nvidia.com/nim/reference/llm-apis
- NVIDIA Retrieval APIs
  - https://docs.api.nvidia.com/nim/reference/retrieval-apis
- NVIDIA Models Catalog
  - https://docs.api.nvidia.com/nim/reference/models-1

Key takeaways:

- The hosted docs clearly cover:
  - LLM APIs
  - Retrieval APIs
  - model families across LLM, retrieval, visual, and multimodal categories
- The models page groups the catalog into:
  - Large Language Models
  - Retrieval Models
  - Visual Models
  - Multimodal
- The retrieval/models docs list embedding and rerank families, including examples such as:
  - `nvidia/llama-nemotron-embed-1b-v2`
  - `nvidia/llama-nemotron-rerank-1b-v2`
  - `snowflake/arctic-embed-l`

Important interpretation:

- The docs are useful for surface classification and implementation caution.
- They are not reliable enough by themselves to determine what is live in the hosted `/v1/models` catalog right now.

### 3.2 Live hosted catalog behavior

Verified on 2026-04-07:

- `GET https://integrate.api.nvidia.com/v1/models`
  - `rows = 189`
  - `unique_ids = 186`
  - `owned_by = nvidia -> 48`
- Duplicate IDs currently returned by the hosted feed:
  - `nvidia/nemotron-3-super-120b-a12b`
  - `openai/gpt-oss-120b`
  - `openai/gpt-oss-20b`
- `GET https://integrate.api.nvidia.com/v1/chat/completions -> 405`
- `GET https://integrate.api.nvidia.com/v1/embeddings -> 405`

Observed owner mix in live hosted catalog:

- `nvidia` (48)
- `mistralai` (19)
- `google` (18)
- `meta` (15)
- `microsoft` (14)
- `qwen` (10)
- `deepseek-ai` (8)
- `ibm` (6)
- `moonshotai` (4)
- `openai` (4)

Observed partner non-chat IDs already present in the live feed:

- `ibm/granite-guardian-3.0-8b`
- `meta/llama-guard-4-12b`
- `snowflake/arctic-embed-l`

Practical implication:

- Partner rows are not all chat models.
- Any sync design that defaults unknown partner rows to chat is unsafe.

### 3.3 Docs vs live mismatch

The retrieval docs list rerank-oriented models, but the live hosted `/v1/models` snapshot verified on 2026-04-07 does not currently expose `rerank` IDs.

Practical implication:

- Automatic sync should trust live `/v1/models`
- Docs can enrich metadata, but should not be treated as proof that a rerank model is currently live in the hosted model-list contract

## 4. Testing Findings

### 4.1 Web app / Node server

Test setup:

- `apps/web/package.json`
  - `npm test` runs `vitest run`
- `apps/web/vitest.config.ts`
  - default environment: `node`
  - `jsdom` for `client/src/**/*.test.tsx`
  - includes `server/**/*.test.ts`, `server/**/*.spec.ts`, client tests, drizzle tests, and shared tests

Most relevant existing tests:

- `apps/web/server/routers/multiProvider.test.ts`
  - best place for:
    - surface filtering
    - write-path rejection
    - admin merge behavior
    - auto-selection eligibility propagation
- `apps/web/server/_core/llmRoutes.unit.test.ts`
  - request transformation and route-family utilities
- `apps/web/server/_core/llmRoutes.kie.test.ts`
  - best precedent for provider-specific route coverage
- `apps/web/server/services/intelligentModelSelector.test.ts`
  - priority scoring and capability-aware selection
- `apps/web/server/services/capabilityRegistry.test.ts`
  - capability filtering behavior
- `apps/web/client/src/lib/chatModelSelection.test.ts`
  - client-side auto/provider selection labels and sentinel values

### 4.2 Python backend

Test setup:

- `python-backend/pytest.ini`
  - test path: `tests`
  - async mode: `auto`
  - markers include `unit`, `integration`, `llm`, `agency`, etc.
- `python-backend/pyproject.toml`
  - coverage tooling configured
  - fail-under target documented at `80` in tool config

Most relevant existing tests:

- `python-backend/tests/unit/api/test_internal_embeddings.py`
  - best place for NVIDIA explicit embedding route coverage
- `python-backend/tests/unit/llm_proxy/test_gateway_unified_knplabs.py`
  - provider-branching pattern reference for Python-side provider integration
- `python-backend/tests/unit/services/test_memory_embedding.py`
  - useful for dimension/error-handling expectations around embedding behavior

Suggested focused test runs during implementation:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
npm test -- server/routers/multiProvider.test.ts server/_core/llmRoutes.unit.test.ts server/_core/llmRoutes.kie.test.ts server/services/intelligentModelSelector.test.ts server/services/capabilityRegistry.test.ts client/src/lib/chatModelSelection.test.ts
```

```bash
cd /home/dev/projects/SmartSpecPro/python-backend
pytest tests/unit/api/test_internal_embeddings.py tests/unit/llm_proxy/test_gateway_unified_knplabs.py tests/unit/services/test_memory_embedding.py
```

## 5. Main Risks

1. Sync-only implementation is insufficient. Without admin mutation enforcement, non-chat rows can still be inserted into `model_provider_map`.
2. Partner models are a real classification problem today, not a future edge case. The live hosted feed already includes partner guardrail/embedding rows.
3. Missing capability flags will make NVIDIA rows behave poorly in auto-selection even if catalog sync works.
4. `queryEmbeddingService.ts` hardcodes 1536-dimension expectations, so implicit NVIDIA embedding rollout would create retrieval regressions.
5. `modelSyncService.ts` currently strips the metadata (`owned_by`, surface hints) needed by the spec, so normalization must be part of the sync pipeline or immediately after it.

## 6. Recommended Implementation Sequencing

1. Extend contracts first:
   - `llmProviders.availableModels`
   - admin/client row types
   - optionally `model_provider_map.autoSelectionEligible`

2. Add NVIDIA provider template and sync normalization:
   - native sync allowlist
   - dedupe
   - `ownedBy`
   - `surface`
   - `executionMode`
   - bootstrap capability overlay

3. Harden admin mapping boundaries:
   - read-side filtering
   - write-side rejection in `bulkSetAdminModelCatalogEnabled`
   - write-side rejection in `upsertModelMapping`

4. Update enabled-model and auto-selection path:
   - `enabledLlmModels.ts`
   - `chatModelSelection.ts`
   - `intelligentModelSelector.ts`
   - `capabilityRegistry.ts`

5. Add NVIDIA chat runtime coverage:
   - likely minimal route changes
   - add focused tests for the default `chat-completions` path

6. Extend Python internal embeddings:
   - add NVIDIA provider branch to `internal_embeddings.py`
   - add allowlist/dimension validation
   - do not touch implicit retrieval embedding flow in phase 1

## 7. Planning Notes

- The spec is directionally aligned with the codebase.
- The implementation plan should explicitly separate:
  - catalog safety
  - runtime chat support
  - explicit internal embeddings
- Rerank should remain deferred in the plan unless a live hosted contract is verified during implementation.
