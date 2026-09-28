# Feature 179 Synthesized Specification

## Outcome

Extend SmartSpecPro's Web + Worker media workflow so a user can optionally scan a source or an approved derived artifact, combine subtitles/transcript, configurable VAD, optional diarization, face/body detection, and active-speaker evidence, then produce a reviewable multi-speaker edit plan. The plan can be applied in any user-selected order and can feed both FFmpeg and Remotion through one immutable composed edit map.

## Non-negotiable behavior

1. Preserve source media and existing Silence Cut/manual editing.
2. Support subtitle-first 16:9 editorial trimming before 9:16 reframe.
3. Support multiple speakers and speakers not facing camera via body/person evidence.
4. Make adapter selection explicit and user-configurable per stage.
5. No silent adapter fallback and no fabricated success when a model/runtime is unavailable.
6. Keep all scan/edit artifacts versioned, hash-linked, and stale-input aware.
7. Require user review/approval before destructive or paid render actions.
8. Move slowly and hold stable framing by default; allow explicit cut-to-speaker and manual locks.
9. Allow transcript-based condensation as an editable proposal, never an automatic destructive rewrite.

## Planned deliverables

- Shared TypeScript/Zod contracts for workflow recipes, edit stages, adapter policy, subtitle evidence, VAD/diarization/visual tracks, active speaker evidence, scan artifacts, and composed edit maps.
- Pure shared planners for user-directed stage ordering, time-window fusion, stable focus selection, and deterministic edit-map composition.
- Worker capability/preflight and adapter registry with Silero, FireRed, TEN, WebRTC, optional pyannote, MediaPipe face, and body/person adapters represented honestly.
- Durable Worker jobs `speaker_aware_media_scan` and `speaker_aware_edit_plan`, idempotent callbacks, immutable artifacts, and stale parent checks.
- Web/Worker UI for recipe selection, stage ordering, adapter policy, preflight, scan progress, evidence review, speaker/track review, condensation review, and render approval.
- FFmpeg and Remotion consumers of the same composed edit map, including manual cuts and dead-air ranges.
- Focused tests, Rust tests, and documented browser evidence/limitations.
