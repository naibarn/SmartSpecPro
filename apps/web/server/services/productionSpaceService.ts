import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { mediaProductionRuns, mediaProductionSpaces } from "../../drizzle/schema";
import { deductCredits, refundCredits } from "./creditService";
import { mediaGenerationService, type MediaTask } from "./mediaGenerationService";
import {
  applyProductionApprovalInvalidation,
  applyProductionLayerVersionChange,
  buildProductionStableHash,
  computeProductionSpaceReadiness,
  deriveProductionHandoffPayload,
  getProductionNodeCatalogEntry,
  getProductionLayerVersions,
  getDefaultProductionMetrics,
  resolveProductionFeatureGates,
  validateProductionExecutableNodeAgainstCatalog,
  validateProductionNodeConfigSnapshotAgainstCatalog,
  validateProductionRunTransition,
  validateProductionSpace,
  type ProductStoryboardAsset,
  type ProductionEvidenceStatus,
  type ProductionActionAttempt,
  type ProductionAccessLevel,
  type ProductionAuditEvent,
  type ProductionConflictPayload,
  type ProductionExecutionScope,
  type ProductionGoal,
  type ProductionNodeConfigSnapshot,
  type ProductionNodeOutputRef,
  type ProductionDownstreamResultImport,
  type ProductionDownstreamResultRecord,
  type ProductionShot,
  type ProductionShotProductUse,
  type ProductionSpace,
  type ProductionRunStatus,
} from "../../shared/mediaProduction";
import { adaptLegacyRunToProductionSpace } from "./productionLegacyCompatibilityService";

type Db = any;
type ProductionSpaceSource = "space" | "legacy";
type ProductionPermission = "read" | "write" | "approve" | "execute";
type ProductionSpaceLifecycleResult = {
  space: ProductionSpace;
  version: number;
  source: ProductionSpaceSource;
  archivedAt: string | null;
  deletedAt: string | null;
};

export function isProductionSpaceStorageUnavailable(error: unknown): boolean {
  const raw = error as { code?: string; cause?: { code?: string; message?: string }; message?: string };
  const code = raw?.code ?? raw?.cause?.code;
  const message = `${raw?.message ?? ""} ${raw?.cause?.message ?? ""}`.toLowerCase();
  const isProductionStorageQuery = [
    "media_production_runs",
    "media_production_spaces",
  ].some((table) => message.includes(table));
  if (!isProductionStorageQuery) return false;
  return (
    code === "42P01"
    || code === "42703"
    || message.includes("does not exist")
    || message.includes("failed query")
    || message.includes("column")
    || message.includes("relation")
  );
}
type ProductionCreditLedger = {
  reserve(input: {
    userId: number;
    tenantId: string;
    amount: number;
    idempotencyKey: string;
    attemptId: string;
    productionRunId: string;
    scope: ProductionExecutionScope;
  }): Promise<unknown>;
  refund(input: {
    userId: number;
    amount: number;
    idempotencyKey: string;
    attemptId: string;
    productionRunId: string;
    reason: string;
  }): Promise<unknown>;
  verify?(input: {
    userId: number;
    tenantId: string;
    attempt: ProductionActionAttempt;
    productionRunId: string;
  }): Promise<{
    ok: boolean;
    reserved?: number;
    spent?: number;
    refunded?: number;
    mismatchAmount?: number;
    reason?: string;
  }>;
};
type ProductionMediaDispatcher = {
  dispatchNode(input: {
    node: ProductionSpace["flowNodes"][number];
    space: ProductionSpace;
    attempt: ProductionActionAttempt;
    userId: number;
    userToken: string;
    publicUrl?: string;
  }): Promise<MediaTask>;
  getTask?(input: { mediaTaskId: string; userToken: string }): Promise<MediaTask>;
  cancelTask?(input: { mediaTaskId: string; userToken: string }): Promise<MediaTask>;
};
type ProductionExecutionReconciliationAlert = {
  code: "provider_callback_missing" | "credit_ledger_mismatch" | "production_state_transition_blocked";
  severity: "warning" | "critical";
  productionRunId: string;
  attemptId?: string;
  message: string;
  details?: Record<string, unknown>;
};

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildProductionConflictPayload(input: {
  productionRunId: string;
  reason: ProductionConflictPayload["reason"];
  expected: ProductionConflictPayload["expected"];
  current: ProductionConflictPayload["current"];
  changedFields?: string[];
  currentSpace?: ProductionSpace | null;
  source?: ProductionSpaceSource;
  archivedAt?: string | null;
  deletedAt?: string | null;
  canAutoMergeLayout?: boolean;
}): ProductionConflictPayload {
  return {
    schemaVersion: "production_conflict_v1",
    reason: input.reason,
    productionRunId: input.productionRunId,
    expected: input.expected,
    current: input.current,
    changedFields: input.changedFields ?? [],
    safePreview: {
      status: input.currentSpace?.status ?? "goal_draft",
      title: input.currentSpace?.brief?.title,
      updatedAt: input.currentSpace?.updatedAt,
      source: input.source,
      archived: Boolean(input.archivedAt),
      deleted: Boolean(input.deletedAt),
      canReloadLatest: true,
      canSaveAsNewVersion: !input.deletedAt,
      canAutoMergeLayout: Boolean(input.canAutoMergeLayout),
    },
  };
}

function throwProductionConflict(payload: ProductionConflictPayload): never {
  throw new TRPCError({ code: "CONFLICT", message: payload.reason, cause: payload });
}

function conflict(input?: Partial<Parameters<typeof buildProductionConflictPayload>[0]> & {
  productionRunId?: string;
  currentSpace?: ProductionSpace | null;
}): never {
  throwProductionConflict(buildProductionConflictPayload({
    productionRunId: input?.productionRunId ?? input?.currentSpace?.productionRunId ?? "unknown",
    reason: input?.reason ?? "space_version_stale",
    expected: input?.expected ?? {},
    current: input?.current ?? {},
    changedFields: input?.changedFields,
    currentSpace: input?.currentSpace,
    source: input?.source,
    archivedAt: input?.archivedAt,
    deletedAt: input?.deletedAt,
    canAutoMergeLayout: input?.canAutoMergeLayout,
  }));
}

function assertProductionLifecycleAllowsAction(current: ProductionSpaceLifecycleResult | null, action: "read" | "write" | "execute" | "handoff" | "export" | "restore" | "repair") {
  if (!current) return;
  if (current.deletedAt && action !== "read" && action !== "restore") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "production_space_deleted" });
  }
  if (current.archivedAt && !["read", "export", "restore"].includes(action)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "production_space_archived_read_only" });
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeAuditPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/secret|token|providerPayload|raw|prompt|ocr|comment|url/i.test(key) || key === "id" || /(?:^|[A-Z])(id|ids)$/i.test(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }
    if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => (
        item && typeof item === "object" ? sanitizeAuditPayload(item as Record<string, unknown>) : item
      ));
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditPayload(value as Record<string, unknown>);
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function permissionRank(level: ProductionAccessLevel): number {
  return { read: 1, write: 2, approve: 3, execute: 4, owner: 5 }[level] ?? 0;
}

function requiredPermissionRank(permission: ProductionPermission): number {
  return { read: 1, write: 2, approve: 3, execute: 4 }[permission];
}

function resolveProductionAccessLevel(run: any, space: ProductionSpace | null, userId: number): ProductionAccessLevel | null {
  const runOwnerId = Number(run?.userId ?? space?.accessPolicy?.ownerUserId ?? NaN);
  if (Number.isFinite(runOwnerId) && runOwnerId === userId) return "owner";
  const candidates = [
    ...((space?.accessPolicy?.collaborators ?? []) as any[]),
    ...(((run?.goal as any)?.productionAccess?.collaborators ?? []) as any[]),
    ...(((run?.goal as any)?.collaborators ?? []) as any[]),
  ];
  let best: ProductionAccessLevel | null = null;
  for (const candidate of candidates) {
    if (Number(candidate?.userId) !== userId) continue;
    const level = String(candidate.level ?? candidate.permission ?? "read") as ProductionAccessLevel;
    if (!best || permissionRank(level) > permissionRank(best)) best = level;
    if (candidate.canExecute && permissionRank(best) < permissionRank("execute")) best = "execute";
    if (candidate.canApprove && permissionRank(best) < permissionRank("approve")) best = "approve";
  }
  return best;
}

function assertProductionAccess(params: {
  run: any;
  space: ProductionSpace | null;
  userId: number;
  required: ProductionPermission;
}): ProductionAccessLevel {
  const level = resolveProductionAccessLevel(params.run, params.space, params.userId);
  if (!level || permissionRank(level) < requiredPermissionRank(params.required)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "production_space_permission_denied" });
  }
  return level;
}

function appendAuditEvent(space: ProductionSpace, action: string, payload: Record<string, unknown>, actorUserId?: number): ProductionAuditEvent[] {
  const at = nowIso();
  return [
    ...(space.auditEvents ?? []),
    {
      eventId: `${space.productionRunId}:${action}:${at}:${space.auditEvents?.length ?? 0}`,
      action,
      actorUserId,
      at,
      redactedPayload: sanitizeAuditPayload(payload),
    },
  ].slice(-200);
}

function ensureMetrics(space: ProductionSpace) {
  return { ...getDefaultProductionMetrics(), ...(space.metrics ?? {}) };
}

function assertProductionStatusTransition(current: ProductionRunStatus, next: ProductionRunStatus): void {
  const transition = validateProductionRunTransition(current, next);
  if (!transition.ok) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: transition.reasonCode ?? "production_state_invalid_transition",
    });
  }
}

function applyProductionStatusTransition(
  current: ProductionRunStatus,
  next: ProductionRunStatus,
  alerts: ProductionExecutionReconciliationAlert[],
  productionRunId: string,
  attemptId?: string,
): ProductionRunStatus {
  const transition = validateProductionRunTransition(current, next);
  if (transition.ok) return next;
  alerts.push({
    code: "production_state_transition_blocked",
    severity: "critical",
    productionRunId,
    attemptId,
    message: transition.reasonCode ?? "production_state_invalid_transition",
    details: { current, next },
  });
  return current;
}

