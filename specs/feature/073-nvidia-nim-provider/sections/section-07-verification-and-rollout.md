# Section 07: Verification and Rollout

## Goal

Close the NVIDIA NIM Hosted rollout with end-to-end verification, regression safety, and a controlled enablement path.

This section does not add new catalog semantics, routing behavior, or embedding behavior. Its job is to prove that the earlier sections work together, that the full hosted catalog can land safely while remaining disabled by default, and that the team has a clear path to validate, monitor, and back out the feature if needed.

## Why this section exists last

The NVIDIA feature spans multiple layers:

- shared metadata contracts
- hosted catalog sync and classification
- admin write safety
- runtime auto-selection gating
- chat routing
- explicit internal embeddings

Each of those pieces can pass its own unit tests and still fail as a combined system if the rollout path is not explicitly verified. This section provides the final integration checks and operational guardrails.

## Inputs and dependencies

This section depends on every earlier section:

- `section-01-shared-catalog-contracts`
- `section-02-nvidia-provider-sync`
- `section-03-admin-catalog-and-mutation-safety`
- `section-04-runtime-auto-selection-gating`
- `section-05-chat-routing-and-provider-integration`
- `section-06-python-internal-embeddings`

It should assume the following are already true:

- the shared catalog contract carries `surface`, `ownedBy`, `executionMode`, and `autoSelectionEligible`
- NVIDIA sync imports the full hosted catalog and classifies rows conservatively
- admin mutations reject non-chat or non-public rows
- runtime auto-selection only considers reviewed eligible rows
- NVIDIA chat routing uses the existing OpenAI-compatible path
- NVIDIA embeddings are explicit and internal-only

## Files to touch

This section is primarily about tests, verification, and rollout documentation. If implementation changes are needed, they should be limited to small follow-up fixes already implied by the earlier sections.

Likely verification files:

- `apps/web/server/routers/multiProvider.test.ts`
- `apps/web/server/routers/llmProviders.test.ts`
- `apps/web/server/services/chatModelSelection.test.ts`
- `apps/web/server/services/intelligentModelSelector.test.ts`
- `apps/web/server/services/capabilityRegistry.test.ts`
- `apps/web/server/_core/llmRoutes.unit.test.ts`
- `python-backend/tests/unit/api/test_internal_embeddings.py`
- `python-backend/tests/unit/llm_proxy/test_gateway_unified_knplabs.py`
- `python-backend/tests/unit/services/test_memory_embedding.py`

If the implementation introduces a small rollout helper, keep it local and narrowly scoped. Do not add a new general rollout framework for this feature.

## Implementation details

### 1. Verify the full synchronized catalog stays disabled by default

The rollout must prove that syncing the full NVIDIA hosted catalog does not activate everything automatically.

The expected system behavior is:

- the provider sync can import NVIDIA-owned and partner-owned rows
- imported rows are visible in admin
- imported rows remain disabled for chat until explicitly enabled
- manual review remains the primary operator action

This is the main guardrail that makes the "sync all, but keep disabled" decision safe.

### 2. Verify the reviewed auto-selection subset only

The runtime must only use the curated bootstrap set for provider-auto and global-auto selection.

The implementation should verify:

- reviewed NVIDIA rows are eligible for auto-selection
- manual-only chat rows remain explicitly selectable but are excluded from auto modes
- partner rows remain manual-only unless later reviewed
- invalid or stale NVIDIA mappings never re-enter the auto-selection pool

This section should treat the reviewed subset as the rollout contract, not as an optimization detail.

### 3. Verify admin safety end to end

The admin layer should be verified as a complete boundary, not only a UI convenience.

The expected checks are:

- a valid NVIDIA chat row can be enabled
- an embedding row cannot be enabled
- a guardrail row cannot be enabled
- an internal-only row cannot be enabled
- a row that becomes invalid after sync is surfaced as invalid rather than silently trusted

The point of these checks is to confirm that the sync catalog and write boundary stay aligned after the rest of the feature lands.

### 4. Verify chat routing remains ordinary

The NVIDIA chat integration should be intentionally boring at runtime.

Verification should prove:

