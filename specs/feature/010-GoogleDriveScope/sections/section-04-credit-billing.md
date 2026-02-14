Now I have a thorough understanding of the codebase. Let me generate the section content.

# Section 04: Unified Credit Billing -- Fix Gaps + New Operations

## Overview

This section implements credit billing for **all** operations that consume API resources, fixing existing revenue leaks in the library upload indexing and RAG query paths, and adding billing formulas for new Google Drive operations. It also adds idempotent charging infrastructure, admin-configurable pricing, and a pre-flight cost estimation function.

**Dependencies:**
- **section-02-database-schema** must be completed first (provides the `idempotency_key` column on `credit_transactions` and the `user_credit_budgets` table).

**Blocks:**
- **section-05-budget-protection** (extends `deductCredits` with budget tracking)
- **section-08-virtual-references** (uses `gdrive.index` billing)

---

## Background and Context

### Current State of Credit Billing

The existing credit service lives at `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`. It provides:

- `deductCredits(params)` -- atomic deduction with `UPDATE ... SET credits = credits - amount WHERE credits >= amount` to prevent TOCTOU races
- `addCredits(params)` -- atomic addition
- `refundCredits(params)` -- calls `addCredits` with `type: "refund"`
- `deductCreditsForModel(params)` -- LLM-specific billing using dynamic DB pricing or hardcoded fallback
- Pricing: 1 credit = $0.001 USD

The `DeductCreditsParams` interface currently accepts `userId`, `amount`, `description`, and optional `metadata`. The `metadata` field is typed as a `Record` with optional `model`, `provider`, `tokensUsed`, `costUsd`, `endpoint`, `traceId`, and arbitrary additional keys.

### Revenue Leaks to Fix

1. **Library upload indexing** -- When `process_library_index_job` in `/home/dev/projects/SmartSpecPro/python-backend/app/services/library_indexing_service.py` completes, it creates chunks and upserts embeddings but **never charges credits**. The completion path logs `library_index_job_completed` with `chunk_count` but no credit deduction occurs.

2. **Markdown save + re-indexing** -- When a user saves an edited markdown file in the library, a re-index job is enqueued via the library router at `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.ts`, but no credits are charged for the re-indexing work.

3. **RAG semantic search** -- The hybrid RAG engine at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py` supports `SearchMode.SEMANTIC`, `HYBRID`, and `FAST` modes which invoke embedding queries, but none of these are billed. BM25-only (`SearchMode.KEYWORD`) should remain free.

4. **RAG chat context** -- When chat uses RAG to retrieve context for LLM prompts, the retrieval operation consumes embedding API resources but is not billed separately from the LLM call itself.

### System Settings Category

The `settingCategorySchema` in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts` currently allows: `"stripe"`, `"invoice"`, `"email"`, `"general"`, `"oauth"`, `"ai"`, `"telegram"`, `"vectordb"`. This section adds `"credit_pricing"` to this enum.

---

## Tests First

### Vitest Tests -- Credit Billing Infrastructure

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.test.ts`

Add the following test cases to the existing test file. These tests validate the idempotent charging extension and the new service-tagged deduction functions.

```
# Test: deductCredits with idempotencyKey succeeds on first call
#   - Call deductCredits with idempotencyKey: "idx-job-42"
#   - Assert transaction is created with idempotencyKey stored
#   - Assert credits are deducted from user balance

# Test: deductCredits with duplicate idempotencyKey is a no-op (returns original transaction)
#   - Call deductCredits with idempotencyKey: "idx-job-42" twice
#   - First call should succeed and return transactionId
#   - Second call should return the same transactionId without deducting again
#   - Verify user balance only decreased once

# Test: deductCredits without idempotencyKey still works (backward compatible)
#   - Call deductCredits with no idempotencyKey
#   - Assert transaction is created normally
#   - Verify existing callers (LLM billing) are not broken

