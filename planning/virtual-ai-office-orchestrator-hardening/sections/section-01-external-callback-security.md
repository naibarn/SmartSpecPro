# Section 01: External Callback Security

## Goal

Make connector dispatch and callback handling replay-safe, auditable, and explicitly bound to the original work.

## Deliverables

- idempotency contract
- callback signature and timestamp rules
- nonce or one-time token policy
- callback-to-handoff binding rules
- audit and retry behavior

## Required Rules

- every outbound dispatch must include an `idempotencyKey`
- every inbound callback must validate signature, body hash, and timestamp
- every callback must bind to `handoffId`, `workItemId`, `teamId`, and `runId`
- replayed callbacks must be rejected, not treated as success
- retry attempts must be visible in audit history
