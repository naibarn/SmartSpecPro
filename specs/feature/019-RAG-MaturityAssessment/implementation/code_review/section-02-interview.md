# Section 02: Code Review Interview Transcript

## Triage Summary

| Finding | Severity | Action | Status |
|---------|----------|--------|--------|
| H1: subject_type mismatch (tenant vs tenant_role) | HIGH | Fixed | Applied |
| H2: Duplicate rag_scopes.py with weak auth | HIGH | Unstaged (not committed) | Applied |
| H3: Missing tenant_id filter in chunk query | HIGH | Fixed | Applied |
| M1: Permission level name differences | MEDIUM | Let go | N/A — both sides map to the same logic |
| M2: Chunk UPDATE lacks tenant filter in TS | MEDIUM | Auto-fixed | Applied |
| M3: console.warn instead of structured logger | MEDIUM | Let go | Acceptable for fire-and-forget error |
| M4: Backfill not a Celery task | MEDIUM | Let go | Can be wrapped later |
| L1: Test label mismatch | LOW | Let go | Unit tests are fine |
| L2: Asymmetric result dict | LOW | Auto-fixed (empty dict) | Applied |
| L3: Unused import | LOW | N/A (not present in current code) | N/A |

## User Decision

User chose: "Fix all HIGH + auto-fix MEDIUM"

## Changes Applied

### H1: Fixed subject_type mapping in Python scope_engine.py
- Added `"tenant_role": _TENANT` to the subject_type prefix map
- This ensures tenant_role-based permission grants correctly produce `t:` scopes

### H2: Removed duplicate endpoint from staging
- `rag_scopes.py` was unstaged from the commit
- Only `internal_library.py` (with proper `secrets.compare_digest()` auth) is committed
- TypeScript updated to use `/api/internal/library/propagate-scopes` endpoint

### H3: Added tenant_id filter to chunk query
- `propagate_scopes_to_vector_stores()` now filters by `tenant_id` in the chunk lookup SQL
- Defense-in-depth against cross-tenant scope leakage

### M2: Added tenant filter to TypeScript chunk UPDATE
- `libraryService.ts` chunk update now includes `eq(libraryChunks.tenantId, tenantId)` filter

### L2: Changed result dict initialization
- From `{"pgvector": 0}` to `{}` (empty dict)
- Only adds provider keys when provider is actually configured
- Tests updated to use `.get("pgvector", 0)` for consistency
