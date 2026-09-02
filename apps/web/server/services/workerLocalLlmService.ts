import crypto from "node:crypto";
import { and, eq, lt, isNull } from "drizzle-orm";

import {
  type WorkerLlmInventory,
  type WorkerLlmModelRow,
  type WorkerLlmInvoke,
  workerLlmInventorySchema,
} from "../../shared/workerLocalLlm";
import type { WorkerAccessAuthContext } from "./workerAuthService";
import { getDb } from "../db";
import { workerLlmInventorySync, workerLlmModels, workers } from "../../drizzle/schema";
import { workerJobs, groupMembers, userGroups } from "../../drizzle/schema";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";

export const WORKER_LLM_STALE_AFTER_MS = 2 * 60 * 1000;

export function isWorkerLlmRowSelectable(input: {
  enabled: boolean;
  tombstoned: boolean;
  readiness: string;
  workerStatus: string;
  lastInventoryAt: Date | string | null;
  now?: Date;
}): boolean {
  if (!input.enabled || input.tombstoned || input.readiness !== "ready" || input.workerStatus !== "online") return false;
  if (!input.lastInventoryAt) return false;
  return (input.now ?? new Date()).getTime() - new Date(input.lastInventoryAt).getTime() <= WORKER_LLM_STALE_AFTER_MS;
}

export type WorkerLlmShareMode = "private" | "groups";

export interface WorkerLlmGroupRecord {
  id: number;
  tenantId: string;
  ownerId: number;
  deletedAt?: Date | null;
}

export interface WorkerLlmSharePolicy {
  mode: WorkerLlmShareMode;
  groupIds: number[];
}

export function readWorkerSharingPolicy(value: unknown): WorkerLlmSharePolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { mode: "private", groupIds: [] };
  const runtimeMetadata = (value as Record<string, unknown>).runtimeMetadata;
  if (!runtimeMetadata || typeof runtimeMetadata !== "object" || Array.isArray(runtimeMetadata)) return { mode: "private", groupIds: [] };
  const policy = (runtimeMetadata as Record<string, unknown>).workerSharingPolicy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return { mode: "private", groupIds: [] };
  const record = policy as Record<string, unknown>;
  return {
    mode: record.mode === "groups" || record.mode === "group" ? "groups" : "private",
    groupIds: Array.isArray(record.groupIds)
      ? record.groupIds.filter((id): id is number => Number.isInteger(id) && id > 0)
      : [],
  };
}

export function validateWorkerLlmSharePolicy(input: {
  tenantId: string;
  actorId: number;
  ownerId: number;
  mode: WorkerLlmShareMode;
  groupIds: number[];
  groups: WorkerLlmGroupRecord[];
}): WorkerLlmSharePolicy {
  if (input.actorId !== input.ownerId) {
    throw new Error("Only the Worker owner can change Local LLM sharing");
  }
  const groupIds = [...new Set(input.groupIds)].filter(Number.isInteger);
  if (input.mode === "private") return { mode: "private", groupIds: [] };
  if (groupIds.length === 0) throw new Error("At least one owner-created Group is required");
  const valid = input.groups.filter(
    (group) => groupIds.includes(group.id) &&
      group.tenantId === input.tenantId &&
      group.ownerId === input.ownerId &&
      !group.deletedAt
  );
  if (valid.length !== groupIds.length) {
    throw new Error("Local LLM sharing requires non-deleted Groups created by the Worker owner");
  }
  return { mode: "groups", groupIds: valid.map((group) => group.id).sort((a, b) => a - b) };
}

export function canAccessWorkerLlmModel(input: {
  actorId: number;
  ownerId: number;
  policy: WorkerLlmSharePolicy;
  activeGroupIds: number[];
}): boolean {
  if (input.actorId === input.ownerId) return true;
  if (input.policy.mode !== "groups") return false;
  const active = new Set(input.activeGroupIds);
  return input.policy.groupIds.some((groupId) => active.has(groupId));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function hashWorkerLlmInventory(inventory: WorkerLlmInventory): string {
  const parsed = workerLlmInventorySchema.parse(inventory);
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(parsed))).digest("hex");
}

export function makeWorkerLlmModelRef(input: {
  tenantId: string;
  workerId: string;
  localProviderId: string;
  providerModelId: string;
}): string {
  const digest = crypto.createHash("sha256").update([
    "worker-llm-model-ref-v1",
    input.tenantId,
    input.workerId,
    input.localProviderId,
    input.providerModelId,
  ].join("\0")).digest("base64url");
  return `wllm_${digest.slice(0, 32)}`;
}

