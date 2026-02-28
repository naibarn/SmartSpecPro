# Integration Notes: Opus Review Feedback

## Suggestions INTEGRATED (changes made to claude-plan.md)

### 1. BLOCKER: executeSkill() for llm-only does not call LLM
**Integrating: YES — fundamental architecture change**

The Opus review correctly identified that `executeSkill()` for `llm-only` mode simply echoes back the prompt. The real LLM call happens in the chat router which combines the skill's system prompt with user input.

**Fix:** The orchestrator will NOT use `executeSkill()` for Phases 1 and 3. Instead, it will:
1. Load the skill definition via `skillRegistry` to get the system prompt from `skill.md`
2. Call the LLM directly using `invokeLLM()` (existing infrastructure) with the skill's system prompt + user input
3. Handle credit deduction + audit logging itself

This aligns with how the chat router's `executeSkill` procedure works internally — it loads the skill, builds the prompt, and calls the LLM. The AI orchestrator does the same thing but without the chat context.

### 2. HIGH: generateImageAsync returns MediaTask, not URL
**Integrating: YES — critical flow change**

`generateImageAsync()` returns a `MediaTask` with a taskId. The orchestrator must poll for completion.

**Fix:** Phase 4 will:
1. Call `generateImageAsync()` to get `MediaTask`
2. Poll the media task status endpoint (or check task in Redis/BullMQ) with timeout
3. Extract imageUrl from completed task
4. On timeout (15s), set imageUrl=null (placeholder)

### 3. HIGH: userToken not in background context
**Integrating: YES — parameter addition**

**Fix:** Add `userToken: string` to the orchestrator function signature. Capture at tRPC mutation time and pass through. Verify JWT TTL > 120s (pipeline max duration).

### 4. HIGH: Version management without transaction
**Integrating: YES — follow import service pattern**

**Fix:** Phase 6 will wrap all slide insertions in a single database transaction, exactly like the import service. Read current deck version inside the transaction as starting point.

### 5. MEDIUM: callLLMStructured duplicates infrastructure
**Integrating: YES — use existing invokeLLM()**

**Fix:** `callLLMStructured` will be a thin wrapper around the existing `invokeLLM()` from `llm.ts`, NOT a parallel fetch()-based implementation. It adds Zod validation + retry logic on top.

### 6. MEDIUM: Redis lock TTL
**Integrating: YES — longer TTL + heartbeat**

**Fix:** Use 300s TTL with heartbeat renewal every 30s. Use `SET key value NX EX 300` for atomic acquisition.

### 7. MEDIUM: Feature flag on client side
**Integrating: YES**

**Fix:** Make `aiGenerationEnabled` optional in availability schema. Client uses ONLY the tRPC query result. The env-reading function stays server-only.

### 8. MEDIUM: No cancellation mechanism
**Integrating: YES — important for 35-60s operations**

**Fix:** Add `ai.cancelDraft` mutation, Redis cancellation flag, check before each phase, Cancel button in progress UI.

### 9. MEDIUM: Phase 6 no transaction/idempotency
**Integrating: YES — same as #4**

Merged with #4 fix.

### 10. MEDIUM: Availability schema breaking change
**Integrating: YES**

**Fix:** Make `aiGenerationEnabled: z.boolean().optional()`.

---

## Suggestions NOT integrated (with reasoning)

### 9. System-wide rate limiting
**NOT integrating for MVP.** The per-user Redis lock already prevents concurrent drafts per user. System-wide semaphore adds complexity. The individual service rate limits (skill execution, media generation) already protect providers. Can be added post-MVP if needed.

### 13. Article truncation
**NOT integrating the removal.** Keeping the 2000-word soft limit as a safety net. Even though LLMs handle large contexts, the split LLM prompt quality degrades with very long articles. The article skill prompts will target 500-2000 words naturally.

### 15. p-map dependency
**NOT integrating.** p-map is a well-maintained, zero-dependency package that's cleaner than hand-rolling Promise chunking. Will add it as a dev dependency.

### 16. Orphaned image cleanup
**NOT integrating for MVP.** The storage cost of orphaned images is minimal. A future cleanup job can handle this. Not worth the complexity for MVP.

### 17. Credit estimate accuracy
**Partially integrating.** Will increase buffer from 20% to 30%. Exact credit tracking happens per-call; the pre-check is intentionally conservative.

### 11. tenantId flow
**NOT integrating change.** `getProviderForModel()` is global by design. tenantId flows through credit deduction and audit logging which is sufficient. Multi-tenant provider routing is a future concern.
