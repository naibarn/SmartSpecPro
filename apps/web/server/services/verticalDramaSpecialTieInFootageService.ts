import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "../db";
import {
  mediaAssets,
  workerArtifacts,
  verticalDramaSeries,
  workerJobs,
  workerSeriesBindings,
} from "../../drizzle/schema";
import { storagePresignGet, storageResolveUrl } from "../storage";
import {
  remotionRenderVideoWorkerInputSchema,
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
} from "../../shared/workerRuntime";
import {
  footageBrollRenderJobPayloadSchema,
  footageBrollPlacementSchema,
  footagePrepareJobPayloadSchema,
  footageProbeAnalyzeJobPayloadSchema,
  footageGuideSchema,
  mediaSourceManifestSchema,
  type FootageGuide,
} from "../../shared/verticalDramaMedia/contracts";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import {
  reserveWorkerJobCredits,
  type WorkerJobBillingEnvelope,
} from "./workerBillingService";
import { refundReservation } from "./creditService";

export type SpecialTieInFootageActor = { tenantId: string; userId: number };

const FOOTAGE_FEATURE_FLAG = "verticalDramaSpecialEpisodes";
const DESKTOP_RUNTIME = "desktop_zeroclaw_managed" as const;
const MAX_JOB_TIMEOUT_SECONDS = 2 * 60 * 60;

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function billingMetadata(billing: WorkerJobBillingEnvelope | null): Record<string, unknown> | null {
  return billing
    ? { reservationId: billing.reservationId, reservedCredits: billing.reservedCredits, sourceType: billing.sourceType }
    : null;
}

function sourceFileName(storageKey: string): string {
  const candidate = storageKey.split("/").pop()?.trim() || "footage.mp4";
  return candidate.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 240) || "footage.mp4";
}

function browserStorageUrl(storageKey: string): string {
  return `/api/storage/files/${encodeURI(storageKey.replace(/^\/+/, ""))}`;
}

async function assertSeries(actor: SpecialTieInFootageActor, seriesId: number) {
  const [series] = await db
    .select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, actor.tenantId), eq(verticalDramaSeries.userId, actor.userId)))
    .limit(1);
  if (!series) throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
}

async function resolveSource(actor: SpecialTieInFootageActor, seriesId: number, mediaAssetId: number) {
  const [asset] = await db
    .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey, mimeType: mediaAssets.mimeType, status: mediaAssets.status, fileSize: mediaAssets.fileSize, checksumSha256: mediaAssets.checksumSha256, createdAt: mediaAssets.createdAt, updatedAt: mediaAssets.updatedAt })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, mediaAssetId), eq(mediaAssets.tenantId, actor.tenantId), eq(mediaAssets.userId, actor.userId)))
    .limit(1);
  if (!asset || asset.status !== "ready" || !asset.mimeType.startsWith("video/") || !asset.checksumSha256) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Footage is not a ready video with a checksum" });
  }
  const source = mediaSourceManifestSchema.parse({
    assetId: `media-${asset.id}`,
    kind: "video",
    sourceRevision: String(asset.updatedAt?.getTime() ?? asset.createdAt?.getTime() ?? 1),
    sourceFingerprint: asset.checksumSha256,
    fileName: sourceFileName(asset.storageKey),
    sizeBytes: Math.max(0, Number(asset.fileSize ?? 0)),
    durationMs: null,
    captureAt: null,
  });
  return { asset, source, seriesId };
}

async function resolveBinding(actor: SpecialTieInFootageActor, seriesId: number) {
  const [binding] = await db
    .select({ id: workerSeriesBindings.id, workerId: workerSeriesBindings.workerId, rootId: workerSeriesBindings.rootId, rootFingerprint: workerSeriesBindings.rootFingerprint, bindingRevision: workerSeriesBindings.bindingRevision, workspaceMode: workerSeriesBindings.workspaceMode, status: workerSeriesBindings.status })
    .from(workerSeriesBindings)
    .where(and(eq(workerSeriesBindings.tenantId, actor.tenantId), eq(workerSeriesBindings.seriesId, seriesId), eq(workerSeriesBindings.status, "active")))
    .limit(1);
  if (!binding) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Worker binding is available for this Series" });
  return {
    row: binding,
    contract: {
      seriesId: String(seriesId),
      rootId: binding.rootId,
      rootFingerprint: binding.rootFingerprint,
      bindingRevision: binding.bindingRevision,
      workspaceMode: binding.workspaceMode === "managed_local" ? "managed_local" as const : "local_only" as const,
      status: "active" as const,
    },
  };
}

