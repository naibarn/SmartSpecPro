No other sections written yet. Now I have all the context needed.

# Section 03: Embedding Pipeline

## Overview

This section implements the embedding generation infrastructure that powers the 2-level vector RAG system. It consists of three components:

1. **Python `/api/internal/embeddings` endpoint** -- exposes the existing `EmbeddingService` (OpenAI text-embedding-3-small, 1536-dim) as an authenticated internal HTTP API
2. **Node.js `queryEmbeddingService.ts`** -- generates embeddings for user queries at search time, with Redis caching (5min TTL, SHA-256 hash key) and graceful fallback
3. **BullMQ `embeddingQueue.ts`** -- asynchronous queue + worker for generating embeddings on `scoped_memories` and `message_chunks` records after insert

## Dependencies

- **section-01-schema-migration**: `message_chunks` and `scoped_memories` tables must exist with `embedding vector(1536)` columns
- **No dependency on**: section-02 (archive), section-04 (fact extractor), section-05 (chunker) -- those sections depend on THIS section for embedding generation

## Files to Create

| File | Description |
|------|-------------|
| `python-backend/app/api/internal/embeddings.py` | FastAPI router with single + batch embedding endpoints |
| `apps/web/server/services/queryEmbeddingService.ts` | Redis-cached query embedding client |
| `apps/web/server/services/embeddingQueue.ts` | BullMQ queue, worker, DLQ for async embedding jobs |
| `python-backend/tests/api/test_embeddings_api.py` | pytest tests for Python endpoint |
| `apps/web/server/services/__tests__/queryEmbeddingService.test.ts` | Vitest tests for query embedding service |
| `apps/web/server/services/__tests__/embeddingQueue.test.ts` | Vitest tests for BullMQ queue + worker |

## Files to Modify

| File | Change |
|------|--------|
| `python-backend/app/main.py` | Register `embeddings.router` under `/api/internal/embeddings` |
| `apps/web/server/_core/index.ts` | Import + call `initEmbeddingQueue()` at startup, `closeEmbeddingQueue()` at shutdown |

---

## Tests

### Python: `python-backend/tests/api/test_embeddings_api.py`

```
# Test: POST /api/internal/embeddings returns 401 without X-Internal-Token header
# Test: POST /api/internal/embeddings returns 401 with wrong token value
# Test: POST /api/internal/embeddings returns 200 with correct token and valid text
# Test: response body contains "embedding" key with a list of 1536 floats
# Test: text exceeding 32000 chars returns 400 with descriptive error
# Test: empty text returns 400
# Test: POST /api/internal/embeddings/batch accepts list of up to 100 texts, returns list of 1536-dim embeddings
# Test: POST /api/internal/embeddings/batch rejects payload with > 100 texts (returns 400)
```

Test approach: Use `httpx.AsyncClient` with the FastAPI `app` from `app.main`. Mock the `EmbeddingService.embed` and `EmbeddingService.embed_batch` methods to return deterministic 1536-dim vectors. Verify auth enforcement uses `secrets.compare_digest` (constant-time).

### Node.js: `apps/web/server/services/__tests__/queryEmbeddingService.test.ts`

```
# Test: getQueryEmbedding calls Python API at /api/internal/embeddings with X-Internal-Token header
# Test: getQueryEmbedding caches result in Redis with 5-min TTL using SHA-256 hash key
# Test: getQueryEmbedding returns cached embedding on cache hit (no Python API call made)
# Test: getQueryEmbedding returns undefined when Python API returns non-200 (graceful fallback)
# Test: getQueryEmbedding returns undefined when Python API is unreachable (network error)
# Test: hashQuery produces different cache keys for different query strings
# Test: hashQuery uses format "emb:v1:{sha256hex}" for cache key
```

Test approach: Mock `fetch` (global) for Python API calls. Mock Redis `get`/`setex` via `vi.mock("../redisClients")`. No real network or Redis needed.

### Node.js: `apps/web/server/services/__tests__/embeddingQueue.test.ts`

```
# Test: worker validates job payload via Zod -- rejects job with invalid type (not "scoped_memory" | "message_chunk")
# Test: worker validates job payload via Zod -- rejects job with missing recordId
# Test: worker validates job payload via Zod -- rejects job with text longer than 32000 chars
# Test: worker validates job payload via Zod -- rejects job with empty text
# Test: worker calls Python /api/internal/embeddings with correct auth header and text body
# Test: worker validates embedding response array -- all elements must pass isFinite()
# Test: worker validates embedding dimension -- must be exactly 1536 elements
# Test: worker updates scoped_memories.embedding when job type is "scoped_memory"
# Test: worker updates message_chunks.embedding when job type is "message_chunk"
# Test: worker retries on transient Python API failure (up to 3 attempts with exponential backoff)
# Test: worker throws UnrecoverableError for Zod validation failures (no retry)
# Test: worker moves permanently failed jobs to DLQ after max attempts exhausted
```