# Test: library upload index job charges ceil(chunk_count) * 2 credits on completion
#   - Mock a completed index job with chunk_count=7
#   - Call chargeForIndexing with chunkCount=7
#   - Assert deductCredits is called with amount=14 (ceil(7)*2)
#   - Assert metadata.service is "library.upload_index"

# Test: library upload index job tags transaction with service="library.upload_index"
#   - Call chargeForIndexing
#   - Verify the credit transaction metadata contains { service: "library.upload_index" }

# Test: markdown save re-index charges credits with service="library.save_reindex"
#   - Call chargeForIndexing with service="library.save_reindex"
#   - Assert metadata.service is "library.save_reindex"

# Test: chargeForIndexing with idempotencyKey prevents double-charge
#   - Call chargeForIndexing twice with same idempotencyKey
#   - Assert only one deduction occurs
```

### Vitest Tests -- System Settings Extension

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.test.ts` (create if not exists, or add to existing)

```
# Test: settingCategorySchema accepts "credit_pricing" as valid category
#   - Parse "credit_pricing" through the schema
#   - Assert it succeeds (no ZodError)

# Test: credit_pricing settings can be saved and retrieved by admin
#   - Call updateSetting with category="credit_pricing", key="costPerChunk", value="2"
#   - Call getSetting with same category/key
#   - Assert returned value is "2"
```

### pytest Tests -- RAG Billing

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_rag_billing.py` (new file)

```
# Test: semantic search charges 1 credit per query with service="rag.semantic_search"
#   - Mock the credit deduction internal API call
#   - Execute a search with mode=SEMANTIC or HYBRID
#   - Assert credit deduction was called with amount=1 and metadata.service="rag.semantic_search"

# Test: BM25-only search does not charge credits
#   - Execute a search with mode=KEYWORD
#   - Assert no credit deduction call was made

# Test: RAG chat context charges credits with service="rag.chat_context"
#   - Mock the credit deduction internal API call
#   - Execute a RAG context retrieval for chat
#   - Assert credit deduction was called with metadata.service="rag.chat_context"
```

### pytest Tests -- Drive Billing Formulas

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_drive_billing.py` (new file)

```
# Test: gdrive.index charges ceil(chunk_count) * 2 credits
#   - calculate_drive_index_cost(chunk_count=7) returns 14
#   - calculate_drive_index_cost(chunk_count=1) returns 2
#   - calculate_drive_index_cost(chunk_count=0) returns 0

# Test: gdrive.mcp_read charges max(1, ceil(text_length / 2000)), capped at 5
#   - calculate_mcp_read_cost(text_length=100) returns 1
#   - calculate_mcp_read_cost(text_length=2000) returns 1
#   - calculate_mcp_read_cost(text_length=2001) returns 2
#   - calculate_mcp_read_cost(text_length=10000) returns 5 (cap)
#   - calculate_mcp_read_cost(text_length=20000) returns 5 (cap)

# Test: gdrive.mcp_sheet charges max(1, ceil(cells / 500)), capped at 3
#   - calculate_mcp_sheet_cost(cells=100) returns 1
#   - calculate_mcp_sheet_cost(cells=500) returns 1
#   - calculate_mcp_sheet_cost(cells=501) returns 2
#   - calculate_mcp_sheet_cost(cells=1500) returns 3 (cap)
#   - calculate_mcp_sheet_cost(cells=5000) returns 3 (cap)

# Test: search_drive_files does not charge credits
#   - Verify no billing function is invoked for search operations

# Test: list_drive_folder does not charge credits
#   - Verify no billing function is invoked for list operations

# Test: post-deduct refund on failure creates refund transaction
#   - Simulate a successful charge followed by operation failure
#   - Assert refundCredits is called with the original transactionId
#   - Assert refund transaction has type="refund" and metadata.reason="operation_failed"
```

---

## Implementation Details

