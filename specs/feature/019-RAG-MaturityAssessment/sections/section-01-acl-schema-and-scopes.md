# Section 01: ACL Schema and Scopes

## Overview

This section implements the multi-tenant ACL foundation for the RAG pipeline. It adds `allowed_scopes` as a denormalized cache column to `libraryItems` and `libraryChunks`, fixes the cache key in `HybridRAGEngine` to prevent cross-tenant pollution, maps existing `groupMembers` semantics to scope rules, and creates the `compute_effective_scopes()` and `recompute_allowed_scopes()` utilities.

This is the first section with no dependencies. Sections 02 (Scope Propagation) and 03 (Smart Chunking) depend on the schema and utilities established here.

---

## Background and Context

### Current State

The existing RAG pipeline in `python-backend/app/orchestrator/rag/hybrid_rag.py` has a `HybridRAGEngine` that combines BM25 + vector retrieval with RRF fusion. It stores documents in an in-memory `self._documents: Dict[str, Document]` dictionary.

**Critical problems this section fixes:**

1. **Cache key lacks tenant isolation.** Line 313 of `hybrid_rag.py` builds the cache key as `f"{query}:{top_k}:{mode.value}"` -- no tenant or scope information. Two users in different tenants running the same query get the same cached results.

2. **No `allowed_scopes` column exists.** The `libraryItems` and `libraryChunks` tables have no way to express which users/groups/tenants may access a document at the vector DB filtering level.

3. **No effective scopes computation.** There is no utility to compute what scopes a user has at query time based on their group memberships and tenant context.

### Existing Schema References

The following tables already exist and must NOT be modified (only extended with new columns where specified):

**`libraryItems`** (Drizzle: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` line 1570): Has `tenantId`, `ownerUserId`, `visibility` (private/public/team), `status`.

**`libraryChunks`** (Drizzle: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` line 1617): Has `tenantId`, `libraryItemId`, `chunkIndex`, `content`, `vectorRefId`.

**`libraryPermissions`** (Drizzle: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` line 1659): Has `tenantId`, `libraryItemId`, `subjectType`, `subjectId`, `permissionLevel`, `expiresAt`.

**`groupMembers`** (Drizzle: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` line 813): Has `groupId`, `userId`, `role` ("admin"/"member"), `status` ("active"/"pending"/"removed"), `addedBy`, `joinedAt`, `removedAt`.

**Python SQLAlchemy models** at `/home/dev/projects/SmartSpecPro/python-backend/app/models/library.py`: `LibraryItem`, `LibraryChunk`, `LibraryPermission` mirror the Drizzle schema.

---

## Tests (Write First)

All test files go under `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/`.

### Test File: `test_allowed_scopes.py`

New file at `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_allowed_scopes.py`.

Tests the `recompute_allowed_scopes()` function and the schema-level `allowed_scopes` column behavior.

```python
# python-backend/tests/orchestrator/rag/test_allowed_scopes.py
"""
Tests for allowed_scopes recomputation and schema integration.

These tests verify that:
- allowed_scopes is correctly computed from library_permissions records
- Scope changes propagate to all chunks belonging to an item
- Default scopes for new items are ["u:<owner_user_id>"]
- Visibility settings (public, team) are reflected in allowed_scopes
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.rag.scope_engine import (
    recompute_allowed_scopes,
)


@pytest.mark.asyncio
class TestRecomputeAllowedScopes:
    """Tests for the recompute_allowed_scopes function."""

    # Test: adding a library_permissions record triggers allowed_scopes recomputation on the item
    async def test_adding_permission_updates_allowed_scopes(self):
        """When a permission is added, allowed_scopes should include the new scope."""
        ...

    # Test: deleting a library_permissions record removes the corresponding scope from allowed_scopes
    async def test_deleting_permission_removes_scope(self):
        """When a permission is deleted, the corresponding scope should be removed."""
        ...

    # Test: updating library_permissions permission_level below "read" removes scope
    async def test_permission_below_read_removes_scope(self):
        """Permissions below 'read' level should not grant a scope."""
        ...

    # Test: allowed_scopes propagates to all libraryChunks belonging to the item
    async def test_scopes_propagate_to_chunks(self):
        """All chunks of an item should receive the same allowed_scopes."""
        ...

    # Test: default allowed_scopes for new item is ["u:<owner_user_id>"]
    async def test_default_scopes_for_new_item(self):
        """A new item with no permissions should default to owner-only scope."""
        ...

    # Test: item with visibility="public" includes "p:global" in allowed_scopes
    async def test_public_visibility_includes_global_scope(self):
        """Public items should include 'p:global' in their allowed_scopes."""
        ...

    # Test: item with visibility="team" includes "t:<tenant_id>" in allowed_scopes
    async def test_team_visibility_includes_tenant_scope(self):
        """Team-visible items should include 't:<tenant_id>' in their allowed_scopes."""
        ...

    # Test: GIN index on allowed_scopes enables @> containment queries
    # (This is a schema-level concern; can be validated via an integration test or migration check.)
    async def test_gin_index_exists_on_allowed_scopes(self):
        """Verify the GIN index is defined on allowed_scopes for @> queries."""
        ...
```

