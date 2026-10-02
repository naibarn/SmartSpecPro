# Section 09 — Effects, Replay, and Recovery

## Outcome

Make external effects, output commits, retries, timeouts, cancellation, replay, cache use and orphan repair consistent with exactly one logical committed result under at-least-once execution.

## Scope

- Persist an effect intent/idempotency key before each paid/destructive/network side effect.
- Atomically commit validated node output and terminal logical transition where possible; otherwise use durable settlement markers/outbox reconciliation.
- On uncertain provider outcome, reconcile provider receipt/status with the existing operation key; require operator review where ambiguity cannot be resolved.
- Apply compiled retry/timeout/circuit/fallback/cache policy through one owner and keep unknown failure distinct from terminal failure.
- Detect and repair orphaned runs/jobs/checkpoints without replacement job IDs or blind side-effect replay.

## TDD / verification

- Fault injection at every boundary: before external call, after call/before receipt, after receipt/before DB commit, duplicate result, cancel/retry race, cache stale/ACL mismatch, orphan restart.
- Assert no double billing, duplicate publication, or false terminal success.

## Acceptance

- Same effect intent converges to one receipt/result.
- A stale executor cannot commit after lease/fence changes.
- Retries preserve same canonical job/run and only create new business attempts under control-plane policy.

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
