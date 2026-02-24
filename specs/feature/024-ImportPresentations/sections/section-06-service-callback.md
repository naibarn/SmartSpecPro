# Section 06: Node.js — Service Layer + Callback Handler

## Overview

This section implements two tightly-coupled pieces that execute when Python signals that an import has completed:

1. `apps/web/server/services/presentationImportService.ts` — orchestrates deck creation from an `ImportResult` (creates library item, deck, slides, source attachment, and finalizes the conversion record).
2. Internal Express route `POST /api/internal/presentation-import/callback` — the handler is extracted to `apps/web/server/routes/presentationImportCallback.ts` for testability, and registered in `apps/web/server/_core/index.ts` via `app.post(...)`. This callback triggers deck creation on success or marks the record as failed.

**Dependencies (must be complete before starting this section):**
- Section 01 (DB Migration): `presentationConversionRecords` table must have `status`, `progress`, `userId`, `slidesUrl` columns, and `sourceItemId`/`deckLibraryItemId`/`deckId` must be nullable.
- Section 05 (tRPC Router): The conversion record is created by `startImport` before the callback arrives; this section only reads and updates it.

**Test command:** `cd apps/web && pnpm test`

---

## Tests First

**File:** `apps/web/server/services/presentationImportService.test.ts` (new file)

Framework: Vitest. Mock all Drizzle DB operations and presentation service calls.

### Test stubs for `createDeckFromImportResult`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Drizzle DB insert/update operations
// Mock createPresentationDeckForLibraryItem from presentationService
// Mock addSlideToDeck from presentationService

describe("createDeckFromImportResult", () => {
  it("creates a libraryItem Drizzle insert with itemType='presentation' and status='active'");
  it("calls createPresentationDeckForLibraryItem with the new libraryItemId");
  it("calls addSlideToDeck for each slide with incrementing expectedVersion starting at 0");
  it("inserts a presentationSourceAttachments row linking the deck to its source");
  it("updates presentationConversionRecords with deckId, deckLibraryItemId, status='done', progress=100");
  it("truncates slides to 200 when more than 200 slides are provided");
  it("returns { deckLibraryItemId } on success");
});
```

### Test stubs for the callback route

**File:** `apps/web/server/routes/presentationImportCallback.test.ts` (new file, or inline in route file's test)

```typescript
import { describe, it, expect, vi } from "vitest";

// Mock createDeckFromImportResult from presentationImportService
// Mock Drizzle DB queries (read conversion record, update status)
// Use supertest or equivalent to test the Express route

describe("POST /api/internal/presentation-import/callback", () => {
  it("returns 401 with empty body when Authorization header is missing");
  it("returns 401 when the Bearer token does not match ENV.webGatewayToken");
  it("returns 400 when body fails Zod validation (malformed body)");
  it("returns 200 immediately without calling createDeckFromImportResult when status='done' and record is already done (idempotency)");
  it("returns 200 and calls createDeckFromImportResult when status='done' and record is not yet done");
  it("updates presentationConversionRecords to status='failed' and returns 200 when status='failed'");
  it("responds 200 even when createDeckFromImportResult throws (logs error, does not bubble up)");
});
```

---

## Implementation Details

### File: `apps/web/server/services/presentationImportService.ts` (new)

This service bridges the Python import result to the presentation domain model. It must be usable from the callback route without a tRPC context (there is no logged-in user making this request — Python is calling back).

#### Imports required

```typescript
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  libraryItems,
  presentationConversionRecords,
  presentationSourceAttachments,
} from "../../drizzle/schema";
import {
  createPresentationDeckForLibraryItem,
  addSlideToDeck,
  type PresentationActor,
} from "./presentationService";
import { logger } from "../_core/logger"; // use the existing structured logger
```

#### Exported function signature

```typescript
export interface CreateDeckFromImportResultParams {
  conversionId: number;
  tenantId: string;           // varchar(36), matches presentationConversionRecords.tenantId
  userId: number;
  slides: Record<string, unknown>[];   // raw PresentationSlideContent objects from Python
  title: string;
  fidelityWarnings: string[];
  sourceFormat: string;              // e.g. "pptx" or "google_slides"
  sourceLibraryItemId?: number | null;
}

