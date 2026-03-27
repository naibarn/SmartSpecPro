import crypto from "crypto";
import { z } from "zod";
import { getRedisClient } from "./redis";
import { signBearerToken, verifyBearerToken, verifyBearerTokenIgnoringExpiration } from "../_core/tokens";
import {
  applyHybridBlendMode,
  hybridOrchestrationExecutionSchema,
  hybridPlanPayloadSchema,
  hybridBlendModeSchema,
  type HybridBlendMode,
  type HybridExecutionHistoryEntry,
  type HybridOrchestrationExecution,
  type HybridPlanPayload,
  type HybridOrchestrationPlan,
} from "@shared/orchestration/hybridOrchestration";

const PREVIEW_KEY_PREFIX = "hybrid:preview:";
const EXECUTION_KEY_PREFIX = "hybrid:execution:";
const PREVIEW_TTL_SECONDS = 60 * 30;
const EXECUTION_TTL_SECONDS = 60 * 60 * 12;

const hybridPreviewTokenClaimsSchema = z.object({
  sub: z.string().min(1).max(64),
  tenantId: z.string().min(1).max(64),
  type: z.literal("hybrid_preview"),
  jti: z.string().min(1).max(128),
  exp: z.number().int().optional(),
  iat: z.number().int().optional(),
}).strict();

const hybridPreviewRecordSchema = z.object({
  previewId: z.string().min(1).max(128),
  token: z.string().min(1).max(2048),
  agencyId: z.string().min(1).max(128),
  tenantId: z.string().min(1).max(64),
  userId: z.number().int().positive(),
  sourceSurface: z.enum(["agency-browser", "agency-chat", "chat", "review-center", "legacy"]).default("legacy"),
  createdAt: z.string().min(1).max(64),
  expiresAt: z.string().min(1).max(64),
  payload: hybridPlanPayloadSchema,
}).strict();

const createExecutionInputSchema = z.object({
  previewToken: z.string().min(1).max(2048),
  blendMode: hybridBlendModeSchema.optional(),
}).strict();

const executionActionSchema = z.enum(["advance", "approve", "reject", "cancel"]);

type PreviewClaims = z.infer<typeof hybridPreviewTokenClaimsSchema>;
type PreviewRecord = z.infer<typeof hybridPreviewRecordSchema>;

function nowIso(): string {
  return new Date().toISOString();
}

function getPreviewKey(previewId: string): string {
  return `${PREVIEW_KEY_PREFIX}${previewId}`;
}

function getExecutionKey(executionId: string): string {
  return `${EXECUTION_KEY_PREFIX}${executionId}`;
}

async function redisSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

async function redisGetJson<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function buildHistoryEntry(action: string, note?: string | null, stageId?: string | null): HybridExecutionHistoryEntry {
  return {
    at: nowIso(),
    action,
    stageId: stageId ?? null,
    note: note ?? null,
  };
}

function createPreviewClaims(userId: number, tenantId: string, previewId: string): PreviewClaims {
  return {
    sub: String(userId),
    tenantId,
    type: "hybrid_preview",
    jti: previewId,
  };
}

function assertPreviewClaimsMatch(record: PreviewRecord, claims: PreviewClaims): void {
  if (record.userId !== Number(claims.sub) || record.tenantId !== claims.tenantId || record.previewId !== claims.jti) {
    throw new Error("Preview token ownership mismatch");
  }
}

function buildExecutionStageStates(plan: HybridOrchestrationPlan): HybridOrchestrationExecution["stageStates"] {
  return plan.stages.map((stage) => ({
    id: stage.id,
    status: "pending" as const,
    startedAt: null,
    completedAt: null,
    note: null,
  }));
}

function findStageIndex(plan: HybridOrchestrationPlan, predicate: (stage: HybridOrchestrationPlan["stages"][number]) => boolean): number {
  return plan.stages.findIndex(predicate);
}

function markStage(
  execution: HybridOrchestrationExecution,
  stageIndex: number,
  status: HybridOrchestrationExecution["stageStates"][number]["status"],
  note?: string | null,
): void {
  const stage = execution.stageStates[stageIndex];
  if (!stage) return;
  stage.status = status;
  stage.note = note ?? stage.note ?? null;
  const timestamp = nowIso();
  if (!stage.startedAt && (status === "running" || status === "completed" || status === "blocked")) {
    stage.startedAt = timestamp;
  }
  if (status === "completed" || status === "skipped") {
    stage.completedAt = timestamp;
  }
}

