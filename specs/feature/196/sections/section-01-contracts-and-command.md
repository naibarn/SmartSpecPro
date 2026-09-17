# Section 01 — Command and Goal/Plan Contracts

## Source coverage

Feature 196 sections 0–16, 45, 112–116, 213–217, 235 and 270–283.

## Deliverable

Define provider-neutral Command, channel identity, Goal, GoalRun, PlanRevision, Offer, CapabilityRequirement, Approval and DecisionRecord types plus the conversion contract to Feature 195 Jobs.

## Files

- Create/modify: `apps/web/server/services/orchestration/*` and existing command/router contracts
- Test: focused Web/Python contract tests

## TDD steps

Write failing tests for normalization, tenant scope, malformed commands, immutable hash/revision and Job handoff; implement minimal schemas/helpers; rerun tests and diff-check.

## Completion gate

No provider-specific runtime field or direct provider submission appears in the public command contract.

## UI/UX Contract

### Target User / JTBD
N/A — domain contracts only; command UX is covered by section-05.

### Existing Pattern Reference
N/A — no UI is created here; section-05 reuses Chat plan patterns.

### Surface Inventory
N/A — no route/component changes.

### Component Map
N/A — contract layer only.

### State Matrix
N/A — UI states are tested in section-05.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — section-05 owns browser evidence.
