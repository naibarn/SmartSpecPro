# Section 02: Auto Plan and Feature Access

## Goal

Implement backend services that make Storyboard Review Auto genuinely automatic. Product Detail should be able to ask the server, "What should happen next for this product?" and receive an actionable plan without requiring the user to choose template, platform, render engine, frame strategy, or output mode.

This section also defines all feature access decisions so the UI can show Auto as enabled, blocked, disabled, or unavailable without guessing.

## In Scope

- Backend-derived Auto Storyboard Review plan.
- Feature flag and tenant allowlist evaluation.
- Worker/template/credit/permission readiness checks.
- Deterministic credit estimate, quota decision, and free-preview policy projection.
- Product anchor and evidence readiness checks.
- Blocker and next action generation.
- Standard Order preservation checks.

## Files To Create

- `apps/web/server/services/hyperframesAutoPlanService.ts`
- `apps/web/server/services/hyperframesFeatureAccessService.ts`
- `apps/web/server/services/__tests__/hyperframesAutoPlanService.test.ts`
- `apps/web/server/services/__tests__/hyperframesFeatureAccessService.test.ts`

## Existing Files To Review

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/services/marketplaceProductService.ts`
- `apps/web/server/services/marketplaceCaptureService.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/shared/hyperframes/autoPlan.ts`
- `apps/web/shared/hyperframes/featureAccess.ts`

## Test First

Add failing service tests for:

- Auto plan resolves default output mode, frame strategy, audio strategy, template, platform, text overlay policy, and render intent without caller customization.
- Auto plan returns a single primary next action when the product is ready.
- Auto plan returns blockers for missing product image anchors, character/environment anchors when required, worker disabled, template unavailable, insufficient credit/quota, and compliance review required.
- `resetToAuto` clears only Auto mode override diffs and does not change Standard Order selections.
- Standard Order is still startable when HyperFrames is enabled but Auto is blocked for worker/template reasons.
- HyperFrames disabled returns disabled Auto access while preserving Standard Order availability.
- Tenant allowlist and role permissions are enforced independently from global flags.
- Library save and operator capabilities are separately projected.
- Cost estimate covers `composition_preview`, `composition_render`, `composition_variant_export`, and `composition_snapshot_qa`.
- Credit operation idempotency uses `hyperframes-credit:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{templateVersion}:{platformPresetId}`.
- MVP quota limits block over-limit duration, fps, resolution, frame count, staged bytes, product images, clips, concurrent jobs, retries, and stored preview artifacts.

## Auto Plan Inputs

Use only trusted backend state:

- authenticated user and tenant;
- product capture/product detail;
- existing Marketplace Auto Review run state;
- product truth/evidence readiness;
- anchor readiness;
- credit/quota projection;
- deterministic credit estimate and free-preview usage;
- feature flags;
- worker readiness;
- template registry projection;
- compliance category and risk markers.

Do not derive default plans from user-provided template/platform parameters on first load.

## Auto Plan Outputs

Return `HyperframesAutoStoryboardReviewPlan` with:

- `launchMode: auto_storyboard_review`;
- backend-selected defaults;
- `canStart`;
- `canPreview`;
- `canSaveToLibrary`;
- credit estimate projection;
- quota decision;
- free-preview state;
- `primaryAction`;
- `blockers`;
- `warnings`;
- `overrideDiff`;
- `resetToAutoAvailable`;
- `standardOrderAvailable`;
- `planHash`;
- `expiresAt` or `staleAfterMs`;
- sanitized display/status copy IDs.

## Feature Access Rules

Evaluate these dimensions:

- global flag: default off;
- tenant allowlist;
- user role and permissions;
- worker readiness;
- template registry readiness;
- product capture readiness;
- anchor readiness;
- active run state;
- credit/quota;
- Library save permission;
- operator permission.

The result should explain "why not" without exposing internal secrets, paths, stack traces, or raw dependency errors.

## Credit, Cost, and Quota Projection

Auto plan and feature access must include one backend-derived `HyperframesCreditEstimate` projection so Product Detail, Storyboard Review, MediaStudio, and Library finalize show the same numbers.

Required cost classes:

- `composition_preview`
- `composition_render`
- `composition_variant_export`
- `composition_snapshot_qa`

Required estimate fields:

- estimate ref, tenant/user/run ID, render intent, composition mode, cost class;
- width, height, fps, duration, frame count, render pixels;
- profile, cost-class, and worker-complexity multipliers;
- estimated storage bytes and estimated credits;
- `freePreviewApplied`;
- quota decision: `allowed`, `free_preview_allowed`, `needs_authorization`, `quota_blocked`, or `credit_blocked`;
- idempotency key: `hyperframes-credit:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{templateVersion}:{platformPresetId}`.

Estimate formula:

```text
estimatedFrameCount = ceil(durationSeconds * fps)
estimatedRenderPixels = width * height * estimatedFrameCount
rawComputeUnits = estimatedRenderPixels / 1_000_000_000
estimatedStorageBytes =
  estimatedVideoBytes(width, height, fps, durationSeconds, renderProfile)
  + estimatedSnapshotBytes
  + estimatedManifestAndSidecarBytes
