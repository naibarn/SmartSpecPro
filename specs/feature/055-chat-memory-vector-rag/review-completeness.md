# Completeness Review — Feature 055: Chat Memory Vector RAG

**Reviewer:** SSP Architect Agent
**Date:** 2026-03-23
**Spec Version:** 1.1
**Branch:** codex/feature-044-multimodal-chat-memory

---

## Review Summary

The spec is architecturally sound and covers a wide surface area well. The 2-level retrieval model, rollout phases, and budget-allocation table are clear and implementation-ready. However, there are **4 critical issues** that would cause runtime failures or silent data corruption if the spec were followed as-is, and **8 high-priority issues** that would cause integration bugs with the existing codebase.

---

## CRITICAL Issues

### C-01 — `retrieveForPrompt()` signature mismatch

**Location:** Section 6.1 (New flow), Section 16 (Modified Files)

The spec proposes calling:
```
retrieveForPrompt(tenantId, assistantId, runId, roomId, teamId, currentUserMessage, entityBudget, queryEmbedding)
```

The **actual signature** in `apps/web/server/services/scopedMemoryService.ts` line 280 is:
```typescript
export async function retrieveForPrompt(
  tenantId: string,
  assistantId: string,
  runId: string | null,
  roomId: string | null,
  teamId: string | null,
  query: string,
  tokenBudget: number,
  embedding?: number[],
): Promise<MemorySearchResult[]>
```

The signature matches — **but the scopes built inside `retrieveForPrompt` do NOT include a `user` scope**. It builds scopes from `agent`, `run`, `room`, `team` only. A plain chat conversation has none of these — `assistantId` would need to be the persona or assistant profile ID, not a user ID.

For a standard chat conversation without an active persona/room/team, `retrieveForPrompt()` will return 0 results because there are no matching scopes. The spec must define what `assistantId`, `runId`, `roomId`, `teamId` values are passed for a regular (non-agency) chat conversation, and must confirm whether a `user` scope is added explicitly or handled by extending `retrieveForPrompt()` with a `userId` parameter.

**Risk:** Silent zero-result retrieval for all standard chat users. The fallback to L2 would always trigger, but L1 (extracted facts) would never actually be queried under user scope.

**Fix required:** Either extend `retrieveForPrompt()` to accept an optional `userId` scope, or call `searchMemories()` directly with `{ type: "user", id: String(userId) }` in the scope list.

---

### C-02 — `buildChatContext()` second implementation in `memoryService.ts` is not mentioned

**Location:** Section 16 (Modified Files)

The agent memory from prior reviews documents that a second implementation of `buildChatContext()` exists at `apps/web/server/services/memoryService.ts`. The MEMORY.md index for this agent explicitly records that **`memoryService.ts` line 668 has a second implementation** that must be updated alongside the primary one at line 1677.

The spec's Section 16 lists only one `memoryService.ts` change entry ("Wire 2-level vector search into `buildChatContext()`, revise `processConversationMemory()`") with no mention of the second implementation. If only the primary function is updated, the second call path will continue using the old full-dump entity retrieval, creating split behavior depending on which code path is invoked.

**Fix required:** Section 16 must explicitly call out that both `buildChatContext()` implementations in `memoryService.ts` require updates. The `channelGateway.ts` (line 381) and `memory.ts` router (line 179) call sites must also be verified after the signature change.

---

### C-03 — `/api/v1/embeddings` endpoint does not exist in the Python backend

**Location:** Sections 9.1, 9.2, 6.3

The spec designs a new FastAPI endpoint at `python-backend/app/api/v1/embeddings.py` and calls it from `generateQueryEmbedding()`. A grep of `python-backend/` for `/api/v1/embeddings` returns **no results** — this endpoint does not yet exist.

The spec lists this file under "New Files" in Section 16, so its creation is intended. However, the embedding logic it describes must route through the correct internal `EmbeddingService` class. The Python backend actually has **two different embedding service implementations**:

- `python-backend/app/services/embedding_service.py` — abstract provider with `LocalMiniLMEmbedding` (384-dim) and OpenAI providers. Its primary interface uses synchronous `embed_text()` / `embed_texts()` methods.
- `python-backend/app/orchestrator/vector_store/embedding_service.py` — async `embed()` / `embed_batch()` methods, supports OpenAI text-embedding-3-small at 1536 dims.

