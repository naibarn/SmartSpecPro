# Section 01 — Contracts and Schema
+## UI/UX Contract

### Target User / JTBD

- N/A — schema/contracts only; section-06 owns the browser workflow.

### Existing Pattern Reference

- N/A — no browser surface; UI pattern search and reuse decision are recorded in section-06.

### Surface Inventory

- N/A — no route, dialog, table, or form is changed in this section.

### Component Map

- N/A — implementation is shared types, schema, and migration.

### State Matrix

- N/A — state is covered by service/API tests in sections 02 and 06.

### Responsive Matrix

- N/A — no browser layout is changed.

### Accessibility Acceptance

- N/A — no user-facing markup is introduced.

### Copy Contract

- N/A — user-facing copy is owned by section-06.

### Browser Evidence Required

- N/A — browser evidence is owned by section-06 and the final integration section.

## Scope

Establish the shared runtime-neutral contracts and the additive PostgreSQL
schema required by every later section. Production target metadata must describe
a newly provisioned PostgreSQL instance. The contract must state that Cloudflare
reaches that target through Hyperdrive and never reaches the Dev Server database.

## Ownership paths

- packages/job-control-plane/src/ or the existing Feature 186 type module:
  environment, platform, gate, promotion, release, action, and adapter ports.
- apps/web/drizzle/schema.ts: Drizzle table/enums/type definitions.
- apps/web/drizzle/0318_feature_188_platform_operations.sql: additive SQL after the Feature 189 schema and backfill migrations.
- apps/web/drizzle/0322_feature_188_promotion_binding.sql and `0323_feature_188_promotion_batch_fencing.sql`: additive activation binding and checkpoint lease/fencing follow-ups.
- apps/web/drizzle/feature188PlatformOperationsMigration.test.ts:
  migration/schema contract tests.
- apps/web/server/services/__tests__/feature188Contracts.test.ts:
  pure contract/config tests.

## Dependencies and exports

This section depends only on the current repository and Feature 186 schema.
It exports:

- EnvironmentName, PlatformKind, PlatformLifecycle, PromotionMode,
  PromotionPhase, GateStatus, PlatformAction (including
  `reconcile_activation` for lost activation acknowledgements).
- ReleaseIdentity, GateSummary, PromotionSummary, AdapterSummary,
  JobControlPlaneSummary, SeparationSummary, PlatformOverview.
- PlatformActionRequest and PlatformActionResult.
- schema tables and safe enum values consumed by services and routers.

The shared package must have no Node-only DB clients, BullMQ/Celery imports,
Cloudflare bindings, or provider SDKs. Export ports and data shapes only.

## Data model

Add the following logical records without creating a generic jobs table:

- platform_release_controls: one current guarded control per environment and
  scope, with target/source identity, release digests, lifecycle, maintenance,
  activation/rollback, fencing version, and separation state.
- platform_gate_results: append-only gate evaluations with gate identity,
  release/promotion/target identity, status, safe reason, evidence reference,
  source/actor, timestamp, and expiry.
- data_promotions: source/target identity, mode, phase, manifest/schema IDs,
  watermarks, lag, fence and validation state, credential state.
- data_promotion_batches: idempotent batch key, watermark range,
  table/partition, operation, counts/digests, retry/error state, checkpoint.
- data_promotion_dispositions: item scope, disposition, transformation version,
  owner/approval, reason, and evidence.
- platform_operation_outbox: durable external action intent, dedupe key,
  publisher lease/fence, provider reference, retry/error, and acknowledgement.
- platform_action_keys: action key, actor/scope, requested control version,
  payload digest, outcome, evidence reference, and timestamps.

Use existing audit/actor conventions and preserve evidence retention. These
records must not own worker job status, attempt, lease, result, or job identity.

## SQL constraints

Migration 0306 must be additive and must not drop, truncate, or delete data.
Add database-level uniqueness for environment control scope, gate evaluation,
promotion batch, action key, and platform outbox dedupe key. Add foreign keys
between operation records and parent records, bounded text/JSON constraints,
and indexes for active controls, unresolved gates, stale sync, pending batches,
evidence timeline, and source/target identities.

The migration must remain compatible with Feature 186 migrations 0303–0315 and
the existing schema's migration ordering. The implementation must use the
repository's normal migration generator/runner and must not silently rewrite
unrelated schema.

## TDD stubs

- Verify additive migration ordering after 0305.
- Verify each table, required field, enum, FK, unique constraint, and index.
- Verify duplicate gate, batch, action, and outbox records are rejected.
- Verify the shared package compiles without runtime-specific imports.
- Verify target metadata rejects source/target identity collision and missing
  Hyperdrive production binding.
- Verify secrets, URLs, and unbounded evidence are rejected from persisted
  metadata.

## Acceptance

The section is complete when the shared contracts compile for both planned
runtime packages, migration tests pass, schema constraints protect the
operation records, and later sections can import the contracts without
duplicating types or adding a second job ledger.
