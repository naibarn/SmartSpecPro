# Code Review Interview: Section 03 - Smart Chunking

**Date:** 2026-02-22

## Triage Summary

| ID | Severity | Decision | Rationale |
|----|----------|----------|-----------|
| H1 | HIGH | **AUTO-FIX** | Security bug: allowed_scopes missing from DB writes |
| H2 | HIGH | Let go | Works with current delete-first pipeline flow |
| H3 | HIGH | Let go | Defensive fallback, preserves data over losing content |
| H4 | HIGH | Let go | Approximate metadata, doesn't affect retrieval |
| M5 | MEDIUM | **AUTO-FIX** | Add deprecation notice to legacy function |
| M6 | MEDIUM | Let go | Shallow mocks acceptable for unit test scope |
| M7 | MEDIUM | N/A | Already fixed during implementation |
| M8 | MEDIUM | Let go | Children are for search; parents preserve structure |
| M9 | MEDIUM | Let go | Intentional asymmetry in detection thresholds |
| M10 | MEDIUM | Let go | Changes from prior sections, not extraneous |
| L11 | LOW | Let go | Approximate metadata with 80-char key |
| L12 | LOW | Let go | Covered by existing pipeline tests |
| L13 | LOW | Let go | Test assertion is reasonable |
| L14 | LOW | **AUTO-FIX** | Unused import cleanup |
| L15 | LOW | **AUTO-FIX** | Unused import cleanup |

## Auto-Fixes

### FIX-1: H1 — Add allowed_scopes to LibraryChunk DB writes

**File:** `python-backend/app/services/library_indexing_service.py`
**Lines:** 1097-1140

Both parent and child `LibraryChunk()` constructors must include `allowed_scopes` from the Chunk dataclass to propagate scope-based access control to the DB records. Without this, chunks would have empty scopes and scope-filtered queries would miss them.

**Fix:** Add `allowed_scopes=parent.allowed_scopes` and `allowed_scopes=child.allowed_scopes` to the respective LibraryChunk constructors.

### FIX-2: M5 — Add deprecation notice to chunk_text_content()

**File:** `python-backend/app/services/library_indexing_service.py`
**Line:** 228

Add a deprecation note to the docstring indicating SmartChunker should be used instead.

### FIX-3: L14 — Remove unused Optional import in chunker.py

**File:** `python-backend/app/orchestrator/rag/chunker.py`
**Line:** 15

Remove `from typing import Optional` — code uses `str | None` syntax throughout.

### FIX-4: L15 — Remove unused Optional import in reindex_tasks.py

**File:** `python-backend/app/tasks/reindex_tasks.py`
**Line:** 5

Remove `from typing import Optional` — code uses `str | None` syntax throughout.

## Discussed with User

No items required user discussion. All actionable findings were either obvious fixes or acceptable as-is.