function getScopedNodeIds(space: ProductionSpace, scope: ProductionExecutionScope, targetId?: string): { nodeIds: string[]; shotIds: string[] } {
  if (scope === "node") {
    if (!targetId || !space.flowNodes.some((node) => node.id === targetId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Production node not found" });
    }
    const shot = space.shots.find((item) => item.nodeIds.includes(targetId));
    return { nodeIds: [targetId], shotIds: shot ? [shot.id] : [] };
  }
  if (scope === "shot") {
    const shot = space.shots.find((item) => item.id === targetId);
    if (!shot) throw new TRPCError({ code: "NOT_FOUND", message: "Production shot not found" });
    const executableNodeIds = shot.nodeIds.filter((nodeId) => {
      const node = space.flowNodes.find((item) => item.id === nodeId);
      const catalogEntry = node ? getProductionNodeCatalogEntry(node.kind) : null;
      return Boolean(node?.configSnapshot && catalogEntry?.adapterStatus === "mvp_enabled");
    });
    return { nodeIds: executableNodeIds, shotIds: [shot.id] };
  }
  const executableNodeIds = space.flowNodes
    .filter((node) => {
      const catalogEntry = getProductionNodeCatalogEntry(node.kind);
      return Boolean(node.configSnapshot && catalogEntry?.adapterStatus === "mvp_enabled");
    })
    .map((node) => node.id);
  const executableNodeSet = new Set(executableNodeIds);
  return {
    nodeIds: executableNodeIds,
    shotIds: space.shots.filter((shot) => shot.nodeIds.some((nodeId) => executableNodeSet.has(nodeId))).map((shot) => shot.id),
  };
}

function hasUsableProductionNodeOutput(node: ProductionSpace["flowNodes"][number]): boolean {
  return (node.outputRefs ?? []).some((ref) => Boolean(ref.url || ref.storageKey || ref.libraryItemId || ref.mediaTaskId || ref.mediaId || ref.providerTaskId));
}

function orderProductionNodeIdsByDependencies(space: ProductionSpace, nodeIds: string[]): string[] {
  const selected = new Set(nodeIds);
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const nodeId of nodeIds) {
    incoming.set(nodeId, new Set());
    outgoing.set(nodeId, new Set());
  }
  for (const edge of space.flowEdges) {
    if (!selected.has(edge.source) || !selected.has(edge.target)) continue;
    if (edge.kind && ["fallback_to"].includes(edge.kind)) continue;
    outgoing.get(edge.source)?.add(edge.target);
    incoming.get(edge.target)?.add(edge.source);
  }
  const nodeOrder = new Map(space.flowNodes.map((node, index) => [node.id, index]));
  const ready = nodeIds
    .filter((nodeId) => (incoming.get(nodeId)?.size ?? 0) === 0)
    .sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
  const ordered: string[] = [];
  while (ready.length) {
    const nodeId = ready.shift()!;
    ordered.push(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      const remainingIncoming = incoming.get(target);
      remainingIncoming?.delete(nodeId);
      if (remainingIncoming && remainingIncoming.size === 0) {
        ready.push(target);
        ready.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
      }
    }
  }
  const orderedSet = new Set(ordered);
  return [
    ...ordered,
    ...nodeIds.filter((nodeId) => !orderedSet.has(nodeId)),
  ];
}

function getExecutableProductionNodeIds(space: ProductionSpace, scope: ProductionExecutionScope, nodeIds: string[], retryOfAttemptId?: string): string[] {
  if (scope === "node") {
    return orderProductionNodeIdsByDependencies(space, nodeIds);
  }
  const retryAttempt = retryOfAttemptId
    ? (space.actionAttempts ?? []).find((attempt) => attempt.attemptId === retryOfAttemptId)
    : null;
  const retryNodeIds = new Set(retryAttempt?.nodeIds ?? nodeIds);
  const executable = nodeIds.filter((nodeId) => {
    const node = space.flowNodes.find((item) => item.id === nodeId);
    if (!node || !retryNodeIds.has(node.id)) return false;
    const catalogEntry = getProductionNodeCatalogEntry(node.kind);
    if (!node.configSnapshot || catalogEntry?.adapterStatus !== "mvp_enabled") return false;
    if (node.status === "completed" && hasUsableProductionNodeOutput(node)) return false;
    return true;
  });
  return orderProductionNodeIdsByDependencies(space, executable);
}

function getExecutionGateKey(scope: ProductionExecutionScope): keyof ReturnType<typeof resolveProductionFeatureGates> {
  if (scope === "node") return "runOneNode";
  if (scope === "shot") return "runOneShot";
  return "batchExecution";
}

function countAttempts(space: ProductionSpace, scope: ProductionExecutionScope, targetId?: string): number {
  return (space.actionAttempts ?? []).filter((attempt) =>
    attempt.scope === scope
    && (targetId ? attempt.nodeIds.includes(targetId) || attempt.shotIds.includes(targetId) : attempt.scope === "batch")
  ).length;
}

function assertProductClaimsAreValid(space: ProductionSpace, use: ProductionShotProductUse): void {
  const products = space.productEvidenceManifest?.products ?? [];
  const selectedProducts = products.filter((product) => use.productStoryboardAssetIds.includes(product.id));
  const productIds = new Set(products.map((product) => product.id));
  for (const assetId of use.productStoryboardAssetIds) {
    if (!productIds.has(assetId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "product_storyboard_asset_not_found" });
    }
  }
  const claimIds = new Set(selectedProducts.flatMap((product) => product.claimEvidence.map((claim) => claim.claimId)));
  const evidenceIds = new Set(selectedProducts.flatMap((product) => product.claimEvidence.flatMap((claim) => claim.evidenceIds)));
  for (const claimId of use.claimIds) {
    if (!claimIds.has(claimId) || evidenceIds.has(claimId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "invalid_product_claim_id" });
    }
  }
  for (const evidenceId of use.evidenceIds) {
    if (!evidenceIds.has(evidenceId) || claimIds.has(evidenceId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "invalid_product_evidence_id" });
    }
  }
}

function sanitizeProductStoryboardAssetPatch(params: {
  action: "update_role" | "link_claim" | "link_evidence" | "relink_image" | "request_more_evidence";
  patch: Partial<ProductStoryboardAsset>;
  current: ProductStoryboardAsset;
}): Partial<ProductStoryboardAsset> {
  const patch = params.patch;
  if (params.action === "update_role") {
    return {
      role: patch.role,
      frameStrategy: patch.frameStrategy,
      requiredVisualAccuracy: patch.requiredVisualAccuracy,
    };
  }
  if (params.action === "link_claim" || params.action === "link_evidence") {
    const currentClaimIds = new Set(params.current.claimEvidence.map((claim) => claim.claimId));
    const currentEvidenceIds = new Set(params.current.claimEvidence.flatMap((claim) => claim.evidenceIds));
    const nextClaims = Array.isArray(patch.claimEvidence) ? patch.claimEvidence : params.current.claimEvidence;
    return {
      claimEvidence: nextClaims.map((claim) => {
        if (!currentClaimIds.has(claim.claimId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "invalid_product_claim_id" });
        }
        for (const evidenceId of claim.evidenceIds) {
          if (!currentEvidenceIds.has(evidenceId) || currentClaimIds.has(evidenceId)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "invalid_product_evidence_id" });
          }
        }
        return {
          claimId: claim.claimId,
          evidenceIds: claim.evidenceIds,
          status: claim.status,
          riskLevel: claim.riskLevel,
        };
      }),
      approvalState: nextClaims.some((claim) => claim.status === "blocked") ? "blocked" : params.current.approvalState,
    };
  }
  if (params.action === "relink_image") {
    return {
      imageUrl: patch.imageUrl,
      provenance: patch.provenance,
    };
  }
  return {};
}

function resolveServerExecutionGates(space: ProductionSpace): ReturnType<typeof resolveProductionFeatureGates> {
  const spaceGates = resolveProductionFeatureGates(space.featureFlags);
  const envEnabled = (name: string) => process.env[name] === "true";
  if (spaceGates.emergencyKill) return spaceGates;
  return {
    ...spaceGates,
    livePlanner: envEnabled("FEATURE116_LIVE_PLANNER_ENABLED"),
    liveVerifier: envEnabled("FEATURE116_LIVE_VERIFIER_ENABLED"),
    storyboardReviewHandoff: envEnabled("FEATURE116_STORYBOARD_HANDOFF_ENABLED"),
    videoEditHandoff: envEnabled("FEATURE116_VIDEO_EDIT_HANDOFF_ENABLED"),
    runOneNode: envEnabled("FEATURE116_RUN_ONE_NODE_ENABLED"),
    runOneShot: envEnabled("FEATURE116_RUN_ONE_NODE_ENABLED") && envEnabled("FEATURE116_RUN_ONE_SHOT_ENABLED"),
    batchExecution: envEnabled("FEATURE116_RUN_ONE_NODE_ENABLED") && envEnabled("FEATURE116_RUN_ONE_SHOT_ENABLED") && envEnabled("FEATURE116_BATCH_EXECUTION_ENABLED"),
  };
}

