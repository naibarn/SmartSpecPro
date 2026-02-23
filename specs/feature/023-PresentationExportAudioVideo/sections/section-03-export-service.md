# Section 03 — Node.js Backend: Export Service

## Implementation Notes (Actual)

**Status:** Complete
**Commit:** see `deep_implement_config.json`

### Deviations from Plan

1. **`as any` cast replaced with type guard + comment** — `resolveAudioUrls` uses a runtime
   `"libraryItemId" in slide.audioTrack` check + `Record<string, unknown>` cast instead of `as any`.

2. **`idempotencyKey` made required** — The plan had it optional; made required in both the service
   interface and the tRPC router input schema, since DB deduplication requires it to be present.

3. **`defaultEnqueueExportJob` does NOT create the DB record** — DB record creation was moved to
   `triggerPresentationExport` (option (a) from the threading note). `defaultEnqueueExportJob`
   focuses solely on: resolveAudioUrls → sign token → POST to Python → return `{ jobId }`.

4. **Error code: `VALIDATION_FAILED` not `NOT_FOUND`** — Python bridge failures use
   `VALIDATION_FAILED` (the plan incorrectly listed `NOT_FOUND`).

5. **Python error sanitization deferred to section-04** — The raw bridge error message is still
   present in `PresentationServiceError` from `defaultEnqueueExportJob`. A TODO comment marks
   the sanitization point; it will be handled at the tRPC router layer in section-04.

6. **Single `getDb()` call** — `triggerPresentationExport` calls `getDb()` once at the top of its
   try block; the result is threaded through DB dedupe check, createExportRecord, and post-enqueue
   update, rather than calling `getDb()` multiple times.

7. **`resolveUrl` fallback helper** — For `resolveAudioUrls`, a local `resolveUrl(sourceUrl)`
   helper calls `storagePresignGet(key, 3600)` and falls back to the raw `sourceUrl` if the
   presign returns null (local/dev storage).

### Actual Files Created/Modified

| File | Action |
|------|--------|
| `apps/web/server/services/presentationExportService.ts` | CREATED |
| `apps/web/server/services/presentationExportService.test.ts` | CREATED (9 tests) |
| `apps/web/server/services/presentationPlaybackExport.ts` | MODIFIED |
| `apps/web/server/services/presentationPlaybackExport.test.ts` | MODIFIED (21 tests total) |
| `apps/web/server/services/presentationWorkflowRegression.test.ts` | MODIFIED (async fix) |
| `apps/web/server/routers/presentation.ts` | MODIFIED (await + schema update) |

### Final Test Count

- `presentationExportService.test.ts`: 9/9 ✓
- `presentationPlaybackExport.test.ts`: 21/21 ✓
- `presentationWorkflowRegression.test.ts`: 11/11 ✓

---

## Overview

This section covers two files:

1. **New file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationExportService.ts` — thin data-access layer for the `presentation_exports` table.
2. **Modified file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationPlaybackExport.ts` — replaces the stub `defaultEnqueueExportJob()` with a real Python HTTP bridge call, adds audio URL resolution, and updates `getPresentationExportStatus()` to use the DB instead of in-memory state.

**Dependencies required before starting this section:**

- Section 01 (Database Migration) must be complete. The `presentation_exports` table and audio JSON columns must exist in the database.
- Section 02 (Shared Contracts Extension) must be complete. The updated `exportId: number`, new audio schemas, and extended `PresentationRenderSpec` types must be available in `@shared/presentation/contracts`.

---

## Tests First

Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationExportService.test.ts` (new file).

Run tests with: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`

### `presentationExportService.test.ts` — stub outline

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

// Import the functions to test once they are implemented:
// import {
//   createExportRecord,
//   updateExportRecord,
//   getExportRecord,
//   getExportRecordByIdempotencyKey,
//   getExportRecordByCeleryTaskId,
// } from "./presentationExportService";

