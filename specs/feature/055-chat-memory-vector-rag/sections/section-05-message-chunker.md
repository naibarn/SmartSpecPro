The section-01 hasn't been written yet either. I have all the information I need. Here is the section content:

# Section 05 — Message Chunker Service

**Section ID:** `section-05-message-chunker`
**Depends on:** section-01-schema-migration (message_chunks table), section-03-embedding-pipeline (BullMQ embedding queue + Python embedding endpoint)
**Blocks:** section-07-context-retrieval, section-08-process-integration
**Parallelizable with:** section-04-fact-extractor

---

## Overview

This section implements two services:

1. **`messageChunkerService.ts`** — Splits raw conversation messages into ~500-token chunks with 50-token overlap, stores them in the `message_chunks` table idempotently, and queues embedding generation via BullMQ.
2. **`messageChunkSearchService.ts`** — Hybrid BM25 + vector search over message chunks with conversation ownership enforcement and optional cross-conversation search within a project.

These form the **Level 2 fallback** retrieval layer. When Level 1 (fact extraction from section-04) returns fewer than 3 results, the context retrieval system (section-07) falls back to searching raw message chunks.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/services/messageChunkerService.ts` | Chunking logic + DB insert + embedding queue |
| `apps/web/server/services/messageChunkSearchService.ts` | Hybrid search over chunks |
| `apps/web/server/services/__tests__/messageChunkerService.test.ts` | Unit tests for chunker |
| `apps/web/server/services/__tests__/messageChunkSearchService.test.ts` | Unit tests for search |

---

## Dependencies (from other sections)

- **section-01:** `messageChunks` table in `drizzle/schema.ts` with columns: `id`, `tenantId`, `userId`, `conversationId`, `messageRangeStart`, `messageRangeEnd`, `chunkIndex`, `content`, `tokenCount`, `embedding`, `projectId`, `personaId`, `createdAt`. Unique index on `(conversationId, chunkIndex)`. HNSW index on `embedding` with `ef_construction=64`. GIN tsvector index on `content`.
- **section-03:** `enqueueEmbedding()` exported from `apps/web/server/services/embeddingQueue.ts` accepting `{ type: "message_chunk", recordId: string, text: string }`.
- **Existing:** `detectAndRedactPII()` from `apps/web/server/services/piiFilter.ts` (returns `{ redactedText, detections }`)
- **Existing:** `getDb()` from Drizzle setup for database access
- **Existing:** `messages` table schema — `id`, `conversationId`, `role` (messageRoleEnum: "user" | "assistant" | "system"), `content`, `createdAt`

---

## 1. messageChunkerService.ts — Implementation Guidance

### 1.1 Types

```typescript
/** Input message shape (subset of DB messages table) */
interface ChunkableMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
}

/** Single chunk output from the chunking algorithm */
interface MessageChunk {
  chunkIndex: number;
  content: string;          // role-prefixed text
  tokenCount: number;       // estimated tokens
  messageRangeStart: number; // first message.id in this chunk
  messageRangeEnd: number;   // last message.id in this chunk
}

