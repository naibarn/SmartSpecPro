# Section 03 - Preflight Plan and Launch Bridge

## Goal

Generate a reviewable execution plan before Team launch, then persist that plan into Work OS automation kickoff.

## Ownership boundaries

- preflight planner
- request-review launch preview
- automation-run persistence of approved plan
- launch bridge into Team kickoff

## Current touchpoints

- `apps/web/server/services/workAutomationPolicyService.ts`
- `apps/web/server/services/workAutomationFabricService.ts`
- `apps/web/server/routers/workOs.ts`
- `apps/web/client/src/pages/WorkRequest.tsx`

## Deliverables

1. Add `workOrchestratorPlanningService` to create a `CapabilityPlan` and `TeamExecutionPlan`.
2. Expand automation surface policy support to include `workflow` and `skill_studio`.
3. Show preflight launch preview in the request UI.
4. Persist the approved plan into automation-run storage and kickoff metadata.
5. Persist approval-time source snapshots and fail launch when required sources drift.
6. Add explicit team-resolution policy so kickoff either resolves a valid team or fails closed into review-required state.
7. Add requester-safe preview access and redaction rules for preflight review.
8. Add `PreflightRevisionFingerprint` invalidation so request edits or source changes stale the preview before launch.
9. Define the precedence order and failure codes for `TeamResolutionDecision`.

## Implementation notes

- Keep the current `createAutomationRun` flow, but feed it richer inputs.
- Phase 1 may store approved plans inside `policyJson` and snapshot metadata.
- Approval and budget boundaries must be visible before the final launch action.
- Privileged surfaces must surface their required permission/flag/approval state in the preview, not only their step order.
- The preview must have two views in v1: requester-safe and admin-diagnostic.
- Launch must compare the approved revision fingerprint to the current request/source fingerprint before calling kickoff.

## Tests to add first

- Work OS preflight planner tests
- Work Request launch-preview UI tests
- automation-run persistence tests for approved plans
- team-resolution policy tests
- preview access/redaction tests
- stale-preview invalidation tests

## Risks

- policy duplication between legacy templates and the new planner
- launch preview becoming too opaque or too noisy

## Mitigations

- treat legacy template logic as one input into the new planner
- keep the preview explainable: selected surface, reason, cost, approval boundary
