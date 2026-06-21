# Section 03: Marketplace Auto Review Integration

## Goal

Route Marketplace Auto Review through the shared planner while preserving current per-shot behavior. This section should first run in shadow/per-shot mode and persist `videoSegmentPlan` without changing provider spend behavior.

## Depends On

- Section 01 shared planner.
- Section 02 prompt builder.

## Files To Modify

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`
- Marketplace Capture/Auto Storyboard Review router or service that owns `getVideoSegmentPlanPreview`
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts` if request schema needs new fields
- `apps/web/server/routers/marketplaceCapture.ts` if standard route schema needs new fields

## Integration Work

Add adapter helpers near existing video/storyboard handoff helpers:

- `buildMarketplaceAutoReviewVideoSegmentPlannerInput`
- `buildMarketplaceAutoReviewVideoSegmentPlan`
- `buildMarketplaceAutoReviewVideoSegmentPrompt`
- `videoSegmentPlanFromRunMetadata`

Use existing data:

- `AutoReviewPlan.shots`
- `metadata.storyboardFrameUrls`
- `metadata.startFrameUrls`
- `metadata.stopFrameUrls`
- `metadata.referenceAnchors.creativePresets`
- `metadata.videoModel`
- resolved audio strategy
- product truth/product detail locks

Persist:

- `metadataJson.videoSegmentPlan`
- `metadataJson.videoStructureMode`
- `metadataJson.creativeBrief` when available

For per-shot mode, `buildStoryboardReviewOutput` should still return one clip per shot and `buildMarketplaceAutoReviewStoryboardReviewTasks` should still create one task per shot. The prompt/reference values should come from the shared planner and prompt builder.

Add `getVideoSegmentPlanPreview` on the server-side Marketplace Capture/Auto Storyboard Review API surface. It must return:

- deterministic `videoSegmentPlan`;
- `accessDecision` with safe internal connection/share identifiers only, never provider tokens, session references, or signed upload URLs;
- `creditEstimate` with `basis` (`jobs`, `segments`, or `seconds`) separated from `creditSource` (`gateway_api` or `mcp_provider_account`);
- `VideoSegmentPlanWarning[]` covering planner, creative-brief, access, credit, and fallback warnings;
- `fallbackReason`.

The Product Detail page may render the response later, but this section owns the server contract and tests.

## Test First

Add or extend tests for:

- per-shot output count and task IDs remain unchanged;
- `storyboard_3x3_split` reference roles remain single-frame;
- `video_shot_start_stop` reference roles remain start/stop;
- `videoSegmentPlan` persists with shot lineage;
- creative preset directive and creative brief pass through;
- unsupported model fallback is recorded;
- direct video task metadata preserves media history/output URL lineage.
- preview response includes plan, access decision, credit estimate, warnings, and fallback reason;
- preview response redacts provider tokens/session references and separates credit basis from credit source;
- completed segment video canonical output uses SmartSpecPro durable media-history/storage URL, not provider temporary URL.

## Verification

```text
npm --prefix apps/web test -- --run server/services/__tests__/marketplaceAutoReviewService.test.ts
npm --prefix apps/web run check
```

## UI/UX Contract

### Target User / JTBD

N/A for direct UI. This section changes server-side handoff metadata. The user-facing behavior must remain visually identical in per-shot mode.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Storyboard Review handoff | generated review data | derived segment metadata only |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| N/A | N/A | no component changes in this section | Storyboard Review consumes metadata later |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| per-shot shadow | same visible Storyboard Review tasks as current behavior | service tests |
| fallback | metadata records fallback without changing UI in this section | service tests |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | unchanged by this section | section 05 evidence later |
| tablet 768x1024 | unchanged by this section | section 05 evidence later |
| desktop 1440x900 | unchanged by this section | section 05 evidence later |

### Accessibility Acceptance

N/A. No direct controls or visual components are added in this section.

### Copy Contract

No new visible copy in this section. Fallback reasons stored in metadata must be concise and safe to surface later.

### Browser Evidence Required

N/A for this section. Browser evidence is required after sections 04 and 05.

## Implementation Notes

- Integrated planner/prompt builder into `apps/web/server/services/marketplaceAutoReviewService.ts`.
- Marketplace Auto Review run metadata now accepts `videoStructureMode`, `manualVideoGroupSize`, `creativeBrief`, and stores `videoSegmentPlan` in handoff output.
- Storyboard Review tasks receive segment lineage and `videoSegmentPrompt` through `storyboardContext.extraParams` while preserving per-shot task counts.
- Added server-owned `marketplaceCapture.getVideoSegmentPlanPreview` tRPC surface with access decision, credit basis/source, fallback reason, and warning response contract.
- Verification passed:
  - `npm --prefix apps/web test -- --run server/services/__tests__/marketplaceAutoReviewService.test.ts`
  - `npm --prefix apps/web run check`
