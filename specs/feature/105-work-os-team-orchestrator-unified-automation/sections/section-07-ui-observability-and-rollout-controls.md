# Section 07 - UI, Observability, and Rollout Controls

## Goal

Ship the new orchestration model safely and make it understandable to users and operators.

## Ownership boundaries

- request-review UI
- chat entry points
- telemetry and diagnostics
- feature flags and rollout controls

## Current touchpoints

- `apps/web/client/src/pages/WorkRequest.tsx`
- `apps/web/client/src/pages/MyRequests.tsx`
- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/client/src/components/orchestrator/AutoTeamLedgerPanel.tsx`
- `apps/web/server/services/workAutomationPolicyService.ts`
- existing monitoring and Team ledger surfaces

## Deliverables

1. Add request-review surfaces for:
   - linked sources
   - compiled brief
   - capability plan
   - cost and approval preview
   - stale-preview / re-review-required state
2. Add chat entry points for `Create Work Request from Chat`.
3. Add diagnostics and telemetry for:
   - source inclusion/exclusion
   - capability selected/blocked reasons
   - plan-vs-actual execution drift
   - preview access level and redaction mode
   - contract-compatibility blocks
4. Add feature flags for:
   - chat-to-request launch
   - workflow surface planning
   - skill-studio planning
   - learning-loop automation
   - privileged-surface auto-execution
   - approval snapshot enforcement

## Tests to add first

- Work Request UI regression tests
- Chat entry-point UI tests
- telemetry contract tests for source/capability diagnostics
- stale-preview invalidation UI tests
- requester-safe preview redaction tests

## Risks

- operators may not understand why the planner blocked a capability
- users may not trust the system if the preview is opaque

## Mitigations

- require explainable reasons in telemetry and UI
- keep preview and actual execution trace linked in the Team ledger and Work OS timeline
- make stale-preview state explicit and actionable so the user can regenerate review safely
