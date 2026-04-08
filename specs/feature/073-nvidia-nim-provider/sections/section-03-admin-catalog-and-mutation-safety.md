# section-03-admin-catalog-and-mutation-safety

## Goal

Make the admin catalog safe for a multi-surface NVIDIA provider by ensuring that UI visibility, enablement mutations, and existing mapping reconciliation all respect the catalog metadata introduced in section 01 and populated by section 02.

This section is the main write-boundary for the feature. Sync can import the full NVIDIA hosted catalog, but admin mutations must still reject any row that is not a public chat model.

## Inputs and dependencies

This section depends on the shared catalog contract from `section-01-shared-catalog-contracts` and the NVIDIA sync/classification overlay from `section-02-nvidia-provider-sync`.

It should consume these concepts as already available:

- `surface`
- `ownedBy`
- `executionMode`
- `autoSelectionEligible`
- catalog rows that may be disabled, manual-only, deferred, or invalid

It must not invent any new routing semantics. Its job is to enforce the metadata that earlier sections expose.

## Files to change

- `apps/web/server/routers/multiProvider.ts`
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`
- `apps/web/client/src/locales/en/admin.json`
- `apps/web/client/src/locales/th/admin.json`

## Implementation details

### 1. Read-side catalog display

Extend admin catalog rows so operators can see the NVIDIA rollout state at a glance. The view should expose:

- `surface`
- `ownedBy`
- `executionMode`
- `autoSelectionEligible`
- `catalogEligibility`
- `catalogInvalidReason`

Recommended row semantics:

- `catalogEligibility = public-chat` for rows that are valid public chat candidates
- `catalogEligibility = manual-only` for valid chat rows that stay out of auto-selection
- `catalogEligibility = internal-only` for rows intentionally reserved for explicit internal use
- `catalogEligibility = deferred` for unresolved or intentionally postponed rows
- `catalogEligibility = invalid` for mapped rows whose current catalog state is missing or no longer eligible

`catalogInvalidReason` should be a small stable enum such as:

- `missing-catalog-row`
- `surface-not-chat`
- `execution-mode-not-public`
- `provider-disabled`
- `unknown`

The UI should make a clear distinction between:

- public chat rows
- internal or deferred rows
- auto-eligible rows
- manual-only rows
- stale or invalid mapped rows that remain in history but can no longer be activated

This is important because the provider sync imports the full hosted NVIDIA catalog, including partner models and non-chat surfaces. The catalog must remain inspectable even when rows are not yet eligible for chat enablement.

### 2. Filter the chat picker, but do not trust the picker alone

The admin picker should filter out obvious non-chat rows so the common path is easy to use, but the server must not trust the client filter.

The current admin model catalog can already materialize unmapped provider rows. For NVIDIA, that means the UI should still render valid catalog entries that are disabled or manual-only, while clearly marking rows that cannot be enabled for chat.

### 3. Harden write paths

The three mutation paths that matter most are:

- `bulkSetAdminModelCatalogEnabled`
- `bulkSetModelMappingsEnabled`
- `upsertModelMapping`

Before a write is accepted, the server must re-load the catalog row for the selected `providerId + providerModelId` and validate the current metadata.

Required rejection rules:

- reject when no catalog row exists
- reject when `surface !== "chat"`
- reject when `executionMode !== "public"`

This applies whether the request comes from an unmapped catalog row or from an existing mapping that the user is editing. The mutation boundary must be the final authority on whether a row can enter `model_provider_map`.

Implementation notes for this boundary:

- `bulkSetModelMappingsEnabled` currently starts from mapping IDs, so it must first load the mappings, recover `providerId + providerModelId`, and then run the same validation before any row is re-enabled
- any lookup table or cache used during validation, priority hydration, or synced metadata reuse must key rows by `${providerId}:${providerModelId}`, never by `providerModelId` alone
- the provider-scoped lookup rule matters because NVIDIA sync can import partner-hosted IDs that overlap with IDs surfaced by other providers

### 4. Reconcile existing mappings after sync changes

If a previously enabled NVIDIA mapping later becomes invalid because the catalog row disappears, is reclassified, or is no longer public chat, the admin layer must not silently keep treating it as healthy.

Expected behavior:

- keep the historical `model_provider_map` row instead of deleting it automatically
- mark the row as invalid in admin views when its catalog state is no longer eligible
- surface `catalogEligibility = invalid` with a stable `catalogInvalidReason` on those rows
- prevent the invalid row from being re-enabled
- ensure later runtime selection does not treat the row as a valid auto candidate

This non-destructive approach lets operators inspect what changed without losing the mapping history.

### 5. Preserve existing provider behavior

The admin safety rules must not regress existing providers.

Particular compatibility constraints:

- keep existing `apiStyle = gemini` values valid
- keep Kie provider rows working as they do today
- keep generic OpenAI-compatible rows unaffected when their catalog metadata is already valid

### 6. Keep canonical IDs stable

The admin layer should continue using the existing canonical model ID pattern. Do not introduce NVIDIA-specific aliasing unless the row already has an explicit existing alias convention.

The key safety invariant is that the canonical model ID shown in admin should still resolve to the same provider row that the write path validates.

## TDD expectations

Write tests before changing the implementation.

### Server-side tests

Add or extend tests in `apps/web/server/routers/multiProvider.test.ts` to cover:

- unmapped NVIDIA rows render in the catalog with the new metadata fields
- mapped invalid NVIDIA rows render with `catalogEligibility = invalid` and a stable reason
- a valid NVIDIA chat row can still be enabled
- a `surface = embedding` row cannot be enabled
- a `surface = guardrail` row cannot be enabled
- a row with `executionMode = internal-only` cannot be enabled
- a row with `executionMode = deferred` cannot be enabled
- `bulkSetModelMappingsEnabled` cannot re-enable an invalid NVIDIA mapping by ID
- provider-scoped validation does not confuse same `providerModelId` values across providers
- a mapping that becomes invalid after sync is excluded from the enabled set
- invalid mappings are not silently re-enabled

### Client-side tests

Add or extend tests in `apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts` to cover:

- catalog filtering keeps valid chat rows visible
- catalog filtering keeps disabled or manual-only rows visible but clearly marked
- invalid mapped rows surface their invalid state and reason clearly
- search still works across provider name, provider model ID, and the new NVIDIA metadata
- admin selection keys remain stable for mapped and unmapped rows

### Localization tests or snapshots

If the admin UI uses snapshot-heavy rendering or localization assertions, add coverage for:

- `surface` labels
- `auto-eligible` vs `manual-only` text
- internal/deferred row badges

## Implementation boundaries

This section should not:

- change the NVIDIA sync payload shape
- add auto-selection scoring logic
- add embedding routing
- add rerank support

Those belong to other sections. This section is strictly about making admin visibility and mutation safety line up with the catalog truth.

## Exit criteria

This section is complete when:

- admin users can inspect NVIDIA rows with surface and rollout metadata
- invalid mapped rows expose a stable admin-visible eligibility state and reason
- only public chat rows can be enabled or upserted into `model_provider_map`
- the ID-based enable path cannot bypass catalog validation
- stale or reclassified mappings are treated as invalid rather than silently trusted
- existing provider behavior remains unchanged
- tests cover both the happy path and the rejection path for NVIDIA admin rows
