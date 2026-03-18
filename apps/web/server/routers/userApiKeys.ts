import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import {
  setUserApiKey,
  getUserApiKeys,
  deleteUserApiKey,
} from "../services/userApiKeyService";
import { resolveTenantIdVarchar } from "../services/tenantContext";

const providerEnum = z.enum([
  "openai",
  "anthropic",
  "deepseek",
  "google",
  "openrouter",
]);

const rateLimitedProtected = protectedProcedure.use(
  createRateLimitMiddleware({
    namespace: "user-api-key-set",
    limit: 10,
    windowMs: 3_600_000,
  }),
);

export const userApiKeysRouter = router({
  setKey: rateLimitedProtected
    .input(
      z.object({
        provider: providerEnum,
        apiKey: z.string().min(8).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(
        ctx.tenantId,
        ctx.user.currentTenantId,
      );
      const result = await setUserApiKey(
        ctx.user.id,
        tenantId,
        input.provider,
        input.apiKey,
      );
      return {
        provider: result.provider,
        keyHint: result.keyHint,
        configured: true,
      };
    }),

  listKeys: protectedProcedure.query(async ({ ctx }) => {
    const keys = await getUserApiKeys(ctx.user.id);
    return keys.map((k) => ({
      provider: k.provider,
      keyHint: k.keyHint,
      configured: true,
    }));
  }),

  deleteKey: rateLimitedProtected
    .input(z.object({ provider: providerEnum }))
    .mutation(async ({ ctx, input }) => {
      await deleteUserApiKey(ctx.user.id, input.provider);
      return { success: true };
    }),
});