function normalizeCreditEstimate(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

function isProviderDispatchEnabled(): boolean {
  return process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED === "true";
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function positiveNumber(value: unknown, fallback?: number): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function buildOutputRefFromMediaTask(nodeId: string, task: MediaTask): ProductionNodeOutputRef {
  const kind = task.mediaType === "audio" ? "audio" : task.mediaType === "image" ? "image" : "video";
  return {
    outputRefId: `out-${nodeId}-${task.id}`,
    nodeId,
    kind,
    url: task.resultUrl,
    mediaTaskId: task.id,
    providerTaskId: task.taskId,
    generatedAt: task.completedAt ?? task.startedAt ?? task.createdAt ?? nowIso(),
    metadata: {
      status: task.status,
      model: task.model,
      celeryTaskId: task.celeryTaskId,
    },
  };
}

const defaultCreditLedger: ProductionCreditLedger = {
  async reserve(input) {
    if (input.amount <= 0) return null;
    return deductCredits({
      userId: input.userId,
      amount: input.amount,
      tenantId: input.tenantId,
      description: `Production Director ${input.scope} execution reserved`,
      idempotencyKey: `production-reserve:${input.idempotencyKey}`,
      sourceType: "media_video" as any,
      metadata: {
        productionRunId: input.productionRunId,
        actionAttemptId: input.attemptId,
        scope: input.scope,
        type: "reservation",
      },
    });
  },
  async refund(input) {
    if (input.amount <= 0) return null;
    return refundCredits({
      userId: input.userId,
      amount: input.amount,
      description: `Refund: Production Director execution ${input.reason}`,
      idempotencyKey: `production-refund:${input.idempotencyKey}`,
      sourceType: "media_video" as any,
      metadata: {
        productionRunId: input.productionRunId,
        actionAttemptId: input.attemptId,
        reason: input.reason,
      },
    });
  },
};

const defaultMediaDispatcher: ProductionMediaDispatcher = {
  async dispatchNode(input) {
    const config = input.node.configSnapshot?.config ?? {};
    const model = firstString(config.model, config.modelId, config.providerModelId);
    const apiConfig = (config.apiConfig && typeof config.apiConfig === "object" && !Array.isArray(config.apiConfig))
      ? config.apiConfig as Record<string, string>
      : undefined;
    const extraParams = (config.extraParams && typeof config.extraParams === "object" && !Array.isArray(config.extraParams))
      ? config.extraParams as Record<string, unknown>
      : {};
    const auditContext = {
      userId: input.userId,
      traceId: input.attempt.attemptId,
      source: "trpc.mediaProduction.runExecution",
      stage: "production-dispatch",
    };
    const commonExtraParams = {
      ...extraParams,
      __origin_surface: "production_director",
      __production_run_id: input.space.productionRunId,
      __production_space_version: input.space.version,
      __production_node_id: input.node.id,
      __production_node_version: input.node.configSnapshot?.version,
      __production_config_snapshot_id: input.node.configSnapshot?.snapshotId,
      __production_action_attempt_id: input.attempt.attemptId,
      __production_idempotency_key: input.attempt.idempotencyKey,
    };
    if (input.node.configSnapshot?.adapter === "image") {
      return mediaGenerationService.generateImageAsync({
        prompt: firstString(config.prompt, config.description, input.node.title) ?? input.node.title,
        model,
        size: firstString(config.size),
        aspectRatio: firstString(config.aspectRatio, config.aspect_ratio),
        negativePrompt: firstString(config.negativePrompt, config.negative_prompt),
        numImages: positiveNumber(config.numImages, 1),
        resolution: firstString(config.resolution),
        outputFormat: firstString(config.outputFormat, config.output_format),
        referenceImageUrls: Array.isArray(config.referenceImageUrls) ? config.referenceImageUrls as string[] : undefined,
        apiConfig,
        extraParams: commonExtraParams,
        publicUrl: input.publicUrl,
        auditContext,
      }, input.userToken);
    }
    if (input.node.configSnapshot?.adapter === "tts" || input.node.kind === "tts" || input.node.kind === "voice") {
      return mediaGenerationService.generateAudioAsync({
        text: firstString(config.text, config.script, config.prompt, input.node.title) ?? input.node.title,
        model,
        voice: firstString(config.voice),
        speed: positiveNumber(config.speed),
        apiConfig,
        extraParams: commonExtraParams,
        publicUrl: input.publicUrl,
        auditContext,
      }, input.userToken);
    }
    return mediaGenerationService.generateVideoAsync({
      prompt: firstString(config.prompt, config.description, input.node.title) ?? input.node.title,
      model,
      duration: positiveNumber(config.duration, positiveNumber(config.durationSeconds)),
      aspectRatio: firstString(config.aspectRatio, config.aspect_ratio),
      fps: positiveNumber(config.fps),
      resolution: firstString(config.resolution),
      referenceImageUrls: Array.isArray(config.referenceImageUrls) ? config.referenceImageUrls as string[] : undefined,
      referenceVideoUrls: Array.isArray(config.referenceVideoUrls) ? config.referenceVideoUrls as string[] : undefined,
      referenceVideoUrl: firstString(config.referenceVideoUrl),
      apiConfig,
      extraParams: commonExtraParams,
      publicUrl: input.publicUrl,
      auditContext,
    }, input.userToken);
  },
  async getTask(input) {
    return mediaGenerationService.getTask(input.mediaTaskId, input.userToken, {
      traceId: `production-reconcile:${input.mediaTaskId}`,
      source: "trpc.mediaProduction.reconcileExecution",
      stage: "status",
    });
  },
  async cancelTask(input) {
    return mediaGenerationService.cancelTask(input.mediaTaskId, input.userToken);
  },
};

function sanitizeClientWritableProductionSpace(input: ProductionSpace, previous?: ProductionSpace): ProductionSpace {
  const needsReview: ProductionEvidenceStatus = "needs_review";
  const blocked: ProductionEvidenceStatus = "blocked";
  const previousProducts = new Map((previous?.productEvidenceManifest?.products ?? []).map((product) => [product.id, product]));
  const productEvidenceManifest = input.productEvidenceManifest
    ? {
        ...input.productEvidenceManifest,
        products: input.productEvidenceManifest.products.map((product) => {
          const previousProduct = previousProducts.get(product.id);
          if (!previousProduct) {
            return {
              ...product,
              approvalState: product.approvalState === "blocked" ? blocked : needsReview,
              claimEvidence: product.claimEvidence.map((claim) => ({
                ...claim,
                status: claim.status === "blocked" ? blocked : needsReview,
              })),
            };
          }
          return {
            ...product,
            approvalState: previousProduct.approvalState,
            claimEvidence: product.claimEvidence.map((claim) => {
              const previousClaim = previousProduct.claimEvidence.find((item) => item.claimId === claim.claimId);
              return previousClaim
                ? {
                    ...claim,
                    evidenceIds: previousClaim.evidenceIds,
                    status: previousClaim.status,
                    riskLevel: previousClaim.riskLevel,
                  }
                : {
                    ...claim,
                    status: claim.status === "blocked" ? blocked : needsReview,
                  };
            }),
          };
        }),
      }
    : input.productEvidenceManifest;
  return {
    ...input,
    productEvidenceManifest,
    featureFlags: previous?.featureFlags,
    accessPolicy: previous?.accessPolicy,
    actionAttempts: previous?.actionAttempts,
    auditEvents: previous?.auditEvents,
    metrics: previous?.metrics,
    downstreamResultRecords: previous?.downstreamResultRecords,
  };
}

async function getLatestSpaceRow(db: Db, tenantId: string, productionRunId: string) {
  const [space] = await db
    .select()
    .from(mediaProductionSpaces)
    .where(and(
      eq(mediaProductionSpaces.tenantId, tenantId),
      eq(mediaProductionSpaces.productionRunId, productionRunId),
    ))
    .orderBy(desc(mediaProductionSpaces.version))
    .limit(1);
  return space;
}

async function getRun(db: Db, tenantId: string, productionRunId: string) {
  try {
    const [run] = await db
      .select({
        id: mediaProductionRuns.id,
        tenantId: mediaProductionRuns.tenantId,
        userId: mediaProductionRuns.userId,
        productionRunId: mediaProductionRuns.productionRunId,
        status: mediaProductionRuns.status,
        goal: mediaProductionRuns.goal,
        productionBible: mediaProductionRuns.productionBible,
        assetPlan: mediaProductionRuns.assetPlan,
        createdAt: mediaProductionRuns.createdAt,
        updatedAt: mediaProductionRuns.updatedAt,
      })
      .from(mediaProductionRuns)
      .where(and(
        eq(mediaProductionRuns.tenantId, tenantId),
        eq(mediaProductionRuns.productionRunId, productionRunId),
      ))
      .limit(1);
    return run;
  } catch (error) {
    if (!isProductionSpaceStorageUnavailable(error)) throw error;
    return undefined;
  }
}

async function loadProductionAccessContext(db: Db, tenantId: string, productionRunId: string) {
  const run = await getRun(db, tenantId, productionRunId);
  let latest;
  try {
    latest = await getLatestSpaceRow(db, tenantId, productionRunId);
  } catch (error) {
    if (!isProductionSpaceStorageUnavailable(error)) throw error;
  }
  return { run, latest };
}

async function assertProductionRunAccess(
  db: Db,
  tenantId: string,
  userId: number,
  productionRunId: string,
  required: ProductionPermission,
) {
  const { run, latest } = await loadProductionAccessContext(db, tenantId, productionRunId);
  if (!run && !latest) return { run, latest, level: "owner" as ProductionAccessLevel };
  if (!run && latest && Number(latest.userId) === userId) {
    return { run, latest, level: "owner" as ProductionAccessLevel };
  }
  const level = assertProductionAccess({
    run,
    space: latest?.space as ProductionSpace | null,
    userId,
    required,
  });
  return { run, latest, level };
}

export async function getProductionSpace(params: {
  db: Db;
  tenantId: string;
  userId: number;
  productionRunId: string;
}): Promise<ProductionSpaceLifecycleResult | null> {
  const access = await assertProductionRunAccess(params.db, params.tenantId, params.userId, params.productionRunId, "read");
  const latest = access.latest;
  if (latest) {
    return {
      space: latest.space as ProductionSpace,
      version: Number(latest.version),
      source: "space",
      archivedAt: toIsoOrNull(latest.archivedAt),
      deletedAt: toIsoOrNull(latest.deletedAt),
    };
  }
  const run = access.run;
  if (!run) return null;
  const space = adaptLegacyRunToProductionSpace({
    productionRunId: run.productionRunId,
    version: Math.max(1, Number(run.planVersion ?? run.goalVersion ?? 1)),
    status: run.status,
    goal: run.goal,
    productionBible: run.productionBible,
    assetPlan: run.assetPlan,
    updatedAt: run.updatedAt,
  });
  return { space, version: space.version, source: "legacy", archivedAt: null, deletedAt: null };
}

export async function saveProductionSpace(params: {
  db: Db;
  tenantId: string;
  userId: number;
  productionRunId: string;
  expectedVersion: number;
  space: ProductionSpace;
  changeKind?: string;
  changedFields?: string[];
}): Promise<{ space: ProductionSpace; version: number }> {
  await assertProductionRunAccess(params.db, params.tenantId, params.userId, params.productionRunId, "write");
  const latest = await getProductionSpace(params);
  assertProductionLifecycleAllowsAction(latest, "write");
  const currentVersion = Number(latest?.version ?? 0);
  if (currentVersion !== params.expectedVersion) {
    const metrics = latest?.space ? ensureMetrics(latest.space) : getDefaultProductionMetrics();
    metrics.saveConflicts += 1;
    throwProductionConflict(buildProductionConflictPayload({
      productionRunId: params.productionRunId,
      reason: "space_version_stale",
      expected: { spaceVersion: params.expectedVersion },
      current: { spaceVersion: currentVersion },
      changedFields: [],
      currentSpace: latest?.space,
      source: latest?.source,
      archivedAt: latest?.archivedAt,
      deletedAt: latest?.deletedAt,
    }));
  }

  const version = currentVersion + 1;
  const changedFields = params.changedFields ?? [];
  const shouldSanitizeClientFields = !params.changeKind || ["space", "brief", "shot", "layout"].includes(params.changeKind);
  const spaceInput = shouldSanitizeClientFields
    ? sanitizeClientWritableProductionSpace(params.space, latest?.space)
    : params.space;
  const approvalState = applyProductionApprovalInvalidation(spaceInput, params.userId, params.changeKind, changedFields);
  const metrics = ensureMetrics(spaceInput);
  if (approvalState?.status === "invalidated" && spaceInput.approvalState?.status === "approved") {
    metrics.approvalInvalidations += 1;
  }
  const space: ProductionSpace = {
    ...spaceInput,
    schemaVersion: "1.0.0",
    productionRunId: params.productionRunId,
    version,
    layerVersions: applyProductionLayerVersionChange(latest?.space, version, params.changeKind, changedFields),
    approvalState,
    metrics,
    updatedAt: new Date().toISOString(),
  };
  const validation = validateProductionSpace(space);
  if (!validation.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "production_space_invalid",
      cause: validation.issues,
    });
  }
  const now = new Date();
  const [saved] = await params.db
    .insert(mediaProductionSpaces)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      productionRunId: params.productionRunId,
      version,
      space: space as any,
      changeKind: params.changeKind ?? "space",
      changedFields,
      spaceHash: buildProductionStableHash(space),
      status: space.status,
      contractVersion: space.schemaVersion,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const existingRun = await getRun(params.db, params.tenantId, params.productionRunId);
  await params.db
    .insert(mediaProductionRuns)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      productionRunId: params.productionRunId,
      status: space.status,
      goalVersion: version,
      planVersion: version,
      goal: space.brief as any,
      productionBible: { productionSpaceVersion: version, shots: space.shots } as any,
      assetPlan: { contextAssets: space.contextAssets, productEvidenceManifest: space.productEvidenceManifest } as any,
      qualityGateSummary: { validation } as any,
      budgetSummary: {} as any,
      contractVersion: space.schemaVersion,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [mediaProductionRuns.tenantId, mediaProductionRuns.productionRunId],
      set: {
        status: space.status,
        goalVersion: version,
        planVersion: version,
        goal: {
          ...(existingRun?.goal && typeof existingRun.goal === "object" ? existingRun.goal : {}),
          productionSpaceBrief: space.brief,
        } as any,
        productionBible: {
          ...(existingRun?.productionBible && typeof existingRun.productionBible === "object" ? existingRun.productionBible : {}),
          productionSpaceVersion: version,
          productionSpaceShotCount: space.shots.length,
        } as any,
        assetPlan: {
          ...(existingRun?.assetPlan && typeof existingRun.assetPlan === "object" ? existingRun.assetPlan : {}),
          productionSpaceContextAssetCount: space.contextAssets.length,
          productEvidenceManifestStatus: space.productEvidenceManifest?.status,
        } as any,
        qualityGateSummary: {
          ...(existingRun?.qualityGateSummary && typeof existingRun.qualityGateSummary === "object" ? existingRun.qualityGateSummary : {}),
          productionSpaceValidation: validation,
        } as any,
        contractVersion: space.schemaVersion,
        updatedAt: now,
      },
    });

  return { space: saved.space as ProductionSpace, version };
}

