# Research Notes

## Codebase scan

### Current team-run path is direct-LLM first

- `apps/web/server/services/runEngine.ts`
  - `runNextTurn()` composes prompt via `composePrompt()`
  - then calls `executeAgentTurn()` via `teamOrchestrationBridge`
  - persists assistant output back into room messages and monitoring events
- `apps/web/server/services/promptComposer.ts`
  - builds a single large LLM prompt from persona, participants, memories, objective, and history
- `apps/web/server/services/teamOrchestrationBridge.ts`
  - posts to Python `/api/team-orchestrator/execute-turn`
- `python-backend/app/services/team_orchestrator.py`
  - currently executes the turn by calling `llm_client.chat_completion(...)`
  - can invoke MCP orchestrator tools for work-item progression
  - on internal exception returns `[Agent turn unavailable]`

### Current skill / planner path is already richer

- `apps/web/server/services/skillIntentClassifier.ts`
  - LLM-based classification against the skill catalog
  - returns `simple | compound | complex` and a strategy
- `apps/web/server/services/skillOrchestrator.ts`
  - classification-first skill routing
  - currently strong on `simple`, placeholders for `compound` / `complex`
- `apps/web/server/services/skillExecutor.ts`
  - central execution engine for LLM, media, python, sandbox, and planner-aware skill execution
- `apps/web/server/services/skillExecutionPolicy.ts`
  - capability-aware model selection with `allowFreeModels`, provider pinning, fallback behavior
- `apps/web/server/services/taskPlannerMiddleware.ts`
  - creates task plans, resolves models, and records step attempts

### Current room messaging path has no intent router

- `apps/web/server/routers/teamRoom.ts`
  - `sendMessage` only persists message via `roomService.sendMessage(...)`
  - it does not classify the room message or route it into `chat`, `skill`, or `agency`
- `apps/web/server/services/roomService.ts`
  - owns room message persistence, work-update shaping, and room execution mode helpers

### Current chat path already separates normal chat vs skill-driven planner selection

- `apps/web/server/services/llmRoutesHandler.ts`
  - when `skillUsed` is missing, normal chat honors the conversation model
  - when `skillUsed` exists, planner/model-selection can run
- `apps/web/server/_core/llmRoutes.ts`
  - similar behavior on lower-level stream route

## Security / auth / tenant boundaries

- `teamRoomRouter` and `teamRunRouter` are protected tRPC routes with tenant resolution
- `runPlanner()` validates `userId` and `tenantId` before creating planner records
- Python `team_orchestrator_api` is protected by `X-Proxy-Token`
- Current cross-boundary issue: direct team turns use a separate Node→Python raw LLM path that bypasses the more mature skill-policy path

## Existing failure evidence that motivates the architecture change

- The current room `99579b80-2194-4151-a83e-3c65b6b20afe` produced a persisted assistant message `[Agent turn unavailable]`
- That failure occurred after a direct team orchestrator turn reached Python and hit an internal exception
- This shows the current generic direct-LLM team-turn path is brittle and weakly observable compared with skill execution flows

## Current fit assessment

The repository already has enough primitives to support the requested architecture without inventing a second execution stack:

- skill classification exists
- skill execution exists
- model selection / policy exists
- planner telemetry exists
- room/work-item state exists
- agency exists for complex workflows

The missing piece is a routing and contract layer that makes rooms and runs consume those primitives consistently.

## Recommended architectural direction

### 1. Introduce a room execution route contract

Every actionable room message or run turn should resolve to one of:

- `chat`
- `skill`
- `agency`

This route should be explicit in metadata and telemetry instead of being implicit in whichever code path happened to be called.

### 2. Make team runs `skill-first`

Do not let `runEngine` treat “LLM turn generation” as the default behavior.

Instead:

- pick the next actionable work item
- route that work item to a skill or agency execution plan
- only use a direct raw LLM fallback if no matching skill exists and the fallback flag is explicitly enabled

### 3. Add an internal “team discussion” skill

The user’s idea is strong and matches the codebase well:

- create an internal skill dedicated to agent-to-agent discussion
- make it use the same skill execution policy / planner / model selection path
- treat it as the default fallback for “general collaboration talk” inside a room
- tune its system prompt for assistant-to-assistant team collaboration, not human chat support

### 4. Keep agency for truly multi-step escalation

`agency` should not replace every room turn.

Use it when:

- the intent is complex / multi-step / iterative
- the request spans multiple artifacts or stages
- a room message or work item cannot be satisfied by a single specialized skill

## Risks to solve in implementation

- ambiguous ownership between room type, execution mode, and execution route
- double-routing if both room intent router and skill orchestrator try to classify the same input independently
- recursive loops if the internal team discussion skill itself escalates back into agency without clear stop rules
- internal-only skill visibility and abuse boundaries
- preserving existing room/work-item audit trails during migration
