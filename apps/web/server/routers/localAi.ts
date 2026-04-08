import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { router, protectedProcedure } from "../_core/trpc";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { resolveLocalAiPolicy } from "../services/localAiPolicy";
import { analyzeLocalAiAttachmentAssist } from "../services/localAiMediaAssist";

const localAiPlatformSchema = z.enum(["web", "tauri", "android_future"]);
const localAiAttachmentAssistModeSchema = z.enum([
  "auto",
  "real_world_vision",
  "document_ocr",
  "extract_text",
]);

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
  analyzeAttachmentAssist: protectedProcedure
    .input(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(255),
        contentBase64: z.string().trim().min(1),
        mode: localAiAttachmentAssistModeSchema.default("auto"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId =
        ctx.tenantId ?? String(ctx.user.currentTenantId ?? "").trim();
      const tenantFlags = tenantId
        ? await getTenantFeatureFlags(tenantId)
        : { localClientLlmMode: false };
      if (!tenantFlags.localClientLlmMode) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Local attachment assist is disabled for this tenant.",
        });
      }

      return analyzeLocalAiAttachmentAssist({
        fileName: input.fileName,
        mimeType: input.mimeType,
        contentBase64: input.contentBase64,
        mode: input.mode,
      });
    }),
});
