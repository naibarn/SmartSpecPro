# Section 06 — Versioned Node Adapters and Preflight

## Outcome

Create an explicit registry from canonical Spec 214 manifest identity to typed executors, with current policy/capability/placement preflight before effects.

## Scope

- Resolve exact `typeId`, manifest version/digest, binding kind/version and runtime contract.
- Define per-type input/output validation, execution class, effects, idempotency requirements, timeout and cancellation support.
- Provide safe implementations for locally owned deterministic/control types and bind already-owned model/agent/artifact runtimes through existing gateways.
- Give each of all 16 core types either a verified registered adapter or an explicit typed unavailable outcome; do not fake success or bypass the owner.
- Keep `data.retrieval` disabled/fail-closed until Spec 229 Broker + Spec 220 authorization gate is proven; no direct Vectorize/search calls.

## TDD / verification

- Registry matrix over all 16 canonical IDs, exact version/digest, input/output schema, effects, retry/timeout/cancel support.
- Authorization denial, missing/ambiguous binding, stale capability, placement mismatch and adapter exception cases.

## Acceptance

- No legacy aliases become canonical type IDs; each invocation uses exact pinned manifest identity.
- Missing provider/runtime/broker never runs as an inline fallback.
- Skill instruction text is not treated as executable capability without an owner-approved invocation adapter.

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