### 1. Extend `deductCredits` with Idempotency Key Support

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`

Extend the `DeductCreditsParams` interface to accept an optional `idempotencyKey: string` field.

Inside `deductCredits()`:

1. **Redis fast-path check:** Before starting the DB transaction, check Redis for the idempotency key. Use `getRedisClient()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/redis.ts`. Key pattern: `credit:idemp:{idempotencyKey}`. If found, return the cached transaction result (stored as JSON in Redis).

2. **DB uniqueness safety net:** Inside the transaction, after inserting into `credit_transactions`, the unique index on `idempotency_key` (added in section-02) provides final dedup. Catch the unique constraint violation and treat it as a no-op -- query the existing transaction by idempotency key and return it.

3. **Cache the result:** After successful insert, set the Redis key with the transaction result as JSON, with a 24-hour TTL (`EX`, 86400 seconds).

4. **Backward compatibility:** When `idempotencyKey` is `undefined`, skip all idempotency logic entirely. The existing behavior is fully preserved.

The insert into `credit_transactions` should include the new `idempotencyKey` column value when provided. The column is nullable (from section-02), so existing inserts without it continue to work.

### 2. Create Service-Tagged Billing Functions

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`

Add new exported functions for service-specific billing. These are thin wrappers around `deductCredits` that enforce the correct service tag in metadata.

```typescript
/**
 * Charge credits for library indexing (upload or re-index).
 * Formula: ceil(chunkCount) * costPerChunk (default 2)
 */
export async function chargeForIndexing(params: {
  userId: number;
  chunkCount: number;
  service: "library.upload_index" | "library.save_reindex" | "gdrive.index" | "gdrive.reindex";
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}): Promise<{ creditsUsed: number; transactionId: number }>
```

The function should:
- Look up `costPerChunk` from system settings (category `credit_pricing`, key `costPerChunk`), falling back to default of 2 if not configured.
- Calculate `amount = Math.ceil(chunkCount) * costPerChunk`.
- If `amount <= 0`, skip deduction and return `{ creditsUsed: 0, transactionId: 0 }`.
- Call `deductCredits` with the amount, the service tag in `metadata.service`, and the optional `idempotencyKey`.

```typescript
/**
 * Charge credits for a RAG query (semantic/hybrid search).
 * Fixed cost per query (default 1 credit). BM25-only is free.
 */
export async function chargeForRagQuery(params: {
  userId: number;
  service: "rag.semantic_search" | "rag.chat_context";
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}): Promise<{ creditsUsed: number; transactionId: number }>
```

This function should look up `ragQueryCost` from system settings (category `credit_pricing`, key `ragQueryCost`), defaulting to 1.

```typescript
/**
 * Pre-flight estimation: estimate indexing cost without charging.
 */
export function estimateIndexingCost(fileCount: number, totalSizeBytes: number): {
  estimatedChunks: number;
  estimatedCredits: number;
  costPerChunk: number;
}
```

Estimation heuristic: assume ~500 characters per chunk (matching the existing library chunking in the Python backend), so `estimatedChunks = Math.ceil(totalSizeBytes / 500)`. Multiply by `costPerChunk` for total credits. This is a rough estimate shown to users before they start syncing.

### 3. Add Drive Billing Formula Functions (Python)

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/drive_billing.py`

Pure functions for calculating Drive operation costs. These are used by MCP handlers and the indexing pipeline in later sections.

```python
def calculate_drive_index_cost(chunk_count: int, cost_per_chunk: int = 2) -> int:
    """Calculate credits for indexing a Drive file. Formula: ceil(chunk_count) * cost_per_chunk."""

def calculate_mcp_read_cost(text_length: int, max_cost: int = 5) -> int:
    """Calculate credits for reading a Drive file via MCP. Formula: max(1, ceil(text_length / 2000)), capped at max_cost."""

def calculate_mcp_sheet_cost(cell_count: int, max_cost: int = 3) -> int:
    """Calculate credits for reading a spreadsheet via MCP. Formula: max(1, ceil(cell_count / 500)), capped at max_cost."""
