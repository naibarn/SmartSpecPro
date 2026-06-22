# Section 05: Artifact, Approval, And Cost Adapters

## Objective

Extend the canonical event layer with pointer-only artifact, backend-authoritative approval, and advisory/server-owned cost adapters.

## Dependencies

- section-01-shared-contracts-and-flags
- section-02-agency-and-team-adapters
- section-03-golden-fixtures-and-negative-tests
- section-04-preview-renderer-and-intents

## Scope

- Add adapter functions for artifact records, approval records, and cost records when source contracts are confirmed.
- Reuse existing routers/services as authority.
- Do not mutate approval, artifact, billing, or workflow state from renderer code.

## Files To Add

- `packages/agent-experience/src/adapters/artifacts.ts`
- `packages/agent-experience/src/adapters/approvals.ts`
- `packages/agent-experience/src/adapters/cost.ts`
- focused tests for each adapter

## Files To Inspect

- `apps/web/server/routers/artifact.ts`
- `apps/web/server/services/artifactStorageService.ts`
- `apps/web/server/routers/approvals.ts`
- existing credit/budget services before cost implementation

## Requirements

Artifacts:

- emit IDs, title, format, version, and safe preview metadata only;
- load content through existing permissioned paths;
- never pass unsanitized HTML or privileged URLs to renderers.

Approvals:

- preserve tenant, actor, work/run/task identity, risk, expiry, decision, audit link;
- normalize `rejected` to canonical `denied`;
- preserve `sourceDecision`;
- route decisions through existing backend approval path.

Cost:

- estimates are advisory;
- reservations/finalization remain server-side;
- no client state can finalize billing.

## UI/UX Contract

### Target User / JTBD

- Developers and admins need artifact, approval, and cost information normalized for preview without accidentally triggering real mutations.

### Surface Inventory

- No live UI is introduced here.
- Future renderer surfaces include artifact pane, approval card, and cost summary.

### Component Map

- No React components are added in this section.
- Adapter outputs feed Section 04 components through typed renderer intents.

### State Matrix

- artifact exists;
- artifact missing;
- approval pending;
- approval resolved;
- approval identity mismatch;
- cost unavailable;
- approximate cost;
- blocked mutation attempt.

### Responsive Matrix

- Adapter output must be layout-neutral.
- Future artifact and cost summaries must support compact mobile rendering without losing status text.

### Accessibility Acceptance

- Artifact and approval statuses must be representable as text, not only visual badges.
- Cost approximation must expose a text label for screen readers.

### Copy Contract

- Use clear labels such as `Artifact`, `Approval`, `Pending`, and `Approximate cost`.
- Do not use `Persona` for artifact, approval, or cost labels.

### Browser Evidence Required

- Not required for adapter-only work.
- Required when Section 04 renders artifact/approval/cost preview states.

## Tests First

- Test artifact events carry pointers only.
- Test artifact content is not inlined.
- Test approval request/resolution mapping.
- Test `rejected` -> `denied` normalization.
- Test approval decision requires backend-confirmed source state.
- Test cost estimate cannot finalize billing.
- Test tenant mismatch/missing authority is dropped.

## Acceptance Criteria

- Adapter tests pass.
- Existing routers/services remain authoritative.
- No new billing or approval mutation path exists in renderer/package code.