`memory_embedding.py` imports from `app.services.embedding_service` (the first one). The spec's new endpoint calls `embedding_service.embed(text=..., model="text-embedding-3-small")` — this `embed()` method does not exist on `app.services.embedding_service.EmbeddingService`. It exists on the orchestrator's version.

The spec must specify which class the new endpoint instantiates. Using the wrong one produces 384-dim vectors that cannot be stored in the 1536-dim `scoped_memories.embedding` column — a silent dimension mismatch that pgvector will reject at query time with a cryptic error.

**Fix required:** The new `embeddings.py` endpoint must import from `app.orchestrator.vector_store.embedding_service` (the async, 1536-dim version), not from `app.services.embedding_service`. The spec should name the exact import path.

---

### C-04 — Archive file encryption creates a gap: single IV per file vs per record

**Location:** Section 3.4, Section 12.1

The spec states: "Files encrypted at rest using `LLM_ENCRYPTION_KEY` (AES-256-GCM)" and "Each file has unique IV (prepended to file content)."

This is architecturally inconsistent. Archive files are **append-only JSONL** — new records are appended to the same file all day. If encryption uses a single IV per file, one of two things happens:
1. The file is encrypted/decrypted as a single block, making append-only impossible (you must decrypt the full file, append, re-encrypt with the same IV — IV reuse breaks AES-GCM security).
2. Each append operation uses a new IV per record, making the "single IV prepended to file content" description wrong.

The spec does not define the encryption unit (per-file vs per-record). Given the append-only requirement, the only correct approach is per-record encryption (each JSON line has its own IV+authTag+ciphertext), which differs from the Node.js `crypto.ts` `encrypt()` function's output format that is designed for single-value encryption.

Section 3.2 states files rotate when they exceed 50MB. If the whole file is one ciphertext block, you cannot partially read it or verify integrity of individual records — any archive corruption corrupts all records in that day's file.

**Fix required:** Section 12.1 and 3.4 must define the encryption unit explicitly. The correct design is per-record encryption (each JSONL line is independently encrypted/decrypted). The service API signature for `archiveMessage()` must encrypt each record using `encrypt()` from `crypto.ts` before appending.

---

## HIGH Issues

### H-01 — `processConversationMemory()` integration not specified

**Location:** Section 5.4, Section 16

`processConversationMemory()` in `memoryService.ts` (line 2087) is the existing entry point for the summarization pipeline. The spec says to revise it, but Section 5.4's "Summarization Flow (Revised)" only describes the new gate logic without specifying at which line in `processConversationMemory()` each new step is inserted.

The existing function: checks `needsSummarization()`, fetches messages, calls an LLM directly for summarization, then does entity extraction. The spec adds 4 new steps before summarization (archive, fact extract, classify, gate). The spec does not state:
- Whether the archive step replaces or precedes the existing entity extraction
- Whether the new `smartSummarizer.ts` replaces the current inline LLM call in `processConversationMemory()` or is called from it
- How to handle the case where the feature flag `chat_smart_summarize_enabled` is OFF — does `processConversationMemory()` skip all new steps or only the gate?

Without this, the implementor will need to reverse-engineer the integration from scratch.

---

### H-02 — Chunking idempotency check is fragile

**Location:** Section 4B, `indexMessageChunks()` pseudocode

The spec's `findExistingChunk(conversationId, chunk.messageRangeStart, chunk.messageRangeEnd)` check for idempotency assumes `messageRangeStart + messageRangeEnd` uniquely identifies a chunk. However, due to the sliding window with 50-token overlap, two different chunking runs over the same messages can produce different range boundaries depending on whether the overlap text falls on a message boundary or mid-message. If `indexMessageChunks()` is called twice (e.g., on retry after a partial failure), chunks may be duplicated if the range boundaries differ by even one message ID.

A stronger idempotency key is needed: a hash of the chunk content, or a compound key of `(conversationId, chunkIndex)`. The `chunkIndex` column is already in the schema and would be a safer dedup key.