function hydrateExecution(record: unknown): HybridOrchestrationExecution {
  return hybridOrchestrationExecutionSchema.parse(record);
}

function cloneExecution(execution: HybridOrchestrationExecution): HybridOrchestrationExecution {
  return hydrateExecution(JSON.parse(JSON.stringify(execution)));
}

function deriveExecutionPlan(plan: HybridOrchestrationPlan, blendMode: HybridBlendMode): HybridOrchestrationPlan {
  return applyHybridBlendMode(plan, blendMode);
}

function buildStartExecutionState(params: {
  preview: PreviewRecord;
  blendMode: HybridBlendMode;
}): HybridOrchestrationExecution {
  const { preview, blendMode } = params;
  const plan = deriveExecutionPlan(preview.payload.plan, blendMode);
  const stageStates = buildExecutionStageStates(plan);
  const executionId = crypto.randomUUID();
  const approvalIndex = findStageIndex(plan, (stage) => stage.owner === "human");
  if (plan.requiresApproval && approvalIndex < 0) {
    throw new Error("Hybrid plan requires a human approval stage");
  }
  const executableBeforeApproval = approvalIndex >= 0 ? approvalIndex : plan.stages.length;
  const execution: HybridOrchestrationExecution = {
    executionId,
    previewToken: preview.token,
    tenantId: preview.tenantId,
    userId: preview.userId,
    agencyId: preview.agencyId,
    status: "running",
    blendMode,
    currentStageIndex: 0,
    currentStageId: plan.stages[0]?.id ?? null,
    plan,
    draft: preview.payload.draft,
    stageStates,
    history: [buildHistoryEntry("start", `Hybrid flow started in ${blendMode} mode`)],
    approvalDecision: null,
    revisionCount: 0,
    notes: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    expiresAt: preview.expiresAt,
  };

  for (let index = 0; index < executableBeforeApproval; index += 1) {
    markStage(execution, index, "completed", "Auto-advanced by hybrid start sequence");
  }

  if (approvalIndex >= 0) {
    if (plan.requiresApproval) {
      markStage(execution, approvalIndex, "running", "Awaiting human approval");
      execution.status = "awaiting_approval";
      execution.currentStageIndex = approvalIndex;
      execution.currentStageId = plan.stages[approvalIndex]?.id ?? null;
    } else {
      markStage(execution, approvalIndex, "skipped", "Human review skipped by mode");
    }
  }

  if (!plan.requiresApproval) {
    for (let index = approvalIndex >= 0 ? approvalIndex + 1 : executableBeforeApproval; index < plan.stages.length; index += 1) {
      markStage(execution, index, "completed", "Auto-committed by hybrid start sequence");
    }
    execution.status = "completed";
    execution.currentStageIndex = plan.stages.length - 1;
    execution.currentStageId = plan.stages.at(-1)?.id ?? null;
    execution.history.push(buildHistoryEntry("auto_commit", "Flow completed without manual approval"));
  }

  return hydrateExecution(execution);
}

function ensureAwaitingApproval(execution: HybridOrchestrationExecution): number {
  const approvalIndex = execution.plan.stages.findIndex((stage) => stage.owner === "human");
  if (approvalIndex < 0) {
    throw new Error("Hybrid execution does not include an approval stage");
  }
  if (execution.status !== "awaiting_approval") {
    throw new Error("Hybrid execution is not waiting for approval");
  }
  return approvalIndex;
}

function progressFromIndex(
  execution: HybridOrchestrationExecution,
  startIndex: number,
  allowHumanSkip = false,
): HybridOrchestrationExecution {
  const next = cloneExecution(execution);
  const plan = next.plan;

  for (let index = startIndex; index < plan.stages.length; index += 1) {
    const stage = plan.stages[index];
    const currentStage = next.stageStates[index];
    if (!stage || !currentStage) {
      continue;
    }

    if (stage.owner === "human") {
      if (allowHumanSkip && !plan.requiresApproval) {
        markStage(next, index, "skipped", "Human review skipped by mode");
        continue;
      }

      markStage(next, index, "running", "Waiting for approval");
      next.status = "awaiting_approval";
      next.currentStageIndex = index;
      next.currentStageId = stage.id;
      next.updatedAt = nowIso();
      return hydrateExecution(next);
    }

    markStage(next, index, "completed", "Processed by hybrid runtime");
  }

  next.status = "completed";
  next.currentStageIndex = plan.stages.length - 1;
  next.currentStageId = plan.stages.at(-1)?.id ?? null;
  next.updatedAt = nowIso();
  next.history.push(buildHistoryEntry("complete", "Hybrid execution finished"));
  return hydrateExecution(next);
}

