# 06: script-alignment-and-subtitles

Status: script lineage, subtitle projection and review/apply flow implemented; acoustic `audio.align` remains an external runtime gate. Dependencies: 01,02,03,04.

## Context and ownership

Parent Feature 180 additive extension. Preserve Whisper.cpp and existing saved projects. Ownership surface: Worker alignment runner; subtitleFormatters.ts; canonical cue projection. Exact new paths must follow adjacent module conventions. Shared schemas are owned by section 01; downstream sections request contract changes there rather than fork DTOs. Preserve unrelated dirty changes.

## Required design

Align approved TTS script to final time-fitted audio. Version reversible normalization with Thai grapheme offsets, numbers and mixed scripts. Keep display text exact. Produce JSON/SRT/VTT from one revision and preserve ASS. Make reading-speed edits explicit revisions; remove fabricated end-time and minimum-duration widening. Export speaker labels only when selected.

Follow the versioned contracts, privacy rules, resource bounds and source-timebase rules in [master plan](../claude-plan.md). No fake inference, confidence, timestamps, speaker identity, capability readiness or silent fallback.

## Actual files and deviations

- `AutoSubtitleModal.tsx` now rejects missing/invalid cue bounds, preserves measured duration, filters unproven word timings, and exposes Review/Apply separately.
- Canonical normalization now emits segment projections and timing provenance from the Worker.
- Final-audio `audio.align` for generated TTS is exposed through the unified audio queue surface and remains disabled until an acoustic runtime/provider gate is signed and measured; current narration keeps truthful `script_timed` provenance until that gate passes.

## Tests to write first

Final audio or approved text change invalidates alignment; missing words cannot gain invented timestamps; Thai words are not joined with invented spaces; source-to-timeline transform applies once; short cues preserve measured duration; SRT/VTT/ASS escaping and Unicode round-trip are valid.

Use existing Vitest/Rust conventions and fake subprocess fixtures for default CI; genuine model checks are opt-in and separately reported. A failed test must demonstrate the relevant behavior before implementation.

## Implementation sequence

1. Inspect affected imports/callers and existing tests; establish the narrow baseline.
2. Add the specified behavioral tests and record expected failures.
3. Implement the smallest compatible change using existing lifecycle and artifact abstractions.
4. Run targeted tests, inspect diff and document any runtime-only verification still pending.

## Completion evidence

Attach changed paths, exact test commands/results, schema/runtime revisions and remaining deployment gates. Required tests must pass; unrun GPU/provider/browser checks remain explicitly unverified. Do not enable a profile before its real runtime gate passes.
