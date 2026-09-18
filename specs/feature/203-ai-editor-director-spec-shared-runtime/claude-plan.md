# Spec 203 Deep Implementation Plan

## Scope and completion rule

This plan implements the shared runtime foundations required by Spec 203 and
the integration contracts consumed by Spec 202. It is deliberately grounded in
the current repository: existing Feature 184/media contracts are extended, not
replaced; absent detectors remain capability-blocked/degraded adapters and are
never represented as completed production features.

Implementation order is dependency-first. Each section owns a distinct file
boundary and must add tests before production code. A section is complete only
when its tests pass, its public contract is documented, and no MUST_FIX gap
remains in the section review.

## Shared architecture decisions

### Authority and stores

- `video_editor_projects` remains the migration-facing Web project record.
- `video_editor_project_revisions` becomes the immutable revision authority for
  the active Web Editor after the adapter is enabled.
- `video_projects` / `video_project_revisions` remain a separate Video
  Studio/Intelligence domain; no ID coercion or cross-domain joins.
- `worker_jobs` plus the existing outbox is the only execution control plane.
- `ProjectExecutionSnapshot` is immutable and pins tenant, project, revision,
  timeline, source fingerprints, capability profile, policy, and contract hash.

### Shared identifiers and wire rules

- All durable IDs are opaque validated strings at the contract boundary; serial
  legacy IDs are mapped explicitly and never guessed from another domain.
- Canonical time uses a versioned timebase and integer ticks; millisecond fields
  are compatibility inputs with deterministic conversion and round-trip tests.
- Durable contracts contain managed asset references, not local paths, secrets,
  or short-lived signed URLs.
- Every mutation has an idempotency key, tenant-derived authorization, and a
  stale-revision response carrying the current revision metadata.

### Capability and evidence rules

- Admission requires an exact operation capability and locality match.
- Canonical machine states are `capability_blocked` and `waiting_agent` with
  bounded retry/timeout; Web labels are “capability-blocked” and
  “waiting-agent”.
- Evidence states are `pending`, `available`, `degraded`, `invalid`, and
  `expired`; degraded is diagnostic-only and cannot be promoted.
- Intent is untrusted model output. Only the deterministic compiler and safety
  validator may produce an executable plan.

## Section 01 — Shared canonical contracts and validators

### Goal

Create versioned TypeScript contract modules for canonical time/geometry,
ProjectRevision, ProjectExecutionSnapshot, EditorialEvidenceBundle,
EditorialIntentPlan, ExecutableEditPlan, change sets, QC, artifacts, and
capability/status projection. Reuse `packages/shared/src/video-editor` and the
existing media envelope validation style.

### File ownership

- `packages/shared/src/video-editor/canonicalTime.ts`
- `packages/shared/src/video-editor/editorialContracts.ts`
- `packages/shared/src/video-editor/index.ts` or the actual package export barrel
  discovered by the section implementation; the export must be verified by an
  import test rather than guessed.
- focused fixtures under `packages/shared/src/video-editor/fixtures/`
- unit tests under `apps/web/shared/` or the package's existing test boundary

### Contract requirements

- Time conversion must reject negative/NaN/infinite values, preserve explicit
  timebase, and expose source/absolute/trimmed domains.
- Evidence and intent validators must reject unknown unsafe fields and require
  schema/version, tenant/project/revision binding, source fingerprint,
  confidence/provenance, and deterministic hashes.
- Executable plans must be ordered, dependency-valid, bounded to allowlisted
  operation classes, and carry validator/QC obligations.
- Change sets must be non-destructive, idempotent, revision-bound, and able to
  preserve unsupported metadata without executing it.

### Tests first

Cover round-trip time conversion, malformed contracts, cross-tenant binding,
stale source/revision, DAG cycles, unknown operations, deterministic hash
stability, degraded evidence classification, and change-set idempotency.

## Section 02 — Project revisions, CAS, and migration data model

### Goal

Wire Feature 184 revision persistence into a server service with create,
read-current, append-revision, and expected-revision CAS semantics. Preserve
legacy project data through a versioned migration report.

### File ownership

- `apps/web/server/services/videoEditorProjectRevisionService.ts`
- `apps/web/server/services/__tests__/videoEditorProjectRevisionService.test.ts`
- `apps/web/drizzle/schema.ts` for the revision/snapshot/link fields and indexes
- `apps/web/drizzle/<next-number>_video_editor_runtime.sql` plus matching Drizzle
  journal/meta files for any new table or index
