## Section 06: Trash Auto-Purge Background Job - Code Review

### CRITICAL Issues

#### 1. Incomplete cascade deletion -- missing `libraryLinks` and `libraryIndexJobs` tables
The `purgeItem()` function only deletes from `libraryChunks` and `libraryPermissions` before deleting the parent `libraryItems` row. However, the schema has TWO additional tables with FK references to `libraryItems.id`:
- `libraryLinks` (onDelete: cascade)
- `libraryIndexJobs` (onDelete: cascade)

The code performs manual cascade but only covers 2 of 4 child tables. The DB-level `onDelete: cascade` will handle it, but the code is misleading. The existing `permanentDeleteLibraryItem()` in libraryService.ts has the SAME gap.

#### 2. Code duplication with `permanentDeleteLibraryItem()` -- divergent deletion logic
The cascade deletion transaction in `purgeItem()` is a near-exact duplicate of `permanentDeleteLibraryItem()` in libraryService.ts. Two independent deletion code paths for the same data that can drift apart. If someone adds a new child table and only updates one path, the other silently leaves orphaned rows.

### HIGH Issues

#### 3. No storage or vector DB cleanup -- plan explicitly requires it
The plan dedicates entire sections to S3/R2 storage deletion and vector DB cleanup with best-effort error handling. The implementation has NONE of this. `sourceUrl` and `thumbnailUrl` are selected from DB but never used. Note: `storageDelete` and `vectorDbClient` don't exist in the codebase yet.

#### 4. No batch processing or LIMIT -- unbounded memory consumption
The query fetches ALL qualifying items into memory with no LIMIT clause. The plan explicitly calls this out as a concern. If thousands of items accumulate in trash, this could cause OOM.

#### 5. Test coverage grossly inadequate for a destructive background job
1 implemented test and 13 todo stubs for a job that PERMANENTLY DELETES DATA with no recovery. Critical untested paths: cutoff calculation, cascade order, error handling, BullMQ retry interaction.

### MEDIUM Issues

#### 6. Separate Redis connection -- unnecessary resource consumption
Creates its own standalone IORedis connection. Growing number of independent Redis connections (scheduler, telegram, trash-purge). A shared BullMQ connection factory would be more appropriate.

#### 7. `userId: 0` in audit log is a magic value
The audit log uses `userId: 0` for system job. `AuditLogEntry` type allows `number | null`. Using `null` would be more semantically correct.

#### 8. No tenant-scoping in the purge query
The plan concludes no tenant filtering is needed for system-level job, but `permanentDeleteLibraryItem()` DOES filter by tenantId. A defense-in-depth approach would process tenant-by-tenant.

#### 9. Error handling ambiguity -- per-item catch vs BullMQ retry
Per-item errors are caught and skipped. The plan specifies database deletion failures should "Throw error to trigger BullMQ retry." A transiently failing item will never be retried within the same job run.

#### 10. Plan specifies worker rate limiter but implementation omits it
Plan specifies `limiter: { max: 1, duration: 60000 }`. Implementation only sets `concurrency: 1`.

### LOW Issues

#### 11. Uses `queue.add()` with `repeat` instead of `queue.upsertJobScheduler()`
Existing scheduler.ts uses `queue.upsertJobScheduler()` which is newer BullMQ API. `queue.add()` with `repeat` can create duplicates if options change between deployments.

#### 12. Cutoff date calculation uses millisecond arithmetic
Plan uses `setDate()` which handles DST. Millisecond approach could be off by an hour during DST, though irrelevant for 90-day threshold.

#### 13. Console.error instead of structured logger
Uses `console.log`/`console.error` instead of structured logger. Matches scheduler.ts pattern but plan calls for structured logging.

### Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 3 |
| MEDIUM | 5 |
| LOW | 3 |

Most architecturally significant: code duplication with `permanentDeleteLibraryItem()` creating divergent deletion paths.
