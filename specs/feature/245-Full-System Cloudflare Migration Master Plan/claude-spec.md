# Implementation Specification — Spec 245 Accelerated Execution

## Goal

Execute Spec 245 as an urgent, evidence-backed migration of all in-scope application/runtime responsibilities to a Cloudflare-first production architecture. Aim to finish by 2026-09-30, pause beta work during cutover when helpful, and fix ordinary defects found on the new platform after migration.

## Scope and constraints

- Spec 245 is the master authority. Spec 232 owns Redis/BullMQ per-responsibility cutover. Spec 242 owns its native agent/container boundary. Feature 186/195 `worker_jobs` remains the single durable job authority. PostgreSQL remains business-data authority. R2 and Vectorize remain the destination systems for objects and vectors.
- Redis retirement has no fixed 14–30 day observation delay. Post-cutover monitoring starts immediately but does not impose an elapsed-time gate.
- Beta tasks may pause. Before resuming, inspect canonical job state and reconcile unknown provider outcomes to prevent duplicate paid work.
- Do not disable authentication, tenant ACL, financial idempotency, fencing, backup/restore, or exact Cloudflare secret/binding checks.
- KV is only for disposable/read-heavy cache. DO is selective and requires a proven coordination/realtime need.
- Local readiness is not target or production proof. Target-account evidence/deploy identity are currently absent.
- Preserve unrelated dirty worktree changes and all existing user-facing behavior.

## Required outcomes

1. A machine-readable inventory classifies every active Redis call, process, scheduled task, service, runtime and state store.
2. An execution ledger defines order, dependencies, owner, config, cutover, acceptance, recovery and evidence state per migration slice.
3. Workers configuration and Admin Infrastructure explain KV readiness and exact binding/secret setup; secrets remain environment/deployment-only.
4. Each workload uses its correct Cloudflare destination: KV, Cache API, DO, Queues/Workflows/Containers, Hyperdrive/managed PostgreSQL, R2, Vectorize, or an explicitly approved external runtime.
5. Controlled task pause can move one responsibility at a time without lost canonical work or dual authority.
6. Full-system retirement is only claimed after every runtime dependency has a destination/approved exception and Debian retirement evidence passes.

## Deferred until target access exists

Production deploy, Cloudflare namespace/binding creation, target probes, DNS changes, production secret writes, and managed PostgreSQL promotion need the approved target identity/evidence. Prepare exact configuration and commands now; never substitute local mocks for target proof.
