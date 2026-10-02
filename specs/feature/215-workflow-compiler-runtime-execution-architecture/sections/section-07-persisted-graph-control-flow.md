# Section 07 — Persisted Graph Control Flow

## Outcome

Execute router, static/dynamic fan-out, join, loop, subflow, partial run, and bounded graph expansion from persisted logical state.

## Scope

- Represent edge activation and selected branch as deterministic run events.
- Enforce join policy and cardinality on committed predecessor outcomes.
- Bound loop count/deadline and dynamic expansion by plan policy, tenant quotas and run budget.
- Preserve subflow parent/child lineage, tenant identity and artifact/reference boundaries.
- Implement run-until/from/node/subflow selection without bypassing unmet dependencies or reusing incompatible prior outputs.

## TDD / verification

- Each flow construct: happy path, error path, duplicate wake/replay, partial completion, limit overflow, cancellation and restart recovery.
- Verify branch-selection cannot be caller-forged after plan lock.

## Acceptance

- Only valid branches become ready; join/loop/subflow state is durable and replay-safe.
- Expansion cannot escape plan/policy/tenant scope.
- Partial output is labeled accurately and does not fabricate full success.

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
