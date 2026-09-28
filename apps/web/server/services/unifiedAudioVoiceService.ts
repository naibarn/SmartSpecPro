import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";

import { getDb } from "../db";
import {
  audioVoiceBindings,
  audioVoiceConsents,
  audioVoiceProfileRevisions,
  audioVoiceProfiles,
  audioVoiceDatasets,
  audioVoiceDatasetRevisions,
  audioVoiceTrainingRuns,
  audioTrainedVoiceModels,
  workerArtifacts,
  workerJobs,
} from "../../drizzle/schema";
import {
  audioScopeSchema,
  executionPolicySchema,
  hashUnifiedAudioInput,
  ttsRequestSchema,
  voiceBindingSchema,
  voiceConsentSchema,
  voiceDatasetSchema,
  voiceProfileSchema,
  voiceTrainingRunSchema,
  type AudioScope,
  type ExecutionPolicy,
  type TtsRequest,
  type VoiceBinding,
  type VoiceConsent,
  type VoiceDataset,
  type VoiceProfile,
  type VoiceTrainingRun,
} from "../../shared/verticalDramaMedia/unifiedAudio";
import { validateVoiceBindingCapability } from "../../shared/verticalDramaMedia/ttsProviderRegistry";
import { queueUnifiedAudioWorkerJob } from "./workerSchedulerService";
import { synthesize, calculateTTSCredits } from "./ttsService";
import { storagePut, storageReadBuffer } from "../storage";
import { billingEnvelopeFromMetadata, reconcileWorkerJobCredits } from "./workerBillingService";

type Actor = { tenantId: string; userId: number };

function ownerScopeId(scope: VoiceProfile["ownerScope"]): string {
  return scope.ownerScopeType === "project" ? scope.projectId : scope.seriesId;
}

function assertScopeOwner(scope: AudioScope, actor: Actor, ownerScope?: VoiceProfile["ownerScope"]): void {
  if (!actor.tenantId || !actor.userId || !scope.workspaceId || !scope.projectId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Audio scope is unavailable" });
  }
  if (ownerScope?.workspaceId !== scope.workspaceId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Audio scope does not belong to voice profile workspace" });
  }
  if (ownerScope?.ownerScopeType === "project" && ownerScope.projectId !== scope.projectId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Audio scope does not belong to voice profile project" });
  }
  if (ownerScope?.ownerScopeType === "series" && ownerScope.seriesId !== ("seriesId" in scope ? scope.seriesId : undefined)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Audio scope does not belong to voice profile series" });
  }
}

function cleanError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const message = error instanceof Error ? error.message : "Unified audio request failed";
  if (/unique|duplicate/i.test(message)) throw new TRPCError({ code: "CONFLICT", message: "Idempotency or revision conflict" });
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

