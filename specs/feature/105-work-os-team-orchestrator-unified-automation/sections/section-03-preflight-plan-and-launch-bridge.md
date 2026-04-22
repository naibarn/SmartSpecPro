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
10. Add an approved-plan persistence decision gate before requester-visible launch enforcement leaves preview/beta.
11. Implement the `PreflightApprovalBundle` lifecycle from `appendices/preflight-lifecycle-and-api-contracts.md`.
12. Add explicit API/router contracts for preview, regeneration, approval, bundle read, invalidation, and launch.

## Interfaces produced

- `workOrchestratorPlanningService.createPreflightPlan(input)` returns a capability plan, team execution plan, approval snapshot requirements, budget envelope, and blocked alternatives.
- `approvalSourceSnapshotService.captureApprovalSnapshots(input)` returns immutable approval-time source snapshots and integrity markers.
- Work OS `resolvePreflightPreview` returns requester-safe and admin-diagnostic views from the same preflight bundle.
- Work OS `regeneratePreflightPreview`, `approvePreflightBundle`, `getPreflightBundle`, `invalidatePreflightBundle`, and `launchApprovedAutomation` follow the lifecycle/API appendix.
- Work OS launch accepts an approved preflight bundle id and approved revision hash when Feature 105 launch enforcement is enabled.

## Interfaces consumed by later sections

- Section 04 consumes the persisted `TeamExecutionPlan`, approval snapshots, budget envelope, and team resolution.
- Section 06 consumes stale-preview, snapshot-drift, team-resolution, and budget states for enforcement.
- Section 07 consumes preview response shapes for UI.

## Implementation notes

- Keep the current `createAutomationRun` flow, but feed it richer inputs.
- Phase 1 may store approved plans inside `policyJson` and snapshot metadata.
- JSON metadata is acceptable only while approved bundles are run-scoped and schema-validated at read time.
- Add a dedicated persistence migration before broad rollout if approved plans, source snapshots, budget envelopes, team-resolution decisions, or compatibility blocks need cross-run queryability, dashboards, independent retention, or joins with Team ledger/workpack learning.
- Record the storage decision in `decision-log.md` before enabling requester-visible launch enforcement beyond preview/beta.
- Approval and budget boundaries must be visible before the final launch action.
- Privileged surfaces must surface their required permission/flag/approval state in the preview, not only their step order.
- The preview must have two views in v1: requester-safe and admin-diagnostic.
- Launch must compare the approved revision fingerprint to the current request/source fingerprint before calling kickoff.
- Mutating preflight APIs must be idempotent. Reusing an idempotency key with different input returns an idempotency conflict.
- Launch must use a compare-and-set transition from `approved` to `launching` so concurrent clicks cannot create duplicate runs.
- Impossible lifecycle transitions must fail with stable reason codes instead of silently normalizing state.

## Tests to add first

- Work OS preflight planner tests
- Work Request launch-preview UI tests
- automation-run persistence tests for approved plans
- team-resolution policy tests
- preview access/redaction tests
- stale-preview invalidation tests
- approval-source snapshot drift tests
- idempotent approval capture tests
- preflight approval bundle lifecycle transition tests
- preflight API contract tests for preview, regenerate, approve, get, invalidate, and launch
- concurrent launch compare-and-set tests
- approved-plan persistence decision tests
- read-time schema validation tests for JSON-stored approved bundles

## Done when

- A requester can fetch a redacted preflight preview for their own request.
- Admins can inspect policy/team diagnostics.
- Launch rejects stale previews, missing teams, and drifted required sources.
- Approved plan metadata is persisted in a form Team can load without recomputing planner state.
- The implementation records whether approved plans remain JSON-backed or require a migration before broad requester-visible rollout.
- Every current bundle is in exactly one valid lifecycle state, and UI/launch behavior follows that state.

## Risks

- policy duplication between legacy templates and the new planner
- launch preview becoming too opaque or too noisy

## Mitigations

- treat legacy template logic as one input into the new planner
- keep the preview explainable: selected surface, reason, cost, approval boundary

## Implementation update

- 2026-04-22: added `workOrchestratorPlanningService`, `approvalSourceSnapshotService`, `preflightApprovalLifecycleService`, and `preflightBundleStoreService` to produce versioned preflight bundles with approval snapshots, lifecycle transitions, and idempotency records.
- 2026-04-22: extended `apps/web/server/routers/workOs.ts` with `resolvePreflightPreview`, `regeneratePreflightPreview`, `approvePreflightBundle`, `getPreflightBundle`, `invalidatePreflightBundle`, and `launchApprovedAutomation`.
- 2026-04-22: updated `apps/web/server/services/workAutomationFabricService.ts` to persist approved-plan metadata into automation policy JSON so Team can load the approved bundle without recomputing planner state.
- 2026-04-22: wired `apps/web/client/src/pages/WorkRequest.tsx` into the preflight review lifecycle so requesters can preview, approve, refresh, and launch automation from the request page instead of starting the legacy direct launch path.
