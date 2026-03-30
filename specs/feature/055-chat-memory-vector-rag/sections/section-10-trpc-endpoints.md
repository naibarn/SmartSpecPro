# Section 10: tRPC Endpoints for Chat Memory Vector RAG

## Section ID
`section-10-trpc-endpoints`

## Dependencies
- **section-02-archive-service** -- provides `readArchive()`, `searchArchive()` from `memoryArchiveService.ts`
- **section-07-context-retrieval** -- provides 2-level search via `searchMemories()` and `searchMessageChunks()`
- **section-01-schema-migration** -- provides `message_chunks` and `memory_archive_metadata` tables

## Overview

Add three new tRPC procedures to the existing `memoryRouter` in `apps/web/server/routers/memory.ts`. These endpoints expose the archive read/search and 2-level vector search to the frontend (primarily the Memory Panel UI in section-11).

All three procedures use `protectedProcedure`, validate inputs with Zod, and enforce conversation ownership via `getConversationById(conversationId, ctx.user.id)`.

## Files to Modify

| File | Action |
|------|--------|
| `apps/web/server/routers/memory.ts` | Add 3 new procedures to `memoryRouter` |

## Files to Create

| File | Action |
|------|--------|
| `apps/web/server/routers/__tests__/memoryArchiveEndpoints.test.ts` | Tests for the 3 new procedures |

---

## Tests First

### Test Cases

**`memory.getArchive`**

```
# Test: returns decrypted records for owned conversation
# Test: rejects request for non-owned conversation (throws NOT_FOUND)
# Test: validates dateFrom is before dateTo (Zod refinement)
```

**`memory.searchArchive`**

```
# Test: returns matching records for valid query
# Test: validates query length max 500 characters
# Test: validates limit between 1 and 50
# Test: rejects non-owned conversation
```

**`memory.searchMemoryContext`**

```
# Test: returns L1 results from scoped memory search
# Test: triggers L2 when L1 returns fewer than 3 results
# Test: does not trigger L2 when L1 returns >= 3 results
# Test: validates topK between 1 and 20
# Test: optional conversationId passes ownership check when provided
# Test: without conversationId, uses user-scoped search only
```

---

## Implementation Details

### Procedure 1: `memory.getArchive`

**Input:**
```typescript
z.object({
  conversationId: z.number(),
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
})
```

**Logic:**
1. Verify conversation ownership via `getConversationById(input.conversationId, ctx.user.id)`
2. Resolve tenantId from `(ctx.user as any).tenantId || ""`
3. Call `readArchive({ tenantId, userId: ctx.user.id, conversationId, dateFrom, dateTo })`
4. Return `ArchiveRecord[]`

### Procedure 2: `memory.searchArchive`

**Input:**
```typescript
z.object({
  conversationId: z.number(),
  query: z.string().min(1).max(500),
  limit: z.number().min(1).max(50).default(20),
})
```

**Logic:**
1. Verify conversation ownership
2. Call `searchArchive({ tenantId, userId, conversationId, query, limit })`
3. Return matching `ArchiveRecord[]`

### Procedure 3: `memory.searchMemoryContext`

**Input:**
```typescript
z.object({
  query: z.string().min(1).max(500),
  conversationId: z.number().optional(),
  topK: z.number().min(1).max(20).default(10),
})
```

**Logic:**
1. If `conversationId` provided, verify ownership
2. Generate query embedding via `getQueryEmbedding(input.query)` (returns `number[] | undefined`)
3. **L1**: Call `searchMemories()` with `scopes: [{ type: "user", id: String(ctx.user.id) }]`, query, topK, embedding
4. **L2**: If `l1Results.length < 3`, call `searchMessageChunks()` with topK: 5
5. Return `{ l1Results, l2Results: l2Results || [], l1Count, l2Triggered }`

### Conversation Ownership Pattern

```typescript
const conversation = await getConversationById(input.conversationId, ctx.user.id);
if (!conversation) {
  throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
}
```

### Imports (dynamic, inside handlers)

- `readArchive`, `searchArchive` from `../services/memoryArchiveService`
- `getQueryEmbedding` from `../services/queryEmbeddingService`
- `searchMemories` from `../services/scopedMemoryService`
- `searchMessageChunks` from `../services/messageChunkSearchService`

### Error Handling

- Zod validation errors handled by tRPC middleware
- Service-level errors wrapped in `TRPCError` with `INTERNAL_SERVER_ERROR`
- `searchMemoryContext` degrades gracefully when embedding API is down (keyword-only search)