Additionally: what happens if `indexMessageChunks()` is called with a subset of messages (e.g., only the new message pair) but the overlap logic pulls in message IDs from the previous chunk? The `messageRangeStart` of the new chunk may overlap with the `messageRangeEnd` of the previous chunk. The spec does not explain how to avoid inserting a near-duplicate chunk that shares 50 tokens with the previous one.

---

### H-03 — Budget percentage math does not add up

**Location:** Section 6.6

The context budget allocation table states:
- System Prompt: uncapped
- Rules: uncapped
- L1 Extracted Facts: 20%
- L2 Message Chunks: 10%
- Safe Summaries: 15%
- Buffer Messages: 50%
- Visual Memory: 5%

20 + 10 + 15 + 50 + 5 = **100%** of the remaining budget after system prompt and rules. This leaves zero headroom for variance — any section that overruns its allocation cuts another section to zero.

The note at the bottom says "Percentages are of remaining budget after system prompt + rules" and that "when L1 returns >= threshold, L2 budget (10%) is redistributed to buffer." But there is no mechanism for what happens when summaries exceed 15%, or when the system prompt alone consumes most of the model's context window (e.g., a 2K-token system prompt on a model with 4K context).

The existing `memoryService.ts` handles this via the `used` accumulator that short-circuits each section. The spec's `mergeAndDedup()` pseudocode does implement a running `used` counter, but `mergeAndDedup()` only handles the memory/chunk sections. Summaries and buffer messages are assembled separately in `buildChatContext()`. The spec does not describe how the summary (15%) and buffer (50%) budget caps are enforced in the new flow — the current code uses a `summaryPct` and `bufferPct` variable that would need updating.

---

### H-04 — `memoryKindEnum` does not include all spec-required kinds

**Location:** Section 4.2 (Fact Categories), Section 4.5 (`createMemory()` call)

The spec's extraction pipeline maps facts to these `memoryKind` values:
- `decision`, `rule`, `fact`, `preference`, `checklist`, `artifact_note`, `note`

The actual `memoryKindEnum` in `schema.ts` line 6844 is:
```
"fact", "rule", "preference", "decision", "note",
"checklist", "artifact_note", "handoff_note", "episode"
```

The kind `note` is present but the spec uses it for "Credentials/Config" category. This is a valid enum value so there is no issue there. However, the `mapCategoryToKind()` function referenced in Section 4.5 is never defined anywhere in the spec. This mapping is non-trivial (7 input categories → valid enum values) and must be explicitly specified to avoid implementors guessing or using invalid enum strings that fail at the database level.

---

### H-05 — No authentication on the internal `/api/v1/embeddings` endpoint

**Location:** Section 9.1

The spec describes a new FastAPI endpoint at `/api/v1/embeddings` and notes it is "NOT exposed via Nginx — internal only (localhost:8000)." However, there is no mention of authentication or rate limiting on this endpoint.

Any process with access to `localhost:8000` can call this endpoint. On the production server, Celery workers, the web app, and any local process all share this interface. The spec should specify whether this endpoint requires a shared secret (e.g., `SMARTSPEC_WEB_GATEWAY_TOKEN` already used in other internal endpoints) or at minimum an IP whitelist (`127.0.0.1` only in FastAPI router).

Without this, if the Python backend is ever accidentally exposed or the Nginx config is misconfigured, the embedding endpoint becomes an unauthenticated OpenAI token-spending API.

---

### H-06 — BullMQ `embeddingQueue` is not defined in the spec

**Location:** Sections 4.4, 4B.4, 9.3, 9.4

The spec references `embeddingQueue.add(...)` and `embeddingQueue.process(...)` throughout but never specifies:
- Queue name (used as Redis key prefix)
- Which file exports the `embeddingQueue` instance
- Whether this is a new BullMQ queue or reuses an existing one
- Concurrency setting for the worker
- Worker startup — is `embeddingWorker.ts` registered as a standalone process, or imported into the main web server startup?

If the embedding worker runs in the same Node.js process as the web server, a crash in the worker affects chat. If it runs separately, the spec must describe how it is started (e.g., a new `systemd` service or a new `screen` session in `run-services.sh`).