describe("presentationExportService", () => {
  // Uses an in-memory mock DB or test DB connection.
  // Each test should use a fresh mock via vi.fn() for the db argument.

  it("createExportRecord inserts row with status='queued' and progressPct=0", async () => {
    /**
     * Create a record; verify the returned object has status='queued', progressPct=0.
     * Use a mock DB that captures the insert call.
     */
  });

  it("createExportRecord sets idempotencyKey from input", async () => {
    /**
     * Verify idempotencyKey from the input is stored on the record.
     */
  });

  it("updateExportRecord sets only the provided fields (partial update)", async () => {
    /**
     * Call updateExportRecord with { progressPct: 42 } and verify
     * only progressPct changes; other fields remain unchanged.
     * Mock the DB update to capture what values are written.
     */
  });

  it("getExportRecord returns null for unknown id", async () => {
    /**
     * Mock DB query to return empty array; verify null is returned.
     */
  });

  it("getExportRecord returns the inserted row with correct fields", async () => {
    /**
     * Mock DB query to return a record; verify fields match.
     */
  });

  it("getExportRecordByIdempotencyKey returns existing row for a duplicate key", async () => {
    /**
     * Mock DB query to return a matching record; verify it is returned.
     */
  });

  it("getExportRecordByIdempotencyKey returns null for unknown key", async () => {
    /**
     * Mock DB query to return empty array; verify null is returned.
     */
  });

  it("getExportRecordByCeleryTaskId returns correct row", async () => {
    /**
     * Mock DB query to return a record by celeryTaskId; verify it is returned.
     */
  });
});
```

### Extend `presentationPlaybackExport.test.ts`

Add the following test cases to the existing describe block in `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationPlaybackExport.test.ts`:

```typescript
// New imports needed at top of file:
// import { vi } from "vitest";  // already present

// Add these test cases to the existing describe("presentationPlaybackExport") block:

it("triggerPresentationExport calls Python bridge POST /api/v1/presentations/export with correct render spec", async () => {
  /**
   * Mock the Python fetch call via vi.spyOn(global, "fetch").
   * Mock createExportRecord and updateExportRecord from presentationExportService.
   * Verify the fetch is called with:
   *   - URL: ${PYTHON_BACKEND_URL}/api/v1/presentations/export
   *   - method: POST
   *   - Authorization: Bearer <token>
   *   - body containing the render spec
   */
});

it("triggerPresentationExport resolves slide audio URLs via storagePresignGet before calling Python", async () => {
  /**
   * Build a deckDetail where one slide has an audioTrack with libraryItemId.
   * Mock the library item DB lookup and storagePresignGet.
   * Verify the fetch body sent to Python contains audioTrack.url (not libraryItemId).
   */
});

it("triggerPresentationExport stores celeryTaskId returned by Python in DB", async () => {
  /**
   * Mock fetch to return { celery_task_id: "celery-abc-123" }.
   * Mock updateExportRecord.
   * Verify updateExportRecord is called with { celeryTaskId: "celery-abc-123" }.
   */
});

it("triggerPresentationExport returns existing export ID when idempotencyKey matches in-progress DB record", async () => {
  /**
   * Mock getExportRecordByIdempotencyKey to return an existing record with status='queued'.
   * Verify the function returns that record's ID without calling Python again.
   */
});

it("getPresentationExportStatus reads from DB and calls Python GET for live progress", async () => {
  /**
   * Mock getExportRecord to return a record with status='processing', celeryTaskId set.
   * Mock fetch for GET /api/v1/presentations/export/{celeryTaskId}.
   * Verify DB is read and Python is called.
   */
});

it("getPresentationExportStatus updates DB to status='done' and outputUrl when Python returns done", async () => {
  /**
   * Mock Python GET response with state='done', output_url='https://...'.
   * Mock updateExportRecord.
   * Verify updateExportRecord is called with { status: 'done', outputUrl: 'https://...' }.
   */
});

it("getPresentationExportStatus updates DB to status='error' when Python returns failure", async () => {
  /**
   * Mock Python GET response with state='error', error_message='task failed'.
   * Verify updateExportRecord is called with { status: 'error', errorMessage: '...' }.
   */
});

it("Python bridge HTTP error (5xx) is caught and stored as status='error' in DB", async () => {
  /**
   * Mock fetch to return { ok: false, status: 500 }.
   * Verify updateExportRecord is called with status='error'.
   */
});

