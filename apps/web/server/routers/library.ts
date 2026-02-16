import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { auditLogger } from "../services/auditLogger";
import { shareOperationLimiter } from "../services/rateLimiter";
import { isLibraryEnabledForTenant } from "../services/libraryFeatureFlags";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { federatedSearch } from "../services/federatedSearch";
import {
  createLibraryItem,
  getContentVersionById,
  getContentVersionHistory,
  getLibraryMarkdownContent,
  getLibraryItemById,
  getLibraryItemShares,
  getUserEffectivePermission,
  LibraryMarkdownVersionConflictError,
  listLibraryDocuments,
  listLibraryTrash,
  permanentDeleteLibraryItem,
  removeLibraryShare,
  restoreContentVersion,
  restoreFromLibraryTrash,
  saveLibraryMarkdown,
  searchLibraryItems,
  shareLibraryItem,
  softDeleteLibraryItem,
  updateLibrarySharePermission,
  uploadLibraryFile,
  updateLibraryItem,
} from "../services/libraryService";

const visibilitySchema = z.enum(["private", "team", "public"]);
const itemStatusSchema = z.enum(["draft", "ready", "indexing", "archived", "failed"]);
const permissionLevelSchema = z.enum(["read", "write", "delete", "owner"]);
const sharePermissionLevelSchema = z.enum(["read", "write", "delete"]);
const subjectTypeSchema = z.enum(["user", "tenant_role", "group"]);

const sourceLinkSchema = z.object({
  linkType: z.string().min(1).max(64),
  linkId: z.string().min(1).max(128),
  providerTaskId: z.string().min(1).max(128).optional(),
});

const recentDaysSchema = z.union([
  z.literal(1),
  z.literal(3),
  z.literal(7),
  z.literal(15),
  z.literal(30),
]);

const searchFilterSchema = z.object({
  itemType: z.string().min(1).max(32).optional(),
  model: z.string().min(1).max(128).optional(),
  ownerUserId: z.number().int().positive().optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
  status: itemStatusSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  recentDays: recentDaysSchema.optional(),
}).optional();

const documentScopeSchema = z.enum(["all", "my_library", "shared_with_me", "shared_groups"]);
const documentSortSchema = z.enum(["updated_desc", "created_desc"]);
const documentFilterSchema = z.object({
  itemType: z.string().min(1).max(32).optional(),
  ownerUserId: z.number().int().positive().optional(),
  status: itemStatusSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  recentDays: recentDaysSchema.optional(),
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
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).optional(),
        filters: searchFilterSchema,
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
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
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).optional(),
        filters: documentFilterSchema,
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
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
        tenantId: tenantIdResolved,
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
        tenantId: tenantIdResolved,
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
        changeDescription: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      try {
        const result = await saveLibraryMarkdown(
          {
            itemId: input.id,
            content: input.content,
            expectedUpdatedAt: input.expectedUpdatedAt,
            changeDescription: input.changeDescription,
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
        tenantId: tenantIdResolved,
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
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      const item = await getLibraryItemById(input.id, actor);
      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Library item not found",
        });
      }

      // Include effective permissions for the requesting user
      const effectivePermission = await getUserEffectivePermission(input.id, actor);
      const level = effectivePermission.effectivePermissionLevel;
      const rank = level === "owner" ? 4 : level === "delete" ? 3 : level === "write" ? 2 : level === "read" ? 1 : 0;

      return {
        ...item,
        userPermissions: {
          effectiveLevel: level,
          sources: effectivePermission.sources,
          canRead: rank >= 1,
          canWrite: rank >= 2,
          canDelete: rank >= 3,
          isOwner: rank >= 4,
        },
      };
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
        tenantId: tenantIdResolved,
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
        tenantId: tenantIdResolved,
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
        permissionLevel: sharePermissionLevelSchema,
        expiresAt: z.coerce.date().nullable().optional().refine(
          (val) => {
            if (!val) return true;
            const now = new Date();
            const maxExpiry = new Date();
            maxExpiry.setFullYear(maxExpiry.getFullYear() + 1);
            return val > now && val <= maxExpiry;
          },
          { message: "Expiry date must be in the future and within 1 year" },
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!shareOperationLimiter.isAllowed(`user:${ctx.user.id}`)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many share operations. Please try again later." });
      }
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
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

  // ── New procedures for ShareFile feature ──

  removeShare: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        subjectType: subjectTypeSchema,
        subjectId: z.string().min(1).max(64),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      await removeLibraryShare(input, actor);

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.removeShare",
        requestType: "mutation",
        requestPayload: {
          tenantId: tenantIdResolved,
          itemId: input.itemId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
        },
        responsePayload: { success: true },
      });

      return { success: true };
    }),

  updateSharePermission: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        subjectType: subjectTypeSchema,
        subjectId: z.string().min(1).max(64),
        permissionLevel: sharePermissionLevelSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      await updateLibrarySharePermission(input, actor);

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.updateSharePermission",
        requestType: "mutation",
        requestPayload: {
          tenantId: tenantIdResolved,
          itemId: input.itemId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          permissionLevel: input.permissionLevel,
        },
        responsePayload: { success: true },
      });

      return { success: true };
    }),

  getItemShares: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      return getLibraryItemShares(input.itemId, actor);
    }),

  listTrash: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      return listLibraryTrash(
        { limit: input?.limit, offset: input?.offset },
        actor,
      );
    }),

  restoreFromTrash: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      await restoreFromLibraryTrash(input.itemId, actor);

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.restoreFromTrash",
        requestType: "mutation",
        requestPayload: {
          tenantId: tenantIdResolved,
          itemId: input.itemId,
        },
        responsePayload: { success: true },
      });

      return { success: true };
    }),

  getVersionHistory: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      return getContentVersionHistory(input.itemId, actor, {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getVersionContent: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      const version = await getContentVersionById(input.versionId, actor);
      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Version not found",
        });
      }

      return version;
    }),

  restoreVersion: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      const result = await restoreContentVersion(input.versionId, actor);
      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Version not found or cannot restore",
        });
      }

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.restoreVersion",
        requestType: "mutation",
        requestPayload: {
          tenantId: tenantIdResolved,
          versionId: input.versionId,
        },
        responsePayload: {
          itemId: result.item.id,
          indexJobId: result.indexJob.jobId,
        },
      });

      return result;
    }),

  permanentDelete: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = {
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        role: ctx.user.role,
      };

      const result = await permanentDeleteLibraryItem(input.itemId, actor);

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.permanentDelete",
        requestType: "mutation",
        requestPayload: {
          tenantId: tenantIdResolved,
          itemId: input.itemId,
          daysInTrash: result.daysInTrash,
        },
        responsePayload: { success: true },
      });

      return { success: true };
    }),

  /**
   * Federated search across local DB, vector store, and Google Drive.
   */
  federatedSearch: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(1000),
        includeGoogleDrive: z.boolean().default(true),
        sourceFilter: z.enum(["all", "library", "google_drive"]).default("all"),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantId);

      return federatedSearch(input, {
        userId: ctx.user.id,
        tenantId,
        role: ctx.user.role ?? null,
      });
    }),
});
