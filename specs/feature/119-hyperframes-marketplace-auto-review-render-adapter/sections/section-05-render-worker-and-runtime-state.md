# Section 05: Render Worker and Runtime State

## Goal

Implement the centralized HyperFrames render worker service and runtime state mapping while keeping MVP persistence compatible with existing Marketplace Auto Review outbox/artifact patterns.

This section should make render jobs observable, retryable, cancellable, and recoverable without replacing existing Auto Review run/stage state. Production render output must be produced by official HyperFrames CLI or producer/runtime APIs; custom Playwright/FFmpeg smoke rendering is diagnostic-only.

## In Scope

- HyperFrames render service.
- Worker entrypoint.
- Job lifecycle and status projection.
- Retry classification.
- Dead-letter and stale-lock recovery policy.
- Cancellation behavior.
- Official HyperFrames runtime execution through CLI and/or producer/server.
- Fixture render command interface.
- Runtime version diagnostics and compatibility mode projection.
- Tenant/run scoped storage path contract.

## Files To Create

- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/workers/hyperframesRenderWorker.ts`
- `apps/web/server/services/__tests__/hyperframesRenderService.test.ts`
- `apps/web/server/services/__tests__/hyperframesWorkerPolicy.test.ts`

## Existing Files To Review

- `apps/web/server/jobs/marketplaceAutoReviewJob.ts`
- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/hyperframesAssetStagingService.ts`
- `apps/web/server/services/hyperframesQaService.ts`
- existing outbox/artifact persistence helpers

## Test First

Add failing tests for:

- idempotent render job creation using run ID, input hash, template version, platform profile, and launch mode;
- status mapping from internal worker steps to `HyperframesRenderStatusProjection`;
- transient failures retry with bounded attempts;
- permanent input, policy, template, or QA failures do not auto-retry;
- stale lock recovery only reclaims jobs with the same input hash and template version;
- cancellation returns best-effort status and does not delete completed Library items;
- dead-letter status contains sanitized diagnostics;
- replay requires operator permission and rejects stale input hashes.
- outbox payload uses the spec job types, hash fields, and idempotency key format;
- artifacts use the spec artifact kinds, content hashes, retention classes, and sanitized diagnostics metadata;
- finalized Library linkage maps to `saved_to_library` with an open-Library next action.
- storage keys use tenant/run scoped paths and reject cross-tenant or broad filesystem output paths.
- migration promotion requires an explicit decision note and, when promoted,
  dry-run SQL, rollback SQL, backfill, dual-read, cutover flag, cleanup proof,
  and old/new ledger tests.
- safe auto-repair recommendations are produced only for stale hash, missing
  snapshot, retryable worker/dependency/storage failure, and minor layout warning
  cases that can be recovered without unsafe customization.
- production-complete render jobs reject diagnostic-only smoke output and
  require official HyperFrames runtime evidence.
- runtime mode projection differentiates `official_runtime_blocked`,
  `official_cli_ready`, `official_producer_ready`, `canary`, and `rollback`.

## Job Lifecycle

Target statuses:

- `queued`;
- `staging_assets`;
- `linting`;
- `snapshotting`;
- `inspecting`;
- `rendering`;
- `qa_checking`;
- `ready_for_review`;
- `saving_to_library`;
- `saved_to_library`;
- `completed`;
- `cancel_requested`;
- `cancelled`;
- `failed_transient`;
- `failed_permanent`;
- `dead_lettered`.

The UI should receive only sanitized projections with progress copy, next action, and safe diagnostics.

## Runtime State Strategy

For MVP, prefer existing outbox/artifact storage where practical:

- Store render intent and status in run metadata or existing artifact records.
- Store staged manifest refs and output refs as artifacts.
- Store input hash/template/platform fields in metadata.
- Avoid a dedicated render table until concurrency, query, or audit requirements require it.

MVP outbox contract:

- Table: `marketplace_auto_review_outbox_jobs`.
- Job types: `hyperframes_asset_stage`, `hyperframes_lint`, `hyperframes_snapshot`, `hyperframes_render`, `hyperframes_inspect`, `hyperframes_finalize`.
- Required `payloadJson` fields: `compositionInputHash`, `compositionHtmlHash`, `templateId`, `templateVersion`, `templateContentHash`, `platformPresetId`, `platformPresetVersion`, `renderIntent`, `compositionMode`, `runtimeProfileHash`.
- Idempotency key format: `hyperframes:{tenantId}:{runId}:{templateId}:{templateVersion}:{platformPresetId}:{renderIntent}:{compositionInputHash}`.
- Existing `status`, `attempts`, `maxAttempts`, `lockedBy`, `lockedUntil`, `scheduledAt`, and `lastError` fields remain the worker state source.

MVP artifact contract:

- Table: `marketplace_auto_review_artifacts`.
- Artifact kinds: `hyperframes_input_json`, `hyperframes_composition_html`, `hyperframes_snapshot`, `hyperframes_render_mp4`, `hyperframes_render_webm`, `hyperframes_subtitle_vtt`, `hyperframes_manifest`, `hyperframes_sanitized_log`.
- `contentHash` dedupes retries and resumptions.
- `metadataJson` stores retention class, checksum details, template/runtime diagnostics, sanitized log refs, and redaction state.
- Raw composition HTML and worker logs must not be exposed to normal user UI.

Official runtime evidence contract:

- Every completed user-facing render records `hyperframesCliVersion` and/or
  `hyperframesProducerVersion`.
- Every completed user-facing render records Node, Chrome/headless-shell,
  FFmpeg, FFprobe, font profile, worker image digest/build id, template hash,
  composition hash, and runtime capability.
