import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import {
  PRESENTATION_EDITOR_ROUTE_BASE,
  PRESENTATION_ERROR_CODE,
  isPresentationFeatureEnabled,
  isPresentationExportWriteEnabled,
} from "@shared/presentation/constants";
import {
  isPresentationItemType,
  presentationAvailabilitySchema,
  presentationSlideContentSchema,
  presentationRouteGuardInputSchema,
  presentationRouteGuardResultSchema,
  audioTrackInputSchema,
  projectAudioTrackInputSchema,
  type PresentationAvailability,
  type PresentationRouteBlockedResult,
  type PresentationRouteGuardResult,
} from "@shared/presentation/contracts";
import { getDb } from "../db";
import { getExportsByDeckId } from "../services/presentationExportService";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  PresentationServiceError,
  addSlideToDeck,
  attachAssetToDeck,
  createPresentationDeckForLibraryItem,
  deletePresentationDeck,
  deleteSlideFromDeck,
  detachAssetFromDeck,
  duplicateSlideInDeck,
  createPresentationFromTemplate,
  createTemplateFromPresentation,
  getPresentationDeckByLibraryItem,
  getPresentationDeckDetail,
  listPresentationVersionHistory,
  listAssetsForDeck,
  listSlidesForDeck,
  reorderSlidesInDeck,
  restorePresentationVersion,
  updatePresentationDeckMetadata,
  updateSlideInDeck,
  updateSlideAudioTrack,
  updateDeckProjectAudioTrack,
} from "../services/presentationService";
import {
  convertOfficeSourceToPresentation,
  getPresentationCompatibilityOpen,
} from "../services/presentationCompatibilityService";
import {
  buildPlayDeckPayload,
  buildSlideshowPayload,
  cancelPresentationExport,
  getPresentationExportStatus,
  triggerPresentationExport,
} from "../services/presentationPlaybackExport";
import { applyTemplateAssetToDeck } from "../services/presentationTemplateService";

const DOCUMENT_MANAGEMENT_ROUTE_BASE =
  "/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=";

function buildWrongTypeGuard(itemId: number, itemType: string): PresentationRouteBlockedResult {
  return {
    allowed: false,
    itemId,
    itemType,
    errorCode: PRESENTATION_ERROR_CODE.ITEM_TYPE_MISMATCH,
    message: `Presentation editor only supports itemType=\"presentation\". Received \"${itemType}\".`,
    recoveryCta: {
      label: "Open in Document Management",
      href: `${DOCUMENT_MANAGEMENT_ROUTE_BASE}${itemId}`,
    },
  };
}

function buildFeatureDisabledGuard(itemId: number, itemType: string): PresentationRouteBlockedResult {
  return {
    allowed: false,
    itemId,
    itemType,
    errorCode: PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
    message: "Presentation editor is currently disabled.",
    recoveryCta: {
      label: "Open in Document Management",
      href: `${DOCUMENT_MANAGEMENT_ROUTE_BASE}${itemId}`,
    },
  };
}

function getAvailability(): PresentationAvailability {
  if (!isPresentationFeatureEnabled()) {
    return {
      enabled: false,
      errorCode: PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
      message: "Presentation editor is currently disabled.",
    };
  }

  return { enabled: true };
}

function ensureFeatureEnabled(): void {
  if (isPresentationFeatureEnabled()) {
    return;
  }

  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
    `${PRESENTATION_ERROR_CODE.FEATURE_DISABLED}: presentation editor is currently disabled`,
  );
}

function ensureExportWriteEnabled(): void {
  if (isPresentationExportWriteEnabled()) {
    return;
  }

  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
    `${PRESENTATION_ERROR_CODE.FEATURE_DISABLED}: presentation export writes are currently disabled`,
  );
}

function resolvePresentationTenantId(
  ctx: { tenantId: unknown; user: { currentTenantId?: unknown } },
): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for presentation operations",
    });
  }

  return tenantId;
}