Section 16 lists `embeddingWorker.ts` as a new file but provides no guidance on how it is wired into the service startup. This is an infrastructure gap that blocks deployment.

---

### H-07 — Archive cleanup Celery task: no mention of tenant-level retention override

**Location:** Section 3.4, Section 4B.5

Both sections say retention is "90 days (configurable per tenant via `system_settings`)." The `cleanupExpiredArchives()` service function signature takes a single `retentionDays: number` parameter — it does not accept per-tenant configuration.

Either the cleanup function needs to be called once per tenant with that tenant's configured retention, or it needs to query `system_settings` internally. The Celery task that calls it is never defined. If the Celery task passes a global `retentionDays = 90` value, tenant-level configuration is silently ignored.

---

### H-08 — `message_chunks` table schema: missing `tenantId` NOT NULL constraint alignment

**Location:** Section 4B.3

The spec defines `messageChunks.tenantId` as `varchar("tenantId", { length: 36 }).notNull()`. This matches the `scoped_memories.tenantId` convention (VARCHAR(36), not UUID type) — which is correct per the schema safety rules in agent memory.

However, `messageChunks.userId` is defined as `integer("userId").notNull().references(() => users.id, { onDelete: "cascade" })`. No FK for `tenantId` is specified. The `tenants.id` is VARCHAR(36) — adding a FK constraint on `messageChunks.tenantId` would require `REFERENCES tenants(id)`. The spec does not include this FK, meaning there is no referential integrity enforcing that `tenantId` is a valid tenant. This is consistent with how `scoped_memories.tenantId` is defined (no FK there either), so the spec is internally consistent — but it is worth a note that tenant isolation relies entirely on application-level enforcement, not a DB constraint.

More critically: the spec lists `messageChunks` as having no `updatedAt` column. The `cleanupExpiredArchives()` deletes chunks where `createdAt < now - retention`. This is correct. But the spec says chunks are "immutable once created" — yet Section 9.4's `embeddingWorker.ts` updates the `embedding` column via `db.update(messageChunks).set({ embedding })`. An `updatedAt` column would correctly track when the embedding was added; without it, there is no way to distinguish "chunk created, embedding pending" vs "chunk created, embedding stored." This makes it impossible to write a cleanup query that finds orphaned un-embedded chunks (e.g., BullMQ job failed permanently).

---

## MEDIUM Issues

### M-01 — Embedding API down: no fallback in `generateQueryEmbedding()`

**Location:** Section 6.3

`generateQueryEmbedding()` returns `undefined` when the Python backend is unavailable. Section 6.1's new flow passes this to `retrieveForPrompt()` which accepts `embedding?: number[]`. When undefined, `searchMemories()` in `scopedMemoryService.ts` sets `hasVector = false` and falls back to keyword-only search. This is safe.