async function resolveWorkerRenderUrl(actor: SpecialTieInFootageActor, source: ReturnType<typeof mediaSourceManifestSchema.parse>, seriesBindingId: string, expectedPreparedRevision?: string): Promise<string> {
  let storageRef: string | null = null;
  const mediaId = /^media-(\d+)$/.exec(source.assetId)?.[1];
  if (mediaId) {
    const [asset] = await db.select({ storageKey: mediaAssets.storageKey, status: mediaAssets.status, userId: mediaAssets.userId, mimeType: mediaAssets.mimeType, checksumSha256: mediaAssets.checksumSha256 }).from(mediaAssets).where(and(eq(mediaAssets.id, Number(mediaId)), eq(mediaAssets.tenantId, actor.tenantId), eq(mediaAssets.userId, actor.userId))).limit(1);
    if (!asset || asset.status !== "ready" || asset.userId !== actor.userId || !asset.mimeType.startsWith("video/") || asset.checksumSha256 !== source.sourceFingerprint) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "B-roll source is stale or is not an accessible ready video asset" });
    storageRef = asset.storageKey;
  } else {
    const artifactId = /^artifact-(.+)$/.exec(source.assetId)?.[1];
    if (artifactId) {
      const [artifact] = await db.select({ storageRef: workerArtifacts.storageRef, artifactType: workerArtifacts.artifactType, metadataJson: workerArtifacts.metadataJson, jobStatus: workerJobs.status }).from(workerArtifacts).innerJoin(workerJobs, eq(workerJobs.id, workerArtifacts.workerJobId)).where(and(eq(workerArtifacts.id, artifactId), eq(workerJobs.tenantId, actor.tenantId), eq(workerJobs.requestedByUserId, actor.userId), eq(workerJobs.workerSeriesBindingId, seriesBindingId), eq(workerJobs.jobType, "footage_prepare"))).limit(1);
      const metadata = artifact?.metadataJson && typeof artifact.metadataJson === "object" ? artifact.metadataJson as Record<string, unknown> : {};
      const qc = metadata.qc && typeof metadata.qc === "object" ? metadata.qc as Record<string, unknown> : {};
      const artifactChecksum = typeof metadata.checksumSha256 === "string" ? metadata.checksumSha256 : typeof qc.checksum === "string" ? qc.checksum : null;
      const preparedRevision = typeof metadata.preparedRevision === "string" ? metadata.preparedRevision : null;
      if (!artifact || artifact.artifactType !== "normalized_video" || !["completed", "publishing", "published"].includes(artifact.jobStatus) || artifactChecksum !== source.sourceFingerprint || (expectedPreparedRevision && preparedRevision !== expectedPreparedRevision)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Prepared B-roll source is stale or not published" });
      storageRef = artifact.storageRef;
    }
  }
  if (!storageRef) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "B-roll source storage reference is missing" });
  const presigned = await storagePresignGet(storageRef, 3600);
  if (presigned?.url) return presigned.url;
  const resolved = await storageResolveUrl(storageRef);
  const baseUrl = process.env.INTERNAL_WEB_BASE_URL || process.env.PUBLIC_URL || process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  if (!resolved) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "B-roll source URL could not be resolved" });
  return new URL(resolved, baseUrl).toString();
}