export async function createDeckFromImportResult(
  params: CreateDeckFromImportResultParams,
): Promise<{ deckLibraryItemId: number }> { ... }
```

#### Step-by-step implementation

1. **Build the actor** — construct manually from stored `userId` and `tenantId`. Role can be `"user"`. This actor is used for all `presentationService` calls that enforce tenant isolation:
   ```typescript
   const actor: PresentationActor = {
     userId: params.userId,
     tenantId: params.tenantId,
     role: "user",
   };
   ```

2. **Insert the library item** — use Drizzle to insert directly into `libraryItems`. The `source` field should be `"import"`. Return the new `id` as `libraryItemId`:
   ```typescript
   const db = await getDb();
   const [libraryItem] = await db
     .insert(libraryItems)
     .values({
       tenantId: params.tenantId,
       ownerUserId: params.userId,
       itemType: "presentation",
       source: "import",
       title: params.title,
       status: "ready",            // use existing libraryItemStatusEnum values
       visibility: "private",
       metadata: {},
     })
     .returning({ id: libraryItems.id });
   const libraryItemId = libraryItem.id;
   ```

3. **Create the deck** — call `createPresentationDeckForLibraryItem`:
   ```typescript
   const { deck } = await createPresentationDeckForLibraryItem(
     { libraryItemId, title: params.title },
     actor,
   );
   const deckId = deck.id;
   ```

4. **Enforce slide limit** — if `params.slides.length > 200`, truncate to the first 200 and log a warning. Do not throw; truncation is silent (the fidelityWarnings list may already contain a note from Python if the truncation happened there):
   ```typescript
   const slides = params.slides.length > 200
     ? params.slides.slice(0, 200)
     : params.slides;
   if (params.slides.length > 200) {
     logger.warn("presentationImportService: slides truncated", {
       conversionId: params.conversionId,
       original: params.slides.length,
       truncated: 200,
     });
   }
   ```

5. **Add slides** — iterate slides sequentially (NOT in parallel — `addSlideToDeck` uses optimistic locking via `expectedVersion`). Start `expectedVersion` at `0` and increment after each successful call:
   ```typescript
   let expectedVersion = 0;
   for (const slideContent of slides) {
     await addSlideToDeck(
       { deckId, expectedVersion, slideContent },
       actor,
     );
     expectedVersion++;
   }
   ```

6. **Insert source attachment** — records provenance for the deck:
   ```typescript
   await db.insert(presentationSourceAttachments).values({
     deckId,
     sourceLibraryItemId: params.sourceLibraryItemId ?? null,
     sourceFormat: params.sourceFormat,
     conversionStatus: "done",
     partialFidelity: params.fidelityWarnings.length > 0,
     fidelityWarnings: params.fidelityWarnings,
   });
   ```

7. **Update conversion record** — mark the conversion done with full FK pointers:
   ```typescript
   await db
     .update(presentationConversionRecords)
     .set({
       deckId,
       deckLibraryItemId: libraryItemId,
       status: "done",
       progress: 100,
       fidelityWarnings: params.fidelityWarnings,
       updatedAt: new Date(),
     })
     .where(eq(presentationConversionRecords.id, params.conversionId));
   ```

8. **Return** `{ deckLibraryItemId: libraryItemId }`.

---

### Internal Express Route: `POST /api/internal/presentation-import/callback`

The callback route follows the exact same pattern as the existing internal routes in `apps/web/server/_core/index.ts` (see `/api/internal/credits/charge` and `/api/internal/google-drive/cleanup` for reference). Add the new route to that same file.

#### Location

Register in `apps/web/server/_core/index.ts`, alongside the other `app.post("/api/internal/...")` routes (~line 376–480 in the current file). Add it after the Google Drive cleanup block.

#### Authentication

Identical to the other internal routes — Bearer token comparison against `ENV.webGatewayToken`:

```typescript
const authHeader = req.headers.authorization || "";
if (!authHeader.startsWith("Bearer ") || !ENV.webGatewayToken) {
  return res.status(401).end();
}
const token = authHeader.slice(7);
if (token !== ENV.webGatewayToken) {
  return res.status(401).end();
}
```

Return 401 **without a body** on auth failure — do not expose the expected token value or any error detail.

#### Body validation (Zod)

```typescript
import { z } from "zod";

