<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test -- --run shared/videoSegmentPlanner/__tests__/*.test.ts server/services/__tests__/marketplaceAutoReviewService.test.ts client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx client/src/lib/storyboardReviewWorkspace.test.ts client/src/pages/StoryboardReviewPage.hyperframesText.test.ts server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts shared/hyperframes/__tests__/storyboardReviewState.test.ts && npm --prefix apps/web run check
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-planner-contracts
section-02-prompt-builder-and-creative-brief
section-03-marketplace-auto-review-integration
section-04-auto-overrides-and-preview-ui
section-05-storyboard-review-segment-state
section-06-access-observability-and-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shared-planner-contracts | - | 02, 03, 05, 06 | Yes |
| section-02-prompt-builder-and-creative-brief | 01 | 03, 05 | No |
| section-03-marketplace-auto-review-integration | 01, 02 | 05, 06 | No |
| section-04-auto-overrides-and-preview-ui | 01 | 03, 06 | Yes after 01 |
| section-05-storyboard-review-segment-state | 01, 02, 03 | 06 | No |
| section-06-access-observability-and-rollout | 03, 04, 05 | - | No |

## Execution Order

1. `section-01-shared-planner-contracts`
2. `section-02-prompt-builder-and-creative-brief`
3. `section-03-marketplace-auto-review-integration` and `section-04-auto-overrides-and-preview-ui`
4. `section-05-storyboard-review-segment-state`
5. `section-06-access-observability-and-rollout`

## Section Summaries

### section-01-shared-planner-contracts

Create `apps/web/shared/videoSegmentPlanner/` contracts, capability profiles, core planning logic, legacy per-shot synthesis helpers, and shared tests.

### section-02-prompt-builder-and-creative-brief

Create the shared segment prompt builder, creative brief normalization, preset directive integration, dialect rules, and audio/TTS guard tests.

### section-03-marketplace-auto-review-integration

Route Marketplace Auto Review per-shot handoff through the shared planner in shadow/per-shot mode, add `getVideoSegmentPlanPreview`, persist `videoSegmentPlan`, and preserve current Storyboard Review task behavior.

### section-04-auto-overrides-and-preview-ui

Extend HyperFrames Auto overrides and Marketplace Capture product detail UI with video structure controls, manual group size, creative brief input, and segment preview/fallback copy.

### section-05-storyboard-review-segment-state

Add Storyboard Review segment state normalization, legacy synthesis on read, `regenerateVideoSegmentPrompt`, segment-aware prompt regeneration, stale prompt semantics, and split fallback confirmation.

### section-06-access-observability-and-rollout

Add model/MCP eligibility checks, segment-based access/credit warning hooks, durable output URL gates, redacted observability, feature flags, browser evidence, and final rollout gates.
