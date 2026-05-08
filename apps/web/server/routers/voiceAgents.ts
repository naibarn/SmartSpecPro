import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import {
  voiceAgentClientEventInputSchema,
  voiceAgentConfigCreateInputSchema,
  voiceAgentConfigUpdateInputSchema,
  voiceAgentSessionCreateInputSchema,
  voiceAgentStopInputSchema,
} from "../../shared/voiceAgents";
import {
  createVoiceAgentConfig,
  getVoiceAgentConnectionMaterial,
  ingestVoiceAgentClientEvent,
  listEnabledVoiceAgentConfigs,
  listVoiceAgentToolCalls,
  listVoiceAgentConfigs,
  listVoiceAgentSessions,
  listVoiceAgentTranscriptEvents,
  setVoiceAgentConfigEnabled,
  stopVoiceAgentSession,
  updateVoiceAgentConfig,
  createVoiceAgentSession,
  getVoiceAgentSession,
} from "../services/voiceAgents";

function requireTenant(ctx: { tenantId: string | null }): string {
  if (!ctx.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context is required" });
  }
  return ctx.tenantId;
}

function sanitizeError(error: unknown): TRPCError {
  return new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : "Voice agent request failed",
  });
}

const voiceAgentsProcedure = protectedProcedure.use(requireFeatureFlag("voiceAgents"));
const voiceAgentsAdminProcedure = adminProcedure.use(requireFeatureFlag("voiceAgents"));
const rateLimitedVoiceAgentsProcedure = voiceAgentsProcedure.use(
  createRateLimitMiddleware({ namespace: "voice-agents", limit: 20, windowMs: 60_000 }),
);

export const voiceAgentsRouter = router({
  admin: router({
    listConfigs: voiceAgentsAdminProcedure.query(async ({ ctx }) => {
      try {
        return await listVoiceAgentConfigs(requireTenant(ctx));
      } catch (err) {
        throw sanitizeError(err);
      }
    }),
    createConfig: voiceAgentsAdminProcedure.input(voiceAgentConfigCreateInputSchema).mutation(async ({ ctx, input }) => {
      try {
        return await createVoiceAgentConfig(requireTenant(ctx), ctx.user.id, input);
      } catch (err) {
        throw sanitizeError(err);
      }
    }),
    updateConfig: voiceAgentsAdminProcedure.input(voiceAgentConfigUpdateInputSchema).mutation(async ({ ctx, input }) => {
      try {
        return await updateVoiceAgentConfig(requireTenant(ctx), ctx.user.id, input);
      } catch (err) {
        throw sanitizeError(err);
      }
    }),
    setConfigEnabled: voiceAgentsAdminProcedure.input(z.object({
      id: z.number().int().positive(),
      isEnabled: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      try {
        return await setVoiceAgentConfigEnabled(requireTenant(ctx), ctx.user.id, input.id, input.isEnabled);
      } catch (err) {
        throw sanitizeError(err);
      }
    }),
    testConfig: voiceAgentsAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async () => ({
      success: true,
      message: "Voice agent config is syntactically valid",
    })),
    listSessions: voiceAgentsAdminProcedure.query(async ({ ctx }) => {
      try {
        return await listVoiceAgentSessions(requireTenant(ctx));
      } catch (err) {
        throw sanitizeError(err);
      }
    }),
    getSession: voiceAgentsAdminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      try {
        return await getVoiceAgentSession(requireTenant(ctx), input.id);
      } catch (err) {
        throw sanitizeError(err);
      }
    }),
    getTranscript: voiceAgentsAdminProcedure.input(z.object({ sessionId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      try {
        return await listVoiceAgentTranscriptEvents(requireTenant(ctx), input.sessionId);
      } catch (err) {
        throw sanitizeError(err);
      }
    }),
    getToolCalls: voiceAgentsAdminProcedure.input(z.object({ sessionId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      try {
        return await listVoiceAgentToolCalls(requireTenant(ctx), input.sessionId);
      } catch (err) {
        throw sanitizeError(err);
      }
    }),
  }),
  listEnabled: voiceAgentsProcedure.input(z.object({ surface: z.literal("chat").default("chat") }).default({ surface: "chat" })).query(async ({ ctx, input }) => {
    try {
      return await listEnabledVoiceAgentConfigs(requireTenant(ctx), input.surface);
    } catch (err) {
      throw sanitizeError(err);
    }
  }),
  createSession: rateLimitedVoiceAgentsProcedure.input(voiceAgentSessionCreateInputSchema).mutation(async ({ ctx, input }) => {
    try {
      return await createVoiceAgentSession(requireTenant(ctx), ctx.user.id, input);
    } catch (err) {
      throw sanitizeError(err);
    }
  }),
  getConnectionMaterial: rateLimitedVoiceAgentsProcedure.input(z.object({ sessionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    try {
      return await getVoiceAgentConnectionMaterial(requireTenant(ctx), ctx.user.id, input.sessionId);
    } catch (err) {
      throw sanitizeError(err);
    }
  }),
  stopSession: voiceAgentsProcedure.input(voiceAgentStopInputSchema).mutation(async ({ ctx, input }) => {
    try {
      return await stopVoiceAgentSession(requireTenant(ctx), ctx.user.id, input.sessionId);
    } catch (err) {
      throw sanitizeError(err);
    }
  }),
  ingestClientEvent: voiceAgentsProcedure.input(voiceAgentClientEventInputSchema).mutation(async ({ ctx, input }) => {
    try {
      return await ingestVoiceAgentClientEvent(requireTenant(ctx), ctx.user.id, input);
    } catch (err) {
      throw sanitizeError(err);
    }
  }),
});