const callbackBodySchema = z.object({
  conversionId: z.number().int().positive(),
  status: z.enum(["done", "failed"]),
  slides: z.array(z.record(z.unknown())).optional(),
  fidelityWarnings: z.array(z.string()).max(25).optional(),
  error: z.string().optional(),
});
```

Parse the body after auth passes. On Zod parse failure, return 400.

#### Idempotency check

Before doing any meaningful work, read the conversion record and check its current status:

```typescript
const [record] = await db
  .select()
  .from(presentationConversionRecords)
  .where(eq(presentationConversionRecords.id, body.conversionId))
  .limit(1);

if (!record) {
  logger.warn("presentation-import callback: unknown conversionId", { conversionId: body.conversionId });
  return res.status(200).json({ ok: true }); // respond 200 — don't leak existence
}

if (record.status === "done") {
  // Celery retry delivered a duplicate callback — safe to ignore
  return res.status(200).json({ ok: true, deckLibraryItemId: record.deckLibraryItemId });
}
```

#### On `status === "done"`

1. Derive the title: if the conversion record has a title-bearing field (e.g., sourced from library item), read it; otherwise default to `"Imported Presentation"`. The simplest approach is to read the library item title when `sourceItemId` is set, or use the default.
2. Call `createDeckFromImportResult(...)` with params read from the conversion record (`tenantId`, `userId`, `sourceFormat`, `sourceItemId` as `sourceLibraryItemId`).
3. Respond `200` with `{ ok: true, deckLibraryItemId }`.
4. Wrap in `try/catch` — if `createDeckFromImportResult` throws, log the error and respond `200 { ok: false, error: "internal" }` rather than letting Python retry endlessly.

#### On `status === "failed"`

Update the conversion record and respond 200:

```typescript
await db
  .update(presentationConversionRecords)
  .set({
    status: "failed",
    error: body.error ?? "Unknown error",
    updatedAt: new Date(),
  })
  .where(eq(presentationConversionRecords.id, body.conversionId));

