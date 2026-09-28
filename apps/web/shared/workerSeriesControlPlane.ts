import { z } from "zod";

/**
 * Shared contract for the Worker Series control plane.  This module contains
 * transport-safe data only; server authority is always resolved from the
 * authenticated Worker and the persisted Series records.
 */
export const WORKER_SERIES_CONTROL_PLANE_CONTRACT_VERSION = "2026-08-25.1";

export const workerSeriesScopeRegistry = [
  { scope: "series:read", operation: "discover", mutating: false },
  { scope: "series:bind", operation: "bind", mutating: true },
  { scope: "series:scan", operation: "scan", mutating: true },
  { scope: "series:media:process", operation: "process", mutating: true },
  { scope: "series:media:publish", operation: "publish", mutating: true },
] as const;

export const workerSeriesScopeValues = workerSeriesScopeRegistry.map(
  (entry) => entry.scope
) as [string, ...string[]];
export type WorkerSeriesScope = (typeof workerSeriesScopeRegistry)[number]["scope"];
export const workerSeriesScopeSchema = z.enum(workerSeriesScopeValues as [WorkerSeriesScope, ...WorkerSeriesScope[]]);

export const workerSeriesAccessSourceValues = [
  "owner",
  "group",
  "tenant_policy",
  "explicit_binding",
] as const;
export const workerSeriesAccessModeValues = ["read", "operate"] as const;
export const workerSeriesBindingStatusValues = [
  "pending",
  "active",
  "stale",
  "revoking",
  "revoked",
  "quarantined",
] as const;
export const workerSeriesJobActionValues = [
  "select",
  "bind",
  "scan",
  "process",
  "review",
  "publish",
  "index",
  "queue",
  "pause",
  "resume",
  "cancel",
  "retry",
] as const;

export const workerSeriesAccessSourceSchema = z.enum(workerSeriesAccessSourceValues);
export const workerSeriesAccessModeSchema = z.enum(workerSeriesAccessModeValues);
export const workerSeriesBindingStatusSchema = z.enum(workerSeriesBindingStatusValues);
export const workerSeriesJobActionSchema = z.enum(workerSeriesJobActionValues);

/**
 * Durable Series-level Worker sharing policy. The revision is server-owned;
 * clients may send an expected revision for optimistic concurrency but never
 * choose the authority revision themselves.
 */
export const workerSeriesAccessPolicySchema = z
  .object({
    mode: z.enum(["private", "group", "tenant"]),
    userIds: z.array(z.number().int().positive()).max(100),
    groupIds: z.array(z.string().trim().min(1).max(128)).max(100),
    revision: z.string().trim().min(1).max(128),
  })
  .strict();
export type WorkerSeriesAccessPolicy = z.infer<typeof workerSeriesAccessPolicySchema>;

export const workerSeriesPrincipalSchema = z
  .object({
    workerId: z.string().trim().min(1).max(128),
    tenantId: z.string().trim().min(1).max(128),
    userId: z.number().int().positive(),
    groupIds: z.array(z.string().trim().min(1).max(128)).max(100),
    accessMode: workerSeriesAccessModeSchema,
    accessSource: workerSeriesAccessSourceSchema,
    authorityRevision: z.string().trim().min(1).max(128),
    policyRevision: z.string().trim().min(1).max(128),
  })
  .strict();
export type WorkerSeriesPrincipal = z.infer<typeof workerSeriesPrincipalSchema>;

export const workerSeriesProjectionSchema = z
  .object({
    seriesId: z.string().trim().min(1).max(128),
    title: z.string().trim().min(1).max(300),
    status: z.enum(["draft", "active", "archived"]),
    accessMode: workerSeriesAccessModeSchema,
    accessSource: workerSeriesAccessSourceSchema,
    authorityRevision: z.string().trim().min(1).max(128),
    bindingRevision: z.number().int().positive().nullable(),
    bindingStatus: workerSeriesBindingStatusSchema.nullable(),
    canBind: z.boolean().default(false),
    canProcess: z.boolean().default(false),
    canPublish: z.boolean().default(false),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type WorkerSeriesProjection = z.infer<typeof workerSeriesProjectionSchema>;

const safeLabelSchema = z.string().trim().min(1).max(160);
const safeIdSchema = z.string().trim().min(1).max(128);

export const workerSeriesQuickActionSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("select"), seriesId: safeIdSchema }).strict(),
    z.object({ action: z.literal("bind"), seriesId: safeIdSchema, rootId: safeIdSchema, expectedRevision: safeIdSchema }).strict(),
    z.object({ action: z.literal("scan"), seriesId: safeIdSchema, bindingId: safeIdSchema }).strict(),
    z.object({ action: z.literal("process"), seriesId: safeIdSchema, assetIds: z.array(safeIdSchema).min(1).max(500), profileId: safeIdSchema }).strict(),
    z.object({ action: z.literal("review"), seriesId: safeIdSchema, assetIds: z.array(safeIdSchema).max(500) }).strict(),
    z.object({ action: z.literal("publish"), seriesId: safeIdSchema, assetIds: z.array(safeIdSchema).min(1).max(500) }).strict(),
    z.object({ action: z.literal("index"), seriesId: safeIdSchema, assetIds: z.array(safeIdSchema).max(500) }).strict(),
    z.object({ action: z.literal("queue"), seriesId: safeIdSchema, jobIds: z.array(safeIdSchema).min(1).max(500) }).strict(),
    z.object({ action: z.literal("pause"), seriesId: safeIdSchema, jobIds: z.array(safeIdSchema).min(1).max(500), reason: safeLabelSchema }).strict(),
    z.object({ action: z.literal("resume"), seriesId: safeIdSchema, jobIds: z.array(safeIdSchema).min(1).max(500) }).strict(),
    z.object({ action: z.literal("cancel"), seriesId: safeIdSchema, jobIds: z.array(safeIdSchema).min(1).max(500), reason: safeLabelSchema }).strict(),
    z.object({ action: z.literal("retry"), seriesId: safeIdSchema, jobIds: z.array(safeIdSchema).min(1).max(500) }).strict(),
  ]);
