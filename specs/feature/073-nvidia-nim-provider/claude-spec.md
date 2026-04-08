# Implementation Spec - NVIDIA NIM Hosted Provider

Date: 2026-04-07
Planning directory: `specs/feature/073-nvidia-nim-provider`
Source inputs:

- `spec.md`
- `claude-research.md`
- `claude-interview.md`

## 1. Problem and outcome

SmartSpecPro needs to onboard NVIDIA NIM Hosted as a new LLM provider while keeping the current chat-centric admin and runtime stack safe.

The hosted NVIDIA catalog is not chat-only. It mixes:

- chat and instruct models
- embeddings and retrieval models
- parse models
- guardrail and safety models
- reward models
- translation models
- multimodal and vision models
- partner-owned models served through the NVIDIA hosted gateway

The required outcome for phase 1 is:

1. Add a new LLM provider slug `nvidia_nim`
2. Sync the hosted `/v1/models` catalog into `llm_providers.availableModels`
3. Preserve richer metadata such as `ownedBy`, `surface`, and rollout state
4. Keep current `model_provider_map` chat-only and prevent non-chat rows from entering it
5. Support ordinary NVIDIA chat routing through `/v1/chat/completions`
6. Support explicit internal NVIDIA embeddings without changing the default retrieval embedding path

## 2. External contract assumptions

The planning work treats the following as verified external inputs on 2026-04-07:

- hosted base URL: `https://integrate.api.nvidia.com`
- hosted model list endpoint: `GET /v1/models`
- hosted chat endpoint family: `/v1/chat/completions`
- hosted embeddings endpoint family: `/v1/embeddings`
- live `/v1/models` currently returns duplicate IDs and mixed owners
- official docs describe retrieval and rerank families, but the live hosted model list does not currently expose `rerank` IDs

Source-of-truth rule:

- live `/v1/models` governs automatic sync
- official docs enrich metadata and safety decisions
- docs do not override live availability

## 3. Phase 1 product decisions

### 3.1 Sync policy

Phase 1 syncs the full hosted NVIDIA catalog, including partner-owned rows, but synced rows are disabled by default in the current chat mapping workflow.

Consequences:

- admins can inspect the full hosted catalog
- synced rows do not become active chat mappings automatically
- review and enablement remain explicit

### 3.2 Classification policy

Every synced row must receive conservative metadata:

- `ownedBy`
- `surface`
- `executionMode`
- `autoSelectionEligible`
- `apiStyle` when the row is chat-eligible

Supported `surface` values:

- `chat`
- `embedding`
- `parse`
- `guardrail`
- `reward`
- `translation`
- `multimodal`
- `other`

Classification rule order:

1. exact-ID overrides
2. owner-agnostic non-chat heuristics such as `embed`, `parse`, `rerank`, `reward`, `guard`, `guardian`, `safety`, `pii`, `translate`, `clip`, and clearly multimodal `vl`
3. explicit reviewed chat allowlist or reviewed chat-family rules
4. conservative fallback

Conservative fallback means:

- `surface = other`
- `executionMode = deferred`
- `autoSelectionEligible = false`

No owner-wide whitelist is allowed in phase 1.

### 3.3 Chat mapping policy

Current `model_provider_map` remains the runtime source of truth for enabled chat models.

Only rows with all of the following may enter phase 1 chat mappings:

- `surface = chat`
- `executionMode = public`
- reviewed provider model metadata

This must be enforced in server mutations, not just in UI filtering.

### 3.4 Auto-selection policy

Phase 1 auto-selection is intentionally narrower than the full synced catalog.

Rules:

- all synced chat rows may be visible for manual review
- only a small reviewed NVIDIA-owned subset participates in provider-auto or global-auto selection
- partner rows remain manual-only in phase 1 unless explicitly reviewed later

Initial `autoSelectionEligible = true` subset:

- `nvidia/llama-3.3-nemotron-super-49b-v1.5`
- `nvidia/llama-3.1-nemotron-70b-instruct`
- `nvidia/llama-3.1-nemotron-nano-8b-v1`
- `nvidia/llama3-chatqa-1.5-70b`

All other synced chat rows default to:

- `autoSelectionEligible = false`
- manual-only selection

### 3.5 Capability policy

The current runtime treats missing capability flags conservatively, so reviewed capability metadata is mandatory for any auto-eligible row.

Phase 1 rules:

- unknown capabilities default to `false`
- do not infer high-risk capabilities such as `supportsResponses`, `supportsWebSearch`, `supportsFunctionTools`, `supportsStructuredOutputs`, or `supportsVision` from the model name alone without supporting docs or explicit reviewed evidence
- only the reviewed auto-eligible subset needs curated capability defaults in phase 1

### 3.6 Embedding policy

Embeddings are explicit/internal-only in phase 1.

Included:

- internal/admin embedding calls for curated NVIDIA embedding models
- model allowlist validation
- dimension validation when known

Excluded:

- implicit retrieval embedding fallback
- migration jobs
- re-embed jobs
- vector schema migration

### 3.7 Rerank policy

Rerank is deferred.

Phase 1 does not include:

- rerank model sync as active feature behavior
- rerank routing
- rerank admin mapping

This remains deferred until the live hosted contract is verifiable from official sources and runtime behavior.

## 4. Required implementation surfaces

### 4.1 Provider template and catalog contracts

The implementation must add `nvidia_nim` to the provider templates and extend the shared `availableModels` contract without regressing existing providers.

Important compatibility constraint:

- preserve the existing shared `apiStyle` enum including `gemini`

### 4.2 Native sync and normalization

The NVIDIA provider must use native `/v1/models` sync, with:

- duplicate-ID dedupe
- owner preservation
- display-name normalization
- surface classification
- rollout metadata overlay

This is not only a sync change. It is a sync-plus-normalization change.

### 4.3 Admin catalog and mutation hardening

The admin catalog must show richer metadata for NVIDIA rows while the write boundary stays safe.

Read-side changes:

- show `surface`
- show `ownedBy`
- show auto-selection status such as `auto-eligible` or `manual-only`
- keep non-chat rows out of current chat enablement filters

Write-side changes:

- `bulkSetAdminModelCatalogEnabled` must reject rows that are not `surface = chat`
- `upsertModelMapping` must reject rows that are not `surface = chat`
- unresolved or internal-only rows must never become enabled chat mappings through direct client submission

### 4.4 Enabled-model pipeline and runtime selection

If phase 1 persists `autoSelectionEligible` as runtime state, the enabled-model pipeline must carry it through:

- schema
- enabled model loader
- provider-auto selection
- global-auto selection
- capability registry and priority logic

Runtime behavior target:

- explicit model selection may use any enabled chat mapping
- auto modes may use only enabled chat mappings with `autoSelectionEligible = true`

### 4.5 Chat routing

NVIDIA chat routing should use the existing OpenAI-compatible chat-completions path.

Phase 1 does not require:

- Kie-style family-specific URL routing
- custom request-body family switching beyond standard OpenAI-compatible chat behavior

### 4.6 Python internal embeddings

The preferred phase 1 extension point is the existing internal embeddings API and provider-branching pattern in Python.

The implementation should:

- add explicit NVIDIA embedding provider support
- use a curated allowlist
- validate vector payloads and expected dimensions
- stay isolated from the default query embedding flow

## 5. Risks to account for in planning

The plan must explicitly address these risks:

1. non-chat rows entering `model_provider_map` through write paths
2. partner non-chat rows being misclassified as chat
3. auto-selection silently excluding or mis-scoring NVIDIA rows because capability metadata is missing
4. embedding dimension mismatch breaking retrieval assumptions
5. docs/live mismatch around rerank leading to over-implementation

## 6. Acceptance expectations

The implementation is only complete when:

- `nvidia_nim` exists as a provider template
- sync imports the full hosted catalog and dedupes duplicate IDs
- synced rows preserve `ownedBy`
- synced rows receive conservative `surface` and rollout metadata
- server write paths reject non-chat and non-public rows from chat mappings
- NVIDIA chat models can route through `/v1/chat/completions`
- auto-selection considers only reviewed auto-eligible NVIDIA rows
- NVIDIA embeddings work only through explicit internal/admin flows
- rerank remains deferred and inactive