it("throttle enforcement still applies to 'jpg' and 'pdf' formats", async () => {
  /**
   * Exhaust the per-user throttle using 'jpg' format exports.
   * Verify the next request (pdf or jpg) throws EXPORT_THROTTLED.
   */
});
```

---

## Implementation: `presentationExportService.ts` (New File)

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationExportService.ts`

This is a thin data-access layer. It does not contain business logic. All functions accept a `db` parameter (the Drizzle ORM instance) so they are easily testable without module-level mocking.

### Key imports

```typescript
import { eq } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { presentationExports } from "../../drizzle/schema";
// PresentationExport type from schema (inferred from pgTable)
```

### Types

The `PresentationExport` type is inferred from the `presentationExports` table defined in Section 01. Import it from `../../drizzle/schema`.

Define a `CreateExportRecordInput` interface for the insert payload:

```typescript
export interface CreateExportRecordInput {
  deckId: number;
  userId: number | null;
  tenantId: string;
  format: "png" | "jpg" | "pdf" | "mp4";
  width: number;
  height: number;
  fps?: number;
  quality?: "draft" | "standard" | "high";
  idempotencyKey: string;
}
```

Define a `UpdateExportRecordInput` for partial updates (all fields optional):

```typescript
export interface UpdateExportRecordInput {
  status?: "queued" | "processing" | "done" | "error" | "cancelled";
  progressPct?: number;
  stage?: string | null;
  errorMessage?: string | null;
  outputUrl?: string | null;
  outputStorageKey?: string | null;
  outputBytes?: bigint | null;
  celeryTaskId?: string | null;
}
```

### Function signatures (stubs with docstrings)

```typescript
/**
 * Insert a new export record with status='queued' and progressPct=0.
 * @returns The newly created record.
 */
export async function createExportRecord(
  input: CreateExportRecordInput,
  db: DrizzleDB,
): Promise<PresentationExport>

/**
 * Partially update an export record.
 * Only the fields present in `updates` are written.
 * @returns The updated record, or null if not found.
 */
export async function updateExportRecord(
  id: number,
  updates: UpdateExportRecordInput,
  db: DrizzleDB,
): Promise<PresentationExport | null>

/**
 * Fetch a single export record by its primary key.
 * @returns The record or null if not found.
 */
export async function getExportRecord(
  id: number,
  db: DrizzleDB,
): Promise<PresentationExport | null>

/**
 * Look up an export record by its idempotency key.
 * Used to detect duplicate export requests across server restarts.
 * @returns The record or null if not found.
 */
export async function getExportRecordByIdempotencyKey(
  key: string,
  db: DrizzleDB,
): Promise<PresentationExport | null>

/**
 * Look up an export record by its Celery task ID.
 * Used for reverse-lookup during status polling.
 * @returns The record or null if not found.
 */
export async function getExportRecordByCeleryTaskId(
  taskId: string,
  db: DrizzleDB,
): Promise<PresentationExport | null>
```

### Implementation notes

- Use Drizzle's `.insert(presentationExports).values({...}).returning()` pattern (same as `presentationPersistence.ts`).
- For `updateExportRecord`, use `.update(presentationExports).set({ ...updates, updatedAt: new Date() }).where(eq(presentationExports.id, id)).returning()`.
- All functions return `null` (not throw) when a record is not found — callers decide whether to throw a `PresentationServiceError`.

---

