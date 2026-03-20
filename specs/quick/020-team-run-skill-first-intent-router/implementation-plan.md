# Implementation Plan

## Objective

Refactor team-room execution so that:

- room messages resolve through an explicit `chat | skill | agency` intent router
- team runs execute work through `skill-first` routing instead of direct raw LLM turns
- generic agent-to-agent discussion also flows through the skill system by way of a dedicated internal discussion skill
- planner-based model selection remains automatic for `skill` and `agency` paths, while normal human chat continues to respect the user-selected model

## Current-codebase fit

The repository already contains the right building blocks:

- `team run` lifecycle and work-item context in `runEngine.ts`
- room message persistence in `teamRoom.ts` and `roomService.ts`
- skill classification in `skillIntentClassifier.ts`
- skill execution and model policy in `skillExecutor.ts` and `skillExecutionPolicy.ts`
- planner telemetry in `taskPlannerMiddleware.ts`
- agency runtime in `routers/agency.ts`

The missing layer is the route contract that connects these pieces consistently.

## Target architecture

### 1. Add a room execution route contract

Introduce a new internal routing type:

- `chat`
- `skill`
- `agency`

Route resolution should happen through a new service, for example:

- `apps/web/server/services/roomIntentRouter.ts`

The router should classify:

- `origin`: `human_user | assistant | system`
- `context`: `room_message | run_turn | work_item`
- `route`: `chat | skill | agency`
- `reason`: structured explanation for telemetry
- `selectedSkillId`: when route = `skill`
- `agencyEscalation`: when route = `agency`

This router should become the only place that decides whether a room event goes to chat, skill, or agency.

### 2. Split human room messaging from run-turn execution

#### Human-originated room messages

Path:

1. `teamRoom.sendMessage`
2. persist user message
3. classify via `roomIntentRouter`
4. dispatch to:
   - `chat`: human-facing response flow
   - `skill`: execute a specialized skill
   - `agency`: create or continue an agency run

This path is user-interaction centric.

#### Agent-originated run turns

Path:

1. `runEngine` selects next actionable work item
2. `roomIntentRouter` classifies the turn context
3. dispatch to:
   - specialized skill
   - internal team discussion skill
   - agency escalation

This path is workflow centric and should not call the raw LLM bridge by default.

### 3. Rework `runEngine` to be skill-first

Current path:

- `composePrompt()` -> `executeAgentTurn()` -> persist result

Target path:

1. resolve current run, room, work-item, and active assistant context
2. build a `TeamRunExecutionRequest` object with:
   - objective
   - current work item
   - actor assistant profile
   - room history slice
   - team context
3. ask `roomIntentRouter` for the execution route
4. dispatch by route:
   - `skill`: `executeSkill()` through a new team-run adapter
   - `agency`: agency escalation adapter
   - `chat`: only via internal team discussion skill, not via generic raw chat
5. persist output into room messages, monitoring events, and work-item updates

Recommended new service:

- `apps/web/server/services/teamRunSkillExecutor.ts`

Responsibilities:

- translate team-run context into skill execution params
- resolve internal/external skill IDs
- shape structured outputs into room/work-item updates
- emit route metadata

### 4. Add an internal team discussion skill

Create a new internal skill, for example:

- slug: `team-discussion-assistant`

Purpose:

- handle agent-to-agent discussion turns
- provide clarifications, proposals, synthesis, and handoff-style collaboration
- use skill execution policy and planner-based model selection automatically

Behavioral requirements:

- optimized for assistant-to-assistant team collaboration
- not framed as customer-support chat
- understands work-item, role, and team objective context
- can suggest escalation to agency only when complexity exceeds configured threshold

Recommended skill metadata additions in `packages/skills/src/types.ts`:

- `surfaceScopes?: ("chat" | "team_room" | "team_run" | "agency")[]`
- `interactionModes?: ("human_to_ai" | "agent_to_agent" | "work_item")[]`
- `internalOnly?: boolean`
- `teamRunEligible?: boolean`

Registry rules:

- internal-only skills must not show in the normal user skill browser by default
- internal-only skills may still be executable from server-owned routes

### 5. Use intent routing before room execution

The room intent router should apply rules in this order:

1. explicit work-item / workflow commands
2. explicit skill invocation or strong classified skill match
3. agency escalation triggers
4. fallback to internal team discussion skill for assistant-to-assistant turns
5. fallback to normal chat only for human-originated room conversation that is genuinely non-executional

Important distinction:

- `chat` remains for human conversational interactions
- “general discussion between virtual assistants” should not use generic chat; it should use the internal team discussion skill

### 6. Define escalation rules for `agency`

Escalate to `agency` when one or more are true:

- classified complexity is `complex`
- the task requires iterative multi-step planning
- the request spans multiple artifacts or stages
- no single skill or discussion skill can satisfy the turn safely

