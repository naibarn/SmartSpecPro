/**
 * Search tRPC router — semantic search over documents and images
 * via Cloudflare Vectorize.
 *
 * Uses protectedProcedure for tenant isolation. The tenantId is
 * derived from the authenticated user's session, never from client input.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { searchDocs, searchImages } from "../services/vectorize-search";

function resolveSearchTenantId(
  ctx: { tenantId: unknown; user: { currentTenantId?: unknown } },
): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);

  if (tenantId === null || tenantId === undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for search operations",
    });
  }

  return tenantId;
}

export const searchRouter = router({
  docs: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        type: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = resolveSearchTenantId(ctx);
      return searchDocs({ ...input, tenantId });
    }),

  images: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().min(1).max(50).default(10),
        scope: z.enum(["all", "library", "marketplace"]).optional().default("all"),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = resolveSearchTenantId(ctx);
      return searchImages({ ...input, tenantId });
    }),
});
