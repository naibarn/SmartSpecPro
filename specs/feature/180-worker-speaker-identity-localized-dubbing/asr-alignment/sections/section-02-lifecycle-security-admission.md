# 02: lifecycle-security-admission

Status: implemented for the current slice with a signed-runtime admission gate. Durable cloud lifecycle remains an external promotion gate. Dependencies: 01.

## Context and ownership

Parent Feature 180 additive extension. Preserve Whisper.cpp and existing saved projects. Ownership surface: server unifiedAudio, worker scheduler/registry/routes; Worker lifecycle. Exact new paths must follow adjacent module conventions. Shared schemas are owned by section 01; downstream sections request contract changes there rather than fork DTOs. Preserve unrelated dirty changes.

## Required design

Reuse durable jobs and artifact storage. Authorize tenant/project and worker binding at preflight, admission, claim and publication. Implement idempotency, cancellation fencing, atomic artifacts, expiring preflight, quotas and shared resource lease. Local files stay on owner Worker; cloud submission requires explicit route, transfer policy and budget. Do not introduce a second process scheduler.

Follow the versioned contracts, privacy rules, resource bounds and source-timebase rules in [master plan](../claude-plan.md). No fake inference, confidence, timestamps, speaker identity, capability readiness or silent fallback.

## Tests to write first

Cross-tenant/project and stale worker binding fail; concurrent duplicate requests execute once; cancel-complete race cannot publish; revoked access fails publication; export retry does not rerun ASR; unavailable cloud never silently falls back or uploads local audio.

Use existing Vitest/Rust conventions and fake subprocess fixtures for default CI; genuine model checks are opt-in and separately reported. A failed test must demonstrate the relevant behavior before implementation.

## Implementation sequence

1. Inspect affected imports/callers and existing tests; establish the narrow baseline.
2. Add the specified behavioral tests and record expected failures.
3. Implement the smallest compatible change using existing lifecycle and artifact abstractions.
4. Run targeted tests, inspect diff and document any runtime-only verification still pending.

## Completion evidence

Attach changed paths, exact test commands/results, schema/runtime revisions and remaining deployment gates. Required tests must pass; unrun GPU/provider/browser checks remain explicitly unverified. Do not enable a profile before its real runtime gate passes.
