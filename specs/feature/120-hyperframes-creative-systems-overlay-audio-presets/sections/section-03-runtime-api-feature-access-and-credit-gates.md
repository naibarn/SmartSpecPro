# Section 03: Runtime API, Feature Access, and Credit Gates

## Goal

Expose server APIs for creative presets and scoped final composite state while
reusing Feature 119 access, credit, and runtime projection patterns.

## In Scope

- `marketplaceCapture.listHyperframesCreativePresets`
- preserve existing Feature 119 procedures:
  `marketplaceCapture.createHyperframesFinalComposite`,
  `marketplaceCapture.getHyperframesRenderJob`,
  `marketplaceCapture.repairHyperframesRenderJob`,
  `marketplaceCapture.cancelHyperframesRenderJob`,
  `marketplaceCapture.saveHyperframesRenderToLibrary`, and
  `marketplaceCapture.listHyperframesTemplates`
- scoped Storyboard Review HyperFrames state mutation procedure, likely on
  `videoEditorProjects`
- additive Storyboard Review state APIs such as
  `videoEditorProjects.updateStoryboardReviewHyperframesState` and
  `videoEditorProjects.getStoryboardReview`
- final composite render creation with revision and creative hash guards
- additive feature access projection fields
- tenant/env gates for creative presets
- Admin Tenant Feature Flags metadata for any new creative flags
- credit/quota metadata for creative plans and audio packs
- exact Feature 119 runtime readiness and credit idempotency preservation
- router shape tests

## Out of Scope

- UI styling.
- Worker implementation.
- New billing product class beyond Feature 119 composition cost classes.

## Existing Files To Review

- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/services/hyperframesFeatureAccessService.ts`
- `apps/web/shared/hyperframes/featureAccess.ts`
- `apps/web/server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts`
- `apps/web/server/services/__tests__/hyperframesFeatureAccessService.test.ts`

## Test First

Add failing tests for:

- preset listing filters by tenant, worker readiness, template allowlist, and
  runtime capability;
- feature access projection preserves existing Feature 119 capability fields;
- exact Feature 119 capability fields remain parseable and are not renamed:
  `canStartAuto`, `canPreview`, `canCancel`, `canSaveToLibrary`,
  `canInspectAsOperator`, and `canReplayAsOperator`;
- additive Feature 120 projection containers should use stable names such as
  `creativeCapabilities`, `presetAvailability`, and `runtimeCapabilities`;
- exact feature-access flag projection keys remain compatible:
  `flags.enabled`, `flags.tenantAllowed`, `flags.workerEnabled`,
  `flags.librarySaveEnabled`, `flags.operatorEnabled`, and
  `flags.templateAllowlist`;
- creative fields are additive and do not break current consumers;
- render creation accepts and validates `storyboardReviewProjectId`,
  `expectedStoryboardReviewRevision`, `expectedCreativePlanHash`, and either
  legacy `config` or target `creativePlan`;
- render creation requires storyboard revision, creativePlanHash, timelineHash,
  and persisted shot assignments;
- `MARKETPLACE_HYPERFRAMES_RUNTIME_READY` blocks producer-only presets and
  final composite creation unless the backend runtime projection says the worker
  is ready;
- duplicate render idempotency does not double-charge;
- render credit idempotency keeps the existing exact key shape
  `hyperframes-credit:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{templateVersion}:{platformPresetId}`;
- final render blocks when credit/quota is not authorized;
- Library save blocks when `marketplaceHyperframesLibrarySaveEnabled` is false;
- operator-only diagnostics and cleanup require operator permission.
- Admin Tenant Feature Flags UI metadata includes new creative flags in the
  existing Media Production & HyperFrames group;
- final render request rejects stale product truth hash, stale evidence manifest
  hash, and unsupported copy plan status before credit reservation.
- unsupported preset requests fail before credit reservation or worker queueing,
  and return safe fallback mode / next-action copy when available.
- repair action projections are sanitized, permission-aware, and copy-covered.
- conflict responses are typed and user-actionable, not raw `Error` strings.

## Implementation Notes

The UI should only consume backend-derived access and preset availability. Avoid
page-local reimplementation of env flags, tenant flags, worker state, or credit
rules.

Keep Feature 119 idempotency forms and add creative hashes to metadata and
composition input hash where they affect output.

Evidence-bound copy APIs must preserve the `marketplace_capture_field` source
label exactly, because overlay/spec/price text can depend on captured product
fields without becoming LLM-authored claims.

## Acceptance Criteria

- API outputs are safe for normal users.
- Existing Product Detail and Storyboard Review runtime API tests still pass.
- Render CTAs are enabled only when server projection says they are valid.
- Producer-only presets cannot be selected when runtime is fallback-only unless
  they are clearly disabled with a safe reason.

## Rollback Notes

Hide creative preset listing and disable final composite mutation while keeping
Feature 119 runtime APIs active.