async function assertInferenceConsent(actor: Actor, profile: VoiceProfile, binding: VoiceBinding): Promise<void> {
  if (!["reference_clone", "transcript_clone", "trained_voice"].includes(binding.mode)) return;
  const requiresProviderClone = binding.mode === "reference_clone" || binding.mode === "transcript_clone";
  const consentAllowsBinding = (value: unknown): boolean => {
    const data = (value ?? {}) as Record<string, unknown>;
    const operations = Array.isArray(data.allowedOperations) ? data.allowedOperations : [];
    const providers = Array.isArray(data.allowedProviders) ? data.allowedProviders.filter((item): item is string => typeof item === "string") : [];
    const locales = Array.isArray(data.allowedLocales) ? data.allowedLocales.filter((item): item is string => typeof item === "string") : [];
    return operations.includes("inference")
      && (!requiresProviderClone || operations.includes("provider_clone"))
      && (providers.length === 0 || providers.includes(binding.providerId))
      && (locales.length === 0 || locales.includes(binding.locale));
  };
  const now = Date.now();
  if (binding.mode === "trained_voice" && binding.selectedReferenceAudioArtifactIds.length === 0) {
    const rows = await getDb().select({ status: audioVoiceConsents.status, consentJson: audioVoiceConsents.consentJson }).from(audioVoiceConsents).where(and(eq(audioVoiceConsents.tenantId, actor.tenantId), inArray(audioVoiceConsents.consentId, profile.consentIds)));
    if (rows.length < profile.consentIds.length || rows.some((row) => row.status !== "granted" || !consentAllowsBinding(row.consentJson) || (typeof (row.consentJson as Record<string, unknown>).expiresAt === "string" && Date.parse(String((row.consentJson as Record<string, unknown>).expiresAt)) <= now))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "VOICE_CONSENT_REQUIRED: trained voice inference consent is not currently granted" });
    }
    return;
  }
  for (const reference of profile.references) {
    if (!binding.selectedReferenceAudioArtifactIds.includes(reference.referenceAudioArtifactId)) continue;
    const [consent] = await getDb().select({ status: audioVoiceConsents.status, expiresAt: audioVoiceConsents.consentJson }).from(audioVoiceConsents).where(and(eq(audioVoiceConsents.tenantId, actor.tenantId), eq(audioVoiceConsents.consentId, reference.consentId), eq(audioVoiceConsents.revision, reference.consentRevision))).limit(1);
    const consentJson = (consent?.expiresAt ?? {}) as Record<string, unknown>;
    const expiresAt = typeof consentJson.expiresAt === "string" ? Date.parse(consentJson.expiresAt) : NaN;
    if (!consent || consent.status !== "granted" || !consentAllowsBinding(consentJson) || (Number.isFinite(expiresAt) && expiresAt <= now)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "VOICE_CONSENT_REQUIRED: consent is not currently granted for inference" });
    }
  }
}

async function assertTrainingConsent(actor: Actor, dataset: VoiceDataset, providerId: string): Promise<void> {
  const rows = await getDb().select({ consentId: audioVoiceConsents.consentId, status: audioVoiceConsents.status, consentJson: audioVoiceConsents.consentJson }).from(audioVoiceConsents).where(and(eq(audioVoiceConsents.tenantId, actor.tenantId), inArray(audioVoiceConsents.consentId, dataset.consentIds)));
  const byId = new Map(rows.map((row) => [row.consentId, row]));
  const now = Date.now();
  for (const consentId of dataset.consentIds) {
    const row = byId.get(consentId);
    const data = (row?.consentJson ?? {}) as Record<string, unknown>;
    const expiresAt = typeof data.expiresAt === "string" ? Date.parse(data.expiresAt) : NaN;
    const operations = Array.isArray(data.allowedOperations) ? data.allowedOperations : [];
    const providers = Array.isArray(data.allowedProviders) ? data.allowedProviders.filter((item): item is string => typeof item === "string") : [];
    if (!row || row.status !== "granted" || !operations.includes("training") || (providers.length > 0 && !providers.includes(providerId)) || (Number.isFinite(expiresAt) && expiresAt <= now)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "TRAINING_CONSENT_REQUIRED: every dataset consent must allow training" });
    }
  }
}

