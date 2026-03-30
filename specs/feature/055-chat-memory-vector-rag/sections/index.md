<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-migration
section-02-archive-service
section-03-embedding-pipeline
section-04-fact-extractor
section-05-message-chunker
section-06-smart-summarizer
section-07-context-retrieval
section-08-process-integration
section-09-background-tasks
section-10-trpc-endpoints
section-11-memory-panel-ui
section-12-feature-flags-tests
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema-migration | - | all | Yes (must run first) |
| section-02-archive-service | 01 | 08 | Yes |
| section-03-embedding-pipeline | 01 | 04, 05, 07 | Yes |
| section-04-fact-extractor | 01, 03 | 08 | Yes (with 05) |
| section-05-message-chunker | 01, 03 | 07, 08 | Yes (with 04) |
| section-06-smart-summarizer | 01 | 08 | Yes |
| section-07-context-retrieval | 01, 03, 05 | 08 | No |
| section-08-process-integration | 02, 04, 05, 06, 07 | 09 | No |
| section-09-background-tasks | 08 | - | Yes (with 10) |
| section-10-trpc-endpoints | 02, 07 | 11 | Yes (with 09) |
| section-11-memory-panel-ui | 10 | - | No |
| section-12-feature-flags-tests | 08 | - | Yes |

## Execution Order

```
Batch 1: section-01-schema-migration (foundation — must run first)
Batch 2: section-02-archive-service, section-03-embedding-pipeline, section-06-smart-summarizer (parallel — independent services)
Batch 3: section-04-fact-extractor, section-05-message-chunker (parallel — both need 03)
Batch 4: section-07-context-retrieval (needs 05 for chunk search)
Batch 5: section-08-process-integration (wires everything into processConversationMemory + buildChatContext)
Batch 6: section-09-background-tasks, section-10-trpc-endpoints, section-12-feature-flags-tests (parallel — independent)
Batch 7: section-11-memory-panel-ui (needs 10 for data endpoints)
```

## Section Summaries

### section-01-schema-migration
Database migration: `message_chunks` table, `memory_archive_metadata` table, new columns on `conversation_summaries`, HNSW indexes, `messages.conversationId` index, `CREATE EXTENSION vector`. Migration file `0111_chat_memory_vector.sql`.

### section-02-archive-service
`memoryArchiveService.ts`: encrypted JSONL archive (per-record AES-256-GCM), path traversal prevention, `archiveMessage()`, `readArchive()`, `searchArchive()`, `cleanupExpiredArchives()`, `deleteUserArchives()`. Plus `memory_archive_metadata` upsert logic.

### section-03-embedding-pipeline
Python `/api/internal/embeddings` endpoint with auth. Node.js `queryEmbeddingService.ts` (Redis-cached). BullMQ `embeddingQueue.ts` (queue + worker with Zod validation). Embedding array validation.

### section-04-fact-extractor
`factExtractor.ts`: LLM-based extraction with HumanMessage role, Zod validation, injection filter, importance cap, category→memoryKind mapping, dedup via cosine similarity (threshold 0.92), reinforce existing or insert new scoped_memories.

### section-05-message-chunker
`messageChunkerService.ts`: language-aware chunking (~500 tokens), 50-token overlap, role prefix, idempotent insert. `messageChunkSearchService.ts`: hybrid BM25+vector search, conversation ownership check, cross-conversation search within project.

### section-06-smart-summarizer
`smartSummarizer.ts`: LLM classification of SAFE vs RISKY segments (HumanMessage role, Zod validation), gate logic that only passes safe content to summary generation, tracks skippedRiskyCount and extractedFactIds.

### section-07-context-retrieval
`memoryMerger.ts`: 2-level merge+dedup (Rules → L1 facts → L2 chunks → legacy entities), budget caps, ID-based dedup. Wire into `buildChatContext()` — replace entity full dump with `searchMemories()` using user scope + vector embedding.

### section-08-process-integration
Wire all services into `processConversationMemory()` following the 5-step pipeline (§5.4 of spec): archive → chunk → extract → smart summarize → legacy extraction. Feature flag gating for each step.

### section-09-background-tasks
BullMQ repeatable jobs: archive cleanup (per-tenant, 7-day floor), chunk cleanup, orphaned embedding reconciliation, memory eviction. Celery beat: HNSW index rebuild (weekly, REINDEX CONCURRENTLY).

### section-10-trpc-endpoints
tRPC procedures: `memory.getArchive`, `memory.searchArchive`, `memory.searchMemoryContext` with Zod input validation and conversation ownership checks.

### section-11-memory-panel-ui
Update `MemoryPanel.tsx` to query both `entityMemories` and `scopedMemories`, merged view with [auto]/[manual] badges, edit/delete/promote actions.

### section-12-feature-flags-tests
Feature flag definitions in system_settings, integration tests verifying: flags OFF = legacy behavior, each flag enables its respective pipeline step, per-tenant isolation.