function resetForRework(execution: HybridOrchestrationExecution): HybridOrchestrationExecution {
  const next = cloneExecution(execution);
  const swarmIndex = next.plan.stages.findIndex((stage) => stage.owner === "swarm");
  const restartIndex = swarmIndex >= 0 ? swarmIndex : 0;
  for (let index = restartIndex; index < next.stageStates.length; index += 1) {
    next.stageStates[index] = {
      ...next.stageStates[index],
      status: "pending",
      startedAt: null,
      completedAt: null,
      note: "Reset for rework",
    };
  }
  next.status = "running";
  next.approvalDecision = "rejected";
  next.revisionCount += 1;
  next.currentStageIndex = restartIndex;
  next.currentStageId = next.plan.stages[restartIndex]?.id ?? null;
  next.updatedAt = nowIso();
  next.history.push(buildHistoryEntry("rework", "Returned to swarm for revision", next.currentStageId));
  return hydrateExecution(next);
}

async function readPreviewRecord(previewToken: string): Promise<PreviewRecord | null> {
  const claims = await readPreviewClaims(previewToken, false);
  if (!claims) {
    return null;
  }

  const preview = await redisGetJson<PreviewRecord>(getPreviewKey(claims.jti));
  if (!preview) {
    return null;
  }

  try {
    const normalized = hybridPreviewRecordSchema.parse(preview);
    assertPreviewClaimsMatch(normalized, claims);
    return normalized;
  } catch {
    return null;
  }
}