/** Return value from chunkMessages() */
interface ChunkResult {
  chunks: MessageChunk[];
}
```

### 1.2 estimateTokens(text: string): number

Language-aware token estimation function. Must handle:

- **English text:** ~4 characters per token (standard GPT tokenizer ratio)
- **Thai text:** ~1.5 characters per token (Thai characters encode to more tokens due to UTF-8 multi-byte + BPE splitting)
- **Mixed text:** Weighted average based on character ranges detected

Logic outline:
1. Count Thai characters (Unicode range `\u0E00-\u0E7F`)
2. Count non-Thai characters (remainder)
3. Thai tokens = `Math.ceil(thaiCharCount / 1.5)`
4. English tokens = `Math.ceil(nonThaiCharCount / 4)`
5. Return `thaiTokens + englishTokens`

**Note:** This is an estimation heuristic, not a precise tokenizer. The goal is budget-appropriate chunking, not exact token counting.

### 1.3 chunkMessages(messages: ChunkableMessage[]): ChunkResult

Core chunking algorithm. Parameters are constants, not configurable:

| Parameter | Value |
|-----------|-------|
| TARGET_CHUNK_TOKENS | 500 |
| OVERLAP_TOKENS | 50 |
| MAX_CHUNKS_PER_CONVERSATION | 2000 |

Algorithm:
1. **Filter** — Remove messages where `role === "system"` (not useful for retrieval).
2. **Prefix** — Prepend each message content with role marker: `"USER: "` or `"ASSISTANT: "`.
3. **Accumulate** — Walk through messages, accumulating into a chunk buffer:
   - If adding the next message keeps the chunk under `TARGET_CHUNK_TOKENS`, append it.
   - If a single message exceeds `TARGET_CHUNK_TOKENS`, it becomes its own chunk (do not split mid-message).
   - When the chunk reaches `TARGET_CHUNK_TOKENS`, finalize it and start a new chunk.
4. **Overlap** — When starting a new chunk, include the trailing ~`OVERLAP_TOKENS` worth of text from the previous chunk as prefix (prevents context loss at boundaries).
5. **Track ranges** — Each chunk records `messageRangeStart` (first message ID) and `messageRangeEnd` (last message ID) for provenance.
6. **Cap** — Stop at `MAX_CHUNKS_PER_CONVERSATION`. Log a warning if this limit is hit.

Edge cases:
- Empty messages array returns `{ chunks: [] }`
- Single short message produces exactly one chunk
- Messages with only system role returns `{ chunks: [] }`

### 1.4 indexMessageChunks(params): Promise<IndexResult>

Orchestration function that chunks messages and persists them.

```typescript
interface IndexParams {
  tenantId: string;
  userId: number;
  conversationId: number;
  messages: ChunkableMessage[];
  projectId?: string;
  personaId?: string;
}

interface IndexResult {
  chunksCreated: number;
  embeddingsQueued: number;
  skippedDuplicates: number;
}
```

Steps:
1. Call `chunkMessages(messages)` to produce chunks.
2. For each chunk, generate a UUID (`crypto.randomUUID()`).
3. **Idempotent insert:** Use `INSERT ... ON CONFLICT (conversationId, chunkIndex) DO NOTHING`. This means re-processing the same messages is safe.
4. For each successfully inserted chunk (not skipped by conflict):
   - Call `detectAndRedactPII(chunk.content)` from `apps/web/server/services/piiFilter.ts`
   - Queue embedding job via `enqueueEmbedding({ type: "message_chunk", recordId: uuid, text: redactedText })`
   - **Important:** The `content` column stores the raw (non-redacted) text for keyword search. Only the embedding is generated from PII-redacted text.
5. Return counts of created chunks, queued embeddings, and skipped duplicates.

---

## 2. messageChunkSearchService.ts — Implementation Guidance

### 2.1 Types

```typescript
interface ChunkSearchParams {
  tenantId: string;
  userId: number;
  query: string;
  embedding?: number[];        // 1536-dim query embedding (from queryEmbeddingService)
  conversationId?: number;     // if omitted, searches all user's chunks in project
  projectId?: string;          // required when conversationId is omitted
  topK?: number;               // default 5, max 20
  minRelevance?: number;       // default 0.1
}

