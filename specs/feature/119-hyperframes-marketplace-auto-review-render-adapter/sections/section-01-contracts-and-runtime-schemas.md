# Section 01: Contracts and Runtime Schemas

## Goal

Create the shared contract layer for HyperFrames Marketplace Auto Review before any server or UI implementation. This section defines the stable types, schemas, status vocabulary, launch modes, and runtime API shapes used by all later sections.

The contract layer must make the new Auto Storyboard Review path additive. It must not weaken or replace the existing Standard Order `startAutoReview` flow.

## In Scope

- Shared TypeScript and Zod contracts under `apps/web/shared/hyperframes/`.
- Runtime API input and output schemas for all new tRPC procedures.
- Status, blocker, next action, and feature access projections.
- Launch mode contracts that explicitly distinguish `auto_storyboard_review` from `standard_order`.
- Template, platform, composition, artifact, QA, provenance, and Library finalize metadata shapes.
- Contract tests that fail before implementation.

## Out of Scope

- No HyperFrames dependency install.
- No worker implementation.
- No router wiring.
- No UI component implementation.
- No database schema migration unless a later section proves the existing artifact/outbox state cannot support MVP.

## Files To Create

- `apps/web/shared/hyperframes/contracts.ts`
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts`
- `apps/web/shared/hyperframes/autoPlan.ts`
- `apps/web/shared/hyperframes/featureAccess.ts`
- `apps/web/shared/hyperframes/statusCopy.ts`
- `apps/web/shared/hyperframes/templates.ts`
- `apps/web/shared/hyperframes/__tests__/contracts.test.ts`
- `apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts`
- `apps/web/shared/hyperframes/__tests__/autoPlan.test.ts`
- `apps/web/shared/hyperframes/__tests__/featureAccess.test.ts`
- `apps/web/shared/hyperframes/__tests__/statusCopy.test.ts`

## Existing Files To Review

- `apps/web/shared/marketplaceCapture.ts`
- `apps/web/shared/marketplaceAutoReview/`
- `apps/web/shared/__tests__/marketplaceAutoReviewContracts.test.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`

## Test First

Write failing tests for these contract guarantees:

- `MarketplaceAutoReviewLaunchMode` accepts only Auto Storyboard Review and Standard Order values.
- Existing output modes `storyboard_images` and `full_video` remain valid Standard Order choices.
- Auto Storyboard Review plan projections can represent ready, blocked, disabled, running, completed, and failed states.
- Runtime schemas reject missing tenant/product/run identity, stale hashes, invalid template IDs, unsupported render engines, and mismatched idempotency keys.
- Feature access projections cover feature flag, tenant allowlist, worker readiness, template availability, anchor readiness, credit/quota, Library save permission, and operator capability states.
- Every render status has a safe user-facing copy projection with English and Thai label keys or copy IDs.
- `HyperframesChargeSummary` validates `creditEstimate`, `quotaDecision`, and
  `noChargeReason` combinations so UI does not infer billing state.
- `HyperframesPollingGuidance` validates 5-15s normal intervals, 30s max backoff,
  and terminal stop statuses.
- `HyperframesRepairAction` validates safe repair actions and blocked reasons for
  stale input hash, missing snapshot, retryable worker error, and minor layout warning.
- Composition input hashes change when output-affecting fields change.
- Library finalize metadata includes source, product/run/template/platform refs, output checksum, QA state, and idempotency refs.

## Contract Model

Define these top-level domains:

- `MarketplaceAutoReviewLaunchMode`
- `HyperframesAutoStoryboardReviewPlan`
- `HyperframesAutoStoryboardReviewBlocker`
- `HyperframesFeatureAccessProjection`
- `HyperframesRenderStatusProjection`
- `HyperframesChargeSummary`
- `HyperframesPollingGuidance`
- `HyperframesRepairAction`
- `HyperframesRenderJobStatus`
- `HyperframesRenderJobKind`
- `HyperframesRenderNextAction`
- `HyperframesCompositionInput`
- `HyperframesCompositionHashEnvelope`
- `HyperframesProductTruthView`
- `HyperframesShotView`
- `HyperframesAssetRef`
- `HyperframesStagedAssetManifest`
- `HyperframesQaIssue`
- `HyperframesTemplateDescriptor`
- `HyperframesPlatformProfile`
- `HyperframesLibraryFinalizeInput`
- `HyperframesLibraryFinalizeResult`
- `HyperframesRuntimeApiRequestContext`

## Runtime API Schemas

Provide Zod schemas for:

- `getAutoStoryboardReviewPlanInput`
- `startAutoStoryboardReviewInput`
- `createHyperframesPreviewInput`
- `getHyperframesRenderJobInput`
- `listHyperframesTemplatesInput`
- `cancelHyperframesRenderJobInput`
- `saveHyperframesRenderToLibraryInput`
- output schema fragments for `HyperframesChargeSummary`,
  `HyperframesPollingGuidance`, and `HyperframesRepairAction`.

Each schema must require enough identity to enforce user, tenant, product, run, and render ownership later in router/service sections.

Runtime output schemas must require charge and polling fields on start, preview,
and save responses where relevant. Render status projections must include
`repairActions`, even when empty, so Product Detail and Storyboard Review never
derive repair availability from free-form status text.

## Auto vs Standard Guardrail

The contracts must make the separation explicit:

- Auto mode uses `startAutoStoryboardReview` and backend-selected defaults.
- Standard Order continues to use the existing `startAutoReview` contract.
- Optional advanced overrides in Auto mode are represented as an override diff, not as the default state.
- Standard Order values are never rewritten into Auto values by shared helpers.

## Acceptance Criteria

- Shared contract tests pass.
- Type exports are importable from both server and client without pulling server-only code.
- Runtime schemas are serializable and safe for tRPC.
- Status copy coverage is complete for every status and blocker enum.
- Charge summary, polling guidance, and repair action schemas are exported from
  shared contracts and covered by contract tests.
- Contract files contain no HyperFrames package imports.
- Existing Marketplace Auto Review contract tests still pass.

## Rollback Notes

Because this section only adds shared contracts, rollback is removing the new shared folder and tests. No runtime behavior should change after this section alone.

## UI/UX Contract

### Target User / JTBD

Marketplace Capture users need consistent Auto and Standard workflow states across Product Detail, Storyboard Review, MediaStudio, Library, and Video Editor.

### Surface Inventory

| Surface | Impact |
|---|---|
| Product Detail | consumes launch mode, plan, blocker, render, and status copy contracts |
| Storyboard Review | consumes preview/result and QA projections |
| MediaStudio | consumes render-to-library session metadata |
| Library/Media History | consumes finalize/source metadata |
| Video Editor | consumes finalized video metadata |

### Component Map

| Component | Contract dependency |
|---|---|
| Launch mode switch | `MarketplaceAutoReviewLaunchMode` |
| Auto plan summary | `HyperframesAutoStoryboardReviewPlan` |
| Render panel | `HyperframesRenderStatusProjection` |
| Library save controls | `HyperframesLibraryFinalizeResult` |

### State Matrix

| State | Required contract support |
|---|---|
| disabled | feature access reason and Standard availability |
| blocked | blockers and primary next action |
| ready | auto defaults and plan hash |
| running | render status, progress, polling hint |
| completed | output refs and Library readiness |
| failed | safe diagnostics and retry/fallback action |

### Responsive Matrix

| Viewport | Contract requirement |
|---|---|
| mobile | short labels and bounded status copy IDs |
| tablet | summary fields can stack |
| desktop | full metadata can be displayed without extra fetches |

### Accessibility Acceptance

Every status, blocker, and action must have accessible label/copy fields so UI does not invent inaccessible fallback text.

### Copy Contract

Status and blocker copy is centralized in shared copy IDs with English and Thai coverage. UI pages should not create divergent labels.

### Browser Evidence Required

Later UI sections must verify all contract states render without overflow, clipping, or inaccessible controls.
