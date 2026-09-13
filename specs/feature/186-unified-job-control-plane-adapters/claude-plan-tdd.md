# Feature 186 TDD Plan

The implementation must be test-first at each boundary. Tests use in-memory repositories for deterministic transition cases and PostgreSQL integration fixtures for constraints/transactions. Existing paid providers, production brokers, and real Cloudflare accounts are never used by default.

## Test matrix by section

| Section | Red tests first | Green implementation target |
|---|---|---|
| 01 Contracts | canonical hash equality/difference, input bounds, trusted tenant, redaction | canonical definition/hash and contract types |
| 02 Persistence | migration SQL shape, legacy status preservation, rerun-safe backfill, quarantine, transfer snapshot/item/checkpoint constraints | Drizzle additions and additive migration/backfill |
| 03 Lifecycle | concurrent create/claim, legal transitions, stale lease, soft/hard timeout, progress monotonicity, error classification, retry count, external wait | transactional control-plane service |
| 04 Adapters | duplicate publish, lost response, inspect-only, poison quarantine | outbox publisher and transport adapters |
| 05 Runtime | fenced reporter, lease expiry, reconciler boundedness, schedule duplicate/DST | executor/reporter/reconciler/scheduler |
| 06 Monitor | tenant/admin scope, cursor, redaction, action idempotency, transfer preview/approval/stale snapshot, active-job blocking, queue cancellation, resumable item checkpoints | monitor and tenant-transfer service/router integration |
| 07 Python | canonical payload, broker error, transport-only retry, Beat dedupe, direct-call inventory for `.delay()`/`.apply_async()`/`send_task()` | Python client/wrapper/scheduler bridge |
| 08 Operations | fake-provider convergence, static call-site inventory, Hyperdrive binding/cache/pool failure contract, deployment evidence checks | verification scripts/manifests/runbook |

## Required failure cases

The suite must prove no duplicate canonical row, business attempt, credit deduction, provider operation, notification, webhook, or artifact publication for duplicate delivery or lost acknowledgement. It must also prove that a stale lease cannot complete or mutate domain state after fencing, and that a database serialization retry reuses the same event/action idempotency key. Tenant transfer tests must prove preview fingerprinting, queueable-job cancellation without shared queue flush, active-job blocking, unsupported disposition, pause/resume on the same canonical transfer job, terminal cancellation, and no rollback of already transferred items. System Admin tenant-binding tests must prove queueable cancellation happens before commit, active jobs block, partial cancellation evidence survives a failed move, and an idempotent repeat continues without implicit data transfer. Cloudflare-boundary tests must separately prove Hyperdrive/PostgreSQL outage means no acknowledgement, fresh canonical reads are not satisfied by stale cache, and Workflow/Container replay converges without a new business attempt or paid side effect.

## Commands

- Web focused tests: `npm --workspace @smartspec/web run test -- server/services/__tests__/jobControlPlane.test.ts server/services/__tests__/jobOutboxPublisher.test.ts`
- Web typecheck: `npm --workspace @smartspec/web run check`
- Python focused tests: `python-backend/.venv/bin/pytest python-backend/tests/services/test_job_control_plane.py -q`
- Python migration tests: `python-backend/.venv/bin/pytest python-backend/tests/unit/migrations -q`
- Migration/artifact contract: `npm --workspace @smartspec/web run verify:feature-186`
- Migration dry-run: `npm --workspace @smartspec/web run backfill:unified-job-control-plane -- --dry-run --limit=100`
- Tenant transfer tests: `npm --workspace @smartspec/web run test -- server/services/__tests__/tenantDataTransfer.test.ts`

Commands that require a database must explicitly set a safe test `DATABASE_URL`; they must not inherit an unverified production or developer database for data mutation.
