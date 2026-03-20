# Section 01 — Room Intent Routing

## Goal

Create the single routing contract that classifies room events into `chat`, `skill`, or `agency`.

## Ownership boundaries

- Owns route classification and structured route metadata
- Does not execute skills or agency runs itself
- Does not persist UI state

## Target files

- `apps/web/server/services/roomIntentRouter.ts` (new)
- `apps/web/server/routers/teamRoom.ts`
- `apps/web/server/services/roomService.ts`
- reuse `apps/web/server/services/skillIntentClassifier.ts`

## Required behavior

- classify human-originated room messages
- classify assistant-originated turns separately from human messages
- support work-item-aware routing
- attach route metadata to downstream dispatch

## Output contract

Return a typed object similar to:

- `route`
- `reason`
- `selectedSkillId`
- `classifiedComplexity`
- `agencyEscalation`
- `usedFallback`

## Implementation notes

- reuse `classifyIntent()` instead of inventing a second skill classifier
- do not let `roomType` dictate route directly
- reserve raw `chat` mostly for human-originated room messages
- prefer internal discussion skill for agent-originated discussion

## Done when

- room dispatch can decide route without calling execution code
- tests cover human, assistant, and work-item contexts
