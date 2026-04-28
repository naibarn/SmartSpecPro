import crypto from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { mediaGenerationService, type MediaTask } from "./mediaGenerationService";
import { buildAutoTeamBudgetKey, assessAutoTeamBudget, type AutoTeamBudgetDecision } from "./autoTeamBudgetService";
import { buildAutoTeamProviderRequestHash, resolveAutoTeamProviderDecision, type AutoTeamProviderDecision } from "./autoTeamProviderPolicy";
import { buildCanonicalArtifactRef } from "./autoTeamArtifactRefService";
import { sanitizeProviderPayload, validateAutoTeamMediaOutputSafety, redactSensitiveText } from "./autoTeamSafetyService";
import { autoTeamArtifactRefs, autoTeamExecutionStages, autoTeamMediaJobRefs, type AutoTeamArtifactRefRow, type AutoTeamExecutionStageRow, type AutoTeamMediaJobRefRow, type AutoTeamRouteDecisionRow } from "../../drizzle/schema";

export interface AutoTeamMediaExecutionInput {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId: string;
  stageId?: string | null;
  workItemId?: string | null;
  routeDecision: Pick<AutoTeamRouteDecisionRow, "routeClass" | "language" | "id">;
  objective: string;
  prompt: string;
  mediaType: "image" | "video";
  provider?: string | null;
  model?: string | null;
  userToken: string;
  publicUrl?: string | null;
  attempt?: number;
  extraParams?: Record<string, unknown> | null;
  referenceImageUrls?: string[] | null;
  referenceVideoUrls?: string[] | null;
}

export interface AutoTeamMediaExecutionResult {
  jobRef: AutoTeamMediaJobRefRow;
  artifactRefs: AutoTeamArtifactRefRow[];
  providerDecision: AutoTeamProviderDecision;
  budgetDecision: AutoTeamBudgetDecision;
  task: MediaTask | null;
  safetyStatus: "safe" | "needs_review" | "blocked" | "redacted" | "unknown";
}

export class AutoTeamMediaSubmitError extends Error {
  readonly reasonCode: string;
  readonly retryable: boolean;

  constructor(message: string, reasonCode = "provider_submit_failed", retryable = true) {
    super(message);
    this.name = "AutoTeamMediaSubmitError";
    this.reasonCode = reasonCode;
    this.retryable = retryable;
  }
}

function now(): Date {
  return new Date();
}

export function buildMediaSubmitIdempotencyKey(input: AutoTeamMediaExecutionInput): string {
  return buildAutoTeamProviderRequestHash({
    tenantId: input.tenantId,
    runId: input.runId,
    stageId: input.stageId ?? null,
    routeClass: input.routeDecision.routeClass,
    provider: input.provider ?? "",
    model: input.model ?? "",
    prompt: input.prompt,
    attempt: input.attempt ?? 1,
  });
}

export function sanitizeProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown provider error");
  return redactSensitiveText(raw).slice(0, 500);
}

export function resolveProviderDecision(
  input: AutoTeamMediaExecutionInput,
): AutoTeamProviderDecision {
  return resolveAutoTeamProviderDecision({
    tenantId: input.tenantId,
    runId: input.runId,
    stageId: input.stageId ?? null,
    routeClass: input.routeDecision.routeClass,
    objective: input.objective,
    requestedProvider: input.provider ?? null,
    requestedModel: input.model ?? null,
    teamLanguage: input.routeDecision.language,
  });
}

export function assertBudgetAllowsMediaJob(
  input: AutoTeamMediaExecutionInput,
): AutoTeamBudgetDecision {
  return assessAutoTeamBudget({
    tenantId: input.tenantId,
    runId: input.runId,
    stageId: input.stageId ?? null,
    routeClass: input.routeDecision.routeClass,
    stageType: "media_submit",
    objective: input.objective,
    requestedProvider: input.provider ?? null,
    requestedModel: input.model ?? null,
    attempt: input.attempt ?? 1,
  });
}

function buildMediaTaskRequest(input: AutoTeamMediaExecutionInput, providerDecision: AutoTeamProviderDecision): Record<string, unknown> {
  return sanitizeProviderPayload({
    prompt: input.prompt,
    model: providerDecision.selectedModel,
    provider: providerDecision.selectedProvider,
    apiConfig: {
      provider: providerDecision.selectedProvider ?? undefined,
      model: providerDecision.selectedModel ?? undefined,
    },
    publicUrl: input.publicUrl ?? undefined,
    extraParams: input.extraParams ?? undefined,
    referenceImageUrls: input.referenceImageUrls ?? undefined,
    referenceVideoUrls: input.referenceVideoUrls ?? undefined,
  });
}

