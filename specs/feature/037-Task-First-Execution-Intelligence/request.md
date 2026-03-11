# Request

## Task summary

Turn Feature 037 from a strategy spec into an executable planning package for implementation.

The feature introduces a task-first execution runtime for SmartSpecPro that can:

1. route user requests by desired outcome rather than only by chat model or UI entry point
2. select execution strategy automatically across direct completion, Responses/tool loops, skills, deterministic pipelines, AgencySwarm, and sandbox execution
3. select the best enabled LLM model automatically using capability, context, health, and budget signals
4. support direct artifact-producing tasks such as completed decks, reports, and future website/code outputs
5. preserve correct credit deduction and auditability across all LLM/tool/background steps

## Likely affected areas

- `apps/web/server/routers/chat.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/services/creditService.ts`
- `apps/web/server/services/llmRouter.ts`
- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/services/skillRegistry.ts`
- `packages/skills/src/types.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/server/routers/agency.ts`
- `python-backend/app/services/agency_orchestrator.py`
- `python-backend/app/services/agency_tools.py`

## Constraints

- Must preserve existing chat, skill, draft, and agency behavior where possible during rollout.
- Must not break existing credit charging semantics.
- Must not require admins to hand-configure every model/task combination.
- Must operate only on enabled models/providers.
- Must remain compatible with AgencySwarm and existing deterministic pipelines.

## Assumptions

- Feature 037 is architecture-heavy enough to justify a sectionized plan.
- The first delivery slice should favor runtime correctness and billing correctness before advanced auto-planning.
- Existing `generateAIDraft()` and related deterministic deck generation remain production-grade primitives worth reusing.
- Existing Responses API proxy is the right foundation for tool-managed single-run execution, but its billing metadata needs generalization beyond browser-specific flows.

## Non-goals for the first implementation wave

- Full autonomous website build pipeline
- Historical success-based learning or reinforcement routing
- Full planner-judge model loop on day one
- Replacing AgencySwarm or AI Draft
