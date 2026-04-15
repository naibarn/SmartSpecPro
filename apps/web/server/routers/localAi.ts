import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { router, protectedProcedure } from "../_core/trpc";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { resolveLocalAiPolicy } from "../services/localAiPolicy";
import { analyzeLocalAiAttachmentAssist } from "../services/localAiMediaAssist";
import { deductCredits, hasEnoughCredits } from "../services/creditService";
import {
  calculateOcrCredits,
  classifyOcrFileClass,
  getDocumentOcrSettings,
  getDocumentOcrCreditsPerUnit,
  isOcrExtractor,
  resolveOcrPageCount,
  resolveOcrProvider,
  resolveDocumentOcrRouting,
} from "../services/documentOcrSettings";
import { recordFinanceOcrDebugStep } from "../services/financeOcrDebug";
import { getDocumentOcrProviderLabel } from "../../shared/documentOcrRouting";
import crypto from "crypto";

const localAiPlatformSchema = z.enum(["web", "tauri", "android_future"]);
const localAiAttachmentAssistModeSchema = z.enum([
  "auto",
  "real_world_vision",
  "document_ocr",
  "extract_text",
]);
const localAiAttachmentCaptureIntentSchema = z
  .enum(["receipt", "transfer_slip", "statement"])
  .nullable()
  .optional();

const documentOcrPreviewSchema = z.object({
  image: z.object({
    providerId: z.string(),
    providerLabel: z.string(),
    ready: z.boolean(),
    fallbackReason: z.string().nullable(),
  }),
  pdf: z.object({
    providerId: z.string(),
    providerLabel: z.string(),
    ready: z.boolean(),
    fallbackReason: z.string().nullable(),
  }),
});

export const localAiRouter = router({
  getPolicyAndCatalog: protectedProcedure
    .input(
      z
        .object({
          platform: localAiPlatformSchema.default("web"),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tenantId =
        ctx.tenantId ?? String(ctx.user.currentTenantId ?? "").trim();
      const tenantFlags = tenantId
        ? await getTenantFeatureFlags(tenantId)
        : { localClientLlmMode: false };

      return resolveLocalAiPolicy({
        tenantFlags: {
          localClientLlmMode: tenantFlags.localClientLlmMode,
        },
        platform: input?.platform ?? "web",
      });
    }),
  getDocumentOcrPreview: protectedProcedure.query(async () => {
    const settings = await getDocumentOcrSettings();
    const imageRoute = resolveDocumentOcrRouting({
      settings,
      mimeType: "image/png",
      fileName: "preview.png",
    });
    const pdfRoute = resolveDocumentOcrRouting({
      settings,
      mimeType: "application/pdf",
      fileName: "preview.pdf",
    });

    return documentOcrPreviewSchema.parse({
      image: {
        providerId: imageRoute.providerId,
        providerLabel: getDocumentOcrProviderLabel(imageRoute.providerId),
        ready: imageRoute.fallbackReason === null,
        fallbackReason: imageRoute.fallbackReason,
      },
      pdf: {
        providerId: pdfRoute.providerId,
        providerLabel: getDocumentOcrProviderLabel(pdfRoute.providerId),
        ready: pdfRoute.fallbackReason === null,
        fallbackReason: pdfRoute.fallbackReason,
      },
    });
  }),
  analyzeAttachmentAssist: protectedProcedure
    .input(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(255),
        contentBase64: z.string().trim().min(1),
        mode: localAiAttachmentAssistModeSchema.default("auto"),
        analysisProfile: z
          .enum(["document_ocr", "real_world_vision", "extract_text"])
          .optional(),
        captureIntent: localAiAttachmentCaptureIntentSchema,
        debugTraceId: z.string().trim().min(1).max(128).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId =
        ctx.tenantId ?? String(ctx.user.currentTenantId ?? "").trim();
      const tenantFlags = tenantId
        ? await getTenantFeatureFlags(tenantId)
        : { localClientLlmMode: false };
      if (!tenantFlags.localClientLlmMode && input.mode === "real_world_vision") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Local attachment assist is disabled for this tenant.",
        });
      }

      recordFinanceOcrDebugStep("chat_analyze_attachment_assist_start", {
        traceId: input.debugTraceId ?? null,
        fileName: input.fileName,
        mimeType: input.mimeType,
        mode: input.mode,
        analysisProfile: input.analysisProfile ?? null,
        captureIntent: input.captureIntent ?? null,
      });
      let assist: Awaited<ReturnType<typeof analyzeLocalAiAttachmentAssist>>;
      try {
        assist = await analyzeLocalAiAttachmentAssist({
          fileName: input.fileName,
          mimeType: input.mimeType,
          contentBase64: input.contentBase64,
          mode: input.mode,
          analysisProfile: input.analysisProfile,
          captureIntent: input.captureIntent,
          tenantId: tenantId || null,
        });
      } catch (error) {
        recordFinanceOcrDebugStep("chat_analyze_attachment_assist_failed", {
          traceId: input.debugTraceId ?? null,
          fileName: input.fileName,
          mimeType: input.mimeType,
          mode: input.mode,
          analysisProfile: input.analysisProfile ?? null,
          captureIntent: input.captureIntent ?? null,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      if (isOcrExtractor(assist.extractor)) {
        const settings = await getDocumentOcrSettings();
        const fileClass = classifyOcrFileClass({
          mimeType: input.mimeType,
          fileName: input.fileName,
        });
        const creditsPerUnit = getDocumentOcrCreditsPerUnit({
          settings,
          providerId: resolveOcrProvider(assist.metadata ?? {}, assist.extractor),
          fileClass,
        });
        if (creditsPerUnit > 0) {
          const pageCount = resolveOcrPageCount(assist.metadata ?? {}, input.mimeType);
          const amount = calculateOcrCredits(pageCount, creditsPerUnit);
          if (amount > 0) {
            const hasCredits = await hasEnoughCredits(ctx.user.id, amount);
            if (!hasCredits) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "Insufficient credits for OCR",
              });
            }
            const provider = resolveOcrProvider(assist.metadata ?? {}, assist.extractor);
            const billingUnit = fileClass === "pdf" ? "page" : "image";
            const unitCount = fileClass === "pdf" ? pageCount : 1;
            const hash = crypto.createHash("sha256").update(input.contentBase64).digest("hex").slice(0, 24);
            await deductCredits({
              userId: ctx.user.id,
              amount,
              tenantId: tenantId || undefined,
              sourceType: "other",
              description: `OCR (${provider || "document_ocr"}): ${input.fileName} · ${unitCount} ${billingUnit}${unitCount === 1 ? "" : "s"}`,
              idempotencyKey: `ocr:chat:${ctx.user.id}:${hash}`,
              metadata: {
                service: "chat.ocr",
                source: "chat_ocr",
                fileName: input.fileName,
                fileType: input.mimeType,
                fileClass,
                pageCount,
                billingUnit,
                creditsPerUnit,
                ocrProvider: provider,
                extractor: assist.extractor,
              },
            });
          }
        }
      }

      recordFinanceOcrDebugStep("chat_analyze_attachment_assist_success", {
        traceId: input.debugTraceId ?? null,
        fileName: input.fileName,
        mimeType: input.mimeType,
        mode: input.mode,
        extractor: assist.extractor,
        hasText: Boolean(assist.extractedText),
      });
      return assist;
    }),
});
