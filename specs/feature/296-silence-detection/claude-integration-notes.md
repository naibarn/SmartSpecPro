# Integration Notes — Opus Review Feedback

## Integrating

### CRITICAL: Clip Split `trimOut` Semantics (Section 10.3)
**Integrating: YES** — The reviewer correctly identified that `trimOut` is used as an absolute out-point (seconds into source asset), not a "remaining trim from end" delta. The codebase confirms: `addClipToTrack` sets `trimOut = clipDuration`, and V2 migration maps `trimOut` → `outMs`. The plan's Section 10.3 example must be corrected.

### HIGH: "Apply to All Tracks" Non-Audio Track Behavior (Section 10.2)
**Integrating: YES** — The plan needs to explicitly define how video, text/overlay, and image clips are handled. Video clips use `trimIn`/`trimOut` like audio but text/image clips are generated elements. Adding a subsection to clarify: video clips are split normally, text/overlay clips are split by adjusting `startTime`/`duration` only (no trim changes), muted tracks are excluded from "apply to all."

### HIGH: Backend Segment Input Validation (Section 11.4)
**Integrating: YES** — Adding explicit validation requirements: bounds checking (`startMs >= 0`, `startMs < endMs`, `endMs <= fileDuration`), type casting all values to float/int, segment count limit (500), and `softeningBufferMs` clamped to 0-5000.

### MEDIUM: Skip-Silence Infinite Loop Prevention (Section 9.3)
**Integrating: YES** — Adding `lastSkipTime` ref with cooldown, guard against seeking to a position within another region, and `requestAnimationFrame` polling instead of relying on coarse `timeupdate`.

### MEDIUM: Waveform Data Availability (Sections 3-5)
**Integrating: YES** — Adding explicit waveform data check on dialog open: if `asset.waveformData` is undefined, trigger `waveform_peaks` media job, show loading skeleton, define fallback behavior.

### MEDIUM: Canvas Max Width / Virtualized Rendering (Section 8.3)
**Integrating: YES** — Adding canvas max width constraint (16,384px) and viewport-based rendering requirement. Only render the visible portion plus a small buffer zone. This is critical for 30-minute videos.

### MEDIUM: WaveformCanvas Sizing Strategy (Section 7.1)
**Integrating: YES** — Specifying that `SilenceWaveformOverlay` must use identical sizing strategy (`width: '100%'`, `height: '100%'` CSS with `canvas.width = width * dpr` internal resolution).

### LOW: `analysisStage` Union Type (Section 3.3)
**Integrating: YES** — Defining `type AnalysisStage = 'idle' | 'preparing' | 'scanning' | 'detecting' | 'applying_buffer' | 'done' | 'error'` for type safety.

### LOW: Keyboard Accessibility / Radix Dialog (Section 4.3)
**Integrating: YES** — Switching to use Radix UI Dialog primitives as the dialog shell (matching ExportDialog pattern). This provides focus trapping, ESC handling, and proper ARIA attributes for free.

### LOW: Analysis Cancellation on Dialog Close (Section 5.3)
**Integrating: YES** — Adding `AbortController` for in-flight analysis requests, proper cleanup on dialog unmount.

### LOW: FFmpeg Frame Rate Probing (Section 11.5)
**Integrating: YES** — Adding a probe step before building FFmpeg command to get actual frame rate, avoiding A/V sync drift.

---

## NOT Integrating

### HIGH: Existing `handleCutAndCombine` Dead Code Warning (Section 10.2)
**Not integrating as plan change** — This is a valid observation about the codebase but doesn't require a plan change. The plan already specifies the new `handleSilenceExportToTimeline` as a clean implementation. Implementers should not be copying from `handleCutAndCombine`. No plan text points to it as a reference.

### MEDIUM: Multi-Track Detection Limitation (Section 5.3)
**Not integrating** — The existing behavior (analyze first selected track only) is the intended design for MVP. Multi-track analysis adds significant complexity. The current approach matches what Filmora and similar tools do. Will note as known limitation but not change the design.

### MEDIUM: `SilenceDetectionDialogState` Redundancy (Section 3.3)
**Not integrating as removal** — Keeping the interface as documentation/reference. Implementers will use individual `useState` hooks but the interface serves as a type contract for what state the dialog manages. Adding a clarifying note that it's a reference type, not used with `useState<SilenceDetectionDialogState>()`.

### LOW: dB-to-Percentage UX Confusion (Section 3.5)
**Not integrating** — The spec explicitly calls for dual dB + % display, matching Filmora's UX. The percentage is an accessibility aid for non-audio-engineers, not a "sensitivity" control. The label will clearly show "Volume Threshold" with both values, which is sufficient context.

### LOW: V1 vs V2 Clip Format (Section 10.2)
**Not integrating** — The codebase currently uses V1 format exclusively in the video editor. V2 is a migration target that hasn't been activated. The plan correctly targets V1. When V2 migration happens, all editor features will need updating — this isn't specific to silence detection.

### OBSERVATION: Directory Name Typo
**Acknowledged** — Cosmetic issue in the spec directory name. Not changing mid-workflow as it would break all file references.
