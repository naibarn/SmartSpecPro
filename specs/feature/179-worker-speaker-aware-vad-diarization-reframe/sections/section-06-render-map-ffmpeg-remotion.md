# Section 06 — Render Map, FFmpeg, and Remotion

## Goal

Make both renderers consume the same composed edit map, including profile-driven dead-air cuts, user manual cuts, condensation decisions, speaker actions, crop keyframes, subtitles, and overlays.

## Files owned

- `apps/worker-app/src-tauri/src/media_pipeline.rs` and `speaker_aware_pipeline.rs` for FFmpeg map compilation/QC.
- `apps/web/server/remotion/*` and relevant Remotion composition/service contracts for map consumption.
- `apps/web/server/services/__tests__/` focused parity tests.
- `apps/worker-app/tests/media-workspace/renderEditMap.test.ts`.

## Implementation tasks

1. Compile `ComposedEditMapV1` into an allowlisted FFmpeg segment/filter/concat plan. Keep manual and dead-air reasons in the manifest.
2. Pass the same map and map hash to Remotion. Apply source-time mapping before subtitle/overlay placement; do not make Remotion re-run VAD.
3. Verify output probe dimensions, duration, audio, crop bounds, mapping monotonicity, and checksum. Fail with typed `render_contract_mismatch` when unsupported features would be dropped.
4. Require approved edit-map hash and ready source artifact for destructive render/publication.
5. Preserve existing normal render and Remotion controls when no Feature 179 map is selected.

## TDD first

- FFmpeg and Remotion receive byte-equivalent canonical map/hash for the same plan.
- Profile threshold ranges plus manual cuts are both present in the compiled render plan.
- Removed source intervals are skipped in playback/render output mapping.
- Subtitle/overlay timestamps follow retained output time, not original time after cuts.
- Stale/unapproved map is rejected.
- Unsupported camera/render feature cannot silently pass.

## Exit evidence

Focused Rust/compiler tests, server Remotion prop tests, and a fixture parity report. Actual GPU/FFmpeg/Remotion rendering is tested only when local runtime dependencies are available; otherwise record the skipped runtime gate.

## UI/UX Contract

### Target User / JTBD
N/A for direct UI; render controls consume this map and approval state.

### Existing Pattern Reference
Reuse existing Worker render controls, Remotion status, FFmpeg export, and approval surfaces.

### Surface Inventory
N/A; renderer/compiler boundary only.

### Component Map
N/A; render control UI remains in existing components and is wired by section 07.

### State Matrix
Ready, stale, unapproved, contract mismatch, rendering, QC failed, and published are exposed to section 07.

### Responsive Matrix
N/A; no new visual surface.

### Accessibility Acceptance
N/A; existing render controls must remain keyboard reachable and announce disabled reasons.

### Copy Contract
N/A; existing render copy plus typed error keys are reused.

### Browser Evidence Required
N/A for this section; render approval evidence is section 08.
