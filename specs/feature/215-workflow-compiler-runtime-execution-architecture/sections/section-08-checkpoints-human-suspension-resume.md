# Section 08 — Checkpoints and Human Suspension/Resume

## Outcome

Implement durable checkpoint, wait, human-input, and approval transitions whose delivery/action surfaces remain owned by Specs 225/226.

## Scope

- Version checkpoints against plan digest, run revision and completed committed outputs.
- Persist suspended node/run state, resume deadline and pending action correlation.
- Authenticate tenant/principal/approval scope and require expected revision plus one-time idempotency key on resume.
- Release physical execution lease during long external/human wait; reacquire a fresh fenced lease before continuing.
- Route attention via Spec 225 and map user response through Spec 226; don't invent a parallel inbox/action authority.

## TDD / verification

- Pause/resume and approval allow/deny, duplicate response, stale/forged/cross-tenant action, revoked grant, expired wait, lost notification and worker restart.
- Verify checkpoint tamper/version mismatch fails closed.

## Acceptance

- Resume continues the same canonical run and logical node lineage without duplicating effects.
- No browser/client poll is the durable clock.
- If 225/226 runtime is unavailable, the run remains safely suspended and observable.

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
