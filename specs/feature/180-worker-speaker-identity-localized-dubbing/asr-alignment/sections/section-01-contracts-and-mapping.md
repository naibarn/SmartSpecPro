# 01: contracts-and-mapping

Status: implemented in this workspace slice. Dependencies: none.

## Context and ownership

Parent Feature 180 additive extension. Preserve Whisper.cpp and existing saved projects. Ownership surface: shared/verticalDramaMedia contracts; existing command DTOs. Exact new paths must follow adjacent module conventions. Shared schemas are owned by section 01; downstream sections request contract changes there rather than fork DTOs. Preserve unrelated dirty changes.

## Required design

Inventory existing job enums, payload versions, handlers and artifacts. Freeze public-operation to durable-job mapping without renaming stored jobs. Define versioned request/result/error schemas, capability snapshot, local artifact handles, timebase and immutable revision lineage. Separate ASR, alignment and speaker evidence.

Follow the versioned contracts, privacy rules, resource bounds and source-timebase rules in [master plan](../claude-plan.md). No fake inference, confidence, timestamps, speaker identity, capability readiness or silent fallback.

## Actual files and deviations

- Added `apps/web/shared/verticalDramaMedia/audioTranscription.ts` and its contract tests.
- Canonical transcript schema now pins `normalizerRevision` alongside source/model/runtime lineage; coverage is calculated from persisted segment words.
- Added optional transcription profile descriptors to `RuntimePackManifest`; old manifests deserialize with an empty profile list.
- The operation/job mapping for durable ASR jobs is declared in the shared scheduler constants, but durable ASR execution is not advertised until a Worker runtime profile is installed.

## Tests to write first

Reject invalid ranges, unsupported required capability, inconsistent hashes and unknown schema versions; legacy omitted-engine request selects Whisper.cpp; round-trip canonical JSON preserves nullable timing and anonymous speakers.

Use existing Vitest/Rust conventions and fake subprocess fixtures for default CI; genuine model checks are opt-in and separately reported. A failed test must demonstrate the relevant behavior before implementation.

## Implementation sequence

1. Inspect affected imports/callers and existing tests; establish the narrow baseline.
2. Add the specified behavioral tests and record expected failures.
3. Implement the smallest compatible change using existing lifecycle and artifact abstractions.
4. Run targeted tests, inspect diff and document any runtime-only verification still pending.

## Completion evidence

Attach changed paths, exact test commands/results, schema/runtime revisions and remaining deployment gates. Required tests must pass; unrun GPU/provider/browser checks remain explicitly unverified. Do not enable a profile before its real runtime gate passes.
