# Feature 188 Rollback Runbook

Rollback is an explicit, audited recovery operation. It does not delete
canonical jobs, rewrite events, restore credits, reopen cancelled work, or
blindly switch traffic to the Dev database.

## Ordered checklist

1. Declare the incident, environment/scope, current release identity, target
   identity, control version, maintenance window, operator, reviewer, reason,
   and rollback action key.
2. Stop new side-effecting production work through the guarded platform
   control. Preserve `worker_jobs`, attempts, dispatch references, outbox rows,
   callbacks, settlements, and domain checkpoints.
3. Determine whether the target has accepted writes. Reconcile provider
   operation keys, artifact references, billing/notification settlements, and
   canonical job leases before choosing forward repair or rollback.
4. If the target has no accepted writes, use the approved artifact-compatible
   previous runtime only after its schema and control-plane compatibility is
   verified.
5. If the target has accepted writes, keep target evidence authoritative for
   those writes and use a forward-fix or an approved reverse promotion plan.
   Never copy target data into Dev by an ad-hoc overwrite.
6. Reconcile ambiguous jobs by canonical ID and persisted idempotency keys.
   Quarantine any provider or paid side effect whose outcome cannot be proven.
7. Disable and revoke the affected target adapter credentials only after the
   chosen recovery path has durable evidence. Retain the rollback artifact and
   image digest for the configured rollback window.
8. Re-run schema, tenant-isolation, job/event-order, settlement, and synthetic
   recovery gates. Record failed gates explicitly.
9. Reopen traffic only through a new guarded action with a new action key and
   reviewer approval. The previous activation history remains immutable.
10. Close the incident with the final control version, evidence bundle,
    unresolved review items, and a forward-fix owner.

## Forbidden rollback actions

- Blind traffic switch to Dev or any unverified database.
- Destructive migration rollback, table deletion, queue deletion, or event
  rewriting.
- Reusing an unresolved provider operation with a new idempotency key.
- Reopening cancelled/expired terminal jobs or duplicating paid work.
- Treating queue health or an HTTP health check as recovery evidence.
