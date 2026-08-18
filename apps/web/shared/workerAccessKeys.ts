import { z } from "zod";
import {
  workerModeSchema,
  workerRuntimeTypeSchema,
  workerStatusSchema,
} from "./workerRuntime";

export const workerLlmRoutingModeValues = ["auto", "pinned_provider"] as const;
export type WorkerLlmRoutingMode = (typeof workerLlmRoutingModeValues)[number];
export const workerLlmRoutingModeSchema = z.enum(workerLlmRoutingModeValues);

export const workerAccessPermissionScopeValues = [
  "workers:register",
  "workers:heartbeat",
  "workers:claim",
  "workers:report",
  "workers:diagnostics",
  "llm:chat",
  "delegate:http",
  "delegate:mcp",
  "callbacks:publish",
  "library:read",
  "library:download",
  "library:write",
  "media:read",
  "media:download",
  "rag:read",
  "rag:write",
  "skills:execute",
  "agents:execute",
  "workos:read",
  "workos:write",
] as const;

export type WorkerAccessPermissionScope =
  (typeof workerAccessPermissionScopeValues)[number];
export const workerAccessPermissionScopeSchema = z.enum(workerAccessPermissionScopeValues);

export const workerAccessPermissionPresetValues = [
  "readonly",
  "operator_basic",
  "content_worker",
  "knowledge_worker",
  "work_os_worker",
  "full_personal_worker",
  "custom",
] as const;

export type WorkerAccessPermissionPreset =
  (typeof workerAccessPermissionPresetValues)[number];
export const workerAccessPermissionPresetSchema = z.enum(workerAccessPermissionPresetValues);

export const workerAccessQuotaPolicySchema = z.object({
  quotaHourly: z.number().int().positive().nullable().optional().default(null),
  quotaDaily: z.number().int().positive().nullable().optional().default(null),
  quotaWeekly: z.number().int().positive().nullable().optional().default(null),
  quotaMonthly: z.number().int().positive().nullable().optional().default(null),
});

export type WorkerAccessQuotaPolicy = z.infer<typeof workerAccessQuotaPolicySchema>;

export const connectedWorkerSharingModeValues = ["private", "groups", "tenant"] as const;
export type ConnectedWorkerSharingMode =
  (typeof connectedWorkerSharingModeValues)[number];
export const connectedWorkerSharingModeSchema = z.enum(connectedWorkerSharingModeValues);

export const connectedWorkerShareGroupSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(128),
});

export type ConnectedWorkerShareGroup = z.infer<typeof connectedWorkerShareGroupSchema>;

export const connectedWorkerRecordSchema = z.object({
  workerId: z.string().min(1),
  displayName: z.string().min(1),
  externalReference: z.string().min(1),
  runtimeType: workerRuntimeTypeSchema,
  runtimeLabel: z.string().min(1),
  runtimeFamily: z.string().min(1),
  workerTypeKey: z.string().min(1),
  workerTypeLabel: z.string().min(1),
  workerMode: workerModeSchema,
  status: workerStatusSchema,
  machineId: z.string().min(1).nullable().optional().default(null),
  machineName: z.string().min(1).nullable().optional().default(null),
  runtimeVersion: z.string().min(1).nullable().optional().default(null),
  lastSeenAt: z.string().datetime().or(z.string().min(1)).nullable().optional().default(null),
  teamId: z.string().min(1).nullable().optional().default(null),
  sharingMode: connectedWorkerSharingModeSchema.default("private"),
  sharedGroups: z.array(connectedWorkerShareGroupSchema).default([]),
  preferredProviderName: z.string().min(1).nullable().optional().default(null),
  permissionPreset: z.string().min(1).nullable().optional().default(null),
  permissionScopeCount: z.number().int().nonnegative().default(0),
  quotaDisplayLabel: z.string().min(1).nullable().optional().default(null),
});

export type ConnectedWorkerRecord = z.infer<typeof connectedWorkerRecordSchema>;

const READONLY_PERMISSION_SCOPES: WorkerAccessPermissionScope[] = [
  "workers:register",
  "workers:heartbeat",
  "workers:claim",
  "workers:report",
  "workers:diagnostics",
  "llm:chat",
  "library:read",
  "library:download",
  "media:read",
  "media:download",
  "rag:read",
  "workos:read",
];

const OPERATOR_BASIC_PERMISSION_SCOPES: WorkerAccessPermissionScope[] = [
  ...READONLY_PERMISSION_SCOPES,
  "delegate:http",
  "callbacks:publish",
  "skills:execute",
  "agents:execute",
  "workos:write",
];

