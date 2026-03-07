/**
 * Artifact tRPC Router
 * CRUD operations for conversation artifacts (versioned types).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getConversationArtifacts,
  getArtifactVersions,
  createArtifactVersion,
} from "../services/artifactStorageService";

export const artifactRouter = router({
  /** List versioned artifacts for a conversation. */
  getArtifacts: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user.currentTenantId ?? "");
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });

      try {
        return await getConversationArtifacts(
          input.conversationId,
          ctx.user.id,
          tenantId,
        );
      } catch (err: any) {
        if (err.message === "FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN" });
        if (err.message === "NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND" });
        throw err;
      }
    }),

  /** Get version history for an artifact chain. */
  getArtifactVersions: protectedProcedure
    .input(z.object({ artifactId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user.currentTenantId ?? "");
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });

      try {
        return await getArtifactVersions(
          input.artifactId,
          ctx.user.id,
          tenantId,
        );
      } catch (err: any) {
        if (err.message === "FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN" });
        if (err.message === "NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND" });
        throw err;
      }
    }),

  /** Create a new version of a versioned artifact. */
  updateArtifact: protectedProcedure
    .input(z.object({
      artifactId: z.string(),
      content: z.string().max(512000),
      title: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user.currentTenantId ?? "");
      try {
        return await createArtifactVersion(
          input.artifactId,
          input.content,
          ctx.user.id,
          tenantId,
        );
      } catch (err: any) {
        if (err.message === "FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN" });
        if (err.message === "NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND" });
        if (err.message?.includes("500KB")) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: err.message });
        }
        throw err;
      }
    }),
});
