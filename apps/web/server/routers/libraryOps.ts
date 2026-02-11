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

const libraryOpsScopeSchema = z.enum(["tenant", "global"]);

function isGlobalOpsRole(role: unknown): boolean {
  return role === "admin" || role === "super_admin";
}

export const libraryOpsRouter = router({
  getSummary: adminProcedure
    .input(
      z.object({
        scope: libraryOpsScopeSchema.default("tenant").optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const scope = input?.scope ?? "tenant";
      const tenantId = resolveTenantId(ctx.tenantId, ctx.user.currentTenantId);
      if (scope === "tenant" && (tenantId === null || tenantId === undefined)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant scope is required for library ops summary" });
      }
      if (scope === "global" && !isGlobalOpsRole(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Global library ops require elevated role" });
      }
      if (!isLibraryEnabledForTenant(tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Library feature is disabled for this tenant" });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }
      return getLibraryOpsSummary(db, {
        tenantId: scope === "tenant" ? String(tenantId) : null,
      });
    }),

  reprocessCallbackDlq: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        scope: libraryOpsScopeSchema.default("tenant").optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const scope = input.scope ?? "tenant";
      const tenantId = resolveTenantId(ctx.tenantId, ctx.user.currentTenantId);
      if (scope === "tenant" && (tenantId === null || tenantId === undefined)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant scope is required for DLQ reprocess",
        });
      }
      if (scope === "global" && !isGlobalOpsRole(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Global library ops require elevated role" });
      }
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
        {
          tenantId: scope === "tenant" ? String(tenantId) : null,
        },
      );
      if (!result.success && result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND", message: "DLQ entry not found" });
      }

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "libraryOps.reprocessCallbackDlq",
        requestType: "mutation",
        requestPayload: { dlqId: input.id, tenantId, operationScope: scope },
        responsePayload: result,
      });

      return result;
    }),

  retryFailedIndexJobs: adminProcedure
    .input(
      z.object({
        jobIds: z.array(z.number().int().positive()).max(500).optional(),
        limit: z.number().int().min(1).max(500).default(100),
        scope: libraryOpsScopeSchema.default("tenant").optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const scope = input.scope ?? "tenant";
      const tenantId = resolveTenantId(ctx.tenantId, ctx.user.currentTenantId);
      if (scope === "tenant" && (tenantId === null || tenantId === undefined)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant scope is required for retry operations" });
      }
      if (scope === "global" && !isGlobalOpsRole(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Global library ops require elevated role" });
      }
      if (!isLibraryEnabledForTenant(tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Library feature is disabled for this tenant" });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const result = await retryFailedLibraryIndexJobs(db, {
        jobIds: input.jobIds,
        limit: input.limit,
        tenantId: scope === "tenant" ? String(tenantId) : null,
      });
      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "libraryOps.retryFailedIndexJobs",
        requestType: "mutation",
        requestPayload: {
          limit: input.limit,
          requestedCount: input.jobIds?.length ?? 0,
          tenantId,
          operationScope: scope,
        },
        responsePayload: result,
      });
      return result;
    }),
});
