import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "../db";
import {
  verticalDramaEmotionPlans,
  verticalDramaEpisodes,
  workerArtifacts,
  workerJobs,
  workerSeriesBindings,
} from "../../drizzle/schema";
import {
  episodeAudioAnalyzeJobPayloadSchema,
  minimaxMusic3GenerateJobPayloadSchema,
  type EpisodeAudioAnalyzeJobPayload,
} from "../../shared/verticalDramaMedia/audioScoringContracts";
import { validateApprovedMusicScorePlan } from "../../shared/verticalDramaSeries/musicScoringContracts";
import { queueVerticalDramaAudioWorkerJob } from "./workerSchedulerService";

const ACTIVE_AUDIO_JOB_STATUSES = ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing"] as const;
const TERMINAL_AUDIO_JOB_STATUSES = ["completed", "failed", "canceled", "expired"] as const;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
  });
}

function compiledVideoState(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const compiled = (value as Record<string, unknown>).compiledVideo;
  if (!compiled || typeof compiled !== "object" || Array.isArray(compiled)) return null;
  return compiled as Record<string, unknown>;
}

async function loadPlan(planId: string, tenantId: string, userId: number) {
  const [row] = await db.select().from(verticalDramaEmotionPlans).where(and(
    eq(verticalDramaEmotionPlans.id, planId),
    eq(verticalDramaEmotionPlans.tenantId, tenantId),
    eq(verticalDramaEmotionPlans.userId, userId),
  )).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Emotion plan not found" });
  const parsed = validateApprovedMusicScorePlan(row.planJson);
  if (!parsed.success || row.status !== "approved") {
    return { row, plan: parsed.success ? parsed.data : null, blockedReason: "plan_or_rights_not_approved" as const };
  }
  if (parsed.data.planHash !== row.planHash) {
    return { row, plan: null, blockedReason: "plan_hash_mismatch" as const };
  }
  return { row, plan: parsed.data, blockedReason: null };
}

async function findAudioJobs(input: { tenantId: string; userId: number; seriesId: number; episodeId: number; planId?: string }) {
  const rows = await db.select().from(workerJobs).where(and(
    eq(workerJobs.tenantId, input.tenantId),
    eq(workerJobs.requestedByUserId, input.userId),
    inArray(workerJobs.jobType, ["episode_audio_analyze", "minimax_music3_generate", "episode_score_mix"]),
    sql`${workerJobs.inputJson}->>'seriesId' = ${String(input.seriesId)}`,
    sql`${workerJobs.inputJson}->>'episodeId' = ${String(input.episodeId)}`,
    input.planId
      ? sql`(${workerJobs.jobType} = 'episode_audio_analyze' OR ${workerJobs.inputJson}->>'planId' = ${input.planId})`
      : sql`true`,
  )).orderBy(desc(workerJobs.createdAt));
  return rows;
}

function currentJob(jobs: Array<{ jobType: string; status: string }>, jobType: string) {
  return jobs.find(job => job.jobType === jobType && (ACTIVE_AUDIO_JOB_STATUSES as readonly string[]).includes(job.status)) ?? null;
}

async function activeBinding(tenantId: string, seriesId: number) {
  const [binding] = await db.select({ id: workerSeriesBindings.id, bindingRevision: workerSeriesBindings.bindingRevision })
    .from(workerSeriesBindings)
    .where(and(
      eq(workerSeriesBindings.tenantId, tenantId),
      eq(workerSeriesBindings.seriesId, seriesId),
      eq(workerSeriesBindings.status, "active"),
      sql`${workerSeriesBindings.revokedAt} IS NULL`,
    )).orderBy(desc(workerSeriesBindings.updatedAt)).limit(1);
  return binding ?? null;
}

