# Spec 215 Implementation Objective

Implement the current normative Spec 215 Workflow Compiler and Runtime Architecture against the repository's existing canonical Workflow Studio and Feature 195/186 job control plane.

## Required outcome

For all normative Spec 215 sections and current amendments, either implement the repository-local behavior or record a concrete owner-bound release gate with evidence and a fail-closed runtime behavior. The implementation must include canonical definition validation, pinned immutable plans, durable logical run/node/attempt progress, dependency-aware scheduling and output commits, idempotent `worker_jobs` + outbox admission for every detached/background business operation, a versioned node-adapter/preflight boundary, cancellation/retry/checkpoint/recovery/fencing behavior, policy/economics/security propagation, and conformance coverage.

## Boundaries

- Spec 214 remains the only node-type/manifest authority.
- Spec 215 owns logical workflow execution and graph scheduling.
- Feature 195/186 owns physical `worker_jobs`, attempts, leases, fencing, retries, dispatch, and outbox.
- Specs 207, 220, 225, 226, 229, and 251 retain their respective economic, authorization, attention, action, retrieval, and creator-domain ownership.
- Never add a competing generic jobs table, queue, lifecycle, direct provider/search path, or retired custom workflow engine integration.
- Production integrations with missing owners/contracts remain disabled or fail closed and are reported as external gates.

## Existing confirmed gaps to close locally

1. Persist logical per-node state and committed outputs with safe migration/rollback.
2. Admit only dependency-ready nodes and atomically connect scheduler transitions to canonical job creation/outbox.
3. Execute router/fan-out/join/loop/subflow/wait semantics from persisted state with idempotency and replay safety.
4. Provide a versioned adapter registry with correct coverage for all 16 node types and safe unavailable states where an owned runtime is absent.
5. Translate compiled retry/timeout/budget/cache/checkpoint/fallback/scope/instrumentation policies rather than hard-coding job defaults.
6. Bridge human approval/input and cross-device resume through authorized Spec 225/226 actions.
7. Correct stale Spec 251 references and implement only the approved Creator profile binding.
8. Keep Retrieval Broker V2 behind Spec 229/220 gates, with no production fallback to fragmented direct retrieval.
9. Cover authorization, tenant isolation, output/effect atomicity, unknown external outcomes, cancellation, replay, upgrade, migration, and observability.

## Proof boundary

Local focused tests and static conformance prove repository behavior only. They do not prove production migration/backfill, current deployed workflow compatibility, provider entitlement, external account bindings, live Broker/ACL certification, production deployment, or disaster-recovery execution. Those require explicit evidence from their owning release gates.