```

These functions accept the cap/cost parameters so they can be overridden by admin-configured pricing (passed in from system settings when called).

### 4. Fix Revenue Leak: Library Upload Indexing

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/library_indexing_service.py`

In the `process_library_index_job` function, after the successful completion path (where `library_index_job_completed` is logged and `chunk_count` is known), add a credit billing call.

The Python backend needs to call the Node.js credit service. There are two approaches:

**Approach A (recommended):** Make an internal HTTP call from Python to the Node.js backend. The Node.js backend already exposes internal APIs. Add a new internal endpoint (see step 5 below) that the Python backend calls with `{ userId, chunkCount, service, idempotencyKey }`.

**Approach B:** Implement credit deduction directly in Python against the same PostgreSQL database. This is simpler but duplicates logic.

Use **Approach A** for consistency. The idempotency key should be `f"library-index:{job_id}"` to prevent double-charging on retries.

The billing call should be **post-deduct** (charge after success). If the billing call fails (network error, insufficient credits), log the failure but do **not** fail the indexing job -- the content is already indexed. The billing failure should be recorded for manual reconciliation.

### 5. Create Internal Credit Billing Endpoint

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Add an Express route (not tRPC -- the Python backend calls it via HTTP) at `POST /api/internal/credits/charge`. This is an internal-only endpoint authenticated by the existing internal API gateway token (`SMARTSPEC_WEB_GATEWAY_TOKEN`).

Request body schema:

```typescript
{
  userId: number;
  amount?: number;       // Direct amount (for RAG billing)
  chunkCount?: number;   // For indexing (calculates amount internally)
  service: string;       // Service tag: "library.upload_index", "rag.semantic_search", etc.
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}
```

The handler should:
- Validate the gateway token from the `Authorization` header.
- If `chunkCount` is provided, call `chargeForIndexing`.
- If `amount` is provided directly, call `deductCredits` with the service tag.
- Return `{ success, creditsUsed, transactionId }` or `{ success: false, error }`.

### 6. Fix Revenue Leak: RAG Semantic Search

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py`

In the `HybridRAGEngine.retrieve()` method, after determining the search mode, add billing logic:

- If `mode` is `SEMANTIC`, `HYBRID`, or `FAST` (any mode that uses vector embeddings), call the internal credit billing endpoint with `service="rag.semantic_search"` and `amount=1`.
- If `mode` is `KEYWORD` (BM25 only), skip billing.

The billing call should use `idempotencyKey = f"rag-search:{query_hash}:{user_id}:{timestamp_minute}"` to prevent accidental double-charges from retries while still allowing repeated intentional searches.

The RAG engine needs the `user_id` passed through its context. If the retrieve method does not currently receive user context, extend it to accept an optional `user_id` parameter. Callers that don't provide it (internal/system queries) are not billed.

### 7. Fix Revenue Leak: RAG Chat Context

The chat system retrieves RAG context before sending to the LLM. This happens in the chat flow where `buildChatContext()` fetches relevant documents. Identify the call site where RAG retrieval is invoked for chat context and add a billing call with `service="rag.chat_context"` and `amount=1`.

This is a separate service tag from `rag.semantic_search` so admins can price library browsing searches differently from chat-augmented retrieval.

### 8. Fix Revenue Leak: Markdown Save + Re-index

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts`