function buildIdentityEditMap(checksum: string, durationSeconds: number, artifactRevision: string) {
  const body = {
    schemaVersion: "vd-edit-map-v1",
    coordinateSpace: "cut",
    sourceChecksum: checksum,
    durationMs: Math.max(0, Math.round(durationSeconds * 1000)),
    segments: [{ segmentId: "cut-identity", sourceStartMs: 0, sourceEndMs: Math.max(0, Math.round(durationSeconds * 1000)), cutStartMs: 0 }],
  };
  return { revision: artifactRevision, hash: sha256(stableJson(body)), occurrenceCount: 1 };
}

/**
 * Reconciles the approved semantic plan into the durable audio worker lane.
 * It intentionally returns a blocked state when the final cut has not been
 * published with a checksum/storage key; a URL alone is never enough to send
 * media to a Worker.
 */
export async function reconcileApprovedVerticalDramaAudioPipeline(input: {
  tenantId: string;
  userId: number;
  planId: string;
  requestedStage?: "analysis" | "generation";
}) {
  const loaded = await loadPlan(input.planId, input.tenantId, input.userId);
  const plan = loaded.plan;
  if (!plan) return { queued: false, blockedReason: loaded.blockedReason };

  const [episode] = await db.select({ id: verticalDramaEpisodes.id, seriesId: verticalDramaEpisodes.seriesId, targetDurationSeconds: verticalDramaEpisodes.targetDurationSeconds, assemblyManifest: verticalDramaEpisodes.assemblyManifest })
    .from(verticalDramaEpisodes)
    .where(and(
      eq(verticalDramaEpisodes.id, loaded.row.episodeId),
      eq(verticalDramaEpisodes.tenantId, input.tenantId),
      eq(verticalDramaEpisodes.userId, input.userId),
    )).limit(1);
  const compiled = compiledVideoState(episode?.assemblyManifest);
  const checksum = typeof compiled?.checksumSha256 === "string" && /^[a-f0-9]{64}$/i.test(compiled.checksumSha256) ? compiled.checksumSha256 : null;
  const storageRef = typeof compiled?.storageKey === "string" && compiled.storageKey.trim() ? compiled.storageKey : null;
  const artifactRevision = typeof compiled?.artifactRevision === "string" && compiled.artifactRevision.trim() ? compiled.artifactRevision : null;
  const durationSeconds = typeof compiled?.durationSeconds === "number" ? compiled.durationSeconds : episode?.targetDurationSeconds ?? 0;
  if (!episode || compiled?.status !== "completed" || !checksum || !storageRef || !artifactRevision || durationSeconds <= 0) {
    return { queued: false, blockedReason: "final_cut_artifact_required" as const };
  }

  const binding = await activeBinding(input.tenantId, Number(episode.seriesId));
  if (!binding) return { queued: false, blockedReason: "active_worker_binding_required" as const };
  const editMap = buildIdentityEditMap(checksum, durationSeconds, artifactRevision);
  const timelineHash = sha256(stableJson({ checksum, editMap }));
  // Analysis is intentionally plan-independent: its contract is bound to the
  // compiled-cut checksum and source snapshot, while generation/mix are bound
  // to the approved plan hash. Filtering every job by planId would hide the
  // ASR job because the analysis payload does not contain a planId.
  const jobs = await findAudioJobs({ tenantId: input.tenantId, userId: input.userId, seriesId: Number(episode.seriesId), episodeId: Number(episode.id) });

  const analysisJob = jobs.find(job => job.jobType === "episode_audio_analyze"
    && job.inputJson?.sourceSnapshotHash === loaded.row.sourceHash
    && job.inputJson?.cutMedia?.checksum === checksum);
  let createdJob = null;
  if (!analysisJob && !currentJob(jobs, "episode_audio_analyze")) {
    const payload: EpisodeAudioAnalyzeJobPayload = episodeAudioAnalyzeJobPayloadSchema.parse({
      contractVersion: "vd-music-scoring-v1",
      featureContractVersion: "176.177.v1",
      kind: "episode_audio_analyze",
      seriesId: String(episode.seriesId),
      episodeId: String(episode.id),
      tenantScope: input.tenantId,
      bindingRevision: binding.bindingRevision,
      idempotencyKey: `vd-audio:analyze:${episode.id}:${checksum}:${loaded.row.sourceHash}`,
      draftOnly: true,
      sourceSnapshotHash: loaded.row.sourceHash,
      timelineHash,
      cutMedia: { artifactId: `compiled-video:${episode.id}`, checksum, kind: "media", storageRef },
      editMap,
      requestedLanguage: "th",
      analysisPolicy: "audio_only",
    });
    createdJob = await queueVerticalDramaAudioWorkerJob({ tenantId: input.tenantId, requestedByUserId: input.userId, workerSeriesBindingId: binding.id, payload });
  }

  const analysisArtifacts = analysisJob?.status === "completed"
    ? await db.select({ artifactType: workerArtifacts.artifactType, id: workerArtifacts.id, storageRef: workerArtifacts.storageRef, metadataJson: workerArtifacts.metadataJson })
      .from(workerArtifacts)
      .where(and(
        eq(workerArtifacts.workerJobId, analysisJob.id),
        inArray(workerArtifacts.artifactType, ["transcript", "edit_map"]),
      ))
    : [];
  const analysisArtifactRefs = (() => {
    const byType = new Map(analysisArtifacts.map(artifact => [artifact.artifactType, artifact]));
    const transcript = byType.get("transcript");
    const editMapArtifact = byType.get("edit_map");
    const transcriptChecksum = transcript?.metadataJson?.checksumSha256;
    const editMapChecksum = editMapArtifact?.metadataJson?.checksumSha256;
    if (!transcript || !editMapArtifact || typeof transcriptChecksum !== "string" || typeof editMapChecksum !== "string") return null;
    if (!/^[a-f0-9]{64}$/i.test(transcriptChecksum) || !/^[a-f0-9]{64}$/i.test(editMapChecksum)) return null;
    return {
      transcript: { artifactId: transcript.id, checksum: transcriptChecksum, kind: "transcript" as const, storageRef: transcript.storageRef },
      editMap: { artifactId: editMapArtifact.id, checksum: editMapChecksum, kind: "edit_map" as const, storageRef: editMapArtifact.storageRef },
    };
  })();
  const completedAnalysis = Boolean(analysisArtifactRefs);
  const generationJob = jobs.find(job => job.jobType === "minimax_music3_generate" && job.inputJson?.planHash === loaded.row.planHash);
  const shouldGenerate = (input.requestedStage === "generation" || loaded.row.rightsStatus === "approved_for_project") && completedAnalysis;
  if (!generationJob && !currentJob(jobs, "minimax_music3_generate") && shouldGenerate) {
    const selectedCues = plan.cues.slice(0, 6);
    const captionText = stableJson(selectedCues.map(cue => ({ cueId: cue.cueId, caption: cue.displayCaption, instruction: cue.modelInstruction })));
    const payload = minimaxMusic3GenerateJobPayloadSchema.parse({
      contractVersion: "vd-music-scoring-v1",
      featureContractVersion: "176.177.v1",
      kind: "minimax_music3_generate",
      seriesId: String(episode.seriesId),
      episodeId: String(episode.id),
      tenantScope: input.tenantId,
      bindingRevision: binding.bindingRevision,
      idempotencyKey: `vd-audio:music:${input.planId}:${loaded.row.planHash}`,
      draftOnly: false,
      planId: input.planId,
      planRevision: loaded.row.revision,
      planHash: loaded.row.planHash,
      timelineHash,
      selectedCueIds: selectedCues.map(cue => cue.cueId),
      approvedPlan: plan,
      selectedCues,
      analysisArtifacts: analysisArtifactRefs ?? undefined,
      captionHash: plan.captionHash ?? sha256(captionText),
      semanticExecutions: plan.semanticExecutions.map(execution => execution.executionId),
      captionExecutionRef: plan.captionExecutionRef ?? plan.skill.executionId,
      runtime: { modelName: "MiniMaxAI/MiniMax-Music3", modelRevision: "server-selected-at-worker-claim", capability: "genuine_minimax_music3", runtimeContractVersion: "vd-music-scoring-v1" },
      authorization: { authorizationRef: `vd-audio:${input.planId}`, budgetReservationRef: "none", rightsPolicyHash: loaded.row.rightsPolicyHash, rightsStatus: "approved_for_project", bindingRevision: binding.bindingRevision },
    });
    createdJob = await queueVerticalDramaAudioWorkerJob({ tenantId: input.tenantId, requestedByUserId: input.userId, workerSeriesBindingId: binding.id, payload });
  }
  return { queued: Boolean(createdJob), blockedReason: shouldGenerate && !completedAnalysis ? "awaiting_asr_edit_map" : null, analysisJobId: createdJob?.job?.jobType === "episode_audio_analyze" ? createdJob.job.id : analysisJob?.id ?? null, generationJobId: createdJob?.job?.jobType === "minimax_music3_generate" ? createdJob.job.id : generationJob?.id ?? null };
}