export function flattenWorkerLlmInventory(inventory: WorkerLlmInventory): Array<{
  provider: WorkerLlmInventory["providers"][number];
  model: WorkerLlmModelRow;
}> {
  return inventory.providers.flatMap((provider) => provider.models.map((model) => ({ provider, model })));
}

export type InventorySyncState = {
  revision: number;
  hash: string;
  idempotencyKey: string;
};

export type InventorySyncDecision =
  | { kind: "accept"; reason: "new" | "newer_revision" }
  | { kind: "replay"; reason: "same_payload" }
  | { kind: "reject"; reason: "stale_revision" | "revision_conflict" | "idempotency_conflict" };

export function evaluateWorkerLlmInventoryUpdate(input: {
  current: InventorySyncState | null;
  revision: number;
  hash: string;
  idempotencyKey: string;
}): InventorySyncDecision {
  if (!input.current) return { kind: "accept", reason: "new" };
  if (input.idempotencyKey === input.current.idempotencyKey && input.hash !== input.current.hash) {
    return { kind: "reject", reason: "idempotency_conflict" };
  }
  if (input.revision < input.current.revision) {
    return { kind: "reject", reason: "stale_revision" };
  }
  if (input.revision === input.current.revision) {
    return input.hash === input.current.hash
      ? { kind: "replay", reason: "same_payload" }
      : { kind: "reject", reason: "revision_conflict" };
  }
  return { kind: "accept", reason: "newer_revision" };
}

export function projectWorkerLlmInventory(input: {
  tenantId: string;
  workerId: string;
  ownerUserId: number;
  inventory: WorkerLlmInventory;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const activeKeys = new Set<string>();
  const rows = flattenWorkerLlmInventory(input.inventory).map(({ provider, model }) => {
    const key = `${provider.localProviderId}:${model.providerModelId}`;
    activeKeys.add(key);
    return {
      tenantId: input.tenantId,
      workerId: input.workerId,
      ownerUserId: input.ownerUserId,
      localProviderId: provider.localProviderId,
      providerKind: provider.providerKind,
      localModelId: model.localModelId,
      providerModelId: model.providerModelId,
      modelRef: makeWorkerLlmModelRef({
        tenantId: input.tenantId,
        workerId: input.workerId,
        localProviderId: provider.localProviderId,
        providerModelId: model.providerModelId,
      }),
      displayName: model.displayName,
      capabilitiesJson: model.capabilities,
      contextWindow: model.contextWindow ?? null,
      inventoryRevision: input.inventory.inventoryRevision,
      status: model.readiness,
      enabled: provider.enabled,
      tombstoned: false,
      metadataJson: model.metadata,
      lastInventoryAt: now,
      updatedAt: now,
    };
  });
  return { rows, activeKeys };
}

export class WorkerLocalLlmError extends Error {
  constructor(
    public readonly code: InventorySyncDecision["reason"] | "worker_not_found" | "invalid_worker_owner" | "capability_unsupported",
    message: string,
    public readonly statusCode = 409,
  ) {
    super(message);
    this.name = "WorkerLocalLlmError";
  }
}

export function normalizeWorkerMessageContent(content: unknown): string | Array<string | { type: "image_ref"; storageRef: string }> {
  if (typeof content === "string") return content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new WorkerLocalLlmError("capability_unsupported", "Worker Local LLM requires text or managed image references", 422);
  }
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && (part as Record<string, unknown>).type === "image_ref") {
      const storageRef = (part as Record<string, unknown>).storageRef;
      if (typeof storageRef === "string" && storageRef.trim().length > 0 && storageRef.length <= 160) {
        return { type: "image_ref", storageRef };
      }
    }
    throw new WorkerLocalLlmError("capability_unsupported", "External image URLs are not allowed for Worker Local LLM", 422);
  });
}

