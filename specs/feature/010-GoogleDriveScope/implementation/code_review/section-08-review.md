# Section 08 Code Review: Virtual Document References and Indexing

## Critical Issues

1. **GoogleContentExtractor constructor/extract signature mismatch** - Constructor requires `access_token`, `.extract()` doesn't accept it
2. **GoogleContentExtractor.extract() returns dataclass, not dict** - code uses `.get('text')` but real return is `ContentExtractionResult.text`
3. **GoogleContentExtractor not imported** - NameError at runtime when `content_extractor` is None

## High Issues

4. **Vector ID mismatch** - `_default_vector_upsert` generates `lib:` prefix IDs but DB chunks store `gdrive:` prefix
5. **Missing refund on failure** - `credits_charged` flag set but never checked in error handler
6. **Celery task not in `include` list** - task route added but module not registered for autodiscovery
7. **`db.commit()` in error handler without rollback** - partial chunks may be flushed

## Medium Issues

8. Missing Vitest tests (consistent with section scope - Python-focused)
9. `_run_async` pattern fragile (matches existing pattern in media_tasks.py)
10. `math.ceil(len(chunks))` is no-op - len() already returns int
11. Vector metadata missing `user_id`, `item_id`
12. No transaction wrapping in TS (consistent with existing codebase pattern)
