# Section 03 - Command Surface and Preview UX

## Ownership
- `apps/web/client/src/components/chat/AgencyEscalationCard.tsx`
- likely a new hybrid orchestration preview component
- any page or modal that exposes the new command/button

## Outcome
Add a visible user command that can generate a hybrid plan and let the user approve it before execution.

## What this section does
- Add `Hybrid Orchestrate` or `Design Collaborative Flow`.
- Render the plan preview with clear stage labels.
- Support approve/cancel and handoff confirmation.

## Implementation notes
- Keep the preview explainable.
- Show which stages are workflow-bound and which are swarm-assisted.
- Reuse existing UI patterns from agency review and escalation surfaces.

## Tests
- UI tests for command visibility and plan preview rendering.
- Tests for approve/cancel actions.