interface ChunkSearchResult {
  chunkId: string;
  conversationId: number;
  content: string;
  tokenCount: number;
  relevanceScore: number;      // combined hybrid score [0, 1]
  messageRangeStart: number;
  messageRangeEnd: number;
  createdAt: Date;
}
```

### 2.2 searchMessageChunks(params): Promise<ChunkSearchResult[]>

Hybrid search combining BM25 keyword matching and vector cosine similarity.

Steps:
1. **Ownership check** — If `conversationId` is provided, verify it belongs to `userId` + `tenantId` by querying the `conversations` table. Throw an authorization error if the conversation does not belong to the user. This prevents IDOR attacks.
2. **Build query conditions:**
   - Always filter by `tenantId` AND `userId` (no cross-user leakage)
   - If `conversationId` provided: filter by it
   - If `conversationId` omitted: require `projectId`, filter by `(tenantId, projectId)`
3. **BM25 score** — Use PostgreSQL `ts_rank(to_tsvector('english', content), plainto_tsquery('english', query))` for keyword relevance.
4. **Vector score** — If `embedding` is provided and chunks have non-null embeddings, compute `1 - (embedding <=> chunk.embedding)` for cosine similarity (pgvector `<=>` returns distance, so `1 - distance` = similarity).
5. **Hybrid score** — Combine: `0.4 * bm25_normalized + 0.6 * vector_score`. When no embedding is provided, use BM25 only (score = bm25_normalized).
6. **Filter** — Discard results below `minRelevance` threshold (default 0.1).
7. **Sort** — By `relevanceScore` descending.
8. **Limit** — Return top `topK` results (default 5, max 20).

The SQL query should be constructed using Drizzle's `sql` template tag for the vector operations and tsvector ranking, since these are PostgreSQL-specific and not directly supported by Drizzle's query builder.

### 2.3 Cross-Conversation Search

When `conversationId` is omitted and `projectId` is provided:
- Query uses the `(tenantId, projectId)` index on `message_chunks`
- Results may span multiple conversations
- Each result includes `conversationId` for attribution
- Still filtered by `userId` to prevent cross-user access

---

## 3. Tests — messageChunkerService.test.ts

File: `apps/web/server/services/__tests__/messageChunkerService.test.ts`

All tests use mocked Drizzle ORM (no real database). Mock `enqueueEmbedding` from the embedding queue. Mock `detectAndRedactPII` from piiFilter.

### Test Cases

```
# Chunking algorithm
Test: chunkMessages splits messages into ~500 token chunks
  - Provide 10 messages totaling ~2500 tokens
  - Assert chunks.length >= 4 and each chunk.tokenCount <= 600 (allowing some variance)

Test: chunkMessages preserves message boundaries (no mid-message split for short messages)
  - Provide 3 messages of ~200 tokens each
  - Assert first chunk contains all 3 messages (600 < splitting threshold for a single message)

Test: chunkMessages includes 50-token overlap between consecutive chunks
  - Provide messages that produce 3+ chunks
  - Assert chunk[1].content starts with tail of chunk[0].content (~50 tokens worth)

Test: chunkMessages strips system messages
  - Provide messages with role "system" interspersed
  - Assert no chunk content contains system message text

Test: chunkMessages adds role prefix (USER:, ASSISTANT:) to each message
  - Provide user + assistant messages
  - Assert each message in chunk content starts with "USER: " or "ASSISTANT: "

Test: estimateTokens returns higher count for Thai text than English (same char length)
  - Compare estimateTokens("สวัสดีครับ") vs estimateTokens("helloworld")
  - Thai must produce higher token estimate for same character count

Test: estimateTokens("สวัสดี") approximately 4 tokens (6 chars / 1.5)
  - Assert result is approximately 4 (not 2 from English 6/4 ratio)

Test: chunkMessages returns empty chunks for empty input
  - Assert chunkMessages([]).chunks has length 0

Test: chunkMessages returns empty chunks when only system messages
  - Provide 3 system-role messages
  - Assert chunks.length === 0

Test: chunkMessages respects max 2000 chunks per conversation
  - Provide very large message set that would produce > 2000 chunks
  - Assert chunks.length === 2000

# Indexing
Test: indexMessageChunks creates chunks in DB with correct fields
  - Mock db.insert to capture inserted rows
  - Assert each row has id, tenantId, userId, conversationId, chunkIndex, content, tokenCount

Test: indexMessageChunks queues embedding jobs with { type: "message_chunk", recordId, text }
  - Mock enqueueEmbedding
  - Assert called with type "message_chunk" and text from PII-redacted content

Test: indexMessageChunks is idempotent (ON CONFLICT DO NOTHING for same chunkIndex)
  - Mock db.insert to simulate conflict (return 0 rows affected)
  - Assert skippedDuplicates count matches, no embedding queued for skipped chunks

Test: PII redaction applied to text before embedding queue (not to stored content)
  - Mock detectAndRedactPII to return redacted text
  - Assert db insert uses original content, enqueueEmbedding uses redacted text