async function readPreviewClaims(previewToken: string, ignoreExpiration: boolean): Promise<PreviewClaims | null> {
  try {
    const decoded = ignoreExpiration
      ? await verifyBearerTokenIgnoringExpiration(previewToken)
      : await verifyBearerToken(previewToken);
    const claims = hybridPreviewTokenClaimsSchema.parse(decoded);
    if (claims.type !== "hybrid_preview") {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

async function writePreviewRecord(record: PreviewRecord): Promise<void> {
  await redisSetJson(getPreviewKey(record.previewId), record, PREVIEW_TTL_SECONDS);
}

async function writeExecutionRecord(record: HybridOrchestrationExecution): Promise<void> {
  await redisSetJson(getExecutionKey(record.executionId), record, EXECUTION_TTL_SECONDS);
}

export async function createHybridPreviewToken(params: {
  agencyId: string;
  userId: number;
  tenantId: string;
  payload: HybridPlanPayload;
  sourceSurface?: PreviewRecord["sourceSurface"];
}): Promise<{ token: string; expiresAt: string }> {
  const payload = hybridPlanPayloadSchema.parse(params.payload);
  const previewId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000).toISOString();
  const claims = createPreviewClaims(params.userId, params.tenantId, previewId);
  const token = signBearerToken(claims, `${PREVIEW_TTL_SECONDS}s`);
  const record: PreviewRecord = {
    previewId,
    token,
    agencyId: params.agencyId,
    tenantId: params.tenantId,
    userId: params.userId,
    sourceSurface: params.sourceSurface ?? "legacy",
    createdAt: nowIso(),
    expiresAt,
    payload,
  };
  await writePreviewRecord(record);
  return { token, expiresAt };
}

export async function getHybridPreviewPayload(params: {
  token: string;
  userId: number;
  tenantId: string;
}): Promise<HybridPlanPayload | null> {
  const preview = await readPreviewRecord(params.token);
  if (!preview) {
    return null;
  }
  if (preview.userId !== params.userId || preview.tenantId !== params.tenantId) {
    return null;
  }
  return preview.payload;
}

export async function refreshHybridPreviewToken(params: {
  previewToken: string;
  userId: number;
  tenantId: string;
}): Promise<{ token: string; expiresAt: string }> {
  const claims = await readPreviewClaims(params.previewToken, true);
  if (!claims) {
    throw new Error("Hybrid preview token not found or invalid");
  }

  const preview = await redisGetJson<PreviewRecord>(getPreviewKey(claims.jti));
  if (!preview) {
    throw new Error("Hybrid preview token not found or expired");
  }
  if (preview.userId !== params.userId || preview.tenantId !== params.tenantId) {
    throw new Error("Hybrid preview token ownership mismatch");
  }

  const refreshedToken = signBearerToken({
    sub: String(preview.userId),
    tenantId: preview.tenantId,
    type: "hybrid_preview",
    jti: preview.previewId,
  }, `${PREVIEW_TTL_SECONDS}s`);
  const refreshedRecord: PreviewRecord = {
    ...preview,
    token: refreshedToken,
    expiresAt: new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000).toISOString(),
  };
  await writePreviewRecord(refreshedRecord);
  return { token: refreshedToken, expiresAt: refreshedRecord.expiresAt };
}

export async function startHybridExecution(params: {
  previewToken: string;
  userId: number;
  tenantId: string;
  blendMode?: HybridBlendMode;
}): Promise<HybridOrchestrationExecution> {
  const preview = await readPreviewRecord(params.previewToken);
  if (!preview) {
    throw new Error("Hybrid preview token not found or expired");
  }
  if (preview.userId !== params.userId || preview.tenantId !== params.tenantId) {
    throw new Error("Hybrid preview token ownership mismatch");
  }

  const execution = buildStartExecutionState({
    preview,
    blendMode: params.blendMode ?? preview.payload.plan.blendMode,
  });
  await writeExecutionRecord(execution);
  return execution;
}

export async function getHybridExecution(params: {
  executionId: string;
  userId: number;
  tenantId: string;
}): Promise<HybridOrchestrationExecution | null> {
  const execution = await redisGetJson<HybridOrchestrationExecution>(getExecutionKey(params.executionId));
  if (!execution) {
    return null;
  }
  try {
    const normalized = hybridOrchestrationExecutionSchema.parse(execution);
    if (normalized.userId !== params.userId || normalized.tenantId !== params.tenantId) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

export async function advanceHybridExecution(params: {
  executionId: string;
  userId: number;
  tenantId: string;
  action: z.infer<typeof executionActionSchema>;
  note?: string | null;
}): Promise<HybridOrchestrationExecution> {
  const execution = await getHybridExecution({
    executionId: params.executionId,
    userId: params.userId,
    tenantId: params.tenantId,
  });
  if (!execution) {
    throw new Error("Hybrid execution not found");
  }

  let next = cloneExecution(execution);
  switch (params.action) {
    case "cancel":
      next.status = "cancelled";
      next.updatedAt = nowIso();
      next.notes = params.note ?? next.notes ?? null;
      next.history.push(buildHistoryEntry("cancel", params.note ?? "cancelled_by_user", next.currentStageId));
      break;

    case "reject":
      if (next.status !== "awaiting_approval") {
        throw new Error("Hybrid execution is not waiting for approval");
      }
      next = resetForRework(next);
      next.notes = params.note ?? next.notes ?? null;
      break;

    case "approve": {
      const approvalIndex = ensureAwaitingApproval(next);
      markStage(next, approvalIndex, "completed", params.note ?? "Approved by human reviewer");
      next.approvalDecision = "approved";
      next.status = "running";
      next.currentStageIndex = approvalIndex + 1;
      next.currentStageId = next.plan.stages[approvalIndex + 1]?.id ?? null;
      next.history.push(buildHistoryEntry("approve", params.note ?? "approved", next.plan.stages[approvalIndex]?.id));
      next = progressFromIndex(next, approvalIndex + 1);
      break;
    }

    case "advance":
      if (next.status === "awaiting_approval") {
        const approvalIndex = ensureAwaitingApproval(next);
        markStage(next, approvalIndex, "completed", params.note ?? "Advanced by reviewer");
        next.currentStageIndex = approvalIndex + 1;
        next.currentStageId = next.plan.stages[approvalIndex + 1]?.id ?? null;
        next.status = "running";
        next.history.push(buildHistoryEntry("advance", params.note ?? "advanced", next.plan.stages[approvalIndex]?.id));
        next = progressFromIndex(next, approvalIndex + 1);
      } else {
        next = progressFromIndex(next, next.currentStageIndex + 1);
      }
      break;
  }

  next.updatedAt = nowIso();
  const parsed = hybridOrchestrationExecutionSchema.parse(next);
  await writeExecutionRecord(parsed);
  return parsed;
}

export const hybridExecutionActionSchema = executionActionSchema;