function buildFootageRemotionInput(input: {
  preparedSource: ReturnType<typeof mediaSourceManifestSchema.parse>;
  preparedUrl: string;
  assetSources: Array<ReturnType<typeof mediaSourceManifestSchema.parse> & { url: string }>;
  placements: Array<{
    storyBeatId: string;
    startMs: number;
    endMs: number;
    sourceMediaAssetId: string;
    sourceInMs: number;
    sourceOutMs: number | null;
    placementMode: "overlay" | "cutaway" | "replace";
    fitMode: "cover" | "contain" | "crop";
    baseAudioPolicy: "preserve" | "mute" | "selected_ranges";
    brollAudioPolicy: "mute" | "mix" | "replace";
  }>;
  baseDurationMs: number;
  seriesId: number;
  storyRevisionId: string;
  shotPlanRevisionId: string;
}) {
  const fps = 30;
  const frames = (ms: number) => Math.max(1, Math.round((ms / 1000) * fps));
  const byId = new Map(input.assetSources.map(source => [source.assetId, source]));
  const muteRanges = input.placements.filter(placement => placement.baseAudioPolicy === "mute" || placement.brollAudioPolicy === "replace").map(placement => [placement.startMs, placement.endMs] as const);
  const layers: any[] = [];
  const boundaries = Array.from(new Set([0, input.baseDurationMs, ...muteRanges.flatMap(range => range)])).sort((a, b) => a - b);
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startMs = boundaries[index];
    const endMs = boundaries[index + 1];
    if (endMs <= startMs) continue;
    const muted = muteRanges.some(([start, end]) => start < endMs && end > startMs);
    layers.push({ id: `footage-base-${index}`, type: "video", startFrame: frames(startMs), durationFrames: frames(endMs - startMs), x: 0, y: 0, width: 100, height: 100, rotationDeg: 0, opacity: 1, zIndex: 0, src: input.preparedUrl, trimStartSec: startMs / 1000, volume: muted ? 0 : 1, muted });
  }
  for (const [index, placement] of input.placements.entries()) {
    const source = byId.get(placement.sourceMediaAssetId);
    if (!source) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `B-roll source ${placement.sourceMediaAssetId} is not in the approved asset manifest` });
    layers.push({ id: `footage-broll-${index}-${placement.storyBeatId}`, type: "video", startFrame: frames(placement.startMs), durationFrames: frames(placement.endMs - placement.startMs), x: 0, y: 0, width: 100, height: 100, rotationDeg: 0, opacity: 1, zIndex: placement.placementMode === "overlay" ? 10 : 20, src: source.url, trimStartSec: placement.sourceInMs / 1000, volume: placement.brollAudioPolicy === "mute" ? 0 : 1, muted: placement.brollAudioPolicy === "mute" });
  }
  const template = { id: `vd-footage-broll-${input.seriesId}`, name: `Vertical Drama Footage B-roll ${input.storyRevisionId}`, width: 1080, height: 1920, fps, durationInFrames: frames(input.baseDurationMs), layers };
  const remotionInput = {
    kind: "remotion_render_video" as const,
    schemaVersion: 1 as const,
    platformContractVersion: REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
    rendererPolicyVersion: REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
    videoProjectId: `vd-footage-broll:${input.seriesId}:${input.shotPlanRevisionId}`,
    projectRevision: 1,
    traceId: `vd-footage-broll:${input.seriesId}:${input.storyRevisionId}:${Date.now()}`,
    renderProfile: { profile: "final" as const, width: 1080, height: 1920, fps, codec: "h264" as const, loudnessNormalize: false, burnInAssCaptions: false },
    remotionTemplate: template,
    compositionId: "GenericTemplate" as const,
    assetManifest: { sources: [{ role: "video" as const, url: input.preparedUrl, sha256: input.preparedSource.sourceFingerprint }, ...input.assetSources.map(source => ({ role: "video" as const, url: source.url, sha256: source.sourceFingerprint }))] },
    postPasses: [],
    segmentPlan: null,
    remotionTemplateHash: "footage-broll-template-v1",
    durationInFrames: frames(input.baseDurationMs),
  };
  return remotionRenderVideoWorkerInputSchema.parse(remotionInput);
}

async function enqueue<T extends Record<string, unknown>>(input: {
  actor: SpecialTieInFootageActor;
  seriesId: number;
  jobType: "footage_probe_analyze" | "footage_prepare" | "footage_broll_render";
  payload: T;
  binding: Awaited<ReturnType<typeof resolveBinding>>;
  reservedCredits: number;
  idempotencyKey: string;
}) {
  const flags = await getTenantFeatureFlags(input.actor.tenantId);
  if (!flags.desktopZeroClawWorker) throw new TRPCError({ code: "FORBIDDEN", message: "Desktop Worker dispatch is disabled for this tenant" });
  const existing = await db.select({ id: workerJobs.id, status: workerJobs.status, outputJson: workerJobs.outputJson, failureReason: workerJobs.failureReason }).from(workerJobs).where(and(eq(workerJobs.tenantId, input.actor.tenantId), eq(workerJobs.idempotencyKey, input.idempotencyKey))).limit(1);
  if (existing[0]) return { created: false, job: existing[0] };

  const capability = input.jobType === "footage_probe_analyze" ? "vd-footage-analysis" : input.jobType === "footage_prepare" ? "vd-footage-prepare" : "vd-footage-broll-render";
  const billing = await reserveWorkerJobCredits({ userId: input.actor.userId, tenantId: input.actor.tenantId, requestedCredits: input.reservedCredits, metadata: { feature: "vertical_drama_special_tie_in", jobType: input.jobType, seriesId: input.seriesId, source: "footage_first" } });
  try {
    const [job] = await db.insert(workerJobs).values({
      tenantId: input.actor.tenantId,
      workerId: null,
      workerSeriesBindingId: input.binding.row.id,
      workerSeriesBindingRevision: input.binding.row.bindingRevision,
      runtimeType: DESKTOP_RUNTIME,
      requestedByUserId: input.actor.userId,
      requestedBySystemComponent: "vertical_drama_special_tie_in",
      jobType: input.jobType,
      status: "queued",
      statusReason: `special_tie_in_${input.jobType}`,
      priority: 20,
      resourceProfile: input.jobType === "footage_broll_render" ? "cpu_heavy" : "cpu_heavy",
      capabilityRequirementsJson: { capabilityFamilies: ["vertical-drama-media", capability], requiredClaimCapability: capability, preferredWorkerId: input.binding.row.workerId },
      inputJson: input.payload,
      instructionsJson: { intent: input.jobType, seriesId: input.seriesId, workerBilling: billingMetadata(billing), maxRuntimeSeconds: MAX_JOB_TIMEOUT_SECONDS },
      timeoutSeconds: MAX_JOB_TIMEOUT_SECONDS,
      retryPolicyJson: { maxAttempts: 2, backoffSeconds: 60 },
      idempotencyKey: input.idempotencyKey,
    }).onConflictDoNothing().returning({ id: workerJobs.id, status: workerJobs.status, outputJson: workerJobs.outputJson, failureReason: workerJobs.failureReason });
    if (!job) {
      const [race] = await db.select({ id: workerJobs.id, status: workerJobs.status, outputJson: workerJobs.outputJson, failureReason: workerJobs.failureReason }).from(workerJobs).where(and(eq(workerJobs.tenantId, input.actor.tenantId), eq(workerJobs.idempotencyKey, input.idempotencyKey))).limit(1);
      await refundReservation(billing.reservationId).catch(() => undefined);
      return { created: false, job: race ?? null };
    }
    return { created: true, job };
  } catch (error) {
    await refundReservation(billing.reservationId).catch(() => undefined);
    throw error;
  }
}