async function saveProductionSpaceLifecycle(params: {
  db: Db;
  tenantId: string;
  userId: number;
  productionRunId: string;
  expectedVersion: number;
  changeKind: "archive" | "restore" | "delete";
}): Promise<ProductionSpaceLifecycleResult> {
  await assertProductionRunAccess(params.db, params.tenantId, params.userId, params.productionRunId, "write");
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  if (current.deletedAt && params.changeKind !== "restore") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "production_space_deleted" });
  }
  if (current.archivedAt && params.changeKind === "archive") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "production_space_already_archived" });
  }
  if (current.version !== params.expectedVersion) {
    conflict({
      productionRunId: params.productionRunId,
      reason: "space_version_stale",
      expected: { spaceVersion: params.expectedVersion },
      current: { spaceVersion: current.version },
      currentSpace: current.space,
      source: current.source,
      archivedAt: current.archivedAt,
      deletedAt: current.deletedAt,
    });
  }

  const now = new Date();
  const version = current.version + 1;
  const space: ProductionSpace = {
    ...current.space,
    version,
    layerVersions: applyProductionLayerVersionChange(current.space, version, params.changeKind, params.changeKind === "restore" ? ["archivedAt", "deletedAt"] : [`${params.changeKind}dAt`]),
    auditEvents: appendAuditEvent(current.space, `production_project_${params.changeKind === "archive" ? "archived" : params.changeKind === "restore" ? "restored" : "deleted"}`, {
      productionRunId: params.productionRunId,
      previousVersion: current.version,
    }, params.userId),
    updatedAt: now.toISOString(),
  };
  const archivedAt = params.changeKind === "archive" ? now : params.changeKind === "restore" ? null : current.archivedAt ? new Date(current.archivedAt) : null;
  const deletedAt = params.changeKind === "delete" ? now : null;
  const [saved] = await params.db
    .insert(mediaProductionSpaces)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      productionRunId: params.productionRunId,
      version,
      space: space as any,
      changeKind: params.changeKind,
      changedFields: params.changeKind === "restore" ? ["archivedAt", "deletedAt"] : [`${params.changeKind}dAt`],
      spaceHash: buildProductionStableHash(space),
      status: space.status,
      archivedAt,
      deletedAt,
      contractVersion: space.schemaVersion,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    space: saved.space as ProductionSpace,
    version,
    source: "space",
    archivedAt: toIsoOrNull(saved.archivedAt),
    deletedAt: toIsoOrNull(saved.deletedAt),
  };
}

export function archiveProductionSpace(params: {
  db: Db;
  tenantId: string;
  userId: number;
  productionRunId: string;
  expectedVersion: number;
}): Promise<ProductionSpaceLifecycleResult> {
  return saveProductionSpaceLifecycle({ ...params, changeKind: "archive" });
}

export function restoreProductionSpace(params: {
  db: Db;
  tenantId: string;
  userId: number;
  productionRunId: string;
  expectedVersion: number;
}): Promise<ProductionSpaceLifecycleResult> {
  return saveProductionSpaceLifecycle({ ...params, changeKind: "restore" });
}

export function deleteProductionSpace(params: {
  db: Db;
  tenantId: string;
  userId: number;
  productionRunId: string;
  expectedVersion: number;
}): Promise<ProductionSpaceLifecycleResult> {
  return saveProductionSpaceLifecycle({ ...params, changeKind: "delete" });
}

export async function saveProductionBrief(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields"> & {
  brief: ProductionGoal;
  expectedBriefVersion?: number;
}): Promise<{ space: ProductionSpace; version: number }> {
  const current = await getProductionSpace(params);
  const currentBriefVersion = getProductionLayerVersions(current?.space).briefVersion;
  if (params.expectedBriefVersion !== undefined && params.expectedBriefVersion !== currentBriefVersion) {
    conflict({
      productionRunId: params.productionRunId,
      reason: "brief_version_stale",
      expected: { briefVersion: params.expectedBriefVersion },
      current: { briefVersion: currentBriefVersion, spaceVersion: current?.version },
      currentSpace: current?.space,
      source: current?.source,
      archivedAt: current?.archivedAt,
      deletedAt: current?.deletedAt,
    });
  }
  const space = current?.space ?? {
    schemaVersion: "1.0.0" as const,
    productionRunId: params.productionRunId,
    version: 0,
    status: "goal_draft" as ProductionRunStatus,
    brief: { summary: "" },
    shots: [],
    flowNodes: [],
    flowEdges: [],
    contextAssets: [],
  };
  return saveProductionSpace({
    ...params,
    space: { ...space, brief: params.brief },
    changeKind: "brief",
    changedFields: ["brief"],
  });
}

export async function saveProductionShot(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields"> & {
  shot: ProductionShot;
  expectedShotVersion?: number;
}): Promise<{ space: ProductionSpace; version: number }> {
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  const currentShotVersion = getProductionLayerVersions(current.space).shotVersions[params.shot.id] ?? current.version;
  if (params.expectedShotVersion !== undefined && params.expectedShotVersion !== currentShotVersion) {
    conflict({
      productionRunId: params.productionRunId,
      reason: "shot_version_stale",
      expected: { shotVersion: params.expectedShotVersion },
      current: { shotVersion: currentShotVersion, spaceVersion: current.version },
      currentSpace: current.space,
      source: current.source,
      archivedAt: current.archivedAt,
      deletedAt: current.deletedAt,
    });
  }
  const nextShot = { ...params.shot, version: current.version + 1 };
  const shots = current.space.shots.some((shot) => shot.id === params.shot.id)
    ? current.space.shots.map((shot) => shot.id === params.shot.id ? nextShot : shot)
    : [...current.space.shots, nextShot];
  return saveProductionSpace({
    ...params,
    space: { ...current.space, shots },
    changeKind: "shot",
    changedFields: [`shots.${params.shot.id}`],
  });
}

export async function saveProductionNodeConfig(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields"> & {
  nodeId: string;
  configSnapshot: ProductionNodeConfigSnapshot;
  expectedNodeVersion?: number;
  previousConfigSnapshotId?: string;
  outputRefs?: ProductionNodeOutputRef[];
}): Promise<{ space: ProductionSpace; version: number }> {
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  const layers = getProductionLayerVersions(current.space);
  let found = false;
  const flowNodes = current.space.flowNodes.map((node) => {
    if (node.id !== params.nodeId) return node;
    found = true;
    const currentNodeVersion = layers.nodeVersions[params.nodeId] ?? Number(node.configSnapshot?.version ?? current.version);
    if (
      typeof params.expectedNodeVersion === "number"
      && currentNodeVersion !== params.expectedNodeVersion
    ) {
      conflict({
        productionRunId: params.productionRunId,
        reason: "node_version_stale",
        expected: { nodeVersion: params.expectedNodeVersion },
        current: { nodeVersion: currentNodeVersion, spaceVersion: current.version },
        currentSpace: current.space,
        source: current.source,
        archivedAt: current.archivedAt,
        deletedAt: current.deletedAt,
      });
    }
    if (
      params.previousConfigSnapshotId
      && node.configSnapshot?.snapshotId
      && node.configSnapshot.snapshotId !== params.previousConfigSnapshotId
    ) {
      conflict({
        productionRunId: params.productionRunId,
        reason: "node_snapshot_changed",
        expected: { configSnapshotId: params.previousConfigSnapshotId },
        current: { configSnapshotId: node.configSnapshot.snapshotId, nodeVersion: currentNodeVersion, spaceVersion: current.version },
        currentSpace: current.space,
        source: current.source,
        archivedAt: current.archivedAt,
        deletedAt: current.deletedAt,
      });
    }
    const catalogValidation = validateProductionNodeConfigSnapshotAgainstCatalog(node, params.configSnapshot);
    if (!catalogValidation.ok) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: catalogValidation.reason,
        cause: {
          nodeId: node.id,
          nodeKind: node.kind,
          adapterStatus: catalogValidation.catalogEntry?.adapterStatus,
          expectedToolSurface: catalogValidation.catalogEntry?.toolSurface,
          expectedAdapter: catalogValidation.catalogEntry?.adapter,
          actualToolSurface: params.configSnapshot.toolSurface,
          actualAdapter: params.configSnapshot.adapter,
        },
      });
    }
    return {
      ...node,
      configSnapshot: params.configSnapshot,
      outputRefs: params.outputRefs ?? node.outputRefs,
    };
  });
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Production node not found" });
  return saveProductionSpace({
    ...params,
    space: {
      ...current.space,
      flowNodes,
      auditEvents: appendAuditEvent(current.space, "node_config_save", { nodeId: params.nodeId, snapshotId: params.configSnapshot.snapshotId }, params.userId),
    },
    changeKind: "node_config",
    changedFields: [`flowNodes.${params.nodeId}.configSnapshot`, ...(params.outputRefs ? [`flowNodes.${params.nodeId}.outputRefs`] : [])],
  });
}

