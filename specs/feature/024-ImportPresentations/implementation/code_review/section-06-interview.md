# Code Review Interview: section-06-service-callback

## Issues Found and Resolutions

### H1: No DB transaction — duplicate records on Celery retry
**Decision:** Add transaction (user approved)
**Action:** Wrapped all writes in `db.transaction(async (tx) => {...})`. Pass `tx as any` to `createPresentationDeckForLibraryItem` and `addSlideToDeck` (both accept optional `dbClient`). `PgTransaction` lacks the `$client` property TypeScript requires on `DbClient`, but is operationally identical — `as any` cast is safe here. Updated service tests to mock `db.transaction` calling the callback with the same mock object.

### H2: Timing-unsafe token comparison
**Decision:** Auto-fix
**Action:** Replaced `token !== ENV.webGatewayToken` with `crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ENV.webGatewayToken))` plus a length guard. Added `import crypto from "crypto"`. Matches the pattern used in `openaiCompatGateway.ts` and `webhooks.ts`.

### H3: Missing guard for failed/cancelled status in idempotency check
**Decision:** Auto-fix
**Action:** Changed `if (record.status === "done")` to `if (record.status === "done" || record.status === "failed" || record.status === "cancelled")`. A late Celery retry on a cancelled record now returns 200 without overwriting the terminal state.

### M1: Unbounded slides array in Zod schema
**Decision:** Auto-fix
**Action:** Added `.max(201)` to `slides` in `callbackBodySchema`. Payloads with 202+ slides are rejected at the boundary with a 400; the 200-slide truncation in the service handles the edge case where exactly 201 are sent.

### M2: Failed-path update not wrapped in try/catch
**Decision:** Auto-fix
**Action:** Wrapped the `db.update(presentationConversionRecords)` in the `status === "failed"` branch with try/catch + `debugError` log. A transient DB error no longer propagates as a 500, preserving the "always respond 200" contract.

## Items Let Go

- **M3** (debug logger vs structured logger): `logger.ts` only exports `debugLog`/`debugError` — spec was wrong about the import shape. Implementation uses the actual API correctly.
- **M4** (separate route file vs inline): Spec explicitly said "new file, or inline" — separate file is the better choice for testability.
- **M5** (title lookup outside service): Minor design concern; doesn't affect correctness.
- **L2** (missing `and` import): Not needed; no compound where-clauses in this service.
- **L3** (401 response body inconsistency): Spec explicitly mandates no body on 401; implementation is correct.

## Final Status
All 14 tests pass (7 service + 7 route). TypeScript check clean.
