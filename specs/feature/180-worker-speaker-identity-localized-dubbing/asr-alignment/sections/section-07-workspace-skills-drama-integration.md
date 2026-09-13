# 07: workspace-skills-drama-integration

Status: shared contract and Worker UI integration implemented; durable Skill/DramaSeries route and cloud adapter promotion remain external gates. Dependencies: 01,02,04,06; 05 only for optional profile.

## Context and ownership

Parent Feature 180 additive extension. Preserve Whisper.cpp and existing saved projects. Ownership surface: AutoSubtitleModal.tsx; Worker workspace integration; 179 speaker mapping; Drama/Skill audio integration. Exact new paths must follow adjacent module conventions. Shared schemas are owned by section 01; downstream sections request contract changes there rather than fork DTOs. Preserve unrelated dirty changes.

## Required design

Expose the legacy profile plus Faster-Whisper/WhisperX, VibeVoice-ASR and a cloud option with actual readiness, selected language, optional word/speaker policy and export formats. Generate then Review then Apply with undo and revision conflict check. Preserve manual subtitles, style and ASS. Reuse common typed audio operations from versioned Skills and DramaSeries; approved character mapping remains distinct from diarization. Implement cloud option only for explicitly registered compatible providers.

Follow the versioned contracts, privacy rules, resource bounds and source-timebase rules in [master plan](../claude-plan.md). No fake inference, confidence, timestamps, speaker identity, capability readiness or silent fallback.

## Actual files and deviations

- Worker UI exposes the three ASR profiles and explicit word-level/diarization policies.
- Existing legacy invoke payload remains compatible when defaults are selected.
- Durable Skill/DramaSeries ASR/alignment route integration and cloud provider adapters are not enabled by this slice; they must consume the shared contracts before promotion.

## Tests to write first

Old projects and old invoke payload remain usable; selection/navigation never generates or installs; close/reopen shows durable job; stale revision cannot overwrite edits; keyboard/focus/mobile layouts pass; Drama TTS uses final audio plus approved script; denied cloud transfer cannot dispatch.

Use existing Vitest/Rust conventions and fake subprocess fixtures for default CI; genuine model checks are opt-in and separately reported. A failed test must demonstrate the relevant behavior before implementation.

## Implementation sequence

1. Inspect affected imports/callers and existing tests; establish the narrow baseline.
2. Add the specified behavioral tests and record expected failures.
3. Implement the smallest compatible change using existing lifecycle and artifact abstractions.
4. Run targeted tests, inspect diff and document any runtime-only verification still pending.

## Completion evidence

Attach changed paths, exact test commands/results, schema/runtime revisions and remaining deployment gates. Required tests must pass; unrun GPU/provider/browser checks remain explicitly unverified. Do not enable a profile before its real runtime gate passes.