export async function enqueueFootageAnalysis(input: { actor: SpecialTieInFootageActor; seriesId: number; mediaAssetId: number; requestedLanguage?: string; transcriptionPolicy?: "required" | "preferred" | "disabled"; analysisProfile?: "fast" | "standard" | "deep" }) {
  await assertSeries(input.actor, input.seriesId);
  const source = await resolveSource(input.actor, input.seriesId, input.mediaAssetId);
  const binding = await resolveBinding(input.actor, input.seriesId);
  const idempotencyKey = `vd-footage-analysis:${input.seriesId}:${source.source.assetId}:${source.source.sourceRevision}:${stableHash({ language: input.requestedLanguage ?? "th", transcriptionPolicy: input.transcriptionPolicy ?? "preferred", profile: input.analysisProfile ?? "standard" })}`.slice(0, 128);
  const payload = footageProbeAnalyzeJobPayloadSchema.parse({ kind: "footage_probe_analyze", seriesId: String(input.seriesId), binding: binding.contract, source: source.source, requestedLanguage: input.requestedLanguage ?? "th", transcriptionPolicy: input.transcriptionPolicy ?? "preferred", analysisProfile: input.analysisProfile ?? "standard", idempotencyKey });
  return enqueue({ actor: input.actor, seriesId: input.seriesId, jobType: "footage_probe_analyze", payload, binding, reservedCredits: 4, idempotencyKey });
}

export async function enqueueFootagePreparation(input: { actor: SpecialTieInFootageActor; seriesId: number; mediaAssetId: number; analysisRevision: string; segments: Array<{ sourceInMs: number; sourceOutMs: number; keep: boolean; reason: string }>; silenceRanges?: Array<{ startMs: number; endMs: number }>; removeDeadAir?: boolean; baseAudioPolicy?: "preserve" | "mute" | "selected_ranges"; fitPolicy?: "source" | "9:16_cover" | "9:16_contain"; maxDurationMs?: number; approvalFingerprint: string }) {
  await assertSeries(input.actor, input.seriesId);
  const source = await resolveSource(input.actor, input.seriesId, input.mediaAssetId);
  const binding = await resolveBinding(input.actor, input.seriesId);
  const idempotencyKey = `vd-footage-prepare:${input.seriesId}:${source.source.assetId}:${input.analysisRevision}:${input.approvalFingerprint}`.slice(0, 128);
  const payload = footagePrepareJobPayloadSchema.parse({ kind: "footage_prepare", seriesId: String(input.seriesId), binding: binding.contract, source: source.source, analysisRevision: input.analysisRevision, segments: input.segments, silenceRanges: input.silenceRanges ?? [], trimPolicy: { removeDeadAir: input.removeDeadAir ?? true, preserveSpeechPaddingMs: 250 }, baseAudioPolicy: input.baseAudioPolicy ?? "preserve", fitPolicy: input.fitPolicy ?? "9:16_cover", outputProfile: { maxDurationMs: input.maxDurationMs ?? 90_000, generateProxy: true }, approvalFingerprint: input.approvalFingerprint, idempotencyKey });
  return enqueue({ actor: input.actor, seriesId: input.seriesId, jobType: "footage_prepare", payload, binding, reservedCredits: 6, idempotencyKey });
}

