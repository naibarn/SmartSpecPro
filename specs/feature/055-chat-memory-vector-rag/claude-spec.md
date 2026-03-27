# Synthesized Specification — Feature 055: Chat Memory Vector RAG

## Source Documents
- **Detailed spec:** `spec.md` (v2.0, 2235 lines — architecture, schemas, security, monitoring)
- **Research:** `claude-research.md` (codebase integration points)
- **Interview:** `claude-interview.md` (business decisions)
- **Reviews:** 3 review files (completeness, security, database) — all findings resolved in spec v2.0

## What We're Building

Replace the current chat memory system's "full dump + keyword rank" approach with a **2-level vector RAG retrieval** system that:
1. **Archives** raw messages to encrypted JSONL files (safety net)
2. **Extracts** key facts into pgvector-indexed `scoped_memories` (Level 1)
3. **Chunks** raw messages into pgvector-indexed `message_chunks` (Level 2 fallback)
4. **Retrieves** via hybrid search (BM25 + cosine similarity + recency) instead of full dump
5. **Summarizes** only safe content — risky/critical info is never summarized

## Key Business Decisions (from interview)

| Decision | Answer | Impact |
|----------|--------|--------|
| Fact extraction frequency | Every message pair | Extract immediately, no batch delay |
| Conversation deletion | Soft delete — keep archives 7 days then hard delete | Recovery window before permanent deletion |
| Cross-conversation search | Yes — within same project | L2 chunks searchable across conversations in project |
| Memory Panel UI | Merged view — entity memories + extracted facts with [auto]/[manual] badges | Single unified memory list |
| High-importance facts | Auto-save all — no user confirmation | User manages later in Memory Panel |

## Key Technical Decisions (from research)

| Decision | Choice | Source |
|----------|--------|--------|
| Primary buildChatContext | `memoryService.ts:1677` — only this needs 2-level update | Research: contextBuilder.ts is agency-only |
| BullMQ pattern | Lazy init + `redis.duplicate()` + DLQ | Matches deliveryQueue.ts |
| Scheduler | BullMQ repeatable jobs | Simpler than Cloud Tasks for periodic work |
| Python embedding path | `/api/internal/embeddings` with `verify_internal_token` | Matches internal_provider.py + Nginx deny |
| HNSW parameters | L1: ef_construction=200, L2: ef_construction=64 | L2 is write-heavy |
| Migration | 0111 (next sequential) | After 0110_narrow_wallflower.sql |

## Architecture Summary

```
Message Flow:
  User msg → LLM response → Post-processing pipeline:
    1. Archive to JSONL (fire-and-forget, encrypted per-record)
    2. Chunk messages → message_chunks + BullMQ embed queue
    3. Extract facts → scoped_memories + BullMQ embed queue
    4. Smart summarize gate → safe-only summaries

Context Building Flow:
  User query → Generate embedding → 2-level search:
    L1: searchMemories(user scope, top-10)
    L2: searchMessageChunks(if L1 < 3, top-5, cross-conv within project)
    → Merge + dedup → Budget allocation:
      Rules: uncapped | L1 facts: max 20% | L2 chunks: max 10% |
      Summaries: max 15% | Buffer: remainder (65-70%)
```

## Rollout Phases
- Phase 0 (Week 1): Archive only — zero risk
- Phase 1a (Week 2): + Fact extraction (L1)
- Phase 1b (Week 3): + Chunk indexing (L2)
- Phase 2 (Week 4-5): + Vector search in chat context
- Phase 3 (Week 6+): + Smart summarization gate

## Files to Create
- `server/services/memoryArchiveService.ts`
- `server/services/factExtractor.ts`
- `server/services/messageChunkerService.ts`
- `server/services/messageChunkSearchService.ts`
- `server/services/smartSummarizer.ts`
- `server/services/queryEmbeddingService.ts`
- `server/services/memoryMerger.ts`
- `server/queues/embeddingQueue.ts`
- `python-backend/app/api/internal/embeddings.py`
- `drizzle/0111_chat_memory_vector.sql`

## Files to Modify
- `server/services/memoryService.ts` — buildChatContext() + processConversationMemory()
- `server/services/scopedMemoryService.ts` — add getRuleMemories()
- `server/routers/memory.ts` — add archive/search endpoints
- `drizzle/schema.ts` — message_chunks table, conversation_summaries columns, memory_archive_metadata table
- `python-backend/app/main.py` — register embeddings router

## Security Requirements (all resolved in spec v2.0)
- Path traversal prevention (sanitizePathSegment + path.resolve containment)
- Embedding API auth (verify_internal_token + /api/internal/ Nginx deny)
- Per-record encryption (AES-256-GCM, unique IV per JSONL line)
- Prompt injection defense (HumanMessage role + Zod validation + importance cap)
- Cross-user IDOR prevention (conversation ownership check before chunk search)
- BullMQ job validation (Zod schema on all job payloads)
- GDPR deletion (7-day soft delete + hard delete archives from disk)
