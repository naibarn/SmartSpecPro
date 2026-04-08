# Section 04: Runtime Auto-Selection Gating

## Objective

Implement the runtime boundary that keeps NVIDIA Hosted rows safe after sync and admin review. This section does not add new sync behavior or admin write rules; instead, it makes sure the runtime only auto-selects rows that are explicitly eligible, while preserving current manual selection for enabled chat rows.

The runtime must support three distinct states:

1. `enabled + chat + autoSelectionEligible` rows can participate in provider-auto and global-auto selection
2. `enabled + chat + manual-only` rows can still be explicitly selected
3. stale, missing, non-chat, or non-public NVIDIA rows must not be considered runtime-eligible

## Scope

- Derive runtime auto-selection eligibility from provider catalog metadata.
- Suppress invalid NVIDIA mappings from the enabled runtime row set.
- Gate provider-auto and global-auto selection on `autoSelectionEligible`.
- Preserve explicit model selection for valid enabled chat rows even when they are manual-only.
- Keep capability-registry and planner/policy auto-resolution on the same filtered catalog-aware view of NVIDIA rows.
- Keep existing providers working without needing a separate migration for this feature if possible.

## Dependencies

- `section-01-shared-catalog-contracts`
- `section-02-nvidia-provider-sync`
- `section-03-admin-catalog-and-mutation-safety`

This section assumes the shared catalog metadata contract already exposes the NVIDIA rollout fields and that admin write paths reject non-chat/non-public mappings. Runtime gating should consume that contract rather than re-implementing classification.

## Files to Modify

| File | Change |
|---|---|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/enabledLlmModels.ts` | Derive runtime eligibility from provider catalog metadata and suppress invalid NVIDIA rows. |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatModelSelection.ts` | Require `autoSelectionEligible` for provider-auto/global-auto resolution. |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/intelligentModelSelector.ts` | Keep priority scoring unchanged, but ensure only eligible rows reach scoring for auto modes. |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/capabilityRegistry.ts` | Surface the runtime-visible eligibility/capability state used by auto-selection. |

No route-family changes are expected in this section unless the runtime loader needs a small helper import to preserve the existing selection contract.

## Implementation Tasks

1. Extend the enabled-model loader so each runtime row can be checked against the provider catalog row it came from.
2. Derive `autoSelectionEligible` from `llmProviders.availableModels` metadata when that metadata exists.
3. Track a small catalog eligibility snapshot on runtime rows, such as `public-chat`, `manual-only`, or `invalid`, so downstream runtime helpers do not have to infer state from partial fields.
4. For NVIDIA rows, exclude rows from the enabled runtime result when the current catalog state is missing, non-chat, internal-only, or otherwise no longer public.
5. Keep explicit selection behavior unchanged for enabled chat rows that are merely manual-only.
6. Update provider-auto and global-auto resolution so they only consider rows marked `autoSelectionEligible = true`.
7. Extract a shared helper or shared loader fragment so `enabledLlmModels.ts`, `loadEnabledModelsWithCapabilities()`, and `loadEnabledModelsWithPricing()` all consume the same provider-scoped catalog lookup and suppression logic.
8. Requirements-based automatic policy resolution in `capabilityRegistry.ts` must not reintroduce invalid or manual-only NVIDIA rows through its separate loaders.
9. Leave the existing priority scoring algorithm intact; this section only narrows the candidate set before scoring.
10. Make the eligibility check additive and safe for existing providers so legacy routing does not break because a new NVIDIA-only field is missing.

## TDD-First Test Stubs

Create or extend the following tests before implementation:

### `apps/web/server/services/chatModelSelection.test.ts`

- Test: provider-auto selection ignores NVIDIA manual-only rows.
- Test: global-auto selection ignores NVIDIA manual-only rows.
- Test: explicit selection still allows an enabled NVIDIA chat row that is manual-only.
- Test: stale NVIDIA mappings are not returned as runtime-eligible when catalog metadata no longer resolves to public chat.

### `apps/web/server/services/intelligentModelSelector.test.ts`

- Test: the selector still scores eligible rows using the existing priority rules.
- Test: manual-only rows are filtered out before scoring for auto modes.
- Test: reviewed NVIDIA bootstrap rows can still win selection when they satisfy the requested capabilities.

### `apps/web/server/services/capabilityRegistry.test.ts`

- Test: capability rows surface the NVIDIA runtime eligibility state expected by auto-selection.
- Test: missing metadata defaults to safe, non-auto behavior for NVIDIA rows.
- Test: `loadEnabledModelsWithCapabilities()` suppresses invalid NVIDIA mappings the same way as `enabledLlmModels.ts`.
- Test: `loadEnabledModelsWithPricing()` suppresses invalid NVIDIA mappings the same way as `enabledLlmModels.ts`.
- Test: requirements-based automatic policy resolution does not reintroduce manual-only NVIDIA rows.

### `apps/web/server/services/enabledLlmModels.ts`

- Test: runtime loading derives `autoSelectionEligible` from provider catalog metadata when present.
- Test: missing NVIDIA catalog metadata suppresses the row from the enabled runtime result.
- Test: existing non-NVIDIA enabled providers remain visible to the runtime loader.
- Test: provider-scoped runtime metadata lookup uses `providerId + providerModelId` rather than model ID alone.

## Risk Controls

- Do not introduce a new scoring algorithm in this section.
- Do not widen auto-selection to every synced NVIDIA row.
- Do not require a database migration unless the derived metadata path proves too awkward during implementation.
- Do not let stale NVIDIA mappings remain eligible once their catalog state is invalid.
- Do not change the existing explicit-selection behavior for valid enabled chat rows.
- Do not let `capabilityRegistry.ts` become a second unfiltered entry point that can see NVIDIA rows the chat runtime already rejected.

## Done Criteria

- Provider-auto and global-auto only consider eligible NVIDIA rows.
- Manual-only NVIDIA chat rows remain explicitly selectable but do not participate in auto mode.
- Invalid NVIDIA mappings are suppressed from runtime eligibility instead of being silently routed.
- Capability-registry auto/policy resolution sees the same filtered NVIDIA set as the chat runtime.
- Existing providers continue to work without surprising auto-selection regressions.
- The section’s tests fail before implementation and pass after the runtime gating changes are in place.
