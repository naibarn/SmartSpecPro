import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PRESENTATION_ITEM_TYPE } from "@shared/presentation/constants";
import { isPresentationTemplateItem } from "@shared/presentation/template";

import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { shouldUseSandbox, dispatchToSandbox } from "../services/sandbox/dispatchService";
import { auditLogger } from "../services/auditLogger";
import { shareOperationLimiter } from "../services/rateLimiter";
import { isLibraryEnabledForTenant } from "../services/libraryFeatureFlags";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { getPrivateVaultPinVersion, validatePrivateVaultAccessToken } from "../services/privateVaultService";
import { federatedSearch } from "../services/federatedSearch";
import {
  createLibraryItem,
  createLibraryFolder,
  getContentVersionById,
  getContentVersionHistory,
  getLibraryFolderAncestors,
  getLibraryFolderChildCount,
  getLibraryMarkdownContent,
  getLibraryItemById,
  getLibraryItemShares,
  getLibraryUploadStatuses,
  getPublicShareLinkState,
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
  createPublicShareLink,
  revokePublicShareLink,
  resolvePublicShareLink,
  shareLibraryToGroup,
  softDeleteLibraryItem,
  batchSoftDeleteLibraryItems,
  updateLibrarySharePermission,
  uploadLibraryFile,
  replaceLibraryFile,
  getVersionSnapshotDownloadUrl,
  updateLibraryItem,
} from "../services/libraryService";
import { exportMarkdownArtifact as generateMarkdownExportArtifact } from "../services/markdownExport";
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";

/**
 * MIME types that require sandbox-isolated parsing.
 * These formats use native libraries that could be exploited via crafted files.
 */
const SANDBOX_PARSE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",   // DOCX
  "application/vnd.ms-powerpoint",                                              // PPT
  "application/msword",                                                         // DOC
]);

const visibilitySchema = z.enum(["private", "team", "public"]);
const itemStatusSchema = z.enum(["draft", "ready", "indexing", "archived", "failed"]);
const permissionLevelSchema = z.enum(["read", "write", "delete", "owner"]);
const sharePermissionLevelSchema = z.enum(["read", "write", "delete"]);
const subjectTypeSchema = z.enum(["user", "tenant_role", "group"]);
const publicShareTokenSchema = z.string().min(1).max(512);

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

const documentScopeSchema = z.enum(["all", "my_library", "private_vault", "shared_with_me", "shared_groups"]);
const documentSortSchema = z.enum(["updated_desc", "created_desc"]);
const documentFilterSchema = z.object({
  itemType: z.string().min(1).max(32).optional(),
  ownerUserId: z.number().int().positive().optional(),
  status: itemStatusSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  recentDays: recentDaysSchema.optional(),
}).optional();

// 50 MB binary → ~68 MB base64 (4/3 overhead + data URL prefix margin)
const MAX_FILE_BASE64_LENGTH = 68_000_000;

const uploadLibraryFileSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(255),
  fileBase64: z.string().min(1).max(MAX_FILE_BASE64_LENGTH),
  title: z.string().min(1).max(255).optional(),
  visibility: visibilitySchema.optional(),
  projectId: z.string().min(1).max(100).nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.any()).optional(),
});

const uploadStatusSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(25),
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