export async function syncWorkerLlmInventory(input: {
  auth: WorkerAccessAuthContext;
  workerId: string;
  idempotencyKey: string;
  inventory: WorkerLlmInventory;
}) {
  if (input.auth.workerId !== input.workerId) {
    throw new WorkerLocalLlmError("worker_not_found", "Worker identity does not match token", 403);
  }
  const parsed = workerLlmInventorySchema.parse(input.inventory);
  const db = await getDb();
  const [worker] = await db
    .select({ tenantId: workers.tenantId, ownerUserId: workers.registeredByUserId })
    .from(workers)
    .where(and(eq(workers.id, input.workerId), eq(workers.tenantId, input.auth.tenantId)))
    .limit(1);
  if (!worker) throw new WorkerLocalLlmError("worker_not_found", "Worker not found", 404);
  if (!worker.ownerUserId) throw new WorkerLocalLlmError("invalid_worker_owner", "Worker owner is unavailable", 409);
  const hash = hashWorkerLlmInventory(parsed);
  const current = await db
    .select({ revision: workerLlmInventorySync.lastAcceptedRevision, hash: workerLlmInventorySync.lastInventoryHash, idempotencyKey: workerLlmInventorySync.lastIdempotencyKey })
    .from(workerLlmInventorySync)
    .where(and(eq(workerLlmInventorySync.tenantId, input.auth.tenantId), eq(workerLlmInventorySync.workerId, input.workerId)))
    .limit(1);
  const decision = evaluateWorkerLlmInventoryUpdate({
    current: current[0] ?? null,
    revision: parsed.inventoryRevision,
    hash,
    idempotencyKey: input.idempotencyKey,
  });
  if (decision.kind === "reject") throw new WorkerLocalLlmError(decision.reason, "Inventory update rejected");
  if (decision.kind === "replay") {
    const existing = await db
      .select({ modelRef: workerLlmModels.modelRef, localProviderId: workerLlmModels.localProviderId, localModelId: workerLlmModels.localModelId })
      .from(workerLlmModels)
      .where(and(eq(workerLlmModels.tenantId, input.auth.tenantId), eq(workerLlmModels.workerId, input.workerId), eq(workerLlmModels.inventoryRevision, parsed.inventoryRevision), eq(workerLlmModels.tombstoned, false)));
    return { accepted: true, replay: true, inventoryRevision: parsed.inventoryRevision, models: existing };
  }

  const projection = projectWorkerLlmInventory({
    tenantId: input.auth.tenantId,
    workerId: input.workerId,
    ownerUserId: worker.ownerUserId,
    inventory: parsed,
  });
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.insert(workerLlmInventorySync).values({
      tenantId: input.auth.tenantId,
      workerId: input.workerId,
      ownerUserId: worker.ownerUserId,
      lastAcceptedRevision: parsed.inventoryRevision,
      lastInventoryHash: hash,
      lastIdempotencyKey: input.idempotencyKey,
      lastSyncedAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [workerLlmInventorySync.tenantId, workerLlmInventorySync.workerId],
      set: {
        ownerUserId: worker.ownerUserId,
        lastAcceptedRevision: parsed.inventoryRevision,
        lastInventoryHash: hash,
        lastIdempotencyKey: input.idempotencyKey,
        lastSyncedAt: now,
        updatedAt: now,
      },
    });
    for (const row of projection.rows) {
      await tx.insert(workerLlmModels).values(row).onConflictDoUpdate({
        target: [workerLlmModels.tenantId, workerLlmModels.workerId, workerLlmModels.localProviderId, workerLlmModels.providerModelId],
        set: { ...row, updatedAt: now },
      });
    }
    await tx.update(workerLlmModels).set({ tombstoned: true, enabled: false, updatedAt: now }).where(and(
      eq(workerLlmModels.tenantId, input.auth.tenantId),
      eq(workerLlmModels.workerId, input.workerId),
      lt(workerLlmModels.inventoryRevision, parsed.inventoryRevision),
    ));
  });
  return {
    accepted: true,
    replay: false,
    inventoryRevision: parsed.inventoryRevision,
    models: projection.rows.map(({ modelRef, localProviderId, localModelId }) => ({ modelRef, localProviderId, localModelId })),
  };
}

