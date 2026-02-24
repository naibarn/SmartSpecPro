# Section 05: Node.js — tRPC Router

## Overview

This section implements the `presentationImport` tRPC router that exposes three procedures to the frontend: `startImport`, `getImportStatus`, and `cancelImport`. The router creates conversion records in the database, delegates processing to the Python backend, and enforces tenant isolation on all reads/writes.

**Files created:**
- `apps/web/server/routers/presentationImport.ts` — router implementation
- `apps/web/server/routers/presentationImport.test.ts` — 12 unit tests
- `apps/web/drizzle/0038_flashy_frog_thor.sql` — migration adding `error` column

**Files modified:**
- `apps/web/server/routers.ts` — registered `presentationImport: presentationImportRouter`
- `apps/web/drizzle/schema.ts` — added nullable `error: text("error")` column to `presentationConversionRecords`

**Dependencies:**
- Section 01 must be complete (DB schema has `status`, `progress`, `userId`, `slidesUrl` columns on `presentationConversionRecords`; `sourceItemId`, `deckLibraryItemId`, `deckId` are nullable)
- Section 04 must be complete (Python `POST /api/v1/presentation-import/start` and `DELETE /api/v1/presentation-import/{conversionId}` endpoints exist)

## Deviations from Original Plan

### Google OAuth pre-check removed
The plan specified a `PRECONDITION_FAILED` check for Google Slides OAuth before creating the DB record. This was removed after code review because it required synthesizing a user JWT token (same secret as real sessions — token confusion risk). Python's Celery task now handles OAuth validation and surfaces errors via the callback handler using the new `error` column.

### `error` column added to schema
Plan referenced `record.error` in `getImportStatus` response but Section 01 didn't add the column. Added `error: text("error")` (nullable) to the schema and applied migration `0038_flashy_frog_thor.sql`. `getImportStatus` now returns `error: record.error ?? null`.

### `cancelImport` UPDATE filtered by both `id` AND `tenantId`
The original spec only showed `WHERE id = conversionId`. Implementation uses `and(eq(id), eq(tenantId))` as a second guard against cross-tenant cancellation (IDOR defence-in-depth).

## Tests (12 total)

- `startImport`: 5 tests — validation errors, google_slides flow, PPTX insert fields, Python call payload, success response
- `getImportStatus`: 3 tests — own-tenant success (incl. error field), cross-tenant NOT_FOUND, nonexistent NOT_FOUND
- `cancelImport`: 3 tests — early-return for done/failed, UPDATE + Python cancel for in-progress

---

## Tests First

Write these tests in `apps/web/server/routers/presentationImport.test.ts` before implementing the router.

**Test command:** `cd apps/web && pnpm test`

Follow the exact mocking pattern from `apps/web/server/routers/presentation.test.ts`: mock `../_core/trpc` to return thin procedure stubs, then mock Drizzle DB calls and the Python HTTP client separately.

### Test stubs

```typescript
// apps/web/server/routers/presentationImport.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// Mock the tRPC core (same pattern as presentation.test.ts)
vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

// Mock DB insert/select/update
// Mock fetch (Python HTTP calls)
// Mock resolvePresentationTenantId / toPresentationActor helpers

describe("presentationImport router", () => {
  describe("startImport", () => {
    it("throws validation error when sourceType=pptx but sourceLibraryItemId is missing");
    it("throws validation error when sourceType=google_slides but slidesUrl is missing");
    it("throws PRECONDITION_FAILED when Google Slides source and OAuth not connected");
    it("inserts presentationConversionRecords row with correct fields for PPTX");
    it("calls Python API with conversionId, userId, tenantId for PPTX");
    it("returns { conversionId } on success");
  });

  describe("getImportStatus", () => {
    it("returns status + progress for own tenant's record");
    it("throws NOT_FOUND when conversionId belongs to a different tenant");
    it("throws NOT_FOUND when conversionId does not exist");
  });

  describe("cancelImport", () => {
    it("returns { cancelled: true } early without DB update when record is already done");
    it("returns { cancelled: true } early without DB update when record is already failed");
    it("updates status to cancelled and calls Python cancel endpoint for in-progress record");
  });
});
```

