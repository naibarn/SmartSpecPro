# Section 08 — Execution Stream Separation

## Goal and boundaries

Implement M7 only if a safe bounded stream broker/transport seam exists. Execution output/viewer traffic must not starve authority, cancellation, recovery or receipt control traffic.

## Requirements

- Separate control commands/events from PTY/data stream channels and authorize every attachment against tenant/session/generation and current access policy.
- Reconnecting a viewer attaches to the current session; it cannot start or adopt execution.
- Apply bounded queues, per-viewer backpressure, explicit truncation/drop policy and terminal sequence resume. Critical receipts bypass data spool quotas through their durable outbox.
- Revoke viewers on tenant/session authorization change and protect against cross-session replay.
- If the existing transport cannot safely support this without a new unapproved broker, retain bounded local stream delivery and document M7 as deferred; do not build a speculative service.

## Likely owned files

- Rust `transport.rs`, `control_channel.rs`, new stream attachment/spool module; existing WebSocket/control route only where supported by current transport ownership.
- Stream contract/integration tests and operational limits documentation.

## Acceptance and tests

Cover AC-30 and AC-36. Test viewer reconnect, auth revocation, ordering, slow consumer, overflow, truncation marker, critical receipt survival and control-plane responsiveness.

## Dependencies

Requires Sections 02 and 04. Scope may be safely deferred with evidence if a broker is not present.

## Implementation record

- Critical receipt ACKs compact acknowledged history while retaining the latest ACK ID and receipt digest as a bounded replay tombstone. This keeps the durable lane reusable across long-running sessions, preserves latest-ACK retries across restart, and leaves economic deduplication to the server. The focused test cycles 128 receipts and verifies compaction, replay, and idempotency conflict behavior.

- Added bounded in-memory output spool, sequence/truncation reporting, scope validation, and durable critical-receipt journal with a process lock and symlink rejection. Focused stream tests passed after the process-lock hardening.
- Status: **PARTIAL**. No reconnect transport or server authorization-revocation channel exists; only the local delivery seam is implemented.
