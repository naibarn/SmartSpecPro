# Research: Team Room Reuse Chat Pipeline

## Chat Execution Pipeline (Working)

### Complete Flow
```
1. Client → tRPC chat.sendMessage → save user message → return
2. Client → GET /api/llm/stream → handleStreamWithRouter()
3. buildChatContext(conversationId, userId, systemPrompt, tenantId)
   ├─ resolvePersona() → full persona with tone, gender, style
   ├─ buildPersonaPromptSegments() → [PERSONA START]...[PERSONA END] + Thai particles
   ├─ getEntityMemories(userId, null, personaId) → top 10 global facts
   ├─ checkUserHasDriveTools() → optional tool context
   ├─ getSummaries(conversationId) → old conversation summaries
   └─ getRecentMessages(conversationId, 20) → last 20 messages
4. executeWithFallback({ model, messages, stream, userId })
   ├─ resolveProvidersWithRule(model)
   ├─ POST to provider → stream SSE chunks
   └─ calculateCost() → creditTransactions
5. Client → tRPC chat.saveAssistantMessage → persist response
```

### Key Reusable Functions

| Function | File | Signature | Reusable? |
|----------|------|-----------|-----------|
| `buildChatContext` | chatService.ts:682 | `(conversationId, userId, systemPrompt?, tenantId?) → PromptMessage[]` | Needs adaptation (uses conversationId) |
| `getEntityMemories` | chatService.ts:568 | `(userId, entityType?, personaId?) → EntityMemory[]` | YES — global user facts |
| `resolvePersona` | personaService.ts:439 | `(conversation, user, tenant, widgetId?) → PersonaTemplate \| null` | YES — works for any entity with personaId |
| `buildPersonaPromptSegments` | personaService.ts:356 | `(persona) → { prefix, styleInstructions, restrictionsBulletPoints }` | YES — pure function, adds Thai particles |
| `detectSkill` | skillDetector.ts:60 | `(message, conversationId?, skillSettings?, userId?) → SkillDetectionResult` | YES — bilingual support |
| `executeWithFallback` | llmRouter.ts:323 | `({ model, messages, stream, userId, ... }) → ExecuteResult` | YES — already used by Team Room indirectly |

## Team Room Execution Pipeline (Broken)

### Current Flow
```
1. runEngine.runNextTurn(runId, tenantId)
2. routeRoomIntent() → ALWAYS returns team-discussion-assistant (skips detection)
3. executeTeamRunSkillTurn()
   ├─ Route: agency/non-LLM → executeAgentTurn() [Python backend, broken]
   └─ Route: LLM skill →
       ├─ composePrompt() [builds messages but persona is simplified]
       │   ├─ Load persona (systemPromptPrefix ONLY, no style/tone/gender)
       │   ├─ Get team members context
       │   ├─ retrieveForPrompt() [scoped memory — works but limited]
       │   └─ compressHistory() [token-budgeted, actually better than Chat]
       ├─ messages = [skill.systemPrompt, flattenedPrompt] ← WRONG (flattened)
       └─ executeSkillLlmWithFallback() → executeWithFallback() [works]
4. Store in teamRoomMessages
5. turnOrderEngine.getNextSpeaker() → next agent
```

### What Team Room is Missing vs Chat

| Feature | Chat | Team Room | Gap |
|---------|------|-----------|-----|
| Skill detection | `detectSkill()` bilingual | Skipped entirely | CRITICAL |
| Persona resolution | Full `resolvePersona()` + segments | Only `systemPromptPrefix` | HIGH |
| Thai gender particles | Via `buildPersonaPromptSegments` | Missing | HIGH |
| Entity memories (global facts) | `getEntityMemories()` top 10 | None (scoped only) | MEDIUM |
| Message structure | Multi-turn `[{role, content}]` | Flattened to single text | CRITICAL |
| Language handling | Via skill's language config | Generic English | CRITICAL |
| Conversation summaries | From `conversationSummaries` table | None | LOW |

## Architecture Insight

**Both Chat and Team Room end up calling the same `executeWithFallback()`** — the difference is what happens BEFORE that call:
- Chat: rich context building (persona + memory + skill + history as multi-turn)
- Team Room: simplified context (basic persona + scoped memory + flattened history)

**The fix is NOT to change the LLM call, but to change the context building** — make Team Room build context the same way Chat does.

## Token Budget System (Team Room — Keep)
```typescript
DEFAULT_TOKEN_BUDGET = 8000
PERSONA_BUDGET = 2000
MEMORY_BUDGET = 1500
HISTORY_BUDGET_FRACTION = 0.6
```
This is BETTER than Chat (which has no budget). Keep this in the refactored version.

## Testing Setup
- **TypeScript**: Vitest with `@vitest/coverage-v8`
- **Python**: pytest with 80% coverage requirement
- Existing tests: `teamRunSkillExecutor` has no dedicated tests
- Related tests: `runEngine.test.ts`, `personaService.test.ts`, `skillDetector` tests exist