### Test File: `test_effective_scopes.py`

New file at `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_effective_scopes.py`.

Tests the `compute_effective_scopes()` function.

```python
# python-backend/tests/orchestrator/rag/test_effective_scopes.py
"""
Tests for compute_effective_scopes utility.

Verifies that a user's effective scopes at query time correctly include:
- Their own user scope (always)
- Public global scope (always)
- Group scopes for active memberships only
- Tenant scope when applicable
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.rag.scope_engine import compute_effective_scopes


@pytest.mark.asyncio
class TestComputeEffectiveScopes:
    """Tests for the compute_effective_scopes function."""

    # Test: compute_effective_scopes always includes u:<user_id>
    async def test_always_includes_user_scope(self):
        """Effective scopes must always contain the user's own scope."""
        ...

    # Test: compute_effective_scopes always includes p:global
    async def test_always_includes_public_global(self):
        """Effective scopes must always contain 'p:global'."""
        ...

    # Test: compute_effective_scopes includes g:<id> for each active group membership
    async def test_includes_active_group_scopes(self):
        """Active group memberships should produce g:<group_id> scopes."""
        ...

    # Test: compute_effective_scopes includes t:<tenant_id> when tenant has shared docs
    async def test_includes_tenant_scope(self):
        """Tenant scope should be included for tenant-level access."""
        ...

    # Test: user with no groups returns {u:<id>, p:global} only
    async def test_user_with_no_groups(self):
        """A user with no group memberships should have minimal scopes."""
        ...

    # Test: user with 3 active groups and 1 pending group returns exactly 3 group scopes
    async def test_pending_groups_excluded(self):
        """Pending group memberships must NOT produce group scopes."""
        ...
```

### Test File: `test_hybrid_rag.py` (extend existing)

Extend the existing file at `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_hybrid_rag.py` with a new test class for cache key isolation.

```python
# Add to existing test_hybrid_rag.py

class TestCacheKeyIsolation:
    """Tests for tenant-aware cache key generation."""

    # Test: cache key includes tenant_id -- different tenants get different cache entries
    @pytest.mark.asyncio
    async def test_cache_key_includes_tenant_id(self):
        """Two different tenant_ids with the same query must not share cache."""
        ...

    # Test: cache key includes scope hash -- same query with different scopes misses cache
    @pytest.mark.asyncio
    async def test_cache_key_includes_scope_hash(self):
        """Same query from same tenant but different scopes must miss cache."""
        ...

    # Test: user A's cached result is not returned to user B with different scopes
    @pytest.mark.asyncio
    async def test_cross_user_cache_isolation(self):
        """Verify user A's cached results are never served to user B."""
        ...
```

### Test File: `test_group_scopes.py`

New file at `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_group_scopes.py`.

