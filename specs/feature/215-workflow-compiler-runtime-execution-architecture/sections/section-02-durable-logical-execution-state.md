# Section 02 — Durable Logical Execution State

## Outcome

Persist Spec 215 logical WorkflowRun, NodeRun, NodeAttempt, readiness, committed output references, checkpoint version, and physical job/attempt correlation. This is domain workflow state, not a second generic job ledger.

## Scope

- Audit the existing Drizzle schema and migration 0341 before designing additions.
- Add tenant-scoped logical identity, deterministic ordering, plan/revision digest, expected run revision, node status, dependency activation, attempt sequence, output/artifact reference, checkpoint metadata, and `worker_jobs.id` / physical `attempt_id` / fencing generation references where absent.
- Use unique constraints and guarded revision transitions for create/commit/resume races.
- Store large or sensitive payloads as approved artifact references or encrypted/authorized persistence, not in transport envelopes or logs.
- Create an additive expand/backfill/verify/contract migration plan; do not run production migrations or delete old fields/data.

## TDD / verification

- Schema tests cover foreign keys, tenant/run scoping, unique identities, idempotency, event ordering, nullable legacy references, and invalid transitions.
- Migration tests cover existing rows, duplicate/out-of-order data, rollback and repeated application.
- Transaction/service tests prove node state and event updates commit atomically.

## Acceptance

- Logical attempt history is queryable and immutable enough for diagnosis; terminal output is explicit and versioned.
- Physical execution identity references Feature 195 without copying its lease/status authority.
- Cross-tenant lookups and stale expected revisions fail closed.
- Migration is additive and rollback-safe; deployed backfill remains an external release gate.

## UI/UX Contract

### Target User / JTBD
N/A — this section implements backend workflow runtime behavior; product experience remains with Spec 209 and existing client owners.

### Surface Inventory
N/A — no browser-visible surface changes are planned. Existing APIs expose runtime state.

### Component Map
N/A — no frontend component is added or changed.

### State Matrix
N/A — runtime state is persisted and exposed through existing API contracts; visual rendering is outside this implementation scope.

### Responsive Matrix
N/A — no responsive layout changes.

### Accessibility Acceptance
N/A — no user interface changes.

### Copy Contract
N/A — no user-facing copy changes.

### Browser Evidence Required
N/A — no browser-visible behavior is changed; API and runtime tests provide the relevant local evidence.