export async function saveProductionShotProductUse(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields"> & {
  shotProductUse: ProductionShotProductUse;
}): Promise<{ space: ProductionSpace; version: number }> {
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  if (!current.space.shots.some((shot) => shot.id === params.shotProductUse.shotId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Production shot not found" });
  }
  assertProductClaimsAreValid(current.space, params.shotProductUse);
  const shotProductUsage = current.space.shotProductUsage?.some((item) => item.shotId === params.shotProductUse.shotId)
    ? current.space.shotProductUsage.map((item) => item.shotId === params.shotProductUse.shotId ? params.shotProductUse : item)
    : [...(current.space.shotProductUsage ?? []), params.shotProductUse];
  return saveProductionSpace({
    ...params,
    space: {
      ...current.space,
      shotProductUsage,
      auditEvents: appendAuditEvent(current.space, "shot_product_usage_save", { shotId: params.shotProductUse.shotId }, params.userId),
    },
    changeKind: "product_evidence",
    changedFields: [`shotProductUsage.${params.shotProductUse.shotId}`],
  });
}

export async function updateProductionProductStoryboardAsset(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields"> & {
  productAssetId: string;
  patch: Partial<ProductStoryboardAsset>;
  action: "update_role" | "link_claim" | "link_evidence" | "relink_image" | "request_more_evidence";
}): Promise<{ space: ProductionSpace; version: number }> {
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  const manifest = current.space.productEvidenceManifest;
  if (!manifest) throw new TRPCError({ code: "NOT_FOUND", message: "Product evidence manifest not found" });
  let found = false;
  const products = manifest.products.map((product) => {
    if (product.id !== params.productAssetId) return product;
    found = true;
    const safePatch = sanitizeProductStoryboardAssetPatch({
      action: params.action,
      patch: params.patch,
      current: product,
    });
    return {
      ...product,
      ...safePatch,
      reviewNotes: [
        ...(product.reviewNotes ?? []),
        ...(params.action === "request_more_evidence" ? ["More evidence requested before generation."] : []),
      ],
    };
  });
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Product storyboard asset not found" });
  return saveProductionSpace({
    ...params,
    space: {
      ...current.space,
      productEvidenceManifest: { ...manifest, products },
      auditEvents: appendAuditEvent(current.space, `product_evidence_${params.action}`, { productAssetId: params.productAssetId, patch: params.patch }, params.userId),
    },
    changeKind: "product_evidence",
    changedFields: [`productEvidenceManifest.products.${params.productAssetId}`],
  });
}

export async function scheduleProductionExecution(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields"> & {
  scope: ProductionExecutionScope;
  targetId?: string;
  confirmed: boolean;
  retryOfAttemptId?: string;
  userToken?: string;
  publicUrl?: string;
  creditLedger?: ProductionCreditLedger;
  mediaDispatcher?: ProductionMediaDispatcher;
}): Promise<{ space: ProductionSpace; version: number; attempt: ProductionActionAttempt }> {
  await assertProductionRunAccess(params.db, params.tenantId, params.userId, params.productionRunId, "execute");
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  assertProductionLifecycleAllowsAction(current, "execute");
  if (current.version !== params.expectedVersion) {
    conflict({
      productionRunId: params.productionRunId,
      reason: "space_version_stale",
      expected: { spaceVersion: params.expectedVersion },
      current: { spaceVersion: current.version },
      currentSpace: current.space,
      source: current.source,
      archivedAt: current.archivedAt,
      deletedAt: current.deletedAt,
    });
  }
  const gates = resolveServerExecutionGates(current.space);
  const gateKey = getExecutionGateKey(params.scope);
  if (!gates[gateKey]) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `production_execution_disabled:${gateKey}` });
  }
  if (!params.confirmed) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "production_execution_requires_confirmation" });
  }
  const scoped = getScopedNodeIds(current.space, params.scope, params.targetId);
  const executableNodeIds = getExecutableProductionNodeIds(current.space, params.scope, scoped.nodeIds, params.retryOfAttemptId);
  const executableNodeIdSet = new Set(executableNodeIds);
  const selectedNodes = executableNodeIds
    .map((nodeId) => current.space.flowNodes.find((node) => node.id === nodeId))
    .filter((node): node is ProductionSpace["flowNodes"][number] => Boolean(node));
  if (selectedNodes.length === 0) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "production_execution_no_runnable_nodes" });
  }
  for (const node of selectedNodes) {
    const catalogValidation = validateProductionExecutableNodeAgainstCatalog(node);
    if (!catalogValidation.ok) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: catalogValidation.reason,
        cause: {
          nodeId: node.id,
          nodeKind: node.kind,
          adapterStatus: catalogValidation.catalogEntry?.adapterStatus,
        },
      });
    }
  }
  assertProductionStatusTransition(current.space.status, "final_generating");
  const validation = validateProductionSpace(current.space);
  if (!validation.ok) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "production_space_not_ready_for_execution", cause: validation.issues });
  }
  const blocked = selectedNodes.find((node) => node.status === "blocked" || node.status === "failed" || (node.readinessIssues?.length ?? 0) > 0);
  if (blocked) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "production_node_not_ready", cause: { nodeId: blocked.id } });
  }
  const creditEstimate = selectedNodes.reduce((sum, node) => sum + normalizeCreditEstimate(node.estimatedCredits), 0);
  const attemptNumber = countAttempts(current.space, params.scope, params.targetId) + 1;
  const attemptId = [
    "prod-attempt",
    params.productionRunId,
    params.scope,
    params.targetId ?? "batch",
    String(attemptNumber),
  ].join("-");
  const at = nowIso();
  const attempt: ProductionActionAttempt = {
    attemptId,
    kind: "generate",
    scope: params.scope,
    status: "queued",
    actorUserId: params.userId,
    creditOwnerUserId: params.userId,
    nodeIds: executableNodeIds,
    shotIds: scoped.shotIds.filter((shotId) => current.space.shots.find((shot) => shot.id === shotId)?.nodeIds.some((nodeId) => executableNodeIdSet.has(nodeId))),
    idempotencyKey: [params.tenantId, params.productionRunId, current.version, params.scope, params.targetId ?? "batch", attemptNumber].join(":"),
    expectedSpaceVersion: params.expectedVersion,
    creditEstimate,
    creditReserved: creditEstimate,
    creditSpent: 0,
    creditRefunded: 0,
    mediaTaskIds: [],
    providerTaskIds: [],
    createdAt: at,
    updatedAt: at,
    retryOfAttemptId: params.retryOfAttemptId,
  };
  const providerDispatchEnabled = isProviderDispatchEnabled();
  const creditLedger = params.creditLedger ?? defaultCreditLedger;
  const mediaDispatcher = params.mediaDispatcher ?? defaultMediaDispatcher;
  let nextAttempt: ProductionActionAttempt = attempt;
  let nextNodes = current.space.flowNodes.map((node) => executableNodeIdSet.has(node.id) ? { ...node, status: providerDispatchEnabled ? "reserving_credits" as const : "running" as const } : node);
  const metrics = ensureMetrics(current.space);

  if (providerDispatchEnabled) {
    if (!params.userToken) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "production_execution_requires_user_token" });
    }
    try {
      nextAttempt = { ...nextAttempt, status: "reserving_credits", updatedAt: nowIso() };
      await creditLedger.reserve({
        userId: params.userId,
        tenantId: params.tenantId,
        amount: creditEstimate,
        idempotencyKey: nextAttempt.idempotencyKey,
        attemptId: nextAttempt.attemptId,
        productionRunId: params.productionRunId,
        scope: params.scope,
      });
      const dispatchedTasks: Array<{ nodeId: string; task: MediaTask }> = [];
      for (const node of selectedNodes) {
        if (node.configSnapshot?.adapter === "preview_only" || node.configSnapshot?.adapter === "disabled") continue;
        const task = await mediaDispatcher.dispatchNode({
          node,
          space: current.space,
          attempt: nextAttempt,
          userId: params.userId,
          userToken: params.userToken,
          publicUrl: params.publicUrl,
        });
        dispatchedTasks.push({ nodeId: node.id, task });
      }
      const taskIds = dispatchedTasks.map(({ task }) => task.id);
      const providerTaskIds = dispatchedTasks.map(({ task }) => task.taskId).filter((taskId): taskId is string => Boolean(taskId));
      nextAttempt = {
        ...nextAttempt,
        status: "running",
        mediaTaskIds: taskIds,
        providerTaskIds,
        updatedAt: nowIso(),
      };
      const outputRefsByNode = new Map<string, ProductionNodeOutputRef[]>();
      dispatchedTasks.forEach(({ nodeId, task }) => {
        const outputRef = buildOutputRefFromMediaTask(nodeId, task);
        outputRefsByNode.set(nodeId, [...(outputRefsByNode.get(nodeId) ?? []), outputRef]);
      });
      nextNodes = current.space.flowNodes.map((node) => {
        if (!executableNodeIdSet.has(node.id)) return node;
        return {
          ...node,
          status: "running" as const,
          outputRefs: [...(node.outputRefs ?? []), ...(outputRefsByNode.get(node.id) ?? [])],
        };
      });
    } catch (error) {
      metrics.providerFailures += 1;
      try {
        await creditLedger.refund({
          userId: params.userId,
          amount: creditEstimate,
          idempotencyKey: `${nextAttempt.idempotencyKey}:submission_failed`,
          attemptId: nextAttempt.attemptId,
          productionRunId: params.productionRunId,
          reason: "submission_failed",
        });
      } catch {
        metrics.creditMismatches += 1;
      }
      nextAttempt = {
        ...nextAttempt,
        status: "failed",
        creditRefunded: creditEstimate,
        errorCode: "provider_submission_failed",
        errorMessage: error instanceof Error ? error.message : "Provider submission failed",
        updatedAt: nowIso(),
      };
      nextNodes = current.space.flowNodes.map((node) => executableNodeIdSet.has(node.id) ? { ...node, status: "failed" as const } : node);
    }
  }
  return saveProductionSpace({
    ...params,
    space: {
      ...current.space,
      status: nextAttempt.status === "failed" ? "failed" : "final_generating",
      flowNodes: nextNodes,
      actionAttempts: [...(current.space.actionAttempts ?? []), nextAttempt],
      metrics,
      auditEvents: appendAuditEvent(current.space, "execution_scheduled", {
        scope: params.scope,
        targetId: params.targetId,
        attemptId,
        creditEstimate,
        providerDispatchEnabled,
        mediaTaskIds: nextAttempt.mediaTaskIds,
      }, params.userId),
    },
    changeKind: "execution",
    changedFields: ["actionAttempts", "flowNodes.status", "flowNodes.outputRefs", "status", "metrics"],
  }).then((result) => ({ ...result, attempt: nextAttempt }));
}

