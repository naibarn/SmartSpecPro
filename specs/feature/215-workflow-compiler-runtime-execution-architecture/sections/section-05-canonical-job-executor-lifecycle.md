# Section 05 — Canonical Job Executor Lifecycle

## Outcome

Wire `workflow.node.execute` into the existing Feature 186/195 gateway, outbox, registry and PostgreSQL-pull/approved transports while preserving fenced physical execution ownership.

## Scope

- Register a versioned handler that loads the canonical job and logical attempt from PostgreSQL; never trust copied transport payload as authority.
- Validate the worker envelope and exact run/node/attempt/job binding before claim.
- Claim/report/heartbeat/cancel through the existing control-plane lease/fence APIs.
- Commit normalized result metadata and invoke a Spec 215 logical transition; reconcile partial cross-domain transaction outcomes with durable settlement markers.
- Keep missing runtime registrations typed and fail-closed; no inline/Celery/BullMQ fallback in a hard-cutover path.

## TDD / verification

- Handler registration success and unknown version/type rejection.
- Duplicate delivery, stale attempt/fence, tenant mismatch, worker loss, callback replay, outbox publish ambiguity and cancellation race.
- Python Feature 195 tests only if a shared cross-language envelope/persistence contract changes.

## Acceptance

- One logical node attempt resolves to one canonical `worker_jobs` ID and fenced physical attempt.
- Results/progress/errors are correlated and safe; terminal settlement is idempotent.
- Transport outage leaves durable queued/retry state and never executes a local fallback.

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
