# TDD Plan — Feature 055: Chat Memory Vector RAG

Testing framework: **Vitest** (TypeScript), **pytest** (Python)
Conventions: Mocked Drizzle ORM for unit tests, same patterns as `memoryPersonaRouting.test.ts`

---

## 2. Database Schema

### Tests (run after migration)
```
# Test: migration applies cleanly on fresh database
# Test: message_chunks table exists with correct columns
# Test: memory_archive_metadata table exists with correct columns
# Test: conversation_summaries has new nullable columns (skippedRiskyCount, extractedFactIds, hasRawArchive, classificationStats)
# Test: HNSW indexes created and valid (indisvalid = true)
# Test: messages.conversationId index exists
# Test: unique constraint on (conversationId, chunkIndex) prevents duplicates
# Test: unique constraint on (conversationId, archiveDate) prevents duplicates
# Test: FK cascade: delete conversation → message_chunks deleted
# Test: FK cascade: delete user → message_chunks + memory_archive_metadata deleted
```

---

## 3. File-Based Memory Archive

### Tests: memoryArchiveService.test.ts
```
# Test: archiveMessage encrypts record and appends to correct file path
# Test: archiveMessage creates directory structure if not exists
# Test: readArchive decrypts all records in date range
# Test: readArchive returns empty array for non-existent file
# Test: searchArchive finds records matching keyword query
# Test: sanitizePathSegment rejects "../" and other traversal patterns
# Test: sanitizePathSegment rejects empty string
# Test: resolveArchivePath throws on path traversal attempt (tenantId="../../etc")
# Test: resolveArchivePath produces correct path for valid inputs
# Test: cleanupExpiredArchives only deletes files in specified tenant directory
# Test: cleanupExpiredArchives enforces 7-day minimum retention
# Test: cleanupExpiredArchives(tenantId, 0) uses 7-day floor, not 0
# Test: deleteUserArchives removes entire user directory recursively
# Test: per-record encryption uses unique IV per line (verify two lines have different IVs)
# Test: file rotation at 50MB boundary creates new file
# Test: metadata upsert increments messageCount on each append
```

---

## 4. Fact Extraction Pipeline (Level 1)

### Tests: factExtractor.test.ts
```
# Test: valid LLM response parsed into ExtractedFact[] via Zod schema
# Test: Zod rejects fact with importance > 8
# Test: Zod rejects fact with missing required fields
# Test: injection pattern filter removes facts containing "OVERRIDE", "SYSTEM:", etc.
# Test: mapCategoryToKind correctly maps all 7 categories
# Test: deduplicateAndStore inserts new fact when no similar memory exists
# Test: deduplicateAndStore reinforces existing memory when cosine > 0.92
# Test: deduplicateAndStore increments reinforcementCount on reinforce
# Test: deduplicateAndStore uses max(existing, new) for importance on reinforce
# Test: extracted facts have sourceType "auto" and ownerType "user"
# Test: embedding queued via BullMQ with correct job payload { type, recordId, text }
# Test: empty LLM response (no facts) returns { inserted: 0, reinforced: 0, skipped: 0 }
# Test: malformed LLM response (not JSON array) handled gracefully, returns empty
```

---

## 5. Message Chunk Indexer (Level 2)

### Tests: messageChunkerService.test.ts
```
# Test: chunkMessages splits messages into ~500 token chunks
# Test: chunkMessages preserves message boundaries (no mid-message split for short messages)
# Test: chunkMessages includes 50-token overlap between consecutive chunks
# Test: chunkMessages strips system messages
# Test: chunkMessages adds role prefix (USER:, ASSISTANT:) to each message
# Test: estimateTokens returns higher count for Thai text than English (same length)
# Test: estimateTokens("สวัสดี") ≈ 2 tokens (not 6/4=1.5 from English ratio)
# Test: indexMessageChunks creates chunks in DB with correct fields
# Test: indexMessageChunks queues embedding jobs with { type: "message_chunk", recordId, text }
# Test: indexMessageChunks is idempotent (ON CONFLICT DO NOTHING for same chunkIndex)
# Test: indexMessageChunks respects max 2000 chunks per conversation
# Test: PII redaction applied to text before embedding queue (not to stored content)
```

### Tests: messageChunkSearchService.test.ts
```
# Test: searchMessageChunks verifies conversation ownership before searching
# Test: searchMessageChunks throws on non-owned conversationId
# Test: searchMessageChunks filters by tenantId + userId (no cross-user leakage)
# Test: searchMessageChunks returns empty when no embedding provided and no keyword match
# Test: searchMessageChunks returns hybrid-scored results when embedding provided
# Test: searchMessageChunks applies minimum relevance threshold (0.1)
# Test: cross-conversation search works when conversationId is omitted (searches by projectId)
```

---

## 6. Smart Summarization Gate