export async function enqueueFootageBrollRender(input: { actor: SpecialTieInFootageActor; seriesId: number; preparedSource: unknown; preparedRevision: string; baseDurationMs: number; placements: unknown[]; storyRevisionId: string; shotPlanRevisionId: string; assetManifest: unknown[] }) {
  await assertSeries(input.actor, input.seriesId);
  const binding = await resolveBinding(input.actor, input.seriesId);
  const preparedSource = mediaSourceManifestSchema.parse(input.preparedSource);
  if (preparedSource.kind !== "video" || preparedSource.sourceRevision !== input.preparedRevision || (preparedSource.durationMs !== null && input.baseDurationMs > preparedSource.durationMs)) throw new TRPCError({ code: "BAD_REQUEST", message: "Prepared footage duration, revision, or media type is invalid" });
  const placements = input.placements.map(value => footageBrollPlacementSchema.parse(value));
  for (const placement of placements) {
    if (placement.endMs > input.baseDurationMs) throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll placement is outside the prepared footage" });
  }
  const assetSources = input.assetManifest.map(value => mediaSourceManifestSchema.parse(value));
  if (assetSources.some(source => source.kind !== "video")) throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll sources must be video assets" });
  const sourceById = new Map(assetSources.map(source => [source.assetId, source]));
  for (const placement of placements) {
    const source = sourceById.get(placement.sourceMediaAssetId);
    if (!source) throw new TRPCError({ code: "BAD_REQUEST", message: "Every B-roll placement must reference an approved source" });
    const requestedDuration = placement.endMs - placement.startMs;
    if (placement.sourceOutMs !== null && placement.sourceOutMs - placement.sourceInMs < requestedDuration) throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll source range is shorter than its placement" });
    if (source.durationMs !== null && placement.sourceInMs + requestedDuration > source.durationMs) throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll source range exceeds the source duration" });
  }
  const preparedUrl = await resolveWorkerRenderUrl(input.actor, preparedSource, binding.row.id, input.preparedRevision);
  const resolvedAssetSources = await Promise.all(assetSources.map(async source => ({ ...source, url: await resolveWorkerRenderUrl(input.actor, source, binding.row.id) })));
  const remotionInput = buildFootageRemotionInput({ preparedSource, preparedUrl, assetSources: resolvedAssetSources, placements, baseDurationMs: input.baseDurationMs, seriesId: input.seriesId, storyRevisionId: input.storyRevisionId, shotPlanRevisionId: input.shotPlanRevisionId });
  const payload = footageBrollRenderJobPayloadSchema.parse({ kind: "footage_broll_render", seriesId: String(input.seriesId), binding: binding.contract, preparedSource, preparedRevision: input.preparedRevision, baseDurationMs: input.baseDurationMs, placements, storyRevisionId: input.storyRevisionId, shotPlanRevisionId: input.shotPlanRevisionId, assetManifest: assetSources, renderProfile: { width: 1080, height: 1920, fps: 30, compositionExecutor: "remotion_render_video" }, remotionInput, idempotencyKey: `vd-footage-render:${input.seriesId}:${input.preparedRevision}:${stableHash({ placements, assetSources })}`.slice(0, 128) });
  const result = await enqueue({ actor: input.actor, seriesId: input.seriesId, jobType: "footage_broll_render", payload, binding, reservedCredits: 12, idempotencyKey: payload.idempotencyKey });
  return result;
}

/**
 * Re-checks the complete footage chain at episode-save time. The dialog is
 * only a client, so a caller must not be able to submit a guide or job from a
 * different user, series, source revision, or incomplete Worker run.
 */
