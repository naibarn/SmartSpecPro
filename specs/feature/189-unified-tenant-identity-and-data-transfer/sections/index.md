<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-inventory-schema
section-02-tenant-admission-auth-sso
section-03-authz-workspace
section-04-system-admin-move
section-05-transfer-registry-preview
section-06-transfer-execution-resume
section-07-api-ui
section-08-verification-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-inventory-schema | — | 02, 03, 04, 05, 06, 07, 08 | No; schema writer is serial |
| section-02-tenant-admission-auth-sso | 01 | 03, 04, 07 | Yes after 01 |
| section-03-authz-workspace | 01, 02 | 04, 05, 07 | Yes with 04 only where files do not overlap |
| section-04-system-admin-move | 01, 02, 03 | 07, 08 | Yes after 03 |
| section-05-transfer-registry-preview | 01, 03 | 06, 07, 08 | Yes with 04 after 03 |
| section-06-transfer-execution-resume | 01, 05 | 07, 08 | No; depends on control-plane/registry contract |
| section-07-api-ui | 02, 03, 04, 05, 06 | 08 | No; integrates server contracts and UI |
| section-08-verification-rollout | 01–07 | — | No; final gate |

## Execution Order

1. `section-01-inventory-schema`: inventory first, then conductor-owned Drizzle schema/migration and foundational contract tests. No schema-dependent wave starts before the migration/typecheck gate passes.
2. `section-02-tenant-admission-auth-sso`: tenant precedence, account-vs-branding resolver, password/OAuth parity, and guarded cross-root handoff.
3. `section-03-authz-workspace`: protected-route tenant hardening and authenticated workspace projection. It may run beside non-overlapping System Admin/transfer design work after section 02.
4. `section-04-system-admin-move` and `section-05-transfer-registry-preview`: parallel only after section 03 contracts are available and only with disjoint ownership paths.
5. `section-06-transfer-execution-resume`: canonical transfer job executor, queue kill/fencing, item idempotency, checkpoint, pause/resume, and reconciler.
6. `section-07-api-ui`: integrate tRPC procedures, dashboard/admin/transfer UI, localization, accessibility, and browser fixtures. UI behavior and visual polish are ordered in one ownership section; no parallel writer edits the same UI files.
7. `section-08-verification-rollout`: run full focused proof, migration rehearsal, rollout/rollback evidence, and residual-risk report.

## Shared Contracts and File Ownership

- Canonical account tenant is `users.currentTenantId`; public branding tenant is host-derived and never an authorization input.
- Transfer v1 moves selected work from `sourceUserId` to `targetUserId` inside one active tenant. It never moves tenant IDs, primary keys, transactions, usage, credits, credentials, sessions, secrets, admin roles, or active execution.
- Every source-owned canonical queueable job is automatically included in the queue-cancellation set; active `leased`/`running`/`waiting_external` work blocks approval with `ACTIVE_JOB_BLOCKED`. No shared queue is flushed.
- `worker_jobs.id` remains the sole canonical job identity. `tenant_data_transfer_previews`, `tenant_data_transfer_plans`, and `tenant_data_transfer_items` are coordination/domain projection records only.
- `operationId` equals `worker_jobs.id`; item keys include tenant/source/target/resource/handler/action so resume cannot collide across operations.
- `paused_on_error` maps to canonical `retry_scheduled` with `operatorReviewRequired` and no automatic dispatch until an idempotent resume action.
- Queued `pending`/`queued`/`retry_scheduled` jobs are cancelled/fenced and counted as `queue_cancelled`; canonical job/event/dispatch evidence remains. They are not regenerated.
- `tenant_identity_events` is the durable identity-move/backfill audit surface; buffered JSONL audit is secondary.
- Schema/migration files are conductor-owned and serial. A section writer that discovers another schema need must report it instead of editing schema.

## Section Summaries

### section-01-inventory-schema

Inventory tenant/auth/job/resource call sites, define shared contracts, add the serialized Drizzle schema/migration for identity audit and transfer coordination, and prove repeat-safe user backfill.

### section-02-tenant-admission-auth-sso

Implement server-side signup precedence, invalid invite rejection, account-tenant login/OAuth behavior, and one-time cross-root SSO protected by PKCE/state/nonce.

### section-03-authz-workspace

Replace host-derived authorization fallbacks in protected routes and services, enforce current-tenant `domain_admin` scope, and show authenticated workspace separately from branding.

### section-04-system-admin-move

Implement the guarded System Admin account tenant move, zero credits through the existing ledger boundary, preserve old data, revoke sessions/tokens, audit, and expose the explicit warning/action UI.

### section-05-transfer-registry-preview

Implement registered resource handlers, source/target user ownership checks, dependency/conflict analysis, terminal job-linked coverage, preview fingerprint, and approval creation contract.

### section-06-transfer-execution-resume

Implement canonical transfer job execution, queued-job kill/fencing, durable item markers, batch checkpoints, pause/resume/conflict actions, and reconciliation without duplicate side effects.

### section-07-api-ui

Wire the dedicated transfer router, operation/status endpoints, transfer wizard/monitor/resume UI, workspace badge, System Admin move UI, copy/localization, responsive behavior, and accessibility evidence.

### section-08-verification-rollout

Execute unit/database/control-plane/browser/migration tests, static call-site checks, canary and rollback gates, and produce the final evidence/runbook artifacts.