## Implementation: Modify `presentationPlaybackExport.ts`

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationPlaybackExport.ts`

### Changes required

The following describes every change needed to this file. Do NOT rewrite the file — make surgical additions and replacements.

#### 1. Add new imports

Add to the existing import block at the top of the file:

```typescript
import { getDb } from "../db";
import { libraryItems } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { env } from "../_core/env";          // for env.pythonBackendUrl
import { signBearerToken } from "../_core/tokens";
import { storagePresignGet } from "../storage";
import {
  createExportRecord,
  updateExportRecord,
  getExportRecord,
  getExportRecordByIdempotencyKey,
  type CreateExportRecordInput,
} from "./presentationExportService";
import type {
  ResolvedAudioTrack,
  ResolvedProjectAudioTrack,
} from "@shared/presentation/contracts";
```

Note: `signBearerToken` is already exported from `/home/dev/projects/SmartSpecPro/apps/web/server/_core/tokens.ts`. The `storagePresignGet` function is in `/home/dev/projects/SmartSpecPro/apps/web/server/storage.ts`.

#### 2. Extend `TriggerPresentationExportInput`

Update the existing exported interface to reflect the extended format and new fields:

```typescript
export interface TriggerPresentationExportInput {
  deckId: number;
  format: "png" | "jpg" | "pdf" | "mp4";   // was: "png" | "mp4"
  quality?: "draft" | "standard" | "high";
  idempotencyKey: string;                    // was: optional
  width?: number;
  height?: number;
}
```

#### 3. Extend `TriggerPresentationExportDependencies`

Update the `enqueueExportJob` type in the dependencies interface to accept the extended format and new quality parameter:

```typescript
enqueueExportJob?: (
  renderSpec: PresentationRenderSpec,
  format: "png" | "jpg" | "pdf" | "mp4",
  quality?: "draft" | "standard" | "high",
) => Promise<{ jobId: string }>;
```

#### 4. Add `resolveAudioUrls()` private helper

Add this function after the existing `compactExportState` utilities:

```typescript
/**
 * Resolve libraryItemId references in audio tracks to presigned GET URLs.
 * Returns a new render spec with audioTrack.url populated on each slide
 * and on the projectAudioTrack (if present). The libraryItemId field is
 * removed from the resolved track.
 *
 * Uses 1-hour presigned URLs — sufficient for the 12-minute Celery task limit.
 */
