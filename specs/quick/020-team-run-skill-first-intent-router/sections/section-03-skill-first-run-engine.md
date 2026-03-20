# Section 03 — Skill-First Run Engine

## Goal

Replace the primary team-turn runtime from raw direct LLM execution to routed skill execution.

## Ownership boundaries

- Owns the primary execution path inside `runEngine`
- Owns translation from run/work-item context into skill execution inputs
- Does not own agency runtime internals

## Target files

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts` (new)
- `apps/web/server/services/promptComposer.ts` (reduced or fallback-only)
- `apps/web/server/services/teamOrchestrationBridge.ts` (fallback-only role)

## Required behavior

- `runNextTurn()` routes through `roomIntentRouter`
- `skill` route executes via `teamRunSkillExecutor`
- general discussion route resolves to `team-discussion-assistant`
- message persistence includes route metadata
- activity events include route metadata

## Suggested adapter contract

Input:

- run
- room
- assistant context
- work item
- objective
- recent message history

Output:

- content
- token usage
- credits used
- selected skill
- planner metadata
- next step hints

## Done when

- normal team runs no longer call `executeAgentTurn()` as the default path
- integration tests prove skill-first execution works end to end
