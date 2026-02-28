# Code Review: section-06-service-callback

## Findings

### [H-1] No DB transaction in createDeckFromImportResult — duplicate records on Celery retry
`presentationImportService.ts` performs 5+ sequential DB writes without a transaction. If `addSlideToDeck` fails on slide 3 of 10, the `libraryItems` row is committed but the conversion record stays at "queued"/"processing". On the next Celery retry, `createDeckFromImportResult` is called again (idempotency guard only checks `status === 'done'`), creating duplicate library items and decks. Must wrap all writes in `db.transaction()` and pass `tx` to service functions that accept `dbClient?`.

### [H-2] Timing-unsafe token comparison
`presentationImportCallback.ts` uses plain `token !== ENV.webGatewayToken` string comparison (short-circuits on first differing byte). Codebase already uses `crypto.timingSafeEqual` in `openaiCompatGateway.ts` and `webhooks.ts`. Fix: `crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ENV.webGatewayToken))`.

### [H-3] Missing guard for failed/cancelled status in idempotency check
`presentationImportCallback.ts` only skips processing when `record.status === 'done'`. A late Celery retry with status='done' on a record marked 'cancelled' or 'failed' falls through to `createDeckFromImportResult`, overwriting a terminal state. Fix: early return for 'done' | 'failed' | 'cancelled'.

### [M-1] Unbounded slides array in Zod schema
`callbackBodySchema` has `z.array(z.record(z.unknown())).optional()` with no `.max()`. `fidelityWarnings` correctly applies `.max(25)`. An adversarial payload can deliver thousands of slides, all deserialized into memory before truncation. Fix: add `.max(201)`.

### [M-2] Failed-path update not wrapped in try/catch
`presentationImportCallback.ts` lines 395–403: the `db.update()` for `status='failed'` is not try/caught. A transient DB error propagates as an unhandled async rejection → 500 → Celery retry. The design goal is "always respond 200". Fix: wrap in try/catch.

### [M-3] Using debug logger instead of structured logger
Spec imported `logger` from `../_core/logger`, but `logger.ts` only exports `debugLog`/`debugError` (no `logger` object). Implementation correctly uses the actual exports. **Not a bug** — spec was wrong about the import name. Let go.

### [M-4] Route in separate file vs inline in index.ts
Spec said inline; implementation uses a separate `routes/presentationImportCallback.ts`. Acceptable deviation — spec explicitly said "new file, or inline in route file's test". Let go.

### [M-5] Title derivation outside service
Title lookup from `sourceItemId` is in the callback handler, not in the service. Minor design issue; doesn't affect correctness for this iteration. Let go.

### [L-1] Test description says 'active' but asserts 'ready'
Test description in `presentationImportService.test.ts` line 36 says `status='active'` (copied from spec stub), but actual assertion checks `status: 'ready'`. Fix: correct test description.

### [L-2] Missing `and` import
Unused currently. Not a bug. Let go.

### [L-3] 401 response body inconsistency with other internal routes
Other internal routes return `{ success: false, error: 'Unauthorized' }` on 401. This route returns no body per spec. Implementation matches spec and is more secure. Let go.
