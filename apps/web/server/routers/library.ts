import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { auditLogger } from "../services/auditLogger";
import { isLibraryEnabledForTenant } from "../services/libraryFeatureFlags";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  createLibraryItem,
  getLibraryMarkdownContent,
  getLibraryItemById,
  LibraryMarkdownVersionConflictError,
  listLibraryDocuments,
  saveLibraryMarkdown,
  searchLibraryItems,
  shareLibraryItem,
  softDeleteLibraryItem,
  uploadLibraryFile,
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

const documentScopeSchema = z.enum(["all", "my_library", "shared_with_me", "shared_groups"]);
const documentSortSchema = z.enum(["updated_desc", "created_desc"]);
const documentFilterSchema = z.object({
  itemType: z.string().min(1).max(32).optional(),
  ownerUserId: z.number().int().positive().optional(),
  status: itemStatusSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
}).optional();

const uploadLibraryFileSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(255),
  fileBase64: z.string().min(1),
  title: z.string().min(1).max(255).optional(),
  visibility: visibilitySchema.optional(),
});

async function resolveLibraryTenantId(
  ctx: { tenantId: unknown; user: { id: number; currentTenantId?: unknown } },
): Promise<string> {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);

  if (tenantId === null || tenantId === undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for library operations",
    });
  }

  return tenantId;
}

function assertLibraryEnabled(tenantId: string): void {
  if (!isLibraryEnabledForTenant(tenantId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Library feature is disabled for this tenant",
    });
  }
}

function toClientLibraryMutationError(error: unknown): TRPCError | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.name === "LibraryUrlValidationError") {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: (error as any).clientMessage || error.message || "Invalid library URL",
    });
  }

  return null;
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
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved as any,
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

  listDocuments: protectedProcedure
    .input(
      z.object({
        query: z.string().max(1000).optional(),
        scope: documentScopeSchema.optional(),
        sort: documentSortSchema.optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        filters: documentFilterSchema,
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved as any,
        role: ctx.user.role,
      };

      return listLibraryDocuments(
        {
          query: input?.query,
          scope: input?.scope,
          sort: input?.sort,
          limit: input?.limit,
          offset: input?.offset,
          filters: input?.filters,
        },
        actor,
      );
    }),

  uploadFile: protectedProcedure
    .input(uploadLibraryFileSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved as any,
        role: ctx.user.role,
      };

      const result = await uploadLibraryFile(input, actor);
      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.uploadFile",
        requestType: "mutation",
        requestPayload: {
          tenantId: tenantIdResolved,
          fileName: input.fileName,
          fileType: input.fileType,
          visibility: input.visibility ?? "private",
        },
        responsePayload: {
          itemId: result.item.id,
          indexJobId: result.indexJob.jobId,
          indexJobCreated: result.indexJob.created,
        },
      });

      return result;
    }),

  getMarkdownContent: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved as any,
        role: ctx.user.role,
      };

      const result = await getLibraryMarkdownContent(input.id, actor);
      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Library item not found",
        });
      }

      return result;
    }),

  saveMarkdown: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        content: z.string().max(1_000_000),
        expectedUpdatedAt: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved as any,
        role: ctx.user.role,
      };

      try {
        const result = await saveLibraryMarkdown(
          {
            itemId: input.id,
            content: input.content,
            expectedUpdatedAt: input.expectedUpdatedAt,
          },
          actor,
        );

        if (!result) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Library item not found",
          });
        }

        auditLogger.log({
          eventType: "library_mutation",
          userId: ctx.user.id,
          endpoint: "library.saveMarkdown",
          requestType: "mutation",
          requestPayload: {
            tenantId: tenantIdResolved,
            itemId: input.id,
            expectedUpdatedAt: input.expectedUpdatedAt?.toISOString() ?? null,
          },
          responsePayload: {
            itemId: result.item.id,
            indexJobId: result.indexJob.jobId,
            indexJobCreated: result.indexJob.created,
          },
        });

        return result;
      } catch (error) {
        if (error instanceof LibraryMarkdownVersionConflictError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Markdown version conflict. Current version updated at ${error.currentUpdatedAt.toISOString()}`,
          });
        }
        throw error;
      }
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
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved as any,
        role: ctx.user.role,
      };

      try {
        const result = await createLibraryItem(input, actor);
        auditLogger.log({
          eventType: "library_mutation",
          userId: ctx.user.id,
          endpoint: "library.createItem",
          requestType: "mutation",
          requestPayload: {
            tenantId: tenantIdResolved,
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
      } catch (error) {
        const clientError = toClientLibraryMutationError(error);
        if (clientError) {
          throw clientError;
        }
        throw error;
      }
    }),

  getItem: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved as any,
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
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved as any,
        role: ctx.user.role,
      };

      try {
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
            tenantId: tenantIdResolved,
            itemId: id,
            fields: Object.keys(payload),
          },
          responsePayload: {
            itemId: item.id,
            status: item.status,
          },
        });

        return item;
      } catch (error) {
        const clientError = toClientLibraryMutationError(error);
        if (clientError) {
          throw clientError;
        }
        throw error;
      }
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved as any,
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
          tenantId: tenantIdResolved,
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
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved as any,
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
          tenantId: tenantIdResolved,
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
