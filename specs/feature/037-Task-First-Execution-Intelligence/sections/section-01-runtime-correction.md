# Section 01 — Runtime Correction

## Objective

Make current skill invocation behavior correct before introducing smarter routing.

## Scope

1. stop `conversation.model` from overriding skill execution policy by default
2. propagate existing skill routing fields consistently through the LLM skill path
3. define the compatibility bridge between old skill fields and future `execution_policy`

## Why first

If skill invocations do not honor skill policy today, any future auto-routing layer will behave unpredictably and be hard to audit.

## Primary files

- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/skillRegistry.ts`
- `packages/skills/src/types.ts`
- `packages/skills/src/parser.ts`

## Implementation notes

- Introduce a single helper that resolves effective skill execution policy for chat-driven skill runs.
- Make conversation model apply only to direct chat, not to skill invocation, unless future policy explicitly allows it.
- Preserve backward compatibility for skills that still only expose legacy fields such as `defaultModel` or `llmModelId`, but map them into the new capability-first policy bridge.
- Keep the immediate design small: do not add full planner logic here.

## Acceptance criteria

1. skill invocation path resolves from skill policy first
2. direct chat path remains unchanged
3. provider pin fields are not silently lost in the skill path
4. tests prove skill execution is no longer conversation-first
