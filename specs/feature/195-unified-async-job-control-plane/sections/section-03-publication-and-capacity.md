# Section 03 — Admission, Outbox Publication and Capacity

## Source coverage

Feature 195 sections 6–10, 17–42, 51–76, 131–156 and 240–250; queue topology, lanes, provider capacity, reservation, fair scheduling, publication and Runner/Container envelopes.

## Deliverable

Make Job admission atomically write canonical state/event/outbox, publish redacted envelopes, reconcile failed publication and enforce capacity/reservation/backpressure with bounded queue/DLQ retry.

## Files

- Modify: `apps/web/server/services/jobControlPlaneGateway.ts`, publisher/consumer/capacity services
- Test: focused service/queue/capacity test files

## TDD steps

1. Add failing tests for DB-success/queue-failure, duplicate publication, capacity race, bounded backoff, DLQ and envelope redaction.
2. Run focused tests to verify failures are behavioral.
3. Implement transaction boundaries, outbox reconciliation and reservation rules.
4. Rerun tests and inspect logs for secret leakage.

## Completion gate

Queue ACK never substitutes for Job lease/fencing, and runtime readiness cannot block durable admission.