async function lookupExistingJob(
  tenantId: string,
  idempotencyKey: string,
): Promise<AutoTeamMediaJobRefRow | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db
    .select()
    .from(autoTeamMediaJobRefs)
    .where(and(eq(autoTeamMediaJobRefs.tenantId, tenantId), eq(autoTeamMediaJobRefs.idempotencyKey, idempotencyKey)))
    .orderBy(desc(autoTeamMediaJobRefs.createdAt))
    .limit(1);
  return existing ?? null;
}

export async function submitMediaJob(
  input: AutoTeamMediaExecutionInput,
): Promise<AutoTeamMediaJobRefRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const providerDecision = resolveProviderDecision(input);
  if (providerDecision.blockedReason) {
    throw new Error(providerDecision.blockedReason);
  }

  const budgetDecision = assertBudgetAllowsMediaJob(input);
  if (!budgetDecision.allowed) {
    throw new Error(budgetDecision.blockedReason ?? "budget_exceeded");
  }

  const idempotencyKey = buildMediaSubmitIdempotencyKey(input);
  const existing = await lookupExistingJob(input.tenantId, idempotencyKey);
  if (existing && !["succeeded", "failed", "cancelled", "expired"].includes(existing.providerStatus)) {
    return existing;
  }
  if (existing && existing.providerStatus === "succeeded") {
    return existing;
  }

  let reserved: AutoTeamMediaJobRefRow | null = null;
  if (existing && ["failed", "cancelled", "expired"].includes(existing.providerStatus)) {
    const [reclaimed] = await db
      .update(autoTeamMediaJobRefs)
      .set({
        providerTaskId: null,
        providerStatus: "queued",
        resultArtifactRefsJson: [],
        lastPolledAt: now(),
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        metadataJson: {
          routeClass: input.routeDecision.routeClass,
          reservationOnly: true,
          reclaimedTerminalJob: true,
          previousProviderStatus: existing.providerStatus,
          budgetDecision,
          providerDecision,
        },
        updatedAt: now(),
      })
      .where(
        and(
          eq(autoTeamMediaJobRefs.id, existing.id),
          inArray(autoTeamMediaJobRefs.providerStatus, ["failed", "cancelled", "expired"]),
        ),
      )
      .returning();
    reserved = reclaimed ?? null;
    if (!reserved) {
      const claimed = await lookupExistingJob(input.tenantId, idempotencyKey);
      if (claimed) return claimed;
      throw new AutoTeamMediaSubmitError(
        "media_job_reclaim_conflict",
        "media_job_reclaim_conflict",
        true,
      );
    }
  }

  if (!reserved) {
    const [insertedReservation] = await db.insert(autoTeamMediaJobRefs).values({
    tenantId: input.tenantId,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId,
    stageId: input.stageId ?? null,
    workItemId: input.workItemId ?? null,
    mediaType: input.mediaType,
    provider: providerDecision.selectedProvider ?? "unknown",
    model: providerDecision.selectedModel ?? "unknown",
    providerTaskId: null,
    providerStatus: "queued",
    submittedPromptArtifactRef: null,
    resultArtifactRefsJson: [],
    providerRequestHash: buildAutoTeamProviderRequestHash({
      tenantId: input.tenantId,
      runId: input.runId,
      stageId: input.stageId ?? null,
      routeClass: input.routeDecision.routeClass,
      provider: providerDecision.selectedProvider ?? "unknown",
      model: providerDecision.selectedModel ?? "unknown",
      prompt: input.prompt,
      attempt: input.attempt ?? 1,
    }),
    idempotencyKey,
    lastPolledAt: now(),
    completedAt: null,
    failedAt: null,
    errorCode: null,
    errorMessage: null,
    metadataJson: {
      routeClass: input.routeDecision.routeClass,
      reservationOnly: true,
      budgetDecision,
      providerDecision,
    },
    createdAt: now(),
    updatedAt: now(),
    }).onConflictDoNothing().returning();
    reserved = insertedReservation ?? null;
  }
  if (!reserved) {
    const claimed = await lookupExistingJob(input.tenantId, idempotencyKey);
    if (claimed) return claimed;
    throw new Error("media_job_reservation_failed");
  }

  let task: MediaTask;
  try {
    task = input.mediaType === "image"
      ? await mediaGenerationService.generateImageAsync(buildMediaTaskRequest(input, providerDecision) as any, input.userToken)
      : await mediaGenerationService.generateVideoAsync(buildMediaTaskRequest(input, providerDecision) as any, input.userToken);
  } catch (error) {
    const [failedReservation] = await db
      .update(autoTeamMediaJobRefs)
      .set({
        providerStatus: "failed",
        failedAt: now(),
        errorCode: "provider_submit_failed",
        errorMessage: sanitizeProviderError(error),
        updatedAt: now(),
      })
      .where(eq(autoTeamMediaJobRefs.id, reserved.id))
      .returning();
    throw new AutoTeamMediaSubmitError(
      (failedReservation ?? reserved).errorMessage ?? "provider_submit_failed",
      "provider_submit_failed",
      true,
    );
  }

  const status = task.status;
  const providerStatus = status === "completed" ? "succeeded" : status === "failed" ? "failed" : status === "pending" || status === "processing" ? "queued" : "unknown";
  const safety = validateAutoTeamMediaOutputSafety({
    routeClass: input.routeDecision.routeClass,
    providerResponse: task.resultUrl ?? null,
    metadata: task.resultData ?? null,
  });
  const safeResultUrl = safety.safe && task.resultUrl ? task.resultUrl : null;
  const effectiveProviderStatus =
    providerStatus === "succeeded" && !safety.safe ? "failed" : providerStatus;

  const [inserted] = await db
    .update(autoTeamMediaJobRefs)
    .set({
      providerTaskId: task.taskId ?? task.id ?? null,
      providerStatus: effectiveProviderStatus,
      lastPolledAt: now(),
      completedAt: effectiveProviderStatus === "succeeded" ? now() : null,
      failedAt: effectiveProviderStatus === "failed" ? now() : null,
      errorCode: safety.safe ? null : "unsafe_output_detected",
      errorMessage: !safety.safe
        ? sanitizeProviderError(safety.reason)
        : task.errorMessage
          ? sanitizeProviderError(task.errorMessage)
          : null,
      metadataJson: {
        routeClass: input.routeDecision.routeClass,
        safetyStatus: safety.status,
        budgetDecision,
        providerDecision,
      },
      updatedAt: now(),
    })
    .where(eq(autoTeamMediaJobRefs.id, reserved.id))
    .returning();
  if (!inserted) return reserved;

  let updatedJob = inserted;
  if (safeResultUrl) {
    const artifact = await buildCanonicalArtifactRef({
      tenantId: input.tenantId,
      teamId: input.teamId ?? null,
      roomId: input.roomId ?? null,
      runId: input.runId,
      stageId: input.stageId ?? null,
      workItemId: input.workItemId ?? null,
      artifactType: input.mediaType === "video" ? "media_result" : "media_result",
      artifactRole: "result",
      externalRef: safeResultUrl,
      contentHash: null,
      visibility: "tenant",
      retentionPolicyJson: { routeClass: input.routeDecision.routeClass, mediaType: input.mediaType },
      safetyStatus: safety.status,
      source: "auto_team_media_execution",
    });
    const [withArtifact] = await db
      .update(autoTeamMediaJobRefs)
      .set({
        resultArtifactRefsJson: [artifact.id],
        updatedAt: now(),
      })
      .where(eq(autoTeamMediaJobRefs.id, inserted.id))
      .returning();
    updatedJob = withArtifact ?? inserted;
  }

  return updatedJob;
}

