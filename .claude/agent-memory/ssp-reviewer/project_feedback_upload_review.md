---
name: feedback_upload_review
description: Security and correctness review of feedback attachment upload — registerFeedbackUploadRoutes and getAttachments tRPC endpoint
type: project
---

Review conducted 2026-03-18.

**Why:** User requested full security + correctness review of the feedback upload feature before merge.

**How to apply:** If future changes touch `apps/web/server/routers/feedback.ts`, re-check the open findings below before approving.

## Verdict: REQUEST_CHANGES

## Open findings

### CRITICAL
- **Auth-before-multer ordering (line 374 vs 373)**: `authorizeRequest` runs INSIDE the route handler, AFTER `feedbackUpload.array()` has already written temp files to disk. An unauthenticated request causes files to be written to os.tmpdir() and then the 401 is returned — temp files are NOT cleaned up in the unauthenticated rejection path. Fix: move auth into a preceding Express middleware or clean up req.files on every non-200 exit.
- **`tenantReq.tenant?.role` is always undefined** (`feedback.ts:403`): `Tenant` type (schema.ts:839) has no `role` field. The `isAdmin` check is always `false`, meaning no user can ever be recognized as admin through this path. Admin users who did not submit the ticket will receive 403. The correct check is to read the authenticated user's role from the JWT claims or from the `users` table, not from `req.tenant`.

### HIGH
- **Path traversal in storage key** (`feedback.ts:431`): `file.originalname` is used directly to construct the R2/S3 key: `feedback/${ticketId}/${Date.now()}-${file.originalname}`. A filename containing `../` segments (e.g. `../../etc/passwd`) would traverse the storage prefix. Sanitize originalname before embedding: strip path separators and limit to alphanumerics/dashes/dots.
- **MIME type spoofing** (`feedback.ts:361–367`): The `fileFilter` accepts a file if EITHER the extension OR the declared MIME type is allowed (OR logic, not AND). An attacker can upload a `.js` file with `Content-Type: image/jpeg` and it will be accepted because the MIME matches. Use AND logic: both extension AND MIME must be allowed.
- **Multer errors are NOT caught by the route handler's try/catch** (`feedback.ts:454–462`): Multer emits `LIMIT_FILE_SIZE` and `LIMIT_FILE_COUNT` errors by calling `next(err)` on the Express middleware chain, not by throwing inside the route handler. The `catch` block at line 454 therefore never sees these errors. They propagate as unhandled Express errors. Fix: add a dedicated Express error-handling middleware (4-arg `(err, req, res, next)`) after the route registration, or use the multer callback API.
- **No tenant isolation on the upload** (`feedback.ts:391–406`): The ticket ownership check at line 394 only verifies `submittedBy === userId`. It does not verify that the ticket belongs to the authenticated user's tenant. A user from tenant A can upload to a ticket created by a different user in tenant B if they know the numeric ticketId.

### MEDIUM
- **Race condition on attachment count** (`feedback.ts:409–424`): The `SELECT COUNT(*)` and subsequent `INSERT` are not inside a transaction or protected by a database-level constraint. Two concurrent uploads for the same ticket can both read `existingCount = 4`, both pass the `< 5` check, and both insert — resulting in 10 attachments instead of 5. Fix: use a `SELECT COUNT(*) FOR UPDATE` inside a transaction wrapping both the count check and the inserts, or add a `CHECK` constraint on the table.
- **Orphaned storage objects on DB insert failure** (`feedback.ts:428–451`): Inside the per-file loop, `storagePut` is called first, then the DB insert. If the DB insert fails, the file is already in R2/S3 with no database record. The `finally` block only cleans the local temp file. Fix: either wrap storagePut + insert in a transaction-like pattern (delete from storage on DB error) or collect successful keys and roll them back in the outer catch.
- **`fileName` stored without sanitization** (`feedback.ts:438`): `file.originalname` is stored verbatim in the `fileName` column (varchar 255) and returned to clients. Filenames can contain HTML/script content. Sanitize or encode before storing to prevent stored XSS if the value is ever rendered without escaping.
- **`auth.sub` parsed with `parseInt` — API key path returns numeric userId directly** (`feedback.ts:401`): When `auth.mode === "api_key"`, `auth.userId` is already the integer. But `auth.sub` is `String(authCtx.userId)` so `parseInt(auth.sub)` happens to work. When `auth.mode === "bearer"` with a static token, `auth.sub` is the string `"static"` — `parseInt("static")` returns `NaN`, causing `userId = NaN`, which means `ticket.submittedBy !== NaN` is always true and the ownership check is silently bypassed. Static-token bearer requests would be allowed to upload to any ticket. Fix: guard against `NaN` after parseInt, or reject modes other than `"session"` and `"bearer"` (user JWT) on this endpoint.

### LOW
- **`getAttachments` tRPC endpoint missing tenant isolation** (`feedback.ts:280–305`): Admins (`role === "admin"` or `"domain_admin"`) can call `getAttachments` for any ticketId with no tenant filter. A domain_admin for tenant A can read attachments belonging to tenant B's tickets.
- **No `deleteAttachment` endpoint**: There is no way to remove an uploaded attachment. Once uploaded a file cannot be deleted by the submitter and persists indefinitely in storage.
- **No authenticated download endpoint**: `storageResolveUrl` returns a direct R2/S3 URL or a pre-signed URL. There is no server-side proxy that re-checks auth before streaming the file. If URLs are not pre-signed with short TTLs, they are permanently publicly readable.
- **`storagePut` return value `url` not checked for null/undefined** (`feedback.ts:432`): The destructured `url` is passed directly into the response. If `storagePut` returns `{ url: null }` (e.g., local storage mode), the response contains `url: null` with no error.
- **No rate limiting on the upload endpoint**: `feedbackSubmitProcedure` has a rate limit on ticket creation but `registerFeedbackUploadRoutes` has none. An authenticated user can make unlimited concurrent upload requests, potentially exhausting temp disk space or storage quota.
- **`list` admin endpoint missing `conditions` application** (`feedback.ts:148–156`): The `.where()` clause is applied to the query AFTER `.limit()` and `.offset()` are already chained. In Drizzle ORM this is valid (the builder is lazy), but the pattern is fragile. Not a bug today but worth noting.
