import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";

import type { MediaTask, MediaTaskArtifactProjection } from "./mediaGenerationService";
import { getDb } from "../db";
import {
  contentProtectionAssets,
  mediaAssets,
} from "../../drizzle/schema";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import {
  CONTENT_PROTECTION_CONTRACT_VERSION,
  CONTENT_PROTECTION_JOB_TYPE,
  contentProtectionIntentSchema,
  type ContentProtectionIntent,
} from "../../shared/contentProtectionWorker";

type ProtectionProjectionInput = {
  status: string;
  originalPlaybackUrl?: string;
  protectedPlaybackUrl?: string;
};

export function normalizeMediaTaskProtectionIntent(
  value: unknown,
): ContentProtectionIntent | null {
  const parsed = contentProtectionIntentSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    choiceSource:
      parsed.data.choiceSource ??
      (parsed.data.choice === "on" ? "per_export" : "disabled_by_user"),
  };
}

export function buildMediaTaskProtectionIdempotencyKey(
  taskId: string,
  outputIndex: number,
  sourceSha256: string,
): string {
  return `content-protection:media-task:${taskId}:${outputIndex}:${sourceSha256}`;
}

export function projectMediaTaskProtectionStatus(input: ProtectionProjectionInput): {
  status: string;
  playbackUrl?: string;
  availabilityStatus: string;
} {
  const protectedPlaybackUrl = input.protectedPlaybackUrl && /^(https?:\/\/|\/)/i.test(input.protectedPlaybackUrl)
    ? input.protectedPlaybackUrl
    : undefined;
  if (input.status === "PROTECTED" || input.status === "PROTECTED_WITH_WARNINGS") {
    return {
      status: input.status,
      ...(protectedPlaybackUrl ? { playbackUrl: protectedPlaybackUrl } : {}),
      availabilityStatus: protectedPlaybackUrl ? "ready" : "storage_pending",
    };
  }
  if (input.status === "UNPROTECTED_BY_USER_CHOICE") {
    return {
      status: input.status,
      playbackUrl: input.originalPlaybackUrl,
      availabilityStatus: input.originalPlaybackUrl ? "ready" : "storage_pending",
    };
  }
  return {
    status: input.status,
    availabilityStatus:
      input.status === "FAILED" || input.status === "INCONCLUSIVE"
        ? "content_protection_failed"
        : "content_protection_processing",
  };
}

function blockUnverifiedArtifact(
  artifact: MediaTaskArtifactProjection,
  reason: string,
): MediaTaskArtifactProjection {
  return {
    ...artifact,
    contentProtectionStatus: "FAILED",
    availabilityStatus: "content_protection_failed",
    availabilityReason: reason,
    playbackUrl: undefined,
  };
}

function mediaTaskIntent(task: MediaTask): ContentProtectionIntent | null {
  const params = {
    ...(task.parameters ?? {}),
    ...((task.parameters?.extra_params as Record<string, unknown> | undefined) ?? {}),
    ...((task.resultData?.extra_params as Record<string, unknown> | undefined) ?? {}),
  };
  return normalizeMediaTaskProtectionIntent(params.__content_protection_intent);
}

function outputExtension(mimeType: string): string {
  const subtype = mimeType.split("/", 2)[1]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return subtype && subtype.length <= 8 ? subtype : "bin";
}

async function resolvePlaybackRef(storageKey: string | null | undefined): Promise<string | undefined> {
  const raw = String(storageKey ?? "").trim();
  if (!raw) return undefined;
  if (/^(https?:\/\/|\/)/i.test(raw)) return raw;
  try {
    const { storageGet } = await import("../storage");
    const resolved = await storageGet(raw);
    const url = String(resolved?.url ?? "").trim();
    return url || undefined;
  } catch {
    return undefined;
  }
}

