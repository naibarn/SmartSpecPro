# Section 03 — Recovery Reconciliation and Authority Fencing

## Goal and boundaries

Implement M2: rediscover sessions after Worker/control restart, reconcile with canonical job authority, and prevent split-brain mutation. A local inventory report is untrusted input until authenticated and reconciled.

## Requirements

- Add Runner instance identity and host boot identity; bounded paginated inventory and recovery batching/concurrency limits.
- Server reconciles inventory with current `worker_jobs` tenant, job, attempt, lease, fencing version, cancellation/approval, session generation and `job_control_revision` before adopting.
- Adoption uses a transaction/CAS over the canonical execution slot so only one control-plane instance advances the authority epoch. Losers cannot receive a mutation-capable grant.
- Issue signed, bounded Execution Authority Grants with key ID, key rotation chain/overlap, session/job/runner scope, authority and placement epochs, allowed effect class, revision and required safety features. Session Host trust roots are provisioned out-of-band from mutable workspace; reject unknown/retired key and anti-rollback.
- Convert grant duration into suspend-safe local expiry. Wall-clock rollback, host resume, VM restore, or uncertain elapsed-time forces safe quiesce and fresh confirmation. Expiry works without a new Worker command.
- Reconcile terminal receipts through durable outbox and canonical job settlement only. Recover pending approvals/cancellation idempotently. Unreconciled workspaces/sessions are protected from GC.
- Stale sessions enter safe-detached/quiesced state; attach failure alone must not kill workload. Revoke attach credentials after successful adoption.

## Likely owned files

- New server `runnerSessionRecoveryService.ts`, `runnerExecutionAuthorityGrantService.ts`, router/control endpoints and worker reconciliation job.
- Additive schema from Section 01 only through an explicit migration single-writer pass if new recovery-specific fields are essential.
- Rust `session_host.rs`, new `authority_grant.rs`, `recovery_inventory.rs` and clock/boot identity abstractions.

## Acceptance and tests

Cover AC-02..04, AC-07..08, AC-16..17, AC-24, AC-26..29, AC-31..33, AC-40. PostgreSQL tests race two adopters; one succeeds. Fault tests cover stale grants, revoked/rotated keys, expiry during control loss, suspend/time discontinuity, stale revisions, pending approval, cancel, terminal receipt and GC protection.

## Dependencies

Requires Sections 01 and 02. Exposes the only recovery path allowed to reopen mutation for Sections 04–10.

## Implementation record

- Added `authority_grant.rs`: signed scoped grant verification, minimum authority/placement/revision epochs, effect and safety-feature allowlists, RSA-2048 minimum, expiry, anti-rollback/time-discontinuity rejection, and bounded grant validity. Focused grant tests passed.
- Section 01 projection writes compare the canonical job attempt/fencing snapshot and refuse terminal or expired-lease execution state.
- Added `adoptExecutionSessionProjection`: under a transaction it locks the canonical job row before the session, checks current attempt/fence/live lease and expected revision/authority epoch, advances only into `recovering`, and appends an audit event. It does not issue mutation authority.
- Added `runner.session.inventory` on authenticated WSS and HTTP control transports using the existing `runner:heartbeat` scope. The reporter `runnerSessionId` must match the authenticated token; bounded inventory rows are validated before storage.
- `recordRunnerSessionInventory` records only observations, never adopts or changes session state. It locks the canonical job before the session, verifies active lease/attempt/fence plus session generation/authority/placement/control revisions, and appends an idempotent event.
- Linux Runner startup now reads `SessionRegistry`, filters to authenticated runner identity and live Host plus child PID/start-tick/boot identities, limits records to the server contract, emits batches of at most 64, and does not enter its live loop with unacknowledged startup reconciliation events. `launch_registered` provides the Host-to-registry writer and has a real-process test.
- Tests cover registry-to-payload batching (65 valid records become 64 + 1; invalid job IDs are excluded), authenticated route binding, row-level stale rejection acknowledgement, and mismatch denial. Focused Web tests pass; the complete control route file has one separate credential-refresh 503 failure.
- Status: **PARTIAL / BLOCKED**. The feature-gated Linux Worker start path now issues/validates the authority grant and registers the Host; restart recovery reattaches only after signature, expiry, process identity, registry, job, attempt, lease fence and revision checks. Sessions that fail these checks retain the existing unknown-outcome behavior. Still open: server-side adoption/reconciliation CAS and cryptographic inventory origin proof, managed key rotation/trust provisioning, current-authority refresh/renewal, approval/cancel reconciler, durable terminal outbox reconciliation, and multi-connection PostgreSQL race proof. No shared or production recovery claim is made.
