# Feature 188 Cutover Runbook

This runbook is an operator checklist, not an authorization to deploy,
provision infrastructure, copy secrets, or switch production traffic. Every
step must record an immutable evidence reference before the next step is
accepted. A missing, stale, or mismatched result stops the run.

## Required identities

- Source database identity: `dev-server-postgresql` or the approved
  `legacy-prod` identity for the rehearsal.
- Target database identity: the newly provisioned production PostgreSQL
  identity; it must not equal the source.
- Release identity, schema migration checksum, promotion ID, Hyperdrive
  binding identity, and maintenance-window ID.
- Accepted immutable Feature 187 `CUTOVER_CANDIDATE` handoff package and its
  evidence reference. The handoff must state that `legacy-prod` remains
  authoritative and that no production route or side-effecting producer has
  switched.
- Authorized operator, reviewer, action key, and correlation ID.

## Ordered checklist

1. **Freeze and declare scope.** Record the approved environment, scope,
   release artifact, source/target identities, maintenance window, and rollback
   owner. Reject any unlisted job type or tenant scope.
2. **Verify continuous synchronization.** Confirm the approved logical
   replication or ordered change-feed mode, source watermark, target watermark,
   lag budget, and last successful checkpoint. Timestamp-only comparison is
   not evidence.
3. **Evaluate gates.** Record all required gate results: source inventory,
   schema migrations, promotion validation, backup/restore, Hyperdrive
   connectivity/cache behavior, Feature 186 recovery, synthetic target,
   legacy call audit, the accepted Feature 187 `CUTOVER_CANDIDATE` handoff,
   and the accepted Feature 189 tenant/authentication gate. Each passed
   result must include release and target identity plus an evidence reference.
4. **Enter maintenance mode.** Use the guarded platform action with a durable
   action key and expected control version. Confirm that the old runtime is
   read-only for the declared scope and that new writes have an observable
   backpressure response.
5. **Fence side-effecting producers.** Disable new legacy producers and
   scheduled triggers for the scope. Keep compatibility consumers available
   only for the documented drain/recovery window. Do not run a second
   side-effecting producer.
6. **Drain and reconcile.** Reconcile canonical jobs, leases, outbox rows,
   settlements, callbacks, and domain projections by `worker_jobs.id`. Do not
   infer completion from queue length. Quarantine ambiguous work.
7. **Capture the final source watermark.** Commit the source write fence and
   record the final watermark before applying the final delta.
8. **Apply the final delta.** Apply the bounded ordered delta to the target;
   persist the batch/checkpoint only after target commit and digest evidence.
   A lost or ambiguous target response is quarantined, never blindly replayed.
9. **Validate complete convergence.** Check rows and dispositions, deletes,
   FK/unique/check constraints, sequences, tenant ownership, job/event order,
   outbox/settlement evidence, object checksums, and search-index manifests.
10. **Run isolated synthetic tests.** Use a non-production tenant and
    namespace with paid providers, billing, notifications, webhooks, and
    irreversible artifact publication disabled. Record cleanup evidence.
11. **Request activation.** Submit the guarded activation action with the
    target identity, release identity, promotion ID, reason, actor, and
    expected control version. The platform outbox is the durable external
    intent; its acknowledgement must be reconciled by reference.
12. **Open traffic separately.** After activation acknowledgement and target
    identity probe, open production traffic. Record the traffic change as a
    separate action/evidence item; activation alone does not imply traffic is
    open.
13. **Verify legacy rejection and recovery.** Confirm activated-scope legacy
    calls are rejected, audited, and alerted; verify canonical job recovery,
    callback replay protection, and outbox/settlement reconciliation.
14. **Revoke synchronization.** Disable replication/CDC/export credentials and
    prove that a post-cutover sync attempt is denied and durably audited.
15. **Close the window.** Record reviewer approval, certificate/network
    evidence, final control version, release/build identity, and the full
    evidence bundle. If any step is incomplete, remain blocked.

## Abort rules

- Abort on source/target identity collision, target mismatch, unknown gate,
  stale evidence, sync lag over budget, unresolved ambiguous batch, duplicate
  producer, or missing recovery evidence.
- Abort without opening traffic if any side-effecting legacy producer remains
  active in the declared scope.
- Never switch Cloudflare to the Dev database as a fallback.