```

---

## 4. Tests — messageChunkSearchService.test.ts

File: `apps/web/server/services/__tests__/messageChunkSearchService.test.ts`

All tests use mocked Drizzle ORM. Mock conversation ownership queries.

### Test Cases

```
Test: searchMessageChunks verifies conversation ownership before searching
  - Mock conversations query to return a conversation owned by userId=1
  - Call with userId=1, conversationId=5
  - Assert conversations table queried with conversationId=5

Test: searchMessageChunks throws on non-owned conversationId
  - Mock conversations query to return conversation owned by userId=2
  - Call with userId=1, conversationId=5
  - Assert throws an authorization/forbidden error

Test: searchMessageChunks filters by tenantId + userId (no cross-user leakage)
  - Mock db query to capture SQL conditions
  - Assert WHERE clause includes tenantId AND userId filters

Test: searchMessageChunks returns empty when no embedding provided and no keyword match
  - Mock db query returning no rows
  - Assert empty array returned

Test: searchMessageChunks returns hybrid-scored results when embedding provided
  - Mock db query returning rows with both bm25 and vector scores
  - Assert results sorted by combined relevanceScore descending

Test: searchMessageChunks applies minimum relevance threshold (0.1)
  - Mock db query returning rows with scores above and below 0.1
  - Assert only rows with score >= 0.1 are returned

Test: cross-conversation search works when conversationId is omitted (searches by projectId)
  - Call with projectId but no conversationId
  - Assert db query filters by projectId, not conversationId
  - Assert no ownership check on conversations table (user-scoped by tenantId+userId instead)
```

---

## 5. Integration Notes

### Called By (section-08)

`indexMessageChunks()` is called from `processConversationMemory()` in `apps/web/server/services/memoryService.ts` when the `chat_chunk_index_enabled` feature flag is ON. The call happens on every message pair, before summarization logic.

### Used By (section-07)

`searchMessageChunks()` is called from the context retrieval layer (`memoryMerger.ts`) as the Level 2 fallback when Level 1 fact search returns fewer than 3 results. It receives the query embedding from `queryEmbeddingService.ts` (section-03).

### Feature Flag

Gated by `chat_chunk_index_enabled` in `system_settings` table (category: `"feature_flags"`). When OFF, `indexMessageChunks()` is not called at all, and no chunks are created. The search service can still be called (it will return empty results if no chunks exist).

### Conversation Ownership Check Pattern

The ownership check in `searchMessageChunks` should query the `conversations` table:

```typescript
// Pattern (not full implementation):
const conv = await db.select({ userId: conversations.userId })
  .from(conversations)
  .where(eq(conversations.id, conversationId))
  .limit(1);

if (!conv.length || conv[0].userId !== userId) {
  throw new Error("Forbidden: conversation not owned by user");
}
```

The `conversations` table has a `userId` column (integer, FK to users.id) established in the existing schema.

---

## 6. Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| `TARGET_CHUNK_TOKENS` | 500 | messageChunkerService.ts |
| `OVERLAP_TOKENS` | 50 | messageChunkerService.ts |
| `MAX_CHUNKS_PER_CONVERSATION` | 2000 | messageChunkerService.ts |
| `DEFAULT_TOP_K` | 5 | messageChunkSearchService.ts |
| `MAX_TOP_K` | 20 | messageChunkSearchService.ts |
| `DEFAULT_MIN_RELEVANCE` | 0.1 | messageChunkSearchService.ts |
| `BM25_WEIGHT` | 0.4 | messageChunkSearchService.ts |
| `VECTOR_WEIGHT` | 0.6 | messageChunkSearchService.ts |

---

## 7. Error Handling

- **indexMessageChunks:** Catches and logs DB insert errors per-chunk (does not abort the entire batch on a single chunk failure). Returns partial results.
- **searchMessageChunks:** Throws on ownership violation. Returns empty array on DB errors (logged, not thrown) to avoid breaking the chat flow.
- **estimateTokens:** Pure function, cannot fail. Returns at least 1 for any non-empty string.
- **Embedding queue failures:** Handled by BullMQ retry mechanism (section-03). The chunker does not wait for embedding completion.