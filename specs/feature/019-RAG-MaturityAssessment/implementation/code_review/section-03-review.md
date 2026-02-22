# Code Review: Section 03 - Smart Chunking

**Date:** 2026-02-22
**Reviewer:** code-reviewer subagent

## Findings

### HIGH

**H1: allowed_scopes NOT persisted to LibraryChunk DB records**
- File: `python-backend/app/services/library_indexing_service.py` (lines 1097-1140)
- Both parent and child chunk `LibraryChunk()` constructors omit `allowed_scopes`. The `Chunk` dataclass carries `allowed_scopes` from the item, but the DB write doesn't pass it through. This breaks scope-based filtering at the DB/vector level.
- Severity: CRITICAL — data-level security bug

**H2: chunk_index uniqueness constraint fragility**
- File: `python-backend/app/models/library.py` (line 123)
- `uq_library_chunks_item_chunk` enforces unique (library_item_id, chunk_index). If delete-before-insert ordering changes, re-indexing would violate the constraint.
- Currently works because pipeline always deletes old chunks first.

**H3: _split_recursive can return oversized text unchanged**
- File: `python-backend/app/orchestrator/rag/chunker.py` (line 175)
- If no separator produces >1 segment, the function returns `[text]` unchanged regardless of size.
- Edge case for very long unsplittable tokens or adversarial input.

**H4: end_char calculation coordinate mismatch**
- File: `python-backend/app/orchestrator/rag/chunker.py` (line 302)
- `end_char = start_pos + len(parent_content)` mixes original text offset (start_pos from `find()`) with reconstructed content length (parent_content joined with "\n\n").
- Metadata-only field, doesn't affect retrieval correctness.

### MEDIUM

**M5: chunk_text_content() not marked deprecated**
- File: `python-backend/app/services/library_indexing_service.py` (line 228)
- Legacy function still present. Should have deprecation notice.

**M6: Integration tests use shallow mocks**
- File: `python-backend/tests/orchestrator/rag/test_indexing_pipeline.py`
- Tests mock chunker and embedder rather than testing the actual integration.
- Acceptable for unit test scope.

**M7: Patch path concern in reindex tests** — Already fixed during implementation.

**M8: _split_to_units joins with spaces, destroying paragraph structure**
- File: `python-backend/app/orchestrator/rag/chunker.py` (line 401)
- `" ".join(units[...])` flattens paragraph breaks. Acceptable since children are for search, parents preserve structure.

**M9: Strategy auto-detection threshold asymmetry**
- 1 heading triggers MARKDOWN, but 2+ markers needed for CODE. Intentional design.

**M10: Extraneous schema changes in diff**
- Diff includes section-01/02 changes already committed. Not an actual issue.

### LOW

**L11: start_char uses find() returning first occurrence**
- Approximate metadata, acceptable with 80-char search key.

**L12: Missing test for old vector entries cleanup**
- Covered indirectly by pipeline tests.

**L13: test_no_mid_sentence_splits assertion weak**
- Test approach is reasonable for the assertion.

**L14: Optional imported but unused in chunker.py**
- `from typing import Optional` on line 15 — code uses `str | None` syntax.

**L15: Optional imported but unused in reindex_tasks.py**
- `from typing import Optional` on line 5.
