# Section 06 - Security, Surface Governance, and Release Gates

## Goal

Turn the security requirements of Feature 105 into explicit, enforceable launch and runtime behavior.

## Ownership boundaries

- surface-governance matrix
- approval-source snapshotting and drift validation
- team-resolution fail-closed rules
- execution budget enforcement
- privileged-surface release gates

This section does not redesign the planner. It defines the safety rules that the planner and runtime must obey.

## Current touchpoints

- `apps/web/server/_core/context.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/routes/workflowWorkerRuntime.ts`
- `apps/web/server/services/workAutomationPolicyService.ts`
- `apps/web/server/routers/workOs.ts`

## Deliverables

1. Define a v1 surface-governance matrix for:
   - `skill`
   - `agency`
   - `workflow`
   - `browser`
   - `document_management`
   - `media_studio`
   - `video_editor`
   - `work_os`
   - `manual`
   - `skill_studio`
2. Add `ApprovalSourceSnapshot` rules:
   - approved excerpt/summary
   - integrity marker or content hash
   - unlock/sanitization state
   - drift invalidation semantics
3. Add `TeamResolutionDecision` rules so launch never degrades into silent null kickoff.
4. Add `ExecutionBudgetEnvelope` rules that map preflight estimates into hard runtime caps.
5. Add release-gate checks for privileged surfaces before broad rollout.
6. Add requester-safe preview ACL and redaction rules for compiled brief / capability-plan review.
7. Add surface-contract migration gates so new surfaces cannot dispatch before Work OS contracts support them.
8. Split `workOrchestratorSecurityPolicy` into small owned helpers so parallel sections can consume security decisions without merge conflicts.
9. Adopt the lifecycle, budget/dispatch, and observability appendices as enforceable security contracts rather than advisory notes.

## Interfaces produced

- `workOrchestratorSecurityPolicy` exposes stable reason codes for authorization, feature flag, approval, budget, snapshot drift, and contract compatibility failures.
- Budget enforcement helpers convert approved forecasts into runtime caps and stop policies.
- Release-gate checks expose whether a surface is planner-visible, preview-only, or dispatchable.
- Reason-code helpers expose canonical event `primaryReasonCode` values for the observability taxonomy.

## Security helper ownership

- Surface governance helper owns planner visibility, auto-execution defaults, approvals, flags, permissions, and governance reason codes.
- Snapshot drift helper owns approval-source integrity comparison and source-authority drift reason codes.
- Budget helper owns forecast-to-cap conversion and runtime budget failure reason codes.
- Redaction helper owns requester-safe vs admin-diagnostic diagnostics shaping.
- Contract compatibility helper owns preview-only vs dispatchable state and migration reason codes.
- Team launch gate helper composes the above decisions with `TeamResolutionDecision` without redefining their internals.
- Lifecycle helper owns allowed `PreflightApprovalBundle` state transitions and idempotency conflict reason codes.
- Runtime dispatch helper owns retry/timeout/cancel/dead-letter security decisions for side-effecting surfaces.

Section 06 owns final semantics and reason-code stability. Earlier sections may introduce consumer-facing adapters, but they should not fork or duplicate these rules.

## Interfaces consumed by other sections

- Section 02 uses policy results to build capability entries.
- Section 03 uses policy results in preflight preview and approval.
- Section 04 re-checks policy at dispatch time.
- Section 07 displays safe subsets of policy diagnostics.

## Implementation notes

- `workflow` and `skill_studio` are review-gated by default in v1.
- `skill_studio` must be governed by sub-action:
  - `create_private_or_pending_review`
  - `improve_owned_skill`
  - `auto_apply_proposal`
  - `publish_or_widen_visibility`
- Private-vault and restricted-library sources must carry explicit unlock state through approval and dispatch.
- Secret-bearing source material must be redacted before it becomes part of a persisted approval snapshot.
- Runtime authority must be re-checked at dispatch time for privileged surfaces.
- Requester-safe preview access must redact privileged diagnostics, permission internals, and secret-bearing excerpts.
- Team resolution must follow an explicit precedence order and emit stable resolution codes.
- Contract compatibility must be checked separately from authorization and feature-flag gates.
- Keep security helpers small enough that Section 02, Section 03, Section 04, and Section 07 can consume them without editing unrelated security logic.
- Security tests should assert machine-readable codes first and prose summaries second.
- Requester-safe diagnostics must derive from the same decisions as admin diagnostics, with redaction applied after decision-making.

## Tests to add first

- surface-governance policy tests
- approval snapshot and drift tests
- team-resolution fail-closed tests
- privileged-surface authorization tests
- budget-envelope enforcement tests
- preview access/redaction tests
- contract-migration compatibility tests
- stable reason-code snapshot tests
- requester-safe diagnostics redaction tests
- helper-boundary tests proving surface governance, snapshot drift, budget enforcement, redaction, and contract compatibility are not duplicated in route/UI code
- lifecycle helper tests proving invalid state transitions fail closed
- runtime dispatch helper tests proving side-effecting retries and dead-letter recovery require the proper authority

## Done when

- Every block path has a stable code and an audit-friendly explanation.
- Preview and runtime use the same governance source of truth.
- Compatibility failures are distinct from auth/flag/approval/budget failures.
- Runtime cannot dispatch a privileged or compatibility-blocked surface accidentally.
- Section owners can implement or consume security helpers without editing a monolithic policy file.
- Observability events, UI diagnostics, and service errors all use the same canonical reason-code families.

## Risks

- governance rules become advisory instead of enforceable
- mutable sources change after approval
- privileged surfaces inherit overly broad authority
- preview diagnostics leak sensitive operator-only information
- new surfaces are selected before storage/router contracts can represent them safely

## Mitigations

- make snapshots and budget envelopes part of the launch contract
- fail closed on drift, missing authority, or missing team resolution
- emit explicit governance diagnostics into timeline and Team ledger
- separate compatibility failures from authorization failures so rollout can be debugged cleanly

## Implementation update

- 2026-04-22: added `apps/web/server/services/workOrchestratorSecurityPolicy.ts` with stable surface-governance, compatibility, requester-safe redaction, and budget/launch-gate helpers used by preview and runtime paths.
- 2026-04-22: added immutable approval snapshot capture and lifecycle enforcement through `approvalSourceSnapshotService.ts` and `preflightApprovalLifecycleService.ts`.
- 2026-04-22: enforced stale-preview, source-drift, missing-team, surface-authority, and contract-migration failures inside the Work OS preflight approval and launch APIs.