export async function assertOwnedSpecialTieInFootage(input: {
  actor: SpecialTieInFootageActor;
  seriesId: number;
  footage: {
    sourceMediaAssetId: string;
    analysisJobId: string;
    prepareJobId: string;
    sourceRevision: string;
    guide: FootageGuide;
  };
}) {
  const mediaId = /^media-(\d+)$/.exec(input.footage.sourceMediaAssetId)?.[1];
  if (!mediaId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Footage source identity is invalid" });
  }
  const source = await resolveSource(input.actor, input.seriesId, Number(mediaId));
  if (
    input.footage.guide.sourceAssetId !== source.source.assetId ||
    input.footage.guide.sourceRevision !== input.footage.sourceRevision ||
    input.footage.guide.sourceFingerprint !== source.source.sourceFingerprint
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "Footage guide is stale; analyze the current source again" });
  }
  const binding = await resolveBinding(input.actor, input.seriesId);
  const jobs = (await db
    .select({ id: workerJobs.id, jobType: workerJobs.jobType, status: workerJobs.status, inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.tenantId, input.actor.tenantId),
      eq(workerJobs.requestedByUserId, input.actor.userId),
      eq(workerJobs.workerSeriesBindingId, binding.row.id),
      inArray(workerJobs.id, [input.footage.analysisJobId, input.footage.prepareJobId]),
    ))) as Array<{
      id: string;
      jobType: string;
      status: string;
      inputJson: Record<string, unknown>;
      outputJson: Record<string, unknown> | null;
    }>;
  const analysis = jobs.find(job => job.id === input.footage.analysisJobId && job.jobType === "footage_probe_analyze");
  const prepare = jobs.find(job => job.id === input.footage.prepareJobId && job.jobType === "footage_prepare");
  if (!analysis || analysis.status !== "completed") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Footage analysis is not complete" });
  }
  if (!prepare || prepare.status !== "completed") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Footage preparation is not complete" });
  }
  const workerGuide = footageGuideSchema.safeParse(
    readFootageOutputField(analysis.outputJson, "guide"),
  );
  if (!workerGuide.success) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Footage analysis output is missing a valid guide" });
  }
  if (
    workerGuide.data.sourceAssetId !== source.source.assetId ||
    workerGuide.data.sourceRevision !== source.source.sourceRevision ||
    workerGuide.data.sourceFingerprint !== source.source.sourceFingerprint ||
    input.footage.guide.sourceAssetId !== workerGuide.data.sourceAssetId ||
    input.footage.guide.sourceRevision !== workerGuide.data.sourceRevision ||
    input.footage.guide.sourceFingerprint !== workerGuide.data.sourceFingerprint
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "Footage guide does not match the Worker analysis output" });
  }
  for (const job of [analysis, prepare]) {
    const sourceFromJob = (job.inputJson as { source?: { assetId?: string; sourceRevision?: string } }).source;
    if (sourceFromJob?.assetId !== source.source.assetId || sourceFromJob.sourceRevision !== input.footage.sourceRevision) {
      throw new TRPCError({ code: "CONFLICT", message: "Footage job belongs to a different source revision" });
    }
  }
  const prepareAnalysisRevision = (prepare.inputJson as { analysisRevision?: unknown }).analysisRevision;
  if (String(prepareAnalysisRevision ?? "") !== input.footage.sourceRevision) {
    throw new TRPCError({ code: "CONFLICT", message: "Footage preparation was not based on this analysis revision" });
  }
  const preparedSource = mediaSourceManifestSchema.safeParse(
    readFootageOutputField(prepare.outputJson, "preparedSource"),
  );
  const preparedArtifactId = preparedSource.success
    ? /^artifact-(.+)$/.exec(preparedSource.data.assetId)?.[1]
    : null;
  const [preparedArtifact] = preparedArtifactId
    ? await db
      .select({ id: workerArtifacts.id, artifactType: workerArtifacts.artifactType, publishedItemId: workerArtifacts.publishedItemId, metadataJson: workerArtifacts.metadataJson })
      .from(workerArtifacts)
      .where(and(eq(workerArtifacts.id, preparedArtifactId), eq(workerArtifacts.workerJobId, prepare.id)))
      .limit(1)
    : [];
  const preparedMetadata = preparedArtifact?.metadataJson && typeof preparedArtifact.metadataJson === "object"
    ? preparedArtifact.metadataJson as Record<string, unknown>
    : {};
  const preparedChecksum = typeof preparedMetadata.checksumSha256 === "string"
    ? preparedMetadata.checksumSha256
    : null;
  if (
    !preparedSource.success ||
    preparedSource.data.kind !== "video" ||
    preparedSource.data.sourceRevision !== input.footage.sourceRevision ||
    !preparedArtifact ||
    preparedArtifact.artifactType !== "normalized_video" ||
    preparedArtifact.publishedItemId == null ||
    preparedChecksum !== preparedSource.data.sourceFingerprint
  ) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Footage preparation output is missing a valid published source" });
  }
}

/** Keeps an optional pre-created B-roll render job tenant/series scoped when
 * the user saves the special episode after the Worker has been queued. */
export async function assertOwnedSpecialTieInBrollRenderJob(input: {
  actor: SpecialTieInFootageActor;
  seriesId: number;
  renderJobId?: string;
  storyRevisionId?: string;
  shotPlanRevisionId?: string;
}) {
  if (!input.renderJobId) return;
  const [job] = await db
    .select({ id: workerJobs.id, workerSeriesBindingId: workerJobs.workerSeriesBindingId, status: workerJobs.status, inputJson: workerJobs.inputJson })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.id, input.renderJobId),
      eq(workerJobs.tenantId, input.actor.tenantId),
      eq(workerJobs.requestedByUserId, input.actor.userId),
      eq(workerJobs.jobType, "footage_broll_render"),
    ))
    .limit(1);
  if (!job || ["failed", "canceled", "expired"].includes(job.status)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "B-roll render job is not available" });
  }
  const seriesId = (job.inputJson as { seriesId?: unknown }).seriesId;
  if (String(seriesId) !== String(input.seriesId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "B-roll render job is not in this Series" });
  }
  const binding = await resolveBinding(input.actor, input.seriesId);
  if (job.workerSeriesBindingId !== binding.row.id) {
    throw new TRPCError({ code: "CONFLICT", message: "B-roll render uses a stale Worker Series binding; render it again" });
  }
  const jobInput = job.inputJson as { storyRevisionId?: unknown; shotPlanRevisionId?: unknown };
  if (
    (input.storyRevisionId && String(jobInput.storyRevisionId) !== input.storyRevisionId) ||
    (input.shotPlanRevisionId && String(jobInput.shotPlanRevisionId) !== input.shotPlanRevisionId)
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "B-roll render belongs to an older story revision; render it again" });
  }
}

