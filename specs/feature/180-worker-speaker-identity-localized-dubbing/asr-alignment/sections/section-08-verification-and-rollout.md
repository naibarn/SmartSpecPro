# 08: verification-and-rollout

Status: core implementation verified; production promotion remains gated by signed runtime/provider evidence. Dependencies: 01,02,03,04,06,07; 05 for VibeVoice promotion.

## Context and ownership

Parent Feature 180 additive extension. Preserve Whisper.cpp and existing saved projects. Ownership surface: focused tests, runtime evaluation fixtures/reports, release runbook. Exact new paths must follow adjacent module conventions. Shared schemas are owned by section 01; downstream sections request contract changes there rather than fork DTOs. Preserve unrelated dirty changes.

## Required design

Execute compatibility, security, lifecycle and subtitle suites. Run opt-in rights-cleared Thai/English/mixed/silence/overlap/TTS corpus against pinned real models. Record CER normalization, alignment boundary error, speaker error, seams, RTF, RAM/VRAM and cancel latency. Freeze measurable acceptance thresholds before promotion. Roll out legacy unchanged, Faster-Whisper, optional VibeVoice and TTS alignment independently with flags and rollback.

Follow the versioned contracts, privacy rules, resource bounds and source-timebase rules in [master plan](../claude-plan.md). No fake inference, confidence, timestamps, speaker identity, capability readiness or silent fallback.

## Actual verification

- Shared contract, transcription, provider, scheduler and ASR API tests: 72 passed across seven focused Web files (including the final contract, scheduler and unified audio service checks).
- Video Projects CRUD, stage and render regression suites: 163 passed across three router files.
- Worker media-workspace UI suite: 82 passed across 15 files; Worker Rust library: 243 passed; runtime manifest integration: 13 passed.
- Speaker-aware runner contract probe and Python unit tests: version `0.1.0` / `feature-179-v1`; 2 tests passed.
- Worker Rust `cargo check` passed; Worker TypeScript check passed; `git diff --check` passed.
- Full Web TypeScript check was attempted and hit the existing Node heap limit; no build or service restart was run.
- Real Faster-Whisper, WhisperX, VibeVoice, cloud, browser and GPU gates remain explicitly unverified.

The initial ten-round convergence audit is recorded in [implementation-gap-audit-10-rounds-20260908.md](../reviews/implementation-gap-audit-10-rounds-20260908.md). The final twenty-round rerun and hardening ledger is recorded in [implementation-gap-audit-20-rounds-20260908.md](../reviews/implementation-gap-audit-20-rounds-20260908.md); it found no remaining code-level `MUST_FIX`, while unavailable runtime/provider states remain intentional fail-closed gates.

## Tests to write first

No feature is marked production-ready by mocks alone; resource or quality gate failure leaves profile unavailable with a reason; rollback preserves artifacts and saved profile settings; all required tests have commands, results and model/device revisions; no real paid operation in default CI.

Use existing Vitest/Rust conventions and fake subprocess fixtures for default CI; genuine model checks are opt-in and separately reported. A failed test must demonstrate the relevant behavior before implementation.

## Implementation sequence

1. Inspect affected imports/callers and existing tests; establish the narrow baseline.
2. Add the specified behavioral tests and record expected failures.
3. Implement the smallest compatible change using existing lifecycle and artifact abstractions.
4. Run targeted tests, inspect diff and document any runtime-only verification still pending.

## Completion evidence

Attach changed paths, exact test commands/results, schema/runtime revisions and remaining deployment gates. Required tests must pass; unrun GPU/provider/browser checks remain explicitly unverified. Do not enable a profile before its real runtime gate passes.