export async function cancelProductionExecution(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields"> & {
  attemptId: string;
  userToken?: string;
  creditLedger?: ProductionCreditLedger;
  mediaDispatcher?: ProductionMediaDispatcher;
}): Promise<{ space: ProductionSpace; version: number; attempt: ProductionActionAttempt }> {
  await assertProductionRunAccess(params.db, params.tenantId, params.userId, params.productionRunId, "execute");
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  assertProductionLifecycleAllowsAction(current, "execute");
  if (current.version !== params.expectedVersion) {
    conflict({
      productionRunId: params.productionRunId,
      reason: "space_version_stale",
      expected: { spaceVersion: params.expectedVersion },
      current: { spaceVersion: current.version },
      currentSpace: current.space,
      source: current.source,
      archivedAt: current.archivedAt,
      deletedAt: current.deletedAt,
    });
  }
  const mediaDispatcher = params.mediaDispatcher ?? defaultMediaDispatcher;
  const creditLedger = params.creditLedger ?? defaultCreditLedger;
  let changedAttempt: ProductionActionAttempt | null = null;
  const skippedMediaTaskIds: string[] = [];
  let cancelRefundAmount = 0;
  const actionAttempts = (current.space.actionAttempts ?? []).map((attempt) => {
    if (attempt.attemptId !== params.attemptId) return attempt;
    if (attempt.status === "cancelled" || attempt.status === "completed") {
      changedAttempt = attempt;
      return attempt;
    }
    const at = nowIso();
    cancelRefundAmount = Math.max(0, attempt.creditReserved - attempt.creditSpent - (attempt.creditRefunded ?? 0));
    changedAttempt = {
      ...attempt,
      status: "cancelled",
      creditRefunded: (attempt.creditRefunded ?? 0) + cancelRefundAmount,
      cancelledAt: at,
      updatedAt: at,
    };
    return changedAttempt;
  });
  if (!changedAttempt) throw new TRPCError({ code: "NOT_FOUND", message: "Production action attempt not found" });
  const cancelledAttempt = changedAttempt as ProductionActionAttempt;
  if (params.userToken && mediaDispatcher.cancelTask) {
    for (const mediaTaskId of cancelledAttempt.mediaTaskIds) {
      try {
        await mediaDispatcher.cancelTask({ mediaTaskId, userToken: params.userToken });
      } catch {
        skippedMediaTaskIds.push(mediaTaskId);
      }
    }
  } else {
    skippedMediaTaskIds.push(...cancelledAttempt.mediaTaskIds);
  }
  const creditOwnerUserId = cancelledAttempt.creditOwnerUserId ?? cancelledAttempt.actorUserId ?? params.userId;
  if (cancelRefundAmount > 0) {
    await creditLedger.refund({
      userId: creditOwnerUserId,
      amount: cancelRefundAmount,
      idempotencyKey: `${cancelledAttempt.idempotencyKey}:cancelled`,
      attemptId: cancelledAttempt.attemptId,
      productionRunId: params.productionRunId,
      reason: "cancelled",
    });
  }
  const cancelledNodeIds = new Set(cancelledAttempt.nodeIds);
  const transitionAlerts: ProductionExecutionReconciliationAlert[] = [];
  const nextStatus = applyProductionStatusTransition(
    current.space.status,
    "cancelled",
    transitionAlerts,
    params.productionRunId,
    cancelledAttempt.attemptId,
  );
  const metrics = ensureMetrics(current.space);
  if (transitionAlerts.length > 0) metrics.creditAlertCount += transitionAlerts.length;
  return saveProductionSpace({
    ...params,
    space: {
      ...current.space,
      status: nextStatus,
      flowNodes: current.space.flowNodes.map((node) => cancelledNodeIds.has(node.id) && ["running", "queued", "reserving_credits"].includes(node.status) ? { ...node, status: "cancelled" } : node),
      actionAttempts,
      metrics,
      auditEvents: appendAuditEvent(current.space, "execution_cancelled", { attemptId: params.attemptId, skippedMediaTaskIds, transitionAlerts }, params.userId),
    },
    changeKind: "execution_cancel",
    changedFields: ["actionAttempts", "flowNodes.status", "status", "metrics"],
  }).then((result) => ({ ...result, attempt: cancelledAttempt }));
}

export async function reconcileProductionExecution(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields"> & {
  attemptId: string;
  userToken?: string;
  mediaDispatcher?: ProductionMediaDispatcher;
  creditLedger?: ProductionCreditLedger;
  tasks?: MediaTask[];
}): Promise<{ space: ProductionSpace; version: number; attempt: ProductionActionAttempt; reconciledTaskIds: string[] }> {
  await assertProductionRunAccess(params.db, params.tenantId, params.userId, params.productionRunId, "execute");
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  assertProductionLifecycleAllowsAction(current, "repair");
  if (current.version !== params.expectedVersion) {
    conflict({
      productionRunId: params.productionRunId,
      reason: "space_version_stale",
      expected: { spaceVersion: params.expectedVersion },
      current: { spaceVersion: current.version },
      currentSpace: current.space,
      source: current.source,
      archivedAt: current.archivedAt,
      deletedAt: current.deletedAt,
    });
  }
  if (current.version !== params.expectedVersion) conflict();
  const attempt = (current.space.actionAttempts ?? []).find((item) => item.attemptId === params.attemptId);
  if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Production action attempt not found" });
  if (attempt.status === "completed" || attempt.status === "cancelled") {
    return { space: current.space, version: current.version, attempt, reconciledTaskIds: [] };
  }
  const mediaDispatcher = params.mediaDispatcher ?? defaultMediaDispatcher;
  const creditLedger = params.creditLedger ?? defaultCreditLedger;
  const tasks = params.tasks ?? [];
  if (tasks.length === 0 && params.userToken && mediaDispatcher.getTask) {
    for (const mediaTaskId of attempt.mediaTaskIds) {
      tasks.push(await mediaDispatcher.getTask({ mediaTaskId, userToken: params.userToken }));
    }
  }
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const terminalTasks = tasks.filter((task) => ["completed", "failed", "cancelled"].includes(task.status));
  const failedTasks = tasks.filter((task) => task.status === "failed" || task.status === "cancelled");
  const completedTasks = tasks.filter((task) => task.status === "completed");
  const allKnownTerminal = attempt.mediaTaskIds.length > 0 && attempt.mediaTaskIds.every((taskId) => {
    const task = taskById.get(taskId);
    return task && ["completed", "failed", "cancelled"].includes(task.status);
  });
  const metrics = ensureMetrics(current.space);
  const transitionAlerts: ProductionExecutionReconciliationAlert[] = [];
  let nextAttempt: ProductionActionAttempt = attempt;
  if (allKnownTerminal && failedTasks.length === 0) {
    nextAttempt = {
      ...attempt,
      status: "completed",
      creditSpent: attempt.creditReserved,
      creditRefunded: 0,
      completedAt: nowIso(),
      updatedAt: nowIso(),
    };
  } else if (allKnownTerminal && failedTasks.length > 0) {
    const refundAmount = Math.max(0, attempt.creditReserved - attempt.creditSpent - (attempt.creditRefunded ?? 0));
    try {
      await creditLedger.refund({
        userId: attempt.creditOwnerUserId ?? attempt.actorUserId ?? params.userId,
        amount: refundAmount,
        idempotencyKey: `${attempt.idempotencyKey}:terminal_failed`,
        attemptId: attempt.attemptId,
        productionRunId: params.productionRunId,
        reason: "terminal_failed",
      });
    } catch {
      metrics.creditMismatches += 1;
    }
    metrics.providerFailures += failedTasks.length;
    nextAttempt = {
      ...attempt,
      status: "failed",
      creditRefunded: refundAmount,
      errorCode: "provider_task_failed",
      errorMessage: failedTasks[0]?.errorMessage ?? "Provider task failed",
      updatedAt: nowIso(),
    };
  } else {
    nextAttempt = { ...attempt, status: "running", updatedAt: nowIso() };
  }
  const creditAlerts: ProductionExecutionReconciliationAlert[] = [];
  if (allKnownTerminal && creditLedger.verify) {
    try {
      const verification = await creditLedger.verify({
        userId: attempt.creditOwnerUserId ?? attempt.actorUserId ?? params.userId,
        tenantId: params.tenantId,
        attempt: nextAttempt,
        productionRunId: params.productionRunId,
      });
      metrics.creditReconciliationRuns += 1;
      if (!verification.ok) {
        metrics.creditMismatches += 1;
        creditAlerts.push({
          code: "credit_ledger_mismatch",
          severity: "critical",
          productionRunId: params.productionRunId,
          attemptId: attempt.attemptId,
          message: verification.reason ?? "credit_ledger_mismatch",
          details: {
            reserved: verification.reserved,
            spent: verification.spent,
            refunded: verification.refunded,
            mismatchAmount: verification.mismatchAmount,
          },
        });
      }
    } catch (error) {
      metrics.creditReconciliationRuns += 1;
      metrics.creditMismatches += 1;
      creditAlerts.push({
        code: "credit_ledger_mismatch",
        severity: "critical",
        productionRunId: params.productionRunId,
        attemptId: attempt.attemptId,
        message: error instanceof Error ? error.message : "credit_ledger_verification_failed",
      });
    }
  }

  const outputRefsByNode = new Map<string, ProductionNodeOutputRef[]>();
  const nodeIdByMediaTaskId = new Map<string, string>();
  for (const node of current.space.flowNodes) {
    for (const ref of node.outputRefs ?? []) {
      if (ref.mediaTaskId) nodeIdByMediaTaskId.set(ref.mediaTaskId, node.id);
    }
  }
  completedTasks.forEach((task, index) => {
    const nodeId = nodeIdByMediaTaskId.get(task.id) ?? attempt.nodeIds[index] ?? attempt.nodeIds[0];
    if (!nodeId) return;
    outputRefsByNode.set(nodeId, [...(outputRefsByNode.get(nodeId) ?? []), buildOutputRefFromMediaTask(nodeId, task)]);
  });
  const actionAttempts = (current.space.actionAttempts ?? []).map((item) => item.attemptId === attempt.attemptId ? nextAttempt : item);
  const affectedNodeIds = new Set(attempt.nodeIds);
  const flowNodes = current.space.flowNodes.map((node) => {
    if (!affectedNodeIds.has(node.id)) return node;
    const refs = outputRefsByNode.get(node.id) ?? [];
    return {
      ...node,
      status: nextAttempt.status === "completed" ? "completed" as const : nextAttempt.status === "failed" ? "failed" as const : node.status,
      outputRefs: refs.length ? [...(node.outputRefs ?? []), ...refs] : node.outputRefs,
    };
  });
  return saveProductionSpace({
    ...params,
    space: {
      ...current.space,
      status: nextAttempt.status === "completed"
        ? applyProductionStatusTransition(current.space.status, "final_qa_passed", transitionAlerts, params.productionRunId, attempt.attemptId)
        : nextAttempt.status === "failed"
          ? applyProductionStatusTransition(current.space.status, "final_qa_failed", transitionAlerts, params.productionRunId, attempt.attemptId)
          : current.space.status,
      flowNodes,
      actionAttempts,
      metrics: {
        ...metrics,
        reconciledExecutionAttempts: metrics.reconciledExecutionAttempts + (allKnownTerminal ? 1 : 0),
        creditAlertCount: metrics.creditAlertCount + transitionAlerts.length + creditAlerts.length,
      },
      auditEvents: appendAuditEvent(current.space, "execution_reconciled", {
        attemptId: attempt.attemptId,
        terminalTaskCount: terminalTasks.length,
        completedTaskCount: completedTasks.length,
        failedTaskCount: failedTasks.length,
        transitionAlerts,
        creditAlerts,
      }, params.userId),
    },
    changeKind: "execution_reconcile",
    changedFields: ["actionAttempts", "flowNodes.outputRefs", "flowNodes.status", "metrics", "status"],
  }).then((result) => ({ ...result, attempt: nextAttempt, reconciledTaskIds: tasks.map((task) => task.id) }));
}