async function ensureProtectionAssetForArtifact(input: {
  task: MediaTask;
  artifact: MediaTaskArtifactProjection;
  tenantId: string;
  userId: number;
  intent: ContentProtectionIntent;
}): Promise<typeof contentProtectionAssets.$inferSelect | null> {
  const mediaAssetId = input.artifact.mediaAssetId;
  if (!mediaAssetId) return null;
  const database = getDb();
  const [source] = await database
    .select()
    .from(mediaAssets)
    .where(and(
      eq(mediaAssets.id, mediaAssetId),
      eq(mediaAssets.tenantId, input.tenantId),
      eq(mediaAssets.userId, input.userId),
    ))
    .limit(1);
  if (!source?.checksumSha256) return null;

  const idempotencyKey = buildMediaTaskProtectionIdempotencyKey(
    input.task.id,
    input.artifact.outputIndex,
    source.checksumSha256,
  );
  const [existing] = await database
    .select()
    .from(contentProtectionAssets)
    .where(and(
      eq(contentProtectionAssets.tenantId, input.tenantId),
      eq(contentProtectionAssets.idempotencyKey, idempotencyKey),
    ))
    .limit(1);
  if (existing) return existing;

  const flags = await getTenantFeatureFlags(input.tenantId) as unknown as Record<string, unknown>;
  const modality = input.task.mediaType;
  const featureReady = flags.contentProtectionEnabled === true &&
    (modality !== "image" || flags.contentProtectionImageProviderEnabled === true);
  const protectionAssetId = crypto.randomUUID();
  const status = input.intent.choice === "off" ? "UNPROTECTED_BY_USER_CHOICE" : featureReady ? "QUEUED" : "FAILED";
  const [created] = await database.insert(contentProtectionAssets).values({
    id: protectionAssetId,
    tenantId: input.tenantId,
    ownerUserId: input.userId,
    sourceAssetId: source.id,
    sourceVersionId: source.updatedAt?.toISOString() ?? null,
    modality,
    profileId: "content-protection-default",
    profileVersion: "1",
    status,
    watermarkChoice: input.intent.choice,
    choiceSource: input.intent.choiceSource ?? (input.intent.choice === "on" ? "per_export" : "disabled_by_user"),
    sourceObjectKey: source.storageKey,
    sourceSha256: source.checksumSha256,
    mimeType: source.mimeType,
    width: source.width,
    height: source.height,
    idempotencyKey,
    firstObservedAt: new Date(),
    ...(status === "FAILED" ? {
      errorCode: "CONTENT_PROTECTION_DISABLED",
      errorMessage: "Content protection is not enabled for this tenant or media type",
    } : {}),
  }).onConflictDoNothing().returning();
  if (!created) {
    const [raced] = await database.select().from(contentProtectionAssets).where(and(
      eq(contentProtectionAssets.tenantId, input.tenantId),
      eq(contentProtectionAssets.idempotencyKey, idempotencyKey),
    )).limit(1);
    return raced ?? null;
  }
  if (created.status !== "QUEUED") return created;

  try {
    const providerId = process.env.CONTENT_PROTECTION_PROVIDER?.trim().toLowerCase() || "videoseal";
    const outputObjectKey = `${input.tenantId}/content-protection/${created.id}.${outputExtension(source.mimeType)}`;
    const job = await createControlPlaneJob({
      context: {
        tenantId: input.tenantId,
        actorType: "user",
        actorId: input.userId,
        authorizationScope: "content_protection.protect",
        correlationId: input.task.id,
        idempotencyKey: `content-protection:${created.id}`,
      },
      definition: {
        contractVersion: CONTENT_PROTECTION_CONTRACT_VERSION,
        jobType: CONTENT_PROTECTION_JOB_TYPE,
        executionClass: "cpu",
        input: {
          contractVersion: CONTENT_PROTECTION_CONTRACT_VERSION,
          jobType: CONTENT_PROTECTION_JOB_TYPE,
          protectionAssetId: created.id,
          tenantId: input.tenantId,
          sourceAssetId: source.id,
          sourceObjectKey: source.storageKey,
          sourceSha256: source.checksumSha256,
          mimeType: source.mimeType,
          modality,
          effectiveChoice: "on",
          choiceSource: input.intent.choiceSource === "user_default" ? "user_default" : "per_export",
          providerId,
          providerVersion: "1",
          outputObjectKey,
          requireBeforePublish: input.intent.requireBeforePublish,
        },
        idempotencyKey: `content-protection:${created.id}`,
        requiredCapabilities: {
          capabilityFamilies: ["content_protection"],
          requiredClaimCapability: "content-protection-v1",
          providerId,
          modalities: [modality],
        },
        retryPolicy: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 60_000, jitter: "bounded", deadlineMs: 15 * 60_000, allowedErrorClasses: ["retryable"] },
        timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 15 * 60_000 },
      },
    });
    const [bound] = await database.update(contentProtectionAssets).set({
      causalJobId: job.jobId,
      protectedObjectKey: outputObjectKey,
    }).where(and(
      eq(contentProtectionAssets.id, created.id),
      eq(contentProtectionAssets.tenantId, input.tenantId),
    )).returning();
    return bound ?? created;
  } catch {
    const [failed] = await database.update(contentProtectionAssets).set({
      status: "FAILED",
      errorCode: "PROTECTION_JOB_CREATE_FAILED",
      errorMessage: "The protection job could not be queued",
    }).where(and(
      eq(contentProtectionAssets.id, created.id),
      eq(contentProtectionAssets.tenantId, input.tenantId),
    )).returning();
    return failed ?? created;
  }
}

