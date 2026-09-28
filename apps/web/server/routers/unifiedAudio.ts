import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { unifiedAudioVoiceService } from "../services/unifiedAudioVoiceService";
import { unifiedAudioTranscriptionService } from "../services/unifiedAudioTranscriptionService";

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
  revokeVoiceConsent: unifiedAudioProcedure.input(z.object({ consentId: id, revision: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.revokeVoiceConsent(actor(ctx), input.consentId, input.revision); } catch (error) { mapError(error); }
  }),
  createVoiceProfile: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.createVoiceProfile(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  createVoiceDataset: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.createVoiceDataset(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  getVoiceProfile: unifiedAudioProcedure.input(z.object({ voiceProfileId: id, revision: z.number().int().positive().optional() })).query(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.getVoiceProfile(actor(ctx), input.voiceProfileId, input.revision); } catch (error) { mapError(error); }
  }),
  saveVoiceBinding: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.saveVoiceBinding(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  revokeVoiceBinding: unifiedAudioProcedure.input(z.object({ voiceBindingId: id, revision: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.revokeVoiceBinding(actor(ctx), input.voiceBindingId, input.revision); } catch (error) { mapError(error); }
  }),
  queueTts: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.queueTts(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  queueTraining: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.queueTraining(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  recordTrainingEvaluation: unifiedAudioProcedure.input(z.object({ modelId: id, passed: z.boolean(), metrics: z.record(z.string(), z.number().finite()), evaluationArtifactId: id })).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.recordTrainingEvaluation(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  promoteTrainedVoiceModel: unifiedAudioProcedure.input(z.object({ modelId: id })).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioVoiceService.promoteTrainedVoiceModel(actor(ctx), input.modelId); } catch (error) { mapError(error); }
  }),
  listTranscriptionCapabilities: unifiedAudioProcedure.query(() => unifiedAudioTranscriptionService.listCapabilities()),
  preflightTranscription: unifiedAudioProcedure.input(z.unknown()).mutation(({ input }) => {
    try { return unifiedAudioTranscriptionService.preflight(input); } catch (error) { mapError(error); }
  }),
  queueTranscription: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioTranscriptionService.queueTranscription(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  queueAlignment: unifiedAudioProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioTranscriptionService.queueAlignment(actor(ctx), input); } catch (error) { mapError(error); }
  }),
  getAudioRun: unifiedAudioProcedure.input(z.object({ jobId: id })).query(async ({ ctx, input }) => {
    try { return await unifiedAudioTranscriptionService.getRun(actor(ctx), input.jobId); } catch (error) { mapError(error); }
  }),
  cancelAudioRun: unifiedAudioProcedure.input(z.object({ jobId: id })).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioTranscriptionService.cancelRun(actor(ctx), input.jobId); } catch (error) { mapError(error); }
  }),
  exportTranscript: unifiedAudioProcedure.input(z.object({ transcriptArtifactId: id, formats: z.array(z.enum(["json", "srt", "vtt", "ass"])).min(1).max(4), expectedRevision: id.optional() })).mutation(async ({ ctx, input }) => {
    try { return await unifiedAudioTranscriptionService.exportTranscript(actor(ctx), input); } catch (error) { mapError(error); }
  }),
});

export type UnifiedAudioRouter = typeof unifiedAudioRouter;
