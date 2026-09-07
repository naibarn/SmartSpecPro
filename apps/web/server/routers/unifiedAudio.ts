import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { unifiedAudioVoiceService } from "../services/unifiedAudioVoiceService";

const unifiedAudioProcedure = protectedProcedure.use(requireFeatureFlag("verticalDramaSeries"));
const id = z.string().trim().min(1).max(160);

function actor(ctx: { tenantId: string | null; user: { id: number } }) {
  if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return { tenantId: ctx.tenantId, userId: ctx.user.id };
}

function mapError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unified audio request failed" });
}

export const unifiedAudioRouter = router({
  createVoiceConsent: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.createVoiceConsent(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  createVoiceProfile: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.createVoiceProfile(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  getVoiceProfile: unifiedAudioProcedure.input(z.object({ voiceProfileId: id, revision: z.number().int().positive().optional() })).query(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.getVoiceProfile(actor(ctx), input.voiceProfileId, input.revision); } catch (error) { mapError(error); }
  }),
  saveVoiceBinding: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.saveVoiceBinding(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  queueTts: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.queueTts(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  queueTraining: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.queueTraining(actor(ctx), input); } catch (error) { mapError(error); }
  }),
});

export type UnifiedAudioRouter = typeof unifiedAudioRouter;
