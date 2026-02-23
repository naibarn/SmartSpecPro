# Code Review Interview — Section 03: Export Service

**Date:** 2026-02-23
**Section:** section-03-export-service
**Reviewer:** deep-implement:code-reviewer subagent

---

## Items Requiring User Decision

### 1. Type Safety in `resolveAudioUrls` — `as any` Cast

**Finding (HIGH):** The `resolveAudioUrls` helper used `as any` to access `libraryItemId` on
`ResolvedAudioTrack`, which the type system doesn't carry at runtime for unresolved tracks.

**Decision asked:** Add a type guard + comment, or keep `as any` for brevity?

**User decision:** Add a type guard + comment (Recommended)

**Resolution:** Applied. Uses:
```typescript
const hasLibraryItemId =
  "libraryItemId" in slide.audioTrack &&
  typeof (slide.audioTrack as Record<string, unknown>).libraryItemId === "number";
if (!hasLibraryItemId) return slide;
const libraryItemId = (slide.audioTrack as Record<string, unknown>).libraryItemId as number;
```
A comment explains why the runtime shape differs from the declared type.

---

### 2. Missing Tests for New Code Paths

**Finding (MEDIUM):** No tests covered `resolveAudioUrls` or the DB-backed path of
`getPresentationExportStatus`.

**Decision asked:** Add tests now, or defer to a later section?

**User decision:** Yes, add them now (Recommended)

**Resolution:** Applied. Added:
- `triggerPresentationExport calls Python bridge POST /api/v1/presentations/export with correct render spec`
- `triggerPresentationExport stores celeryTaskId returned by Python in DB`
- `triggerPresentationExport returns existing export ID when idempotencyKey matches in-progress DB record`
- `throttle enforcement still applies to 'jpg' and 'pdf' formats`
- `getPresentationExportStatus reads from DB and calls Python GET for live progress`
- `getPresentationExportStatus updates DB to status='done' when Python returns done`
- `getPresentationExportStatus updates DB to status='error' when Python returns failure`
- `getPresentationExportStatus falls back to in-memory state when getDb returns null`
- `getPresentationExportStatus Python HTTP error is swallowed and existing DB state is returned`

Total new tests: 9 (on top of 12 pre-existing = 21 total)

---

### 3. Python Error Message Exposed to Client

**Finding (MEDIUM):** The Python bridge error message is currently surfaced directly in the
`PresentationServiceError` thrown from `defaultEnqueueExportJob`. This message ultimately
propagates to the tRPC response, potentially leaking internal stack traces.

**Decision asked:** Sanitize now, or at the router layer in section-04?

**User decision:** At the router layer in section-04 (Recommended)

**Resolution:** Deferred. Section-04 tRPC router will sanitize error messages before returning
to the client. A TODO comment was added at the throw site:
```typescript
// TODO(section-04): router will sanitize this message before returning to client
```

---

## Auto-Fixes Applied (No User Input Required)

### 4. Wrong Error Code: `NOT_FOUND` → `VALIDATION_FAILED`

**Finding (HIGH):** `defaultEnqueueExportJob` threw `PRESENTATION_ERROR_CODE.NOT_FOUND` when the
Python bridge returned a non-2xx response. Semantically wrong — `NOT_FOUND` implies a missing
resource, but this is a bridge/gateway failure.

**Fix:** Changed to `PRESENTATION_ERROR_CODE.VALIDATION_FAILED`.

---

### 5. Multiple `getDb()` Calls in `triggerPresentationExport`

**Finding (HIGH):** Original code called `getDb()` twice — once for deduplication and once for
DB record creation — each with independent null checks. This risked inconsistent behavior if
the DB connection dropped between calls.

**Fix:** Refactored to a single `const db = await getDb();` at the top of the try block,
used throughout.

---

### 6. Stale TODO Comment

**Finding (LOW):** The in-memory ID counter had a stale TODO comment referencing an old
implementation approach.

**Fix:** Replaced with: `"Fallback in-memory ID counter for test environments without a DB connection."`

---

### 7. Async Signature Change — All Callers Updated

**Finding (HIGH):** Changing `getPresentationExportStatus` from sync to async required updating
all callers to add `await`.

**Fix:** Updated:
- `apps/web/server/services/presentationPlaybackExport.test.ts` — all test calls updated
- `apps/web/server/services/presentationWorkflowRegression.test.ts` — workflow test updated
- `apps/web/server/routers/presentation.ts` — tRPC handler updated

---

### 8. `idempotencyKey` Made Required

**Finding (MEDIUM):** The `TriggerPresentationExportInput.idempotencyKey` was optional in the
original spec, but deduplication relies on it being present for DB-backed idempotency. The router
schema was updated to require it.

**Fix:** Made `idempotencyKey` required in both the service input type and the tRPC router schema.

---

## Final Test Results

All 41 tests pass:
- `presentationExportService.test.ts`: 9/9 ✓
- `presentationPlaybackExport.test.ts`: 21/21 ✓
- `presentationWorkflowRegression.test.ts`: 11/11 ✓