const CONTENT_WORKER_PERMISSION_SCOPES: WorkerAccessPermissionScope[] = [
  ...OPERATOR_BASIC_PERMISSION_SCOPES,
  "library:write",
  "rag:write",
];

const KNOWLEDGE_WORKER_PERMISSION_SCOPES: WorkerAccessPermissionScope[] = [
  ...OPERATOR_BASIC_PERMISSION_SCOPES,
  "delegate:mcp",
  "library:write",
  "rag:write",
];

const WORK_OS_WORKER_PERMISSION_SCOPES: WorkerAccessPermissionScope[] = [
  ...OPERATOR_BASIC_PERMISSION_SCOPES,
  "delegate:mcp",
];

const FULL_PERSONAL_WORKER_PERMISSION_SCOPES: WorkerAccessPermissionScope[] = [
  ...workerAccessPermissionScopeValues,
];

export const workerAccessPermissionPresetScopes: Record<
  Exclude<WorkerAccessPermissionPreset, "custom">,
  WorkerAccessPermissionScope[]
> = {
  readonly: READONLY_PERMISSION_SCOPES,
  operator_basic: OPERATOR_BASIC_PERMISSION_SCOPES,
  content_worker: CONTENT_WORKER_PERMISSION_SCOPES,
  knowledge_worker: KNOWLEDGE_WORKER_PERMISSION_SCOPES,
  work_os_worker: WORK_OS_WORKER_PERMISSION_SCOPES,
  full_personal_worker: FULL_PERSONAL_WORKER_PERMISSION_SCOPES,
};

export function getWorkerAccessPermissionScopesForPreset(
  preset: WorkerAccessPermissionPreset,
): WorkerAccessPermissionScope[] {
  if (preset === "custom") {
    return [];
  }
  return [...workerAccessPermissionPresetScopes[preset]];
}

export function normalizeWorkerAccessPermissionScopes(
  scopes: unknown,
): WorkerAccessPermissionScope[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  const seen = new Set<WorkerAccessPermissionScope>();
  const result: WorkerAccessPermissionScope[] = [];
  for (const scope of scopes) {
    if (typeof scope !== "string") {
      continue;
    }
    if (!workerAccessPermissionScopeValues.includes(scope as WorkerAccessPermissionScope)) {
      continue;
    }
    const normalized = scope as WorkerAccessPermissionScope;
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export const workerAccessKeyRecordSchema = z.object({
  keyId: z.string().min(1),
  label: z.string().min(1).max(120),
  runtimeType: workerRuntimeTypeSchema,
  llmRoutingMode: workerLlmRoutingModeSchema.default("auto"),
  preferredProviderId: z.number().int().positive().nullable().optional().default(null),
  preferredProviderName: z.string().min(1).nullable().optional().default(null),
  permissionPreset: workerAccessPermissionPresetSchema.default("readonly"),
  permissionScopes: z.array(workerAccessPermissionScopeSchema).default([]),
  quotaHourly: z.number().int().positive().nullable().optional().default(null),
  quotaDaily: z.number().int().positive().nullable().optional().default(null),
  quotaWeekly: z.number().int().positive().nullable().optional().default(null),
  quotaMonthly: z.number().int().positive().nullable().optional().default(null),
  tokenHint: z.string().min(4).max(16),
  createdAt: z.string().datetime().or(z.string().min(1)),
  expiresAt: z.string().datetime().or(z.string().min(1)).nullable().optional().default(null),
  revokedAt: z.string().datetime().or(z.string().min(1)).nullable().optional().default(null),
  lastUsedAt: z.string().datetime().or(z.string().min(1)).nullable().optional().default(null),
});

export type WorkerAccessKeyRecord = z.infer<typeof workerAccessKeyRecordSchema>;

export const workerAccessKeysPreferencesSchema = z.object({
  workerAccessKeys: z.array(workerAccessKeyRecordSchema).default([]),
});

export type WorkerAccessKeysPreferences = z.infer<
  typeof workerAccessKeysPreferencesSchema
>;

export function normalizeWorkerAccessKeysPreferences(
  prefs: unknown,
): WorkerAccessKeysPreferences {
  const parsed = workerAccessKeysPreferencesSchema.safeParse(prefs);
  if (!parsed.success) {
    return { workerAccessKeys: [] };
  }
  return parsed.data;
}
