# Section 04 — Transactional Outbox and Adapters

## Goal

Publish canonical job intents reliably while keeping BullMQ/Celery transport IDs subordinate to PostgreSQL.

## Files

- Add `apps/web/server/services/jobOutboxPublisher.ts`.
- Add `apps/web/server/services/jobTransportAdapters.ts` with generic, BullMQ, and Celery-compatible implementations.
- Add adapter contract tests. A dedicated database publisher harness remains a follow-up test surface; the migration contract and control-plane tests cover the durable cancellation invariant in this slice.

## Requirements

Insert creation, event, and outbox intent atomically. Publisher claims with a short lease/fencing token, sends a minimal envelope (`jobId`, business attempt, optional attempt ID, contract version, outbox ID, dedupe key, bounded routing data), persists dispatch reference/event before local acknowledgement, and quarantines poison rows. Initial dispatch may omit `attemptId`; retry dispatch includes the created attempt. `publish` is idempotent by dedupe key; `inspect` is read-only. Broker events never decide business completion/retry.

## TDD acceptance

Cover broker outage, duplicate publish, lost publisher response, reclaim after publisher crash, unsupported contract, poison quarantine, reference namespace uniqueness, stable dedupe, and idempotent cancel.
