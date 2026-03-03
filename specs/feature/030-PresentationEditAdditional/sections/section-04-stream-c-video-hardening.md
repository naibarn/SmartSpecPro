# Section 04: Stream C Video Hardening

## Objective
Harden video autoplay and lifecycle transitions in Play Mode while preserving current export video capability.

## Scope
- Standardize muted-first autoplay flow.
- Handle blocked play promise and recovery path.
- Prevent stale playback-map state across slide transitions.
- Preserve dynamic video flags in export payload generation.

## Dependencies
- Requires Section 01 outputs.

## Target Files
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/pages/PresentationPlayMode.tsx`
- `apps/web/server/services/presentationPlaybackExport.ts`
- relevant client/server tests for playback and payload generation

## TDD First (Stubs)
- Stub: muted-first autoplay on slide enter.
- Stub: blocked-play fallback behavior.
- Stub: slide enter/leave/next/prev lifecycle cleanup for playback state.
- Stub: `playing` event window assertions after transition.
- Stub: payload-level `hasDynamicVideo` assertions with media elements present.

## Implementation Tasks
1. Normalize autoplay setup sequence and fallback handling in canvas/play components.
2. Tighten lifecycle cleanup for active media map across route/state transitions.
3. Preserve and verify export payload dynamic-video signaling.
4. Add instrumentation hooks for autoplay failures and recovery.

## Validation
- Play Mode regression suite passes with real lifecycle assertions.
- Export payload still includes expected dynamic video indicators.
- Video motion remains present in downstream export checks.

## Risks and Rollback
- Risk: aggressive cleanup pauses expected playback.
- Rollback: fallback to prior lifecycle behavior behind guarded code path.

## Done Criteria
- Video lifecycle tests and export payload tests pass without regressions.
