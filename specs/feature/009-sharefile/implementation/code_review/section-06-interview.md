# Code Review Interview Transcript - Section 06

## User Decisions

### Issue #2: Code duplication with permanentDeleteLibraryItem
**Question:** Should we extract a shared helper for cascade deletion?
**User Decision:** Extract shared helper
**Action:** Create `_cascadeDeleteItem(tx, itemId)` in libraryService.ts, used by both `permanentDeleteLibraryItem` and `purgeItem` in the trash job

## Auto-Fixes to Apply

### Issue #1: Incomplete cascade -- missing libraryLinks and libraryIndexJobs
**Severity:** CRITICAL
**Fix:** Add `libraryLinks` and `libraryIndexJobs` deletes to the shared cascade helper

### Issue #4: No batch processing -- unbounded memory
**Severity:** HIGH
**Fix:** Add LIMIT with loop to `executeTrashPurge()` to process in batches of 100

### Issue #7: userId: 0 magic value in audit log
**Severity:** MEDIUM
**Fix:** Change `userId: 0` to `userId: null` for system-initiated actions

### Issue #11: queue.add() instead of upsertJobScheduler()
**Severity:** LOW
**Fix:** Switch to `queue.upsertJobScheduler()` matching scheduler.ts pattern

## Deferred Items

### Issue #3: No storage or vector DB cleanup
**Decision:** storageDelete and vectorDbClient don't exist yet, out of scope

### Issue #5: Only 1 implemented test
**Decision:** Todo stubs match project convention, tests can be filled in later

### Issue #6: Separate Redis connection
**Decision:** Matches existing pattern (scheduler.ts, telegramService.ts)

### Issue #8: No tenant-scoping in purge query
**Decision:** Correct for system-level job, DB-level tenant isolation at creation is sufficient

### Issue #9: Per-item catch vs BullMQ retry
**Decision:** Continuing through failures is safer for bulk operations

### Issue #10: Missing worker rate limiter
**Decision:** concurrency: 1 is sufficient protection

### Issues #12, #13: Millisecond arithmetic, console logging
**Decision:** Low impact, matches existing patterns

## Summary of Changes

**libraryService.ts:**
1. Export `_cascadeDeleteItem(tx, itemId)` helper -- deletes libraryLinks, libraryChunks, libraryIndexJobs, libraryPermissions, then libraryItems
2. Refactor `permanentDeleteLibraryItem` to call `_cascadeDeleteItem`

**purgeOldTrashItems.ts:**
1. Import and use `_cascadeDeleteItem` from libraryService instead of inline cascade
2. Add batch processing with LIMIT 100 loop
3. Change `userId: 0` to `userId: null`
4. Switch from `queue.add()` with repeat to `queue.upsertJobScheduler()`
