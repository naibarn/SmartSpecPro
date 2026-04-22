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
   - lifecycle state transitions
   - budget cap, retry, cancellation, and dead-letter outcomes
4. Add feature flags for:
   - chat-to-request launch
   - workflow surface planning
   - skill-studio planning
   - learning-loop automation
   - privileged-surface auto-execution
   - approval snapshot enforcement
5. Add accessibility, localization, and progressive-disclosure acceptance rules for the preflight UI.

## Interfaces consumed

- Section 01 provides linked-source and compiled-brief data for Work Request UI.
- Section 03 provides preflight preview, team resolution, stale state, and approval bundle status.
- Section 04 provides plan-vs-actual runtime traces.
- Section 05 provides learning proposal summaries.
- Section 06 provides safe diagnostics, reason codes, and rollout flag states.
- `appendices/observability-event-taxonomy.md` provides event names, payload boundaries, redaction modes, and correlation fields.

## Tests to add first

- Work Request UI regression tests
- Chat entry-point UI tests
- telemetry contract tests for source/capability diagnostics
- stale-preview invalidation UI tests
- requester-safe preview redaction tests
- Team ledger plan-vs-actual display tests
- feature flag visibility and disabled-state tests
- accessibility tests for keyboard navigation, focus management, disabled launch explanation, and screen-reader labels
- i18n tests that user-facing reason summaries and action labels come from translation keys, not hard-coded backend prose
- progressive-disclosure tests proving admin diagnostics remain hidden from requester-safe views

## Done when

- Users can see what will run, why, what is blocked, what it may cost, and what needs approval.
- Stale preview and missing-team states are actionable.
- Operators can diagnose compatibility/governance blocks without exposing internals to requesters.
- Rollout flags can enable planning visibility separately from runtime dispatch.
- The preflight UI remains usable by keyboard/screen reader users and does not require admin-level jargon to understand requester-safe blockers.
- Telemetry follows the shared taxonomy and includes correlation ids across request, preflight bundle, automation run, Team room, and plan step where available.

## Risks

- operators may not understand why the planner blocked a capability
- users may not trust the system if the preview is opaque
- dense preflight plans may overwhelm users if advanced diagnostics are shown too early
- translated UI may drift from backend reason codes if prose is embedded in service responses

## Mitigations

- require explainable reasons in telemetry and UI
- keep preview and actual execution trace linked in the Team ledger and Work OS timeline
- make stale-preview state explicit and actionable so the user can regenerate review safely
- use progressive disclosure: requester-safe summary first, details on demand, admin diagnostics only for authorized actors
- use stable backend reason codes mapped to UI translation keys

## Implementation update

- 2026-04-21: added a request-review linked-sources panel in `apps/web/client/src/pages/WorkRequest.tsx` so chat-linked context is visible before submission.
- 2026-04-21: routed the Chat work-start CTA through a shared work-request launch helper so active conversations deep-link into Work Request with preserved linkage.
- 2026-04-21: added helper coverage for launch URL construction in `apps/web/client/src/lib/workRequestLinks.test.ts`.
- 2026-04-22: added an automation review card in `apps/web/client/src/pages/WorkRequest.tsx` that shows compiled brief summary, included sources, planned steps, budget envelope, launch blockers, and preview mode before launch.
- 2026-04-22: replaced the legacy direct `Start automation` action on the request page with requester-visible `Regenerate preview`, `Approve preview`, and `Launch approved automation` actions bound to the new Work OS preflight APIs.
- 2026-04-22: expanded client coverage in `apps/web/client/src/pages/__tests__/WorkRequest.test.tsx` to cover preview rendering, approval, launch, stale-preview regeneration, and existing-request review behavior.