- mapped NVIDIA chat rows route through the existing OpenAI-compatible chat-completions path
- no new NVIDIA-only route family is needed in phase 1
- existing Kie and generic OpenAI-compatible providers still behave as before

If this section needs additional routing tests, they should be regression tests, not new routing logic.

### 5. Verify explicit embeddings without changing retrieval defaults

The explicit NVIDIA embedding path must remain isolated from the default retrieval flow.

Verification should prove:

- the internal embeddings API can request NVIDIA embeddings explicitly
- allowlisted models are accepted and validated
- malformed vectors fail fast
- the default query embedding path remains unchanged

This section should explicitly avoid a migration test for the general retrieval system because that migration is out of scope.

### 6. Define rollout stages

The rollout should be staged so operators can verify each layer before expanding usage.

Recommended stages:

1. Sync-only stage
   - import the full hosted catalog
   - keep rows disabled by default
   - confirm admin visibility and metadata rendering
2. Manual enablement stage
   - enable a small number of reviewed NVIDIA chat rows
   - verify chat routing for those mappings
3. Auto-selection stage
   - enable only the reviewed bootstrap set for provider-auto/global-auto
   - confirm manual-only rows remain excluded
4. Explicit embeddings stage
   - validate NVIDIA embeddings through the internal API only
   - keep default retrieval behavior untouched

The rollout should not move to the next stage until the previous one has been verified in the same environment.

### 7. Define rollback and failure handling

The plan needs a straightforward rollback posture.

If the rollout reveals problems, the first recovery actions should be:

- disable the NVIDIA provider
- disable any newly enabled NVIDIA mappings
- leave the synced catalog rows in place for inspection
- avoid deleting mapping history unless there is a separate operational reason

This non-destructive rollback matches the earlier reconciliation rule and preserves operator visibility into what changed.

### 8. Keep deferred work deferred

Verification should also prove what is not happening yet:

- no rerank rollout
- no implicit retrieval fallback
- no migration or re-embed jobs
- no owner-wide partner whitelist

This matters because the NVIDIA catalog is large enough that deferred work could otherwise creep into the rollout under the guise of completion.

## TDD expectations

Write these tests before treating the feature as complete.

### End-to-end Node tests

Add or extend tests to cover:

- Test: full NVIDIA sync imports rows but leaves them disabled by default
- Test: reviewed NVIDIA chat rows can be enabled manually and routed successfully
- Test: manual-only NVIDIA chat rows are excluded from provider-auto and global-auto selection
- Test: invalid NVIDIA mappings are not eligible after sync changes
- Test: existing Kie and generic provider behavior stays green

### Admin and runtime regression tests

Add or extend tests to cover:

- Test: the admin catalog still renders NVIDIA rollout metadata after a full sync
- Test: chat-only selection continues to ignore embedding and guardrail rows
- Test: provider-auto selection only considers the reviewed bootstrap set
- Test: manual selection still works for valid chat rows even when they are not auto-eligible

### Python regression tests

Add or extend tests to cover:

- Test: explicit NVIDIA embeddings work through the internal API
- Test: the default retrieval/query embedding path remains unchanged
- Test: KNPLabs and OpenAI embedding branches still work after NVIDIA support lands

### Rollout verification checks

Add a lightweight verification checklist to the plan or release notes for:

- provider enabled state
- catalog row visibility
- manual chat enablement
- auto-selection eligibility
- explicit embeddings
- rerank still deferred

## Implementation boundaries

This section should not:

- add new catalog classification rules
- modify the provider sync payload shape
- change admin write semantics
- introduce a new runtime scoring algorithm
- change the default retrieval embedding path
- add rerank support

Its role is to prove that the earlier sections already did the hard work safely and that the feature can be rolled out and backed out without surprise.

## Exit criteria

This section is complete when:

- the full NVIDIA hosted catalog can be synced and inspected while staying disabled by default
- only the reviewed bootstrap set participates in auto-selection
- manual-only rows remain explicitly selectable but excluded from auto modes
- chat routing works for reviewed NVIDIA chat mappings
- explicit NVIDIA embeddings work through the internal API
- rollback is non-destructive and operator-friendly
- rerank and implicit retrieval changes remain clearly deferred
