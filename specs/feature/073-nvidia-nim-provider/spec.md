# 073 - NVIDIA NIM Hosted Provider and Multi-Surface Model Catalog

Version: 1.0
Date: 2026-04-07
Status: Proposed
Depends-on: 041 (admin model catalog), 050 (pgvector foundation), 065 (per-model provider metadata pattern), 067 (provider-aware chat selection)
Reference:
- [NVIDIA LLM APIs](https://docs.api.nvidia.com/nim/reference/llm-apis)
- [NVIDIA Retrieval APIs](https://docs.api.nvidia.com/nim/reference/retrieval-apis)
- [NVIDIA Models Catalog](https://docs.api.nvidia.com/nim/reference/models-1)
- Live hosted catalog snapshot: `GET https://integrate.api.nvidia.com/v1/models` (verified 2026-04-07)

---

## 1. Executive summary

This feature adds NVIDIA NIM Hosted as a new LLM provider in the admin catalog and chat routing stack under the provider slug `nvidia_nim`.

The feature is intentionally broader than "just add one more chat provider" because the NVIDIA hosted catalog is multi-surface:

- chat and instruct models
- embeddings and retrieval models
- parse models
- safety and guardrail models
- reward models
- translation models
- multimodal and vision models

The current SmartSpecPro admin and runtime flow is still mostly chat-centric. If we import the NVIDIA catalog without extra typing, non-chat models could be mislabeled as chat models and appear in `model_provider_map` flows where they do not belong.

This spec therefore delivers two linked outcomes:

1. Add `nvidia_nim` as a hosted provider using the NVIDIA Integrate API
2. Upgrade provider catalog metadata so imported models can be classified by `surface`, with current chat routing restricted to `surface = chat`

The recommended v1 rollout is:

- add provider template for `https://integrate.api.nvidia.com`
- sync the live `/v1/models` catalog and dedupe duplicate IDs
- store `ownedBy` and `surface` metadata on imported rows
- classify all synced rows conservatively across NVIDIA-owned and partner-owned models
- allow only chat-surface public models into current chat mappings, with server-side write enforcement
- keep uncurated chat rows manual-only until their capability metadata is reviewed
- add explicit internal Python embedding support for curated NVIDIA embedding models
- do not promise public rerank support yet because the retrieval docs and the live hosted catalog do not currently line up cleanly

---

## 2. Verified source snapshot (2026-04-07)

### 2.1 Live catalog facts

The live hosted NVIDIA catalog at `GET https://integrate.api.nvidia.com/v1/models` returned:

- 189 total rows
- 186 unique model IDs after dedupe
- 48 rows where `owned_by = nvidia`

Observed duplicate IDs in the live feed:

- `nvidia/nemotron-3-super-120b-a12b`
- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`

### 2.2 Live endpoint behavior

Observed live HTTP behavior on 2026-04-07:

- `GET /v1/models` -> `200`
- `GET /v1/chat/completions` -> `405`
- `GET /v1/embeddings` -> `405`

These `405` responses are consistent with POST-only endpoints and are sufficient for this spec to treat chat and embeddings as plausible hosted capabilities. They are not sufficient to infer any unlisted rerank path.

### 2.3 Docs vs live catalog mismatch

The NVIDIA docs pages clearly describe retrieval APIs and list retrieval-oriented models. However, the live hosted `/v1/models` snapshot on 2026-04-07 does not currently expose any model IDs containing `rerank`.

That creates an important rollout rule:

- live `/v1/models` is the source of truth for automatic sync
- doc-only rerank models must not be auto-seeded as active hosted models until the live contract is verified

---

## 3. Problem statement

The current codebase has four gaps that block a safe NVIDIA integration:

1. There is no `nvidia_nim` provider template in the LLM provider admin
2. The model sync path does not import NVIDIA hosted models from `/v1/models`
3. The admin catalog and mapping flow assume imported models are chat-oriented unless proven otherwise
4. The current admin mutation paths can create or enable mappings without re-checking the synced catalog row

That third gap is the most important. The live NVIDIA catalog mixes chat, embedding, parse, safety, reward, translation, and multimodal models in one feed. Without a surface classification layer, the system could:

- show embedding models in chat mapping pickers
- treat parse or safety models as chat models
- route a non-chat model through `/v1/chat/completions`
- confuse future auto-selection logic from feature 067

There is also a retrieval-specific risk:

- embeddings are dimension-sensitive and can corrupt vector search assumptions if wired as a silent fallback
- rerank models are not safely automatable yet because docs and live catalog behavior are not aligned

And there is an auto-selection risk:

- missing capability flags are treated conservatively by the current selector stack, so synced NVIDIA rows need curated capability metadata before they should participate in automatic model choice

---

## 4. Goals

### 4.1 Provider support

- Add `nvidia_nim` to the admin LLM provider registry
- Use the hosted NVIDIA Integrate API as the upstream base
- Support standard Bearer token auth

### 4.2 Live catalog sync

- Sync the hosted NVIDIA model catalog from `/v1/models`
- Dedupe exact duplicate IDs before catalog merge
- Persist `ownedBy` and NVIDIA-specific metadata on imported rows

### 4.3 Multi-surface catalog metadata

- Add a `surface` field to `llmProviders.availableModels` metadata
- Classify imported NVIDIA and partner rows into chat, embedding, parse, guardrail, reward, translation, multimodal, or other
- Keep current chat mapping flows restricted to `surface = chat`

### 4.4 Safe chat routing

- Route mapped NVIDIA chat models through `/v1/chat/completions`
- Reuse the existing OpenAI-compatible request flow where possible
- Avoid Kie-style per-model path branching unless a future NVIDIA contract requires it
- Enforce chat-only eligibility on the server when mappings are created or enabled

### 4.5 Explicit embedding support

- Add an internal Python provider class for NVIDIA embeddings
- Support curated embedding models explicitly
- Keep embeddings out of implicit fallback paths for now

### 4.6 Conservative rollout

- Do not auto-enable every synced model
- Do not guess pricing when the live source does not provide pricing
- Do not expose doc-only rerank models as active live features
- Keep auto-selection limited to a curated bootstrap subset with reviewed capability flags

---

## 5. Non-goals

- no self-hosted NIM container support in this feature
- no public SmartSpecPro endpoint expansion for rerank in this feature
- no automatic replacement of existing embedding providers
- no silent migration of current vector indexes to NVIDIA dimensions
- no guarantee that every hosted partner model exposed by NVIDIA is immediately mapped or enabled
- no assumption that all NVIDIA-owned models are suitable for end-user chat

---

## 6. Locked product decisions

### 6.1 Provider identity

- Provider slug: `nvidia_nim`
- Display name: `NVIDIA NIM (Hosted)`
- Base URL: `https://integrate.api.nvidia.com`
- Default chat endpoint: `/v1/chat/completions`
- Default auth: Bearer token via the provider API key field

### 6.2 Source precedence

Catalog source precedence must be:

1. live `/v1/models`
2. SmartSpecPro curated metadata overlay
3. docs-only notes for human review

The docs may enrich descriptions, but they must not override live availability.

### 6.2a Classification precedence

Surface classification must be owner-agnostic and must run in this order:

1. exact-ID overrides for known models
2. owner-agnostic non-chat heuristics such as `embed`, `parse`, `rerank`, `reward`, `guard`, `guardian`, `safety`, `pii`, `translate`, `clip`, and clearly multimodal `vl` families
3. curated chat allowlist or family rules for known chat-capable models
4. conservative fallback to `surface = other` and `executionMode = deferred`

Important consequence:

- unresolved partner rows must not default to `chat`
- the only models that may default to `chat` are rows matched by an explicit chat allowlist or a reviewed chat-family rule

### 6.3 Dedupe rule

The sync service must dedupe by exact `model.id` before merge. If the live feed returns the same ID multiple times, SmartSpecPro should retain a single normalized catalog entry.

### 6.4 Surface classification

Each imported model row may carry this metadata:

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
  providerModelId: string;
  displayName: string;
  apiStyle?: "chat-completions" | "messages" | "responses" | "gemini";
  ownedBy?: string;
  surface?: ModelSurface;
  embeddingDimension?: number;
  executionMode?: "public" | "internal-only" | "deferred";
  autoSelectionEligible?: boolean;
  config?: {
    apiEndpoint?: string;
    supportsStreaming?: boolean;
  };
};
```

Important rule:

- `apiStyle` remains chat-oriented in v1 and must preserve existing enum values such as `gemini`
- non-chat surfaces may omit `apiStyle`
- `surface` is the main gate that keeps non-chat models out of current chat mappings
- unresolved synced rows must fall back to `surface = other`, not `surface = chat`

### 6.5 Mapping eligibility

Current `model_provider_map` remains chat-only in this feature.

That means:

- `surface = chat` and `executionMode = public` models may be mapped into current chat routing
- `surface != chat` models stay catalog-visible or internal-use only
- future retrieval-specific tables or mappings can be added later without overloading the chat map

### 6.5a Server-side enforcement

Client filtering is a convenience, not a security boundary.

Any mutation that creates, enables, or bulk-enables a chat mapping must:

- re-read the provider catalog row by `providerId + providerModelId`
- reject the request if no catalog row exists
- reject the request if `surface != chat`
- reject the request if `executionMode` is `internal-only` or `deferred`

This rule applies to both:

- single-row mapping upserts
- bulk enable flows from the admin catalog

### 6.5b Auto-selection eligibility

Phase 1 introduces an explicit `autoSelectionEligible` flag.

Rules:

- curated bootstrap chat rows ship with `autoSelectionEligible = true`
- synced chat rows outside the curated bootstrap set default to `autoSelectionEligible = false`
- explicit manual selection may still use `surface = chat` rows with `autoSelectionEligible = false`
- global and provider-auto selection must only consider rows where:
  - `isEnabled = true`
  - `surface = chat`
  - `autoSelectionEligible = true`

To make this enforceable in runtime selection, the implementation should persist `autoSelectionEligible` on the enabled-model path, which likely means adding a boolean column on `model_provider_map` in addition to catalog metadata.

### 6.5c Capability overlay policy

Every row with `autoSelectionEligible = true` must carry reviewed capability metadata.

Rules:

- do not infer high-risk capabilities such as `supportsResponses`, `supportsWebSearch`, `supportsFunctionTools`, `supportsStructuredOutputs`, or `supportsVision` from the model name alone unless docs in scope support the claim
- unknown capabilities default to `false`
- only the curated bootstrap set should participate in auto-selection until capability review is complete

### 6.6 Safe default chat model

The provider template should suggest:

- `nvidia/llama-3.3-nemotron-super-49b-v1.5`

as the initial default recommended NVIDIA-owned chat model, while still allowing admins to map partner models offered through the same hosted gateway.

### 6.7 Pricing policy

If live pricing is not available in the source of truth, SmartSpecPro must keep pricing fields null or admin-managed. This feature must not infer token prices from marketing pages or unrelated docs.

### 6.8 Embedding rollout policy

NVIDIA embeddings are explicit/internal first:

- allow provider-level explicit embedding calls
- do not silently swap existing `embedding_service.py` behavior
- do not re-embed existing corpora automatically

This mirrors the safe pattern already used in earlier multi-provider embedding design work.

### 6.9 Rerank rollout policy

Rerank is intentionally deferred until one of these is verified:

- a live rerank endpoint contract is confirmed from official docs plus runtime behavior
- rerank model IDs appear in the hosted `/v1/models` catalog

Until then:

- rerank models remain docs-only research context
- no rerank route, catalog seed, or admin option ships in this feature

---

## 7. NVIDIA hosted model inventory

This section captures the NVIDIA-owned live model snapshot verified on 2026-04-07. SmartSpecPro should sync the full hosted catalog, but only a curated subset should be pre-enabled for phase 1 chat routing.

### 7.1 Recommended phase 1 chat bootstrap set

These are the best initial mapping candidates because they are clearly chat- or instruct-oriented and cover multiple cost/quality tiers:

The NVIDIA-owned rows in this table are the initial `autoSelectionEligible = true` set, assuming their capability metadata is curated during implementation.

The partner fallback rows in this table are curated phase 1 chat candidates, but they remain `manual-only` until a later capability review explicitly promotes them into auto-selection.

| Provider model ID | Suggested role | Notes |
|---|---|---|
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | default NVIDIA chat | strong default candidate |
| `nvidia/llama-3.1-nemotron-70b-instruct` | premium instruct | straightforward chat fit |
| `nvidia/llama-3.1-nemotron-nano-8b-v1` | budget chat | lower-cost NVIDIA-owned option |
| `nvidia/llama3-chatqa-1.5-70b` | retrieval-aware chat | good RAG-oriented chat candidate |
| `meta/llama-3.3-70b-instruct` | partner fallback | popular partner model via NVIDIA gateway |
| `mistralai/mistral-nemotron` | partner fallback | attractive mixed-vendor option |
| `openai/gpt-oss-20b` | budget partner | live hosted partner model |
| `openai/gpt-oss-120b` | high-capacity partner | live hosted partner model |
| `deepseek-ai/deepseek-v3.1` | partner reasoning | useful optional expansion |
| `qwen/qwen3-coder-480b-a35b-instruct` | code-heavy partner | useful admin choice |

### 7.2 NVIDIA-owned chat and instruct candidates

These models should be synced with `surface = chat`, but not all of them need to be pre-enabled for users on day 1.

Rows in this section that are not included in section 7.1 should default to `autoSelectionEligible = false` until they are reviewed.

| Provider model ID | Notes |
|---|---|
| `nvidia/cosmos-reason2-8b` | reasoning-oriented chat candidate |
| `nvidia/llama-3.1-nemotron-51b-instruct` | instruct |
| `nvidia/llama-3.1-nemotron-70b-instruct` | instruct |
| `nvidia/llama-3.1-nemotron-nano-4b-v1.1` | budget chat |
| `nvidia/llama-3.1-nemotron-nano-8b-v1` | budget chat |
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | flagship chat candidate |
| `nvidia/llama-3.3-nemotron-super-49b-v1` | chat |
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | chat, preferred default |
| `nvidia/llama3-chatqa-1.5-70b` | chat plus retrieval-oriented positioning |
| `nvidia/llama3-chatqa-1.5-8b` | lower-cost ChatQA variant |
| `nvidia/mistral-nemo-minitron-8b-8k-instruct` | instruct |
| `nvidia/mistral-nemo-minitron-8b-base` | catalog only, do not pre-enable by default |
| `nvidia/nemotron-3-nano-30b-a3b` | catalog only until chat quality is verified |
| `nvidia/nemotron-3-super-120b-a12b` | chat candidate, live feed contains duplicates |
| `nvidia/nemotron-4-340b-instruct` | premium instruct |
| `nvidia/nemotron-4-mini-hindi-4b-instruct` | language-specific instruct |
| `nvidia/nemotron-mini-4b-instruct` | budget instruct |
| `nvidia/nemotron-nano-3-30b-a3b` | catalog only until chat fit is verified |
| `nvidia/nvidia-nemotron-nano-9b-v2` | chat candidate |

### 7.3 NVIDIA-owned embeddings and retrieval-oriented models

These rows should sync with `surface = embedding` and `executionMode = internal-only` in v1.

| Provider model ID | Notes |
|---|---|
| `nvidia/embed-qa-4` | embedding / retrieval |
| `nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1` | multimodal retrieval embedding |
| `nvidia/llama-3.2-nemoretriever-300m-embed-v1` | lightweight retrieval embedding |
| `nvidia/llama-3.2-nv-embedqa-1b-v1` | embedding |
| `nvidia/llama-3.2-nv-embedqa-1b-v2` | embedding |
| `nvidia/llama-nemotron-embed-1b-v2` | embedding |
| `nvidia/llama-nemotron-embed-vl-1b-v2` | multimodal embedding |
| `nvidia/nv-embed-v1` | embedding |
| `nvidia/nv-embedcode-7b-v1` | code embedding |
| `nvidia/nv-embedqa-e5-v5` | QA embedding |
| `nvidia/nv-embedqa-mistral-7b-v2` | QA embedding |
| `nvidia/nvclip` | embedding / similarity, internal only |

### 7.4 NVIDIA-owned parse models

These rows should sync with `surface = parse` and remain catalog-only in v1.

| Provider model ID | Notes |
|---|---|
| `nvidia/nemoretriever-parse` | parse |
| `nvidia/nemotron-parse` | parse |

### 7.5 NVIDIA-owned safety and guardrail models

These rows should sync with `surface = guardrail` and stay out of the current chat model picker.

| Provider model ID | Notes |
|---|---|
| `nvidia/gliner-pii` | PII detection |
| `nvidia/llama-3.1-nemoguard-8b-content-safety` | content safety |
| `nvidia/llama-3.1-nemoguard-8b-topic-control` | topic control |
| `nvidia/llama-3.1-nemotron-safety-guard-8b-v3` | safety guard |
| `nvidia/nemotron-content-safety-reasoning-4b` | safety reasoning |

### 7.6 NVIDIA-owned reward models

These rows should sync with `surface = reward`.

| Provider model ID | Notes |
|---|---|
| `nvidia/llama-3.1-nemotron-70b-reward` | reward scoring |
| `nvidia/nemotron-4-340b-reward` | reward scoring |

### 7.7 NVIDIA-owned translation models

These rows should sync with `surface = translation`.

| Provider model ID | Notes |
|---|---|
| `nvidia/riva-translate-4b-instruct` | translation |
| `nvidia/riva-translate-4b-instruct-v1.1` | translation |

### 7.8 NVIDIA-owned multimodal and vision models

These rows should sync with `surface = multimodal` and stay out of the current chat picker unless a later feature explicitly validates them for chat-vision use.

| Provider model ID | Notes |
|---|---|
| `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` | multimodal |
| `nvidia/nemotron-nano-12b-v2-vl` | multimodal |
| `nvidia/neva-22b` | multimodal |
| `nvidia/streampetr` | vision / perception, not current chat scope |
| `nvidia/vila` | multimodal |

### 7.9 Hosted partner models through NVIDIA

The live hosted catalog also exposes partner-owned models. SmartSpecPro should sync them as ordinary `availableModels` rows with `ownedBy` preserved, but only curated chat-capable rows should be enabled.

Notable owners observed in the live feed include:

- `mistralai`
- `google`
- `meta`
- `microsoft`
- `qwen`
- `deepseek-ai`
- `openai`
- `writer`

This matters because NVIDIA Hosted is both:

- a first-party NVIDIA model gateway
- a hosted multi-provider catalog

So the admin UI should display both `provider = NVIDIA NIM` and `ownedBy = <real upstream owner>` where possible.

Observed partner non-chat rows in the live 2026-04-07 snapshot include:

- `ibm/granite-guardian-3.0-8b` -> guardrail
- `meta/llama-guard-4-12b` -> guardrail
- `snowflake/arctic-embed-l` -> embedding

These examples must be covered by the classification logic and test suite so partner rows with obvious non-chat semantics do not leak into chat mapping flows.

If a partner row cannot be confidently classified as chat, it must fall back to:

- `surface = other`
- `executionMode = deferred`
- `autoSelectionEligible = false`

### 7.10 Rerank note

The official docs reference retrieval and rerank capabilities, but the hosted live catalog verified on 2026-04-07 does not currently expose active `rerank` model IDs. Therefore:

- do not seed rerank models automatically
- do not expose rerank settings in the admin UI in this feature
- leave rerank for a follow-up spec once the hosted contract is verifiable

---

## 8. Architecture changes

### 8.1 Add provider template

Update `apps/web/server/routers/llmProviders.ts` to add a new provider template:

- slug `nvidia_nim`
- display name `NVIDIA NIM (Hosted)`
- base URL `https://integrate.api.nvidia.com`
- auth type `bearer`
- default chat endpoint `/v1/chat/completions`
- no custom per-model URL resolver in v1

### 8.2 Extend provider catalog metadata

Update the TypeScript and validation contracts for `llmProviders.availableModels` so each model row can store:

- `ownedBy`
- `surface`
- `embeddingDimension` when known
- `executionMode`
- `autoSelectionEligible`
- chat `apiStyle` when applicable

This is a JSON contract upgrade only for `llmProviders.availableModels`. If `autoSelectionEligible` is also persisted on `model_provider_map` for runtime selection, that table needs a small migration as part of implementation.

### 8.3 Add NVIDIA live sync support

Update `apps/web/server/services/modelSyncService.ts` so `nvidia_nim` can:

- call `GET /v1/models`
- dedupe duplicate IDs
- normalize display names from provider model IDs
- preserve `ownedBy`
- attach a SmartSpecPro overlay for `surface` and rollout metadata

### 8.4 Add NVIDIA catalog overlay builder

Update `apps/web/server/services/llmProviderCatalog.ts` to add NVIDIA-specific catalog normalization:

- exact-ID overrides for known parse, reward, safety, translation, multimodal, and bootstrap chat models
- owner-agnostic heuristic fallbacks for `embed`, `parse`, `reward`, `guard`, `guardian`, `safety`, `pii`, `vl`, `translate`, and similar non-chat indicators
- curated chat allowlist or reviewed family rules for the bootstrap set and approved partner chat models
- conservative fallback to `surface = other`, `executionMode = deferred`, and `autoSelectionEligible = false`
- explicit capability overlay for the bootstrap chat set

The overlay must be unit tested so:

- every known NVIDIA-owned live model ID resolves to a stable `surface`
- known partner non-chat rows such as `snowflake/arctic-embed-l`, `meta/llama-guard-4-12b`, and `ibm/granite-guardian-3.0-8b` resolve correctly
- rows outside the curated chat allowlist do not become auto-eligible by accident

### 8.5 Keep current chat map chat-only

Update `apps/web/server/routers/multiProvider.ts` and related admin catalog merge logic so:

- only `surface = chat` rows can appear in the current chat mapping flow
- non-chat rows may still appear in provider detail views or filtered admin catalog views
- chat auto-selection logic from feature 067 ignores non-chat rows
- mapping mutations re-validate the catalog row and reject non-chat or non-public entries even if a client bypasses UI filtering

### 8.5a Add auto-selection eligibility to the enabled-model pipeline

Update the enabled-model and chat-selection stack so `autoSelectionEligible` can flow from catalog review into runtime selection.

Likely touchpoints:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/enabledLlmModels.ts`
- `apps/web/server/services/chatModelSelection.ts`
- `apps/web/server/services/intelligentModelSelector.ts`
- `apps/web/server/services/capabilityRegistry.ts`

Runtime rule:

- explicit model selection may use enabled chat rows
- provider-auto and global-auto selection must additionally require `autoSelectionEligible = true`

### 8.6 Admin UX upgrades

Update:

- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`
- `apps/web/client/src/locales/en/admin.json`
- `apps/web/client/src/locales/th/admin.json`

The admin UI should:

- show `surface` badges
- show `ownedBy` where available
- show whether a row is `auto-eligible` or `manual-only`
- filter the chat model picker to `surface = chat`
- explain that non-chat NVIDIA models are synced for future surfaces but not yet chat-mappable
- explain that synced chat models outside the curated bootstrap set remain manual-only until reviewed

### 8.7 Chat runtime behavior

NVIDIA chat routing can reuse the standard OpenAI-compatible path:

- upstream path: `/v1/chat/completions`
- payload shape: OpenAI-compatible chat-completions
- auth: provider Bearer token

Unlike Kie, this feature does not require model-family-specific path branching in v1.

Selection behavior:

- explicit selection may target any enabled `surface = chat` mapping
- provider-auto and global-auto selection may only target enabled mappings with reviewed capability flags and `autoSelectionEligible = true`

### 8.8 Python explicit embeddings provider

Add a new provider class:

- `python-backend/app/llm_proxy/providers/nvidia_nim_provider.py`

Expected behavior:

- `create_embedding(model, input_text, dimensions=None)` or equivalent explicit method
- upstream path `POST /v1/embeddings`
- allowlist only curated embedding-capable NVIDIA models
- validate that the response contains a numeric vector
- validate expected dimensions when known

### 8.9 Do not add implicit embedding fallback yet

Do not automatically wire NVIDIA embeddings into the main embedding fallback path in `python-backend/app/services/embedding_service.py`.

Reason:

- vector dimensions may differ by model
- the current vector store assumptions are not guaranteed to match NVIDIA outputs
- silent fallback could corrupt retrieval quality or break queries in subtle ways

Explicit internal use is the safe first step:

- admin embedding tests
- controlled migration tools
- new features that choose NVIDIA dimensions deliberately from the start

### 8.10 RAG reranker remains unchanged

Do not modify `python-backend/app/orchestrator/rag/reranker.py` in this feature. Rerank integration depends on a verified hosted contract and should be addressed in a separate follow-up spec.

---

## 9. Files expected to change in implementation

Primary Node.js files:

- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/services/modelSyncService.ts`
- `apps/web/server/services/llmProviderCatalog.ts`
- `apps/web/server/routers/multiProvider.ts`
- `apps/web/server/_core/llmRoutes.ts` (only if small NVIDIA-specific routing hooks are needed)
- `apps/web/server/services/enabledLlmModels.ts`
- `apps/web/server/services/chatModelSelection.ts`
- `apps/web/server/services/intelligentModelSelector.ts`
- `apps/web/server/services/capabilityRegistry.ts`
- `apps/web/drizzle/schema.ts`

Primary admin client files:

- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`
- `apps/web/client/src/locales/en/admin.json`
- `apps/web/client/src/locales/th/admin.json`

Primary Python files:

- `python-backend/app/llm_proxy/providers/nvidia_nim_provider.py`
- optional internal wiring files for explicit provider registration

Spec seed / data files:

- provider seed or migration script for `nvidia_nim`
- optional curated NVIDIA overlay data file if the team wants the live catalog typing logic separated from code

---

## 10. Acceptance criteria

### 10.1 Provider admin

- admins can create or sync an `nvidia_nim` provider
- provider base URL defaults to `https://integrate.api.nvidia.com`
- provider sync imports live hosted models successfully

### 10.2 Catalog integrity

- duplicate IDs in the live feed are deduped before merge
- imported rows preserve `ownedBy`
- imported rows are classified with a stable `surface`
- non-chat rows never appear as chat mapping candidates
- unresolved partner rows fall back to `surface = other`, not `surface = chat`

### 10.3 Chat routing

- mapped NVIDIA chat models successfully route via `/v1/chat/completions`
- provider-aware auto selection only considers `surface = chat` and `autoSelectionEligible = true`
- a mapped NVIDIA model can be selected without special-case Kie-style path logic
- server-side mapping mutations reject non-chat or non-public rows even if the client bypasses UI filters

### 10.3a Auto-selection metadata

- the curated bootstrap set carries reviewed capability flags
- chat rows outside the curated bootstrap set are manual-only by default
- preserving the existing `gemini` `apiStyle` value does not regress current provider metadata contracts

### 10.4 Embeddings

- explicit internal NVIDIA embedding calls succeed for curated models
- unexpected vector formats or dimension mismatches fail fast with clear errors
- no implicit embedding fallback is enabled globally

### 10.5 Safety

- doc-only rerank models are not seeded as live enabled models
- no pricing is guessed from non-authoritative sources
- chat routing refuses models classified as non-chat

---

## 11. Test plan

### 11.1 Unit tests

- catalog normalization tests for NVIDIA-owned model IDs
- catalog normalization tests for observed partner non-chat rows
- dedupe tests for repeated model IDs from `/v1/models`
- admin merge tests proving non-chat surfaces are excluded from chat mappings
- provider template validation tests for `nvidia_nim`
- mutation validation tests proving non-chat rows cannot be inserted or bulk-enabled into `model_provider_map`
- contract tests proving the shared `apiStyle` enum still accepts `gemini`

### 11.2 Integration tests

- provider sync against a mocked `/v1/models` payload containing duplicates and mixed surfaces
- chat completion routing for a mapped NVIDIA model
- admin picker visibility tests for `surface` filtering
- auto-selection tests proving manual-only chat rows are excluded from provider-auto and global-auto resolution
- Python embedding provider tests with mocked vector responses

### 11.3 Manual verification

- sync a live NVIDIA provider in local admin
- verify the model list shows `ownedBy` and `surface`
- map `nvidia/llama-3.3-nemotron-super-49b-v1.5` and run a chat request
- verify that `nvidia/nv-embed-v1` is visible only in non-chat catalog contexts

---

## 12. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Live catalog shape changes | NVIDIA may add or remove models quickly | use live sync + overlay tests |
| Misclassification of niche models | some model IDs are not obviously chat vs non-chat | use curated exact-ID overrides first |
| Duplicate live rows | duplicate IDs already exist today | dedupe before merge |
| Embedding dimension mismatch | can break vector assumptions | explicit-only embedding rollout |
| Docs vs live mismatch | rerank appears in docs but not live catalog | defer rerank until verified |
| Partner model confusion | provider is NVIDIA, owner may be someone else | show `ownedBy` in admin |

---

## 13. Follow-up opportunities

- add verified rerank support once the hosted contract is stable
- add parse-model integration for document ingestion workflows
- add guardrail model wiring for moderation or PII pipelines
- add explicit multimodal chat support once NVIDIA vision request contracts are validated
- add curated pricing import if NVIDIA exposes stable machine-readable pricing
