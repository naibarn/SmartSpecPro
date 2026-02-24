# Section 13 Code Review Interview

## Review Findings Summary

### H1: Fade-out absent (LET GO)
**Finding:** The spec text requires a 0.5-second setInterval fade-out in `onSlideExit()`, but the spec's own tests require synchronous `pause()` with no fake timers — meaning the fade cannot coexist with the tests as written.
**Decision:** Let go. The spec's "best-effort visual polish" language supports immediate pause. A misleading comment was updated to reflect the actual behavior. Fade-out is a future enhancement.

### H2: `destroy()` inlines pause instead of delegating to `this.pause()` (AUTO-FIXED)
**Finding:** `destroy()` called `slideAudio?.pause()` and `projectAudio?.pause()` directly, bypassing `this.pause()`. If `pause()` ever gains additional logic, `destroy()` would silently miss it.
**Fix Applied:** Changed to `this.pause()` followed by null assignments.

### M1: `fadeOutMs: undefined` branch untested (LET GO)
**Finding:** `ResolvedProjectAudioTrack.fadeOutMs` can be `undefined` (optional in zod schema) but all tests use `null`. No behavioral difference at runtime since `fadeOutMs` is not acted upon.
**Decision:** Let go. `fadeOutMs` is reserved for future implementation; no current code reads it.

### M2: Shared mock instance fragility (LET GO)
**Finding:** Tests 1-10 use a single shared `mockAudioInstance`, which could produce unreliable assertions if both project and slide audio were created in the same test. Tests 8-10 avoid this by not calling `onSlideEnter`.
**Decision:** Let go. The test design is inherited from the spec. Tests pass reliably with the `MockAudio.mockImplementation` reset in `beforeEach`.

### M3: No test for double-`onSlideEnter` (AUTO-FIXED)
**Finding:** The spec's edge case table requires immediate pause of the previous slide audio when `onSlideEnter` is called twice without an intervening `onSlideExit`. No test covered this.
**Fix Applied:** Added test "onSlideEnter() called twice without onSlideExit pauses the first audio immediately".

### M4: `endAtMs` not documented (AUTO-FIXED)
**Finding:** `ResolvedAudioTrack.endAtMs` is defined in contracts but not used. No in-code comment explains this.
**Fix Applied:** Added `// TODO: honour slideAudioTrack.endAtMs by scheduling a stop timeout` comment.

### L1: Misleading fade-out comment (AUTO-FIXED)
**Finding:** The `onSlideExit()` docstring mentioned "best-effort 0.5-second fade-out" but the code performed immediate pause.
**Fix Applied:** Updated comment to accurately describe the immediate-pause behavior and note fade as a future enhancement.

### L2/L3: Test design notes (LET GO)
**Finding:** Minor test architecture observations about stub/unstub ordering and `src` property.
**Decision:** Let go. No actionable changes needed.

## Final Test Count
15/15 tests passing (14 original from spec + 1 added for double-onSlideEnter edge case).
