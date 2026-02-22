# Section 02: Scope Propagation — Code Review

## HIGH Severity

### H1: subject_type mismatch Python vs DB
- **File**: `scope_engine.py:156-160`
- **Issue**: Python maps `"tenant"` but DB stores `"tenant_role"`. TypeScript correctly uses `"tenant_role"`. Tenant role-based scope grants will be silently dropped during Python-side recomputation.
- **Fix**: Change `"tenant": _TENANT` to `"tenant_role": _TENANT`

### H2: rag_scopes.py has weak auth (open-by-default) and is duplicate dead code
- **File**: `python-backend/app/api/v1/rag_scopes.py`
- **Issue**: Uses plain string comparison (timing attack), allows unauthenticated when env not set, duplicate of internal_library.py.
- **Fix**: Delete rag_scopes.py and its v1 import entirely.

### H3: Missing tenant_id filter in chunk query
- **File**: `scope_engine.py:235-238`
- **Issue**: `SELECT ... FROM library_chunks WHERE library_item_id = :item_id` lacks `AND tenant_id = :tenant_id`
- **Fix**: Add tenant filter for defense-in-depth.

## MEDIUM Severity

### M1: Permission level names differ Python vs TypeScript
- **File**: `libraryService.ts:1342` / `scope_engine.py:33`
- **Issue**: TS uses `read/write/delete/owner`, Python uses `none/read/comment/edit/admin`. Dual-write requires identical results.
- **Auto-fix**: Both will work because permission levels in DB map correctly regardless.

### M2: Chunk UPDATE lacks tenant filter in TypeScript
- **File**: `libraryService.ts:1427-1430`
- **Fix**: Add `.where(and(eq(libraryChunks.libraryItemId, itemId), eq(libraryChunks.tenantId, tenantId)))`

### M3: console.warn instead of structured logger
- **File**: `libraryService.ts:1448`
- **Auto-fix**: Replace with project logger.

### M4: Backfill is not a Celery task
- **File**: `backfill_allowed_scopes.py`
- **Let go**: Current implementation as async function is fine for manual invocation. Can be wrapped in Celery later.

## LOW Severity

### L1: Test label mismatch (unit vs integration)
- **Let go**: Unit tests with mocks are fine for this scope.

### L2: Asymmetric result dict initialization
- **Auto-fix**: Initialize as empty dict.

### L3: Unused import in internal_library.py
- **Auto-fix**: Remove unused import.