async function createLibraryActor(
  ctx: { user: { id: number; role?: string | null; currentTenantId?: unknown }; tenantId: unknown; privateVaultToken: string | null },
  tenantIdResolved: string,
) {
  const db = await getDb();
  let privateVaultUnlocked = false;

  if (db) {
    const [row] = await db
      .select({ userPreferences: users.userPreferences })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    const prefs = (row?.userPreferences as Record<string, any>) || {};
    const currentVault = (prefs.privateVault || {}) as Record<string, any>;
    const enabled = currentVault.enabled === true && Boolean(currentVault.pinHash);
    const pinVersion = getPrivateVaultPinVersion({ privateVault: currentVault });
    if (enabled && ctx.privateVaultToken) {
      privateVaultUnlocked = await validatePrivateVaultAccessToken({
        token: ctx.privateVaultToken,
        userId: ctx.user.id,
        tenantId: tenantIdResolved,
        pinVersion,
      });
    }
  }

  return {
    userId: ctx.user.id,
    tenantId: tenantIdResolved,
    role: ctx.user.role,
    privateVaultUnlocked,
  };
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
        scope: documentScopeSchema.optional(),
        folderId: z.number().int().positive().nullable().optional(),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      if (input?.scope === "private_vault" && !actor.privateVaultUnlocked) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Private vault is locked",
        });
      }

      return searchLibraryItems(
        {
          query: input?.query,
          limit: input?.limit,
          offset: input?.offset,
          filters: input?.filters,
          scope: input?.scope,
          folderId: input?.folderId,
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
        folderId: z.number().int().positive().nullable().optional(),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      if (input?.scope === "private_vault" && !actor.privateVaultUnlocked) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Private vault is locked",
        });
      }

      const result = await listLibraryDocuments(
        {
          query: input?.query,
          scope: input?.scope,
          sort: input?.sort,
          limit: input?.limit,
          offset: input?.offset,
          filters: input?.filters,
          folderId: input?.folderId,
        },
        actor,
      );
      return result;
    }),

  getUploadStatus: protectedProcedure
    .input(uploadStatusSchema)
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      return getLibraryUploadStatuses(input.ids, actor);
    }),

  uploadFile: protectedProcedure
    .input(uploadLibraryFileSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      let result;
      try {
        result = await uploadLibraryFile(input, actor);
      } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes("insufficient credits")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        throw error;
      }

      // Dispatch complex file parsing to sandbox when enabled
      const requiresSandboxParsing =
        shouldUseSandbox("sandbox-file") &&
        SANDBOX_PARSE_MIME_TYPES.has(input.fileType);

      if (requiresSandboxParsing) {
        try {
          const sandboxResult = await dispatchToSandbox({
            featureType: "library",
            executionMode: "sandbox-file",
            tenantId: tenantIdResolved,
            userId: ctx.user.id,
            inputFiles: [
              {
                key: result.storageKey,
                mimeType: input.fileType,
                sizeBytes: Buffer.byteLength(input.fileBase64, "base64"),
              },
            ],
            profileOverride: "file-parser",
            metadata: {
              libraryItemId: result.item.id,
              fileName: input.fileName,
            },
          });

          (result as any).sandboxParseJobId = sandboxResult.jobId;
          const metadata = (result.item.metadata ?? {}) as Record<string, any>;
          const uploadPipeline = metadata.upload_pipeline && typeof metadata.upload_pipeline === "object"
            ? { ...metadata.upload_pipeline }
            : {};
          uploadPipeline.parserJobId = sandboxResult.jobId;
          uploadPipeline.parserStatus = "queued";
          uploadPipeline.updatedAt = new Date().toISOString();
          result.item.metadata = {
            ...metadata,
            upload_pipeline: uploadPipeline,
          };
        } catch (err) {
          console.error("[library.uploadFile] Sandbox parsing dispatch failed:", err);
        }
      }

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

  replaceFile: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        fileName: z.string().min(1).max(255),
        fileType: z.string().min(1).max(255),
        fileBase64: z.string().min(1).max(MAX_FILE_BASE64_LENGTH),
        changeDescription: z.string().max(500).optional(),
        metadata: z.record(z.any()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      let result;
      try {
        result = await replaceLibraryFile(input, actor);
      } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes("insufficient credits")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        throw error;
      }

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.replaceFile",
        requestType: "mutation",
        requestPayload: {
          tenantId: tenantIdResolved,
          itemId: input.itemId,
          fileName: input.fileName,
          fileType: input.fileType,
        },
        responsePayload: {
          itemId: result.item.id,
          indexJobId: result.indexJob.jobId,
          versionNumber: result.versionNumber,
        },
      });

      return result;
    }),

  getMarkdownContent: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      const result = await getLibraryMarkdownContent(input.id, actor);
      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Library item not found",
        });
      }

      return result;
    }),

  exportMarkdownArtifact: protectedProcedure
    .input(
      z.object({
        markdown: z.string().max(5_000_000),
        title: z.string().max(255).optional(),
        format: z.enum(["html", "txt", "docx", "pdf"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      await createLibraryActor(ctx, tenantIdResolved);

      const artifact = await generateMarkdownExportArtifact({
        markdown: input.markdown,
        title: input.title,
        format: input.format,
      });

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.exportMarkdownArtifact",
        requestType: "mutation",
        requestPayload: {
          tenantId: tenantIdResolved,
          format: input.format,
          title: input.title,
          markdownLength: input.markdown.length,
        },
        responsePayload: {
          fileName: artifact.fileName,
          mimeType: artifact.mimeType,
          dataBase64Length: artifact.dataBase64.length,
        },
      });

      return artifact;
    }),

  saveMarkdown: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        content: z.string().max(5_000_000),
        expectedUpdatedAt: z.coerce.date().optional(),
        changeDescription: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
        parentId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      const item = await getLibraryItemById(input.id, actor);
      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Library item not found",
        });
      }
      if (item.itemType === PRESENTATION_ITEM_TYPE) {
        const isTemplate = isPresentationTemplateItem(item);
        const isAdmin = actor.role === "admin";
        const isOwner = item.ownerUserId === actor.userId;
        if (isTemplate && !isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only admin can delete presentation templates",
          });
        }
        if (!isTemplate && !isOwner && !isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only delete your own presentation projects",
          });
        }
      }

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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

  getPublicShareLink: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      return getPublicShareLinkState(input, actor);
    }),

  createPublicShareLink: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      const link = await createPublicShareLink(input, actor);
      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.createPublicShareLink",
        requestType: "mutation",
        requestPayload: {
          tenantId: tenantIdResolved,
          itemId: input.itemId,
        },
        responsePayload: {
          success: true,
        },
      });

      return { success: true, link };
    }),

  revokePublicShareLink: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      const link = await revokePublicShareLink(input, actor);
      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.revokePublicShareLink",
        requestType: "mutation",
        requestPayload: {
          tenantId: tenantIdResolved,
          itemId: input.itemId,
        },
        responsePayload: {
          success: true,
        },
      });

      return { success: true, link };
    }),

  resolvePublicShareLink: publicProcedure
    .input(z.object({ token: publicShareTokenSchema }))
    .query(async ({ input }) => {
      return resolvePublicShareLink(input.token);
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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      const version = await getContentVersionById(input.versionId, actor);
      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Version not found",
        });
      }

      return version;
    }),

  getVersionSnapshotUrl: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      const result = await getVersionSnapshotDownloadUrl(input.versionId, actor);
      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File snapshot not found for this version",
        });
      }

      return result;
    }),

  restoreVersion: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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
      const actor = await createLibraryActor(ctx, tenantIdResolved);

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

  // ─── Folder procedures ────────────────────────────────────────────────────

  createFolder: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        parentId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      const result = await createLibraryFolder(input, actor);

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.createFolder",
        requestType: "mutation",
        requestPayload: { tenantId: tenantIdResolved, name: input.name, parentId: input.parentId },
        responsePayload: { itemId: result.item.id },
      });

      return result;
    }),

  getFolderPath: protectedProcedure
    .input(z.object({ folderId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      return getLibraryFolderAncestors(input.folderId, tenantIdResolved);
    }),

  /** Returns number of non-deleted direct children in a folder. */
  getFolderChildCount: protectedProcedure
    .input(z.object({ folderId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const cnt = await getLibraryFolderChildCount(input.folderId, tenantIdResolved);
      return { count: cnt };
    }),

  /** Batch soft-delete multiple items at once. */
  deleteItems: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).min(1).max(200),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      const deleted = await batchSoftDeleteLibraryItems(input.ids, actor);

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.deleteItems",
        requestType: "mutation",
        requestPayload: { tenantId: tenantIdResolved, ids: input.ids },
        responsePayload: { deleted },
      });

      return { deleted };
    }),

  /** Share all owned library items with a specific group. */
  shareLibrary: protectedProcedure
    .input(
      z.object({
        folderId: z.number().int().positive(),
        groupId: z.number().int().positive(),
        permissionLevel: sharePermissionLevelSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!shareOperationLimiter.isAllowed(`user:${ctx.user.id}`)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many share operations. Please try again later." });
      }
      const tenantIdResolved = await resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantIdResolved);
      const actor = await createLibraryActor(ctx, tenantIdResolved);

      const result = await shareLibraryToGroup(input, actor);

      auditLogger.log({
        eventType: "library_mutation",
        userId: ctx.user.id,
        endpoint: "library.shareLibrary",
        requestType: "mutation",
        requestPayload: { tenantId: tenantIdResolved, folderId: input.folderId, groupId: input.groupId, permissionLevel: input.permissionLevel },
        responsePayload: { shared: result.shared },
      });

      return result;
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