function mapPresentationServiceError(error: PresentationServiceError): TRPCError {
  if (error.code === PRESENTATION_ERROR_CODE.VERSION_CONFLICT) {
    return new TRPCError({
      code: "CONFLICT",
      message: error.message,
      cause: error.details?.conflict,
    });
  }

  if (error.code === PRESENTATION_ERROR_CODE.NOT_FOUND) {
    return new TRPCError({ code: "NOT_FOUND", message: error.message });
  }

  if (
    error.code === PRESENTATION_ERROR_CODE.PERMISSION_DENIED
    || error.code === PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED
    || error.code === PRESENTATION_ERROR_CODE.FEATURE_DISABLED
  ) {
    return new TRPCError({ code: "FORBIDDEN", message: error.message });
  }

  if (error.code === PRESENTATION_ERROR_CODE.CONVERSION_IN_PROGRESS) {
    return new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message });
  }

  if (error.code === PRESENTATION_ERROR_CODE.EXPORT_THROTTLED) {
    return new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message, cause: error.details });
  }

  return new TRPCError({ code: "BAD_REQUEST", message: error.message });
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

const deckIdSchema = z.object({
  deckId: z.number().int().positive(),
});

export const presentationRouter = router({
  availability: protectedProcedure.query(() => {
    return presentationAvailabilitySchema.parse(getAvailability());
  }),

  getDeck: protectedProcedure
    .input(deckIdSchema)
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await getPresentationDeckDetail(input.deckId, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  getDeckByLibraryItem: protectedProcedure
    .input(z.object({
      libraryItemId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const deck = await getPresentationDeckByLibraryItem(input.libraryItemId, toPresentationActor(ctx));
        if (!deck) {
          throw new PresentationServiceError(
            PRESENTATION_ERROR_CODE.NOT_FOUND,
            `${PRESENTATION_ERROR_CODE.NOT_FOUND}: no presentation deck exists for library item ${input.libraryItemId}`,
          );
        }
        return deck;
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  compatibilityOpen: protectedProcedure
    .input(z.object({
      itemId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await getPresentationCompatibilityOpen(input.itemId, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  convertSource: protectedProcedure
    .input(z.object({
      sourceItemId: z.number().int().positive(),
      idempotencyKey: z.string().min(1).max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await convertOfficeSourceToPresentation(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  getSlideshow: protectedProcedure
    .input(deckIdSchema)
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const detail = await getPresentationDeckDetail(input.deckId, toPresentationActor(ctx));
        return buildSlideshowPayload(detail.slides, { deckId: detail.deck.id });
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  triggerExport: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      format: z.enum(["png", "jpg", "pdf", "mp4"]),
      quality: z.enum(["draft", "standard", "high"]).optional().default("standard"),
      idempotencyKey: z.string().min(1).max(128),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        ensureExportWriteEnabled();
        return await triggerPresentationExport(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  getExportStatus: protectedProcedure
    .input(z.object({
      exportId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await getPresentationExportStatus(input.exportId, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  cancelExport: protectedProcedure
    .input(z.object({ exportId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const actor = toPresentationActor(ctx);
        return await cancelPresentationExport(input.exportId, actor);
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  listExports: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      limit: z.number().int().min(1).max(20).default(10),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const actor = toPresentationActor(ctx);
        const db = await getDb();
        if (!db) return [];
        const exports = await getExportsByDeckId(input.deckId, actor.tenantId, input.limit, db);
        return exports.map((r) => ({
          exportId: r.id,
          format: r.format,
          status: r.status,
          downloadUrl: r.outputUrl ?? null,
          createdAt: r.createdAt,
          progressPct: r.progressPct,
          errorMessage: r.errorMessage ?? null,
        }));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  createDeck: protectedProcedure
    .input(z.object({
      libraryItemId: z.number().int().positive(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await createPresentationDeckForLibraryItem(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  saveAsTemplate: protectedProcedure
    .input(z.object({
      sourceLibraryItemId: z.number().int().positive(),
      templateTitle: z.string().min(1).max(255).optional(),
      templateDescription: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await createTemplateFromPresentation(
          {
            sourceLibraryItemId: input.sourceLibraryItemId,
            templateTitle: input.templateTitle,
            templateDescription: input.templateDescription,
          },
          toPresentationActor(ctx),
        );
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  useTemplate: protectedProcedure
    .input(z.object({
      templateLibraryItemId: z.number().int().positive(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await createPresentationFromTemplate(
          {
            templateLibraryItemId: input.templateLibraryItemId,
            title: input.title,
            description: input.description,
          },
          toPresentationActor(ctx),
        );
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  updateDeck: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await updatePresentationDeckMetadata(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  deleteDeck: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await deletePresentationDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  listSlides: protectedProcedure
    .input(deckIdSchema)
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await listSlidesForDeck(input.deckId, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  addSlide: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      title: z.string().min(1).max(255).optional(),
      slideContent: presentationSlideContentSchema.optional(),
      notes: z.string().max(5_000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await addSlideToDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  duplicateSlide: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      slideId: z.number().int().positive(),
      targetIndex: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await duplicateSlideInDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  updateSlide: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      slideId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      saveMode: z.enum(["manual", "autosave"]).optional(),
      title: z.string().min(1).max(255).optional(),
      slideContent: presentationSlideContentSchema.optional(),
      notes: z.string().max(5_000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await updateSlideInDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  listVersions: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await listPresentationVersionHistory(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  restoreVersion: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      versionId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await restorePresentationVersion(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  deleteSlide: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      slideId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await deleteSlideFromDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  reorderSlides: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      movedSlideId: z.number().int().positive(),
      targetIndex: z.number().int().min(0),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await reorderSlidesInDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  listAssets: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      slideId: z.number().int().positive().nullable().optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await listAssetsForDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  attachAsset: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      slideId: z.number().int().positive().nullable().optional(),
      libraryItemId: z.number().int().positive(),
      byteSize: z.number().int().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await attachAssetToDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  detachAsset: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      linkId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await detachAssetFromDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  applyTemplate: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      templateAssetLibraryItemId: z.number().int().positive(),
      slideId: z.number().int().positive().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await applyTemplateAssetToDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  setSlideAudio: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      slideId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      audioTrack: audioTrackInputSchema.nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await updateSlideAudioTrack(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  setDeckAudio: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      projectAudioTrack: projectAudioTrackInputSchema.nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await updateDeckProjectAudioTrack(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  getPlayDeck: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const actor = toPresentationActor(ctx);
        const deck = await getPresentationDeckByLibraryItem(input.itemId, actor);
        if (!deck) {
          throw new PresentationServiceError(
            PRESENTATION_ERROR_CODE.NOT_FOUND,
            `${PRESENTATION_ERROR_CODE.NOT_FOUND}: no presentation deck for library item ${input.itemId}`,
          );
        }
        const slideshowPayload = buildSlideshowPayload(deck.slides, { deckId: deck.deck.id });
        return await buildPlayDeckPayload(deck, slideshowPayload);
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  guardEditorOpen: protectedProcedure
    .input(presentationRouteGuardInputSchema)
    .query(({ input }): PresentationRouteGuardResult => {
      const availability = getAvailability();
      if (!availability.enabled) {
        return presentationRouteGuardResultSchema.parse(
          buildFeatureDisabledGuard(input.itemId, input.itemType),
        );
      }

      if (!isPresentationItemType(input.itemType)) {
        return presentationRouteGuardResultSchema.parse(
          buildWrongTypeGuard(input.itemId, input.itemType),
        );
      }

      return presentationRouteGuardResultSchema.parse({
        allowed: true,
        itemId: input.itemId,
        editorRoute: `${PRESENTATION_EDITOR_ROUTE_BASE}/${input.itemId}`,
      });
    }),
});
