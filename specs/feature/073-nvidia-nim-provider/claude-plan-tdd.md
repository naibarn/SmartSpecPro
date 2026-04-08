# TDD Plan - NVIDIA NIM Hosted Provider

Date: 2026-04-07
Planning directory: `specs/feature/073-nvidia-nim-provider`
Companion file: `claude-plan.md`

## 1. Objective

Write tests first for the provider onboarding, catalog classification, admin safety boundaries, runtime selection gating, and explicit Python embedding flow before implementing code changes.

## 2. Delivery scope

### 2.1 In scope

Test stubs to add before implementation:

- provider template hydration for `nvidia_nim`
- native sync normalization and duplicate-ID dedupe
- metadata preservation for `ownedBy`, `surface`, `executionMode`, and `autoSelectionEligible`
- admin read-side catalog rendering expectations
- write-side rejection of non-chat and non-public rows
- runtime auto-selection gating for manual-only vs auto-eligible rows
- explicit Python embedding provider validation

### 2.2 Out of scope

No phase 1 tests should target:

- rerank routing
- implicit retrieval embedding fallback
- migration or re-embed jobs
- self-hosted NIM behavior

## 3. Architecture summary

Tests should reflect the intended architecture:

1. sync and classify into `llmProviders.availableModels`
2. render admin rows from catalog metadata
3. allow only reviewed public chat rows into chat mappings
4. derive runtime auto-selection state from provider catalog metadata
5. keep Python embeddings explicit/internal-only

## 4. Design decisions resolved in this plan

### 4.1 Sync the full hosted catalog, but keep it disabled by default

Test stubs:

- Test: syncing NVIDIA imports both NVIDIA-owned and partner-owned rows into `availableModels`
- Test: synced rows do not automatically create enabled `model_provider_map` entries
- Test: unmapped NVIDIA catalog rows appear disabled in the admin catalog view

### 4.2 Use conservative classification for partner rows

Test stubs:

- Test: `snowflake/arctic-embed-l` classifies as `embedding`
- Test: `meta/llama-guard-4-12b` classifies as `guardrail`
- Test: `ibm/granite-guardian-3.0-8b` classifies as `guardrail`
- Test: unknown partner rows fall back to `surface = other`, `executionMode = deferred`, `autoSelectionEligible = false`

### 4.3 Keep auto-selection narrower than the synced chat catalog

Test stubs:

- Test: reviewed NVIDIA bootstrap IDs load as `autoSelectionEligible = true`
- Test: other synced chat rows load as manual-only by default
- Test: partner chat rows remain manual-only until explicitly reviewed

### 4.4 Derive `autoSelectionEligible` from provider catalog metadata in phase 1

Test stubs:

- Test: enabled-model loader maps `autoSelectionEligible` from catalog metadata by `providerModelId`
- Test: missing catalog metadata yields `autoSelectionEligible = false`
- Test: NVIDIA rows whose current catalog metadata is missing or non-public are excluded from enabled runtime rows

### 4.5 Keep embeddings explicit/internal-only

Test stubs:

- Test: internal embeddings API accepts NVIDIA as an explicit provider
- Test: default retrieval/query embedding services remain unchanged by NVIDIA onboarding

## 5. Workstream A - Shared metadata and classification contracts

### 5.1 Files

Primary test files:

- `apps/web/server/routers/llmProviders.test.ts`
- new or existing tests near `llmProviderCatalog.ts`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts`

### 5.2 Required changes

Test stubs:

- Test: shared `availableModels` contract accepts `ownedBy`
- Test: shared `availableModels` contract accepts `surface`
- Test: shared `availableModels` contract accepts `executionMode`
- Test: shared `availableModels` contract accepts `autoSelectionEligible`
- Test: existing `apiStyle = gemini` remains valid

### 5.3 Classification helpers

Test stubs:

- Test: reviewed NVIDIA chat IDs classify as `surface = chat`
- Test: reviewed NVIDIA embedding IDs classify as `surface = embedding`
- Test: reviewed NVIDIA parse IDs classify as `surface = parse`
- Test: reviewed NVIDIA guardrail IDs classify as `surface = guardrail`
- Test: classification heuristics do not turn ambiguous partner rows into chat
- Test: chat allowlist rows receive `executionMode = public`
- Test: non-chat rows receive `executionMode = internal-only` or `deferred` as intended

### 5.4 Why this workstream comes first

Test stubs:

- Test: admin and runtime consumers can read the expanded metadata shape without breaking legacy provider rows

## 6. Workstream B - NVIDIA provider template and native sync

### 6.1 Files

Primary test files:

- `apps/web/server/routers/llmProviders.test.ts`
- new or existing tests for `modelSyncService.ts`

### 6.2 Provider template

Test stubs:

- Test: `resolveProviderCatalogDefaults()` hydrates `nvidia_nim` with expected display name, base URL, and default model
- Test: legacy provider rows without stored `availableModels` still hydrate correctly after the new template is added

### 6.3 Native sync enablement

Test stubs:

- Test: `nvidia_nim` uses native `/v1/models` sync instead of OpenRouter fallback
- Test: native NVIDIA sync preserves `owned_by`
- Test: NVIDIA sync normalizes display names from hosted IDs
- Test: NVIDIA sync applies classification overlay during merge

### 6.4 Dedupe behavior

Test stubs:

- Test: duplicate hosted IDs are collapsed before merge
- Test: repeated feed rows do not create duplicate catalog entries

### 6.5 Catalog defaults after sync

Test stubs:

- Test: every synced NVIDIA row ends with a non-empty rollout state
- Test: no unresolved row defaults to public chat

## 7. Workstream C - Admin catalog and mutation hardening

### 7.1 Files

Primary test files:

- `apps/web/server/routers/multiProvider.test.ts`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts`

### 7.2 Read-side admin behavior

Test stubs:

- Test: admin catalog rows expose `surface`, `ownedBy`, `executionMode`, and `autoSelectionEligible`
- Test: admin catalog rows expose `catalogEligibility` and `catalogInvalidReason`
- Test: mapped rows inherit metadata from the catalog row
- Test: unmapped rows remain visible and searchable with NVIDIA metadata present

### 7.3 Write-side hardening

Test stubs:

- Test: bulk enable rejects rows with `surface != chat`
- Test: bulk enable rejects rows with `executionMode != public`
- Test: `bulkSetModelMappingsEnabled` rejects re-enabling a mapped NVIDIA row whose current catalog state is no longer public chat
- Test: direct mapping upsert rejects rows with `surface != chat`
- Test: direct mapping upsert rejects rows with `executionMode != public`
- Test: enabling a valid NVIDIA chat row still succeeds
- Test: provider-scoped bulk-lookup caches do not confuse same `providerModelId` values from different providers

### 7.4 Canonical model IDs

Test stubs:

- Test: NVIDIA rows keep canonical IDs close to `providerModelId` when no aliasing rule applies

### 7.5 Reconciliation behavior for existing mappings

Test stubs:

- Test: admin marks a mapped NVIDIA row invalid when its catalog row disappears
- Test: admin marks a mapped NVIDIA row invalid when its catalog row is no longer public chat
- Test: invalid mapped rows surface a stable `catalogInvalidReason`
- Test: invalid NVIDIA mappings are excluded from auto-selection
- Test: invalid NVIDIA mappings cannot be re-enabled after disablement

## 8. Workstream D - Enabled-model loading and auto-selection

### 8.1 Files

Primary test files:

- `apps/web/server/services/chatModelSelection.test.ts`
- `apps/web/server/services/intelligentModelSelector.test.ts`
- `apps/web/server/services/capabilityRegistry.test.ts`
- new or existing tests for `enabledLlmModels.ts`

### 8.2 Enabled-model loader

Test stubs:

- Test: enabled-model loader derives `autoSelectionEligible` from provider catalog metadata
- Test: missing catalog metadata yields manual-only behavior
- Test: invalid NVIDIA mappings are suppressed from enabled runtime rows
- Test: runtime metadata lookup is keyed by `providerId + providerModelId`, not by model ID alone

### 8.3 Auto-selection filter

Test stubs:

- Test: provider-auto excludes manual-only NVIDIA rows
- Test: global-auto excludes manual-only NVIDIA rows
- Test: explicit selection still allows enabled manual-only NVIDIA chat rows
- Test: capability-driven automatic policy resolution excludes manual-only NVIDIA rows

### 8.4 Capability behavior

Test stubs:

- Test: reviewed bootstrap NVIDIA rows expose expected capability flags
- Test: unreviewed rows default unknown capabilities to false
- Test: partner chat rows do not become auto-eligible without reviewed metadata
- Test: `loadEnabledModelsWithCapabilities()` suppresses invalid NVIDIA mappings the same way as `enabledLlmModels.ts`
- Test: `loadEnabledModelsWithPricing()` suppresses invalid NVIDIA mappings the same way as `enabledLlmModels.ts`
- Test: `resolveModelsForPolicy()` cannot reintroduce invalid or manual-only NVIDIA rows through capability-registry loaders

### 8.5 Priority behavior

Test stubs:

- Test: current priority scoring continues to sort reviewed NVIDIA rows without new scoring logic

## 9. Workstream E - Chat runtime integration

### 9.1 Files

Primary test files:

- `apps/web/server/_core/llmRoutes.unit.test.ts`
- optional NVIDIA-specific routing test if needed

### 9.2 Runtime behavior

Test stubs:

- Test: mapped NVIDIA chat models resolve to the standard chat-completions route family
- Test: NVIDIA chat routing does not require Kie-specific path branching
- Test: standard OpenAI-compatible payload handling remains unchanged for generic providers

### 9.3 Expected code change size

Test stubs:

- Test: existing non-NVIDIA route-family behavior stays green after NVIDIA support lands

## 10. Workstream F - Python internal embeddings

### 10.1 Files

Primary test files:

- `python-backend/tests/unit/api/test_internal_embeddings.py`
- new unit tests for `nvidia_nim_provider.py`

### 10.2 Provider abstraction

Test stubs:

- Test: NVIDIA embedding provider accepts only allowlisted models
- Test: NVIDIA embedding provider rejects unknown models
- Test: NVIDIA embedding provider returns numeric vectors
- Test: NVIDIA embedding provider rejects malformed embedding payloads
- Test: NVIDIA embedding provider enforces expected dimensions when known

### 10.3 Internal API integration

Test stubs:

- Test: internal embeddings API dispatches to NVIDIA provider when requested
- Test: existing OpenAI and KNPLabs provider branches remain unchanged
- Test: NVIDIA requests return a clear 503/configuration error when `NVIDIA_NIM_API_KEY` is missing
- Test: NVIDIA requests honor `NVIDIA_NIM_BASE_URL` when explicitly configured
- Test: no phase 1 test changes are required for `queryEmbeddingService.ts`

## 11. Testing strategy

### 11.1 Web / Node tests

Red phase test order:

1. provider template and shared metadata contract tests
2. sync dedupe and classification tests
3. admin mutation rejection tests
4. enabled-model and auto-selection gating tests
5. chat runtime route-family tests

### 11.2 Python tests

Red phase test order:

1. NVIDIA provider allowlist and vector validation tests
2. internal embeddings API provider-branch tests
3. regression checks for existing providers

## 12. Rollout and migration considerations

### 12.1 Database migration stance

Test stubs:

- Test: derived `autoSelectionEligible` path works without a new mapping-table column
- If fallback migration is chosen during implementation:
  - Test: migrated rows preserve previous enabled behavior while storing explicit auto-selection state

### 12.2 Backward compatibility

Test stubs:

- Test: Kie catalog behavior remains intact
- Test: Gemini `apiStyle` behavior remains intact
- Test: generic OpenAI-compatible sync behavior remains intact

### 12.3 Seed behavior

Test stubs:

- Test: provider seed creates the `nvidia_nim` row and defaults without freezing a giant hosted model list into source control

## 13. Implementation sequence

Before each implementation workstream, the corresponding failing tests should be added first, then implementation should make them pass in the same order described in `claude-plan.md`.

## 14. Risks and mitigations

### 14.1 Misclassification risk

Test stubs:

- Test: ambiguous rows fail closed instead of becoming public chat

### 14.2 Runtime drift risk

Test stubs:

- Test: stale NVIDIA mappings do not remain runtime-eligible when catalog state is invalid

### 14.3 Capability drift risk

Test stubs:

- Test: manual-only rows are excluded from auto modes even when enabled

### 14.4 Embedding regression risk

Test stubs:

- Test: query embedding assumptions remain unchanged after NVIDIA onboarding

## 15. Completion criteria

The TDD portion is complete when the repository has failing-then-passing coverage for:

- NVIDIA provider template hydration
- sync dedupe and classification
- admin mutation safety boundaries
- auto-selection gating
- standard chat-completions routing
- explicit internal NVIDIA embeddings