export async function queueWorkerLlmInvoke(input: {
  tenantId: string;
  userId: number;
  modelRef: string;
  messages: Array<{ role?: string; content?: unknown }>;
  stream: boolean;
  maxTokens?: number;
  temperature?: number;
  extraBodyParams?: Record<string, unknown>;
  idempotencyKey?: string;
}) {
  const featureFlags = await getTenantFeatureFlags(input.tenantId);
  if (!featureFlags.workerLocalLlmModels) {
    throw new WorkerLocalLlmError("worker_not_found", "Worker Local LLM is disabled for this tenant", 404);
  }
  const db = await getDb();
  const [row] = await db
    .select({
      modelRef: workerLlmModels.modelRef,
      localProviderId: workerLlmModels.localProviderId,
      localModelId: workerLlmModels.localModelId,
      providerModelId: workerLlmModels.providerModelId,
      capabilitiesJson: workerLlmModels.capabilitiesJson,
      readiness: workerLlmModels.status,
      enabled: workerLlmModels.enabled,
      tombstoned: workerLlmModels.tombstoned,
      inventoryRevision: workerLlmModels.inventoryRevision,
      lastInventoryAt: workerLlmModels.lastInventoryAt,
      workerId: workers.id,
      workerStatus: workers.status,
      ownerUserId: workerLlmModels.ownerUserId,
      workerRuntimeType: workers.runtimeType,
      workerCapabilitiesJson: workers.capabilitiesJson,
    })
    .from(workerLlmModels)
    .innerJoin(workers, eq(workerLlmModels.workerId, workers.id))
    .where(and(eq(workerLlmModels.tenantId, input.tenantId), eq(workerLlmModels.modelRef, input.modelRef)))
    .limit(1);
  if (!row) throw new WorkerLocalLlmError("worker_not_found", "Worker Local LLM model is not available", 404);

  const activeGroupRows = await db
    .select({ groupId: groupMembers.groupId, ownerId: userGroups.ownerId })
    .from(groupMembers)
    .innerJoin(userGroups, eq(groupMembers.groupId, userGroups.id))
    .where(and(eq(groupMembers.userId, input.userId), eq(groupMembers.status, "active"), eq(userGroups.tenantId, input.tenantId), isNull(userGroups.deletedAt)));
  const policy = readWorkerSharingPolicy(row.workerCapabilitiesJson);
  if (!canAccessWorkerLlmModel({ actorId: input.userId, ownerId: row.ownerUserId, policy, activeGroupIds: activeGroupRows.filter((group) => group.ownerId === row.ownerUserId).map((group) => group.groupId) })) {
    throw new WorkerLocalLlmError("worker_not_found", "Worker Local LLM model is not available", 404);
  }
  if (!isWorkerLlmRowSelectable(row)) throw new WorkerLocalLlmError("stale_revision", "Worker Local LLM model is offline or stale", 409);
  const requiredCapability = input.messages.some((message) => Array.isArray(message.content) && message.content.some((part) => typeof part === "object" && part !== null && (part as Record<string, unknown>).type === "image_url")) ? "llm.vision" : "llm.chat";
  if (!row.capabilitiesJson.includes(requiredCapability)) throw new WorkerLocalLlmError("revision_conflict", "Worker Local LLM model does not support this request", 409);

  const requestId = crypto.randomUUID();
  const request: WorkerLlmInvoke = {
    schemaVersion: "worker-llm-invoke/1",
    requestId,
    modelRef: row.modelRef,
    localProviderId: row.localProviderId,
    localModelId: row.localModelId,
    inventoryRevision: row.inventoryRevision,
    task: requiredCapability === "llm.vision" ? "vision" : "chat",
    requiredCapabilities: [requiredCapability],
    messages: input.messages.map((message) => ({ role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user", content: normalizeWorkerMessageContent(message.content) })),
    parameters: {
      ...(input.maxTokens != null ? { maxTokens: input.maxTokens } : {}),
      ...(input.temperature != null ? { temperature: input.temperature } : {}),
      ...(input.extraBodyParams ?? {}),
    },
    responseFormat: "text",
    stream: input.stream,
    privacyMode: "local_only",
  };
  const parsedRequest = workerLlmInvokeSchema.parse(request);
  const idempotencyKey = (input.idempotencyKey ?? `llm:${requestId}`).slice(0, 128);
  const existing = await db.select().from(workerJobs).where(and(eq(workerJobs.tenantId, input.tenantId), eq(workerJobs.idempotencyKey, idempotencyKey))).limit(1);
  if (existing[0]) return { created: false, job: existing[0] };
  const [job] = await db.insert(workerJobs).values({
    tenantId: input.tenantId,
    workerId: row.workerId,
    runtimeType: row.workerRuntimeType,
    requestedByUserId: input.userId,
    jobType: "llm_invoke",
    resourceProfile: "cpu_light",
    capabilityRequirementsJson: {
      capabilityFamilies: ["llm_gateway", requiredCapability],
      requiredClaimCapability: "llm_invoke",
      preferredWorkerId: row.workerId,
      modelRef: row.modelRef,
      inventoryRevision: row.inventoryRevision,
    },
    inputJson: parsedRequest,
    instructionsJson: { privacyMode: "local_only", sourceType: "worker_app" },
    timeoutSeconds: 600,
    idempotencyKey,
  }).returning();
  return { created: true, job };
}