```python
# python-backend/tests/orchestrator/rag/test_group_scopes.py
"""
Tests for group membership -> scope mapping.

Verifies the mapping of groupMembers.status to scope inclusion/exclusion:
- active -> included
- pending -> excluded
- removed -> excluded
- Enterprise cross-tenant invite rejection
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.rag.scope_engine import compute_effective_scopes


@pytest.mark.asyncio
class TestGroupScopes:

    # Test: user with status="active" in group gets g:<group_id> in effective scopes
    async def test_active_member_gets_group_scope(self):
        """Active group members should have g:<group_id> in their scopes."""
        ...

    # Test: user with status="pending" does NOT get g:<group_id> in effective scopes
    async def test_pending_member_excluded(self):
        """Pending (invited but not accepted) members should NOT get group scopes."""
        ...

    # Test: user with status="removed" does NOT get g:<group_id> in effective scopes
    async def test_removed_member_excluded(self):
        """Removed members should NOT get group scopes."""
        ...

    # Test: enterprise tenant rejects cross-tenant group invite
    async def test_enterprise_cross_tenant_invite_rejected(self):
        """Enterprise tenants must reject invites where the user belongs to a different tenant."""
        ...
```

---

## Implementation Details

### 1. Add `allowed_scopes` Column to Drizzle Schema

**File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

Add an `allowedScopes` column to both `libraryItems` (line ~1570) and `libraryChunks` (line ~1617).

In the `libraryItems` table definition, add after the existing columns (before `deletedAt`):

```typescript
allowedScopes: text("allowed_scopes").array().default(sql`'{}'`),
```

In the `libraryChunks` table definition, add after `metadata`:

```typescript
allowedScopes: text("allowed_scopes").array().default(sql`'{}'`),
```

Also add a GIN index on `allowed_scopes` for both tables. In the index tuple at the end of each table definition, add:

```typescript
index("library_items_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
```

```typescript
index("library_chunks_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
```

After editing `schema.ts`, run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push` to generate and apply the migration. Follow the Database Safety Protocol: backup `library_items` and `library_chunks` tables first, verify row counts after.

### 2. Add `allowed_scopes` to Python SQLAlchemy Models

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/models/library.py`

Add the `ARRAY` import from SQLAlchemy and add the column to both `LibraryItem` and `LibraryChunk`.

In the imports section, add:

```python
from sqlalchemy.dialects.postgresql import ARRAY
```

In the `LibraryItem` class, add:

```python
allowed_scopes = Column(ARRAY(Text), default=list, server_default="{}")
```

In the `LibraryChunk` class, add:

```python
allowed_scopes = Column(ARRAY(Text), default=list, server_default="{}")
```

Add a GIN index to each table's `__table_args__`. For `LibraryItem`:

```python
Index("ix_library_items_allowed_scopes_gin", "allowed_scopes", postgresql_using="gin"),
```

For `LibraryChunk`:

```python
Index("ix_library_chunks_allowed_scopes_gin", "allowed_scopes", postgresql_using="gin"),
```

### 3. Fix Cache Key in HybridRAGEngine

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py`

The `retrieve()` method signature must accept `tenant_id` and `effective_scopes` parameters, and the cache key must incorporate them.

Modify the `retrieve()` method signature to add:

```python
async def retrieve(
    self,
    query: str,
    top_k: Optional[int] = None,
    mode: Optional[SearchMode] = None,
    filters: Optional[Dict[str, Any]] = None,
    user_id: Optional[int] = None,
    tenant_id: Optional[str] = None,
    effective_scopes: Optional[List[str]] = None,
) -> RAGResult:
```

Replace the cache key construction (currently line 313) with:

```python
scope_hash = hashlib.md5(str(sorted(effective_scopes or [])).encode()).hexdigest()[:8]
cache_key = f"{tenant_id or ''}:{scope_hash}:{query}:{top_k}:{mode.value}"
```

The `hashlib` import is already present in the file. The `List` type is also already imported from `typing`.

### 4. Create `scope_engine.py`

**New file:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/scope_engine.py`

This module contains two core functions:

#### `compute_effective_scopes()`

```python
async def compute_effective_scopes(
    user_id: int,
    tenant_id: str,
    session: AsyncSession,
) -> set[str]:
    """
    Compute the full set of scopes a user can access at query time.

    Always includes:
      - "u:<user_id>" (the user's own private scope)
      - "p:global" (public documents)

    Conditionally includes:
      - "g:<group_id>" for each group where the user has status='active'
      - "t:<tenant_id>" for tenant-level shared documents

    Args:
        user_id: The querying user's ID.
        tenant_id: The tenant context for the query.
        session: An async SQLAlchemy session for database queries.

    Returns:
        A set of scope strings like {"u:42", "p:global", "g:10", "t:abc"}.
    """
```

