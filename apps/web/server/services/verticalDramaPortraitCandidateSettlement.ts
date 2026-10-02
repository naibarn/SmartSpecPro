import { TRPCError } from "@trpc/server";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { isCharacterLockPolicyFailureMessage } from "@shared/verticalDramaSeries/characterLock";
import { db } from "../db";
import { verticalDramaCharacterAssets } from "../../drizzle/schema";
import { createVerticalDramaMediaUserToken } from "./verticalDramaMediaUserToken";
import {
  getTransientMediaPollRetryHint,
  getUnifiedMediaTask,
} from "./mediaTaskPollingService";
import { ingestVerticalDramaMediaAsset } from "./verticalDramaMediaAssetService";
import {
  verticalDramaCharacterStockService,
  VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE,
  summarizePortraitCandidatePolicyReason,
  type VerticalDramaCharacterStockOwner,
} from "./verticalDramaCharacterStock";

const RECONCILE_STALE_AFTER_MS = 2 * 60 * 1000;
const RECONCILE_BATCH_SIZE = 10;
const RECONCILE_CONCURRENCY = 2;

export type PortraitCandidateSettlementResult = {
  assetLinkId: string;
  taskId?: string;
  status: string;
  imageUrl?: string;
  errorMessage?: string;
  policyRejected?: boolean;
  policyReason?: string;
  retryAfterMs?: number;
  asset?: unknown;
};

type SettlePortraitCandidateInput = VerticalDramaCharacterStockOwner & {
  assetLinkId: number;
  taskId?: string;
  source?: string;
};

function readTaskParameter(
  parameters: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!parameters) return undefined;
  const direct = parameters[key];
  if (typeof direct === "string") return direct;
  for (const containerKey of ["extraParams", "extra_params"] as const) {
    const extra = parameters[containerKey];
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) continue;
    const value = (extra as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

/**
 * The single owner-scoped settle path shared by the browser poll and the
 * PostgreSQL control-plane recovery sweep. It only finalizes an existing
 * media task; it never submits image work or reserves credits.
 */
export async function settleVerticalDramaPortraitCandidate(
  input: SettlePortraitCandidateInput
): Promise<PortraitCandidateSettlementResult> {
  const { tenantId, userId, seriesId, assetLinkId } = input;
  const source = input.source ?? "trpc.verticalDramaCharacters.settlePortraitCandidate";
  const info = await verticalDramaCharacterStockService.getPortraitCandidateTaskInfo(
    { tenantId, userId, seriesId },
    assetLinkId
  );

  if (info.taskId && input.taskId && info.taskId !== input.taskId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Task id does not match this portrait candidate.",
    });
  }
  const taskId = info.taskId ?? input.taskId;
  if (
    taskId &&
    info.mediaAssetId != null &&
    info.imageUrl &&
    ["completed", "selected", "superseded"].includes(info.status)
  ) {
    return {
      assetLinkId: String(assetLinkId),
      taskId,
      status: "completed",
      imageUrl: info.imageUrl,
    };
  }
  if (taskId && info.status === "failed") {
    return {
      assetLinkId: String(assetLinkId),
      taskId,
      status: "failed",
      ...(info.errorMessage ? { errorMessage: info.errorMessage } : {}),
      ...(info.policyRejected ? { policyRejected: true } : {}),
      ...(info.policyReason ? { policyReason: info.policyReason } : {}),
    };
  }
  if (!taskId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Portrait candidate has no submitted media task.",
    });
  }

  let task: Awaited<ReturnType<typeof getUnifiedMediaTask>>;
  try {
    task = await getUnifiedMediaTask({
      taskId,
      userId,
      userToken: createVerticalDramaMediaUserToken({ userId, tenantId }),
      tenantId,
      auditContext: { userId, tenantId, source, stage: "poll" },
    });
  } catch (error) {
    const transientPoll = getTransientMediaPollRetryHint(error);
    if (!transientPoll) throw error;
    return {
      assetLinkId: String(assetLinkId),
      taskId,
      status: "queued",
      retryAfterMs: transientPoll.retryAfterSeconds * 1000,
    };
  }

  if (!info.taskId && info.status === "submitting") {
    const provenanceMatches =
      task.mediaType === "image" &&
      readTaskParameter(task.parameters, "__vd_portrait_candidate_asset_link_id") === String(assetLinkId) &&
      readTaskParameter(task.parameters, "__vd_portrait_candidate_batch_id") === info.batchId &&
      readTaskParameter(task.parameters, "__vd_portrait_candidate_id") === info.candidateId &&
      readTaskParameter(task.parameters, "__vd_character_id") === String(info.characterId);
    if (!provenanceMatches) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Task provenance does not match this portrait candidate.",
      });
    }
    await verticalDramaCharacterStockService.recordPortraitCandidateTask({
      tenantId,
      userId,
      seriesId,
      assetLinkId,
      taskId,
      imageModel: task.model,
    });
  }

  if (task.status === "completed" || task.status === "failed") {
    const { reconcileTaskCredits } = await import("../routers/media");
    void reconcileTaskCredits({ task: task as any, userId }).catch(() => {});
  }
  if (task.status === "failed") {
    await verticalDramaCharacterStockService.markPortraitCandidateSubmissionFailed({
      tenantId,
      userId,
      seriesId,
      assetLinkId,
      errorMessage: task.errorMessage ?? "Portrait candidate render failed",
    });
    const policyRejected = isCharacterLockPolicyFailureMessage(task.errorMessage);
    return {
      assetLinkId: String(assetLinkId),
      taskId,
      status: "failed",
      errorMessage: policyRejected
        ? VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE
        : task.errorMessage ?? undefined,
      policyRejected,
      ...(policyRejected
        ? (() => {
            const policyReason = summarizePortraitCandidatePolicyReason(
              task.errorMessage
            );
            return policyReason ? { policyReason } : {};
          })()
        : {}),
    };
  }
  if (task.status !== "completed") {
    return { assetLinkId: String(assetLinkId), taskId, status: task.status };
  }
  if (!task.resultUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Portrait candidate completed without a result URL.",
    });
  }

  let durable: Awaited<ReturnType<typeof ingestVerticalDramaMediaAsset>>;
  try {
    durable = await ingestVerticalDramaMediaAsset({
      tenantId,
      userId,
      seriesId,
      mediaType: "image",
      sourceUrl: task.resultUrl,
      mimeType: "image/jpeg",
      identity: task.id,
      purpose: "character_portrait",
    });
  } catch (error) {
    const transientPoll = getTransientMediaPollRetryHint(error);
    if (!transientPoll) throw error;
    return {
      assetLinkId: String(assetLinkId),
      taskId,
      status: "queued",
      retryAfterMs: transientPoll.retryAfterSeconds * 1000,
    };
  }
  const asset = await verticalDramaCharacterStockService.attachGeneratedPortraitCandidate(
    {
      tenantId,
      userId,
      seriesId,
      assetLinkId,
      mediaAssetId: durable.mediaAssetId,
    }
  );
  return {
    assetLinkId: String(assetLinkId),
    taskId,
    status: "completed",
    imageUrl: durable.url,
    asset,
  };
}