**Key mock targets:**
- `../../drizzle/schema` — mock `presentationConversionRecords` table
- `../db` — mock `getDb()` to return a fake Drizzle client with `insert`, `select`, `update` spy methods
- `node-fetch` or global `fetch` — mock the Python backend HTTP calls
- `../services/tenantContext` — mock `resolveTenantIdVarchar` to return a controlled string

---

## Implementation

### File: `apps/web/server/routers/presentationImport.ts`

Look at `apps/web/server/routers/presentation.ts` for the exact import style and the `toPresentationActor` / `resolvePresentationTenantId` helpers — those utilities live in `presentation.ts` and should be copied or re-implemented in the new router file (they are not exported from `presentation.ts`).

```typescript
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { protectedProcedure, router } from "../_core/trpc";
import { isPresentationFeatureEnabled } from "@shared/presentation/constants";
import { getDb } from "../db";
import { presentationConversionRecords } from "../../drizzle/schema";
import { resolveTenantIdVarchar } from "../services/tenantContext";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";
const PYTHON_INTERNAL_TOKEN = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? "";

// ── Local helpers (same pattern as presentation.ts) ───────────────────────

function resolvePresentationTenantId(ctx: {
  tenantId: unknown;
  user: { currentTenantId?: unknown };
}): string {
  /** Resolves tenantId from the request context. Throws BAD_REQUEST if absent. */
}

function toPresentationActor(ctx: {
  tenantId: unknown;
  user: { id: number; role?: string | null; currentTenantId?: unknown };
}) {
  /** Builds a PresentationActor-compatible object from tRPC context. */
}

function ensureFeatureEnabled(): void {
  /** Throws FORBIDDEN if isPresentationFeatureEnabled() returns false. */
}

// ── Input schemas ─────────────────────────────────────────────────────────

const startImportInputSchema = z
  .object({
    sourceType: z.enum(["pptx", "google_slides"]),
    sourceLibraryItemId: z.number().int().positive().optional(),
    slidesUrl: z.string().url().optional(),
    title: z.string().max(500).optional(),
  })
  .refine(
    (d) => (d.sourceType === "pptx" ? !!d.sourceLibraryItemId : !!d.slidesUrl),
    {
      message:
        "sourceLibraryItemId required for pptx; slidesUrl required for google_slides",
    },
  );

const conversionIdInputSchema = z.object({
  conversionId: z.number().int().positive(),
});

// ── Router ────────────────────────────────────────────────────────────────

export const presentationImportRouter = router({
  /**
   * Start a new presentation import job.
   *
   * For PPTX: expects sourceLibraryItemId pointing to an existing library item
   * that holds the uploaded .pptx file.
   * For Google Slides: expects a slidesUrl. Python retrieves the OAuth token
   * itself via GoogleTokenService — Node never touches the access token.
   *
   * Creates a presentationConversionRecords row (status="queued"), then POSTs
   * to the Python backend to enqueue the Celery task. Returns the conversionId
   * so the frontend can begin polling.
   */
  startImport: protectedProcedure
    .input(startImportInputSchema)
    .mutation(async ({ input, ctx }) => {
      ensureFeatureEnabled();

      const tenantId = resolvePresentationTenantId(ctx);
      const actor = toPresentationActor(ctx);

      // Google Slides: verify OAuth is connected before creating the DB record.
      // Check by calling Python's connection status endpoint — the token lives
      // entirely in Python (never forwarded here).
      if (input.sourceType === "google_slides") {
        // GET http://localhost:8000/api/v1/oauth/google/status?user_id={userId}
        // If not connected, throw PRECONDITION_FAILED.
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Insert conversion record with status="queued".
      // Required fields per Section 01 schema:
      //   tenantId, userId, sourceItemId (nullable), slidesUrl (nullable),
      //   sourceFormat, idempotencyKey, status, progress, expiresAt
      const [record] = await db
        .insert(presentationConversionRecords)
        .values({
          tenantId,
          userId: actor.userId,
          sourceItemId: input.sourceLibraryItemId ?? null,
          slidesUrl: input.slidesUrl ?? null,
          sourceFormat: input.sourceType,
          idempotencyKey: crypto.randomUUID(),
          status: "queued",
          progress: 0,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .returning({ id: presentationConversionRecords.id });

      const conversionId = record.id;

      // POST to Python to enqueue the Celery task.
      // Python validates source_type and decides which importer to use.
      // Never forward an access token — Python uses GoogleTokenService internally.
      const pyRes = await fetch(
        `${PYTHON_BACKEND_URL}/api/v1/presentation-import/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${PYTHON_INTERNAL_TOKEN}`,
          },
          body: JSON.stringify({
            conversion_id: conversionId,
            source_type: input.sourceType,
            source_library_item_id: input.sourceLibraryItemId ?? null,
            slides_url: input.slidesUrl ?? null,
            user_id: actor.userId,
            tenant_id: parseInt(tenantId, 10),
          }),
        },
      );

      if (!pyRes.ok) {
        // Roll back the queued record status so the user knows it failed immediately.
        await db
          .update(presentationConversionRecords)
          .set({ status: "failed" })
          .where(eq(presentationConversionRecords.id, conversionId));

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to enqueue import task. Please try again.",
        });
      }

      return { conversionId };
    }),

  /**
   * Poll the current status of an import job.
   *
   * Enforces tenant isolation: the query filters on BOTH conversionId AND
   * tenantId, so a user in tenant A can never read tenant B's records.
   *
   * Returns: { status, progress, fidelityWarnings, deckLibraryItemId, error }
   */
  getImportStatus: protectedProcedure
    .input(conversionIdInputSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = resolvePresentationTenantId(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [record] = await db
        .select()
        .from(presentationConversionRecords)
        .where(
          and(
            eq(presentationConversionRecords.id, input.conversionId),
            eq(presentationConversionRecords.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversion record not found" });
      }

      return {
        status: record.status,
        progress: record.progress,
        fidelityWarnings: record.fidelityWarnings ?? [],
        deckLibraryItemId: record.deckLibraryItemId ?? null,
        error: record.error ?? null,
      };
    }),

  /**
   * Cancel an in-progress import job.
   *
   * If the job is already done or failed, returns early (idempotent).
   * Otherwise, sets the DB record to "cancelled" and sends a best-effort
   * DELETE to Python to revoke the Celery task via SIGTERM.
   */
  cancelImport: protectedProcedure
    .input(conversionIdInputSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolvePresentationTenantId(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [record] = await db
        .select({
          id: presentationConversionRecords.id,
          status: presentationConversionRecords.status,
        })
        .from(presentationConversionRecords)
        .where(
          and(
            eq(presentationConversionRecords.id, input.conversionId),
            eq(presentationConversionRecords.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversion record not found" });
      }

      // Idempotent: already terminal
      if (record.status === "done" || record.status === "failed" || record.status === "cancelled") {
        return { cancelled: true };
      }

      // Mark cancelled in DB first (best-effort Celery revoke follows)
      await db
        .update(presentationConversionRecords)
        .set({ status: "cancelled" })
        .where(eq(presentationConversionRecords.id, input.conversionId));

      // Best-effort Celery task revocation — do not throw if this fails
      try {
        await fetch(
          `${PYTHON_BACKEND_URL}/api/v1/presentation-import/${input.conversionId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${PYTHON_INTERNAL_TOKEN}` },
          },
        );
      } catch {
        // Non-fatal — DB record is already "cancelled"
      }

      return { cancelled: true };
    }),
});
```

---

## Registration in `apps/web/server/routers.ts`

Add the import and register the router in the `appRouter` object.

In `apps/web/server/routers.ts`, add near the other presentation-related imports:

```typescript
import { presentationImportRouter } from "./routers/presentationImport";
```

Then inside the `appRouter` object (near the existing `presentation: presentationRouter` line):

```typescript
  // Presentation import (PPTX + Google Slides)
  presentationImport: presentationImportRouter,
```

The registration key `presentationImport` is what the frontend references as `trpc.presentationImport.startImport`, `trpc.presentationImport.getImportStatus`, etc.

---

## Implementation Notes

### Tenant ID resolution

The `resolvePresentationTenantId` helper follows the same pattern as in `presentation.ts`: it calls `resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId)` from `../services/tenantContext`. If the result is falsy, it throws `BAD_REQUEST`. Do not export this function — it is router-internal.

### `toPresentationActor` shape

The returned object has `{ userId: ctx.user.id, tenantId: resolvePresentationTenantId(ctx), role: ctx.user.role }`. The `tenantId` field here is a `string` (varchar), matching the `PresentationActor` interface defined in `apps/web/server/services/presentationService.ts`.

### Feature flag check

`ensureFeatureEnabled()` calls `isPresentationFeatureEnabled()` imported from `@shared/presentation/constants`. If it returns false, throw a `TRPCError` with code `"FORBIDDEN"` and message `"Presentation editor feature is disabled"`. This matches the pattern in `presentation.ts`.

### Google OAuth connection check

For `sourceType === "google_slides"`, make a lightweight GET request to the Python backend to verify the user's OAuth connection status before creating the DB record. A suitable endpoint to probe is `GET /api/v1/oauth/google/status?user_id={userId}` (check if this endpoint exists in the Python backend; adapt the exact path to whatever endpoint Section 04 exposes for this purpose). If the response indicates the user is not connected (or if the request fails), throw:

```typescript
throw new TRPCError({
  code: "PRECONDITION_FAILED",
  message: "Google Drive not connected. Please connect your Google account in Settings.",
});
```

The access token must NEVER be passed from Node.js to Python via HTTP request body. Python fetches it directly from its own `oauth_connections` table using the `user_id`.

### DB schema field mapping (post-Section 01)

After Section 01's migration, the `presentationConversionRecords` table has these additional fields:
- `status` — `VARCHAR(16)`, default `"queued"`
- `progress` — `INT`, default `0`
- `userId` — `INT NOT NULL`, FK to `users.id`
- `slidesUrl` — `VARCHAR(2048)`, nullable

And these fields become nullable:
- `sourceItemId`
- `deckLibraryItemId`
- `deckId`

The `getImportStatus` response also includes `record.error` — ensure the schema has an `error` column (nullable `text`) added in Section 01. Verify in `drizzle/schema.ts` before referencing it.

### Python backend URL and token

Use environment variables with safe defaults:
```typescript
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";
const PYTHON_INTERNAL_TOKEN = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? "";
```

The internal token is the same `SMARTSPEC_WEB_GATEWAY_TOKEN` used by the callback handler in Section 06.

### Error handling

- Wrap all DB operations in try/catch and convert DB errors to `INTERNAL_SERVER_ERROR` rather than leaking raw DB messages to the client.
- If Python returns non-OK for `startImport`, roll back the conversion record to `status: "failed"` so the frontend does not poll indefinitely.
- For `cancelImport`, the Python revoke call is fire-and-forget (wrapped in try/catch, not awaited for error propagation).

---

## Files Summary

| Action | File |
|--------|------|
| Create | `apps/web/server/routers/presentationImport.ts` |
| Create | `apps/web/server/routers/presentationImport.test.ts` |
| Modify | `apps/web/server/routers.ts` — add import + `presentationImport: presentationImportRouter` |