However, `indexMessageChunks()` queues the chunk for embedding via BullMQ regardless of backend availability. If the Python backend is down for an extended period, the BullMQ queue accumulates embedding jobs. When the backend returns, all queued jobs run simultaneously. The spec does not define a maximum queue depth, job TTL, or what happens to chunks that permanently fail embedding (e.g., the Python backend's OpenAI key is invalid). After 3 retry attempts (specified in the backoff config), BullMQ marks jobs as failed. The spec does not describe how failed-embedding chunks are handled — they remain in `message_chunks` with `embedding = NULL` and are never retrievable via vector search (they will appear in BM25/keyword results only).

A `cleanup-failed-embeddings` maintenance task or alert should be specified.

---

### M-02 — Smart summarization gate classification prompt: language mismatch

**Location:** Section 5.3

The classification prompt is in English. The system supports Thai-language conversations heavily (evident from `memoryService.ts` keyword arrays in Thai). The LLM is asked to classify Thai-language conversation segments using English category labels. This will work for most models but the spec should note whether the same classification prompt is used for both Thai and English conversations, or whether language-adaptive prompting is needed.

---

### M-03 — Cross-conversation Level 2 search: left as Open Question but affects schema design

**Location:** Open Question 7, Section 6.2

Open Question 7 asks whether chunks from other conversations in the same project should be searchable. The answer materially affects the `message_chunks` schema design: if cross-conversation search is added later, a GIN index on `projectId` will be needed. If it is in-scope for this feature, it should be resolved now before schema is finalized. Leaving it open risks a schema change after HNSW index creation — adding a new index to a large table in production requires `CONCURRENTLY` and a maintenance window.

Recommendation: Resolve this before implementation starts. The schema should include `projectId` indexing if cross-conversation search is planned within 6 months.

---

### M-04 — `memory_archive_metadata` table: `fileSizeBytes` is `integer`, not `bigint`

**Location:** Section 8.4

`fileSizeBytes: integer("fileSizeBytes").notNull().default(0)` — PostgreSQL `integer` is 32-bit signed, max ~2.1 GB. The spec allows archive files up to 50 MB each with up to 365 files per conversation, and a 500 MB per-user total limit. For the per-file size this is fine (50MB << 2.1GB). However, if a future requirement extends this limit or if the column is reused to track cumulative size, `integer` will overflow silently. Should be `bigint` to future-proof.

---

### M-05 — Deduplication uses content prefix match only (`content.slice(0, 100)`)

**Location:** Section 6.4 (`mergeAndDedup()`)

The dedup check uses `result.memory.content.slice(0, 100)` as the `seenContent` key. Two distinct facts whose first 100 characters are identical (e.g., two decisions that both start with "ตัดสินใจ...") will be incorrectly deduplicated, silently dropping one. A stronger key (e.g., `memoryId` or a hash of full content) would eliminate false positives.

---

### M-06 — Backfill migration SQL uses `COALESCE(u.tenantId, 'default')`

**Location:** Section 14.2

The optional backfill script uses `COALESCE(u.tenantId, 'default')` for `tenantId`. However, `users.tenantId` in the schema may be `currentTenantId` (a different column name — the agent memory records that `conversations` has no `tenantId` column and that tenant isolation goes through `users.currentTenantId`). Using the wrong column name here silently assigns all migrated memories to the wrong tenant or defaults them to `'default'` which is not a valid `tenants.id`.

The backfill script column reference must be verified against the actual `users` table schema before the script is documented as valid.

---

### M-07 — HNSW index rebuild strategy: "Weekly Celery task" is unspecified

**Location:** Section 7.3

"Rebuild: Weekly Celery task (low-traffic hours)" — no Celery task is defined, no task name, no schedule, no file location. HNSW index rebuild on a large `message_chunks` table (e.g., 1M rows, 15ms query time per spec) is a long-running operation that will cause write lock contention. `REINDEX CONCURRENTLY` should be used. The spec should note that the rebuild task should use `REINDEX INDEX CONCURRENTLY`, not `DROP INDEX + CREATE INDEX`.

---

### M-08 — No tRPC router procedures defined for the new archive/chunk operations

**Location:** Section 16 (Modified Files: `routers/memory.ts`)

The spec says to add "archive endpoints, fact extraction + chunk triggers" to `memory.ts` but defines no tRPC procedure signatures, no Zod input schemas, and no authorization requirements for these endpoints. This is a recurring gap pattern noted in previous spec reviews for this project: tRPC procedure definitions are deferred to "handle during build" and consistently cause integration rework.

At minimum, the spec should define:
- `memory.getArchive`: inputs (conversationId, dateRange), output shape, auth requirement
- `memory.searchArchive`: inputs (query, limit), output shape
- Whether fact extraction is triggered from the router or only from `processConversationMemory()`

---

## Suggestions for Improvement

### S-01 — Resolve Open Question 2 (local filesystem vs S3/R2) before Phase 0

The archive design in Section 3.2 uses a local path (`apps/web/data/memory-archives/`). Open Question 2 defers the decision to later. Phase 0 deploys file archival immediately. If this decision is changed to S3/R2 after Phase 0, it requires a data migration of all existing archives plus changes to the service API. Resolve this before Phase 0 implementation.

### S-02 — Define `mapCategoryToKind()` explicitly

Section 4.5 calls `mapCategoryToKind(fact.category)` but never defines the mapping. Add a lookup table in the spec:

| Extraction Category | memoryKindEnum value |
|---------------------|---------------------|
| decision | decision |
| rule | rule |
| fact | fact |
| preference | preference |
| checklist | checklist |
| artifact_note | artifact_note |
| note | note |

### S-03 — Add `messageChunks` to `retrieveForPrompt` callers list

The agent memory records all callers of `buildChatContext()` that must be updated for signature changes. Similarly, all callers of `processConversationMemory()` should be audited before modifying its behavior, since the new archive/extract/gate steps add significant latency to what was previously a lightweight async operation.

### S-04 — Specify whether embedding cost debits user credits or is platform-absorbed

Open Question 1 on embedding cost should be resolved before Phase 1a, not left open. If embedding is platform-absorbed, the cost tracking audit requirement changes. If it debits user credits, the credit deduction must be wired into the BullMQ worker (after embedding completes, not before), and the pre-reserve + refund pattern from `sandbox/costEstimator.ts` should be reused.

### S-05 — The existing Python RAG pipeline (`python-backend/app/orchestrator/rag/`) should be cross-referenced

The spec designs a new chunking strategy from scratch (`messageChunkerService.ts`) without referencing the existing `SmartChunker` in `python-backend/app/orchestrator/rag/chunker.py`. The existing chunker uses tiktoken for token-accurate splitting, handles markdown/code boundaries, and implements parent-child chunk patterns. The new spec's chunker uses `Math.ceil(line.length / 4)` character-based token estimation (CHARS_PER_TOKEN = 4).

This divergence means the same content will produce different chunk sizes depending on which chunker is used, and the character-based estimator in the spec (4 chars/token) is systematically inaccurate for Thai-language content (Thai characters are typically 1 token each but 3 bytes). Consider whether the TypeScript chunker should delegate to the Python SmartChunker via the internal API, or at minimum use the same token estimation strategy.

---

## Consistency Checks

| Item | Finding |
|------|---------|
| Section 4.2 lists `artifact_note` as a category | `memoryKindEnum` includes `artifact_note` — consistent |
| Section 5.5 adds `skippedRiskyCount`, `extractedFactIds`, `hasRawArchive`, `classificationStats` to `conversation_summaries` | Existing schema has no these columns — migration required, spec is correct |
| Section 8.4 `memory_archive_metadata.userId` → `users.id` cascade | Users table `id` is `serial` (integer) — FK type is integer, consistent |
| Section 4.5 `updateMemory()` updates `reinforcementCount` | `scopedMemories.reinforcementCount` exists in schema — consistent |
| Section 6.2 `searchMessageChunks` uses `messageChunks.embedding <=> vector(1536)` | `message_chunks` uses `vector1536` custom type — consistent |
| `L1_THRESHOLD = 3` in Section 6.1 vs alert threshold "> 60% L2 trigger rate" in Section 13.2 | Consistent — 3 results threshold determines when L2 fires |
| Section 14.2 backfill: `e.entityType WHEN 'rule'` — `entityTypeEnum` includes `rule` | Consistent |
| `memoryArchiveMetadata.conversationId` → `conversations.id` cascade | `conversations.id` is serial (integer) — consistent |

---

## Pre-Implementation Checklist

Before writing any code, these must be resolved:

- [ ] **C-01**: Clarify how `retrieveForPrompt()` is called for standard chat (what `assistantId`/scope is used for a regular userId)
- [ ] **C-02**: Confirm both `buildChatContext()` implementations in `memoryService.ts` are in scope for this change
- [ ] **C-03**: Specify that the new `embeddings.py` imports from `app.orchestrator.vector_store.embedding_service`, not `app.services.embedding_service`
- [ ] **C-04**: Define encryption unit as per-record (not per-file) and update Sections 3.4 and 12.1
- [ ] **H-05**: Add `SMARTSPEC_WEB_GATEWAY_TOKEN` auth header requirement to `/api/v1/embeddings`
- [ ] **H-06**: Define `embeddingQueue` BullMQ instance location, name, concurrency, and worker startup method
- [ ] **S-01**: Decide local filesystem vs S3 before Phase 0
- [ ] **S-04**: Decide embedding credit accounting before Phase 1a
