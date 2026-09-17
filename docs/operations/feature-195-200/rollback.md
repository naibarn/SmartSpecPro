# Rollback and recovery boundary

- Keep additive migrations and the existing `worker_jobs` ledger. Roll back a
  release by disabling the new producer/adapter path and draining or
  reconciling outbox rows; do not delete canonical Jobs.
- A stale Runner, MCP grant, plan revision or Agent event is rejected and
  reconciled. It is never converted into success by a UI acknowledgement.
- Provider submission ambiguity is operator-review state. Reconcile the
  provider reference before retrying to prevent duplicate external effects.
- Cloud/runtime activation, credential rotation and database restore require a
  separately recorded target-environment drill before the corresponding gate
  can be marked complete.
