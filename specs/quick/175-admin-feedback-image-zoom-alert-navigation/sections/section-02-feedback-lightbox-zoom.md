# Section 02: Feedback Hub lightbox zoom

## Ownership boundary

Own the existing ticket image lightbox and its focused page/helper tests. Do
not change reply-preview zoom, protected media fetching, attachment storage, or
notification/server contracts.

## Requirements

- Open at 100% fit-to-viewport.
- Add accessible zoom-in, zoom-out, reset, and percentage controls.
- Bound the scale, disable controls at bounds, and allow native scroll/pan when
  enlarged.
- Reset scale on close and image navigation.
- Preserve authenticated image rendering, previous/next, Escape, and opening
  the protected attachment in a new tab.
- Preserve `ticketId` selection and selected-ticket visibility outside the
  active source filter.

## TDD expectations

- Add failing tests for control labels, bounds, reset, image-change reset, and
  authenticated image usage/overflow contract.
- Add or retain a deep-link test that proves the requested ticket id becomes the
  selected ticket; use existing prepend behavior rather than a second list.
- Run focused tests before and after implementation.

## UI/UX Contract

### Target User / JTBD

- Role: Feedback Hub administrator.
- Goal: read screenshot details and inspect the ticket selected by an alert.
- Entry point: attachment thumbnail or alert deep-link.
- Success: image text is readable at enlarged scale and the correct ticket is
  already selected.

### Existing Pattern Reference

- Searched: `AuthenticatedAttachmentImage`, `AuthenticatedMediaImage`, current
  `AdminFeedbackHub` lightbox, and existing reply image preview.
- Found: authenticated wrapper and fullscreen dialog/navigation pattern.
- Decision: reuse and extend the ticket lightbox; reply preview remains out of
  scope because it is a separate pre-upload state.

### Surface Inventory

| Surface | File | Change |
|---|---|---|
| Ticket image lightbox | `AdminFeedbackHub.tsx` | zoom controls and scrollable enlarged image |
| Ticket queue/detail | `AdminFeedbackHub.tsx` | retain deep-link selection/prepend contract |

### Component Map

| Component | Owns | Consumes |
|---|---|---|
| `AdminFeedbackHub` | lightbox scale, reset, image index | existing image attachment list and tRPC detail |
| `AuthenticatedAttachmentImage` | protected image request/rendering | unchanged existing contract |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| opened | 100% fit, controls visible | component test/manual |
| zoomed | percentage updates; viewport scrolls | component test/manual |
| lower/upper bound | corresponding control disabled | component test |
| reset | returns to 100% | component test |
| next/previous | image changes and scale resets | component test/manual |
| load/error | existing authenticated status/error | existing component contract |
| selected deep-link | requested ticket remains visible/selected | page test/manual |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | controls reachable; no page-wide horizontal overflow | browser/manual |
| tablet 768x1024 | image and controls fit dialog | browser/manual |
| desktop 1440x900 | screenshot readable at 100–400% | browser/manual |
| laptop 1024x768 | controls do not overlap navigation | browser/manual |

### Accessibility Acceptance

- Zoom controls have accessible names: `ขยายภาพ`, `ย่อภาพ`, and `รีเซ็ตขนาด`.
- Focus remains visible and keyboard order is logical.
- Escape closes; arrow keys navigate images.
- Scale changes add no required motion and do not alter media authorization.

### Copy Contract

- Use `ขยายภาพ`, `ย่อภาพ`, `รีเซ็ตขนาด`, and the existing
  `เปิดในแท็บใหม่` label, with current English fallback where applicable.
- Keep existing loading/error copy for authenticated attachments.

### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`; verify zoom,
reset, pan, close, and deep-link selection at 390x844, 768x1024, 1440x900, and
1024x768. Mark unavailable browser checks as skipped.

## Acceptance checks

- Controls are accessible and bounded.
- Enlarge/pan/reset works without replacing the protected image component.
- Scale resets on close and image navigation.
- Existing attachment navigation and selected-ticket deep-link remain intact.

## Actual implementation

- `AdminFeedbackHub.tsx` keeps the existing authenticated attachment renderer,
  but adds local lightbox scale/image-size state, reset on close/image change,
  a scrollable viewport, and a natural-size wrapper for reliable pan at larger
  scales.
- `AdminFeedbackHub.tsx` uses the shared fullscreen Dialog mode so the desktop
  viewer can use the available horizontal space. Its image viewport supports
  pointer drag pan in both axes plus native scrollbars, with scroll anchoring
  disabled and the viewport reset when changing images.
- `FeedbackLightboxZoomControls.tsx` provides keyboard-reachable Thai-labelled
  zoom in/out/reset buttons and a live percentage from 100% to 400% in 25%
  steps. `feedbackHubZoom.ts` owns the bounded scale contract.
- `feedbackHubNavigation.ts` owns the existing `ticketId` query parsing
  contract, keeping alert deep-links and selected-ticket behavior aligned.
- `AdminFeedbackHub.deepLink.test.tsx` covers deep-link parsing, zoom bounds,
  labels, disabled bounds, and reset affordance; it is included in the combined
  35/35 focused test run.
