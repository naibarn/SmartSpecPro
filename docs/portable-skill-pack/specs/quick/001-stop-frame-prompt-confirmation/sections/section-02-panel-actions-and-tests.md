# Section 02 — Panel Actions and Regression Tests

## Ownership boundary

Own the visible Stop Frame prompt section and its interaction tests. Reuse
existing confirmation, button, icon, and polling-state patterns. Do not alter
the separate image-slot action or backend contracts.

## Target files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.stopFrameGeneration.test.tsx`

## UI/UX Contract

- Target user / job: a Vertical Drama creator reviews one shot's Stop Frame
  prompt, intentionally regenerates the prompt when needed, then renders its
  image from that prompt.
- Surface inventory: per-shot Stop Frame prompt button, prompt editor, and the
  new per-shot Stop Frame image button in the same prompt section.
- Component map: `VerticalDramaStoryboardPanel` → existing
  `useVerticalDramaCreditConfirmation` dialog → parent callbacks.
- State matrix:

  | State | Prompt action | Image action |
  |---|---|---|
  | no prompt | Create prompt, confirm-gated | hidden |
  | prompt ready | Regenerate prompt, confirm-gated | Generate image, confirm-gated |
  | prompt busy | disabled + loading label | disabled until prompt settles |
  | image busy | prompt action remains available unless prompt busy | disabled + loading label |
  | prompt/image error | existing toast/error path | existing per-shot error path |

- Responsive matrix: retain the existing card's wrapping flex layout; labels
  must remain reachable at mobile, tablet, and desktop widths without adding a
  fixed-width control.
- Accessibility: use real buttons with explicit bilingual accessible names,
  preserve visible focus, keep confirmation Cancel/Confirm keyboard reachable,
  and expose busy state through disabled/loading text.
- Design tokens: reuse existing Button variants, spacing, border, amber warning,
  and icon classes in the panel; do not introduce new colors or dependencies.
- Copy contract: Thai first with concise English fallback. Prompt dialog should
  state that AI generation may spend credits; image dialog should state that AI
  image generation may spend credits. Use existing Cancel/Confirm vocabulary.
- Browser evidence: check mobile 390x844, tablet 768x1024, desktop 1440x900
  when authenticated browser tooling is available; otherwise record skipped
  with the reason and rely on tests/build/manual source inspection.

## Work

- Replace the direct prompt callback in the visible prompt section with a
  `requestConfirmation` call. Use shot-specific test ids and the new busy set.
- Add a Stop Frame image button when `frame.stopFramePrompt.trim()` is truthy.
  Use the existing image callback, image busy set, spinner, and confirmation
  copy/pattern from the existing image-slot action.
- Keep the action order and compact styling consistent with the surrounding
  prompt controls.

## TDD expectations

Add tests for cancel/confirm, busy disabled state, prompt-gated image
visibility, image cancel/confirm, and image busy disabled state. Do not call
providers or mutate persisted data from these tests.

## Acceptance checks

- First create and regenerate both open confirmation.
- Prompt callback is invoked only after Confirm and once per confirmed action.
- Image button is rendered only for a non-empty prompt and is confirmation-gated.
- Existing image-slot action and other Start Frame controls are unchanged.

## Implementation result

Implemented in `VerticalDramaStoryboardPanel.tsx` with six focused regression
scenarios in
`VerticalDramaStoryboardPanel.stopFrameGeneration.test.tsx`. The new image
button is rendered in the prompt section and is disabled during either prompt
regeneration or image generation.