- a new Drizzle migration only if required after schema inspection

### Behavior

- Derive tenant/user from server auth and verify project ownership before read or
  write.
- Store canonical document/hash/client mutation ID and monotonically increasing
  revision number in the Feature 184 table.
- `expectedRevisionId`/hash mismatch returns a typed conflict with current
  revision summary; it never overwrites.
- Duplicate client mutation is idempotent and returns the existing revision.
- Legacy conversion preserves unknown fields and reports unresolved mappings;
  it does not silently drop media or protected ranges.

### Tests first

Test first save, CAS success, stale conflict, duplicate mutation, tenant/user
isolation, legacy conversion, malformed document rejection, and transaction
rollback behavior with the repository's DB mocks.

## Section 03 — Immutable execution snapshot and job/outbox admission

### Goal

Create the server-owned admission helper that atomically validates the revision,
creates an immutable snapshot, creates/link a canonical `worker_jobs` record,
and publishes an idempotent outbox event.

### File ownership

- `apps/web/server/services/videoEditorExecutionAdmission.ts`
- `apps/web/server/services/__tests__/videoEditorExecutionAdmission.test.ts`
- `apps/web/server/routers/editorMediaJobs.ts` integration changes
- schema/migration for the explicit snapshot table, revision indexes, and
  outbox/project-job linkage described in the section; migration authority is
  the existing Drizzle journal.

### Behavior

- Admission receives logical operation, project/revision, idempotency key,
  capability/locality requirements, asset refs, policy, and billing envelope.
- It re-reads server revision inside the transaction; browser `inputs.project`
  is compatibility input, never authority.
- It persists snapshot hash, source fingerprints, contract/version, and job link.
- Repeated idempotency returns the original job/snapshot without charging twice.
- Missing/changed source, stale revision, unsupported capability, and billing
  reservation failure produce explicit typed outcomes and no orphan success row.

### Tests first

Cover transaction ordering, duplicate submission, stale revision, missing
asset, outbox retry, billing refund, tenant isolation, and no-direct-insert
regression for the active editor path.

## Section 04 — Capability admission, lease, lifecycle, and projection

### Goal

Make server admission and UI status reflect exact Worker/Node capabilities and
canonical lifecycle without confusing queued, waiting-agent, blocked, degraded,
or completed.

### File ownership

- `apps/web/server/services/videoEditorCapabilityAdmission.ts`
- status projection additions in `editorMediaJobContract.ts`
- Worker capability constants only where current shared tokens are missing
- focused service/router/contract tests

### Behavior

- Exact operation token, contract version, locality, resource profile, and
  tenant policy are checked before dispatch.
- No matching executor returns `capability_blocked` with reason and route hint.
- Matching executor but no available agent returns `waiting_agent` with bounded
  retry/timeout metadata.
- Lease loss, cancellation, expiration, and retry transitions follow one
  canonical state machine.
- Output `degraded` is projected separately from job `completed` and cannot
  satisfy promotion readiness.

## Section 05 — Evidence, Intent, deterministic compiler, and safety validator

### Goal

Implement pure server-side boundaries for evidence ingestion, AI intent
validation, deterministic compilation, conflict resolution, and safety checks.
The first wave supports existing media evidence and a safe subset of timeline
operations; unsupported intents remain explainably blocked.

### File ownership

- `apps/web/server/services/editorialEvidenceService.ts`
- `apps/web/server/services/editorialIntentService.ts`
- `apps/web/server/services/editorialCompiler.ts`
- `apps/web/server/services/editorialSafetyValidator.ts`
- `apps/web/server/services/__tests__/editorialRuntimeContracts.test.ts`
- associated tests and golden fixtures

### Behavior

- Evidence is bound to snapshot/revision/source and has provenance, schema, and
  confidence calibration; stale/degraded/invalid evidence is not executable.
- Intent validation rejects prompt-injected/untrusted instructions, unknown
  operations, contradictory ranges, and unsafe crop/zoom/audio values.
- Compiler emits deterministic `ExecutableEditPlan` and hash from the same
  snapshot/evidence/intent/policy.
- Validator checks timeline continuity, linked A/V, crop bounds, timing,
  confidence policy, protected ranges, and unsupported metadata.

### Tests first

Golden tests for stable compilation, stale evidence, unsafe crop/zoom, protected
ranges, linked A/V, conflicts, unknown operation preservation, and degraded
evidence rejection.

## Section 06 — Artifact, QC, and final commit protocol

### Goal

