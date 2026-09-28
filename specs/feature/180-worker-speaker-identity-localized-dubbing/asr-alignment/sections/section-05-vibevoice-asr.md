# 05: vibevoice-asr

Status: contract, routing and readiness implemented; signed VibeVoice runtime/GPU proof remains an external promotion gate. Dependencies: 01,02,03.

## Context and ownership

Parent Feature 180 additive extension. Preserve Whisper.cpp and existing saved projects. Ownership surface: optional VibeVoice runner/profile and adapter fixtures. Exact new paths must follow adjacent module conventions. Shared schemas are owned by section 01; downstream sections request contract changes there rather than fork DTOs. Preserve unrelated dirty changes.

## Required design

Implement a pinned real VibeVoice-ASR runner with bounded structured output validation and measured device profile. Preserve speaker turns and native segment times; invoke separately installed aligner only when word timestamps are requested. Gate long-form maximum by model and measured resource capacity. Expose no fictitious mid-inference resume.

Follow the versioned contracts, privacy rules, resource bounds and source-timebase rules in [master plan](../claude-plan.md). No fake inference, confidence, timestamps, speaker identity, capability readiness or silent fallback.

## Actual files and deviations

- Worker routing accepts a manifest-backed `vibevoice-asr` profile and enforces its declared word-timestamp/diarization capabilities.
- The current runtime has no VibeVoice pack; the UI keeps it disabled until a pinned, license-reviewed GPU pack is installed and measured.

## Tests to write first

Invalid speaker/time structures fail; segment-only output cannot claim word timing; required unavailable Thai alignment fails clearly; timeout/cancel frees resources; multi-window speaker labels are not merged by label alone; opt-in 30/60 minute tests record resource limits.

Use existing Vitest/Rust conventions and fake subprocess fixtures for default CI; genuine model checks are opt-in and separately reported. A failed test must demonstrate the relevant behavior before implementation.

## Implementation sequence

1. Inspect affected imports/callers and existing tests; establish the narrow baseline.
2. Add the specified behavioral tests and record expected failures.
3. Implement the smallest compatible change using existing lifecycle and artifact abstractions.
4. Run targeted tests, inspect diff and document any runtime-only verification still pending.

## Completion evidence

Attach changed paths, exact test commands/results, schema/runtime revisions and remaining deployment gates. Required tests must pass; unrun GPU/provider/browser checks remain explicitly unverified. Do not enable a profile before its real runtime gate passes.
