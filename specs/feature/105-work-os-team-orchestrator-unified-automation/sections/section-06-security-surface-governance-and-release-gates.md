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

## Tests to add first

- surface-governance policy tests
- approval snapshot and drift tests
- team-resolution fail-closed tests
- privileged-surface authorization tests
- budget-envelope enforcement tests
- preview access/redaction tests
- contract-migration compatibility tests

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