- A job rendered only by SmartSpecPro diagnostic Playwright/FFmpeg fallback
  cannot transition to `completed`, `ready_for_review`, `saved_to_library`, or
  any state that consumes credit or presents the output as a full HyperFrames
  render.
- Diagnostic output may be attached only as redacted evidence for blocked,
  failed, fixture, or operator-debug states.

Storage path contract:

```text
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/input.json
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/composition/index.html
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/composition/assets/...
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/snapshots/frame-000.png
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/output.mp4
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/manifest.json
```

Final Library copies may move to existing Library-owned paths after `library_finalize`; preview cleanup must never delete Library-owned copies.

Promotion criteria for dedicated tables:

- more than one render per run must be queried independently at high volume;
- operator dashboard requires indexed render history;
- retry/dead-letter state cannot be represented safely in existing structures;
- retention and purge rules require table-level lifecycle management.

Migration decision checkpoint:

- Before adding any dedicated HyperFrames table, write a short migration decision
  note in the implementation PR or planning closeout.
- If criteria are not met, record why the existing outbox/artifact model remains
  sufficient and keep schema unchanged.
- If criteria are met, create a separate migration sub-plan before code changes
  that includes dry-run SQL, rollback SQL, backfill from
  `marketplace_auto_review_outbox_jobs` and `marketplace_auto_review_artifacts`,
  dual-read compatibility, a cutover flag, cleanup proof, and tests for both
  old and new ledgers.
- During dual-read, user projections must prefer the dedicated HyperFrames table
  only when a matching render job and artifact set are fully backfilled; otherwise
  fall back to the existing Marketplace Auto Review rows.

## Worker Steps

1. Load job and validate tenant/product/run access.
2. Recompute or verify input hash.
3. Stage assets.
4. Materialize the HyperFrames composition project directory.
5. Run official HyperFrames lint.
6. Produce key-frame snapshots with official HyperFrames snapshot or equivalent
   producer path.
7. Run official HyperFrames inspect.
8. Render preview or final output with HyperFrames CLI, `@hyperframes/producer`,
   or producer server.
9. Run final QA.
10. Persist artifacts and status.
11. Emit timeline/status projection.

## Safe Auto-Repair Policy

Render status mapping should include repair recommendations when a system action
can recover without asking the user to customize Auto:

- stale input hash: offer `regenerate_from_current_plan` only when product/run
  evidence still matches access and compliance policy;
- missing snapshot: offer `recreate_snapshot` when composition input and staged
  assets are still available;
- retryable worker/storage/dependency failure: offer `retry_worker_step` within
  bounded retry policy;
- minor layout warning: offer `rerun_layout_inspect` or snapshot regeneration
  when no output-affecting user override is required.

Repair recommendations must be emitted as `HyperframesRepairAction[]`, audited
when executed, included in status copy, and blocked for disabled templates,
compliance blockers, tenant mismatch, stale ownership, or missing required
evidence. The worker/status mapper must return an empty array when no safe repair
exists instead of omitting the field.

## Retry Policy

Transient:

- storage timeout;
- temporary worker process failure;
- dependency startup failure;
- network timeout to owned storage;
- lock contention.

Permanent:

- invalid schema;
- disallowed asset;
- tenant mismatch;
- template disabled;
- stale input hash;
- missing required product truth;
- failed compliance/disclosure requirement;
- final QA failure caused by deterministic bad output.

## Acceptance Criteria

- Render job creation is idempotent.
- Storage keys are tenant/run scoped and never expose raw local paths to UI.
- Worker state is recoverable after process restart.
- Polling status is safe and user-readable.
- Existing Marketplace Auto Review run progression remains usable.
- No automatic retry masks permanent unsafe input.
- Standard Order continues to function when worker is disabled.
- Completed user-facing render output requires official HyperFrames runtime
  evidence; diagnostic smoke output cannot satisfy completion.
- Prompt/custom overlay, caption, CTA, transition, audio, and SFX changes are
  represented in the composition project and hash, not in custom render filters.
- Dedicated HyperFrames tables are not introduced without a migration decision
  checkpoint and migration sub-plan.
- Safe auto-repair actions are typed, auditable, and absent when policy,
  compliance, template, tenant, or evidence checks fail.

## Rollback Notes

Stop worker and disable HyperFrames flags. Queued jobs should become unavailable/cancelled projections. Completed Library assets remain durable and user-owned.

## UI/UX Contract

### Target User / JTBD

Users need reliable render progress, cancellation, retry/fallback, and completed output states without understanding worker internals.

### Surface Inventory

| Surface | Impact |
|---|---|
| Product Detail | render queue/progress/completion timeline |
| Storyboard Review | preview/result status and retry/fallback |
| MediaStudio | active render-to-library session state |
| Library | completed output after finalize only |

### Component Map

| Component | Worker projection |
|---|---|
| Render panel | status, progress, next action, polling hint |
| Timeline | sanitized render stage events |
| Cancel button | cancelable state |
| Retry button | retryable/dead-letter state |

### State Matrix

| State | Expected UI behavior |
|---|---|
| queued/running | progress and polling copy |
| cancel requested | best-effort cancellation copy |
| cancelled | fallback actions visible |
| failed transient | retry path visible if allowed |
| failed permanent | safe blocker and Standard fallback |
| completed | output/save actions visible |
| saved to library | open Library item and finalized metadata |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| mobile | progress steps collapse to compact status |
| tablet | timeline and render panel stack |
| desktop | timeline can show detailed worker stage labels |

### Accessibility Acceptance

Progress changes should be exposed through accessible status regions. Cancel/retry controls need keyboard focus and clear disabled states.

### Copy Contract

Worker status names are internal. UI uses shared status copy and safe diagnostics only.

### Browser Evidence Required

Product Detail and Storyboard Review must verify queued, running, cancel, failed, and completed render projections.
