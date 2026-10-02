# Section 04 — Dependency-Aware Run Scheduler

## Outcome

Replace eager enqueue of every selected node with a persisted scheduler that admits only roots or nodes whose required dependencies have committed valid outputs.

## Scope

- Convert manual/scheduled/webhook/event activation into an idempotent run activation command.
- In one transaction, create logical run/node state and only ready physical-job intents through the Feature 186/195 gateway/outbox.
- On committed node output, compute newly eligible successors from the pinned plan and persist activation once.
- Keep blocked nodes durable and observable; never infer readiness from enqueue order or transport status.
- Preserve trigger occurrence keys, deadlines, timezone and schedule revision correlation.

## TDD / verification

- Root-only admission; predecessor success; fan-in wait; duplicate trigger/wakeup; transaction crash before/after outbox; cycle/invalid graph; canceled parent.
- Integration/fault-injection tests prove restart reconciliation resumes from persisted readiness.

## Acceptance

- A downstream node cannot claim or execute before all required inputs are committed.
- Duplicate scheduler wake produces no duplicate canonical job or side effect.
- No process-local timer or detached task is the durable clock for business work.

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
