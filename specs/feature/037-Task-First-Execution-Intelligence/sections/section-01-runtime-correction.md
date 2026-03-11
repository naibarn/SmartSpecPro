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

- `apps/web/server/routers/chat.ts` — Modified: uses `resolveSkillExecutionPolicy` + provider hints
- `apps/web/server/services/skillExecutionPolicy.ts` — **NEW**: policy resolver
- `apps/web/server/services/skillExecutionPolicy.test.ts` — **NEW**: 9 tests
- `apps/web/server/services/enabledLlmModels.ts` — Modified: exported `loadEnabledLlmModelRows`
- `apps/web/server/services/llmRouter.ts` — Modified: added `ProviderHints` to `getProviderForModel`

## Implementation notes

- Introduced `resolveSkillExecutionPolicy()` helper that resolves the effective model for chat-driven skill runs with priority: skill.llmModelId > skill.defaultModel > conversationModel > system default.
- Conversation model applies only to direct chat, not to skill invocation (reversed from previous behavior where conversation model had priority).
- Preserved backward compatibility: legacy fields (defaultModel, llmModelId) are mapped through the policy bridge.
- Extended `getProviderForModel()` with optional `ProviderHints` for preferredProviderId/strictProviderPin — strict pin prevents fallback to other providers.
- Performance-optimized: single DB call via `loadEnabledLlmModelRows()`, all source detection is in-memory.
- types.ts and parser.ts were NOT modified — the service-layer bridge is sufficient for section-01. Type-level changes deferred to section-02.
- skillRegistry.ts was NOT modified — verified `dbSkillToDefinition` already populates all routing fields.

## Acceptance criteria

1. ✅ skill invocation path resolves from skill policy first (via `resolveSkillExecutionPolicy`)
2. ✅ direct chat path remains unchanged (only skill execution block modified in chat.ts)
3. ✅ provider pin fields are not silently lost (passed as `ProviderHints` to `getProviderForModel`)
4. ✅ tests prove skill execution is no longer conversation-first (9 tests, key: "does NOT let conversation model override skill llmModelId")