When a markdown file is saved and a re-index job is enqueued, the billing cannot happen at enqueue time (we don't know chunk count yet). Instead, the billing happens when the Python backend completes the index job (same path as step 4), using `service="library.save_reindex"`. The service tag is determined by the `job_type` passed when the index job is created -- extend the job creation to distinguish between initial upload indexing and save-triggered re-indexing.

### 9. Add `credit_pricing` to System Settings Category

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts`

Change the `settingCategorySchema` definition from:

```typescript
const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general", "oauth", "ai", "telegram", "vectordb"]);
```

to:

```typescript
const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general", "oauth", "ai", "telegram", "vectordb", "credit_pricing"]);
```

No other changes are needed in this file. The existing `updateSetting`, `getSetting`, and `getSettingsByCategory` mutations/queries all work with the new category.

### 10. Admin Pricing Configuration Keys

The following keys should be stored under the `credit_pricing` category in `system_settings`. They are not created by migration -- they are populated when an admin first configures pricing. Each has a hardcoded default in the billing functions.

| Key | Default | Description |
|-----|---------|-------------|
| `costPerChunk` | `2` | Credits per chunk for indexing operations |
| `ragQueryCost` | `1` | Credits per semantic/hybrid RAG query |
| `mcpReadMaxCost` | `5` | Maximum credits for `gdrive.mcp_read` |
| `mcpSheetMaxCost` | `3` | Maximum credits for `gdrive.mcp_sheet` |
| `showEstimationDialogAboveBytes` | `10485760` (10 MB) | Show cost estimation dialog for files above this size |

### 11. Helper: Load Pricing from System Settings

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`

Add a helper function to load pricing config from system settings with fallback defaults:

```typescript
async function getCreditPricingConfig(): Promise<{
  costPerChunk: number;
  ragQueryCost: number;
  mcpReadMaxCost: number;
  mcpSheetMaxCost: number;
}>
```

This function queries `system_settings` for category `credit_pricing` and returns the values, falling back to hardcoded defaults for any missing keys. It should cache the result in a module-level variable with a 5-minute TTL to avoid hitting the database on every billing call.

### 12. Free Operations (No Billing)

The following operations explicitly do **not** charge credits:

- `search_drive_files` -- metadata-only Drive API call
- `list_drive_folder` -- metadata-only Drive API call
- `get_drive_file_info` -- metadata-only Drive API call
- Edit in Google (open/save-back/discard) -- uses user's own Google quota
- BM25 keyword-only search -- no embedding API calls
- File browsing and metadata viewing in the library

---

## Files Summary

### Files to Create
| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/drive_billing.py` | Pure billing formula functions for Drive operations |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_drive_billing.py` | Tests for Drive billing formulas |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_rag_billing.py` | Tests for RAG query billing |

### Files to Modify
| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts` | Add `idempotencyKey` to `DeductCreditsParams`; add Redis dedup logic; add `chargeForIndexing`, `chargeForRagQuery`, `estimateIndexingCost`, `getCreditPricingConfig` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.test.ts` | Add tests for idempotent charging, indexing billing, service tags |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts` | Add `"credit_pricing"` to `settingCategorySchema` enum |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` | Add `POST /api/internal/credits/charge` Express route |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/library_indexing_service.py` | Add credit billing call after successful `process_library_index_job` completion |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py` | Add credit billing for semantic/hybrid/fast search modes |

---

## Implementation Checklist

1. Write all tests listed above (they should fail initially).
2. Extend `DeductCreditsParams` with `idempotencyKey` and implement Redis dedup + DB constraint handling in `deductCredits`.
3. Add `chargeForIndexing`, `chargeForRagQuery`, `estimateIndexingCost`, and `getCreditPricingConfig` to `creditService.ts`.
4. Add `"credit_pricing"` to `settingCategorySchema` in `systemSettings.ts`.
5. Create `POST /api/internal/credits/charge` Express endpoint in `index.ts`.
6. Create `/home/dev/projects/SmartSpecPro/python-backend/app/services/drive_billing.py` with formula functions.
7. Modify `process_library_index_job` in the Python backend to call the internal billing endpoint on completion.
8. Modify `HybridRAGEngine.retrieve()` to bill for semantic/hybrid queries.
9. Run all tests and verify they pass.
10. Verify existing LLM billing still works (backward compatibility of `deductCredits` without `idempotencyKey`).