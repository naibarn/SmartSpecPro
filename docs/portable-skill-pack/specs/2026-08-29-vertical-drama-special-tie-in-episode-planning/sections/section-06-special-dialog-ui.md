# Section 06 — Special creation dialog UI

## Goal

Add the special creation interaction beside the normal action while reusing existing UI
patterns and making Marketplace Capture selection convenient.

## Owned files

- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
- new special dialog/picker components under the existing Vertical Drama/marketplace
  component directories
- page/component tests

## UI/UX Contract

### Target User / JTBD

Vertical Drama creator/marketer; turn an idea plus chosen references into a prompt-ready
special episode; enter from Episodes tab beside normal creation; success is a numbered
special episode with ready prompts and unchanged normal action.

### Existing Pattern Reference

Targeted search found the normal add flow in `VerticalDramaSeriesDetailPage.tsx`, shared
prompt/task UI in `VerticalDramaEpisodePage.tsx` and `VerticalDramaStoryboardPanel.tsx`,
and product selection logic in `ProductImagePicker.tsx`/Marketplace Capture pages. Decision:
reuse their dialog/card/query/accessibility patterns; diverge only for product-first then
image-second selection and special-only fields.

### Surface Inventory

| Surface | File | Change |
|---|---|---|
| Series Episodes tab | `VerticalDramaSeriesDetailPage.tsx` | Add `สร้างตอนพิเศษ` trigger/dialog |
| Marketplace picker | controlled picker wrapper | Product search then image selection |
| Upload slot | special reference component | Drag/drop plus keyboard upload |

### Component Map

| Component | Owns | Consumes |
|---|---|---|
| `SpecialTieInEpisodeDialog` | form state/validation/submit/status | special tRPC mutations |
| `MarketplaceCaptureReferencePicker` | product/image queries and selection | marketplace tRPC queries |
| `ManagedReferenceSlot` | upload/preview/remove | managed-media upload |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton/spinner, disabled submit | tests/browser |
| empty | no product/image copy with search guidance | tests |
| error | inline actionable message, draft retained | tests |
| success | chips/thumbnails and status/link | tests/browser |
| partial | prompt-ready status with render still explicit | tests |
| disabled | exact limit/model reason | tests |
| selected/hover/focus | visible selection/focus and keyboard action | a11y/browser |

### Responsive Matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | one column, scrollable body, actions remain reachable |
| tablet 768x1024 | two-column form/picker when safe |
| laptop 1024x768 | sidebar retained, dialog body scrolls |
| desktop 1440x900 | balanced form and picker |
| small-mobile 360x800 | compact labels, no horizontal overflow |
| wide-desktop 1280x800 | capped dialog width, visible primary action |

### Accessibility Acceptance

Logical keyboard order; modal focus trap/restore; labels and error associations; checkbox
semantics for image selection; keyboard upload alternative; visible focus/contrast;
non-stealing status announcements; reduced-motion support.

### Visual Direction

Reuse existing Vertical Drama dialog/cards, tokens, spacing, radius, and Thai/English
typography. Keep the two-stage picker hierarchy and 1–3 cap visible without a new visual
system or raw colors.

### Copy Contract

Thai-first/English fallback labels: `สร้างตอนพิเศษ`, `ไอเดียหรือโจทย์`,
`เลือกจาก Marketplace Capture`, `เพิ่มภาพที่เลือก`, `ความยาวต่อช็อต`, `สัดส่วน 9:16`,
`โหมดบทพูด`, `ผู้พูด`, `เพิ่มตัวละคร/ตัวประกอบ`, `ล็อกภาพคน`, `ล็อกภาพสินค้า/สถานที่`,
`Image Model`, `Video Model`. Validation states exact 5,000/1–3/4/3 limits. Errors
identify input/access/skill/provider/rendering and retain draft.

### Browser Evidence Required

Record `implementation/ui-browser-evidence.md` at mobile 390x844, tablet 768x1024,
desktop 1440x900 and extended dense-layout viewports, including console, overflow,
keyboard, labels, loading/empty/error/disabled, and unchanged normal entry.

## Implementation and TDD

Add trigger only; preserve the existing normal handler. Build form validation, picker
states, model choices, locks, cast selection, upload slot, submit/status, and localization.
Test all state/accessibility/normal-regression cases before implementation.

## Acceptance

The dialog supports the requested workflow without a URL field, with the primary action
usable at required viewports and no changes to normal creation.
