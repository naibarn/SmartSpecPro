# Section 04 Code Review

## Findings Summary

### CRITICAL
1. Internal endpoint routing through Nginx not explicitly blocked → **Let go** (deferred to section-15 security hardening)
2. Token extraction uses `replace("Bearer ", "")` instead of `startsWith`/`slice` → **Auto-fixed**
3. No input validation on userId/amount/chunkCount types → **Auto-fixed**

### HIGH
4. RAG chat context billing (Plan Step 7) missing → **Let go** (out of scope for section-04)
5. Node.js credit service tests missing from diff → **Let go** (existing 12 tests pass)
6. `estimateIndexingCost` has unused `fileCount` param → **Auto-fixed** (removed)
7. Markdown save re-index `job_type` not set in libraryService.ts → **Let go** (code uses `job.job_type` correctly)
8. MD5 hash for RAG idempotency key is collision-prone → **Auto-fixed** (SHA-256)

### MEDIUM
9. Cache invalidation on pricing config change → **Let go** (5-min TTL acceptable for MVP)
10. ragQueryCost=0 guard missing → **Auto-fixed**
11-14. Missing tests, refund pattern, zero-length billing, unrelated storage code → **Let go**

### LOW
15-17. Config ignoring, httpx client per call, fragile constraint check → **Let go**
