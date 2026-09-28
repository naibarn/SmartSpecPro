# Section 03 — Subtitle, VAD, and Diarization Evidence

## Goal

Normalize authored subtitles/ASR and selected VAD/diarization output into the shared evidence contract while preserving provenance and conflicts.

## Files owned

- `apps/web/shared/verticalDramaMedia/speakerAwareWorkflow.ts` evidence normalization helpers.
- `apps/worker-app/src/screens/media-workspace/subtitleFormatters.ts` only for reusable parsing boundaries; preserve exports.
- `apps/worker-app/src-tauri/src/speaker_aware_pipeline.rs` evidence stage execution.
- `apps/worker-app/tests/media-workspace/speakerAwareEvidence.test.ts`.

## Implementation tasks

1. Parse embedded/sidecar SRT, VTT, and ASS through the existing subtitle path and tag `authored_subtitle` versus `observed_asr`.
2. Normalize VAD frames/intervals to milliseconds with sample rate, threshold/profile, adapter identity, and confidence. Preserve speech and non-speech evidence rather than only cuts.
3. Normalize optional diarization into stable speaker IDs scoped to the scan artifact. Merge adjacent segments only when speaker and confidence continuity permit.
4. Join subtitle/ASR, VAD, and diarization by configurable overlap tolerance. Record disagreement/conflict windows; do not overwrite authored cues.
5. Preserve silence/dead-air profile values and manual ranges for the existing Quick Silence Cut path.
6. Add condensation proposal helpers that group transcript/subtitle cues into topics and return editable keep/remove/shorten candidates. No destructive edit occurs in this section.

## TDD first

- Thai/UTF-8 subtitle cues round-trip with correct time ranges.
- Authored subtitle remains authoritative text while ASR disagreement is visible.
- VAD gaps produce deterministic intervals and honor profile thresholds.
- Two/three diarized speakers remain distinct and uncertain windows are marked.
- Empty audio, no subtitle, malformed cue, and partial scan checkpoint are explicit states.

## Exit evidence

Focused TypeScript/Rust evidence tests and a fixture summary showing counts/provenance/conflicts. Adapter-dependent scans must be marked unavailable if model/runtime is absent.

## UI/UX Contract

### Target User / JTBD
N/A for direct UI; this section creates evidence consumed by review surfaces.

### Existing Pattern Reference
Reuse existing subtitle modal, waveform, and job-progress patterns in later UI sections.

### Surface Inventory
N/A; normalization and worker evidence only.

### Component Map
N/A; evidence review is section 07.

### State Matrix
Evidence exposes empty, partial, conflict, unavailable, and completed states for section 07.

### Responsive Matrix
N/A; no visual surface.

### Accessibility Acceptance
N/A; consuming evidence list must expose provenance/confidence as text.

### Copy Contract
N/A; section 07 maps evidence states to localized copy.

### Browser Evidence Required
N/A for this section; evidence review is covered in section 08.