Anti-recursion rules:

- the internal discussion skill may request escalation only once per work-item revision unless new human input arrives
- route metadata must include `escalationAttempted` and `escalationReason`

### 7. Keep the direct Python orchestrator path as emergency fallback

Do not delete `teamOrchestrationBridge` / `team_orchestrator.py` in the first rollout.

Instead:

- gate it behind a feature flag such as `teamRunDirectLlmFallback`
- call it only when:
  - intent routing returns no valid route, and
  - the fallback flag is enabled
- log every fallback with structured audit metadata

This gives a reversible rollout path while shifting the primary path to skills.

## Affected files and modules

### Core runtime

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/roomService.ts`
- `apps/web/server/routers/teamRun.ts`
- `apps/web/server/routers/teamRoom.ts`

### New routing / execution layer

- `apps/web/server/services/roomIntentRouter.ts` (new)
- `apps/web/server/services/teamRunSkillExecutor.ts` (new)
- `apps/web/server/services/teamRunAgencyAdapter.ts` (new or folded into router)

### Skill metadata and registry

- `packages/skills/src/types.ts`
- `apps/web/server/services/skillRegistry.ts`
- possibly admin / persistence layers if internal-only metadata becomes configurable

### Existing skill / planner reuse

- `apps/web/server/services/skillIntentClassifier.ts`
- `apps/web/server/services/skillOrchestrator.ts`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillExecutionPolicy.ts`
- `apps/web/server/services/taskPlannerMiddleware.ts`

### Direct-LLM fallback path

- `apps/web/server/services/promptComposer.ts`
- `apps/web/server/services/teamOrchestrationBridge.ts`
- `python-backend/app/services/team_orchestrator.py`

### New internal skill package

- `apps/web/skills/team-discussion-assistant/skill.md`
- optional schema / prompt / assets files for that skill

## Implementation approach

### Phase A — routing contract

1. Add route types and result schema for room intent resolution
2. Implement `roomIntentRouter` as a pure server service
3. Add audit metadata:
   - `route`
   - `routeReason`
   - `selectedSkillId`
   - `escalatedToAgency`
   - `usedDirectLlmFallback`

### Phase B — internal discussion skill

1. Add the new internal skill
2. extend skill metadata / registry for internal-only + surface scopes
3. route assistant-to-assistant general discussion to this skill

### Phase C — skill-first run engine

1. add `teamRunSkillExecutor`
2. switch `runEngine.runNextTurn()` primary path from `executeAgentTurn()` to routed skill execution
3. persist route metadata on room messages and activity events

### Phase D — agency escalation

1. wire `agency` as a first-class route result from `roomIntentRouter`
2. ensure room/work-item context is translated cleanly into agency inputs
3. prevent recursive escalation loops

### Phase E — fallback hardening and cleanup

1. keep direct Python path behind feature flag
2. improve diagnostics on the fallback path
3. once stable, stop using direct path in normal team runs

## Risks and mitigations

### Risk: duplicated classification logic

- Mitigation:
  - keep room intent routing as the single top-level router
  - reuse `skillIntentClassifier` underneath rather than re-implementing skill matching

### Risk: internal skill leaks into end-user UI

- Mitigation:
  - add `internalOnly` / `surfaceScopes`
  - hide such skills from regular skill browsing and user-trigger lists

### Risk: too many ambiguous “chat” fallbacks

- Mitigation:
  - reserve raw `chat` for human conversation
  - use internal discussion skill as the default conversational path for agents

### Risk: agency overuse

- Mitigation:
  - escalate only on `complex` or explicit multi-step criteria
  - add one-escalation-per-work-item-revision guardrails

### Risk: migration breaks existing rooms

- Mitigation:
  - rollout via feature flags
  - preserve direct-LLM fallback temporarily
  - attach route metadata so behavior is inspectable per room and per run

## Security and boundary concerns

- maintain tenant/user validation on all room dispatches
- do not let client-supplied payloads choose internal-only skills directly
- ensure agency escalation is server-decided, not blindly client-decided
- keep direct Node→Python proxy token path available only for server-owned fallback

## Acceptance criteria

- a human room message is explicitly classified to `chat`, `skill`, or `agency`
- an auto-team run executes its next turn through a skill-first path by default
- assistant-to-assistant general discussion uses the internal discussion skill, not the raw LLM bridge
- planner/model policy is applied automatically for skill and agency routes
- normal human chat continues to honor the user-selected conversation model
- every room turn and run turn emits route metadata for observability
- direct Python team-turn execution is no longer the primary path

## Rollout and testing notes

- ship behind feature flags:
  - `teamRoomIntentRouting`
  - `teamRunSkillFirst`
  - `teamRunDirectLlmFallback`
- start with manual team rooms, then auto-team rooms
- verify routing decisions in logs before disabling direct fallback
