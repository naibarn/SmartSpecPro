# Section 08 Code Review Interview

## Auto-fixes (applying without user input)

### Fix 1: GoogleContentExtractor constructor/extract signature (CRITICAL)
- Constructor requires `access_token`, `.extract()` doesn't accept it
- Fix: Pass `access_token` to constructor, remove from `.extract()` call
- Also use `extracted.text` instead of dict `.get("text")`
- Add lazy import for `GoogleContentExtractor`

### Fix 2: Vector ID mismatch (HIGH)
- `_default_vector_upsert` generates `lib:` prefix but we need `gdrive:` prefix
- Fix: Write inline upsert using VectorCollection directly with `gdrive:` vector IDs

### Fix 3: Missing refund on failure (HIGH)
- `credits_charged` flag is set but never checked in error handler
- Fix: Add refund call in error handler when `credits_charged is True`

### Fix 4: Rollback before error handler commit (HIGH)
- Partial DB adds may be flushed on commit in error handler
- Fix: Add `await db.rollback()` before error status update

### Fix 5: Remove unnecessary math.ceil (LOW)
- `math.ceil(len(chunks))` is no-op since `len()` returns int
- Fix: Use `len(chunks) * 2` directly, remove `math` import

### Fix 6: Add user_id and item_id to chunk metadata (MEDIUM)
- Plan requires these fields in vector metadata
- Fix: Add `user_id` and `item_id` to chunk metadata dict

## Let go (not fixing)

### Issue: Missing Vitest tests
- Consistent with section scope (Python-focused section)
- TypeScript function follows existing codebase patterns

### Issue: _run_async pattern fragile
- Matches existing pattern in media_tasks.py - consistency > perfection

### Issue: No transaction wrapping in TS
- Consistent with existing codebase pattern for createLibraryItem

### Issue: Celery include list
- False positive: `autodiscover_tasks(["app.tasks"])` handles this automatically

### Issue: Test metadata assertions could be more thorough
- Tests pass and verify core behavior; can enhance later
