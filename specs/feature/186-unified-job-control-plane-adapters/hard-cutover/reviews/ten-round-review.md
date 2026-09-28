# Feature 186 hard-cutover review ledger

This ledger records ten focused review passes for the approved Wave 1
implementation. It is evidence for local correctness only; it is not a
production deployment attestation.

| Round | Review focus | Result | Action |
|---:|---|---|---|
| 1 | Producer ingress | Gateway derives tenant/actor and rejects unregistered handlers. | Pass; gateway tests added. |
| 2 | Canonical identity | Outbox and direct dispatch preserve `worker_jobs.id`; no provider ID becomes identity. | Pass; direct adapter returns a reference envelope only. |
| 3 | Stale delivery | Contract mismatch is terminal/reviewable; stale business attempts are ignored before claim. | Pass; consumer tests added. |
| 4 | Lease fencing | Retry envelopes carry `attemptId`; claim rejects a mismatched attempt record. | Pass; claim and consumer tests added. |
| 5 | Duplicate publication | Direct adapter deduplicates by outbox `dedupeKey`; repeated execution claims once. | Pass; adapter test added. |
| 6 | Failure/retry | Webhook HTTP 429/5xx/network failures are classified retryable; 4xx remains non-retryable. | Pass; executor classification updated. |
| 7 | Redis independence | Migrated webhook/embedding initializers skip legacy Redis queues; direct execution uses PostgreSQL outbox. | Pass locally; runtime connectivity still requires deployment proof. |
| 8 | Data safety | Webhook payloads are sanitized before durable canonical input; transport payload does not select tenant/adapter. | Pass; hard-cutover dispatch test added. |
| 9 | Compatibility boundary | Legacy calls remain explicit and counted; unmigrated producers are not hidden by the audit. | Historical Wave 1 snapshot; it reported 7 compatibility, 18 unmigrated BullMQ calls, and 15 Celery result-reader references before later waves centralized the remaining readers. |
| 10 | Release evidence | Focused tests, migration verification, audit, and diff checks are the required local gates. | Pass when commands below are rerun; typecheck intentionally skipped. |

## Remaining release blockers

- The historical 18 unmigrated BullMQ producer/scheduler calls and 15 Celery
  result-reader references were later closed at the direct-call boundary; the
  current remaining work is compatibility drain, projection/checkpoint proof,
  and external deployment/recovery evidence.
- Production build/restart, PostgreSQL availability, tenant authorization,
  delivery endpoint behavior, backup/PITR, and rollback evidence are external
  gates and are not proven by these local tests.
- The legacy webhook fallback remains in source for rollback/drain and must not
  be counted as a migrated side-effecting producer.

## Superseding rerun note — 2026-09-14

The historical Round 9 counts above describe the original Wave 1 snapshot. The
current machine-readable audit has since migrated the remaining business/API/
recovery result reads behind `python-backend/app/services/legacy_task_status.py`.
It now reports zero direct producer, scheduler, and application result-reader
calls, 47 adapter-owned Python submission sites, and three explicit legacy
transport calls inside the compatibility adapter. The centralized reader is
still rollback-only compatibility infrastructure; it is not proof that Redis/
Celery has been retired in every deployment mode.
