import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { auditLogger } from "../services/auditLogger";
import { isLibraryEnabledForTenant } from "../services/libraryFeatureFlags";
import {
  createLibraryItem,
  getLibraryItemById,
  searchLibraryItems,
  shareLibraryItem,
  softDeleteLibraryItem,
  updateLibraryItem,
} from "../services/libraryService";

const visibilitySchema = z.enum(["private", "team", "public"]);
const itemStatusSchema = z.enum(["draft", "ready", "indexing", "archived", "failed"]);
const permissionLevelSchema = z.enum(["read", "write", "owner"]);
const subjectTypeSchema = z.enum(["user", "tenant_role"]);

const sourceLinkSchema = z.object({
  linkType: z.string().min(1).max(64),
  linkId: z.string().min(1).max(128),
  providerTaskId: z.string().min(1).max(128).optional(),
});

const searchFilterSchema = z.object({
  itemType: z.string().min(1).max(32).optional(),
  model: z.string().min(1).max(128).optional(),
  ownerUserId: z.number().int().positive().optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
  status: itemStatusSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
}).optional();

function resolveTenantId(ctx: { tenantId: number | null; user: { currentTenantId?: number | null } }): number {
  const tenantId = ctx.tenantId ?? ctx.user.currentTenantId ?? null;
  if (tenantId === null || tenantId === undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for library operations",
    });
  }

  return tenantId;
}

function assertLibraryEnabled(tenantId: number): void {
  if (!isLibraryEnabledForTenant(tenantId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Library feature is disabled for this tenant",
    });
  }
}

export const libraryRouter = router({
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().max(1000).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        filters: searchFilterSchema,
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantId(ctx);
      assertLibraryEnabled(tenantId);
      const actor = {
        userId: ctx.user.id,
        tenantId,
        role: ctx.user.role,
      };

      return searchLibraryItems(
        {
          query: input?.query,
          limit: input?.limit,
          offset: input?.offset,
          filters: input?.filters,
        },
        actor,
      );
    }),

  createItem: protectedProcedure
    .input(
      z.object({
        itemType: z.string().min(1).max(32),
        source: z.string().min(1).max(64),
        title: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        status: itemStatusSchema.optional(),
        visibility: visibilitySchema.optional(),
        metadata: z.record(z.any()).optional(),
        sourceUrl: z.string().max(2048).optional(),
        thumbnailUrl: z.string().max(2048).optional(),
        sourceLink: sourceLinkSchema.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantId(ctx);
      assertLibraryEnabled(tenantId);
      const actor = {
        userId: ctx.user.id,
        tenantId,
        role: ctx.user.role,
      };

      const result = await createLibraryItem(input, actor);
      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.createItem",
        requestType: "mutation",
        requestPayload: {
          tenantId,
          itemType: input.itemType,
          source: input.source,
          visibility: input.visibility ?? "private",
        },
        responsePayload: {
          itemId: result.item?.id ?? null,
          idempotent: result.idempotent,
        },
      });

      return result;
    }),

  getItem: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantId(ctx);
      assertLibraryEnabled(tenantId);
      const actor = {
        userId: ctx.user.id,
        tenantId,
        role: ctx.user.role,
      };

      const item = await getLibraryItemById(input.id, actor);
      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Library item not found",
        });
      }

      return item;
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().max(2000).nullable().optional(),
        status: itemStatusSchema.optional(),
        visibility: visibilitySchema.optional(),
        metadata: z.record(z.any()).optional(),
        sourceUrl: z.string().max(2048).nullable().optional(),
        thumbnailUrl: z.string().max(2048).nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantId(ctx);
      assertLibraryEnabled(tenantId);
      const actor = {
        userId: ctx.user.id,
        tenantId,
        role: ctx.user.role,
      };

      const { id, ...payload } = input;
      const item = await updateLibraryItem(id, payload, actor);

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Library item not found",
        });
      }

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.updateItem",
        requestType: "mutation",
        requestPayload: {
          tenantId,
          itemId: id,
          fields: Object.keys(payload),
        },
        responsePayload: {
          itemId: item.id,
          status: item.status,
        },
      });

      return item;
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantId(ctx);
      assertLibraryEnabled(tenantId);
      const actor = {
        userId: ctx.user.id,
        tenantId,
        role: ctx.user.role,
      };

      const success = await softDeleteLibraryItem(input.id, actor);
      if (!success) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Library item not found",
        });
      }

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.deleteItem",
        requestType: "mutation",
        requestPayload: {
          tenantId,
          itemId: input.id,
        },
        responsePayload: {
          success: true,
        },
      });

      return { success: true };
    }),

  shareItem: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        subjectType: subjectTypeSchema,
        subjectId: z.string().min(1).max(64),
        permissionLevel: permissionLevelSchema,
        expiresAt: z.coerce.date().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantId(ctx);
      assertLibraryEnabled(tenantId);
      const actor = {
        userId: ctx.user.id,
        tenantId,
        role: ctx.user.role,
      };

      const success = await shareLibraryItem(input, actor);
      if (!success) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Library item not found",
        });
      }

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.shareItem",
        requestType: "mutation",
        requestPayload: {
          tenantId,
          itemId: input.itemId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          permissionLevel: input.permissionLevel,
        },
        responsePayload: {
          success: true,
        },
      });

      return { success: true };
    }),
});