Implementation approach:
- Start with `{"u:{user_id}", "p:global"}`
- Query `group_members` where `user_id` matches and `status = 'active'`
- For each active membership, add `"g:{group_id}"`
- Add `"t:{tenant_id}"` (tenant members can always see tenant-level shared docs)
- Return the set

#### `recompute_allowed_scopes()`

```python
async def recompute_allowed_scopes(
    library_item_id: int,
    session: AsyncSession,
) -> list[str]:
    """
    Recompute the allowed_scopes for a library item from its permissions.

    This is the single source of truth for building allowed_scopes.
    It reads from library_permissions, the item's visibility, and the owner.

    Computation logic:
      1. Start with ["u:<owner_user_id>"]
      2. For each library_permissions record with permission_level >= "read":
         - If subject_type == "user": add "u:<subject_id>"
         - If subject_type == "group": add "g:<subject_id>"
         - If subject_type == "tenant": add "t:<subject_id>"
      3. If item visibility == "public": add "p:global"
      4. If item visibility == "team": add "t:<tenant_id>"

    After computing, updates:
      - library_items.allowed_scopes for the item
      - library_chunks.allowed_scopes for ALL chunks belonging to the item

    Args:
        library_item_id: The ID of the library item to recompute.
        session: An async SQLAlchemy session.

    Returns:
        The computed list of scope strings.
    """
```

Permission levels ranked for comparison: `"none" < "read" < "comment" < "edit" < "admin"`. Only levels at or above `"read"` grant a scope.

### 5. Update `__init__.py` Exports

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/__init__.py`

Add the new `scope_engine` exports:

```python
from app.orchestrator.rag.scope_engine import (
    compute_effective_scopes,
    recompute_allowed_scopes,
)
```

---

## Scope Format Reference

The `allowed_scopes` array uses string-encoded scope tokens with a type prefix:

| Scope Token | Meaning |
|---|---|
| `u:<user_id>` | A specific user can access this document |
| `g:<group_id>` | Members of this group (with `status='active'`) can access |
| `t:<tenant_id>` | All users in this tenant can access |
| `p:global` | Publicly accessible to all authenticated users |

Example: `["u:42", "g:10", "t:abc-123"]` means user 42, active members of group 10, and all users in tenant abc-123 can access the document.

---

## Group Membership to Scope Mapping

The `groupMembers` table uses `status` values that map to scope behavior:

| `groupMembers.status` | Has `g:<group_id>` scope? | Notes |
|---|---|---|
| `"active"` | Yes | Accepted member -- full group access |
| `"pending"` | No | Invited but not accepted -- no access yet |
| `"removed"` | No | Declined or revoked -- no access |

The `addedBy` column is the user who invited. The `joinedAt` timestamp records when the invite was created or accepted.

**Enterprise cross-tenant rule:** When a group belongs to an enterprise tenant, only users from the same tenant may be members. Cross-tenant group invites must be rejected. This is enforced in the `shareLibraryItem` function in `libraryService.ts` (already implemented, see lines 1383-1391) and should also be enforced in `compute_effective_scopes()` as defense-in-depth (ignore group memberships where the group's tenant differs from the query tenant).

---

## Cache Key Fix Details

**Current code** at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/hybrid_rag.py` line 313:

```python
cache_key = f"{query}:{top_k}:{mode.value}"
```

**Fixed code:**

```python
scope_hash = hashlib.md5(str(sorted(effective_scopes or [])).encode()).hexdigest()[:8]
cache_key = f"{tenant_id or ''}:{scope_hash}:{query}:{top_k}:{mode.value}"
```

The `scope_hash` is an 8-character MD5 hex digest of the sorted scope list. This ensures:
- Different tenants never share cache entries (different `tenant_id` prefix)
- Different users with different group memberships within the same tenant get different cache entries (different `scope_hash`)
- The hash is deterministic for the same scope set regardless of insertion order (sorted)

---

## Migration Notes

The `allowed_scopes` column is **nullable** with a default of `'{}'` (empty PostgreSQL array). This is a LOW-MEDIUM risk migration.

