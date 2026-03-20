# Implementation Plan TDD

## Test strategy

Implement this feature test-first by locking the routing contract before changing runtime behavior.

## 1. Room intent router tests

Add tests for a new `roomIntentRouter` service covering:

- human message with no strong skill match -> `chat`
- human message with strong specialized skill match -> `skill`
- human message with explicit multi-step / delegation request -> `agency`
- assistant-originated general collaboration turn -> `skill` with `selectedSkillId = team-discussion-assistant`
- work-item turn with strong specialized match -> `skill`
- agency escalation capped after one attempt per work-item revision

Expected first failure:

- router service does not exist

## 2. Internal discussion skill registry tests

Add tests covering:

- internal-only skill metadata parses and loads
- internal-only skill is hidden from regular user-visible skill listings
- internal-only skill remains invocable by server-owned team-run execution
- surface scopes prevent using the skill in unsupported surfaces

Expected first failure:

- current `SkillDefinition` and registry do not understand these metadata fields

## 3. Team-run skill-first execution tests

Add or extend `runEngine` integration tests to verify:

- `runNextTurn()` calls `teamRunSkillExecutor` instead of `executeAgentTurn()` when feature flag is enabled
- auto-team turns create room/work-item updates from skill output
- route metadata is persisted on the produced message / event
- no raw direct-LLM call happens on the normal path

Expected first failure:

- `runEngine` still calls `executeAgentTurn()` directly

## 4. Human room message routing tests

Add tests for `teamRoom.sendMessage` or a new room-dispatch service:

- plain human room conversation routes to chat
- explicit skill-worthy request routes to a specialized skill
- complex request routes to agency
- room dispatch does not let client force `internalOnly` skills directly

Expected first failure:

- current message path only persists the message and has no dispatcher

## 5. Direct fallback tests

Add tests for feature-flagged direct fallback:

- when no route exists and fallback enabled -> call `teamOrchestrationBridge`
- when no route exists and fallback disabled -> return a structured system failure or escalation request
- fallback usage is audited

Expected first failure:

- no fallback gating exists yet

## 6. Regression tests

Preserve current guarantees:

- normal chat without `skillUsed` still honors the user-selected conversation model
- skill execution still uses `skillExecutionPolicy` / planner model selection
- agency routes continue to require tenant/user context

## Suggested test files

- `apps/web/server/services/__tests__/roomIntentRouter.test.ts`
- `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`
- `apps/web/server/services/__tests__/runEngine.skillFirst.test.ts`
- `apps/web/server/routers/__tests__/teamRoom.intentRouting.test.ts`
- `apps/web/server/services/__tests__/skillRegistry.internalScope.test.ts`

## Environment / fixtures

- prefer Vitest for Node-side routing and execution tests
- add fixture skill metadata for `team-discussion-assistant`
- mock planner/model-resolution and agency adapters
- only keep Python integration coverage for fallback path validation