export async function pollMediaJob(
  jobRef: Pick<AutoTeamMediaJobRefRow, "tenantId" | "id" | "provider" | "providerTaskId" | "providerStatus"> & { userToken: string },
): Promise<AutoTeamMediaJobRefRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (!jobRef.providerTaskId) {
    return (await db.select().from(autoTeamMediaJobRefs).where(eq(autoTeamMediaJobRefs.id, jobRef.id)).limit(1))[0];
  }

  const [currentJob] = await db
    .select()
    .from(autoTeamMediaJobRefs)
    .where(eq(autoTeamMediaJobRefs.id, jobRef.id))
    .limit(1);
  const task = await mediaGenerationService.getTask(jobRef.providerTaskId, jobRef.userToken, {
    source: "auto_team_media_execution",
  });
  const nextStatus =
    task.status === "completed" ? "succeeded" :
    task.status === "failed" ? "failed" :
    task.status === "cancelled" ? "cancelled" :
    task.status === "processing" ? "running" :
    "queued";
  const safety = validateAutoTeamMediaOutputSafety({
    routeClass: currentJob?.mediaType === "image" ? "media.image" : "media.video",
    providerResponse: task.resultUrl ?? null,
    metadata: task.resultData ?? null,
  });
  const safeResultUrl = safety.safe && task.resultUrl ? task.resultUrl : null;
  const effectiveNextStatus =
    nextStatus === "succeeded" && !safety.safe ? "failed" : nextStatus;
  const nextMetadataJson = {
    ...(currentJob?.metadataJson ?? {}),
    safetyStatus: safety.status,
    safetyReason: safety.reason,
  };

  let canonicalArtifactId: string | null = null;
  if (effectiveNextStatus === "succeeded" && safeResultUrl && currentJob) {
    const artifact = await buildCanonicalArtifactRef({
      tenantId: currentJob.tenantId,
      teamId: currentJob.teamId ?? null,
      roomId: currentJob.roomId ?? null,
      runId: currentJob.runId,
      stageId: currentJob.stageId ?? null,
      workItemId: currentJob.workItemId ?? null,
      artifactType: "media_result",
      artifactRole: "result",
      externalRef: safeResultUrl,
      contentHash: null,
      visibility: "tenant",
      retentionPolicyJson: {
        mediaType: currentJob.mediaType,
        provider: currentJob.provider,
        providerTaskId: currentJob.providerTaskId,
        source: "auto_team_media_poll",
      },
      safetyStatus: safety.status,
      source: "auto_team_media_execution",
    });
    canonicalArtifactId = artifact.id;
  }

  const [updated] = await db
    .update(autoTeamMediaJobRefs)
    .set({
      providerStatus: effectiveNextStatus,
      resultArtifactRefsJson: canonicalArtifactId ? [canonicalArtifactId] : [],
      lastPolledAt: now(),
      completedAt: effectiveNextStatus === "succeeded" ? now() : null,
      failedAt: effectiveNextStatus === "failed" ? now() : null,
      errorCode: !safety.safe ? "unsafe_output_detected" : null,
      errorMessage: !safety.safe
        ? sanitizeProviderError(safety.reason)
        : task.errorMessage
          ? sanitizeProviderError(task.errorMessage)
          : null,
      metadataJson: {
        ...nextMetadataJson,
        ...(canonicalArtifactId
          ? { resultRefsCanonicalizedAt: now().toISOString() }
          : {}),
      },
      updatedAt: now(),
    })
    .where(eq(autoTeamMediaJobRefs.id, jobRef.id))
    .returning();

  if (!updated) {
    throw new Error("media_job_update_failed");
  }
  return updated;
}

