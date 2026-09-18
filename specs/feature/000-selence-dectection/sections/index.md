<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-types-shared-logic
section-02-dialog-layout
section-03-settings-detection
section-04-region-list
section-05-waveform-overlay
section-06-mini-timeline
section-07-preview-skip-silence
section-08-export-to-timeline
section-09-backend-dead-air-cut
section-10-media-job-client
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-types-shared-logic | - | all | Yes (first) |
| section-02-dialog-layout | 01 | 03, 07, 08 | Yes (batch 2) |
| section-03-settings-detection | 01, 02 | - | Yes (batch 3) |
| section-04-region-list | 01 | 03 | Yes (batch 2) |
| section-05-waveform-overlay | 01 | 06 | Yes (batch 2) |
| section-06-mini-timeline | 01, 05 | 07 | Yes (batch 3) |
| section-07-preview-skip-silence | 01, 02, 05 | - | Yes (batch 3) |
| section-08-export-to-timeline | 01, 02 | - | Yes (batch 4) |
| section-09-backend-dead-air-cut | - | 10 | Yes (batch 2) |
| section-10-media-job-client | 09 | - | Yes (batch 3) |

## Execution Order

1. **Batch 1:** section-01-types-shared-logic (no dependencies, blocks everything)
2. **Batch 2:** section-02-dialog-layout, section-04-region-list, section-05-waveform-overlay, section-09-backend-dead-air-cut (parallel — depend only on 01 or are independent)
3. **Batch 3:** section-03-settings-detection, section-06-mini-timeline, section-07-preview-skip-silence, section-10-media-job-client (parallel — depend on batch 2)
4. **Batch 4:** section-08-export-to-timeline (depends on 01, 02 — but placed last as the integration/final-assembly section)

## Section Summaries

### section-01-types-shared-logic
Extend TypeScript types (`SilentRegion`, `SilenceDetectionConfig`, `SilenceDetectionDialogState`, `AnalysisStage`) in `videoEditor.ts`. Implement pure utility functions: `applyBufferToRegions()` for softening buffer calculation and `dbToPercent()` for dual dB/percentage display. These are the foundational types and helpers used by every other section.

### section-02-dialog-layout
Create the `SilenceDetectionDialog.tsx` full-screen modal component using Radix UI Dialog primitives. Three-zone layout: header with back/close buttons, main content area (preview left + settings right on desktop, stacked on mobile at <1280px), bottom timeline zone, and footer with "Export to Timeline" button. Convert `SilenceDetectionPanel.tsx` from a full sidebar panel to a trigger button that opens the dialog. Add `showSilenceDialog` state and dialog rendering in `VideoEditorPhase3.tsx`. Includes waveform data availability check on dialog open.

### section-03-settings-detection
Build the settings panel UI inside the dialog: three sliders (Volume Threshold -60 to -20 dB with dual dB/% display, Minimum Duration 0.1-5.0s, Softening Buffer 0.0-2.0s), track selection checkboxes, and the Analyze button. Implement the analysis flow: call `detectDeadAir()`, map results to `SilentRegion[]`, apply softening buffer, calculate stats. Handle cancellation via AbortController, error states, and re-analysis when buffer slider changes.

### section-04-region-list
Extract the silence region list from the existing `SilenceDetectionPanel.tsx` into a standalone `SilenceRegionList.tsx` component. Features: checkbox per region, Select All/Deselect All, expandable details (start, end, duration, dB, track name), "Skipped" badge for buffer-excluded regions, and click-to-scroll-to-region callback.

### section-05-waveform-overlay
Create `SilenceWaveformOverlay.tsx` — a canvas-based component that renders on top of `WaveformCanvas`. Draws semi-transparent red rectangles for silent regions (selected=0.3 opacity, deselected=0.15), dashed cyan borders for selected regions, hatched pattern for skipped regions, and a playhead vertical line synced to `currentTime`. Click interactions: click region to toggle selection, click elsewhere to seek. Uses same sizing strategy as `WaveformCanvas` (devicePixelRatio scaling). Performance: `React.memo`, `requestAnimationFrame` for playhead.

### section-06-mini-timeline
Create `SilenceTimeline.tsx` for the dialog's bottom zone. Vertically stacked: zoom controls bar (50-500 px/s), scrollable timeline area containing time ruler (tick intervals adjust with zoom), video thumbnail strip (from cached or on-demand thumbnail generation), and the waveform + overlay stack. Virtualized rendering to handle long videos (canvas never exceeds browser max ~16,384px). Auto-scroll follows playhead during playback.

### section-07-preview-skip-silence
Embed `PreviewPlayer` in the dialog with bidirectional sync: preview time changes update waveform playhead, waveform clicks update preview position. Implement "Skip Silence Preview" toggle: when enabled during playback, detect if currentTime falls inside a selected silent region and seek past it. Safeguards: cooldown (100ms), boundary guard (50ms), pre-sorted intervals with binary search for O(log n) lookup.

### section-08-export-to-timeline
Implement `handleSilenceExportToTimeline()` in `VideoEditorPhase3.tsx`. Algorithm: deep clone project, determine target tracks (single or all unlocked), sort regions descending, for each region split overlapping clips at adjusted boundaries using `trimIn`/`trimOut` math, remove silent segments, ripple-delete gaps. Track-type-specific handling: audio/video use trimIn/trimOut splits, text/overlay adjust startTime/duration only, muted/locked tracks excluded. Add to undo history as single step. Post-export: close dialog, show toast, highlight new boundaries.

### section-09-backend-dead-air-cut
Implement `handle_dead_air_cut()` in `python-backend/app/tasks/media_job_worker.py`. Replace `_not_implemented_handler`. Input validation: segment bounds, overlap check, count limit (500), type casting for injection prevention, buffer clamping. Calculate keep segments (invert silence), probe frame rate. Two FFmpeg approaches: select/aselect (no crossfade) or trim+concat with acrossfade (crossfade enabled). Handle edge cases: empty segments, single keep segment, audio-only files, VFR sources. Return artifact with derived metadata.

### section-10-media-job-client
Update `cutDeadAir()` method in `mediaJobClient.ts` to include `softeningBufferMs` and `crossfade` parameters in the MediaJobSpec params object. Defaults: `softeningBufferMs = 0`, `crossfade = false`. This connects the frontend dialog's server-side export option to the newly implemented backend handler.