async function resolveAudioUrls(
  renderSpec: PresentationRenderSpec,
  db: DrizzleDB,
): Promise<PresentationRenderSpec>
```

Implementation approach:

- Iterate `renderSpec.slides`. For each slide that has an `audioTrack` with a `libraryItemId`, query `libraryItems` by id, get the item's `sourceUrl` or storage key, call `storagePresignGet(storageKey, 3600)`. Build a `ResolvedAudioTrack` (with `url`, `volume`, `startAtMs`, `endAtMs`; without `libraryItemId`).
- Do the same for `renderSpec.projectAudioTrack` if present, producing a `ResolvedProjectAudioTrack`.
- Return a shallow copy of `renderSpec` with the resolved audio fields.

**Important:** The `libraryItems` table stores file metadata. The file content URL is in `sourceUrl`. Use `sourceUrl` as the storage key if it is a relative S3 key; otherwise pass it directly to `storagePresignGet`. If `storagePresignGet` returns `null` (local/forge storage), fall back to using `sourceUrl` directly.

#### 5. Replace `defaultEnqueueExportJob()`

Replace the existing stub implementation entirely. The new implementation:

```typescript
async function defaultEnqueueExportJob(
  renderSpec: PresentationRenderSpec,
  format: "png" | "jpg" | "pdf" | "mp4",
  quality?: "draft" | "standard" | "high",
): Promise<{ jobId: string }>
```

Implementation steps (in order):

1. Call `getDb()` to get the DB connection. If `db` is null, throw a `PresentationServiceError` with code `PRESENTATION_ERROR_CODE.NOT_FOUND` (or a suitable internal error code).

2. Call `resolveAudioUrls(renderSpec, db)` to get the audio-resolved render spec.

3. Call `createExportRecord()` with appropriate inputs (format, quality, deckId from renderSpec, idempotencyKey — since the idempotency key is already checked by the caller in `triggerPresentationExport`, pass a derived key here or thread it through). Note: the idempotencyKey must be threaded through from `triggerPresentationExport` to `defaultEnqueueExportJob`. See threading note below.

4. Build the request body: `{ render_spec: resolvedSpec, format, quality: quality ?? "standard" }`.

5. Generate an internal bearer token: `signBearerToken({ sub: "internal-render-service", scopes: ["internal:render"] }, "30m")`.

6. Call Python via `fetch`:
   ```
   POST ${env.pythonBackendUrl}/api/v1/presentations/export
   Content-Type: application/json
   Authorization: Bearer <token>
   Body: JSON.stringify(requestBody)
   ```

7. If `response.ok` is false, update the DB record to `status='error'` with the HTTP status as error message, then throw.

8. Parse `{ celery_task_id }` from the JSON response.

9. Call `updateExportRecord(record.id, { celeryTaskId: celery_task_id }, db)`.

10. Return `{ jobId: record.id.toString() }`.

**Threading the idempotency key:** The `enqueueExportJob` dependency is invoked inside `triggerPresentationExport`. To make the DB record ID accessible for return, you have two options: (a) move the DB record creation one level up into `triggerPresentationExport` before calling `enqueueExportJob`, or (b) thread additional parameters through `enqueueExportJob`. Option (a) is simpler and preferred — the sequence in `triggerPresentationExport` becomes:

```
1. dedupe check (in-memory fast path)
2. DB dedupe check via getExportRecordByIdempotencyKey (durable path)  ← new
3. throttle enforcement (unchanged)
4. build render spec (unchanged)
5. createExportRecord()  ← moved here, before enqueueExportJob
6. call enqueueExportJob(renderSpec, format, quality)
7. update record with celeryTaskId
8. return { exportId: record.id, ... }
```

If option (a) is used, `defaultEnqueueExportJob` no longer creates the DB record (step 5 above is in `triggerPresentationExport`). Update the function signature to also accept the `record.id` as a parameter, or split responsibilities cleanly.

#### 6. Update `triggerPresentationExport` for DB-backed deduplication

After the fast in-memory dedupe check (existing code), add a DB-backed durable dedupe check:

```typescript
// DB-backed durable deduplication (catches duplicates across server restarts)
if (input.idempotencyKey) {
  const db = await getDb();
  if (db) {
    const existingRecord = await getExportRecordByIdempotencyKey(
      resolveDedupeKey(input, actor),
      db,
    );
    if (existingRecord && (existingRecord.status === "queued" || existingRecord.status === "processing")) {
      // Existing in-progress job found in DB — return its ID without creating a new job
      resolved.recordMetric("presentation.export.deduped", { format: input.format });
      return presentationExportResultSchema.parse({
        schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
        exportId: existingRecord.id,   // number (after Section 02 contract change)
        jobId: existingRecord.celeryTaskId ?? existingRecord.id.toString(),
        deckId: input.deckId,
        format: input.format,
        deduped: true,
        status: existingRecord.status,
        message: "Duplicate export suppressed. Existing job is still active.",
        renderSpec: /* pass existing or reconstruct */ renderSpec,
        warnings: [],
      });
    }
  }
}
```

#### 7. Update `getPresentationExportStatus()`

Replace the current synchronous in-memory implementation with an async version:

```typescript
export async function getPresentationExportStatus(
  exportId: number,      // was: string
  actor?: PresentationActor,
): Promise<PresentationExportStatusResult>
```

Implementation steps:

1. Call `getDb()`. If null, fall back to the existing in-memory `statusRegistry` (for backward compatibility in test environments without a DB).

2. Call `getExportRecord(exportId, db)`. If null, throw `PresentationServiceError(NOT_FOUND, ...)`.

3. Verify tenant/user ownership: check `record.tenantId === actor.tenantId && record.userId === actor.userId`. Throw `PERMISSION_DENIED` if mismatch.

4. If `record.celeryTaskId` is set and `record.status` is `"queued"` or `"processing"`, call Python for fresh progress:
   ```
   GET ${env.pythonBackendUrl}/api/v1/presentations/export/${record.celeryTaskId}
   Authorization: Bearer <internal token>
   ```
   - If response is `{ state: "done", output_url }`: call `updateExportRecord(id, { status: "done", outputUrl: output_url, progressPct: 100 }, db)`.
   - If response is `{ state: "error", error_message }`: call `updateExportRecord(id, { status: "error", errorMessage: error_message }, db)`.
   - If response has `percent` / `stage` updates: call `updateExportRecord(id, { progressPct: percent, stage: stage, status: "processing" }, db)`.
   - If the Python HTTP call fails (network error or non-2xx), do NOT update the DB — just use the existing DB state.

5. Re-fetch the record after any update (or use the update return value).

6. Return `presentationExportStatusResultSchema.parse({ ...record })`.

**Important:** Because `getPresentationExportStatus` is now async, the tRPC router in Section 04 must `await` it. The `getExportStatus` procedure must be changed from `.query()` with a synchronous call to `await getPresentationExportStatus(...)`.

#### 8. Backward compatibility for `resetPresentationExportStateForTests()`

Keep the existing `resetPresentationExportStateForTests()` function — it clears in-memory registries and is used by tests. The DB-backed tests will use a mock DB passed as a dependency.

---

## Key Files Summary

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationExportService.ts` | CREATE — thin DB CRUD layer for `presentation_exports` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationPlaybackExport.ts` | MODIFY — replace stub, add audio resolution, DB-backed status |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationExportService.test.ts` | CREATE — unit tests for new service |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationPlaybackExport.test.ts` | EXTEND — add new test cases for Python bridge and DB flow |

---

## Dependencies and Imports Reference

| Symbol | Source |
|--------|--------|
| `getDb`, `DrizzleDB` | `apps/web/server/db.ts` |
| `presentationExports`, `libraryItems` | `apps/web/drizzle/schema.ts` (added in Section 01) |
| `eq` | `drizzle-orm` |
| `env` | `apps/web/server/_core/env.ts` — `env.pythonBackendUrl` maps to `process.env.PYTHON_BACKEND_URL` |
| `signBearerToken` | `apps/web/server/_core/tokens.ts` |
| `storagePresignGet` | `apps/web/server/storage.ts` — returns `{ url, key } \| null` |
| `PresentationRenderSpec` | `@shared/presentation/contracts` |
| `PRESENTATION_ERROR_CODE` | `@shared/presentation/constants` |
| `PresentationServiceError` | `./presentationService` |

---

## Behavioral Contracts

### Deduplication: Two-layer strategy

1. **In-memory fast path** (`dedupeRegistry` Map): catches duplicate requests within `DEDUPE_WINDOW_MS` (15s) in the same server process. Already implemented — do not change.
2. **DB durable path** (`idempotencyKey` unique index in `presentation_exports`): catches duplicates across server restarts. Added in this section. Checked after the in-memory check misses.

Both layers use the same deduplication key: `${tenantId}:${userId}:${deckId}:${format}:${idempotencyKey}` (from `resolveDedupeKey()`).

### Throttling

Throttle logic is unchanged. It still uses the in-memory `userWindowRegistry` and `deckWindowRegistry`. The throttle must apply to `jpg` and `pdf` formats (the extended format union) — this works automatically because `enforceThrottle` keys on user/deck, not format.

### Error handling in Python bridge

- If `fetch()` throws (network error): catch, call `updateExportRecord(..., { status: "error", errorMessage: "Network error" })`, then re-throw as `PresentationServiceError`.
- If Python returns non-2xx: same as above — update DB to error, then throw.
- If Python returns `{ celery_task_id: "..." }`: success path — update DB with celery ID.

### Presigned URL expiry

- Audio track URLs: `storagePresignGet(key, 3600)` — 1-hour TTL. Sufficient for the 12-minute Celery task.
- Export output URL (set when status transitions to `done`): `storagePresignGet(outputStorageKey, 86400)` — 24-hour TTL. Set by the Python backend's `/api/v1/presentations/export/{taskId}` GET response, not by Node.js.

---

## Verification Checklist

After implementing this section:

- [ ] `pnpm test` passes all new and existing tests in `presentationExportService.test.ts`
- [ ] `pnpm test` passes extended tests in `presentationPlaybackExport.test.ts`
- [ ] No regressions in the existing 12 test cases in `presentationPlaybackExport.test.ts`
- [ ] `pnpm check` (TypeScript) reports no new type errors
- [ ] `getPresentationExportStatus` signature change (sync → async, `string` → `number`) is updated in all call sites (the tRPC router will be updated in Section 04)