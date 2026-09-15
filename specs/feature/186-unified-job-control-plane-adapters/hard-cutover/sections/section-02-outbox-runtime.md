# Section 02 — Outbox Publisher Runtime

## Objective

Run the durable outbox as an actual bounded publisher loop.

## Files

- `apps/web/server/services/jobOutboxRunner.ts`
- `apps/web/server/jobs/unifiedJobControlPlaneOutboxJob.ts`
- focused runner tests

## Requirements

- claim only due/unpublished rows through existing fencing
- resolve adapters from server-side registry
- process bounded batches and continue after a poison row
- stop cleanly and never acknowledge an uncommitted publication
- expose safe metrics/log fields without payload secrets

## Done when

Tests prove batching, stop behavior, retry/quarantine, and no pre-commit
publication. Runtime wiring is feature-flagged. The first migrated job types
use the durable PostgreSQL outbox with the direct adapter and do not require a
Redis/BullMQ publisher.
