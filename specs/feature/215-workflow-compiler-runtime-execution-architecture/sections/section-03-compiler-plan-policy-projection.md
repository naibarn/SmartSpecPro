# Section 03 — Compiler, Plan Locking, and Policy Projection

## Outcome

Make the immutable execution plan a complete validated input to the runtime, with all attached scope/policy/instrumentation either enforced or rejected before run creation.

## Scope

- Preserve Spec 214 R6 and manifest schema v4 as the only node taxonomy.
- Validate typed input/output interfaces, bindings, edge ports, scopes, policy attachments, instrumentation, variables, subflow refs, and exact binding identity/version.
- Pin definition revision, manifest digests, capability binding revision, and relevant policy snapshot in the plan lock.
- Normalize retry, timeout/deadline, checkpoint, cache, budget, fallback, scope, and instrumentation into versioned runtime policy; remove hard-coded policy defaults where the workflow specifies one.
- Keep plans free of secret values and non-deterministic provider runtime data.

## TDD / verification

- Deterministic digest tests; invalid or unsupported attachment tests; changed manifest/binding/policy invalidation tests.
- Tests prove every policy is enforced or returns a typed compile/preflight rejection, never silently ignored.

## Acceptance

- Identical semantic input produces identical plan lock; changed semantics produce a new pinned revision.
- Unknown fields, untrusted readiness claims, unsupported descriptors, and secret material are rejected.
- Existing Studio callers use one canonical compiler path.

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
