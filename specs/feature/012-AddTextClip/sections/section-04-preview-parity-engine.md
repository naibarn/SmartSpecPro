# section-04-preview-parity-engine

## Objective

Implement deterministic preview rendering for T1 text clips that matches canonical render semantics for supported capabilities.

## Scope

- Render text clips in preview using canonical payload fields.
- Load and enforce whitelist fonts for parity.
- Apply deterministic compositing order and keyframe interpolation.
- Include i18n shaping parity fixtures and explicit unsupported-script handling.

## Dependencies

- Requires sections `01`, `02`, and `03`.

## Primary Files

- `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx`
- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx` (preview data handoff)
- `apps/web/client/src/components/videoeditor/__tests__/...` (new parity tests)

## Tests First (Write Before Implementation)

1. Test: preview renders text payload fields with expected style/position at fixed timestamps.
2. Test: clip overlap z-order in preview matches clip-array order.
3. Test: keyframe interpolation/easing behavior matches canonical rules.
4. Test: font loading waits for deterministic readiness before parity-sensitive assertions.
5. Test: i18n fixtures (multiline Unicode, RTL, ligatures) pass declared capability expectations.

## Implementation Tasks

1. Add preview text-render path wired to canonical text payload.
2. Implement whitelist font loading path via `@font-face` assets.
3. Enforce deterministic clip compositing order from track clip sequence.
4. Implement keyframe interpolation using agreed easing semantics.
5. Add parity fixtures and helpers for representative timestamp assertions.

## Acceptance Criteria

1. Preview output is deterministic for agreed parity fixtures.
2. Overlap ordering and easing behavior are test-covered and stable.
3. Font behavior is explicit and parity-safe.

## Risks and Notes

- Preview/render drift is most likely in font metrics, alignment, and interpolation edges.
- Keep fallback behavior explicit for unsupported script/layout cases.

## As-Built Update (2026-02-15)

### Actual Files Changed

- `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx`
- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- `apps/web/client/src/components/videoeditor/__tests__/PreviewPlayer.textParity.test.tsx`
- `apps/web/client/src/components/videoeditor/__tests__/PreviewPlayer.renderPreviewMode.test.tsx`

### Implementation Notes

1. Added preview text overlay rendering path in `PreviewPlayer` driven by canonical `textConfig` + `transform` payload fields.
2. Wired `VideoEditorPhase3` to pass active text clips at playhead time into preview as ordered overlay inputs.
3. Implemented deterministic overlay compositing order based on clip-array order (`zIndex` by ordered overlay list).
4. Reused shared transform interpolation (`resolveTransformAtTime`) so preview follows keyframe easing semantics, including per-property overrides added in Section 03.
5. Added preview font whitelist fallback with deterministic readiness gating (`document.fonts.load`) before parity-sensitive overlay assertions.
6. Added text-only preview fallback stage so active text clips remain visible when no base video clip is active.

### Deviations From Plan

- Font parity currently uses whitelist fallback + font readiness checks; explicit asset-level `@font-face` bundling for all allowed fonts remains a follow-up.
- i18n coverage currently validates multiline Unicode/RTL/ligature text rendering and fallback behavior in unit tests, but does not yet include visual golden-image fixtures.

### Tests Added/Updated

- Added `PreviewPlayer.textParity.test.tsx` with coverage for:
  - canonical field rendering at fixed timestamps
  - overlap z-order determinism
  - keyframe easing parity behavior
  - font readiness gating
  - i18n fixture rendering and font fallback.
- Updated `PreviewPlayer.renderPreviewMode.test.tsx` assertion to stay resilient to lock-mode help-text suffix changes.

### Follow-Ups

- Introduce shared preview/render golden fixtures for timestamp-level pixel parity.
- Add explicit unsupported-script policy assertions once backend render constraints are finalized.
