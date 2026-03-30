# Section 07 -- Context Retrieval (memoryMerger + buildChatContext)

## Section ID
`section-07-context-retrieval`

## Dependencies
- **section-01-schema-migration** -- `message_chunks` table and HNSW indexes
- **section-03-embedding-pipeline** -- `getQueryEmbedding()` for query embeddings
- **section-05-message-chunker** -- `searchMessageChunks()` for L2 fallback

## Overview

Implements the 2-level context retrieval system replacing the current "full entity dump + keyword rank" in `buildChatContext()`. Creates `memoryMerger.ts` and modifies `buildChatContext()` to conditionally use vector-based retrieval when `chat_vector_memory_enabled` flag is ON.

**Key change:** Instead of loading 50 entity memories and ranking by keyword (consuming ~40% of context), the new path uses semantic vector search to pull only 10-15 most relevant memories, freeing budget for recent messages (65-70%).

When flag OFF: behavior identical to current system.

## Files to Create

- `apps/web/server/services/memoryMerger.ts` -- 2-level merge + dedup
- `apps/web/server/services/__tests__/memoryMerger.test.ts` -- unit tests

## Files to Modify

- `apps/web/server/services/memoryService.ts` -- modify `buildChatContext()` (line 1677)
- `apps/web/server/services/scopedMemoryService.ts` -- add `getRuleMemories()`

---

## Types

```typescript
export interface MergedMemoryItem {
  id: string;
  source: "rule" | "l1_fact" | "l2_chunk" | "legacy_entity";
  content: string;
  tokenEstimate: number;
  score: number;
}

export interface MergeOptions {
  totalBudget: number;
  maxMemoryTokens?: number;    // default 4000
  l1Cap?: number;              // default 0.20
  l2Cap?: number;              // default 0.10
}

export interface MergeResult {
  contextText: string;         // [MEMORY_START]...[MEMORY_END] wrapped
  items: MergedMemoryItem[];
  tokenEstimate: number;
  l1Count: number;
  l2Count: number;
  l2Triggered: boolean;
  rulesCount: number;
  legacyCount: number;
}
```

## Constants

```typescript
export const MAX_MEMORY_TOKENS_IN_CONTEXT = 4000;
export const DEFAULT_L1_CAP = 0.20;
export const DEFAULT_L2_CAP = 0.10;
export const L2_TRIGGER_THRESHOLD = 3;
```

---

## Core Function: `mergeAndDedup()`

```typescript
export async function mergeAndDedup(
  rules: ScopedMemory[],
  l1Results: MemorySearchResult[],
  l2Results: ChunkSearchResult[],
  legacyEntities: EntityMemory[],
  options: MergeOptions,
): Promise<MergeResult>;
```

**Algorithm:**
1. Rules first (uncapped, never trimmed) -- format as `[RULE] {title}: {content}`
2. L1 facts by descending score (capped at 20% budget) -- `[FACT:{kind}] {title}: {content}`
3. L2 chunks only if L1 < 3 results (capped at 10%) -- `[CHUNK] {content}`
4. Legacy entities as lowest priority -- `[{entityType}:{entityName}] {facts}`
5. Dedup by record ID (`Set<string>`)
6. Wrap in `[MEMORY_START]\n...\n[MEMORY_END]`

When L1 >= 3 results, L2 budget redistributed to buffer (not L1). `l2Triggered: false`.

---

## `buildChatContext()` Modification

Inside `if (memoryMode === "full")` block (line 1788):

```typescript
const vectorEnabled = await getChatMemoryFlag("chat_vector_memory_enabled", activeTenantId);

if (vectorEnabled) {
  // 1. Get query embedding
  const embedding = await getQueryEmbedding(currentUserMessage);
  // 2. Fetch rules separately
  const rules = await getRuleMemories(tenantId, userId, personaId);
  // 3. L1 vector search
  const l1Results = await searchMemories({ tenantId, scopes: [{ type: "user", id: String(userId) }], query: currentUserMessage, topK: 10, embedding });
  // 4. Conditional L2
  let l2Results = [];
  if (l1Results.length < 3) {
    l2Results = await searchMessageChunks({ tenantId, userId, query: currentUserMessage, topK: 5, embedding });
  }
  // 5. Merge
  const mergeResult = await mergeAndDedup(rules, l1Results, l2Results, [], { totalBudget: budget });
  entityContext = mergeResult.contextText;
} else {
  // Legacy path unchanged
}
```

---

## `getRuleMemories()` in scopedMemoryService.ts

```typescript
export async function getRuleMemories(tenantId: string, userId: number, personaId?: string | null): Promise<ScopedMemory[]>
```

Query `scoped_memories` where `memoryKind = 'rule' AND ownerType = 'user' AND ownerId = String(userId)`.

---

## Tests

```
# mergeAndDedup tests:
Test: includes rules first (uncapped, never trimmed)
Test: L1 facts ordered by descending score, capped at 20% budget
Test: L2 chunks included when L1 < 3, capped at 10%
Test: legacy entities as lowest priority
Test: deduplicates by record ID
Test: respects MAX_MEMORY_TOKENS_IN_CONTEXT = 4000
Test: output wrapped in [MEMORY_START]...[MEMORY_END]
Test: when L1 >= 3, l2Triggered = false and L2 not included

# buildChatContext integration tests:
Test: vector ON uses searchMemories instead of full dump
Test: vector OFF uses legacy getEntityMemoriesForContext
Test: query embedding generated via getQueryEmbedding
Test: L2 triggered when L1 < 3
Test: L2 NOT triggered when L1 >= 3
Test: rules always fetched separately
Test: buffer messages get >= 50% of budget
```

---

## Error Handling

- `getQueryEmbedding()` returns `undefined` if Python API down -- degrades to keyword-only
- `searchMemories()` throws -- catch, log, fall back to legacy entity path
- Feature flag read fails -- default to OFF (legacy path)

## Security

- Cross-user IDOR prevented by scope filter `(ownerType='user', ownerId=String(userId), tenantId)`
- Tenant isolation via `tenantId` filter on all queries
- Conversation ownership validated by `searchMessageChunks()` (section-05)