Test approach: Use `vi.mock("bullmq")` pattern matching `deliveryQueue.test.ts`. Mock `fetch` for Python API. Mock `getDb()` for Drizzle UPDATE calls. Verify the worker processor function directly.

---

## Implementation Details

### 1. Python Endpoint: `python-backend/app/api/internal/embeddings.py`

**Router prefix:** `/api/internal/embeddings`
**Tags:** `["Internal Embeddings"]`

**Auth dependency:** `_verify_internal_token` -- same pattern as `internal_guardrails.py`:
- Reads `X-Internal-Token` from request header
- Compares against `settings.SMARTSPEC_WEB_GATEWAY_TOKEN` using `secrets.compare_digest`
- Returns 401 if missing or invalid, 500 if server token not configured

**Pydantic models:**

- `EmbedRequest`: `text: str` (min_length=1, max_length=32000)
- `EmbedResponse`: `embedding: List[float]`, `dimension: int`, `model: str`
- `EmbedBatchRequest`: `texts: List[str]` (min_items=1, max_items=100, each text max_length=32000)
- `EmbedBatchResponse`: `embeddings: List[List[float]]`, `dimension: int`, `model: str`, `count: int`

**Endpoints:**

- `POST /` -- single text embedding. Instantiate `EmbeddingService` from `app.orchestrator.vector_store.embedding_service` (NOT `app.services.embedding_service` which is 384-dim local). Call `await service.embed(request.text)`. Return `EmbedResponse`.
- `POST /batch` -- batch embedding. Call `await service.embed_batch(request.texts)`. Return `EmbedBatchResponse`.

**Important:** The `EmbeddingService` requires an OpenAI API key. Resolve from `settings.OPENAI_API_KEY` (already in config). Instantiate with `EmbeddingConfig(model=EmbeddingModel.OPENAI_3_SMALL, dimension=1536)`.

**Registration in `main.py`:** Add `from app.api.internal.embeddings import router as embeddings_router` and `app.include_router(embeddings_router)`. The router prefix handles the full path.

Ensure an `__init__.py` exists at `python-backend/app/api/internal/` (may need creation if the directory is new -- check whether `internal_guardrails.py` and `internal_sandbox.py` are already in an `internal/` subdirectory or directly under `api/`).

**Note on file placement:** Existing internal endpoints (`internal_guardrails.py`, `internal_sandbox.py`) are at `python-backend/app/api/` (not in an `internal/` subdirectory). The router prefix `/api/internal/embeddings` handles path routing. Place the new file at `python-backend/app/api/internal_embeddings.py` to stay consistent with sibling files, OR at `python-backend/app/api/internal/embeddings.py` if creating a new subdirectory with `__init__.py`. The plan specifies the subdirectory path -- verify the existing layout and choose accordingly.

### 2. Node.js Query Embedding Service: `apps/web/server/services/queryEmbeddingService.ts`

**Purpose:** Generate embeddings for user search queries at retrieval time (called by `buildChatContext` and `searchMessageChunks`).

**Exports:**

- `getQueryEmbedding(text: string): Promise<number[] | undefined>` -- main function
- `hashQuery(text: string): string` -- exported for testing

**Implementation approach:**

1. Hash the query text: `emb:v1:${sha256(text)}` using Node.js `crypto.createHash("sha256")`
2. Check Redis cache via `getRealtimeClient().get(cacheKey)`
3. If cache hit: parse JSON, return `number[]`
4. If cache miss: call Python API at `${ENV.pythonBackendUrl}/api/internal/embeddings` with:
   - Method: POST
   - Headers: `{ "Content-Type": "application/json", "X-Internal-Token": ENV.webGatewayToken }`
   - Body: `JSON.stringify({ text })`
   - Timeout: 5000ms (AbortController)
5. If response OK: parse `embedding` from JSON, store in Redis with `setex(cacheKey, 300, JSON.stringify(embedding))`, return embedding
6. If any error (network, non-200, timeout): log warning, return `undefined` (graceful degradation to keyword-only search)

**Constants:**
- `CACHE_TTL_SECONDS = 300` (5 minutes)
- `CACHE_KEY_PREFIX = "emb:v1:"`
- `MAX_TEXT_LENGTH = 32000`
- `EXPECTED_DIMENSION = 1536`

**Imports:** `ENV` from `../_core/env`, `getRealtimeClient` from `./redisClients`, `crypto` from Node.js stdlib.

### 3. BullMQ Embedding Queue: `apps/web/server/services/embeddingQueue.ts`

**Pattern:** Follows `deliveryQueue.ts` exactly -- lazy init, `redis.duplicate()` per connection, DLQ, `UnrecoverableError` for permanent failures.

**Constants:**
- `QUEUE_NAME = "memory-embedding"`
- `DLQ_NAME = "memory-embedding-dlq"`
- `MAX_ATTEMPTS = 3`
- `WORKER_CONCURRENCY = 3`

**Module state:**
```
let embeddingQueue: Queue<EmbeddingJobPayload> | null = null;
let embeddingDlq: Queue<EmbeddingJobPayload> | null = null;
let embeddingWorker: Worker<EmbeddingJobPayload> | null = null;
```

