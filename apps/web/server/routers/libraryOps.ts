import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { auditLogger } from "../services/auditLogger";
import { isLibraryEnabledForTenant } from "../services/libraryFeatureFlags";
import { resolveTenantId } from "../services/tenantContext";
import {
  createLibraryOpsRepository,
  getLibraryOpsSummary,
  reprocessCallbackDlqEntry,
  retryFailedLibraryIndexJobs,
} from "../services/libraryOpsService";

export const libraryOpsRouter = router({
  getSummary: adminProcedure.query(async ({ ctx }) => {
    const tenantId = resolveTenantId(ctx.tenantId, ctx.user.currentTenantId);
    if (!isLibraryEnabledForTenant(tenantId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Library feature is disabled for this tenant" });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }
    return getLibraryOpsSummary(db);
  }),

  reprocessCallbackDlq: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantId(ctx.tenantId, ctx.user.currentTenantId);
      if (!isLibraryEnabledForTenant(tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Library feature is disabled for this tenant" });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const result = await reprocessCallbackDlqEntry(
        createLibraryOpsRepository(db),
        input.id,
      );
      if (!result.success && result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND", message: "DLQ entry not found" });
      }

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "libraryOps.reprocessCallbackDlq",
        requestType: "mutation",
        requestPayload: { dlqId: input.id, tenantId },
        responsePayload: result,
      });

      return result;
    }),

  retryFailedIndexJobs: adminProcedure
    .input(
      z.object({
        jobIds: z.array(z.number().int().positive()).max(500).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantId(ctx.tenantId, ctx.user.currentTenantId);
      if (!isLibraryEnabledForTenant(tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Library feature is disabled for this tenant" });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const result = await retryFailedLibraryIndexJobs(db, input);
      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "libraryOps.retryFailedIndexJobs",
        requestType: "mutation",
        requestPayload: {
          limit: input.limit,
          requestedCount: input.jobIds?.length ?? 0,
          tenantId,
        },
        responsePayload: result,
      });
      return result;
    }),
});
