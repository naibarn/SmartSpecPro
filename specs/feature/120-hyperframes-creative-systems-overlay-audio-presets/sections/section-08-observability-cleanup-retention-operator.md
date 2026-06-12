# Section 08: Observability, Cleanup, Retention, and Operator Tools

## Goal

Make Feature 120 operable in production: trace creative inputs, diagnose output
quality, clean up corrupted rows safely, and manage preset rollout without
exposing private data.

## In Scope

- creative-aware metrics and logs;
- operator inspection and replay metadata;
- preset disable/promote workflow;
- operator replay, purge, and repair action audit behavior;
- cleanup audit for invalid Storyboard Review rows;
- retention policy for preview, final, manifest, and audit artifacts;
- artifact/output kind compatibility and retention class tracking;
- sanitized diagnostics.

## Out of Scope

- Normal-user raw log access.
- Automated repair when identity is unverifiable.
- Deleting Library-owned media during project cleanup.

## Existing Files To Review

- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/services/hyperframesFeatureAccessService.ts`
- `apps/web/scripts/hyperframes-production-rollout-gate.mjs`
- `apps/web/scripts/hyperframes-doctor.mjs`
- `apps/web/scripts/hyperframes-snapshot-test.mjs`
- operator/admin router patterns in existing HyperFrames services

## Test First

Add failing tests for:

- metrics include product/run/storyboard refs, creativePlanHash, timelineHash,
  preset ids, fallback quality, font resolution, audio presence, output probe,
  overflow warnings, and status;
- diagnostics redact signed URLs, storage refs, local paths, raw HTML, raw logs,
  stack traces, and secrets;
- cleanup dry-run classifies legacy rows without deleting data;
- delete/archive requires operator permission and records audit;
- preset disable blocks new renders but preserves historical Library items;
- candidate promotion requires fixture, snapshot, QA, and rollout evidence;
- candidate to active promotion requires canary tenant evidence and fixture,
  snapshot, QA, audio, and accessibility proof;
- retention skips Library-owned outputs.
- retention dry-run skips active, locked, retry-grace, Library-owned, and
  operator-held artifacts;
- diagnostics include runtime profile hash and tested runtime versions without
  leaking private data.

## Implementation Notes

Treat unverifiable identity as a delete/archive workflow, not as a reason to
guess. Operator tools should report what can be proven and what must be
recreated.

## Acceptance Criteria

- Operators can see why a render failed without unsafe data leakage.
- Corrupt projects can be cleaned up safely.
- Preset rollout can be paused quickly.
- Retention does not remove durable Library media.

## Rollback Notes

Disable operator mutation procedures and keep read-only sanitized diagnostics.