/** Validates a saved B-roll plan even when the user has not rendered it yet.
 * A render job is optional at planning time, but its sources must still be
 * real owner-scoped media/artifacts and every timing value must be admissible.
 */
export async function assertOwnedSpecialTieInBroll(input: {
  actor: SpecialTieInFootageActor;
  seriesId: number;
  broll: {
    preparedSource: ReturnType<typeof mediaSourceManifestSchema.parse>;
    preparedRevision: string;
    baseDurationMs: number;
    placements: Array<ReturnType<typeof footageBrollPlacementSchema.parse>>;
    assetManifest: Array<ReturnType<typeof mediaSourceManifestSchema.parse>>;
  };
}) {
  await assertSeries(input.actor, input.seriesId);
  const binding = await resolveBinding(input.actor, input.seriesId);
  const { broll } = input;
  if (broll.preparedSource.kind !== "video" || broll.preparedSource.sourceRevision !== broll.preparedRevision || (broll.preparedSource.durationMs !== null && broll.baseDurationMs > broll.preparedSource.durationMs)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll prepared source is invalid or stale" });
  }
  const sources = new Map(broll.assetManifest.map(source => [source.assetId, source]));
  if (sources.size !== broll.assetManifest.length || broll.assetManifest.some(source => source.kind !== "video")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll asset manifest is invalid" });
  }
  for (const placement of broll.placements) {
    if (placement.endMs > broll.baseDurationMs) throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll placement is outside the prepared footage" });
    const source = sources.get(placement.sourceMediaAssetId);
    if (!source) throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll placement source is missing" });
    const durationMs = placement.endMs - placement.startMs;
    if (placement.sourceOutMs !== null && placement.sourceOutMs - placement.sourceInMs < durationMs) throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll source range is shorter than its placement" });
    if (source.durationMs !== null && placement.sourceInMs + durationMs > source.durationMs) throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll source range exceeds the source duration" });
  }
  await resolveWorkerRenderUrl(input.actor, broll.preparedSource, binding.row.id, broll.preparedRevision);
  await Promise.all(broll.assetManifest.map(source => resolveWorkerRenderUrl(input.actor, source, binding.row.id)));
}

/**
 * Lists only owner-scoped, checksum-backed video assets that can safely be
 * offered as B-roll sources. The returned manifest is the same identity that
 * the render admission path re-checks; the preview URL is a protected
 * same-origin storage route and is never a provider URL.
 */
export async function listFootageBrollAssets(input: { actor: SpecialTieInFootageActor; seriesId: number; query?: string }) {
  await assertSeries(input.actor, input.seriesId);
  const rows = (await db
    .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey, mimeType: mediaAssets.mimeType, fileSize: mediaAssets.fileSize, checksumSha256: mediaAssets.checksumSha256, durationMs: mediaAssets.durationMs, createdAt: mediaAssets.createdAt, updatedAt: mediaAssets.updatedAt, thumbnailUrl: mediaAssets.thumbnailUrl })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.tenantId, input.actor.tenantId), eq(mediaAssets.userId, input.actor.userId), eq(mediaAssets.status, "ready"), sql`${mediaAssets.mimeType} like 'video/%'`))
    .limit(100)) as Array<{
      id: number;
      storageKey: string;
      mimeType: string;
      fileSize: number | null;
      checksumSha256: string | null;
      durationMs: number | null;
      createdAt: Date | null;
      updatedAt: Date | null;
      thumbnailUrl: string | null;
    }>;
  const query = input.query?.trim().toLowerCase();
  return {
    assets: rows
      .filter(row => Boolean(row.checksumSha256))
      .filter(row => !query || sourceFileName(row.storageKey).toLowerCase().includes(query))
      .map(row => ({
        manifest: mediaSourceManifestSchema.parse({
          assetId: `media-${row.id}`,
          kind: "video",
          sourceRevision: String(row.updatedAt?.getTime() ?? row.createdAt?.getTime() ?? 1),
          sourceFingerprint: row.checksumSha256,
          fileName: sourceFileName(row.storageKey),
          sizeBytes: Math.max(0, Number(row.fileSize ?? 0)),
          durationMs: row.durationMs,
          captureAt: null,
        }),
        previewUrl: browserStorageUrl(row.storageKey),
        thumbnailUrl: row.thumbnailUrl,
      })),
  };
}

