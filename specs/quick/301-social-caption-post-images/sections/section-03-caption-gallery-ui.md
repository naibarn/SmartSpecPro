# Section 03 — caption image gallery UI

## Ownership and targets

- Owner: main Codex.
- Files: `apps/web/client/src/components/marketplaceCapture/StagedSocialCaptionComposer.tsx`,
  `apps/web/client/src/components/marketplaceCapture/StagedCheckpointReviewPanel.tsx`,
  and focused composer/panel tests. Do not modify the already-dirty
  `MarketplaceCaptureProductDetail.tsx`.

## Prerequisites

- Section 02 exposes projected image-generation state and the protected
  enqueue mutation.
- Section 01 exposes compatible image models.

## UI/UX Contract

### Target User / JTBD

- Role: seller preparing a product review for social media.
- Goal: prepare one caption and three portrait ad images from trusted shot,
  character, and product references.
- Entry point: the existing “Caption สำหรับโพสต์โซเชียล” card in a staged
  Marketplace Auto Review run.
- Success outcome: the user sees three generated images next to the caption,
  can enlarge each image, and can download it.

### Existing Pattern Reference

- Searched: caption, gallery, lightbox, download in
  `apps/web/client/src/components/marketplaceCapture/` and the app component
  catalog.
- Found: `StagedSocialCaptionComposer.tsx` for caption generation and the
  Astryx `useLightbox` / `LightboxGallery` pattern for accessible image
  viewing.
- Decision: reuse the existing caption card and lightbox pattern. Keep the
  new UI in the mounted composer; do not duplicate it on the dirty parent page.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Caption composer | `StagedSocialCaptionComposer.tsx` | Add model and reference selectors, async generate/retry action, output gallery, lightbox, and download controls. |
| Worker operation label | `StagedCheckpointReviewPanel.tsx` | Give the new operation a Thai progress label. |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `StagedSocialCaptionComposer` | `StagedSocialCaptionComposer.tsx` | Separate local model selection, reference selection, trigger/errors, projected image state, lightbox and downloads. | `StagedReviewState`, model query, generate mutation, `onRefresh`. |
| `Lightbox` via `useLightbox` | Astryx `@astryxdesign/core/Lightbox` | Accessible enlarged gallery navigation. | Durable image URLs and descriptive alt/caption. |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| No caption | Model/reference controls remain unavailable; explain that caption must be generated first. | Component test. |
| Missing character/product ref | Disable generate with a clear Thai reason; do not enqueue. | Component and server validation tests. |
| Model loading/empty/error | Show loading; explain no compatible models when empty; allow refresh/error recovery. | Component test. |
| Ready | Independent social-image model, character, and product selectors; estimate 3 image charges; generate button. | Component test. |
| Generating | Disable duplicate generation and selectors; show overall and per-image progress. | Component test and browser evidence. |
| Partial failure | Keep successful images; mark failed outputs and expose retry without recharging/regenerating successes. | Component and worker tests. |
| Success | Show exactly three portrait images beside caption/hashtags. | Component and browser evidence. |
| Lightbox | Click/keyboard activation opens the selected image; Escape closes; gallery navigation works. | Component and browser evidence. |
| Download | Button downloads the durable image with a stable filename. | Component and browser evidence. |
| Hover/focus/disabled | Visible focus, descriptive labels, disabled controls remain understandable. | Accessibility review/browser evidence. |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Selectors stack; images form a readable vertical list/grid; no horizontal overflow. | Screenshot and interaction. |
| tablet 768x1024 | Controls wrap; images use available width without cropping important content. | Screenshot and interaction. |
| desktop 1440x900 | Three output previews display as a compact gallery; caption remains readable. | Screenshot and interaction. |
| small-mobile 360x800 | Buttons and image cards remain usable with no clipped labels. | Check if the app's current browser profile supports this extended viewport. |
| laptop 1024x768 | Caption card and controls do not collide with surrounding review layout. | Check if layout risk appears. |
| wide-desktop 1280x800 | Gallery stays visually grouped with its caption. | Not required unless changed parent layout exposes a risk. |

### Accessibility Acceptance

- Keyboard order follows caption → model → references → generate → image
  actions; each preview is keyboard operable.
- Lightbox supports Escape and gallery arrows using the Astryx hook.
- Provide alt text and Thai button labels for every image, enlarge action, and
  download action; expose generation updates as status text.
- Keep focus indicators visible, preserve contrast, and avoid nonessential
  motion.

### Visual Direction

- Reuse the existing Astryx card, selectors, buttons, text, and spacing.
- Use the same 4:5 or selected portrait aspect ratio for all three previews;
  render without object-cover cropping. No custom palette or raw dimensions.

### Copy Contract

- Tone: concise, clear Thai consistent with the existing caption card.
- Required labels: `โมเดลสร้างภาพโพสต์`, `ภาพตัวละครอ้างอิง`,
  `ภาพสินค้าอ้างอิง`, `สร้างภาพโพสต์ 3 ภาพ`, `ขยายภาพ`, `ดาวน์โหลดภาพ`.
- Validation/error: `กรุณาเลือกภาพตัวละครและภาพสินค้าก่อนสร้างภาพ`,
  `ไม่มีโมเดลที่รองรับภาพอ้างอิงแนวตั้ง`, and a sanitized retry message.
- Empty/loading/success: state that a caption is needed first, show `กำลังสร้างภาพโพสต์…`,
  and report the number of completed outputs.
- Localization: this composer is currently Thai-only; preserve that convention.

### Browser Evidence Required

- Follow `skills/orchestra/references/ui-browser-verification.md`.
- Verify the authenticated SmartAIHub route at mobile 390x844, tablet
  768x1024, and desktop 1440x900 after a development build is available.
- Verify model isolation, missing-reference validation, progress, three-image
  layout, lightbox keyboard behavior, downloads, and browser console errors.
- Keep provider-backed image generation UAT separate from UI interaction UAT.

## TDD and acceptance

- First write component tests for model isolation, references, ready/disabled/
  pending/partial/success states, lightbox navigation, and downloads; confirm
  RED before implementing.
- Acceptance: UI presents three generated images with caption, enlarge, and
  download controls; all controls remain separate from start-frame selection.

## Slice contract

- Required checks: focused composer and panel Vitest files, then UI browser
  verification when a safe development build is available.
- Merge readiness: can integrate after section 02; browser UAT may follow
  integration and is not a barrier unless repository protection requires it.
- Exposure/fallback: action appears only for a saved caption with compatible
  references/models. Existing caption/hashtag functionality remains usable if
  image generation is unavailable.
- Rollback: remove image controls and operation label; persisted image metadata
  is ignored by the existing caption projection.
