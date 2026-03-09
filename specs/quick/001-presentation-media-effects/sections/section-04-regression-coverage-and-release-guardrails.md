# Section 04: Regression Coverage And Release Guardrails

## Goal

Finish the feature with regression protection, compatibility verification, and explicit release checks so the new motion model does not destabilize presentation editing or export.

## Scope

- Final frontend and server regression coverage
- Compatibility checks for old drafts
- Verification matrix for preview/export parity

## Files

- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.test.tsx` if helper placement affects canvas rendering behavior
- `apps/web/shared/presentation/contracts.test.ts`
- `apps/web/server/routes/slideRender.test.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/services/presentationExportDegradation.test.ts`

## Implementation Tasks

1. Run and fix all new unit/integration tests added in prior sections.
2. Verify backward compatibility for:
   - existing drafts without `mediaMotion`
   - SVG image rendering
   - existing video autoplay preview behavior
   - existing slide transitions
3. Add at least one mixed-deck test scenario:
   - static slide
   - image-motion slide
   - video-motion slide
4. Confirm warnings are stable for static-format degradation so downstream consumers can rely on them.
5. Document locally in code comments where `hasDynamicVideo` now means "record-mode dynamic capture required" to avoid future confusion.

## Verification Checklist

- Image zoom-in/zoom-out properties save and reload correctly.
- Video motion properties save and reload correctly.
- Preview motion follows slide timing and respects pause/resume.
- MP4 export enters dynamic capture mode for motion-only slides.
- PNG/JPG/PDF exports succeed and expose motion-omission warnings.
- No regression in existing image crop, video crop, or SVG tests.

## Exit Criteria

- All targeted tests pass.
- No unresolved schema compatibility issues remain.
- The implementation can be handed directly to `deep-implement` without reopening major technical decisions.
