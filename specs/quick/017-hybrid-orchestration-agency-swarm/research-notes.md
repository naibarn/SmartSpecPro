# Research Notes

## Codebase scan summary

### Virtual workflow / orchestrator side
- `apps/web/server/services/roomIntentRouter.ts` already routes between `chat`, `skill`, and `agency`, and it has an advanced routing pipeline with policy and fallback ladder.
- `apps/web/server/services/routingPolicyEngine.ts` already detects agency-like tasks and can force multi-skill routing.
- `apps/web/server/services/routingFallbackLadder.ts` already supports `single`, `planner`, `swarm`, `create_skill`, and `chat`.
- `python-backend/app/services/agency_orchestrator.py` is a graph-walking execution engine for multi-node agencies and already handles non-agent nodes locally.
- `python-backend/app/services/agency_service.py` chooses orchestrator mode when the agency contains non-agent nodes.
- `apps/web/server/routers/agency.ts` already accepts topology values including `hybrid`.

### Agencies swarm side
- `python-backend/app/services/agency_swarm_adapter.py` isolates the `agency-swarm` dependency and maps agency configs into agent/agency runtime objects.
- `python-backend/app/services/agency_service.py` uses the adapter as the execution entry point for agent-only agencies and the orchestrator path for mixed graphs.
- `apps/web/client/src/components/chat/AgencyEscalationCard.tsx` already provides a UX surface for delegating a complex task to agency-level collaboration.

### UI / command surface
- There is already a strong pattern for action buttons and review centers in the agency pages.
- The system does not yet have a dedicated "hybrid orchestration" command surface that explicitly asks the platform to plan a combined workflow plus swarm flow.

## Pattern observations
- The current architecture already splits responsibilities in a useful way:
  - deterministic graph execution and approvals live in the workflow/orchestrator path
  - multi-agent reasoning lives in the swarm path
- The missing layer is a coordinator that chooses when to use which side, and how to hand off between them without losing context or control.

## Risk notes
- If the swarm is allowed to mutate state directly, rollback and audit will become fragile.
- If every complex task always calls swarm, costs will rise quickly and the platform will feel slower.
- If the workflow and swarm both try to own the same output contract, the system will become ambiguous and hard to debug.

