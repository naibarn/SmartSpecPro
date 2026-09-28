# Adversarial Self-Review — Round 1

## Result

PASS after one correction pass. The plan was reviewed as if an implementation
could succeed locally while still corrupting promotion state or activating the
wrong database.

## Findings and fixes

### Finding 1 — A watermark exporter could accidentally degrade into timestamp copying

Risk: saying “transaction-watermark” without requiring a complete source change
feed could miss deletes or reorder writes.

Fix: the plan now requires an approved provider CDC stream or an explicitly
installed append-only source change journal with monotonic sequence, table/key,
operation, row version, and delete tombstones. If unavailable, the gate blocks
promotion instead of falling back to periodic copying.

### Finding 2 — Lost Cloudflare deployment acknowledgement could duplicate activation

Risk: a deployment could succeed while the Admin/API process loses its response,
leading to a second activation attempt or an incorrect lifecycle state.

Fix: the plan now adds platform_operation_outbox with a stable dedupe key and
publisher fencing, defines cutoverControlPlane as the coordinator, and requires
provider/reference inspection before settling or quarantining a lost response.
Traffic opening remains a separate guarded step.

### Finding 3 — Target synthetic tests could mutate ordinary production data

Risk: proving target writes before activation could create rows or side effects
that are mistaken for promoted data.

Fix: the plan now requires an isolated test tenant/transaction namespace,
disabled paid and irreversible side effects, and cleanup/retention evidence.

## Adversarial checklist

| Check | Result |
|---|---|
| Hostile reviewer requirement gap | None remaining in the reviewed scope. |
| Phase A contradictions | None; source/target/Hyperdrive direction is consistent. |
| External integration partial failure | Covered for DB, change feed, target, Hyperdrive, queues, workflows, containers, Cron, callbacks, GitHub, and activation. |
| Component ownership/dangling references | All named new components have a path and a consuming phase. |
| Concurrency/fencing | Covered for platform actions, promotion batches, Cloudflare publication, job leases, and activation. |
| Legacy fallback leakage | Static/generated/runtime audit and fail-closed behavior are required. |

## Residual external gates

The PostgreSQL provider, region, replication permissions, extension set, and
Hyperdrive account/plan capability still require live preflight evidence. The
plan treats those as explicit blockers and does not represent a mock or local
test as production proof.
