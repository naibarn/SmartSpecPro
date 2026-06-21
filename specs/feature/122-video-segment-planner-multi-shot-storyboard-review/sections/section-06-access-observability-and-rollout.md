# Section 06: Access Observability And Rollout

## Goal

Add the gates required to turn the planner on safely: model/MCP eligibility, segment-based warnings, redacted observability, feature flags, browser evidence, and final verification commands.

## Depends On

- Section 03 Marketplace integration.
- Section 04 UI controls.
- Section 05 Storyboard Review integration.

## Files To Modify

- media model config helpers/services discovered during implementation
- MCP connection eligibility helpers discovered during implementation
- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- test files from prior sections
- `specs/feature/122-video-segment-planner-multi-shot-storyboard-review/implementation/ui-browser-evidence.md`

## Access Rules

- Gateway API models must be enabled in media model config.
- MCP models are visible/usable only for owner or shared group access.
- Storyboard Review must re-check model/MCP access when generating, not only at handoff.
- Fallback from MCP to Gateway API cannot be silent if credit source changes.
- Shared MCP limits must state whether limits count jobs, segments, seconds, or concurrent queued/processing jobs.

## Credit And Output Gates

- Per-shot mode uses the current per-video-job credit estimate.
- Multi-shot modes estimate by segment count, selected model, and planned segment duration.
- Manual group mode shows a clamp warning when the requested group exceeds capability.
- Split fallback adjusts only the affected segment when possible.
- Shared MCP provider-account usage is labeled separately from SmartSpecPro gateway credits.
- Completed segment output must be persisted as a SmartSpecPro-managed media-history/storage URL before it becomes canonical in Storyboard Review, Media History, Video Editor, or Library.
- Provider temporary URLs may be transient fetch inputs only.

## Observability

Add redacted events/logs:

- `video_segment_plan_created`
- `video_segment_plan_fallback`
- `video_segment_prompt_built`
- `video_segment_prompt_regenerated`
- `video_segment_split_fallback`
- `video_segment_access_blocked`

Do not log provider tokens, raw provider responses, private URLs, or raw prompts where existing policy forbids them.

## Feature Flags

Use or add flags:

- `videoSegmentPlannerShadow`
- `videoSegmentPlannerPerShot`
- `videoSegmentPlannerPreview`
- `videoSegmentPlannerMultiShotBeta`

Default production posture:

- shadow/per-shot safe;
- preview optional;
- multi-shot beta disabled unless tenant/model allowlisted.

## Final Verification

Run:

```text
npm --prefix apps/web test -- --run shared/videoSegmentPlanner/__tests__/*.test.ts
npm --prefix apps/web test -- --run shared/hyperframes/__tests__/autoPlan.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts
npm --prefix apps/web test -- --run server/services/__tests__/marketplaceAutoReviewService.test.ts
npm --prefix apps/web test -- --run client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx
npm --prefix apps/web run check
```

Browser evidence:

- Marketplace Capture product detail: mobile, tablet, desktop.
- Storyboard Review: mobile, tablet, desktop.
- Include console, keyboard, overflow, disabled/error state notes.

## Release Gates

Do not enable multi-shot generation until:

- per-shot parity passes;
- media history output URLs and thumbnails are verified;
- canonical output URL is SmartSpecPro stored URL, not provider temporary URL;
- shared MCP model eligibility is verified;
- Thai separate TTS prompt alignment is verified;
- provider capability profile exists for the selected beta model;
- fallback split path is tested.

## UI/UX Contract

### Target User / JTBD

- Role: product-review creator or reviewer using a model that may be API or MCP backed.
- Goal: see clear access/quota/fallback states before spending provider credits.
- Entry point: Marketplace Capture product detail and Storyboard Review.
- Success outcome: blocked or fallback generation is understandable and never silently changes credit source.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Marketplace Capture product detail | product route | access/quota/fallback copy |
| Storyboard Review | `/storyboard-review` | access blocked and split fallback copy |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Existing controls | product/detail and Storyboard Review files | copy/status states | access/fallback decisions |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| access blocked | generation disabled with reason | browser/manual |
| quota warning | shows limit unit clearly | browser/manual |
| silent fallback unavailable | no auto-switch credit source | tests |
| rollout disabled | controls hidden or per-shot fallback visible | tests |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | warning text wraps cleanly | screenshot/manual |
| tablet 768x1024 | warning near relevant controls | screenshot/manual |
| desktop 1440x900 | no layout shift in existing panels | screenshot/manual |

### Accessibility Acceptance

Access and quota states must be text-visible, keyboard reachable, and not color-only.

### Copy Contract

Thai/English copy must say whether a limit counts jobs, segments, seconds, or concurrent queued/processing jobs. Copy must distinguish MCP provider credits from SmartSpecPro gateway credits.

### Browser Evidence Required

Record access-blocked and fallback-warning evidence if a test account/model state is available; otherwise mark skipped with reason.

## Implementation Notes

- Added rollout flags to `apps/web/shared/featureFlags.ts`: `videoSegmentPlannerShadow`, `videoSegmentPlannerPerShot`, `videoSegmentPlannerPreview`, and `videoSegmentPlannerMultiShotBeta`.
- Defaults keep shadow/per-shot enabled and preview/multi-shot beta disabled.
- Added safe observability event builder in `marketplaceAutoReviewService.ts` that reports plan hash, effective mode, segment count, and fallback reason while redacting prompts, tokens, sessions, signed URLs, and provider-sensitive metadata.
- Verification passed:
  - `npm --prefix apps/web test -- --run server/services/__tests__/mcpFeatureFlags.test.ts server/services/__tests__/marketplaceAutoReviewService.test.ts`
  - `npm --prefix apps/web run check`
