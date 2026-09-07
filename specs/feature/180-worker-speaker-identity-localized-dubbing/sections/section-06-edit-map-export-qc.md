# Section 06 — Edit Map, Export and QC

> v2 implementation prerequisite: read ../contracts-v2.md and the v2 section dependency graph. Both local and cloud execution are supported through one control plane. Existing v1 scope remains unless explicitly revised there.

## Goal

Produce a localized MP4 through either FFmpeg or Remotion using one canonical edit map.

## Implementation scope

- Compose Feature 179 source/manual/silence/reframe decisions with localized cue audio and track routing in `LocalizedDubbingEditMapV1`.
- Preserve subtitle-first 16:9 -> later 9:16 and user-selected jump/slow-move behavior.
- Store source-to-derived timeline transforms, dependency checksums and a render-plan hash; reject stale input rather than rendering a mismatched composition.
- Implement FFmpeg fast source/audio path and Remotion full composition path from the same map.
- Add post-encode QC for duration, streams, loudness/peaks, black/frozen frames, subtitle timing and source-dialogue leakage.
- Version QC thresholds and record measured values, detector versions and any explicit per-export exception.
- Publish only after QC passes; retain failed output/report as restricted diagnostic artifact.

## TDD stubs

- Edit-map composition and deterministic projection tests.
- FFmpeg/Remotion parity contract tests.
- Post-encode QC fixture tests.
- Publication-blocking failure tests.
- Stale checksum/render-plan and versioned QC-threshold exception tests.
- Artifact signing and download authorization tests.

## Exit criteria

Both render paths produce equivalent localized decisions, QC reports identify bad cues/ranges, and no failed output is published as final.

## UI/UX Contract

### Target User / JTBD

Editors need to choose a render path, understand final audio/edit-map decisions and know whether an export is safe to publish.

### Surface Inventory

The existing Render & Export panel gains localized map summary, FFmpeg/Remotion choice, credit estimate, progress, QC findings and artifact links.

### Component Map

`LocalizedExportPanel` owns render choice/status; `EditMapSummary` owns source-to-output summary; `QcResultPanel` owns blocking findings; existing render controls remain authoritative.

### State Matrix

Cover preflight, credit confirmation, queued, running, partial publication, QC failed, QC passed, download-ready and expired artifact.

### Responsive Matrix

Keep the primary render action sticky on desktop/laptop; use a full-height export sheet and sticky footer on tablet/mobile.

### Accessibility Acceptance

Render choices and QC findings are semantic controls/landmarks, progress is announced, errors link to a cue/range and download actions have descriptive labels.

### Copy Contract

Differentiate “เรนเดอร์ FFmpeg”, “เรนเดอร์ Remotion”, “ตรวจ QC ไม่ผ่าน” and “พร้อมดาวน์โหลด”; show final versus estimated credits.

### Browser Evidence Required

Capture both render choices, progress, QC failure with range, successful artifact and expired artifact at desktop and narrow viewport sizes.

## v2 required integration

Use shared MixManifest buses and 178 delivery thresholds. Preserve local-only output as scoped local artifact when cloud publication is forbidden. Export approval is distinct from technical artifact finalization. Stale rights/cancel fencing blocks playable publication.
