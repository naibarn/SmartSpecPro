Now I have all the context I need. Let me generate the section content.

# Section 02: Scope Propagation

## Overview

This section implements **Phase 0.4-0.6** of the RAG Maturity Upgrade plan: scope propagation to vector stores, integration of scope recomputation hooks into the Node.js `libraryService.ts`, migration safety for the `allowed_scopes` column with backfill, and cross-tenant isolation integration tests.

When a `library_permissions` record is created, updated, or deleted in the web app, the `allowed_scopes` array on the corresponding `libraryItems` and `libraryChunks` rows must be recomputed and propagated to all vector store backends (pgvector, ChromaDB, Cloudflare Vectorize). Cached RAG results must also be invalidated to prevent stale access.

**Depends on:** Section 01 (ACL Schema and Scopes) -- which provides the `allowed_scopes` column on `libraryItems` and `libraryChunks`, the `compute_effective_scopes()` function, the `recompute_allowed_scopes()` function in `scope_engine.py`, the fixed cache key in `hybrid_rag.py`, and the Python/Drizzle schema changes.

**Blocks:** Section 04 (Hybrid Search) -- which relies on `allowed_scopes` being correctly propagated and kept in sync for scope-aware retrieval filtering.

---

## Tests First

All new test files go under `python-backend/tests/orchestrator/rag/`. The Node.js hook logic in `libraryService.ts` should be verified via integration tests that confirm end-to-end scope propagation after permission CRUD operations.

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_scope_propagation.py`

```python
"""Tests for scope propagation to vector stores on permission changes."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Test: sharing a document updates allowed_scopes on item AND all its chunks
# - Create a LibraryItem with allowed_scopes=["u:1"]
# - Simulate adding a library_permissions record for group g:10
# - Call propagate_scopes() for that item
# - Assert item.allowed_scopes now contains "g:10"
# - Assert ALL chunks for that item also have "g:10" in allowed_scopes

# Test: unsharing a document removes scope from item AND all its chunks immediately
# - Start with item allowed_scopes=["u:1", "g:10"]
# - Simulate deleting the library_permissions record for g:10
# - Call propagate_scopes() for that item
# - Assert "g:10" is gone from item.allowed_scopes
# - Assert "g:10" is gone from ALL chunks for that item

# Test: scope change invalidates cached RAG results for that item
# - Pre-populate HybridRAGEngine._cache with a result referencing doc from item X
# - Call invalidate_cache_for_item(item_id=X, ...)
# - Assert _cache entries containing that item's docs are removed

# Test: pgvector metadata updated on scope change
# - Mock PgVectorStore.update_document()
# - Call propagate_scopes_to_vector_stores() with provider="pgvector"
# - Assert update_document was called with metadata containing new allowed_scopes

# Test: ChromaDB metadata updated on scope change (mock collection.update)
# - Mock a ChromaDB collection object with an update() method
# - Call propagate_scopes_to_vector_stores() with provider="chromadb"
# - Assert collection.update() was called with updated metadata

# Test: Cloudflare Vectorize triggers delete + re-insert on scope change (mock API)
# - Mock CloudflareVectorizeStore.delete_by_ids() and .upsert()
# - Call propagate_scopes_to_vector_stores() with provider="cloudflare_vectorize"
# - Assert delete_by_ids() was called first, then upsert() with new metadata
```

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_tenant_isolation.py`

```python
"""Integration tests for cross-tenant isolation in RAG retrieval."""

import pytest

# Test: user in tenant A cannot retrieve documents from tenant B
# - Create docs in tenant A and tenant B
# - User from tenant A queries RAG
# - Assert zero results from tenant B documents
# - Verify tenant_id filter is always enforced

# Test: document shared with g:10 accessible only by active members of group 10
# - Create a doc with allowed_scopes=["u:1", "g:10"]
# - User 2 is active member of group 10: should retrieve the doc
# - User 3 is NOT a member of group 10: should NOT retrieve the doc

# Test: pending group member cannot access group documents
# - User 4 is a member of group 10 with status="pending"
# - compute_effective_scopes for user 4 does NOT include "g:10"
# - RAG retrieval for user 4 does NOT return docs with only "g:10" scope

# Test: document unshared: immediately gone from retrieval results
# - Share doc with user 2, verify user 2 can retrieve it
# - Unshare (delete permission), call scope propagation
# - Verify user 2 can NO LONGER retrieve it
# - Verify no stale cache returns the old result
```

---

## Implementation Details

### 1. Add `propagate_scopes_to_vector_stores()` to scope engine

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/scope_engine.py`

This file is created in Section 01 with `compute_effective_scopes()` and `recompute_allowed_scopes()`. This section adds a new function to propagate scope changes to all vector store backends.

```python
async def propagate_scopes_to_vector_stores(
    item_id: int,
    chunk_ids: list[str],
    new_allowed_scopes: list[str],
    tenant_id: str,
    session: AsyncSession,
) -> dict[str, int]:
    """
    Propagate updated allowed_scopes to all configured vector store providers.

    For each chunk belonging to the item:
    1. pgvector: SQL UPDATE on metadata JSONB column to set allowed_scopes
    2. ChromaDB: collection.update() with new metadata (if configured)
    3. Cloudflare Vectorize: delete + re-insert (no in-place metadata update)

    Returns dict of provider_name -> number of vectors updated.
    """
```

The function should:

- Accept the item ID, list of chunk vector_ref_ids, the newly computed `allowed_scopes`, and the tenant ID.
- Query the `library_chunks` table for all chunks belonging to `item_id` to get their `vector_ref_id` values.
- For **pgvector** (the `PgVectorStore` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/vector_store/pgvector_store.py`): call `update_document(doc_id=vector_ref_id, metadata={"allowed_scopes": new_allowed_scopes})` for each chunk. The `PgVectorStore.update_document()` method already supports partial metadata merging via `metadata = metadata || $N` in SQL. The metadata key `allowed_scopes` is an array of scope strings.
- For **ChromaDB** (if available): call `collection.update(ids=[vector_ref_id], metadatas=[{"allowed_scopes": new_allowed_scopes}])`. ChromaDB supports in-place metadata updates.
- For **Cloudflare Vectorize** (the `CloudflareVectorizeStore` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/vector_store/cloudflare_vectorize_store.py`): Cloudflare Vectorize does NOT support in-place metadata updates. The approach is: (a) call `get_by_ids()` to fetch existing vectors with their embeddings, (b) call `delete_by_ids()` to remove them, (c) call `upsert()` with the same vectors but updated metadata including `allowed_scopes`.
- Track and return how many vectors were updated per provider.
- Log any errors per provider but do not fail the entire operation if one provider is unavailable (best-effort propagation with logged warnings).

Also add a cache invalidation helper:

```python
async def invalidate_rag_cache_for_item(
    item_id: int,
    tenant_id: str,
) -> int:
    """
    Invalidate any cached RAG results that include documents from the given item.

    The HybridRAGEngine uses an in-memory _cache dict keyed by
    "{tenant_id}:{scope_hash}:{query}:{top_k}:{mode}".

    Since we cannot enumerate which cache keys contain results from this item
    without scanning all entries, the safest approach is to clear ALL cache
    entries for this tenant_id (cache keys start with "{tenant_id}:").

    Returns number of cache entries invalidated.
    """
```

### 2. Full scope recomputation + propagation orchestrator

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/scope_engine.py`

Add a top-level orchestration function that ties together recomputation and propagation:

```python
async def handle_permission_change(
    item_id: int,
    tenant_id: str,
    session: AsyncSession,
) -> None:
    """
    Called after any library_permissions CREATE, UPDATE, or DELETE.

    Steps:
    1. Recompute allowed_scopes for the libraryItem from its library_permissions
       records, visibility setting, and owner_user_id (uses recompute_allowed_scopes
       from section 01).
    2. Propagate the new allowed_scopes to all libraryChunks belonging to that item
       (SQL UPDATE on the allowed_scopes column).
    3. Propagate to vector store metadata for all chunks (pgvector, ChromaDB,
       Cloudflare Vectorize).
    4. Invalidate cached RAG results for this tenant (clear stale entries).
    """
```

The recomputation logic (defined in Section 01's `recompute_allowed_scopes()`) follows these rules:
- Start with `["u:<owner_user_id>"]`
- For each `library_permissions` record with `permission_level >= "read"`: add `"u:<subject_id>"` (if subject_type is "user"), `"g:<subject_id>"` (if "group"), `"t:<subject_id>"` (if "tenant_role")
- If item `visibility = "public"`: add `"p:global"`
- If item `visibility = "team"`: add `"t:<tenant_id>"`

The propagation to chunks is a single SQL UPDATE:
```sql
UPDATE library_chunks
SET allowed_scopes = :new_scopes
WHERE library_item_id = :item_id AND tenant_id = :tenant_id;
```

### 3. Add scope recomputation hooks to `libraryService.ts`

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts`

Three functions in `libraryService.ts` modify `library_permissions` and need post-operation scope recomputation hooks:

#### 3a. `shareLibraryItem()` (line ~1335)

After the `db.insert(libraryPermissions)` at line ~1396, add a call to trigger scope recomputation. The Node.js side should call the Python backend's scope propagation endpoint (or call a local TypeScript function that does the SQL updates directly).

**Recommended approach:** Add a TypeScript utility function `recomputeAndPropagateScopes(itemId: number, tenantId: string)` in `libraryService.ts` that:
1. Queries all `library_permissions` for the item.
2. Queries the item's `visibility` and `ownerUserId`.
3. Computes the new `allowed_scopes` array using the same logic as the Python side.
4. Updates `libraryItems.allowedScopes` for the item.
5. Updates `libraryChunks.allowedScopes` for all chunks of that item.
6. Calls the Python backend via internal HTTP (`POST /api/v1/internal/propagate-scopes`) to update vector store metadata.

Add the call after the insert:
```typescript
// After the db.insert(libraryPermissions) call:
await recomputeAndPropagateScopes(input.itemId, actorTenantId);
```

#### 3b. `removeLibraryShare()` (line ~2323)

After the `db.delete(libraryPermissions)` at line ~2341, add:
```typescript
await recomputeAndPropagateScopes(input.itemId, actorTenantId);
```

Revocation must take effect immediately. No stale cache may return the old scopes.

#### 3c. `updateLibrarySharePermission()` (line ~2362)

After the `db.update(libraryPermissions)` at line ~2380, add:
```typescript
await recomputeAndPropagateScopes(input.itemId, actorTenantId);
```

If the permission level drops below "read", the scope should be removed.

### 4. TypeScript scope recomputation utility

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts`

Add the utility function that mirrors the Python-side logic:

```typescript
async function recomputeAndPropagateScopes(
  itemId: number,
  tenantId: string,
  dbClient?: DbClient,
): Promise<void> {
  /**
   * Recompute allowed_scopes for a library item from its library_permissions
   * records, visibility, and owner. Then propagate to all chunks.
   *
   * Steps:
   * 1. Fetch the item (owner_user_id, visibility)
   * 2. Fetch all non-expired library_permissions for the item
   * 3. Build the allowed_scopes array:
   *    - Always include "u:<owner_user_id>"
   *    - For each permission with level >= "read":
   *      - subject_type "user" -> "u:<subject_id>"
   *      - subject_type "group" -> "g:<subject_id>"
   *      - subject_type "tenant_role" -> "t:<subject_id>"
   *    - If visibility = "public": add "p:global"
   *    - If visibility = "team": add "t:<tenant_id>"
   * 4. UPDATE libraryItems SET allowedScopes = newScopes WHERE id = itemId
   * 5. UPDATE libraryChunks SET allowedScopes = newScopes WHERE libraryItemId = itemId
   * 6. Call Python backend to propagate to vector stores (fire-and-forget with retry)
   */
}
```

The call to the Python backend for vector store propagation should be fire-and-forget with error logging. The SQL updates to `libraryItems` and `libraryChunks` are the critical path; vector store propagation is best-effort (if it fails, the next retrieval will still use the database `allowed_scopes` as the authoritative filter).

### 5. Python internal API endpoint for scope propagation

**File to create or modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/` (add a new internal endpoint or extend an existing router)

Add an internal endpoint that the Node.js web app calls to trigger vector store metadata propagation:

```python
@router.post("/internal/propagate-scopes")
async def propagate_scopes_endpoint(
    item_id: int,
    tenant_id: str,
    new_allowed_scopes: list[str],
    session: AsyncSession = Depends(get_async_session),
):
    """
    Internal endpoint called by Node.js after permission changes.
    Propagates allowed_scopes to vector store metadata.
    Should be protected by an internal API key or network policy.
    """
```

This endpoint should call `propagate_scopes_to_vector_stores()` from `scope_engine.py`.

### 6. Migration safety for `allowed_scopes` backfill

**Context:** Section 01 adds the `allowed_scopes` column to `libraryItems` and `libraryChunks`. This section handles the **backfill** of existing documents, which is a separate concern from the column addition.

**Backfill approach:**

The backfill sets `allowed_scopes` for every existing `libraryItem` that currently has `allowed_scopes = NULL` or `allowed_scopes = '{}'`. For each item:
1. Start with `["u:<owner_user_id>"]`
2. Query `library_permissions` for the item.
3. For each permission with `permission_level >= "read"`, add the appropriate scope string.
4. If `visibility = "public"`, add `"p:global"`.
5. If `visibility = "team"`, add `"t:<tenant_id>"`.
6. Update the item's `allowed_scopes`.
7. Update all chunks' `allowed_scopes` for that item.

**Backfill safety rules (per Database Safety Protocol in CLAUDE.md):**
- Backup `library_items` and `library_chunks` tables before running backfill.
- Record row counts before and after.
- Process in batches of 100 items to limit memory and lock duration.
- The `allowed_scopes` column is nullable with default `'{}'` -- existing rows keep their current value until explicitly backfilled.
- Verify row counts after backfill (should not change).
- If anything goes wrong, restore from backup.

**Backfill implementation:** Create a management command or Celery task:

```python
# python-backend/app/tasks/backfill_allowed_scopes.py

async def backfill_allowed_scopes(
    tenant_id: str | None = None,
    batch_size: int = 100,
) -> dict[str, int]:
    """
    Backfill allowed_scopes for existing library items.

    If tenant_id is provided, only backfill that tenant.
    Otherwise backfill all tenants.

    Returns {"items_updated": N, "chunks_updated": M}.
    """
```

### 7. Visibility change hook

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts`

When a library item's `visibility` field changes (e.g., from "private" to "team" or "public"), `allowed_scopes` must also be recomputed. The existing `updateLibraryItem()` function in `libraryService.ts` handles visibility updates. Add a check: if the update includes a `visibility` change, call `recomputeAndPropagateScopes()` after the update.

Look for the update function that handles `UpdateLibraryItemInput` (which includes `visibility?: LibraryVisibility`) and add the hook after the database update completes.

---

## File Summary (Actual Implementation)

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/orchestrator/rag/scope_engine.py` | Modified | Added `propagate_scopes_to_vector_stores()`, `invalidate_rag_cache_for_item()`, `handle_permission_change()` |
| `python-backend/app/orchestrator/rag/__init__.py` | Modified | Added exports for 3 new functions |
| `apps/web/server/services/libraryService.ts` | Modified | Added `recomputeAndPropagateScopes()` utility, hooked into `shareLibraryItem()`, `removeLibraryShare()`, `updateLibrarySharePermission()`, and visibility change in `updateLibraryItem()` |
| `python-backend/app/tasks/backfill_allowed_scopes.py` | Created | Async utility for backfilling `allowed_scopes` on existing documents |
| `python-backend/tests/orchestrator/rag/test_scope_propagation.py` | Created | 9 unit tests for scope propagation to vector stores |
| `python-backend/tests/orchestrator/rag/test_tenant_isolation.py` | Created | 6 unit tests for cross-tenant isolation |
| `python-backend/tests/orchestrator/rag/test_allowed_scopes.py` | Modified | Fixed subject_type from "tenant" to "tenant_role" |
| `python-backend/app/api/v1/__init__.py` | Unchanged | No new v1 router (uses existing `internal_library.py`) |

**NOT created (per code review):**
- `python-backend/app/api/v1/rag_scopes.py` — Deleted. Existing `app/api/internal_library.py` already provides this endpoint with proper auth (`secrets.compare_digest` + `SMARTSPEC_PROXY_TOKEN`).

---

## Deviations from Plan

1. **No new internal API endpoint**: Plan called for creating `/api/v1/rag/internal/propagate-scopes`. Existing `internal_library.py` already provides `/api/internal/library/propagate-scopes` with proper token-based auth. TypeScript side calls this existing endpoint instead.

2. **Backfill is async utility, not Celery task**: Plan suggested a Celery task or management command. Implementation is a plain `async def` function that can be called from any context. Celery wrapper can be added later if needed.

3. **subject_type mapping fixed**: Plan referenced `"tenant"` for subject_type, but the actual DB stores `"tenant_role"`. Fixed to use `"tenant_role"` in the prefix mapping.

4. **chunk_ids parameter dropped**: Plan's `propagate_scopes_to_vector_stores()` signature included `chunk_ids: list[str]`. Implementation queries chunk IDs from the database instead, which is more correct (avoids stale chunk_id lists).

5. **Tenant filter added to chunk queries**: Code review caught a missing defense-in-depth `tenant_id` filter on the chunk lookup SQL. Added for both Python and TypeScript sides.

---

## Key Design Decisions

1. **Dual-write pattern**: The Node.js side updates `allowed_scopes` on items and chunks in PostgreSQL (synchronous, critical path). The Python side updates vector store metadata (async, best-effort). This ensures the authoritative data in PostgreSQL is always consistent, even if vector store propagation has a brief lag.

2. **Immediate revocation**: When a permission is removed, the SQL UPDATE to `allowed_scopes` happens in the same request. Cache invalidation also happens immediately. There is no window where a revoked user can still retrieve the document through stale cache.

3. **Cloudflare Vectorize delete+re-insert**: Cloudflare Vectorize does not support in-place metadata updates. The propagation function fetches existing vectors, deletes them, and re-inserts with updated metadata.

4. **Fire-and-forget Python call**: The Node.js to Python HTTP call for vector store propagation is non-blocking. If `SMARTSPEC_PROXY_TOKEN` is not configured, no call is made. If it fails, the system still works correctly because the RAG pipeline reads `allowed_scopes` from PostgreSQL for filtering.

5. **Backfill as separate operation**: Backfill of existing documents is a batch operation run once after the `allowed_scopes` column is added. It is idempotent.

## Test Coverage

- 152 total RAG tests pass (including 15 new tests from this section)
- 9 scope propagation tests: pgvector, chromadb, cloudflare, no-chunks, provider-error-isolation, cache invalidation, handle_permission_change orchestration
- 6 tenant isolation tests: cross-tenant scope separation, group membership enforcement, pending member exclusion, immediate revocation, public doc access