### Tests: smartSummarizer.test.ts
```
# Test: classifySegments returns "safe" for casual chat messages
# Test: classifySegments returns "risky" for messages containing decisions
# Test: classifySegments returns "risky" for messages with code blocks > 10 lines
# Test: classifySegments returns "risky" for messages containing rules/constraints
# Test: Zod validation rejects malformed classification output
# Test: summarize gate only passes safe segments to summary generator
# Test: skippedRiskyCount tracked correctly in summary metadata
# Test: hasRawArchive set to true when archive was written
# Test: extractedFactIds populated with IDs of facts extracted from this range
# Test: when flag OFF, existing generateSummaryPrompt() is used (legacy path)
```

---

## 7. 2-Level Chat Context Retrieval

### Tests: memoryMerger.test.ts
```
# Test: mergeAndDedup includes rules first (uncapped, never trimmed)
# Test: mergeAndDedup includes L1 facts by relevance score (capped at 20% budget)
# Test: mergeAndDedup includes L2 chunks only when present (capped at 10%)
# Test: mergeAndDedup includes legacy entities as lowest priority
# Test: mergeAndDedup deduplicates by record ID (not content prefix)
# Test: mergeAndDedup respects MAX_MEMORY_TOKENS_IN_CONTEXT = 4000
# Test: mergeAndDedup output format: [MEMORY_START]...[MEMORY_END] wrapper
# Test: when L1 returns >= 3 results, L2 budget redistributed to buffer
```

### Tests: buildChatContext integration (in existing test file)
```
# Test: with chat_vector_memory_enabled ON, uses searchMemories instead of full dump
# Test: with chat_vector_memory_enabled OFF, uses legacy getEntityMemoriesForContext
# Test: query embedding generated via queryEmbeddingService
# Test: L2 triggered when L1 returns < 3 results
# Test: L2 NOT triggered when L1 returns >= 3 results
# Test: rules always fetched separately from vector search
# Test: buffer messages get remainder of budget (>= 50%)
```

---

## 8. Embedding Pipeline

### Tests: queryEmbeddingService.test.ts
```
# Test: generates embedding by calling Python API with auth token
# Test: caches result in Redis with 5-min TTL
# Test: returns cached embedding on cache hit (no Python API call)
# Test: returns undefined when Python API is down (graceful fallback)
# Test: hashQuery uses SHA-256 with length prefix
# Test: different queries produce different cache keys
```

### Tests: embeddingQueue.test.ts
```
# Test: worker validates job payload via Zod (rejects invalid type)
# Test: worker validates job payload via Zod (rejects missing recordId)
# Test: worker validates job payload via Zod (rejects text > 32000 chars)
# Test: worker validates embedding array (all elements isFinite)
# Test: worker updates scoped_memories.embedding for type "scoped_memory"
# Test: worker updates message_chunks.embedding for type "message_chunk"
# Test: worker retries on transient failure (up to 3 attempts)
# Test: worker discards invalid job without retry
```

### Tests: test_embeddings_api.py (pytest)
```
# Test: POST /api/internal/embeddings returns 401 without X-Internal-Token
# Test: POST /api/internal/embeddings returns 401 with wrong token
# Test: POST /api/internal/embeddings returns 200 with correct token
# Test: response contains 1536-dim embedding array
# Test: text > 32000 chars returns 400
# Test: POST /api/internal/embeddings/batch accepts up to 100 texts
# Test: POST /api/internal/embeddings/batch rejects > 100 texts
```

---

## 9. Background Tasks

### Tests (integration-level)
```
# Test: archive cleanup reads per-tenant retention and deletes expired files only
# Test: archive cleanup skips files newer than 7 days regardless of setting
# Test: chunk cleanup deletes chunks older than retention period
# Test: orphaned embedding reconciliation re-queues NULL embedding chunks
# Test: orphaned embedding reconciliation limits to 200 per batch
# Test: HNSW rebuild runs REINDEX CONCURRENTLY without error
# Test: memory eviction follows expire → decay → compact → warn sequence
```

---

## 10. tRPC Router Procedures

### Tests (add to existing memory router tests)
```
# Test: memory.getArchive returns decrypted records for owned conversation
# Test: memory.getArchive rejects request for non-owned conversation
# Test: memory.searchArchive returns matching records
# Test: memory.searchArchive validates query length (max 500)
# Test: memory.searchMemoryContext returns L1 results
# Test: memory.searchMemoryContext triggers L2 when L1 < 3 results
```

---

## 12. Feature Flags

### Tests
```
# Test: all flags OFF → buildChatContext uses legacy entity memory path
# Test: chat_archive_enabled ON → messages archived to JSONL
# Test: chat_fact_extraction_enabled ON → facts extracted and stored
# Test: chat_chunk_index_enabled ON → chunks created and queued for embedding
# Test: chat_vector_memory_enabled ON → vector search used in buildChatContext
# Test: chat_smart_summarize_enabled ON → classification gate applied before summarize
# Test: flags are per-tenant (tenant A's flag doesn't affect tenant B)
```
