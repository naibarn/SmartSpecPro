# Section 04 Code Review Interview

## Review Summary
- **CRITICAL #2**: Token extraction used `replace("Bearer ", "")` → **Auto-fixed**: Now uses `startsWith("Bearer ")`/`slice(7)` with early return
- **CRITICAL #3**: No input validation → **Auto-fixed**: Added type checks for `userId` (positive number), `amount` (positive), `chunkCount` (non-negative), `service` (non-empty string)
- **HIGH #6**: Unused `fileCount` param in `estimateIndexingCost` → **Auto-fixed**: Removed parameter
- **HIGH #8**: MD5 hash for RAG idempotency → **Auto-fixed**: Switched to SHA-256 with 16-char prefix; moved `hashlib`/`time` imports to module level
- **MEDIUM #10**: `ragQueryCost=0` guard missing → **Auto-fixed**: Added early return when `amount <= 0`
- **CRITICAL #1**: Nginx deny rule for `/api/internal/` → **Let go**: Deferred to section-15 (security hardening)
- **HIGH #4**: RAG chat context billing → **Let go**: Out of scope for billing infrastructure section
- **HIGH #5**: Node.js credit service tests → **Let go**: 12 existing Vitest tests pass
- **HIGH #7**: `job_type` on re-index → **Let go**: Code correctly checks `job.job_type == "reindex"`
- **MEDIUM #9, #11-14**: Various → **Let go**: Acceptable for MVP (5-min cache TTL, etc.)
- **LOW #15-17**: Nitpicks → **Let go**

## Fixes Applied
1. `index.ts`: Token auth now validates `startsWith("Bearer ")` before extracting
2. `index.ts`: Added type validation for all request body fields
3. `index.ts`: Added `IndexingService` type import and cast for service param
4. `creditService.ts`: Removed unused `fileCount` param from `estimateIndexingCost`
5. `creditService.ts`: Added `amount <= 0` guard in `chargeForRagQuery`
6. `hybrid_rag.py`: Moved `hashlib`, `time` imports to module level
7. `hybrid_rag.py`: Replaced `md5` with `sha256` and increased hash prefix to 16 chars