async function resolveBrowserOutputJson(outputJson: unknown, jobId: string): Promise<Record<string, unknown> | null> {
  const output = outputJson && typeof outputJson === "object" && !Array.isArray(outputJson)
    ? { ...(outputJson as Record<string, unknown>) }
    : null;
  if (!output) return null;
  for (const field of ["guide", "preparedSource", "artifact", "qc", "publication", "outputUrl"] as const) {
    if (output[field] !== undefined && output[field] !== null) continue;
    const lastEventPayload = output.lastEventPayload;
    if (lastEventPayload && typeof lastEventPayload === "object" && !Array.isArray(lastEventPayload)) {
      const value = (lastEventPayload as Record<string, unknown>)[field];
      if (value !== undefined) output[field] = value;
    }
  }
  const [job] = await db
    .select({ jobType: workerJobs.jobType })
    .from(workerJobs)
    .where(eq(workerJobs.id, jobId))
    .limit(1);
  const outputArtifactTypes = job?.jobType === "footage_probe_analyze"
    ? ["footage_guide"]
    : job?.jobType === "footage_prepare"
      ? ["normalized_video"]
      : job?.jobType === "footage_broll_render"
        ? ["remotion_render_mp4"]
        : [];
  const [artifact] = outputArtifactTypes.length > 0
    ? await db
      .select({ storageRef: workerArtifacts.storageRef })
      .from(workerArtifacts)
      .where(and(eq(workerArtifacts.workerJobId, jobId), inArray(workerArtifacts.artifactType, outputArtifactTypes)))
      .limit(1)
    : [];
  const firstArtifact = Array.isArray(output.artifacts) && output.artifacts[0] && typeof output.artifacts[0] === "object"
    ? output.artifacts[0] as Record<string, unknown>
    : null;
  const outputRef = output.outputArtifactRef && typeof output.outputArtifactRef === "object"
    ? output.outputArtifactRef as Record<string, unknown>
    : null;
  const storageRef = [output.outputUrl, outputRef?.storageRef, firstArtifact?.storageRef, artifact?.storageRef]
    .find(value => typeof value === "string" && value.trim() && !/^https?:\/\//i.test(value as string) && !(value as string).startsWith("/api/storage/files/")) as string | undefined;
  if (!storageRef) return output;
  const resolved = await storageResolveUrl(storageRef).catch(() => null);
  const playbackUrl = resolved || browserStorageUrl(storageRef);
  output.outputUrl = playbackUrl;
  if (outputRef) output.outputArtifactRef = { ...outputRef, url: playbackUrl };
  if (firstArtifact) output.artifacts = [{ ...firstArtifact, url: playbackUrl }, ...(output.artifacts as unknown[]).slice(1)];
  return output;
}

function readFootageOutputField(outputJson: unknown, field: string): unknown {
  if (!outputJson || typeof outputJson !== "object" || Array.isArray(outputJson)) return undefined;
  const output = outputJson as Record<string, unknown>;
  if (output[field] !== undefined) return output[field];
  const lastEventPayload = output.lastEventPayload;
  if (!lastEventPayload || typeof lastEventPayload !== "object" || Array.isArray(lastEventPayload)) return undefined;
  return (lastEventPayload as Record<string, unknown>)[field];
}

export async function getFootageJob(input: { actor: SpecialTieInFootageActor; jobId: string }) {
  const [job] = await db.select({ id: workerJobs.id, jobType: workerJobs.jobType, status: workerJobs.status, statusReason: workerJobs.statusReason, outputJson: workerJobs.outputJson, failureReason: workerJobs.failureReason, createdAt: workerJobs.createdAt, startedAt: workerJobs.startedAt, finishedAt: workerJobs.finishedAt, inputJson: workerJobs.inputJson }).from(workerJobs).where(and(eq(workerJobs.id, input.jobId), eq(workerJobs.tenantId, input.actor.tenantId), eq(workerJobs.requestedByUserId, input.actor.userId), inArray(workerJobs.jobType, ["footage_probe_analyze", "footage_prepare", "footage_broll_render"]))).limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Footage job not found" });
  return { ...job, outputJson: await resolveBrowserOutputJson(job.outputJson, job.id) };
}

export function readFootageGuide(value: unknown): FootageGuide | null {
  if (!value || typeof value !== "object") return null;
  const guide = (value as Record<string, unknown>).guide ?? value;
  const result = footageGuideSchema.safeParse(guide);
  return result.success ? result.data : null;
}
