# P3 — Dialogue, Audio, Editing and Cross-Episode Continuity

## Goal

Close validated audio, lip-sync, sound design, editing and cross-episode continuity gaps by extending current Vertical Drama services while ensuring optional audio/continuity failure never removes a usable video path.

## Scope

Reconcile Feature 175 (currently design-only/unresolved), current dialogue/audio plans, native-audio prompt toggle, audio QC/repair/mastering/assembly, and series memory/story continuity. Select bounded implementation slices for what is actually absent after source and handoff reconciliation.

Exclude a browser DAW, unbounded soundtrack generation, replacing existing audio preferences, a parallel memory service, and an always-on or retired execution runtime.

## User-Facing Behavior

Existing dialogue-only/native-audio choices continue to work. Audio QC and continuity provide warnings and optional repairs. If an optional audio enhancement fails, preserve the valid video and any usable original/native audio under existing output contracts; tell the user truthfully what is missing.

## Technical Constraints

- Reuse `verticalDramaDialogueAudio.ts`, `verticalDramaAudioPipelineCoordinator.ts`, `verticalDramaAudioQc.ts`, `verticalDramaAudioRepair.ts`, `verticalDramaAudioMastering.ts`, `verticalDramaEpisodeVideoAssembly.ts`, and existing series memory.
- Use `worker_jobs` plus outbox for long-running work.
- Preserve original/native master and user-selected audio mode; no CPE QC status can silently mute or replace approved audio.
- Keep cross-episode memory tenant-scoped, revision-aware, and optional for current-episode rendering.

## Dependencies

P0 non-blocking contract; P1 shot/character/location lineage; P2 usable asset and version semantics.

## Outputs

Verified audio/video fallback, dialogue/lip-sync and edit contracts, versioned episode/series audio continuity facts, and source-backed completion for selected Feature 175 requirements.

## Edge Cases

- Audio generation or mastering fails after the video clip succeeded.
- The audio toggle is off, dialogue is absent, or a clip has only partial dialogue output.
- Lip-sync QC flags mismatch but the video remains technically usable.
- Prior episode memory is stale, incomplete, unavailable, or tenant-inaccessible.
- Assembly receives mixed native audio, generated dialogue, or missing audio segments.

## Error Handling

Preserve video and valid original audio; mark only the failed audio component; do not require a quality approval or wait; retain hard safety, ownership and billing semantics.

## Testing Expectations

Test native-audio on/off parity, dialogue-only and silent clips, missing/failing QC, mastering failure with video still accessible, accurate assembly manifests, no cross-tenant memory leakage, and no audio-only retry outside a valid budget.
