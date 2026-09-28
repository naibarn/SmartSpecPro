# Section 05 — Durable Scan and Edit-Plan Jobs

## Goal

Connect Web queue admission to Worker execution, checkpointed scan artifacts, reviewable edit plans, callbacks, and stale-input protection.

## Files owned

- `apps/web/server/routers/workerJobs.ts` and focused Feature 179 router/service additions.
- `apps/web/server/services/workerSchedulerService.ts`, `workerCallbackService.ts`, `workerArtifactService.ts` only at existing extension points.
- `apps/worker-app/src-tauri/src/worker_executor.rs`, `worker_loop.rs`, `speaker_aware_pipeline.rs`.
- `apps/web/server/routers/__tests__/workerJobs.speakerAware.test.ts`.
- `apps/worker-app/tests/media-workspace/speakerAwareJobs.test.ts`.

## Implementation tasks

1. Add `speaker_aware_media_scan` and `speaker_aware_edit_plan` to shared/server/Worker job registries with required capability declarations.
2. Validate tenant/series ownership, source artifact readiness, parent edit-map hash, adapter policy, requested stage dependencies, idempotency key, and approval requirement before enqueue.
3. Worker claims only after preflight. Persist stage/checkpoint progress, coverage, policy hash, source hash, and model evidence. Resume only when hashes match.
4. Publish scan/plan artifacts through the existing artifact service with checksum/ownership verification and idempotent callback handling.
5. Mark stale results when source artifact, subtitle revision, manual edit revision, or adapter/model policy changes. Prevent render dispatch from stale plans.
6. Add concurrency/lease/backoff controls through existing scheduler mechanisms; equivalent active scans dedupe instead of consuming another GPU job.
7. Support cancel, retry, expire, and partial-result review without turning partial evidence into final success.

## TDD first

- Same idempotency key yields one active job.
- Callback replay is idempotent.
- Changed source/policy/model hash blocks resume and marks stale.
- Unauthorized tenant/artifact access is rejected.
- Cancel preserves checkpoint; retry resumes only matching checkpoint.
- Capability-blocked adapter prevents claim and explains remediation.

## Exit evidence

Focused server router/service tests, Rust job tests, payload contract fixtures, and local queue simulation without paid generation.

## UI/UX Contract

### Target User / JTBD
N/A for direct UI; this section owns durable state exposed by Web/Worker status surfaces.

### Existing Pattern Reference
Reuse existing worker job summary, polling, callback, artifact, and approval patterns.

### Surface Inventory
N/A; queue and artifact service only.

### Component Map
N/A; status components are section 07.

### State Matrix
Queued, claimed, running, checkpointed, uploading, verifying, completed, partial, failed, canceled, expired, and stale are explicit states for consumers.

### Responsive Matrix
N/A; no visual surface.

### Accessibility Acceptance
N/A; consuming status surfaces must expose state text and remediation.

### Copy Contract
N/A; UI maps typed failure/remediation keys.

### Browser Evidence Required
N/A for this section; job status browser evidence is section 08.