export async function getVerticalDramaAudioPipelineStatus(input: { tenantId: string; userId: number; seriesId: number; episodeId: number; planId?: string }) {
  const jobs = await findAudioJobs(input);
  const jobIds = jobs.map(job => job.id);
  const artifacts = jobIds.length ? await db.select({ id: workerArtifacts.id, workerJobId: workerArtifacts.workerJobId, artifactType: workerArtifacts.artifactType, storageRef: workerArtifacts.storageRef, metadataJson: workerArtifacts.metadataJson, createdAt: workerArtifacts.createdAt }).from(workerArtifacts).where(inArray(workerArtifacts.workerJobId, jobIds)) : [];
  return {
    contractVersion: "176.177.v1",
    jobs: jobs.map(job => ({ id: job.id, jobType: job.jobType, status: job.status, statusReason: job.statusReason, failureReason: job.failureReason, output: job.outputJson, createdAt: job.createdAt, finishedAt: job.finishedAt })),
    artifacts: artifacts.map(artifact => ({ id: artifact.id, workerJobId: artifact.workerJobId, artifactType: artifact.artifactType, storageRef: artifact.storageRef, metadata: artifact.metadataJson, createdAt: artifact.createdAt })),
    stages: ["approved_plan", "episode_audio_analyze", "minimax_music3_generate", "episode_score_mix"].map(stage => ({ stage, job: jobs.find(job => job.jobType === stage || (stage === "approved_plan" && job.jobType === "episode_audio_analyze")) ?? null })),
    terminalFailures: jobs.filter(job => (TERMINAL_AUDIO_JOB_STATUSES as readonly string[]).includes(job.status) && job.status !== "completed").map(job => ({ jobId: job.id, jobType: job.jobType, failureReason: job.failureReason })),
  };
}

