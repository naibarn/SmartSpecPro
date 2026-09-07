import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";

import { getDb } from "../db";
import {
  audioVoiceBindings,
  audioVoiceConsents,
  audioVoiceProfileRevisions,
  audioVoiceProfiles,
  audioVoiceTrainingRuns,
  workerJobs,
} from "../../drizzle/schema";
import {
  audioScopeSchema,
  executionPolicySchema,
  hashUnifiedAudioInput,
  ttsRequestSchema,
  voiceBindingSchema,
  voiceConsentSchema,
  voiceProfileSchema,
  voiceTrainingRunSchema,
  type AudioScope,
  type ExecutionPolicy,
  type TtsRequest,
  type VoiceBinding,
  type VoiceConsent,
  type VoiceProfile,
  type VoiceTrainingRun,
} from "../../shared/verticalDramaMedia/unifiedAudio";

type Actor = { tenantId: string; userId: number };

function ownerScopeId(scope: VoiceProfile["ownerScope"]): string {
  return scope.ownerScopeType === "project" ? scope.projectId : scope.seriesId;
}

function assertScopeOwner(scope: AudioScope, actor: Actor): void {
  if (!actor.tenantId || !actor.userId || !scope.workspaceId || !scope.projectId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Audio scope is unavailable" });
  }
}

function cleanError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const message = error instanceof Error ? error.message : "Unified audio request failed";
  if (/unique|duplicate/i.test(message)) throw new TRPCError({ code: "CONFLICT", message: "Idempotency or revision conflict" });
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export type UnifiedAudioVoiceServiceDeps = {
  now?: () => Date;
  id?: () => string;
};

const defaultDeps: Required<UnifiedAudioVoiceServiceDeps> = {
  now: () => new Date(),
  id: () => nanoid(20),
};

export class UnifiedAudioVoiceService {
  private readonly deps: Required<UnifiedAudioVoiceServiceDeps>;

