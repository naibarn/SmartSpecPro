<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: cd apps/web && npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-catalog-contracts
section-02-nvidia-provider-sync
section-03-admin-catalog-and-mutation-safety
section-04-runtime-auto-selection-gating
section-05-chat-routing-and-provider-integration
section-06-python-internal-embeddings
section-07-verification-and-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-shared-catalog-contracts | - | 02, 03, 04, 06 | No |
| section-02-nvidia-provider-sync | 01 | 03, 04, 05, 07 | No |
| section-03-admin-catalog-and-mutation-safety | 01, 02 | 04, 07 | Yes |
| section-04-runtime-auto-selection-gating | 01, 02, 03 | 05, 07 | No |
| section-05-chat-routing-and-provider-integration | 02, 04 | 07 | Yes |
| section-06-python-internal-embeddings | 01 | 07 | Yes |
| section-07-verification-and-rollout | 02, 03, 04, 05, 06 | - | No |

## Execution Order

1. `section-01-shared-catalog-contracts`
2. `section-02-nvidia-provider-sync`
3. `section-03-admin-catalog-and-mutation-safety`, `section-06-python-internal-embeddings` in parallel
4. `section-04-runtime-auto-selection-gating`
5. `section-05-chat-routing-and-provider-integration`
6. `section-07-verification-and-rollout`

## Section Summaries

### section-01-shared-catalog-contracts

Extend the shared `availableModels` metadata contract, define NVIDIA classification helpers, preserve backward compatibility with existing provider metadata, and align admin/client/server types around `ownedBy`, `surface`, `executionMode`, and `autoSelectionEligible`.

### section-02-nvidia-provider-sync

Add the `nvidia_nim` provider template, enable native `/v1/models` sync, dedupe duplicate hosted IDs, preserve owner metadata, and apply the NVIDIA normalization/classification overlay during catalog merge.

### section-03-admin-catalog-and-mutation-safety

Update admin catalog rendering to expose NVIDIA rollout metadata and harden all chat-mapping write paths so only `surface = chat` and `executionMode = public` rows can enter or re-enter `model_provider_map`.

### section-04-runtime-auto-selection-gating

Update enabled-model loading, auto-selection, and capability-aware runtime behavior so manual-only rows stay out of provider-auto/global-auto flows and invalid NVIDIA mappings are suppressed from runtime eligibility.

### section-05-chat-routing-and-provider-integration

Integrate NVIDIA with the existing OpenAI-compatible chat runtime, keep route-family behavior simple, and add focused runtime tests to prove mapped NVIDIA chat rows use the standard chat-completions path without Kie-style special cases.

### section-06-python-internal-embeddings

Add explicit internal NVIDIA embedding support in the Python backend, following the KNPLabs provider pattern with allowlists, response validation, and dimension checks, while keeping the default retrieval embedding flow unchanged.

### section-07-verification-and-rollout

Finish the feature with focused test coverage, regression checks across existing providers, rollout validation for manual-only vs auto-eligible behavior, and documentation-level verification that rerank and implicit retrieval changes remain deferred.