Steps:
1. Backup `library_items` and `library_chunks` tables (per Database Safety Protocol)
2. Run migration to add the column
3. Backfill existing documents: for each `library_items` row, set `allowed_scopes = ARRAY['u:' || owner_user_id::text]`
4. Then run `recompute_allowed_scopes()` for items that have `library_permissions` records
5. Verify row counts post-migration

The backfill can be done as a SQL statement:

```sql
UPDATE library_items SET allowed_scopes = ARRAY['u:' || owner_user_id::text]
WHERE allowed_scopes IS NULL OR allowed_scopes = '{}';

UPDATE library_chunks c SET allowed_scopes = i.allowed_scopes
FROM library_items i WHERE c.library_item_id = i.id
AND (c.allowed_scopes IS NULL OR c.allowed_scopes = '{}');
```

---

## Dependencies

- **No upstream dependencies.** This is the first section.
- **Downstream:** Section 02 (Scope Propagation) depends on `recompute_allowed_scopes()` and the `allowed_scopes` columns being in place. Section 03 (Smart Chunking) depends on the `allowed_scopes` column existing on `libraryChunks` so new chunks can inherit scopes.

---

## File Summary (Actual Implementation)

| File | Action | Description |
|---|---|---|
| `apps/web/drizzle/schema.ts` | Modified | Added `allowedScopes` text[] column + GIN index to `libraryItems` and `libraryChunks` |
| `apps/web/drizzle/0032_cynical_moondragon.sql` | Created | Migration SQL for schema changes |
| `python-backend/app/models/library.py` | Modified | Added `allowed_scopes` ARRAY(Text) column + GIN index to `LibraryItem` and `LibraryChunk`; added ARRAY import |
| `python-backend/app/orchestrator/rag/hybrid_rag.py` | Modified | Fixed cache key with SHA-256 scope hash + tenant_id isolation; fail-closed when tenant_id missing; added `tenant_id`/`effective_scopes` params to `retrieve()` |
| `python-backend/app/orchestrator/rag/scope_engine.py` | Created | `compute_effective_scopes()` with tenant-scoped group filtering; `recompute_allowed_scopes()` with expires_at + deleted_at checks |
| `python-backend/app/orchestrator/rag/__init__.py` | Modified | Export new scope_engine functions |
| `python-backend/tests/orchestrator/rag/test_allowed_scopes.py` | Created | 12 tests for allowed_scopes recomputation |
| `python-backend/tests/orchestrator/rag/test_effective_scopes.py` | Created | 7 tests for compute_effective_scopes |
| `python-backend/tests/orchestrator/rag/test_hybrid_rag.py` | Modified | Added `TestCacheKeyIsolation` class (4 tests including fail-closed) |
| `python-backend/tests/orchestrator/rag/test_group_scopes.py` | Created | 5 tests for group membership to scope mapping |
| `python-backend/tests/test_rag_billing.py` | Modified | Added tenant_id to all retrieve() calls for fail-closed compatibility |

## Deviations from Plan

1. **SHA-256 instead of MD5** for scope hash in cache key (16 chars / 64 bits vs 8 chars / 32 bits). Per code review: MD5 truncated to 8 chars has trivial collision risk.
2. **Fail-closed behavior** added: `retrieve()` returns empty `RAGResult` when `tenant_id` is None, with a warning log. Plan only specified making the param Optional.
3. **Tenant-scoped group query** in `compute_effective_scopes()`: Added JOIN to `user_groups` and filter by `ug.tenant_id` to prevent cross-tenant group scope leakage. Plan mentioned this as defense-in-depth but didn't include the JOIN in the SQL.
4. **Expired permissions filtered** in `recompute_allowed_scopes()`: Added `AND (expires_at IS NULL OR expires_at > NOW())`. Plan didn't mention this but it's a security requirement.
5. **Soft-delete check** in `recompute_allowed_scopes()`: Added `AND deleted_at IS NULL`. Plan didn't mention this but it prevents recomputing scopes on deleted items.
6. **Backfill was applied manually** after migration, not embedded in the migration file.

## Test Results

53 tests pass (49 RAG + 3 billing + 1 fail-closed).