export async function queueVerticalDramaScoreMix(input: {
  tenantId: string;
  userId: number;
  planId: string;
  selectedTakeIds: string[];
}) {
  const loaded = await loadPlan(input.planId, input.tenantId, input.userId);
  if (!loaded.plan) return { queued: false, blockedReason: loaded.blockedReason };
  if (loaded.row.rightsStatus !== "approved_for_project") {
    return { queued: false, blockedReason: "plan_or_rights_not_approved" as const };
  }
  const [episode] = await db.select({ id: verticalDramaEpisodes.id, seriesId: verticalDramaEpisodes.seriesId, targetDurationSeconds: verticalDramaEpisodes.targetDurationSeconds, assemblyManifest: verticalDramaEpisodes.assemblyManifest })
    .from(verticalDramaEpisodes)
    .where(and(eq(verticalDramaEpisodes.id, loaded.row.episodeId), eq(verticalDramaEpisodes.tenantId, input.tenantId), eq(verticalDramaEpisodes.userId, input.userId))).limit(1);
  const compiled = compiledVideoState(episode?.assemblyManifest);
  const checksum = typeof compiled?.checksumSha256 === "string" && /^[a-f0-9]{64}$/i.test(compiled.checksumSha256) ? compiled.checksumSha256 : null;
  const storageRef = typeof compiled?.storageKey === "string" ? compiled.storageKey : null;
  const artifactRevision = typeof compiled?.artifactRevision === "string" ? compiled.artifactRevision : null;
  const durationSeconds = typeof compiled?.durationSeconds === "number" ? compiled.durationSeconds : episode?.targetDurationSeconds ?? 0;
  if (!episode || compiled?.status !== "completed" || !checksum || !storageRef || !artifactRevision || durationSeconds <= 0) return { queued: false, blockedReason: "final_cut_artifact_required" as const };
  const binding = await activeBinding(input.tenantId, Number(episode.seriesId));
  if (!binding) return { queued: false, blockedReason: "active_worker_binding_required" as const };
  const uniqueTakeIds = [...new Set(input.selectedTakeIds)].slice(0, 6);
  if (!uniqueTakeIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Select at least one published Music 3 take" });
  const takeRows = await db.select({ id: workerArtifacts.id, storageRef: workerArtifacts.storageRef, metadataJson: workerArtifacts.metadataJson })
    .from(workerArtifacts).innerJoin(workerJobs, eq(workerJobs.id, workerArtifacts.workerJobId)).where(and(
      eq(workerArtifacts.artifactType, "music_take"),
      inArray(workerArtifacts.id, uniqueTakeIds),
      eq(workerJobs.tenantId, input.tenantId),
      eq(workerJobs.requestedByUserId, input.userId),
      inArray(workerJobs.status, ["completed", "published"]),
    ));
  if (
    takeRows.length !== uniqueTakeIds.length
    || takeRows.some(row =>
      row.metadataJson?.planId !== input.planId
      || row.metadataJson?.planHash !== loaded.row.planHash
      || row.metadataJson?.rightsStatus !== "approved_for_project"
      || typeof row.metadataJson?.checksumSha256 !== "string"
      || !/^[a-f0-9]{64}$/i.test(row.metadataJson.checksumSha256)
      || typeof row.storageRef !== "string"
      || row.storageRef.trim().length === 0
    )
  ) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Selected Music 3 takes are stale, unpublished, or belong to another plan" });
  }
  const editMap = buildIdentityEditMap(checksum, durationSeconds, artifactRevision);
  const timelineHash = sha256(stableJson({ checksum, editMap }));
  const payload = {
    contractVersion: "vd-music-scoring-v1" as const,
    featureContractVersion: "176.177.v1" as const,
    kind: "episode_score_mix" as const,
    seriesId: String(episode.seriesId),
    episodeId: String(episode.id),
    tenantScope: input.tenantId,
    bindingRevision: binding.bindingRevision,
    idempotencyKey: `vd-audio:mix:${input.planId}:${loaded.row.planHash}:${uniqueTakeIds.join(",")}`,
    draftOnly: false,
    planId: input.planId,
    planRevision: loaded.row.revision,
    planHash: loaded.row.planHash,
    timelineHash,
    selectedTakeIds: uniqueTakeIds,
    sourceRefs: [
      { artifactId: `compiled-video:${episode.id}`, checksum, kind: "media" as const, storageRef },
      ...takeRows.map(row => ({ artifactId: row.id, checksum: String(row.metadataJson?.checksumSha256), kind: "music_take" as const, storageRef: row.storageRef })),
    ],
    mixEnvelope: { attackMs: 80, releaseMs: 300, holdMs: 120, attenuationDb: -12 },
    deliveryProfile: "web_drama_v1" as const,
    authorization: { authorizationRef: `vd-audio:${input.planId}`, budgetReservationRef: "none", rightsPolicyHash: loaded.row.rightsPolicyHash, rightsStatus: "approved_for_project" as const, bindingRevision: binding.bindingRevision },
    approvedPlan: loaded.plan,
  };
  const queued = await queueVerticalDramaAudioWorkerJob({ tenantId: input.tenantId, requestedByUserId: input.userId, workerSeriesBindingId: binding.id, payload });
  return { queued: true, jobId: queued.job.id, created: queued.created };
}