/**
 * Recover stale candidate rows even when their browser tab has closed. The
 * query and per-tick work are bounded; failures leave rows queued for a later
 * control-plane pass.
 */
export async function reconcileStalePortraitCandidates(now = new Date()): Promise<{
  scanned: number;
  settled: number;
  errors: number;
}> {
  const staleCutoff = new Date(now.getTime() - RECONCILE_STALE_AFTER_MS);
  const rows = await db
    .select({
      assetLinkId: verticalDramaCharacterAssets.id,
      tenantId: verticalDramaCharacterAssets.tenantId,
      userId: verticalDramaCharacterAssets.userId,
      seriesId: verticalDramaCharacterAssets.seriesId,
      metadata: verticalDramaCharacterAssets.metadata,
    })
    .from(verticalDramaCharacterAssets)
    .where(
      and(
        eq(verticalDramaCharacterAssets.role, "portrait_candidate"),
        sql`${verticalDramaCharacterAssets.metadata} #>> '{portraitCandidate,status}' = 'queued'`,
        lt(verticalDramaCharacterAssets.updatedAt, staleCutoff)
      )
    )
    .orderBy(asc(verticalDramaCharacterAssets.updatedAt))
    .limit(RECONCILE_BATCH_SIZE);

  let settled = 0;
  let errors = 0;
  for (let index = 0; index < rows.length; index += RECONCILE_CONCURRENCY) {
    const chunk = rows.slice(index, index + RECONCILE_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async row => {
        const metadata = row.metadata as Record<string, unknown> | null;
        const candidate = metadata?.portraitCandidate as
          | Record<string, unknown>
          | undefined;
        const taskId = typeof candidate?.taskId === "string" ? candidate.taskId : undefined;
        if (!taskId) return "skipped" as const;
        const result = await settleVerticalDramaPortraitCandidate({
          tenantId: row.tenantId,
          userId: row.userId,
          seriesId: row.seriesId,
          assetLinkId: row.assetLinkId,
          taskId,
          source: "control_plane.reconcileStalePortraitCandidates",
        });
        return result.status === "completed" || result.status === "failed"
          ? "settled" as const
          : "pending" as const;
      })
    );
    for (const [chunkIndex, result] of results.entries()) {
      if (result.status === "fulfilled" && result.value === "settled") {
        settled += 1;
      } else if (result.status === "rejected") {
        errors += 1;
        console.warn("[vertical-drama] portrait candidate recovery failed", {
          assetLinkId: chunk[chunkIndex]?.assetLinkId,
          error: result.reason instanceof Error
            ? result.reason.message.slice(0, 240)
            : String(result.reason).slice(0, 240),
        });
      }
    }
  }
  return { scanned: rows.length, settled, errors };
}