export async function reconcileProductionProviderCallback(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields" | "expectedVersion"> & {
  task: MediaTask;
  attemptId?: string;
  expectedVersion?: number;
  creditLedger?: ProductionCreditLedger;
}): Promise<{ space: ProductionSpace; version: number; attempt: ProductionActionAttempt; reconciledTaskIds: string[] }> {
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  const attempt = (current.space.actionAttempts ?? []).find((item) => (
    params.attemptId ? item.attemptId === params.attemptId : (
      item.mediaTaskIds.includes(params.task.id)
      || (params.task.taskId ? item.providerTaskIds.includes(params.task.taskId) : false)
    )
  ));
  if (!attempt) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Production action attempt not found for callback" });
  }
  return reconcileProductionExecution({
    ...params,
    expectedVersion: params.expectedVersion ?? current.version,
    attemptId: attempt.attemptId,
    tasks: [params.task],
    creditLedger: params.creditLedger,
  });
}

export async function reconcilePendingProductionExecutions(params: {
  db: Db;
  tenantId: string;
  userId?: number;
  userToken?: string;
  limit?: number;
  mediaDispatcher?: ProductionMediaDispatcher;
  creditLedger?: ProductionCreditLedger;
  tokenResolver?: (input: { userId: number; tenantId: string; productionRunId: string }) => string | undefined | Promise<string | undefined>;
}): Promise<{
  scannedSpaces: number;
  pendingAttempts: number;
  reconciledAttempts: number;
  skippedAttempts: number;
  alerts: ProductionExecutionReconciliationAlert[];
}> {
  const mediaDispatcher = params.mediaDispatcher ?? defaultMediaDispatcher;
  const creditLedger = params.creditLedger ?? defaultCreditLedger;
  let rows: any[];
  try {
    rows = await params.db
      .select()
      .from(mediaProductionSpaces)
      .where(eq(mediaProductionSpaces.tenantId, params.tenantId))
      .orderBy(desc(mediaProductionSpaces.updatedAt))
      .limit(params.limit ?? 25);
  } catch (error) {
    if (!isProductionSpaceStorageUnavailable(error)) throw error;
    return {
      scannedSpaces: 0,
      pendingAttempts: 0,
      reconciledAttempts: 0,
      skippedAttempts: 0,
      alerts: [],
    };
  }
  let pendingAttempts = 0;
  let reconciledAttempts = 0;
  let skippedAttempts = 0;
  const alerts: ProductionExecutionReconciliationAlert[] = [];

  for (const row of rows as any[]) {
    const space = row.space as ProductionSpace;
    const attempts = (space.actionAttempts ?? []).filter((attempt) =>
      ["queued", "reserving_credits", "running"].includes(attempt.status)
      && attempt.mediaTaskIds.length > 0
    );
    if (attempts.length === 0) continue;
    pendingAttempts += attempts.length;
    const metrics = ensureMetrics(space);
    const ownerUserId = Number(row.userId ?? space.accessPolicy?.ownerUserId ?? params.userId ?? 0);
    for (const attempt of attempts) {
      const token = params.userToken ?? await params.tokenResolver?.({
        userId: ownerUserId,
        tenantId: params.tenantId,
        productionRunId: space.productionRunId,
      });
      if (!token || !mediaDispatcher.getTask) {
        skippedAttempts += 1;
        metrics.providerCallbackMisses += 1;
        metrics.pendingExecutionAttempts += 1;
        alerts.push({
          code: "provider_callback_missing",
          severity: "warning",
          productionRunId: space.productionRunId,
          attemptId: attempt.attemptId,
          message: "production_execution_reconcile_requires_task_status_token",
        });
        continue;
      }
      const beforeVersion = Number(row.version ?? space.version);
      try {
        const result = await reconcileProductionExecution({
          db: params.db,
          tenantId: params.tenantId,
          userId: ownerUserId,
          userToken: token,
          productionRunId: space.productionRunId,
          expectedVersion: beforeVersion,
          attemptId: attempt.attemptId,
          mediaDispatcher,
          creditLedger,
        });
        row.version = result.version;
        row.space = result.space;
        reconciledAttempts += 1;
      } catch (error) {
        skippedAttempts += 1;
        alerts.push({
          code: "provider_callback_missing",
          severity: "warning",
          productionRunId: space.productionRunId,
          attemptId: attempt.attemptId,
          message: error instanceof Error ? error.message : "production_execution_reconcile_failed",
        });
      }
    }
    if (skippedAttempts > 0) {
      const latest = row.space as ProductionSpace;
      if (Number(row.version ?? latest.version) === Number(space.version)) {
        await saveProductionSpace({
          db: params.db,
          tenantId: params.tenantId,
          userId: ownerUserId,
          productionRunId: latest.productionRunId,
          expectedVersion: Number(row.version ?? latest.version),
          space: {
            ...latest,
            metrics,
            auditEvents: appendAuditEvent(latest, "execution_reconciliation_alert", { alerts }, ownerUserId),
          },
          changeKind: "execution_reconciliation_alert",
          changedFields: ["metrics", "auditEvents"],
        }).catch(() => undefined);
      }
    }
  }

  return {
    scannedSpaces: rows.length,
    pendingAttempts,
    reconciledAttempts,
    skippedAttempts,
    alerts,
  };
}

export async function repairProductionStaleOutputRefs(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields">): Promise<{
  space: ProductionSpace;
  version: number;
  repairedOutputRefIds: string[];
  staleOutputRefIds: string[];
}> {
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  const repairedOutputRefIds: string[] = [];
  const staleOutputRefIds: string[] = [];
  const flowNodes = current.space.flowNodes.map((node) => ({
    ...node,
    outputRefs: node.outputRefs?.map((ref) => {
      if (ref.url || ref.storageKey || ref.libraryItemId || ref.mediaTaskId) return ref;
      staleOutputRefIds.push(ref.outputRefId);
      if (ref.mediaId) {
        repairedOutputRefIds.push(ref.outputRefId);
        return { ...ref, libraryItemId: ref.mediaId, metadata: { ...(ref.metadata ?? {}), repairedFromMediaId: true } };
      }
      return { ...ref, metadata: { ...(ref.metadata ?? {}), stale: true } };
    }),
  }));
  const metrics = ensureMetrics(current.space);
  metrics.staleOutputRefs += staleOutputRefIds.length;
  const result = await saveProductionSpace({
    ...params,
    space: {
      ...current.space,
      flowNodes,
      metrics,
      auditEvents: appendAuditEvent(current.space, "stale_output_refs_repaired", { repairedOutputRefIds, staleOutputRefIds }, params.userId),
    },
    changeKind: "repair_outputs",
    changedFields: ["flowNodes.outputRefs", "metrics.staleOutputRefs"],
  });
  return { ...result, repairedOutputRefIds, staleOutputRefIds };
}

export async function getProductionNodeConfig(params: {
  db: Db;
  tenantId: string;
  userId: number;
  productionRunId: string;
  nodeId: string;
}): Promise<{
  nodeId: string;
  version: number;
  source: ProductionSpaceSource;
  configSnapshot: ProductionNodeConfigSnapshot | null;
} | null> {
  const current = await getProductionSpace(params);
  if (!current) return null;
  const node = current.space.flowNodes.find((flowNode) => flowNode.id === params.nodeId);
  if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "Production node not found" });
  return {
    nodeId: params.nodeId,
    version: current.version,
    source: current.source,
    configSnapshot: node.configSnapshot ?? null,
  };
}

export async function previewProductionExecutionPlan(params: {
  db: Db;
  tenantId: string;
  userId: number;
  productionRunId: string;
  target?: "storyboard_review" | "video_edit";
}): Promise<{
  productionRunId: string;
  version: number;
  validation: ReturnType<typeof validateProductionSpace>;
  readiness: ReturnType<typeof computeProductionSpaceReadiness>;
  handoff?: ReturnType<typeof deriveProductionHandoffPayload>;
} | null> {
  const current = await getProductionSpace(params);
  if (!current) return null;
  assertProductionLifecycleAllowsAction(current, params.target ? "handoff" : "execute");
  return {
    productionRunId: params.productionRunId,
    version: current.version,
    validation: validateProductionSpace(current.space),
    readiness: computeProductionSpaceReadiness(current.space),
    handoff: params.target ? deriveProductionHandoffPayload(current.space, params.target, { tenantId: params.tenantId }) : undefined,
  };
}

