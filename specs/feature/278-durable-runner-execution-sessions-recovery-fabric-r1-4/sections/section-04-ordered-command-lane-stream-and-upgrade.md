# Section 04 — Ordered Command Lane, Input, Output and Upgrade

## Goal and boundaries

Implement M3 session control after recovery/fencing exists. Commands and user input must be ordered and replay-safe; a direct viewer-to-PTY write path is forbidden.

## Requirements

- Commands carry job/session/generation, authority/placement epochs, current `job_control_revision`, monotonic per-session sequence and stable idempotency key. Persist accepted/terminal receipts and replay watermarks locally and on the server.
- Ack-loss replay returns the original receipt and never repeats side effects. Reject out-of-order/stale commands and return explicit resync/tombstone semantics.
- Give PTY input to one explicit agent or human owner under an input-authority epoch. Takeover/handback serializes with agent input and revalidates authority.
- Bound detached output memory/disk, expose truncation markers, and reserve delivery for terminal/recovery/commercial receipts.
- Drain before Runner/Session Host update; negotiate required safety features before transfer. Unsupported Worker/host must enter `INCOMPATIBLE`/safe-detached and not kill workload. Reattach or rollback must not silently strand sessions.
- Register an idempotent reconciler for command, receipt and session projection outbox recovery.

## Likely owned files

- Rust `protocol.rs`, `journal.rs`, `control_channel.rs`, new `session_command_lane.rs`, `terminal_input.rs`, `output_spool.rs`, update/supervisor integration.
- Web runner command contracts/client/control route and durable session service/tests.
- Existing release/update code only where needed to negotiate host/session protocol.

## Acceptance and tests

Cover AC-05..06, AC-19, AC-21..22, AC-30, AC-35..36, AC-38, AC-40. Test duplicate commands, reorder, crash after effect-before-ack, human takeover races, output quotas/truncation, critical receipt under pressure, older binary downgrade and update rollback.

## Dependencies

Requires Sections 01–03. Supplies reliable control and stream contracts to Sections 08–10.

## Implementation record

- Added a journal-backed ordered command receipt lane with idempotency and authority/revision checks (`session_command_lane.rs`); two focused tests passed.
- Follow-up completion pass: fixed ack-loss retries after authority epoch/revision advances. The lane now returns the original matching durable receipt before checking current mutation authority; new commands still fail stale authority. A regression test was first observed failing, then passed after the change.
- The shared `Journal::persist` temp path now uses an unpredictable exclusive no-follow file, preventing a planted symlink from redirecting writes for session command/resource/receipt journals.
- Added durable stream receipt outbox lane and bounded output spool (`session_stream.rs`). Critical receipt journal now takes a process lock and rejects symlink journal/lock paths.
- The Linux Session Host now has an IPC-to-PTY writer with strict monotonic sequence and idempotency checks. Its integration test verifies same-payload ack-loss replay and rejects reuse of an idempotency key with different input bytes.
- Status: **PARTIAL / BLOCKED**. Host-local PTY input is still not mediated by the canonical Session Manager command lane or server watermarks; input-owner takeover, resync tombstones, update drain/rollback and an outbox reconciler remain open.
