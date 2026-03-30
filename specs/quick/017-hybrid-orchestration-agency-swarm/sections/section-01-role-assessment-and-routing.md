# Section 01 - Role Assessment and Routing

## Ownership
- `apps/web/server/services/roomIntentRouter.ts`
- `apps/web/server/services/routingPolicyEngine.ts`
- `apps/web/server/services/routingFallbackLadder.ts`
- related routing tests

## Outcome
Create a reliable way to decide when a task should stay in workflow mode, when it should go to agency swarm, and when it should become a hybrid orchestration request.

## What this section does
- Classify task intent and complexity.
- Detect hybrid collaboration opportunities instead of over-escalating to plain agency.
- Preserve current routing for chat, skill, and agency when hybrid is not needed.

## Implementation notes
- Introduce a new hybrid strategy or route decision shape if needed.
- Keep policy reasons explicit so the UI can explain why hybrid was selected.
- Make sure the router can still fall back safely if hybrid planning is unavailable.

## Tests
- Add routing tests for hybrid-intent detection.
- Add regression tests for existing chat and agency paths.