estimatedCredits =
  ceil(rawComputeUnits * profileMultiplier * costClassMultiplier * workerComplexityMultiplier)
```

Separate credit refs:

- `compositionEstimateRef`
- `compositionReservationRef`
- `compositionChargeRef`
- `compositionRefundRef`

MVP limits:

| Intent | Max duration | FPS | Resolution |
|---|---:|---:|---|
| preview | 15s | 24 | 720x1280 |
| draft | 30s | 24 | 1080x1920 |
| final | 60s | 30 | 1080x1920 |

Other caps: 8 product images, 9 video clips, 750 MB staged assets, max concurrent jobs per user/tenant, max retries per job, and max stored preview artifacts per product/run.

Free preview policy:

- allow one active free preview per `{tenantId}:{productId}:{runId}:{templateId}:{platformPresetId}:{compositionInputHash}` unless tenant policy raises the limit;
- mark free preview as consumed only when rendering starts or output exists;
- return existing active/completed preview for duplicate free-preview requests with the same composition hash;
- never label final renders or variant packages as free previews.

## Implementation Steps

1. Add env/flag readers with safe defaults.
2. Implement access projection service using shared contracts.
3. Implement auto plan service that composes access, product readiness, existing run state, and default plan policy.
4. Add helper for override diff and reset-to-auto state.
5. Add tests that compare Standard Order behavior before/after HyperFrames enabled.
6. Keep services pure enough to unit test with fixture inputs.

## Acceptance Criteria

- Auto plan can be fetched on page load without mutating runs.
- Auto plan is deterministic for the same product state and flag state.
- Credit/quota estimate is deterministic and shared by Product Detail, Storyboard Review, MediaStudio, and Library finalize.
- Free-preview and credit idempotency prevent duplicate preview consumption and duplicate charging.
- User does not need to customize mode/template/platform to start Auto.
- Standard Order remains available and untouched.
- Blockers are specific, safe, and actionable.
- Tests pass with HyperFrames flags both disabled and enabled.

## Rollback Notes

Disable flags to hide Auto mode. Existing Standard Order calls remain on current `startAutoReview` and should require no rollback changes.

## UI/UX Contract

### Target User / JTBD

Marketplace Capture users need one automatic next step when Auto is ready, plus a preserved Standard Order path when Auto is disabled or blocked.

### Surface Inventory

| Surface | Impact |
|---|---|
| Product Detail | shows Auto plan, blockers, primary CTA, reset-to-auto, and Standard availability |
| Storyboard Review | uses access state to decide whether preview/render actions are automatic or fallback |
| MediaStudio | uses Library save permission and render session readiness |
| Operator surfaces | use operator capability projection |

### Component Map

| Component | Service output |
|---|---|
| Auto plan summary | defaults, blockers, warnings, plan hash |
| Launch mode switch | default mode and Standard availability |
| Advanced overrides | override diff and reset-to-auto |
| Render panel | canPreview/canSave/canCancel gates |

### State Matrix

| State | Expected UI behavior |
|---|---|
| enabled ready | primary Auto CTA visible |
| enabled blocked | blocker and safe next action visible |
| disabled | Auto unavailable copy, Standard still usable |
| worker unavailable | Auto blocked, Standard visible when valid |
| credit blocked | credit action shown, no render queued |
| override blocked | reset-to-auto offered |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| mobile | blocker summary is compact and does not push Standard out of reach |
| tablet | plan and blockers stack predictably |
| desktop | Auto and Standard context can be compared without hidden state |

### Accessibility Acceptance

Plan state, blockers, and primary actions must be reachable by keyboard and announced as status changes.

### Copy Contract

Use shared status/blocker copy. Do not expose raw flag names, worker errors, stack traces, or tenant allowlist internals.

### Browser Evidence Required

Product Detail e2e must cover Auto ready, disabled, blocked, override blocked, and Standard still usable.