export async function ensureMediaTaskContentProtection(input: {
  task: MediaTask;
  tenantId: string;
  userId: number;
}): Promise<MediaTask> {
  const intent = mediaTaskIntent(input.task);
  if (!intent || input.task.status !== "completed" || !input.task.artifacts?.length) {
    return input.task;
  }

  const artifacts = await Promise.all(input.task.artifacts.map(async artifact => {
    try {
      const protection = await ensureProtectionAssetForArtifact({ ...input, artifact, intent });
      if (!protection) {
        return intent.choice === "on"
          ? blockUnverifiedArtifact(artifact, "Protection could not be bound to a durable media asset")
          : {
              ...artifact,
              contentProtectionStatus: "UNPROTECTED_BY_USER_CHOICE",
              availabilityReason: "Digital watermark disabled by the user for this export",
            };
      }
      const protectedPlaybackUrl = await resolvePlaybackRef(
        protection.status === "PROTECTED" || protection.status === "PROTECTED_WITH_WARNINGS"
          ? protection.protectedObjectKey
          : undefined,
      );
      const projected = projectMediaTaskProtectionStatus({
        status: protection.status,
        originalPlaybackUrl: artifact.playbackUrl,
        protectedPlaybackUrl,
      });
      return {
        ...artifact,
        contentProtectionAssetId: protection.id,
        contentProtectionStatus: projected.status,
        ...(projected.playbackUrl
          ? { playbackUrl: projected.playbackUrl }
          : { playbackUrl: undefined }),
        availabilityStatus: projected.availabilityStatus,
        ...(projected.status === "FAILED"
          ? {
              availabilityReason:
                protection.errorMessage ?? "Content protection failed",
            }
          : {}),
      };
    } catch (error) {
      if (intent.choice !== "on") {
        return {
          ...artifact,
          contentProtectionStatus: "UNPROTECTED_BY_USER_CHOICE",
          availabilityReason: "Digital watermark disabled by the user for this export",
        };
      }
      return blockUnverifiedArtifact(
        artifact,
        error instanceof Error ? `Protection status unavailable: ${error.message}` : "Protection status unavailable",
      );
    }
  }));
  const primary = artifacts.find(item => item.outputIndex === 0) ?? artifacts[0];
  return {
    ...input.task,
    artifacts,
    resultUrl: primary?.playbackUrl,
    resultData: {
      ...(input.task.resultData ?? {}),
      mediaArtifacts: artifacts,
    },
  };
}
