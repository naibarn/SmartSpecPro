# Ten-round spec and plan review

Review scope: `specs/feature/186-unified-job-control-plane-adapters/spec.md`, the approved design, `claude-plan.md`, the section index, all eight implementation sections, and `rollout-manifest.md`.

## Round 1 — user requirement coverage

Result: PASS after correction. The canonical spec now explicitly lists images, videos, allowlisted supported-format files, Series, Presentations, Storyboards, projects/workflows, completed artifacts/results, and all terminal job-linked kinds with registered handlers. It explicitly excludes transactions, usage history, credits, billing/settlement, credentials, sessions/tokens, secrets, admin roles, and active execution.

## Round 2 — canonical identity and state ownership

Result: PASS after correction. `operationId` is explicitly equal to `worker_jobs.id`; transfer tables are projections/checkpoints only. Transfer `paused_on_error` maps to canonical `retry_scheduled` plus `operatorReviewRequired`, and no second status/lease/retry source is introduced.

## Round 3 — completeness and large-preview safety

Result: PASS after correction. Supported formats are handler-owned and versioned; unsupported kinds/formats are visible. Immutable `tenant_data_transfer_preview_items` plus `listPreviewItems` provide cursor pagination, while approval fingerprints the complete snapshot.

## Round 4 — queue cancellation and redelivery

Result: PASS after correction. Queueable source-owned jobs are automatically enumerated, unpublished outbox intents are cancelled, published references are retained, adapter removal is best effort, and a later redelivery cannot claim a cancelled job. Shared queues are never flushed; legacy unbound messages use explicit quarantine/drain policy.

## Round 5 — active and ambiguous work

Result: PASS after correction. `leased`, `running`, and `waiting_external` work returns stable `ACTIVE_JOB_BLOCKED` at approval and cannot be partially transferred. Ambiguous provider work requires operation-key reconciliation or operator review.

## Round 6 — pause, resume, cancel, and partial progress

Result: PASS after correction. Bounded batches persist item outcomes and cursor checkpoints. Resume uses the same canonical job and item keys, skips settled items, retries only bounded retryable failures, and exposes `ดำเนินการต่อ`. Transfer cancellation is terminal, retains completed items, and marks unsettled items `operator_cancelled` without rollback.

## Round 7 — idempotency and side-effect protection

Result: PASS after correction. Create, preview, approval, action, item, destination, provider, artifact, and credit boundaries have explicit idempotency requirements. Item keys include tenant, source, target, resource, handler, and logical action; conflicts never overwrite/merge.

## Round 8 — schema and migration discipline

Result: PASS. `0306_feature_186_tenant_identity_and_transfer.sql` is conductor-owned and serialized. The plan adds no generic `jobs` table, no membership table, no second current-tenant column, and no mutable lifecycle on the immutable plan snapshot. Backfill is repeat-safe and preserves old data/ledger history.

## Round 9 — authorization, API, and UI safety

Result: PASS. Authenticated tenant scope comes from the account binding; host is branding only. Tenant Admin transfer and System Admin move are separate procedures. APIs include preview pagination, approval, operation status, item actions, resume, and redacted conflict views. UI states, exact warning copy, `ดำเนินการต่อ`, keyboard/focus, responsive, and browser evidence requirements are present.

## Round 10 — rollout, rollback, and proof

Result: PASS. The manifest separates inventory, schema, auth, System Admin move, preview, execution, resume/reconciliation, and handler expansion. Each wave has flags, drain/queue policy, rollback gates, canary/evidence requirements, and no production deployment is implied. The deep-plan section and UI-contract checkers pass.

## Final disposition

No known requirement or consistency gap remains in the reviewed spec/plan set. Runtime implementation, schema execution, production queue cancellation, and deployment proof remain future gated work and were not performed in this review.
