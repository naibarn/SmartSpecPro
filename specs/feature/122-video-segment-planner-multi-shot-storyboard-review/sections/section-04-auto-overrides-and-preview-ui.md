# Section 04: Auto Overrides And Preview UI

## Goal

Expose video structure and creative brief controls in Marketplace Capture Auto Storyboard Review without duplicating model/transport selection. The selected model remains the source of truth for provider/API/MCP routing.

## Depends On

- Section 01 shared contracts.

## Files To Modify

- `apps/web/shared/hyperframes/autoPlan.ts`
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts`
- `apps/web/client/src/components/marketplaceCapture/AutoStoryboardAdvancedOverrides.tsx`
- `apps/web/client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`

## Behavior

Add overrides:

- `videoStructureMode`
- `manualVideoGroupSize`
- optional `creativeBrief`

UI labels:

- Thai: `โครงสร้างวิดีโอ`, `แยกแต่ละช็อต`, `รวมช็อตอัตโนมัติตามโมเดล`, `รวมหลายช็อตให้กระชับ`, `กำหนดจำนวนช็อตต่อคลิป`, `แนวเรื่องหรือคำบรรยายเพิ่มเติม`
- English: `Video structure`, `Per shot`, `Adaptive multi-shot`, `Compact multi-shot`, `Manual group size`, `Creative brief`

Manual group size is visible only when manual mode is selected. The UI must call `getVideoSegmentPlanPreview` for the selected video model and override state when enough context is available. Preview/fallback/access/credit copy must come from that backend response; the page must not recreate planner grouping, model capability, MCP access, or credit logic locally.

## UI/UX Contract

### Target User / JTBD

- Role: product-review creator.
- Goal: choose video structure and optional creative direction before starting Auto Review.
- Entry point: Marketplace Capture product detail.
- Success outcome: user understands whether the chosen video model can use multi-shot or will fall back to per-shot.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Advanced Auto overrides | `AutoStoryboardAdvancedOverrides.tsx` | add video structure/manual size/brief controls |
| Product detail start flow | `MarketplaceCaptureProductDetail.tsx` | pass fields to start payload |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `AutoStoryboardAdvancedOverrides` | existing | controls and reset behavior | plan defaults, model options |
| optional `VideoSegmentPlanSummary` | new | segment preview/warnings | preview result |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | existing plan loading unaffected | component test |
| empty | controls show defaults | component test |
| preview loading | controls remain editable while preview summary shows loading state | component test |
| error | fallback/warning text shown when preview/access fails | component test |
| success | selected structure, effective mode, credit source, and fallback summary come from preview response | component test |
| stale preview | changing model/structure/brief clears old summary until next preview resolves | component test |
| disabled/focus/hover | all fields keyboard reachable | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | controls stack, Thai labels wrap cleanly | screenshot/manual |
| tablet 768x1024 | grid remains readable | screenshot/manual |
| desktop 1440x900 | controls align with existing advanced layout | screenshot/manual |
| small-mobile 360x800 | no clipped Thai text | screenshot/manual if risky |
| laptop 1024x768 | no horizontal overflow | screenshot/manual |
| wide-desktop 1280x800 | no unnecessary wide card nesting | screenshot/manual |

### Accessibility Acceptance

- Selects and textareas have accessible labels.
- Reset-to-auto clears new fields.
- Disabled/manual-only state is not color-only.
- Focus order follows visual order.

### Copy Contract

Tone is direct and practical. Thai is primary in Thai locale, English fallback uses labels above. Error copy must say whether the fallback is due to model capability, access, quota, or missing references.

### Browser Evidence Required

Record Marketplace Capture product route evidence after implementation for mobile, tablet, and desktop.

## Test First

Tests:

- schema accepts and prunes video structure defaults;
- manual size appears only in manual mode;
- reset-to-auto clears fields;
- video model selector remains the only model selector;
- preview summary is driven by `getVideoSegmentPlanPreview` and does not use page-local planner logic;
- access/credit/fallback warnings render from `VideoSegmentPlanWarning[]`;
- Thai labels are present and accessible.

## Implementation Notes

- Extended HyperFrames auto-plan override defaults/schema with `videoStructureMode`, `manualVideoGroupSize`, and `creativeBrief`.
- Updated `AutoStoryboardAdvancedOverrides.tsx` with Thai/English controls for video structure, conditional manual group size, creative brief, and backend-driven preview summary.
- Backend-driven preview now shows the concrete segment grouping so users can see how many video segments will be created and which storyboard shots/sub-shots are grouped into each video before spending credits.
- `hyperframesRuntimeApiService.ts` now forwards the new override fields to Marketplace Auto Review start metadata.
- `MarketplaceCaptureProductDetail.tsx` now calls `getVideoSegmentPlanPreview` for the selected model/override/MCP account state and passes only the backend preview result into `AutoStoryboardAdvancedOverrides`.
- Verification passed:
  - `npm --prefix apps/web test -- --run shared/hyperframes/__tests__/autoPlan.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx`
