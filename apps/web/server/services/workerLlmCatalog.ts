import { and, eq, isNull } from "drizzle-orm";

import { workerLlmModels, workers, groupMembers, userGroups } from "../../drizzle/schema";
import { getDb } from "../db";
import type { EnabledLlmModelRow } from "./enabledLlmModels";
import { canAccessWorkerLlmModel, isWorkerLlmRowSelectable, type WorkerLlmSharePolicy } from "./workerLocalLlmService";
import type { WorkerLlmTask } from "../../shared/workerLocalLlm";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";

export type WorkerLlmCatalogRow = {
  id: string;
  name: string;
  provider: "worker_app";
  providerDisplayName: string;
  contextLength?: number;
  sourceType: "worker_app";
  modelRef: string;
  workerId: string;
  workerName: string;
  localProviderId: string;
  capabilities: string[];
  readiness: string;
  workerStatus: string;
  lastInventoryAt: string | null;
  selectable: boolean;
  privacyMode: "local_only" | "worker_relay";
};

export type ActorLlmCatalog = {
  models: Array<EnabledLlmModelRow | WorkerLlmCatalogRow>;
  providers: Array<Record<string, unknown>>;
};

function readWorkerSharingPolicy(value: unknown): WorkerLlmSharePolicy {
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

export function filterVisibleWorkerLlmRows(input: {
  actorId: number;
  now?: Date;
  rows: Array<{
    ownerUserId: number;
    sharingPolicy: WorkerLlmSharePolicy;
    activeGroupIds: number[];
    enabled: boolean;
    tombstoned: boolean;
    readiness: string;
    workerStatus: string;
    lastInventoryAt: Date | string | null;
  }>;
}): boolean[] {
  return input.rows.map((row) => canAccessWorkerLlmModel({
    actorId: input.actorId,
    ownerId: row.ownerUserId,
    policy: row.sharingPolicy,
    activeGroupIds: row.activeGroupIds,
  }));
}

function requiredCapabilityForTask(task: WorkerLlmTask): string {
  return task === "vision" ? "llm.vision" : task === "embedding" ? "llm.embedding" : task === "completion" ? "llm.completion" : "llm.chat";
}

export function mapWorkerLlmCatalogRow(row: {
  modelRef: string;
  displayName: string;
  providerKind: string;
  localProviderId: string;
  capabilitiesJson: string[];
  readiness: string;
  enabled: boolean;
  tombstoned: boolean;
  workerId: string;
  workerName: string;
  workerStatus: string;
  lastInventoryAt: Date | null;
  contextWindow: number | null;
}, task: WorkerLlmTask, now = new Date()): WorkerLlmCatalogRow {
  const capability = requiredCapabilityForTask(task);
  return {
    id: row.modelRef,
    name: row.displayName,
    provider: "worker_app",
    providerDisplayName: `${row.workerName} · ${row.providerKind}`,
    ...(row.contextWindow ? { contextLength: row.contextWindow } : {}),
    sourceType: "worker_app",
    modelRef: row.modelRef,
    workerId: row.workerId,
    workerName: row.workerName,
    localProviderId: row.localProviderId,
    capabilities: row.capabilitiesJson,
    readiness: row.readiness,
    workerStatus: row.workerStatus,
    lastInventoryAt: row.lastInventoryAt?.toISOString() ?? null,
    selectable: row.capabilitiesJson.includes(capability) && isWorkerLlmRowSelectable({ ...row, now }),
    privacyMode: "local_only",
  };
}

export async function listAvailableLlmModelsForActor(input: {
  tenantId: string;
  userId: number;
  task?: WorkerLlmTask;
}): Promise<ActorLlmCatalog> {
  const task = input.task ?? "chat";
  const [{ loadEnabledLlmModelRows }, db] = await Promise.all([
    import("./enabledLlmModels"),
    getDb(),
  ]);
  const globalModels = await loadEnabledLlmModelRows();
  if (!db) return { models: globalModels, providers: [] };

  const workerModels = await listVisibleWorkerLlmModels({ tenantId: input.tenantId, userId: input.userId, task });
  return {
    models: [...globalModels, ...workerModels],
    providers: workerModels.length > 0 ? [{ name: "worker_app", displayName: "Worker Local AI" }] : [],
  };
}

export async function listVisibleWorkerLlmModels(input: {
  tenantId: string;
  userId: number;
  task?: WorkerLlmTask;
}): Promise<WorkerLlmCatalogRow[]> {
  const task = input.task ?? "chat";
  const featureFlags = await getTenantFeatureFlags(input.tenantId);
  if (!featureFlags.workerLocalLlmModels) return [];
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      modelRef: workerLlmModels.modelRef,
      displayName: workerLlmModels.displayName,
      providerKind: workerLlmModels.providerKind,
      localProviderId: workerLlmModels.localProviderId,
      capabilitiesJson: workerLlmModels.capabilitiesJson,
      readiness: workerLlmModels.status,
      enabled: workerLlmModels.enabled,
      tombstoned: workerLlmModels.tombstoned,
      ownerUserId: workerLlmModels.ownerUserId,
      workerId: workers.id,
      workerName: workers.displayName,
      workerStatus: workers.status,
      lastInventoryAt: workerLlmModels.lastInventoryAt,
      contextWindow: workerLlmModels.contextWindow,
      capabilitiesWorkerJson: workers.capabilitiesJson,
    })
    .from(workerLlmModels)
    .innerJoin(workers, eq(workerLlmModels.workerId, workers.id))
    .where(eq(workerLlmModels.tenantId, input.tenantId));

  const groupRows = await db
    .select({ groupId: groupMembers.groupId, ownerId: userGroups.ownerId })
    .from(groupMembers)
    .innerJoin(userGroups, eq(groupMembers.groupId, userGroups.id))
    .where(and(eq(groupMembers.userId, input.userId), eq(groupMembers.status, "active"), eq(userGroups.tenantId, input.tenantId), isNull(userGroups.deletedAt)));
  const activeGroupsByOwner = new Map<number, number[]>();
  for (const group of groupRows) {
    const list = activeGroupsByOwner.get(group.ownerId) ?? [];
    list.push(group.groupId);
    activeGroupsByOwner.set(group.ownerId, list);
  }

  return rows
    .filter((row) => canAccessWorkerLlmModel({
      actorId: input.userId,
      ownerId: row.ownerUserId,
      policy: readWorkerSharingPolicy(row.capabilitiesWorkerJson),
      activeGroupIds: activeGroupsByOwner.get(row.ownerUserId) ?? [],
    }))
    .map((row) => mapWorkerLlmCatalogRow(row, task));
}