  constructor(deps: UnifiedAudioVoiceServiceDeps = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async createVoiceConsent(actor: Actor, input: unknown): Promise<VoiceConsent> {
    try {
      const consent = voiceConsentSchema.parse(input);
      const database = getDb();
      await database.insert(audioVoiceConsents).values({
        consentId: consent.consentId,
        tenantId: actor.tenantId,
        createdByUserId: actor.userId,
        revision: consent.revision,
        consentJson: consent,
        status: consent.status,
      });
      return consent;
    } catch (error) {
      return cleanError(error);
    }
  }

  async createVoiceProfile(actor: Actor, input: unknown): Promise<VoiceProfile> {
    try {
      const profile = voiceProfileSchema.parse(input);
      const database = getDb();
      const contentHash = hashUnifiedAudioInput(profile);
      const [row] = await database.insert(audioVoiceProfiles).values({
        voiceProfileId: profile.voiceProfileId,
        tenantId: actor.tenantId,
        createdByUserId: actor.userId,
        ownerScopeType: profile.ownerScope.ownerScopeType,
        ownerScopeId: ownerScopeId(profile.ownerScope),
        currentRevision: profile.revision,
        status: profile.status,
      }).returning();
      await database.insert(audioVoiceProfileRevisions).values({
        profileId: row.id,
        tenantId: actor.tenantId,
        revision: profile.revision,
        profileJson: profile,
        contentHash,
        createdByUserId: actor.userId,
      });
      return profile;
    } catch (error) {
      return cleanError(error);
    }
  }

  async getVoiceProfile(actor: Actor, voiceProfileId: string, requestedRevision?: number): Promise<VoiceProfile | null> {
    const database = getDb();
    const [profile] = await database.select().from(audioVoiceProfiles).where(and(eq(audioVoiceProfiles.tenantId, actor.tenantId), eq(audioVoiceProfiles.voiceProfileId, voiceProfileId))).limit(1);
    if (!profile) return null;
    const [revision] = await database.select().from(audioVoiceProfileRevisions).where(and(eq(audioVoiceProfileRevisions.profileId, profile.id), eq(audioVoiceProfileRevisions.tenantId, actor.tenantId), requestedRevision ? eq(audioVoiceProfileRevisions.revision, requestedRevision) : eq(audioVoiceProfileRevisions.revision, profile.currentRevision))).orderBy(desc(audioVoiceProfileRevisions.revision)).limit(1);
    return revision ? voiceProfileSchema.parse(revision.profileJson) : null;
  }

  async saveVoiceBinding(actor: Actor, input: unknown): Promise<VoiceBinding> {
    try {
      const binding = voiceBindingSchema.parse(input);
      const profile = await this.getVoiceProfile(actor, binding.voiceProfileId, binding.voiceProfileRevision);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Voice profile not found" });
      const database = getDb();
      await database.insert(audioVoiceBindings).values({
        voiceBindingId: binding.voiceBindingId,
        tenantId: actor.tenantId,
        voiceProfileId: binding.voiceProfileId,
        voiceProfileRevision: binding.voiceProfileRevision,
        revision: binding.revision,
        bindingJson: binding,
        status: binding.approval,
        createdByUserId: actor.userId,
      });
      return binding;
    } catch (error) {
      return cleanError(error);
    }
  }

  async queueTts(actor: Actor, input: unknown): Promise<{ created: boolean; jobId: string; request: TtsRequest }> {
    try {
      const request = ttsRequestSchema.parse(input);
      assertScopeOwner(request.scope, actor);
      const profile = await this.getVoiceProfile(actor, request.voiceProfileId, request.voiceProfileRevision);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Voice profile not found" });
      const database = getDb();
      const [existing] = await database.select({ id: workerJobs.id, inputJson: workerJobs.inputJson }).from(workerJobs).where(and(eq(workerJobs.tenantId, actor.tenantId), eq(workerJobs.idempotencyKey, request.idempotencyKey))).limit(1);
      if (existing) {
        if (hashUnifiedAudioInput(existing.inputJson) !== hashUnifiedAudioInput(request)) throw new TRPCError({ code: "CONFLICT", message: "Idempotency key is already bound to a different request" });
        return { created: false, jobId: existing.id, request };
      }
      const [job] = await database.insert(workerJobs).values({
        tenantId: actor.tenantId,
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "tts_utterance_generate",
        requestedByUserId: actor.userId,
        status: "queued",
        statusReason: `unified_audio_${request.executionPolicy.mode}`,
        priority: request.executionPolicy.priority === "interactive" ? 40 : 20,
        resourceProfile: request.executionPolicy.mode === "cloud_only" ? "cpu_light" : "gpu_required",
        capabilityRequirementsJson: { capabilityFamilies: ["unified-audio-v2", request.voiceBindingId], executionTarget: request.executionPolicy.mode },
        inputJson: request,
        instructionsJson: { intent: "audio.tts", target: request.executionPolicy.mode, phases: ["preparing", "loading_model", "synthesizing", "postprocessing", "aligning", "artifacting"] },
        timeoutSeconds: Math.max(1, Math.ceil(request.executionPolicy.maxRuntimeMs / 1000)),
        retryPolicyJson: { maxAttempts: request.executionPolicy.maxAttempts, backoffSeconds: 5 },
        idempotencyKey: request.idempotencyKey,
      }).returning({ id: workerJobs.id });
      return { created: true, jobId: job.id, request };
    } catch (error) {
      return cleanError(error);
    }
  }

  async queueTraining(actor: Actor, input: unknown): Promise<{ created: boolean; jobId: string; run: VoiceTrainingRun }> {
    try {
      const run = voiceTrainingRunSchema.parse(input);
      assertScopeOwner(run.scope, actor);
      const database = getDb();
      const [existing] = await database.select({ id: audioVoiceTrainingRuns.jobId }).from(audioVoiceTrainingRuns).where(and(eq(audioVoiceTrainingRuns.tenantId, actor.tenantId), eq(audioVoiceTrainingRuns.idempotencyKey, run.idempotencyKey))).limit(1);
      if (existing) return { created: false, jobId: existing.id, run };
      await database.insert(audioVoiceTrainingRuns).values({ jobId: run.jobId, tenantId: actor.tenantId, datasetId: run.dataset.datasetId, datasetRevision: run.dataset.revision, idempotencyKey: run.idempotencyKey, recipeJson: run.recipe, status: "queued", createdByUserId: actor.userId });
      return { created: true, jobId: run.jobId, run };
    } catch (error) {
      return cleanError(error);
    }
  }
}

export const unifiedAudioVoiceService = new UnifiedAudioVoiceService();

export function parseExecutionPolicy(input: unknown): ExecutionPolicy {
  return executionPolicySchema.parse(input);
}

export function parseAudioScope(input: unknown): AudioScope {
  return audioScopeSchema.parse(input);
}
