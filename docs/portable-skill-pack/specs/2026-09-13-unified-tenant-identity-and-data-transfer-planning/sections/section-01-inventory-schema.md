# Section 01 — Inventory and serialized schema foundation

## Scope

Establish the implementation inventory and the database contracts required by tenant identity hardening and resumable transfer. This section is the only schema-writing section. The conductor edits Drizzle schema/migration files serially, validates them, and completes the database gate before any dependent implementation wave.

## Required changes

- Inventory auth, OAuth, invite, tenant, protected-route, `domain_admin`, storage/media, job, queue, provider, and resource ownership call sites. Record exact file, symbol, current tenant source, side effects, test coverage, and migration wave in `rollout-manifest.md`.
- Define shared tenant-source/error, transfer resource/operation/item, conflict, exclusion, and redaction contracts in the existing shared/server module locations.
- Preserve `users.currentTenantId` as the sole account binding. Add `tenantIdentityMigrationReason` and `tenantIdentityMigratedAt` if absent.
- Add immutable `tenant_identity_events` with affected user, actor, old/new tenant, action (`backfill` or `system_admin_move`), reason, prior/current credits, session-revocation outcome, action idempotency key, unique event key, and server timestamps.
- Add `tenant_data_transfer_previews` as an immutable, expiring pre-approval snapshot with preview ID/fingerprint, source/target users and tenant, selection, handler/version snapshot, counts, and request idempotency key.
- Add `tenant_data_transfer_preview_items` as immutable per-resource preview rows linked to the preview, with handler/version, classification/reason, content hash, redacted metadata, cursor indexes, and uniqueness scoped to the preview. Approval fingerprints the complete snapshot.
- Add `tenant_data_transfer_plans` as one immutable approved snapshot per canonical transfer job, including source/target user and tenant, selection, handler/version snapshot, fingerprint, and bounded policy metadata. Derive operation state/progress/result summary from `worker_jobs` and transfer items; do not mutate the immutable plan row with a second lifecycle.
- Add `tenant_data_transfer_items` with `operationId = worker_jobs.id` (no second operation identity), source/target user and tenant, resource kind/source ID/destination marker, item state, handler version, content hash, deterministic idempotency key, disposition/error/conflict fields, and timestamps.
- Protect operation/resource/item/destination uniqueness and foreign keys. Do not add a generic `jobs` table, membership table, independent transfer lease, or independent job retry/status source.
- Create migration `apps/web/drizzle/0306_feature_186_tenant_identity_and_transfer.sql` with additive expand/validate/backfill/contract sequencing. Backfill valid current tenants, then uniquely matching `registeredDomain`, then the explicit Default tenant; never use current hostname and never alter credits or domain-owned data.

## Canonical state mapping

Transfer operation states are projections only: `previewed`/`approved` are pre-dispatch; `running`/`resuming` use canonical active execution; `paused_on_error` maps to canonical `retry_scheduled` with `operatorReviewRequired` and no automatic dispatch until resume; terminal projection states map to canonical terminal outcomes. `worker_jobs.id`, `worker_job_events`, and Feature 186 attempts/outbox remain authoritative.

## Tests before implementation

- Schema and migration tests for sole `currentTenantId`, audit/item uniqueness, foreign keys, and legacy Feature 186 compatibility.
- Backfill fixture tests for valid preservation, inactive/missing tenant repair, unique registered-domain mapping, explicit Default fallback, idempotent rerun, and no hostname reassignment.
- Contract tests for bounded redaction and all stable error/state values.
- Migration rehearsal proving existing jobs/events/dispatches are retained and no queued work is deleted.

## Gate and ownership

Run the Drizzle migration/typecheck/database fixture gate before sections 02–07. If another section discovers a schema need, it returns `NEEDS_SCHEMA_CHANGE` to the conductor and does not edit schema/migrations.

## UI/UX Contract

### Target User / JTBD

N/A — schema/inventory foundation; browser behavior is specified in section 07.

### Existing Pattern Reference

N/A — no UI is changed in this section; section 07 records the existing UI patterns.

### Surface Inventory

N/A — no user-facing surface is owned here.

### Component Map

N/A — no components are owned here.

### State Matrix

N/A — migration/checker states are covered by tests and section 08 evidence.

### Responsive Matrix

N/A — no layout is changed here.

### Accessibility Acceptance

N/A — no UI is changed here.

### Copy Contract

N/A — no user-facing copy is owned here.

### Browser Evidence Required

N/A — browser evidence is owned by section 07.