export async function attachMediaResult(
  input: { tenantId: string; jobId: string; artifactRefs: AutoTeamArtifactRefRow[] },
): Promise<AutoTeamMediaJobRefRow | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [updated] = await db
    .update(autoTeamMediaJobRefs)
    .set({
      resultArtifactRefsJson: input.artifactRefs.map((artifact) => artifact.id),
      providerStatus: "succeeded",
      completedAt: now(),
      updatedAt: now(),
    })
    .where(and(eq(autoTeamMediaJobRefs.id, input.jobId), eq(autoTeamMediaJobRefs.tenantId, input.tenantId)))
    .returning();
  return updated ?? null;
}

export async function executePromptStage(
  input: AutoTeamMediaExecutionInput,
): Promise<AutoTeamMediaExecutionResult> {
  const jobRef = await submitMediaJob(input);
  return {
    jobRef,
    artifactRefs: [],
    providerDecision: resolveProviderDecision(input),
    budgetDecision: assertBudgetAllowsMediaJob(input),
    task: null,
    safetyStatus: (jobRef.metadataJson?.safetyStatus as AutoTeamMediaExecutionResult["safetyStatus"]) ?? "unknown",
  };
}

export const executeStoryboardStage = executePromptStage;
export const executeResearchStage = executePromptStage;
export const executeMediaStage = executePromptStage;