return res.status(200).json({ ok: true });
```

#### Always respond 200

Python's `_notify_nodejs` does not retry on success. The route must always respond 200 (even on internal errors) so that Celery does not interpret a 500 as a reason to restart the task. Log errors internally with `logger.error(...)`.

---

## Schema Context

The relevant Drizzle tables (already defined in `apps/web/drizzle/schema.ts`):

**`libraryItems`** — `id`, `tenantId`, `ownerUserId`, `itemType`, `source`, `title`, `status` (enum: `"ready"`, `"processing"`, `"error"`, `"deleted"`), `visibility`, `metadata`, `createdAt`, `updatedAt`.

**`presentationConversionRecords`** — after the Section 01 migration: `id`, `tenantId`, `userId` (new), `sourceItemId` (now nullable), `sourceFormat`, `idempotencyKey`, `deckLibraryItemId` (now nullable), `deckId` (now nullable), `status` (new, default `"queued"`), `progress` (new, default `0`), `slidesUrl` (new), `fidelityWarnings`, `expiresAt`, `createdAt`, `updatedAt`.

**`presentationSourceAttachments`** — `id`, `deckId`, `sourceLibraryItemId` (nullable), `sourceFormat`, `conversionStatus`, `partialFidelity`, `fidelityWarnings`, `createdAt`, `updatedAt`.

**Note on `tenantId` type:** `presentationConversionRecords.tenantId` is `varchar(36)` (a string UUID), not an integer. Ensure `actor.tenantId` is passed as a string throughout. The `resolveTenantIdVarchar` helper from `apps/web/server/services/tenantContext.ts` can normalize this if needed, but at callback time the value comes directly from the DB and is already a string.

---

## `PresentationActor` Interface Reference

Defined in `apps/web/server/services/presentationService.ts`:

```typescript
export interface PresentationActor extends LibraryActor {
  tenantId: string;   // varchar UUID
}
// LibraryActor has: userId: number; role?: string | null;
```

The service constructs the actor directly from DB-stored values, not from an HTTP session. This is intentional — Python's callback body is untrusted and must not supply `userId` or `tenantId` directly. These values are read from the DB record that was written by Node.js at `startImport` time.

---

## `createPresentationDeckForLibraryItem` Behavior Note

This function (in `presentationService.ts`) calls `resolveReadableLibraryItem` internally, which reads the `libraryItems` table. Because the library item is inserted in step 2 of `createDeckFromImportResult` and `createPresentationDeckForLibraryItem` is called in step 3, the item must already exist with `status: "ready"` and `visibility: "private"` for the read to succeed. Ensure the insert in step 2 sets both fields correctly.

---

## ENV Token Reference

`ENV.webGatewayToken` is sourced from `SMARTSPEC_WEB_GATEWAY_TOKEN` or `WEB_GATEWAY_TOKEN` environment variables, accessed via `apps/web/server/_core/env.ts`. The same token is used by the existing `/api/internal/credits/charge` and `/api/internal/google-drive/cleanup` routes.

Python sets this as `SMARTSPEC_WEB_GATEWAY_TOKEN` in its own environment and sends it as `Authorization: Bearer {token}`.

---

## Security Requirements for This Section

- Auth check happens **before** body parsing — do not parse the body for unauthenticated requests.
- Return 401 with **no body** on auth failure (no JSON, no error detail).
- Body is parsed and validated with Zod **after** auth passes.
- The idempotency check prevents duplicate deck creation when Celery retries the task and re-delivers the callback.
- Actor is constructed from **DB-stored** `userId` and `tenantId` from the conversion record — never from the callback request body.
- The `deckLibraryItemId` and `deckId` returned in the response come from the service result, not from the callback body.

---

## Files Created / Modified

| File | Action |
|------|--------|
| `apps/web/server/services/presentationImportService.ts` | Created |
| `apps/web/server/routes/presentationImportCallback.ts` | Created (handler extracted for testability) |
| `apps/web/server/_core/index.ts` | Modified: `app.post("/api/internal/presentation-import/callback", presentationImportCallbackHandler)` after Google Drive cleanup block |
| `apps/web/server/services/presentationImportService.test.ts` | Created (7 tests) |
| `apps/web/server/routes/presentationImportCallback.test.ts` | Created (7 tests via supertest) |

## Implementation Deviations from Plan

1. **Route extracted to `routes/presentationImportCallback.ts`** instead of inline in `index.ts` — enables supertest-based unit tests.
2. **DB transaction added** to `createDeckFromImportResult` — wraps all 5 writes so a mid-flight failure rolls back cleanly and prevents duplicate deck creation on Celery retry. `tx` is passed as `any` to service functions (PgTransaction is operationally identical to DbClient).
3. **Timing-safe token comparison** (`crypto.timingSafeEqual`) used instead of string equality.
4. **Terminal status guard extended** — idempotency check covers `done | failed | cancelled` (not just `done`).
5. **Slides array bounded** with `.max(201)` in Zod schema (202+ payloads rejected at boundary).
6. **Failed-path DB update** wrapped in try/catch to preserve the "always respond 200" contract.
7. **Logger**: `debugLog`/`debugError` from `_core/logger.ts` — the actual exports; spec incorrectly referenced a `logger` object.

## Test Results
14 tests pass: 7 service unit tests + 7 callback route tests (via supertest). TypeScript check clean.

---

## Verification

After implementing:

```bash
cd apps/web && pnpm check   # TypeScript must pass with no errors
cd apps/web && pnpm test    # All tests must pass
```

Manually verify idempotency: trigger the callback route twice with the same `conversionId` after the first call sets status to `"done"`. The second call must return `200 { ok: true }` without calling `createDeckFromImportResult` again (confirm by checking that only one deck exists for the conversion).