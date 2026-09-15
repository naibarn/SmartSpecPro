# Section 01 — Inventory and serialized schema foundation

## Scope

Establish the implementation inventory and the database contracts required by tenant identity hardening and resumable transfer. This section is the only schema-writing section. The conductor edits Drizzle schema/migration files serially, validates them, and completes the database gate before any dependent implementation wave.

## Required changes

- Inventory auth, OAuth, invite, tenant, protected-route, `domain_admin`, storage/media, job, queue, provider, and resource ownership call sites. Record exact file, symbol, current tenant source, side effects, test coverage, and migration wave in `rollout-manifest.md`.
- Define shared tenant-source/error, transfer resource/operation/item, conflict, exclusion, and redaction contracts in the existing shared/server module locations.
- Preserve `users.currentTenantId` as the sole account binding. Add `tenantIdentityMigrationReason` and `tenantIdentityMigratedAt` if absent.
- Add immutable `tenant_identity_events` with affected user, actor, old/new tenant, action (`backfill` or `system_admin_move`), reason, prior/current credits, session-revocation outcome, action idempotency key, unique event key, and server timestamps.
- Add `tenant_identity_actions` as the durable phase/fence record for a System Admin move, keyed by action idempotency key and user, with source/target snapshot, phase, fencing version, authorization decision, safe outcome, and timestamps. It is coordination metadata only and is not a tenant binding or job lifecycle source.
- Add `tenant_data_transfer_previews` as an immutable, expiring pre-approval snapshot with preview ID/fingerprint, source/target users and tenant, selection, handler/version snapshot, counts, and request idempotency key.
- Add `tenant_data_transfer_preview_items` as immutable per-resource preview rows linked to the preview, with handler/version, classification/reason, content hash, redacted metadata, cursor indexes, and uniqueness scoped to the preview. Approval fingerprints the complete snapshot.
- Add `tenant_data_transfer_plans` as one immutable approved snapshot per canonical transfer job, including source/target user and tenant, selection, handler/version snapshot, fingerprint, and bounded policy metadata. Derive operation state/progress/result summary from `worker_jobs` and transfer items; do not mutate the immutable plan row with a second lifecycle.
- Add `tenant_data_transfer_items` with `operationId = worker_jobs.id` (no second operation identity), source/target user and tenant, resource kind/source ID/destination marker, item state, handler version, content hash, deterministic idempotency key, disposition/error/conflict fields, and timestamps.
- Protect operation/resource/item/destination uniqueness and foreign keys. Do not add a generic `jobs` table, membership table, independent transfer lease, or independent job retry/status source.
- Protect the identity-move and transfer fences with unique action keys and
  user-scoped active-fence rules. Job admission/dispatch must consult the
  active fence before creating a new canonical queueable job or transport
  side effect.
- Create additive migrations `apps/web/drizzle/0316_feature_189_tenant_identity_and_data_transfer.sql` for the schema foundation and `apps/web/drizzle/0317_feature_189_tenant_identity_backfill_completion.sql` for the repeat-safe backfill stage. Backfill valid current tenants, then uniquely matching `registeredDomain`, then the explicit Default tenant; never use current hostname and never alter credits or domain-owned data.

The migration must also define bounded lengths/depth for selection, preview
metadata, conflict/error text, and handler snapshots; tenant-aware indexes for
preview/plan/item reads; unique action/request keys; unique preview fingerprints
within the tenant; unique item keys within an operation; and unique destination
markers per resource/operation. Foreign keys must preserve audit and item
evidence rather than cascade-delete it. If PostgreSQL row-level security is not
enabled for these tables, every repository query must require the authenticated
tenant context and tests must prove that an omitted or mismatched context
returns no rows and cannot mutate data.

Persist absolute preview expiry and operation policy/deadline values, not only
mutable policy JSON. Store handler registry version, policy version, schema
version, and the complete selection/snapshot digest before approval returns.
No migration may reuse any Feature 186 migration `0303`–`0315` or add a second
`currentTenantId`, status, retry, lease, or job identity field.

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
