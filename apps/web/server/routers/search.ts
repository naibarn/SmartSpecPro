/**
 * Search tRPC router — semantic search over documents and images
 * via Cloudflare Vectorize.
 *
 * Uses protectedProcedure for tenant isolation. The tenantId is
 * derived from the authenticated user's session, never from client input.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { searchDocs, searchImages } from "../services/vectorize-search";

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
      const tenantId = ctx.user.tenantId ?? String(ctx.user.id);
      return searchDocs({ ...input, tenantId });
    }),

  images: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId ?? String(ctx.user.id);
      return searchImages({ ...input, tenantId });
    }),
});
