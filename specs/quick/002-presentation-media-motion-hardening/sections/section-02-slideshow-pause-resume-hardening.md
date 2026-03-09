# Section 02: Playback Surface Hardening

## Goal

ล็อกพฤติกรรม playback surfaces ให้ media motion แสดงถูกทั้งใน `Play Slideshow` และ `PlayMode`, พร้อม freeze/resume ถูกต้องจริงสำหรับทั้ง image และ video และกัน regression เรื่อง video remount/restart

## Scope

- Add explicit pause/resume regression tests in `PresentationEditor.test.tsx`
- Add PlayMode motion coverage in `PresentationPlayMode.test.tsx`
- Refactor shared canvas renderer/runtime if PlayMode currently misses motion
- Refactor slideshow test helpers if needed for deterministic fake-timer + RAF behavior
- Tighten runtime only if tests reveal drift or race conditions

## Likely Files

- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/pages/PresentationPlayMode.tsx`
- `apps/web/client/src/pages/PresentationPlayMode.test.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.test.tsx`

## Implementation Notes

- Test the exact user path:
  - open slideshow
  - advance time to mid-progress
  - pause
  - advance time while paused
  - verify transform unchanged
  - resume
  - advance time again
  - verify transform changes from paused value
- Reuse the same live `<video>` node identity check already introduced in v1 tests
- If necessary, extract a tiny test helper for mocked `requestAnimationFrame` to avoid repeated boilerplate
- Add PlayMode checks that entering `/presentation/:itemId/play` renders motion-bearing image/video elements with the same motion semantics
- If PlayMode offers play/pause controls, cover that control path too

## Acceptance Checks

- Paused motion does not drift while timers advance
- Resume continues from paused progress
- Video node identity remains stable
- PlayMode visibly applies media motion to image/video elements
- No new flaky async waits are introduced

## TDD Slice

1. Write failing pause/freeze test for slideshow video motion
2. Write failing PlayMode motion-rendering test
3. Optionally mirror with image motion test if code paths differ enough to justify it
4. Adjust runtime only if current behavior fails deterministic checks