Ensure a completed render is not success until outputs are verified, hashed,
uploaded through the existing storage/Library path, and linked to the exact
project revision/snapshot.

### File ownership

- `apps/web/server/services/editorArtifactCommitService.ts`
- `apps/web/server/services/editorQcService.ts`
- related `workerJobs`/project-job integration and tests

### Behavior

- Validate output role, media probe, duration/geometry/audio constraints, hash,
  and render manifest against the executable plan.
- Signed upload and server commit are idempotent; partial uploads remain
  recoverable and never report completed.
- QC warnings are distinct from hard failures; required QC failure blocks commit.
- Artifact links include tenant, project, revision, snapshot, job, hash, and
  source/provenance metadata.

## Section 07 — Web/Runner/Worker wire adapters

### Goal

Align all execution surfaces to the shared envelope, asset locality, capability
tokens, and render source selection without claiming unimplemented parity.

### File ownership

- `apps/web/client/src/components/videoeditor/workerRenderHandoff.ts`
- `apps/web/server/services/editorMediaJobContract.ts`
- `apps/worker-app/src-tauri/src/worker_executor.rs`
- `apps/worker-app/src-tauri/src/worker_loop.rs`
- existing Worker media pipeline tests

### Behavior

- Web sends project/revision/snapshot references and managed assets; no local
  paths are persisted.
- Worker claims only exact native operations and reports capability/contract
  revision truthfully.
- Node composition adapter is explicit; Windows parity is not advertised until
  executor/claim/evidence/promotion tests exist.
- Render/analysis source path selection remains identical across preview, Full
  Scan, and native render.

## Section 08 — Security, tenant isolation, concurrency, and observability

### Goal

Close cross-cutting safety gaps before UI rollout.

### Requirements

- Server-derived tenant/project/user checks for every revision, job, evidence,
  artifact, and status query.
- SSRF/path traversal/local-path rejection at contract and downloader boundaries.
- Bounded retries, cancellation, lease watchdog, idempotency, and no duplicate
  billing.
- Structured events for admission, conflict, capability block, degradation,
  promotion rejection, lease loss, artifact commit, and rollback.
- Metrics for queue latency, agent wait, failure categories, evidence quality,
  and artifact commit latency without secrets.

## Section 09 — Verification, migration, and release gates

### Goal

Prove all sections are integrated without falsely claiming unavailable
environments.

### Required verification

- Focused Vitest tests for shared, service, router, and Web component paths.
- Rust unit tests for capability hints/dispatch where Worker code changes.
- Browser evidence for Web save conflict, Full Scan degraded/blocked/waiting,
  review/apply, render progress, and final artifact states.
- Windows Worker evidence only when a real executor and installer/runtime are
  available.
- Migration rehearsal with rollback and no cross-domain project joins.
- Golden/determinism, chaos/lease recovery, security/tenant, and performance
  corpus gates from Spec 203.

## UI/UX contract for runtime-facing surfaces

Target user/job: editor wants to understand whether an AI operation is ready,
running, reviewable, blocked, stale, or complete without losing edits.

Surface inventory: `/video-editor` Phase 3 editor, AI operation panel, timeline
status, revision/conflict banner, job details, evidence review, render/QC panel.

State matrix: loading, empty/no analysis, queued, waiting-agent,
capability-blocked, running, degraded/review-required, conflict, failed,
completed, disabled while stale, keyboard focus, and selected change set.

Responsive matrix: mobile supports status/review/restore; tablet supports
timeline plus inspector; laptop supports editor plus AI panel; desktop supports
full timeline, evidence inspector, and job detail concurrently.

Accessibility: keyboard-only operation, visible focus, semantic labels for every
control, live-region status updates, non-color warning meaning, contrast, and
reduced-motion support.

Copy: concise Thai-first labels with English fallback; distinguish “รอ Worker”,
“ความสามารถไม่พร้อม”, “หลักฐานเสื่อมคุณภาพ”, “ขัดแย้งกับ revision ล่าสุด”, and
“เสร็จสมบูรณ์หลังยืนยัน artifact” rather than generic success/error.

Browser evidence: capture authenticated flows for clean save, stale conflict,
Full Scan degraded, capability-blocked/waiting-agent, review/apply, cancel,
render completion, and rollback route.

## Cross-section dependency order

01 → 02 → 03 → 04; 01 also blocks 05; 03/04/05 block 06/07; 02–08 block 09.
Section 08 can proceed after 03/04 and must be rechecked after every public
contract change.