**Job payload Zod schema (`embeddingJobSchema`):**
```typescript
z.object({
  type: z.enum(["scoped_memory", "message_chunk"]),
  recordId: z.string().uuid(),
  text: z.string().min(1).max(32000),
})
```
Type: `EmbeddingJobPayload = z.infer<typeof embeddingJobSchema>`

**Worker processor (`processEmbeddingJob`):**

1. Validate `job.data` with `embeddingJobSchema.safeParse()`. If invalid, throw `new UnrecoverableError("Invalid job payload: ...")` (no retry).
2. Call Python API: `POST ${ENV.pythonBackendUrl}/api/internal/embeddings` with `X-Internal-Token` header, body `{ text: payload.text }`.
3. If non-200 response: throw standard `Error` (will retry).
4. Parse response JSON, extract `embedding: number[]`.
5. Validate embedding: must be array of exactly 1536 elements, each passing `Number.isFinite()`. If invalid, throw `UnrecoverableError("Invalid embedding format")`.
6. Update database:
   - If `type === "scoped_memory"`: `UPDATE scoped_memories SET embedding = embedding WHERE id = recordId`
   - If `type === "message_chunk"`: `UPDATE message_chunks SET embedding = embedding WHERE id = recordId`
   - Use Drizzle ORM `db.update(...).set({ embedding: sql`${vectorLiteral}::vector` }).where(eq(table.id, recordId))`
7. The embedding must be formatted as a pgvector literal: `[0.1,0.2,...]` string cast to `::vector`.

**DLQ handler:** On worker `"failed"` event, if attempts exhausted or `UnrecoverableError`, add job to DLQ.

**Exports:**
- `initEmbeddingQueue(): Promise<void>` -- creates queue, DLQ, worker
- `enqueueEmbedding(payload: EmbeddingJobPayload): Promise<void>` -- adds job with `jobId: "emb-${type}-${recordId}"`
- `closeEmbeddingQueue(): Promise<void>` -- graceful shutdown of worker, queue, DLQ

**Server registration in `apps/web/server/_core/index.ts`:**
- Import: `import { initEmbeddingQueue, closeEmbeddingQueue } from "../services/embeddingQueue";`
- In startup block (near `initDeliveryQueue()`): `await initEmbeddingQueue();`
- In shutdown block (near `closeDeliveryQueue()`): `await closeEmbeddingQueue();`

---

## pgvector Literal Formatting

When writing embedding vectors to PostgreSQL via Drizzle, use the `sql` tagged template to create a proper pgvector literal:

```typescript
import { sql } from "drizzle-orm";

const vectorStr = `[${embedding.join(",")}]`;
await db.update(table).set({
  embedding: sql`${vectorStr}::vector`
}).where(eq(table.id, recordId));
```

This is the same pattern used elsewhere in the codebase for `scoped_memories.embedding` and `multimodal_memory_vectors.embedding`.

---

## Security Considerations

1. **Auth on Python endpoint:** Constant-time comparison (`secrets.compare_digest`) prevents timing attacks on the internal token.
2. **Nginx deny:** The `/api/internal/` path prefix is blocked by Nginx for external requests. Only internal (localhost) calls from the Node.js server reach the Python backend.
3. **Embedding array validation:** Every element in the embedding array is checked with `Number.isFinite()` before SQL insertion -- prevents NaN/Infinity injection into pgvector.
4. **Text length limit:** Both Python endpoint and BullMQ Zod schema enforce 32000 char max -- prevents excessive token usage and OpenAI API errors.
5. **Job payload validation:** Zod schema on BullMQ job payloads prevents poisoned jobs from executing. Invalid jobs get `UnrecoverableError` (no retry, moved to DLQ).

---

## Error Handling and Fallback

| Scenario | Behavior |
|----------|----------|
| Python backend down | `getQueryEmbedding` returns `undefined`; search degrades to keyword-only |
| OpenAI API error (Python-side) | Python returns 502; BullMQ worker retries up to 3 times with exponential backoff |
| Redis cache unavailable | `getQueryEmbedding` skips cache, calls Python directly every time |
| Invalid embedding response | `UnrecoverableError` in worker; job moves to DLQ; record keeps `NULL` embedding |
| Orphaned NULL embeddings | Reconciled by daily background task (section-09) which re-queues them |

---

## Integration Points

| Consumer | How it uses this section |
|----------|------------------------|
| section-04 (factExtractor) | Calls `enqueueEmbedding({ type: "scoped_memory", recordId, text })` after inserting a fact |
| section-05 (messageChunker) | Calls `enqueueEmbedding({ type: "message_chunk", recordId, text })` after inserting a chunk |
| section-07 (contextRetrieval) | Calls `getQueryEmbedding(userMessage)` to generate query vector for L1/L2 search |
| section-09 (backgroundTasks) | Re-queues orphaned NULL embedding records via `enqueueEmbedding()` |