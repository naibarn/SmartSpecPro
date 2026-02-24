import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { protectedProcedure, router } from "../_core/trpc";
import { isPresentationFeatureEnabled } from "@shared/presentation/constants";
import { getDb } from "../db";
import { presentationConversionRecords } from "../../drizzle/schema";
import { resolveTenantIdVarchar } from "../services/tenantContext";

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";

// Log a warning at startup if the gateway token is not configured.
// Python's import endpoints require this token for authentication.
if (!process.env.SMARTSPEC_WEB_GATEWAY_TOKEN) {
  console.warn(
    "[presentationImport] SMARTSPEC_WEB_GATEWAY_TOKEN is not set — internal Python calls will be unauthenticated",
  );
}

// ── Local helpers (same pattern as presentation.ts) ───────────────────────

function resolvePresentationTenantId(ctx: {
  tenantId: unknown;
  user: { currentTenantId?: unknown };
}): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for presentation operations",
    });
  }
  return tenantId;
}

function toPresentationActor(ctx: {
  tenantId: unknown;
  user: { id: number; role?: string | null; currentTenantId?: unknown };
}) {
  return {
    userId: ctx.user.id,
    tenantId: resolvePresentationTenantId(ctx),
    role: ctx.user.role,
  };
}

function ensureFeatureEnabled(): void {
  if (!isPresentationFeatureEnabled()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Presentation editor feature is disabled",
    });
  }
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
   * If OAuth is not connected, Python's Celery task will fail fast and
   * surface an error via the callback handler (getImportStatus will show it).
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

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });

      let record: { id: number };
      try {
        const [inserted] = await db
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
        record = inserted;
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create import record",
        });
      }

      const conversionId = record.id;

      // POST to Python to enqueue the Celery task.
      // Python validates source_type and decides which importer to use.
      // For Google Slides, Python fetches the OAuth token via GoogleTokenService
      // using the user_id — no access token is ever forwarded from Node.
      let pyRes: Response;
      try {
        pyRes = await fetch(
          `${PYTHON_BACKEND_URL}/api/v1/presentation-import/start`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? ""}`,
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
      } catch (err) {
        // Network failure — roll back record to failed
        await db
          .update(presentationConversionRecords)
          .set({ status: "failed" })
          .where(eq(presentationConversionRecords.id, conversionId));

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to enqueue import task. Please try again.",
        });
      }

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
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });

      let record: (typeof presentationConversionRecords.$inferSelect) | undefined;
      try {
        const [found] = await db
          .select()
          .from(presentationConversionRecords)
          .where(
            and(
              eq(presentationConversionRecords.id, input.conversionId),
              eq(presentationConversionRecords.tenantId, tenantId),
            ),
          )
          .limit(1);
        record = found;
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve import status",
        });
      }

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversion record not found",
        });
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
   * Otherwise, sets the DB record to "cancelled" (filtering by both id AND
   * tenantId to prevent cross-tenant cancellation), then sends a best-effort
   * DELETE to Python to revoke the Celery task via SIGTERM.
   */
  cancelImport: protectedProcedure
    .input(conversionIdInputSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolvePresentationTenantId(ctx);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });

      let record: { id: number; status: string } | undefined;
      try {
        const [found] = await db
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
        record = found;
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve import record",
        });
      }

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversion record not found",
        });
      }

      // Idempotent: already terminal
      if (
        record.status === "done" ||
        record.status === "failed" ||
        record.status === "cancelled"
      ) {
        return { cancelled: true };
      }

      // Mark cancelled in DB — filter by BOTH id AND tenantId to prevent
      // cross-tenant cancellation (defence-in-depth after the SELECT check).
      await db
        .update(presentationConversionRecords)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(presentationConversionRecords.id, input.conversionId),
            eq(presentationConversionRecords.tenantId, tenantId),
          ),
        );

      // Best-effort Celery task revocation — do not throw if this fails
      try {
        await fetch(
          `${PYTHON_BACKEND_URL}/api/v1/presentation-import/${input.conversionId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? ""}`,
            },
          },
        );
      } catch {
        // Non-fatal — DB record is already "cancelled"
      }

      return { cancelled: true };
    }),
});