async function resolvePromotedTrainedVoiceModel(actor: Actor, binding: VoiceBinding): Promise<Record<string, unknown>> {
  const artifactId = binding.trainedModelArtifactId;
  if (!artifactId) throw new TRPCError({ code: "BAD_REQUEST", message: "TRAINING_MODEL_REQUIRED: trained voice binding has no model artifact" });
  const rows = await getDb().select().from(audioTrainedVoiceModels).where(and(eq(audioTrainedVoiceModels.tenantId, actor.tenantId), eq(audioTrainedVoiceModels.status, "promoted")));
  const row = rows.find((candidate) => {
    const model = candidate.modelJson as Record<string, unknown>;
    return model.artifactId === artifactId;
  });
  if (!row) throw new TRPCError({ code: "TRAINING_MODEL_UNAVAILABLE", message: "TRAINING_MODEL_UNAVAILABLE: model must be evaluated and promoted before binding" });
  const model = row.modelJson as Record<string, unknown>;
  const providerId = typeof model.providerId === "string" ? model.providerId : "";
  const modelId = typeof model.modelId === "string" ? model.modelId : "";
  if (providerId !== binding.providerId || modelId !== binding.modelId || typeof model.checksumSha256 !== "string" || !model.checksumSha256) {
    throw new TRPCError({ code: "CONFLICT", message: "TRAINING_MODEL_INVALID: promoted model identity or checksum does not match binding" });
  }
  return {
    modelId: row.modelId,
    artifactId,
    checksum: model.checksumSha256,
    providerId,
    modelIdForProvider: modelId,
    baseModelRevision: model.baseModelRevision ?? null,
    status: row.status,
  };
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

  async revokeVoiceConsent(actor: Actor, consentId: string, revision: number): Promise<{ consentId: string; revision: number; status: "revoked" }> {
    const database = getDb();
    const [row] = await database.select().from(audioVoiceConsents).where(and(eq(audioVoiceConsents.tenantId, actor.tenantId), eq(audioVoiceConsents.consentId, consentId), eq(audioVoiceConsents.revision, revision))).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Voice consent not found" });
    const consentJson = { ...(row.consentJson as Record<string, unknown>), revokedAt: new Date().toISOString() };
    await database.update(audioVoiceConsents).set({ status: "revoked", consentJson, updatedAt: new Date() }).where(eq(audioVoiceConsents.id, row.id));
    return { consentId, revision, status: "revoked" };
  }

  async createVoiceProfile(actor: Actor, input: unknown): Promise<VoiceProfile> {
    try {
      const profile = voiceProfileSchema.parse(input);
      const database = getDb();
      const contentHash = hashUnifiedAudioInput(profile);
      await database.transaction(async (tx) => {
        const [row] = await tx.insert(audioVoiceProfiles).values({
          voiceProfileId: profile.voiceProfileId,
          tenantId: actor.tenantId,
          createdByUserId: actor.userId,
          ownerScopeType: profile.ownerScope.ownerScopeType,
          ownerScopeId: ownerScopeId(profile.ownerScope),
          workspaceId: profile.ownerScope.workspaceId,
          currentRevision: profile.revision,
          status: profile.status,
        }).returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Voice profile insert returned no row" });
        await tx.insert(audioVoiceProfileRevisions).values({
          profileId: row.id,
          tenantId: actor.tenantId,
          revision: profile.revision,
          profileJson: profile,
          contentHash,
          createdByUserId: actor.userId,
        });
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
      const capability = validateVoiceBindingCapability(binding, profile);
      if (!capability.ok) throw new TRPCError({ code: "BAD_REQUEST", message: `${capability.code}: ${capability.message}` });
      if (binding.mode === "trained_voice" && binding.approval === "approved") {
        await resolvePromotedTrainedVoiceModel(actor, binding);
      }
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

  async revokeVoiceBinding(actor: Actor, voiceBindingId: string, revision: number): Promise<{ voiceBindingId: string; revision: number; status: "revoked" }> {
    const database = getDb();
    const [row] = await database.select().from(audioVoiceBindings).where(and(eq(audioVoiceBindings.tenantId, actor.tenantId), eq(audioVoiceBindings.voiceBindingId, voiceBindingId), eq(audioVoiceBindings.revision, revision))).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Voice binding not found" });
    await database.update(audioVoiceBindings).set({ status: "revoked", bindingJson: { ...(row.bindingJson as Record<string, unknown>), approval: "revoked" }, updatedAt: new Date() }).where(eq(audioVoiceBindings.id, row.id));
    return { voiceBindingId, revision, status: "revoked" };
  }

  private async executeCloudTtsJob(actor: Actor, jobId: string, request: TtsRequest, binding: VoiceBinding, profile: VoiceProfile): Promise<void> {
    let referenceAudioBase64: string | undefined;
    let referenceText: string | undefined;
    if (binding.mode === "reference_clone" || binding.mode === "transcript_clone") {
      const referenceId = binding.selectedReferenceAudioArtifactIds[0];
      const reference = profile.references.find((candidate) => candidate.referenceAudioArtifactId === referenceId);
      if (!reference || reference.artifactRef.location !== "managed") throw new TRPCError({ code: "BAD_REQUEST", message: "Cloud clone requires a managed reference artifact" });
      const [artifact] = await getDb().select({ storageRef: workerArtifacts.storageRef, metadataJson: workerArtifacts.metadataJson }).from(workerArtifacts).innerJoin(workerJobs, eq(workerJobs.id, workerArtifacts.workerJobId)).where(and(eq(workerArtifacts.id, reference.artifactRef.artifactId), eq(workerJobs.tenantId, actor.tenantId), eq(workerJobs.status, "completed"))).limit(1);
      if (!artifact) throw new TRPCError({ code: "NOT_FOUND", message: "Reference audio artifact not found" });
      const bytes = await storageReadBuffer(artifact.storageRef);
      if (!bytes || bytes.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Reference audio artifact is unavailable" });
      const storedChecksum = String((artifact.metadataJson as Record<string, unknown> | null)?.checksumSha256 ?? "");
      const actualChecksum = createHash("sha256").update(bytes).digest("hex");
      if (storedChecksum !== reference.artifactRef.checksum || actualChecksum !== reference.artifactRef.checksum) {
        throw new TRPCError({ code: "CONFLICT", message: "Reference audio artifact checksum does not match the pinned profile" });
      }
      referenceAudioBase64 = bytes.toString("base64");
      referenceText = reference.referenceTranscript ?? undefined;
    }
    if (!["openai", "elevenlabs", "omnivoice"].includes(binding.providerId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "TTS provider has no configured server cloud adapter" });
    }
    const database = getDb();
    await database.update(workerJobs).set({ status: "running", startedAt: new Date() }).where(and(eq(workerJobs.id, jobId), eq(workerJobs.tenantId, actor.tenantId)));
    try {
      const result = await synthesize(request.utterance.effectiveText, {
        format: request.output.format,
        provider: binding.providerId as "openai" | "elevenlabs" | "omnivoice",
        voice: binding.providerVoiceId ?? "alloy",
        speed: typeof binding.settings.speed === "number" ? binding.settings.speed : 1,
        instruct: typeof binding.settings.instruct === "string" ? binding.settings.instruct : undefined,
        referenceAudioBase64,
        referenceText,
      });
      if (result.durationMs === null) throw new Error("TTS_OUTPUT_INVALID: decoded duration is unavailable");
      const checksum = createHash("sha256").update(result.audioBuffer).digest("hex");
      const stored = await storagePut(`worker-artifacts/${actor.tenantId}/${jobId}/tts-${checksum}.audio`, result.audioBuffer, result.contentType);
      const selectedReferences = profile.references.filter((reference) => binding.selectedReferenceAudioArtifactIds.includes(reference.referenceAudioArtifactId));
      const [artifact] = await database.insert(workerArtifacts).values({
        workerJobId: jobId,
        artifactType: "tts_audio",
        storageRef: stored.key,
        metadataJson: {
          contentType: result.contentType,
          sizeBytes: result.audioBuffer.byteLength,
          checksumSha256: checksum,
          durationMs: result.durationMs,
          providerId: binding.providerId,
          modelId: binding.modelId,
          provenance: {
            voiceProfileId: request.voiceProfileId,
            voiceProfileRevision: request.voiceProfileRevision,
            voiceBindingId: request.voiceBindingId,
            voiceBindingRevision: request.voiceBindingRevision,
            consentId: binding.consentSnapshot?.consentId ?? selectedReferences[0]?.consentId ?? null,
            consentRevision: binding.consentSnapshot?.revision ?? selectedReferences[0]?.consentRevision ?? null,
            referenceAudioArtifactIds: selectedReferences.map((reference) => reference.referenceAudioArtifactId),
            referenceHashes: selectedReferences.map((reference) => reference.artifactRef.checksum),
          },
        },
      }).returning();
      await database.update(workerJobs).set({ status: "completed", outputJson: { status: "completed", artifactId: artifact?.id ?? null, storageRef: stored.key, durationMs: result.durationMs, checksumSha256: checksum }, finishedAt: new Date() }).where(and(eq(workerJobs.id, jobId), eq(workerJobs.tenantId, actor.tenantId)));
      const [job] = await database.select({ instructionsJson: workerJobs.instructionsJson }).from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
      await reconcileWorkerJobCredits({ userId: actor.userId, tenantId: actor.tenantId, jobId, billing: billingEnvelopeFromMetadata(job?.instructionsJson && (job.instructionsJson as Record<string, unknown>).workerBilling), finalStatus: "completed", actualCreditsUsed: calculateTTSCredits(request.utterance.effectiveText.length), metadata: { providerId: binding.providerId, modelId: binding.modelId } });
    } catch (error) {
      await database.update(workerJobs).set({ status: "failed", failureReason: error instanceof Error ? error.message : String(error), finishedAt: new Date() }).where(and(eq(workerJobs.id, jobId), eq(workerJobs.tenantId, actor.tenantId)));
      const [job] = await database.select({ instructionsJson: workerJobs.instructionsJson }).from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
      await reconcileWorkerJobCredits({ userId: actor.userId, tenantId: actor.tenantId, jobId, billing: billingEnvelopeFromMetadata(job?.instructionsJson && (job.instructionsJson as Record<string, unknown>).workerBilling), finalStatus: "failed", actualCreditsUsed: 0 });
      throw error;
    }
  }

  async queueTts(actor: Actor, input: unknown): Promise<{ created: boolean; jobId: string; request: TtsRequest }> {
    try {
      const request = ttsRequestSchema.parse(input);
      const profile = await this.getVoiceProfile(actor, request.voiceProfileId, request.voiceProfileRevision);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Voice profile not found" });
      assertScopeOwner(request.scope, actor, profile.ownerScope);
      const [bindingRow] = await getDb().select().from(audioVoiceBindings).where(and(eq(audioVoiceBindings.tenantId, actor.tenantId), eq(audioVoiceBindings.voiceBindingId, request.voiceBindingId), eq(audioVoiceBindings.revision, request.voiceBindingRevision))).limit(1);
      if (!bindingRow) throw new TRPCError({ code: "NOT_FOUND", message: "Voice binding not found" });
      const binding = voiceBindingSchema.parse(bindingRow.bindingJson);
      if (binding.approval !== "approved") throw new TRPCError({ code: "FORBIDDEN", message: "Voice binding is not approved" });
      if (binding.voiceProfileId !== profile.voiceProfileId || binding.voiceProfileRevision !== profile.revision) throw new TRPCError({ code: "CONFLICT", message: "Voice binding is stale" });
      if (binding.target === "worker_local" && request.executionPolicy.mode === "cloud_only") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "EXECUTION_POLICY_CONFLICT: cloud_only requires a server_cloud binding" });
      }
      if (binding.target === "server_cloud" && request.executionPolicy.mode === "local_only") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "EXECUTION_POLICY_CONFLICT: local_only requires a worker_local binding" });
      }
      const capability = validateVoiceBindingCapability(binding, profile);
      if (!capability.ok) throw new TRPCError({ code: "BAD_REQUEST", message: `${capability.code}: ${capability.message}` });
      await assertInferenceConsent(actor, profile, binding);
      const trainedVoiceModel = binding.mode === "trained_voice"
        ? await resolvePromotedTrainedVoiceModel(actor, binding)
        : undefined;
      const queued = await queueUnifiedAudioWorkerJob({
        tenantId: actor.tenantId,
        requestedByUserId: actor.userId,
        jobType: "tts_utterance_generate",
        // Freeze the approved binding into the worker payload. The worker must
        // never re-resolve a mutable catalog row while a job is running.
        inputJson: { ...request, voiceBinding: binding, voiceProfile: profile, ...(trainedVoiceModel ? { trainedVoiceModel } : {}) },
        idempotencyKey: request.idempotencyKey,
        priority: request.executionPolicy.priority === "interactive" ? 40 : 20,
        timeoutSeconds: Math.max(1, Math.ceil(request.executionPolicy.maxRuntimeMs / 1000)),
        resourceProfile: binding.target === "worker_local" ? "gpu_required" : "cpu_light",
        capabilityFamilies: binding.target === "server_cloud" ? ["server-cloud-audio", `tts-provider:${binding.providerId}`, `tts-model:${binding.modelId}`] : [`tts-provider:${binding.providerId}`, `tts-model:${binding.modelId}`],
        reservedCredits: request.executionPolicy.maxCostCredits,
      });
      if (binding.target === "server_cloud" && queued.created) {
        await this.executeCloudTtsJob(actor, queued.job.id, request, binding, profile);
      }
      return { created: queued.created, jobId: queued.job.id, request };
    } catch (error) {
      return cleanError(error);
    }
  }

  async queueTraining(actor: Actor, input: unknown): Promise<{ created: boolean; jobId: string; run: VoiceTrainingRun }> {
    try {
      const run = voiceTrainingRunSchema.parse(input);
      if (run.target === "server_cloud") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TRAINING_UNAVAILABLE: no official server cloud training adapter is enabled" });
      }
      const [dataset] = await getDb().select().from(audioVoiceDatasets).where(and(eq(audioVoiceDatasets.tenantId, actor.tenantId), eq(audioVoiceDatasets.datasetId, run.dataset.datasetId))).limit(1);
      if (!dataset) throw new TRPCError({ code: "NOT_FOUND", message: "Voice dataset not found" });
      if (dataset.status !== "frozen" || dataset.currentRevision !== run.dataset.revision) throw new TRPCError({ code: "CONFLICT", message: "TRAINING_DATASET_INVALID: dataset revision must be frozen and current" });
      const [datasetRevision] = await getDb().select().from(audioVoiceDatasetRevisions).where(and(eq(audioVoiceDatasetRevisions.datasetId, dataset.id), eq(audioVoiceDatasetRevisions.revision, run.dataset.revision), eq(audioVoiceDatasetRevisions.tenantId, actor.tenantId))).limit(1);
      if (!datasetRevision || datasetRevision.manifestHash !== hashUnifiedAudioInput(run.dataset)) throw new TRPCError({ code: "CONFLICT", message: "TRAINING_DATASET_INVALID: dataset manifest hash mismatch" });
      await assertTrainingConsent(actor, run.dataset, run.recipe.providerId);
      assertScopeOwner(run.scope, actor, { ownerScopeType: dataset.ownerScopeType as "project" | "series", workspaceId: dataset.workspaceId, ...(dataset.ownerScopeType === "project" ? { projectId: dataset.ownerScopeId } : { seriesId: dataset.ownerScopeId }) });
      const database = getDb();
      const [existing] = await database.select({ id: audioVoiceTrainingRuns.id, jobId: audioVoiceTrainingRuns.jobId }).from(audioVoiceTrainingRuns).where(and(eq(audioVoiceTrainingRuns.tenantId, actor.tenantId), eq(audioVoiceTrainingRuns.idempotencyKey, run.idempotencyKey))).limit(1);
      if (existing) {
        const [existingJob] = await database.select({ inputJson: workerJobs.inputJson }).from(workerJobs).where(and(eq(workerJobs.id, existing.jobId), eq(workerJobs.tenantId, actor.tenantId))).limit(1);
        const persistedInput = existingJob?.inputJson && typeof existingJob.inputJson === "object" && !Array.isArray(existingJob.inputJson)
          ? { ...(existingJob.inputJson as Record<string, unknown>) }
          : null;
        // The shared scheduler adds display-only title/description fields to
        // inputJson; exclude those fields from the logical request hash.
        if (persistedInput) {
          delete persistedInput.title;
          delete persistedInput.description;
        }
        if (!persistedInput || hashUnifiedAudioInput(persistedInput) !== hashUnifiedAudioInput(run)) {
          throw new TRPCError({ code: "CONFLICT", message: "Idempotency key is already bound to a different training request" });
        }
        return { created: false, jobId: existing.jobId, run: { ...run, jobId: existing.jobId } };
      }
      const queued = await queueUnifiedAudioWorkerJob({ tenantId: actor.tenantId, requestedByUserId: actor.userId, jobType: "voice_training_run", inputJson: run, idempotencyKey: run.idempotencyKey, priority: 10, timeoutSeconds: Math.ceil(run.recipe.maxWalltimeMs / 1000), resourceProfile: "gpu_required", capabilityFamilies: [`tts-training-provider:${run.recipe.providerId}`, `tts-model:${run.recipe.modelId}`], reservedCredits: run.approvedBudgetCredits });
      try {
        await database.insert(audioVoiceTrainingRuns).values({ jobId: queued.job.id, tenantId: actor.tenantId, datasetId: run.dataset.datasetId, datasetRevision: run.dataset.revision, idempotencyKey: run.idempotencyKey, recipeJson: run.recipe, status: "queued", createdByUserId: actor.userId });
      } catch (error) {
        if (queued.created) {
          await database.update(workerJobs).set({ status: "failed", failureReason: "TRAINING_RUN_PERSIST_FAILED", finishedAt: new Date() }).where(and(eq(workerJobs.id, queued.job.id), eq(workerJobs.tenantId, actor.tenantId))).catch(() => {});
          const [job] = await database.select({ instructionsJson: workerJobs.instructionsJson }).from(workerJobs).where(and(eq(workerJobs.id, queued.job.id), eq(workerJobs.tenantId, actor.tenantId))).limit(1);
          await reconcileWorkerJobCredits({ userId: actor.userId, tenantId: actor.tenantId, jobId: queued.job.id, billing: billingEnvelopeFromMetadata(job?.instructionsJson && (job.instructionsJson as Record<string, unknown>).workerBilling), finalStatus: "failed", actualCreditsUsed: 0 }).catch(() => {});
        }
        throw error;
      }
      return { created: queued.created, jobId: queued.job.id, run: { ...run, jobId: queued.job.id } };
    } catch (error) {
      return cleanError(error);
    }
  }

  async createVoiceDataset(actor: Actor, input: unknown): Promise<VoiceDataset> {
    try {
      const dataset = voiceDatasetSchema.parse(input);
      const database = getDb();
      await database.transaction(async (tx) => {
        const [row] = await tx.insert(audioVoiceDatasets).values({ datasetId: dataset.datasetId, tenantId: actor.tenantId, createdByUserId: actor.userId, ownerScopeType: dataset.ownerScope.ownerScopeType, ownerScopeId: ownerScopeId(dataset.ownerScope), workspaceId: dataset.ownerScope.workspaceId, currentRevision: dataset.revision, status: dataset.status }).returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Voice dataset insert returned no row" });
        await tx.insert(audioVoiceDatasetRevisions).values({ datasetId: row.id, tenantId: actor.tenantId, revision: dataset.revision, manifestJson: dataset, manifestHash: hashUnifiedAudioInput(dataset), status: dataset.status, createdByUserId: actor.userId });
      });
      return dataset;
    } catch (error) {
      return cleanError(error);
    }
  }

  async recordTrainingEvaluation(actor: Actor, input: { modelId: string; passed: boolean; metrics: Record<string, number>; evaluationArtifactId: string }): Promise<{ modelId: string; status: "candidate" | "approved" | "rejected"; metrics: Record<string, number> }> {
    const database = getDb();
    const [row] = await database.select().from(audioTrainedVoiceModels).where(and(eq(audioTrainedVoiceModels.tenantId, actor.tenantId), eq(audioTrainedVoiceModels.modelId, input.modelId))).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Trained voice model not found" });
    if (row.status === "revoked" || row.status === "archived") throw new TRPCError({ code: "FORBIDDEN", message: "TRAINING_MODEL_INVALID: revoked or archived candidates cannot be evaluated" });
    const [evaluationArtifact] = await database.select({ metadataJson: workerArtifacts.metadataJson }).from(workerArtifacts).innerJoin(workerJobs, eq(workerJobs.id, workerArtifacts.workerJobId)).where(and(eq(workerArtifacts.id, input.evaluationArtifactId), eq(workerJobs.tenantId, actor.tenantId), eq(workerJobs.status, "completed"))).limit(1);
    if (!evaluationArtifact) throw new TRPCError({ code: "NOT_FOUND", message: "TRAINING_EVALUATION_INVALID: evaluation artifact is not published for this tenant" });
    const modelJson = row.modelJson as Record<string, unknown>;
    const modelChecksum = typeof modelJson.checksumSha256 === "string" ? modelJson.checksumSha256 : "";
    const evaluationMetadata = (evaluationArtifact.metadataJson ?? {}) as Record<string, unknown>;
    const evaluatedChecksum = typeof evaluationMetadata.candidateChecksumSha256 === "string"
      ? evaluationMetadata.candidateChecksumSha256
      : typeof evaluationMetadata.modelChecksumSha256 === "string" ? evaluationMetadata.modelChecksumSha256 : "";
    if (!modelChecksum || evaluatedChecksum !== modelChecksum) {
      throw new TRPCError({ code: "CONFLICT", message: "TRAINING_EVALUATION_INVALID: evaluation artifact does not match the candidate checksum" });
    }
    const status = input.passed ? "approved" : "rejected";
    await database.update(audioTrainedVoiceModels).set({ status, modelJson: { ...modelJson, evaluationArtifactId: input.evaluationArtifactId, evaluation: { passed: input.passed, metrics: input.metrics, candidateChecksumSha256: modelChecksum, evaluatedByUserId: actor.userId, evaluatedAt: new Date().toISOString() } }, updatedAt: new Date() }).where(eq(audioTrainedVoiceModels.id, row.id));
    return { modelId: input.modelId, status, metrics: input.metrics };
  }

  async promoteTrainedVoiceModel(actor: Actor, modelId: string): Promise<{ modelId: string; status: "promoted" }> {
    const database = getDb();
    const [row] = await database.select().from(audioTrainedVoiceModels).where(and(eq(audioTrainedVoiceModels.tenantId, actor.tenantId), eq(audioTrainedVoiceModels.modelId, modelId))).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Trained voice model not found" });
    if (row.status !== "approved") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TRAINING_EVALUATION_REQUIRED: model must pass evaluation before promotion" });
    const modelJson = row.modelJson as Record<string, unknown>;
    const evaluation = modelJson.evaluation;
    if (!modelJson.evaluationArtifactId || !evaluation || typeof evaluation !== "object" || (evaluation as Record<string, unknown>).candidateChecksumSha256 !== modelJson.checksumSha256) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TRAINING_EVALUATION_REQUIRED: candidate checksum evidence is incomplete" });
    }
    const [evaluationArtifact] = await database.select({ metadataJson: workerArtifacts.metadataJson }).from(workerArtifacts).innerJoin(workerJobs, eq(workerJobs.id, workerArtifacts.workerJobId)).where(and(eq(workerArtifacts.id, String(modelJson.evaluationArtifactId)), eq(workerJobs.tenantId, actor.tenantId), eq(workerJobs.status, "completed"))).limit(1);
    const evaluationChecksum = String((evaluationArtifact?.metadataJson as Record<string, unknown> | null)?.candidateChecksumSha256 ?? (evaluationArtifact?.metadataJson as Record<string, unknown> | null)?.modelChecksumSha256 ?? "");
    if (!evaluationArtifact || evaluationChecksum !== String(modelJson.checksumSha256)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TRAINING_EVALUATION_INVALID: evaluation evidence is no longer published or no longer matches the candidate" });
    }
    await database.update(audioTrainedVoiceModels).set({ status: "promoted", updatedAt: new Date() }).where(eq(audioTrainedVoiceModels.id, row.id));
    return { modelId, status: "promoted" };
  }
}

export const unifiedAudioVoiceService = new UnifiedAudioVoiceService();

export function parseExecutionPolicy(input: unknown): ExecutionPolicy {
  return executionPolicySchema.parse(input);
}

export function parseAudioScope(input: unknown): AudioScope {
  return audioScopeSchema.parse(input);
}