export type WorkerSeriesQuickAction = z.infer<typeof workerSeriesQuickActionSchema>;

export const workerSeriesQuickActionRequestSchema = z
  .object({
    requestId: safeIdSchema,
    idempotencyKey: z.string().trim().min(8).max(160),
    action: workerSeriesQuickActionSchema,
  })
  .strict();

export const workerSeriesCursorPayloadSchema = z
  .object({
    version: z.literal(1),
    tenantId: safeIdSchema,
    userId: z.number().int().positive(),
    filterHash: z.string().regex(/^[a-f0-9]{64}$/),
    offset: z.number().int().nonnegative(),
    authorityRevision: safeIdSchema,
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type WorkerSeriesCursorPayload = z.infer<typeof workerSeriesCursorPayloadSchema>;

export const workerSeriesErrorCodeValues = [
  "WORKER_AUTH_REQUIRED",
  "WORKER_PERMISSION_DENIED",
  "WORKER_SCOPE_DENIED",
  "SERIES_NOT_FOUND",
  "SERIES_ACCESS_DENIED",
  "SERIES_BINDING_CONFLICT",
  "SERIES_BINDING_REVOKED",
  "WORKER_NOT_READY",
  "ROOT_NOT_ALLOWED",
  "IDEMPOTENCY_CONFLICT",
  "STALE_REVISION",
  "ACTION_NOT_ALLOWED",
  "CAPABILITY_BLOCKED",
  "ARTIFACT_OWNERSHIP_FAILED",
  "ARTIFACT_CHECKSUM_MISMATCH",
  "QC_FAILED",
  "PUBLICATION_REJECTED",
] as const;
export const workerSeriesErrorCodeSchema = z.enum(workerSeriesErrorCodeValues);
export const workerSeriesErrorSchema = z
  .object({
    code: workerSeriesErrorCodeSchema,
    messageKey: z.string().trim().min(1).max(160),
    requestId: safeIdSchema,
    contractVersion: z.literal(WORKER_SERIES_CONTROL_PLANE_CONTRACT_VERSION),
    retryable: z.boolean(),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  })
  .strict();

export const workerSeriesIdempotencyRecordSchema = z
  .object({
    key: z.string().trim().min(8).max(160),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["accepted", "completed", "failed"]),
    responseCode: z.number().int().min(100).max(599).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export function hashWorkerSeriesRequest(value: unknown): string {
  // This is a portable deterministic body fingerprint for cursor/idempotency
  // binding. The server may replace it with a cryptographic digest at its
  // persistence boundary; clients must never use it as an authority token.
  const input = JSON.stringify(value);
  const lanes = [
    2166136261,
    2654435761,
    2246822519,
    3266489917,
    668265263,
    374761393,
    1103515245,
    123456789,
  ];
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    for (let lane = 0; lane < lanes.length; lane += 1) {
      lanes[lane] ^= code + lane * 17;
      lanes[lane] = Math.imul(lanes[lane], 16777619 + lane * 2_654_435_761);
    }
  }
  return lanes.map((lane) => (lane >>> 0).toString(16).padStart(8, "0")).join("");
}

export function buildWorkerSeriesFilterHash(filters: Record<string, string | number | boolean | null>): string {
  const stable: Record<string, string | number | boolean | null> = {};
  for (const key of Object.keys(filters).sort()) stable[key] = filters[key];
  return hashWorkerSeriesRequest(stable);
}

export function deriveWorkerSeriesScopes(input: {
  requested: readonly string[];
  granted: readonly string[];
  accessMode: "read" | "operate";
}): WorkerSeriesScope[] {
  const granted = new Set(input.granted);
  return workerSeriesScopeRegistry
    .filter((entry) => input.requested.includes(entry.scope) && granted.has(entry.scope))
    .filter((entry) => input.accessMode === "operate" || !entry.mutating)
    .map((entry) => entry.scope);
}

export function createWorkerSeriesError(
  code: z.infer<typeof workerSeriesErrorCodeSchema>,
  requestId: string,
  options: { retryable?: boolean; details?: Record<string, string | number | boolean | null> } = {}
) {
  return workerSeriesErrorSchema.parse({
    code,
    messageKey: `workerSeries.${code}`,
    requestId,
    contractVersion: WORKER_SERIES_CONTROL_PLANE_CONTRACT_VERSION,
    retryable: options.retryable ?? false,
    details: options.details ?? {},
  });
}
