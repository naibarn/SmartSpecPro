import {
  workerSeriesProjectionSchema,
  workerSeriesPrincipalSchema,
  type WorkerSeriesPrincipal,
  type WorkerSeriesProjection,
} from "../../shared/workerSeriesControlPlane";

export type WorkerSeriesAccessWorker = {
  id: string;
  tenantId: string;
  registeredByUserId: number | null;
  teamId?: string | null;
  status: string;
};

export type WorkerSeriesAccessSeries = {
  id: number;
  tenantId: string;
  userId: number;
  title: string;
  status: string;
  updatedAt: Date | string;
  policy?: unknown;
};

type WorkerSeriesSharePolicy = {
  mode: "private" | "group" | "tenant";
  userIds: number[];
  groupIds: string[];
  revision: string;
};

function readSharePolicy(value: unknown): WorkerSeriesSharePolicy {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const workerAccess = record.workerAccess && typeof record.workerAccess === "object" && !Array.isArray(record.workerAccess)
    ? record.workerAccess as Record<string, unknown>
    : {};
  const mode = workerAccess.mode === "group" || workerAccess.mode === "tenant"
    ? workerAccess.mode
    : "private";
  const userIds = Array.isArray(workerAccess.userIds)
    ? workerAccess.userIds.filter((id): id is number => Number.isInteger(id) && id > 0).slice(0, 100)
    : [];
  const groupIds = Array.isArray(workerAccess.groupIds)
    ? workerAccess.groupIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map(id => id.trim()).slice(0, 100)
    : [];
  const revision = typeof workerAccess.revision === "string" && workerAccess.revision.trim().length > 0
    ? workerAccess.revision.trim()
    : "worker-access-v1";
  return { mode, userIds, groupIds, revision };
}

function resolveSeriesAccess(series: WorkerSeriesAccessSeries, principal: WorkerSeriesPrincipal): {
  allowed: boolean;
  accessMode: WorkerSeriesPrincipal["accessMode"];
  accessSource: WorkerSeriesPrincipal["accessSource"];
  policyRevision: string;
} {
  if (series.tenantId !== principal.tenantId) {
    return { allowed: false, accessMode: "read", accessSource: "owner", policyRevision: principal.policyRevision };
  }
  if (series.userId === principal.userId) {
    return { allowed: true, accessMode: principal.accessMode, accessSource: "owner", policyRevision: principal.policyRevision };
  }
  const policy = readSharePolicy(series.policy);
  const groupMatch = policy.mode === "group" && policy.groupIds.some(groupId => principal.groupIds.includes(groupId));
  const userMatch = policy.userIds.includes(principal.userId);
  const tenantMatch = policy.mode === "tenant";
  if (!groupMatch && !userMatch && !tenantMatch) {
    return { allowed: false, accessMode: "read", accessSource: "owner", policyRevision: policy.revision };
  }
  const canOperate = principal.accessMode === "operate";
  return {
    allowed: true,
    accessMode: canOperate ? "operate" : "read",
    accessSource: tenantMatch ? "tenant_policy" : groupMatch ? "group" : "explicit_binding",
    policyRevision: policy.revision,
  };
}

export function resolveWorkerSeriesPrincipal(input: {
  worker: WorkerSeriesAccessWorker;
  grantedScopes: readonly string[];
  authorityRevision: string;
  policyRevision: string;
}): WorkerSeriesPrincipal | null {
  if (!input.worker.registeredByUserId || input.worker.status === "disabled") {
    return null;
  }
  const canOperate = input.grantedScopes.includes("series:bind") || input.grantedScopes.includes("series:media:process");
  return workerSeriesPrincipalSchema.parse({
    workerId: input.worker.id,
    tenantId: input.worker.tenantId,
    userId: input.worker.registeredByUserId,
    groupIds: input.worker.teamId ? [input.worker.teamId] : [],
    accessMode: canOperate ? "operate" : "read",
    accessSource: "owner",
    authorityRevision: input.authorityRevision,
    policyRevision: input.policyRevision,
  });
}

export function projectWorkerSeries(input: {
  series: WorkerSeriesAccessSeries;
  principal: WorkerSeriesPrincipal;
  bindingStatus?: WorkerSeriesProjection["bindingStatus"];
  bindingRevision?: number | null;
  capabilities?: Partial<Pick<WorkerSeriesProjection, "canBind" | "canProcess" | "canPublish">>;
}): WorkerSeriesProjection | null {
  const access = resolveSeriesAccess(input.series, input.principal);
  if (!access.allowed) {
    return null;
  }
  const status = input.series.status === "archived" ? "archived" : input.series.status === "active" ? "active" : "draft";
  return workerSeriesProjectionSchema.parse({
    seriesId: String(input.series.id),
    title: input.series.title,
    status,
    accessMode: access.accessMode,
    accessSource: access.accessSource,
    authorityRevision: input.principal.authorityRevision,
    bindingRevision: input.bindingRevision ?? null,
    bindingStatus: input.bindingStatus ?? null,
    canBind: input.capabilities?.canBind ?? access.accessMode === "operate",
    canProcess: input.capabilities?.canProcess ?? access.accessMode === "operate",
    canPublish: input.capabilities?.canPublish ?? access.accessMode === "operate",
    updatedAt: new Date(input.series.updatedAt).toISOString(),
  });
}

export function isWorkerSeriesAccessible(series: WorkerSeriesAccessSeries, principal: WorkerSeriesPrincipal): boolean {
  return resolveSeriesAccess(series, principal).allowed;
}

export function isWorkerSeriesActionAllowed(principal: WorkerSeriesPrincipal, action: string): boolean {
  if (action === "select" || action === "review") return true;
  return principal.accessMode === "operate";
}