export async function importProductionDownstreamResult(params: Omit<Parameters<typeof saveProductionSpace>[0], "space" | "changeKind" | "changedFields"> & {
  result: ProductionDownstreamResultImport;
}): Promise<{
  space: ProductionSpace;
  version: number;
  record: ProductionDownstreamResultRecord;
  importedShotIds: string[];
  importedCueIds: string[];
  skippedLockedIds: string[];
}> {
  await assertProductionRunAccess(params.db, params.tenantId, params.userId, params.productionRunId, "write");
  const current = await getProductionSpace(params);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
  assertProductionLifecycleAllowsAction(current, "handoff");
  if (current.version !== params.expectedVersion) {
    conflict({
      productionRunId: params.productionRunId,
      reason: "space_version_stale",
      expected: { spaceVersion: params.expectedVersion },
      current: { spaceVersion: current.version },
      currentSpace: current.space,
      source: current.source,
      archivedAt: current.archivedAt,
      deletedAt: current.deletedAt,
    });
  }
  if (params.result.sourceSpaceVersion !== current.space.version) {
    const metrics = ensureMetrics(current.space);
    metrics.handoffFailures += 1;
    conflict({
      productionRunId: params.productionRunId,
      reason: "downstream_source_version_stale",
      expected: { sourceSpaceVersion: params.result.sourceSpaceVersion },
      current: { spaceVersion: current.space.version },
      changedFields: ["downstreamResultRecords"],
      currentSpace: current.space,
      source: current.source,
      archivedAt: current.archivedAt,
      deletedAt: current.deletedAt,
    });
  }

  const selectedTakeRefs = params.result.selectedTakeRefs ?? [];
  const timelineCueUpdates = params.result.timelineCueUpdates ?? [];
  const captionUpdates = params.result.captionUpdates ?? [];
  const cueUpdates = [...timelineCueUpdates, ...captionUpdates];
  const allowLockedUpdates = Boolean(params.result.allowLockedUpdates);
  const skippedLockedIds: string[] = [];
  const importedShotIds = new Set<string>();
  const importedCueIds = new Set<string>();
  const lockedShotIds = new Set(current.space.shots.filter((shot) => shot.locked).map((shot) => shot.id));
  const lockedNodeIds = new Set(current.space.flowNodes.filter((node) => node.locked).map((node) => node.id));

  const flowNodes = current.space.flowNodes.map((node) => {
    const refsForNode = selectedTakeRefs.filter((ref) => ref.nodeId === node.id);
    if (refsForNode.length === 0) return node;
    if (node.locked && !allowLockedUpdates) {
      skippedLockedIds.push(node.id);
      return node;
    }
    if (node.shotId) importedShotIds.add(node.shotId);
    return {
      ...node,
      status: node.status === "disabled" ? node.status : "completed" as const,
      outputRefs: [
        ...(node.outputRefs ?? []),
        ...refsForNode.filter((ref) => !(node.outputRefs ?? []).some((existing) => existing.outputRefId === ref.outputRefId)),
      ],
    };
  });

  const cueById = new Map((current.space.cues ?? []).map((cue) => [cue.id, cue]));
  for (const cue of cueUpdates) {
    if (lockedShotIds.has(cue.shotId) && !allowLockedUpdates) {
      skippedLockedIds.push(cue.shotId);
      continue;
    }
    cueById.set(cue.id, { ...(cueById.get(cue.id) ?? {}), ...cue });
    importedCueIds.add(cue.id);
    importedShotIds.add(cue.shotId);
  }

  const manualApprovals = params.result.manualApprovals ?? [];
  const approvedShotIds = new Set(manualApprovals
    .filter((approval) => approval.targetKind === "shot" && approval.approved)
    .map((approval) => approval.targetId));
  const approvedNodeIds = new Set(manualApprovals
    .filter((approval) => approval.targetKind === "node" && approval.approved)
    .map((approval) => approval.targetId));
  const shots = current.space.shots.map((shot) => {
    if (!approvedShotIds.has(shot.id)) return shot;
    if (shot.locked && !allowLockedUpdates) {
      skippedLockedIds.push(shot.id);
      return shot;
    }
    importedShotIds.add(shot.id);
    return { ...shot, status: "approved" as const };
  });
  const approvedFlowNodes = flowNodes.map((node) => {
    if (!approvedNodeIds.has(node.id)) return node;
    if (lockedNodeIds.has(node.id) && !allowLockedUpdates) {
      skippedLockedIds.push(node.id);
      return node;
    }
    if (node.shotId) importedShotIds.add(node.shotId);
    return { ...node, status: "approved" as const, approvedAt: nowIso() };
  });

  const productWarningResolutions = params.result.productWarningResolutions ?? [];
  const productEvidenceManifest = current.space.productEvidenceManifest && productWarningResolutions.length > 0
    ? {
        ...current.space.productEvidenceManifest,
        products: current.space.productEvidenceManifest.products.map((product) => {
          const productResolutions = productWarningResolutions.filter((resolution) => resolution.productAssetId === product.id || resolution.productAssetId === product.productId);
          if (productResolutions.length === 0) return product;
          const nextClaimEvidence = product.claimEvidence.map((claim) => {
            const resolution = productResolutions.find((item) => !item.claimId || item.claimId === claim.claimId);
            return resolution ? { ...claim, status: resolution.status } : claim;
          });
          const status = productResolutions.at(-1)?.status;
          return {
            ...product,
            approvalState: status ?? product.approvalState,
            claimEvidence: nextClaimEvidence,
            reviewNotes: [
              ...(product.reviewNotes ?? []),
              ...productResolutions.map((resolution) => resolution.warning).filter((warning): warning is string => Boolean(warning)),
            ],
          };
        }),
        status: productWarningResolutions.some((resolution) => resolution.status === "blocked")
          ? "blocked" as const
          : productWarningResolutions.some((resolution) => resolution.status === "needs_review")
            ? "warning" as const
            : current.space.productEvidenceManifest.status,
      }
    : current.space.productEvidenceManifest;

  const importedAt = nowIso();
  const record: ProductionDownstreamResultRecord = {
    recordId: params.result.recordId,
    sourceSpaceVersion: params.result.sourceSpaceVersion,
    target: params.result.target,
    status: skippedLockedIds.length > 0 ? "conflict" : "imported",
    selectedTakeRefs,
    timelineCueUpdates,
    captionUpdates,
    productWarningResolutions,
    manualApprovals,
    warnings: params.result.warnings,
    importedAt,
  };
  const downstreamResultRecords = [
    ...(current.space.downstreamResultRecords ?? []).filter((item) => item.recordId !== record.recordId),
    record,
  ];
  const metrics = ensureMetrics(current.space);
  metrics.handoffEvents += 1;
  if (record.status === "conflict") metrics.handoffFailures += 1;

  const result = await saveProductionSpace({
    ...params,
    space: {
      ...current.space,
      flowNodes: approvedFlowNodes,
      shots,
      cues: [...cueById.values()].sort((a, b) => a.startSeconds - b.startSeconds),
      productEvidenceManifest,
      downstreamResultRecords,
      metrics,
      auditEvents: appendAuditEvent(current.space, "downstream_result_imported", {
        recordId: record.recordId,
        target: record.target,
        selectedTakeCount: selectedTakeRefs.length,
        cueUpdateCount: cueUpdates.length,
        skippedLockedIds,
      }, params.userId),
    },
    changeKind: "downstream_import",
    changedFields: ["downstreamResultRecords", "flowNodes.outputRefs", "shots.status", "cues", "productEvidenceManifest", "metrics"],
  });
  return {
    ...result,
    record,
    importedShotIds: [...importedShotIds],
    importedCueIds: [...importedCueIds],
    skippedLockedIds: [...new Set(skippedLockedIds)],
  };
}

export function redactProductionSpaceExport(space: ProductionSpace): ProductionSpace {
  const exportId = (prefix: string, value: string | undefined) =>
    `${prefix}-${buildProductionStableHash({ productionRunId: space.productionRunId, value: value ?? "" }).slice(0, 12)}`;
  const nodeIdMap = new Map(space.flowNodes.map((node) => [node.id, exportId("node", node.id)]));
  const shotIdMap = new Map(space.shots.map((shot) => [shot.id, exportId("shot", shot.id)]));
  const productIdMap = new Map((space.productEvidenceManifest?.products ?? []).map((product) => [product.id, exportId("product", product.id)]));
  const claimId = (value: string) => exportId("claim", value);
  const evidenceId = (value: string) => exportId("evidence", value);
  return {
    schemaVersion: space.schemaVersion,
    productionRunId: space.productionRunId,
    version: space.version,
    status: space.status,
    brief: {
      summary: String(space.brief.summary ?? ""),
      title: space.brief.title,
      goalType: space.brief.goalType,
      audience: space.brief.audience,
      platform: space.brief.platform,
      durationSeconds: space.brief.durationSeconds,
      contractVersion: space.brief.contractVersion,
    },
    shots: space.shots.map((shot) => ({
      id: shotIdMap.get(shot.id) ?? exportId("shot", shot.id),
      title: shot.title,
      order: shot.order,
      durationSeconds: shot.durationSeconds,
      script: shot.script,
      visualIntent: shot.visualIntent,
      audioIntent: shot.audioIntent,
      productAssetIds: shot.productAssetIds?.map((id) => productIdMap.get(id) ?? exportId("product", id)),
      nodeIds: shot.nodeIds.map((id) => nodeIdMap.get(id) ?? exportId("node", id)),
      locked: shot.locked,
      status: shot.status,
    })),
    flowNodes: space.flowNodes.map((node) => ({
      id: nodeIdMap.get(node.id) ?? exportId("node", node.id),
      kind: node.kind,
      title: node.title,
      status: node.status,
      shotId: node.shotId ? shotIdMap.get(node.shotId) ?? exportId("shot", node.shotId) : undefined,
      toolBindingId: node.toolBindingId,
      readinessIssues: node.readinessIssues,
      estimatedCredits: node.estimatedCredits,
      position: node.position,
      locked: node.locked,
    })),
    flowEdges: space.flowEdges.map((edge) => ({
      id: exportId("edge", edge.id),
      source: nodeIdMap.get(edge.source) ?? exportId("node", edge.source),
      target: nodeIdMap.get(edge.target) ?? exportId("node", edge.target),
      label: edge.label,
      kind: edge.kind,
    })),
    contextAssets: space.contextAssets.map((asset) => ({
      id: exportId("asset", asset.id),
      kind: asset.kind,
      title: asset.title,
      source: asset.source,
      referenceUnitWeight: asset.referenceUnitWeight,
    })),
    productEvidenceManifest: space.productEvidenceManifest
      ? {
          manifestId: space.productEvidenceManifest.manifestId,
          status: space.productEvidenceManifest.status,
          requiredClaimIds: space.productEvidenceManifest.requiredClaimIds.map(claimId),
          warnings: space.productEvidenceManifest.warnings,
          products: space.productEvidenceManifest.products.map((product) => ({
            id: productIdMap.get(product.id) ?? exportId("product", product.id),
            productId: exportId("source-product", product.productId),
            title: product.title,
            sku: product.sku,
            variantId: product.variantId,
            approvalState: product.approvalState,
            claimEvidence: product.claimEvidence.map((claim) => ({
              claimId: claimId(claim.claimId),
              evidenceIds: claim.evidenceIds.map(evidenceId),
              status: claim.status,
              riskLevel: claim.riskLevel,
            })),
          })),
        }
      : undefined,
    shotProductUsage: space.shotProductUsage?.map((use) => ({
      shotId: shotIdMap.get(use.shotId) ?? exportId("shot", use.shotId),
      productStoryboardAssetIds: use.productStoryboardAssetIds.map((id) => productIdMap.get(id) ?? exportId("product", id)),
      claimIds: use.claimIds.map(claimId),
      evidenceIds: use.evidenceIds.map(evidenceId),
      customerJourneyStage: use.customerJourneyStage,
      frameStrategy: use.frameStrategy,
      requiredVisualAccuracy: use.requiredVisualAccuracy,
      qaStatus: use.qaStatus,
      warnings: use.warnings,
    })),
    actionAttempts: space.actionAttempts?.map((attempt) => ({
      attemptId: exportId("attempt", attempt.attemptId),
      kind: attempt.kind,
      scope: attempt.scope,
      status: attempt.status,
      nodeIds: attempt.nodeIds.map((id) => nodeIdMap.get(id) ?? exportId("node", id)),
      shotIds: attempt.shotIds.map((id) => shotIdMap.get(id) ?? exportId("shot", id)),
      idempotencyKey: "[redacted]",
      expectedSpaceVersion: attempt.expectedSpaceVersion,
      creditEstimate: attempt.creditEstimate,
      creditReserved: attempt.creditReserved,
      creditSpent: attempt.creditSpent,
      creditRefunded: attempt.creditRefunded,
      mediaTaskIds: [],
      providerTaskIds: [],
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      completedAt: attempt.completedAt,
      cancelledAt: attempt.cancelledAt,
      errorCode: attempt.errorCode,
      retryOfAttemptId: attempt.retryOfAttemptId ? exportId("attempt", attempt.retryOfAttemptId) : undefined,
    })),
    auditEvents: space.auditEvents?.map((event) => ({
      eventId: exportId("audit", event.eventId),
      action: event.action,
      actorUserId: undefined,
      at: event.at,
      redactedPayload: sanitizeAuditPayload(event.redactedPayload),
    })),
    metrics: space.metrics ? { ...space.metrics } : undefined,
    downstreamResultRecords: space.downstreamResultRecords?.map((record) => ({
      recordId: exportId("downstream", record.recordId),
      sourceSpaceVersion: record.sourceSpaceVersion,
      target: record.target,
      status: record.status,
      warnings: record.warnings,
      importedAt: record.importedAt,
    })),
    cues: space.cues?.map((cue) => ({
      id: exportId("cue", cue.id),
      shotId: shotIdMap.get(cue.shotId) ?? exportId("shot", cue.shotId),
      startSeconds: cue.startSeconds,
      endSeconds: cue.endSeconds,
      kind: cue.kind,
      label: cue.label,
    })),
    warnings: space.warnings,
    featureFlags: space.featureFlags,
    updatedAt: space.updatedAt,
  };
}
