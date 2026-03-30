# Research Findings — Feature 055: Chat Memory Vector RAG

## 1. buildChatContext() Implementations

### Primary: memoryService.ts (line 1677)
- Full three-tier system: persona → visual state → entity memories → summaries → buffer
- Called by: `chat.ts:944`, `memory.ts:179`
- Signature accepts: `conversationId, userId, systemPrompt, options: { contextBudget, currentUserMessage, memoryMode, projectId, tenantId, modelCapabilities }`
- Returns: `ChatContext { systemPrompt, entityContext, summaryContext, bufferMessages, totalTokenEstimate, visualMemoryContext, imageAssets }`

### Secondary: contextBuilder.ts (line 41) — NOT memoryService.ts
- **CORRECTION to spec C-02:** The second `buildChatContext` is in `server/services/executors/contextBuilder.ts`, not a duplicate in memoryService.ts
- Simpler: persona + scoped memory (`retrieveForPrompt()`) + entity memory + skill prompt
- Called by: `unifiedOrchestrator.ts` (agency/skill execution flows)
- Already uses `retrieveForPrompt()` with scoped memory — this is the agency flow, not regular chat
- **Does NOT need the same update as the primary** — it already has vector search for agency flows

**Impact on spec:** C-02 should be revised — only the PRIMARY `buildChatContext` in memoryService.ts needs the 2-level retrieval update. The contextBuilder.ts already has its own scoped memory integration for agency flows.

## 2. processConversationMemory() (line 2087)

Current step-by-step:
1. `needsSummarization()` check
2. `getMessagesToSummarize()`
3. `generateSummaryPrompt()` → LLM call → `saveSummary()`
4. Credit deduction for summarization
5. Entity extraction from recent 5 messages (`extractEntitiesFromMessage()`)
6. Auto-save low-importance entities, suggest high-importance ones

**Insertion points for Feature 055:**
- **Before step 1:** Archive messages + chunk indexing (runs on every call, not gated by summarize check)
- **Between step 1 and 3:** Fact extraction (runs when summarization triggered)
- **Replace step 3:** Smart summarization gate (when flag enabled)

## 3. BullMQ Queue Patterns

**Established pattern (from deliveryQueue.ts):**
```typescript
// Lazy initialization with redis.duplicate()
let queue: Queue | null = null;
let worker: Worker | null = null;

async function initQueue() {
  if (queue) return queue;
  const redis = getRealtimeClient();
  queue = new Queue(QUEUE_NAME, { connection: redis.duplicate(), defaultJobOptions: { ... } });
  worker = new Worker(QUEUE_NAME, processor, { connection: redis.duplicate() });
  return queue;
}
```

**Key conventions:**
- Lazy init pattern (not eager)
- `redis.duplicate()` for each connection (queue, worker, DLQ)
- `UnrecoverableError` for permanent failures (skip retries)
- DLQ for failed jobs
- `closeQueue()` export for graceful shutdown

**File locations:** `server/services/deliveryQueue.ts`, `server/services/webhookDispatchQueue.ts`
**Workers in same process** as web server (not separate systemd service)

## 4. Scheduler Pattern

**Current:** Cloud Tasks based (not traditional cron)
- `server/services/cloudTasks.ts` → `enqueueTask()`
- No `node-cron` or BullMQ repeatable jobs currently

**For Feature 055:** Use BullMQ repeatable jobs (simpler than Cloud Tasks for periodic cleanup):
```typescript
queue.add("cleanup", {}, { repeat: { pattern: "0 3 * * *" } });
```

## 5. Python Internal API Auth

**Pattern from internal_provider.py:**
```python
async def verify_cli_token(x_proxy_token: Optional[str] = Header(None)):
    if not secrets.compare_digest(x_proxy_token, settings.SMARTSPEC_PROXY_TOKEN):
        raise HTTPException(401)
```

**Nginx:** `location /api/internal/ { deny all; return 403; }` — blocks external access

**For Feature 055:** Use same pattern with `SMARTSPEC_WEB_GATEWAY_TOKEN` + `/api/internal/` path

## 6. Test Patterns

**Service tests:** `server/services/__tests__/*.test.ts`
**Pattern:** Mock Drizzle ORM chain (`select().from().where().limit()`)
**Framework:** Vitest (config at `apps/web/vitest.config.ts`)
**No real DB in unit tests** — all mocked

**Existing memory tests:**
- `memoryPersonaRouting.test.ts`
- `contextBuilder.test.ts`
- `multimodalMemoryIntegration.test.ts`

## 7. Migration

**Latest:** `0110_narrow_wallflower.sql` (idx 110)
**Run:** `cd apps/web && pnpm db:push` (generates + applies)
**pgvector:** Extension installed, used by `scoped_memories` + `multimodal_memory_vectors`
