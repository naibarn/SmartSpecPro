import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import {
  desktopDeviceAccessStateSchema,
  desktopDeviceRunSummarySchema,
  desktopDevicePolicyOverridesSchema,
  desktopDeviceDisableResponseSchema,
  desktopCapabilitySnapshotSchema,
  desktopLocalRootSchema,
  desktopManagedActionTypeSchema,
  desktopManagedActionSchema,
  desktopPackageSyncStateSchema,
  desktopRegisteredDeviceSummarySchema,
  resolveDesktopWorkerProjectionRuntimeType,
  type DesktopCapabilitySnapshot,
  type DesktopDeviceAccessState,
  type DesktopDeviceDisableRequest,
  type DesktopDeviceDisableResponse,
  type DesktopDeviceHeartbeatPayload,
  type DesktopDeviceHealthStatus,
  type DesktopDeviceOwner,
  type DesktopDevicePolicyOverrides,
  type DesktopDeviceRegistrationPayload,
  type DesktopHostDeviceStatusResponse,
  type DesktopLocalRoot,
  type DesktopManagedAction,
  type DesktopManagedActionType,
  type DesktopPackageSyncState,
  type DesktopRegisteredDeviceSummary,
  type DesktopDeviceRunSummary,
  type DesktopWorkspaceProfile,
  desktopWorkspaceProfileSchema,
} from "../../shared/desktopHost";
import type { TenantFeatureFlags } from "../../shared/featureFlags";
import { desktopDevices, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { auditLogger } from "./auditLogger";
import { buildDesktopDeviceOffboarding } from "./deviceEnrollmentService";
import { createWorkerRegistrationToken } from "./workerAuthService";
import { sanitizeWorkerPayload, sanitizeWorkerWarningFlags } from "./workerPayloadSanitizer";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";

type DesktopDeviceRecord = Record<string, any>;

interface DesktopDeviceOwnerRecord {
  id: number;
  name: string | null;
  email: string | null;
}

export interface DesktopDeviceActor {
  tenantId: string;
  userId: string | number;
  role?: string | null;
}

export interface DesktopDeviceProjectionState {
  requested: boolean;
  enabled: boolean;
  runtimeType: string | null;
  externalReference: string | null;
  registrationToken: string | null;
  reason: string | null;
}

export interface DesktopDeviceRegistryRepository {
  createDevice: (values: Record<string, unknown>) => Promise<DesktopDeviceRecord>;
  findDeviceById: (deviceId: string) => Promise<DesktopDeviceRecord | null>;
  listDevicesByTenant: (tenantId: string) => Promise<DesktopDeviceRecord[]>;
  listDevicesByTenantUser: (
    tenantId: string,
    userId: number,
  ) => Promise<DesktopDeviceRecord[]>;
  updateDevice: (deviceId: string, values: Record<string, unknown>) => Promise<DesktopDeviceRecord>;
  listUsersByIds?: (userIds: number[]) => Promise<DesktopDeviceOwnerRecord[]>;
}

export class DesktopDeviceRegistryError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "DesktopDeviceRegistryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const defaultRepo: DesktopDeviceRegistryRepository = {
  async createDevice(values) {
    const db = await getDb();
    const [device] = await db.insert(desktopDevices).values(values as any).returning();
    return device;
  },
  async findDeviceById(deviceId) {
    const db = await getDb();
    const [device] = await db
      .select()
      .from(desktopDevices)
      .where(eq(desktopDevices.id, deviceId))
      .limit(1);
    return device ?? null;
  },
  async updateDevice(deviceId, values) {
    const db = await getDb();
    const [device] = await db
      .update(desktopDevices)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(desktopDevices.id, deviceId))
      .returning();
    if (!device) {
      throw new DesktopDeviceRegistryError(
        "desktop_device_not_found",
        404,
        `Desktop device ${deviceId} was not found`,
      );
    }
    return device;
  },
  async listDevicesByTenant(tenantId) {
    const db = await getDb();
    return db
      .select()
      .from(desktopDevices)
      .where(eq(desktopDevices.tenantId, tenantId));
  },
  async listDevicesByTenantUser(tenantId, userId) {
    const db = await getDb();
    return db
      .select()
      .from(desktopDevices)
      .where(and(eq(desktopDevices.tenantId, tenantId), eq(desktopDevices.userId, userId)));
  },
  async listUsersByIds(userIds) {
    if (userIds.length === 0) {
      return [];
    }
    const db = await getDb();
    return db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, userIds));
  },
};

function parseNumericUserId(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function assertActorMatchesPayloadUser(
  actor: DesktopDeviceActor,
  payloadUserId: string | number,
): void {
  if (String(actor.userId) !== String(payloadUserId)) {
    throw new DesktopDeviceRegistryError(
      "desktop_host_user_mismatch",
      403,
      "Desktop device registration payload user does not match the authenticated user",
    );
  }
}

function assertFeatureEnabled(flags: TenantFeatureFlags): void {
  if (!flags.desktopHostEnabled) {
    throw new DesktopDeviceRegistryError(
      "feature_disabled",
      403,
      "Desktop Host is disabled for this tenant",
    );
  }
}

function inferHealthStatus(input: {
  disabledAt?: unknown;
  healthSummaryJson?: unknown;
  warningFlagsJson?: unknown;
}): DesktopDeviceHealthStatus {
  if (input.disabledAt) {
    return "disabled";
  }

  const status = typeof (input.healthSummaryJson as Record<string, unknown> | null)?.status === "string"
    ? String((input.healthSummaryJson as Record<string, unknown>).status).trim().toLowerCase()
    : "";
  if (status === "online" || status === "offline" || status === "unhealthy") {
    return status;
  }

  const warnings = sanitizeWorkerWarningFlags(input.warningFlagsJson);
  return warnings.length > 0 ? "unhealthy" : "online";
}

function inferAccessState(input: {
  disabledAt?: unknown;
  accessState?: unknown;
}): DesktopDeviceAccessState {
  if (input.disabledAt) {
    return "disabled";
  }

  const parsed = desktopDeviceAccessStateSchema.safeParse(input.accessState);
  return parsed.success ? parsed.data : "active";
}

function extractPolicyOverrides(
  policyOverridesJson: unknown,
): DesktopDevicePolicyOverrides {
  const sanitized = sanitizeWorkerPayload(policyOverridesJson);
  return desktopDevicePolicyOverridesSchema.parse(
    sanitized && typeof sanitized === "object" ? sanitized : {},
  );
}

function normalizePolicyOverrides(
  overrides: Partial<DesktopDevicePolicyOverrides> | null | undefined,
): DesktopDevicePolicyOverrides {
  return desktopDevicePolicyOverridesSchema.parse({
    allowAdvancedLocalMode: overrides?.allowAdvancedLocalMode ?? null,
    allowPackageSync: overrides?.allowPackageSync ?? null,
    allowAgencyRuntime: overrides?.allowAgencyRuntime ?? null,
    allowWorkerProjection: overrides?.allowWorkerProjection ?? null,
    maxLocalRoots: overrides?.maxLocalRoots ?? null,
    outputWritebackMode: overrides?.outputWritebackMode ?? null,
  });
}

function resolveDeviceOwner(
  device: DesktopDeviceRecord,
  ownerById: Map<number, DesktopDeviceOwnerRecord>,
): DesktopDeviceOwner {
  const numericUserId = parseNumericUserId(device.userId);
  const ownerRecord = numericUserId != null ? ownerById.get(numericUserId) ?? null : null;
  return {
    userId: numericUserId != null ? String(numericUserId) : null,
    name: ownerRecord?.name ?? null,
    email: ownerRecord?.email ?? null,
  };
}

function buildPresenceSummary(input: {
  device: DesktopDeviceRecord;
  now: Date;
  staleAfterSeconds?: number;
}) {
  const staleAfterSeconds = input.staleAfterSeconds ?? 300;
  const accessState = inferAccessState({
    disabledAt: input.device.disabledAt,
    accessState: input.device.accessState,
  });
  const lastSeenAt = toIsoStringOrNull(input.device.lastSeenAt);
  if (accessState === "disabled") {
    return {
      status: "disabled" as const,
      staleAfterSeconds,
      lastSeenAgeSeconds: null,
      reportedAt: lastSeenAt,
    };
  }

  if (!lastSeenAt) {
    return {
      status: "offline" as const,
      staleAfterSeconds,
      lastSeenAgeSeconds: null,
      reportedAt: null,
    };
  }

  const ageSeconds = Math.max(
    0,
    Math.floor((input.now.getTime() - new Date(lastSeenAt).getTime()) / 1000),
  );
  return {
    status: ageSeconds <= staleAfterSeconds ? "online" as const : "stale" as const,
    staleAfterSeconds,
    lastSeenAgeSeconds: ageSeconds,
    reportedAt: lastSeenAt,
  };
}

function buildProjectionState(input: {
  actor: DesktopDeviceActor;
  deviceId: string;
  featureFlags: TenantFeatureFlags;
  requested: boolean;
}): DesktopDeviceProjectionState {
  const runtimeType = resolveDesktopWorkerProjectionRuntimeType(input.requested);
  if (!input.requested || !runtimeType) {
    return {
      requested: false,
      enabled: false,
      runtimeType: null,
      externalReference: null,
      registrationToken: null,
      reason: "projection_not_requested",
    };
  }

  if (!input.featureFlags.desktopWorkerProjection) {
    return {
      requested: true,
      enabled: false,
      runtimeType,
      externalReference: input.deviceId,
      registrationToken: null,
      reason: "desktop_worker_projection_feature_disabled",
    };
  }

  if (!input.featureFlags.desktopZeroClawWorker) {
    return {
      requested: true,
      enabled: false,
      runtimeType,
      externalReference: input.deviceId,
      registrationToken: null,
      reason: "desktop_zeroclaw_worker_feature_disabled",
    };
  }

  return {
    requested: true,
    enabled: true,
    runtimeType,
    externalReference: input.deviceId,
    registrationToken: createWorkerRegistrationToken({
      tenantId: input.actor.tenantId,
      registeredByUserId: parseNumericUserId(input.actor.userId),
      runtimeType,
      externalReference: input.deviceId,
      subject: `desktop-device:${input.deviceId}`,
    }),
    reason: null,
  };
}

function assertDeviceAccess(
  actor: DesktopDeviceActor,
  device: DesktopDeviceRecord | null,
  expectedDeviceId: string,
): void {
  if (!device || device.id !== expectedDeviceId || device.tenantId !== actor.tenantId) {
    throw new DesktopDeviceRegistryError(
      "desktop_device_not_found",
      404,
      `Desktop device ${expectedDeviceId} was not found`,
    );
  }

  if (device.userId != null && String(device.userId) !== String(actor.userId)) {
    throw new DesktopDeviceRegistryError(
      "desktop_host_user_mismatch",
      403,
      "Desktop device does not belong to the authenticated user",
    );
  }
}

function assertTenantDeviceExists(
  actor: DesktopDeviceActor,
  device: DesktopDeviceRecord | null,
  expectedDeviceId: string,
): void {
  if (!device || device.id !== expectedDeviceId || device.tenantId !== actor.tenantId) {
    throw new DesktopDeviceRegistryError(
      "desktop_device_not_found",
      404,
      `Desktop device ${expectedDeviceId} was not found`,
    );
  }
}

function actorCanManageDevice(
  actor: DesktopDeviceActor,
  device: DesktopDeviceRecord,
): boolean {
  if (actor.role === "admin" || actor.role === "domain_admin" || actor.role === "system_agent") {
    return true;
  }
  if (device.userId != null && String(device.userId) === String(actor.userId)) {
    return true;
  }
  return false;
}

function toIsoStringOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

function extractDesktopCapabilitySnapshot(
  capabilitiesJson: unknown,
): DesktopCapabilitySnapshot {
  const sanitized = sanitizeWorkerPayload(capabilitiesJson) as Record<string, unknown>;
  return desktopCapabilitySnapshotSchema.parse({
    deviceIdentity: sanitized.deviceIdentity ?? sanitized.device_identity ?? null,
    deviceAttestationSupport:
      sanitized.deviceAttestationSupport ?? sanitized.device_attestation_support ?? null,
    localFileService: sanitized.localFileService ?? sanitized.local_file_service ?? null,
  });
}

function extractDesktopLocalRoots(
  localRootsJson: unknown,
): DesktopLocalRoot[] {
  const sanitized = sanitizeWorkerPayload(localRootsJson);
  return Array.isArray(sanitized)
    ? sanitized.map((root) => desktopLocalRootSchema.parse(root))
    : [];
}

function extractPackageCachePaths(
  packageCachePathsJson: unknown,
): string[] {
  return Array.isArray(packageCachePathsJson)
    ? packageCachePathsJson.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function extractPackageSyncState(
  packageSyncStateJson: unknown,
): DesktopPackageSyncState {
  const sanitized = sanitizeWorkerPayload(packageSyncStateJson);
  return desktopPackageSyncStateSchema.parse(
    sanitized && typeof sanitized === "object" ? sanitized : {},
  );
}

function extractPendingActions(
  pendingActionsJson: unknown,
): DesktopManagedAction[] {
  const sanitized = sanitizeWorkerPayload(pendingActionsJson);
  return Array.isArray(sanitized)
    ? sanitized.map((action) => desktopManagedActionSchema.parse(action))
    : [];
}

function extractCurrentWorkspaceProfile(
  currentWorkspaceProfileJson: unknown,
): DesktopWorkspaceProfile | null {
  const sanitized = sanitizeWorkerPayload(currentWorkspaceProfileJson);
  const payload = sanitized && typeof sanitized === "object"
    ? sanitized as Record<string, unknown>
    : {};
  return Object.keys(payload).length > 0
    ? desktopWorkspaceProfileSchema.parse(payload)
    : null;
}

function extractLastRunSummary(
  lastRunSummaryJson: unknown,
): DesktopDeviceRunSummary | null {
  const sanitized = sanitizeWorkerPayload(lastRunSummaryJson);
  const payload = sanitized && typeof sanitized === "object"
    ? sanitized as Record<string, unknown>
    : {};
  return Object.keys(payload).length > 0
    ? desktopDeviceRunSummarySchema.parse(payload)
    : null;
}

async function resolveOwnerDirectory(
  repo: DesktopDeviceRegistryRepository,
  devices: DesktopDeviceRecord[],
): Promise<Map<number, DesktopDeviceOwnerRecord>> {
  const userIds = [...new Set(
    devices
      .map((device) => parseNumericUserId(device.userId))
      .filter((userId): userId is number => userId != null),
  )];
  if (userIds.length === 0 || !repo.listUsersByIds) {
    return new Map();
  }
  const rows = await repo.listUsersByIds(userIds);
  return new Map(rows.map((row) => [row.id, row]));
}

export function summarizeDesktopDeviceRecord(
  device: DesktopDeviceRecord,
  options: {
    now?: Date;
    ownerById?: Map<number, DesktopDeviceOwnerRecord>;
    staleAfterSeconds?: number;
  } = {},
): DesktopRegisteredDeviceSummary {
  const ownerById = options.ownerById ?? new Map<number, DesktopDeviceOwnerRecord>();
  return desktopRegisteredDeviceSummarySchema.parse({
    deviceId: String(device.id),
    displayName: String(device.displayName ?? device.id),
    machineName: typeof device.machineName === "string" ? device.machineName : null,
    healthStatus: inferHealthStatus({
      disabledAt: device.disabledAt,
      healthSummaryJson: device.healthSummaryJson,
      warningFlagsJson: device.warningFlagsJson,
    }),
    accessState: inferAccessState({
      disabledAt: device.disabledAt,
      accessState: device.accessState,
    }),
    platform: sanitizeWorkerPayload(device.platform) as Record<string, unknown>,
    enrolledAt: toIsoStringOrNull(device.enrolledAt),
    lastSeenAt: toIsoStringOrNull(device.lastSeenAt),
    owner: resolveDeviceOwner(device, ownerById),
    presence: buildPresenceSummary({
      device,
      now: options.now ?? new Date(),
      staleAfterSeconds: options.staleAfterSeconds,
    }),
    workerProjectionEnabled: Boolean(device.workerProjectionEnabled),
    projectedWorkerRuntimeType: typeof device.projectedWorkerRuntimeType === "string"
      ? device.projectedWorkerRuntimeType
      : null,
    warningFlags: sanitizeWorkerWarningFlags(device.warningFlagsJson),
    capabilities: extractDesktopCapabilitySnapshot(device.capabilitiesJson),
    localRoots: extractDesktopLocalRoots(device.localRootsJson),
    packageCachePaths: extractPackageCachePaths(device.packageCachePathsJson),
    packageSyncState: extractPackageSyncState(device.packageSyncStateJson),
    pendingActions: extractPendingActions(device.pendingActionsJson),
    currentWorkspaceProfile: extractCurrentWorkspaceProfile(device.currentWorkspaceProfileJson),
    lastRunSummary: extractLastRunSummary(device.lastRunSummaryJson),
    policyVersion: typeof device.policyVersion === "string" ? device.policyVersion : null,
    policyExpiresAt: toIsoStringOrNull(device.policyExpiresAt),
    policyOverrides: extractPolicyOverrides(device.policyOverridesJson),
  });
}

export async function registerDesktopDevice(
  input: {
    actor: DesktopDeviceActor;
    payload: DesktopDeviceRegistrationPayload;
  },
  deps: {
    getFeatureFlags?: typeof getTenantFeatureFlags;
    repo?: DesktopDeviceRegistryRepository;
  } = {},
): Promise<{
  created: boolean;
  device: DesktopDeviceRecord;
  workerProjection: DesktopDeviceProjectionState;
}> {
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (input.payload.tenantId !== input.actor.tenantId) {
    throw new DesktopDeviceRegistryError(
      "desktop_host_tenant_mismatch",
      403,
      "Desktop device tenant does not match the authenticated tenant",
    );
  }
  assertActorMatchesPayloadUser(input.actor, input.payload.userId);

  const featureFlags = await getFeatureFlags(input.actor.tenantId);
  assertFeatureEnabled(featureFlags);

  const existing = await repo.findDeviceById(input.payload.deviceId);
  if (existing && existing.tenantId !== input.actor.tenantId) {
    throw new DesktopDeviceRegistryError(
      "desktop_device_conflict",
      409,
      `Desktop device ${input.payload.deviceId} is already registered to another tenant`,
    );
  }
  if (existing?.disabledAt) {
    throw new DesktopDeviceRegistryError(
      "desktop_device_disabled",
      403,
      `Desktop device ${input.payload.deviceId} has been disabled and must re-authorize before reuse`,
    );
  }

  const nextValues = {
    tenantId: input.actor.tenantId,
    userId: parseNumericUserId(input.payload.userId),
    displayName: input.payload.displayName,
    machineName: input.payload.machineName ?? null,
    healthStatus: inferHealthStatus({
      healthSummaryJson: input.payload.healthSummaryJson,
      warningFlagsJson: input.payload.warningFlagsJson,
    }),
    workerProjectionEnabled: input.payload.workerProjectionEnabled,
    projectedWorkerRuntimeType: resolveDesktopWorkerProjectionRuntimeType(
      input.payload.workerProjectionEnabled,
    ),
    platform: sanitizeWorkerPayload(input.payload.platform) as Record<string, unknown>,
    capabilitiesJson: sanitizeWorkerPayload(input.payload.capabilitiesJson) as Record<string, unknown>,
    healthSummaryJson: sanitizeWorkerPayload(input.payload.healthSummaryJson) as Record<string, unknown>,
    localRootsJson: sanitizeWorkerPayload(input.payload.localRoots) as Record<string, unknown>[],
    packageCachePathsJson: extractPackageCachePaths(input.payload.packageCachePaths),
    packageSyncStateJson: sanitizeWorkerPayload(input.payload.packageSyncState) as Record<string, unknown>,
    pendingActionsJson: existing?.pendingActionsJson ?? sanitizeWorkerPayload(input.payload.pendingActions) as Record<string, unknown>[],
    currentWorkspaceProfileJson: sanitizeWorkerPayload(input.payload.currentWorkspaceProfile) as Record<string, unknown>,
    lastRunSummaryJson: sanitizeWorkerPayload(input.payload.lastRunSummary) as Record<string, unknown>,
    policyVersion: existing?.policyVersion ?? null,
    policyExpiresAt: existing?.policyExpiresAt ?? null,
    policyOverridesJson: sanitizeWorkerPayload(existing?.policyOverridesJson ?? {}) as Record<string, unknown>,
    accessState: existing?.accessState === "reauth_required" ? "active" : existing?.accessState ?? "active",
    warningFlagsJson: sanitizeWorkerWarningFlags(input.payload.warningFlagsJson),
    disabledAt: null,
    lastSeenAt: new Date(),
  };

  const device = existing
    ? await repo.updateDevice(existing.id, nextValues)
    : await repo.createDevice({
      id: input.payload.deviceId,
      ...nextValues,
    });

  auditLogger.log({
    eventType: "desktop_host_device_enrolled",
    userId: parseNumericUserId(input.actor.userId),
    metadata: {
      tenantId: input.actor.tenantId,
      deviceId: device.id,
      created: !existing,
      workerProjectionEnabled: device.workerProjectionEnabled,
      projectedWorkerRuntimeType: device.projectedWorkerRuntimeType ?? null,
    },
  });

  return {
    created: !existing,
    device,
    workerProjection: buildProjectionState({
      actor: input.actor,
      deviceId: input.payload.deviceId,
      featureFlags,
      requested: input.payload.workerProjectionEnabled,
    }),
  };
}

export async function recordDesktopDeviceHeartbeat(
  input: {
    actor: DesktopDeviceActor;
    deviceId: string;
    payload: DesktopDeviceHeartbeatPayload;
  },
  deps: {
    getFeatureFlags?: typeof getTenantFeatureFlags;
    repo?: DesktopDeviceRegistryRepository;
  } = {},
): Promise<{
  device: DesktopDeviceRecord;
  workerProjection: DesktopDeviceProjectionState;
}> {
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;
  const featureFlags = await getFeatureFlags(input.actor.tenantId);
  assertFeatureEnabled(featureFlags);

  const existing = await repo.findDeviceById(input.deviceId);
  assertDeviceAccess(input.actor, existing, input.deviceId);
  const currentDevice = existing as DesktopDeviceRecord;
  if (currentDevice.disabledAt) {
    throw new DesktopDeviceRegistryError(
      "desktop_device_disabled",
      403,
      `Desktop device ${input.deviceId} has been disabled and cannot refresh policy or credentials`,
    );
  }
  if (currentDevice.accessState === "reauth_required") {
    throw new DesktopDeviceRegistryError(
      "desktop_device_reauth_required",
      403,
      `Desktop device ${input.deviceId} must re-authorize before it can refresh policy or credentials`,
    );
  }
  if (currentDevice.accessState === "quarantined") {
    throw new DesktopDeviceRegistryError(
      "desktop_device_quarantined",
      403,
      `Desktop device ${input.deviceId} is quarantined and cannot refresh policy or credentials`,
    );
  }

  const acknowledgedActionIds = new Set(input.payload.acknowledgedActionIds ?? []);
  const pendingActions = extractPendingActions(currentDevice.pendingActionsJson).filter(
    (action) => !acknowledgedActionIds.has(action.actionId),
  );

  const device = await repo.updateDevice(input.deviceId, {
    healthStatus: inferHealthStatus({
      disabledAt: currentDevice.disabledAt,
      healthSummaryJson: input.payload.healthSummaryJson,
      warningFlagsJson: input.payload.warningFlagsJson,
    }),
    capabilitiesJson: sanitizeWorkerPayload(input.payload.capabilitiesJson) as Record<string, unknown>,
    healthSummaryJson: {
      ...(sanitizeWorkerPayload(currentDevice.healthSummaryJson) as Record<string, unknown>),
      ...(sanitizeWorkerPayload(input.payload.healthSummaryJson) as Record<string, unknown>),
      compatibility: sanitizeWorkerPayload(input.payload.compatibility) as Record<string, unknown>,
    },
    localRootsJson: sanitizeWorkerPayload(input.payload.localRoots) as Record<string, unknown>[],
    packageCachePathsJson: extractPackageCachePaths(input.payload.packageCachePaths),
    packageSyncStateJson: sanitizeWorkerPayload(input.payload.packageSyncState) as Record<string, unknown>,
    pendingActionsJson: pendingActions.map((action) => sanitizeWorkerPayload(action) as Record<string, unknown>),
    currentWorkspaceProfileJson: sanitizeWorkerPayload(input.payload.currentWorkspaceProfile) as Record<string, unknown>,
    lastRunSummaryJson: sanitizeWorkerPayload(input.payload.lastRunSummary) as Record<string, unknown>,
    warningFlagsJson: sanitizeWorkerWarningFlags(input.payload.warningFlagsJson),
    accessState: currentDevice.accessState ?? "active",
    policyCursor: input.payload.policyCursor ?? currentDevice.policyCursor ?? null,
    lastSeenAt: new Date(),
  });

  return {
    device,
    workerProjection: buildProjectionState({
      actor: input.actor,
      deviceId: input.deviceId,
      featureFlags,
      requested: Boolean(currentDevice.workerProjectionEnabled),
    }),
  };
}

export async function listDesktopDevicesForActor(
  input: {
    actor: DesktopDeviceActor;
  },
  deps: {
    repo?: DesktopDeviceRegistryRepository;
    now?: () => Date;
  } = {},
): Promise<DesktopHostDeviceStatusResponse> {
  const repo = deps.repo ?? defaultRepo;
  const now = deps.now ?? (() => new Date());
  const parsedUserId = parseNumericUserId(input.actor.userId);
  if (!parsedUserId) {
    return {
      generatedAt: now().toISOString(),
      devices: [],
    };
  }

  const devices = await repo.listDevicesByTenantUser(input.actor.tenantId, parsedUserId);
  const ownerById = await resolveOwnerDirectory(repo, devices);
  const generatedAt = now();
  return {
    generatedAt: generatedAt.toISOString(),
    devices: devices.map((device) =>
      summarizeDesktopDeviceRecord(device, { now: generatedAt, ownerById })
    ),
  };
}

export async function listTenantDesktopDevicesForActor(
  input: {
    actor: DesktopDeviceActor;
  },
  deps: {
    repo?: DesktopDeviceRegistryRepository;
    now?: () => Date;
  } = {},
): Promise<DesktopHostDeviceStatusResponse> {
  const repo = deps.repo ?? defaultRepo;
  const now = deps.now ?? (() => new Date());
  if (!["admin", "domain_admin", "system_agent"].includes(input.actor.role ?? "")) {
    throw new DesktopDeviceRegistryError(
      "desktop_device_forbidden",
      403,
      "The authenticated actor cannot view tenant-wide desktop devices",
    );
  }

  const devices = await repo.listDevicesByTenant(input.actor.tenantId);
  const ownerById = await resolveOwnerDirectory(repo, devices);
  const generatedAt = now();
  return {
    generatedAt: generatedAt.toISOString(),
    devices: devices.map((device) =>
      summarizeDesktopDeviceRecord(device, { now: generatedAt, ownerById })
    ),
  };
}

export async function getDesktopDeviceByIdForTenant(
  input: {
    tenantId: string;
    deviceId: string;
  },
  deps: {
    repo?: DesktopDeviceRegistryRepository;
  } = {},
): Promise<DesktopDeviceRecord | null> {
  const repo = deps.repo ?? defaultRepo;
  const device = await repo.findDeviceById(input.deviceId);
  if (!device || device.tenantId !== input.tenantId) {
    return null;
  }
  return device;
}

export async function updateDesktopDevicePolicyOverrides(
  input: {
    actor: DesktopDeviceActor;
    deviceId: string;
    overrides: Partial<DesktopDevicePolicyOverrides>;
    note?: string | null;
  },
  deps: {
    repo?: DesktopDeviceRegistryRepository;
    now?: () => Date;
  } = {},
): Promise<DesktopRegisteredDeviceSummary> {
  const repo = deps.repo ?? defaultRepo;
  const now = deps.now ?? (() => new Date());
  const device = await repo.findDeviceById(input.deviceId);
  assertTenantDeviceExists(input.actor, device, input.deviceId);
  const currentDevice = device as DesktopDeviceRecord;
  if (!actorCanManageDevice(input.actor, currentDevice)) {
    throw new DesktopDeviceRegistryError(
      "desktop_device_forbidden",
      403,
      "The authenticated actor cannot update policy overrides for this desktop device",
    );
  }

  const mergedOverrides = normalizePolicyOverrides({
    ...extractPolicyOverrides(currentDevice.policyOverridesJson),
    ...input.overrides,
  });

  const updatedDevice = await repo.updateDevice(input.deviceId, {
    policyOverridesJson: sanitizeWorkerPayload(mergedOverrides) as Record<string, unknown>,
    updatedAt: now(),
  });

  auditLogger.log({
    eventType: "desktop_host_device_policy_overrides_updated",
    userId: parseNumericUserId(input.actor.userId),
    metadata: {
      tenantId: input.actor.tenantId,
      deviceId: input.deviceId,
      note: input.note ?? null,
      overrides: mergedOverrides,
    },
  });

  const ownerById = await resolveOwnerDirectory(repo, [updatedDevice]);
  return summarizeDesktopDeviceRecord(updatedDevice, {
    now: now(),
    ownerById,
  });
}

export async function queueDesktopDeviceAction(
  input: {
    actor: DesktopDeviceActor;
    deviceId: string;
    actionType: Extract<
      DesktopManagedActionType,
      | "force_reauth"
      | "revoke_runtime_tokens"
      | "cancel_active_runs"
      | "quarantine_device"
      | "resume_device_access"
    >;
    note?: string | null;
  },
  deps: {
    repo?: DesktopDeviceRegistryRepository;
    now?: () => Date;
  } = {},
): Promise<{
  device: DesktopRegisteredDeviceSummary;
  action: DesktopManagedAction;
}> {
  const repo = deps.repo ?? defaultRepo;
  const now = deps.now ?? (() => new Date());
  const device = await repo.findDeviceById(input.deviceId);
  assertTenantDeviceExists(input.actor, device, input.deviceId);
  const currentDevice = device as DesktopDeviceRecord;
  if (!actorCanManageDevice(input.actor, currentDevice)) {
    throw new DesktopDeviceRegistryError(
      "desktop_device_forbidden",
      403,
      "The authenticated actor cannot manage this desktop device",
    );
  }

  const currentAccessState = inferAccessState({
    disabledAt: currentDevice.disabledAt,
    accessState: currentDevice.accessState,
  });
  if (currentAccessState === "disabled" && input.actionType !== "resume_device_access") {
    throw new DesktopDeviceRegistryError(
      "desktop_device_disabled",
      403,
      `Desktop device ${input.deviceId} is disabled and only offboarding-safe actions are allowed`,
    );
  }
  if (currentAccessState === "disabled" && input.actionType === "resume_device_access") {
    throw new DesktopDeviceRegistryError(
      "desktop_device_resume_unsupported",
      400,
      "Disabled desktop devices must be re-authorized through enrollment rather than resumed from the tenant console",
    );
  }

  const action = desktopManagedActionSchema.parse({
    actionId: randomUUID(),
    actionType: desktopManagedActionTypeSchema.parse(input.actionType),
    status: "queued",
    requestedAt: now().toISOString(),
    note: input.note ?? null,
  });

  const warningFlags = new Set(sanitizeWorkerWarningFlags(currentDevice.warningFlagsJson));
  let nextAccessState: DesktopDeviceAccessState = currentAccessState;

  switch (input.actionType) {
    case "force_reauth":
      nextAccessState = "reauth_required";
      warningFlags.add("device_reauth_required");
      break;
    case "quarantine_device":
      nextAccessState = "quarantined";
      warningFlags.add("device_quarantined");
      break;
    case "resume_device_access":
      nextAccessState = "active";
      warningFlags.delete("device_reauth_required");
      warningFlags.delete("device_quarantined");
      break;
    case "revoke_runtime_tokens":
    case "cancel_active_runs":
      nextAccessState = currentAccessState;
      break;
  }

  const nextActions = [
    ...extractPendingActions(currentDevice.pendingActionsJson).filter(
      (existingAction) => !(
        existingAction.rootId == null
        && existingAction.actionType === input.actionType
        && existingAction.status === "queued"
      ),
    ),
    action,
  ];

  const updatedHealthSummary: Record<string, unknown> & { status?: DesktopDeviceHealthStatus } = {
    ...(sanitizeWorkerPayload(currentDevice.healthSummaryJson) as Record<string, unknown>),
    accessState: nextAccessState,
    lastAdminAction: input.actionType,
    lastAdminActionAt: now().toISOString(),
  };
  if (input.actionType === "quarantine_device") {
    updatedHealthSummary.status = "unhealthy";
  }
  if (input.actionType === "resume_device_access") {
    updatedHealthSummary.status = inferHealthStatus({
      healthSummaryJson: currentDevice.healthSummaryJson,
      warningFlagsJson: [...warningFlags],
    });
  }

  const updatedDevice = await repo.updateDevice(input.deviceId, {
    accessState: nextAccessState,
    warningFlagsJson: [...warningFlags],
    healthSummaryJson: updatedHealthSummary,
    pendingActionsJson: nextActions.map((queuedAction) => sanitizeWorkerPayload(queuedAction) as Record<string, unknown>),
    updatedAt: now(),
  });

  auditLogger.log({
    eventType: "desktop_host_device_action_queued",
    userId: parseNumericUserId(input.actor.userId),
    metadata: {
      tenantId: input.actor.tenantId,
      deviceId: input.deviceId,
      actionType: input.actionType,
      note: input.note ?? null,
      accessState: nextAccessState,
    },
  });

  const ownerById = await resolveOwnerDirectory(repo, [updatedDevice]);
  return {
    device: summarizeDesktopDeviceRecord(updatedDevice, {
      now: now(),
      ownerById,
    }),
    action,
  };
}

export async function queueDesktopRootAction(
  input: {
    actor: DesktopDeviceActor;
    deviceId: string;
    rootId: string;
    actionType: "reindex_root" | "purge_root_derived_store" | "revoke_root";
    note?: string | null;
  },
  deps: {
    repo?: DesktopDeviceRegistryRepository;
    now?: () => Date;
  } = {},
): Promise<{
  device: DesktopRegisteredDeviceSummary;
  action: DesktopManagedAction;
}> {
  const repo = deps.repo ?? defaultRepo;
  const now = deps.now ?? (() => new Date());
  const device = await repo.findDeviceById(input.deviceId);
  assertTenantDeviceExists(input.actor, device, input.deviceId);
  const currentDevice = device as DesktopDeviceRecord;
  if (!actorCanManageDevice(input.actor, currentDevice)) {
    throw new DesktopDeviceRegistryError(
      "desktop_device_forbidden",
      403,
      "The authenticated actor cannot manage local roots for this desktop device",
    );
  }

  const currentRoots = extractDesktopLocalRoots(currentDevice.localRootsJson);
  const rootExists = currentRoots.some((root) => root.rootId === input.rootId);
  if (!rootExists) {
    throw new DesktopDeviceRegistryError(
      "desktop_root_not_found",
      404,
      `Managed root ${input.rootId} was not found for desktop device ${input.deviceId}`,
    );
  }

  const action = desktopManagedActionSchema.parse({
    actionId: randomUUID(),
    actionType: input.actionType,
    status: "queued",
    rootId: input.rootId,
    requestedAt: now().toISOString(),
    note: input.note ?? null,
  });

  const nextRoots = input.actionType === "revoke_root"
    ? currentRoots.filter((root) => root.rootId !== input.rootId)
    : currentRoots;
  const nextActions = [
    ...extractPendingActions(currentDevice.pendingActionsJson).filter(
      (existingAction) => !(
        existingAction.rootId === input.rootId
        && existingAction.actionType === input.actionType
        && existingAction.status === "queued"
      ),
    ),
    action,
  ];

  const updatedDevice = await repo.updateDevice(input.deviceId, {
    localRootsJson: nextRoots.map((root) => sanitizeWorkerPayload(root) as Record<string, unknown>),
    pendingActionsJson: nextActions.map((queuedAction) => sanitizeWorkerPayload(queuedAction) as Record<string, unknown>),
    updatedAt: now(),
  });

  auditLogger.log({
    eventType: "desktop_host_root_action_queued",
    userId: parseNumericUserId(input.actor.userId),
    metadata: {
      tenantId: input.actor.tenantId,
      deviceId: input.deviceId,
      rootId: input.rootId,
      actionType: input.actionType,
      note: input.note ?? null,
    },
  });

  return {
    device: summarizeDesktopDeviceRecord(updatedDevice, {
      now: now(),
      ownerById: await resolveOwnerDirectory(repo, [updatedDevice]),
    }),
    action,
  };
}

export async function disableDesktopDevice(
  input: {
    actor: DesktopDeviceActor;
    deviceId: string;
    payload?: DesktopDeviceDisableRequest;
  },
  deps: {
    repo?: DesktopDeviceRegistryRepository;
    now?: () => Date;
  } = {},
): Promise<DesktopDeviceDisableResponse> {
  const repo = deps.repo ?? defaultRepo;
  const now = deps.now ?? (() => new Date());
  const device = await repo.findDeviceById(input.deviceId);
  assertTenantDeviceExists(input.actor, device, input.deviceId);
  const currentDevice = device as DesktopDeviceRecord;
  if (!actorCanManageDevice(input.actor, currentDevice)) {
    throw new DesktopDeviceRegistryError(
      "desktop_device_forbidden",
      403,
      "The authenticated actor cannot disable this desktop device",
    );
  }

  const disabledAt = currentDevice.disabledAt instanceof Date
    ? currentDevice.disabledAt
    : now();
  const warningFlags = new Set(sanitizeWorkerWarningFlags(currentDevice.warningFlagsJson));
  warningFlags.add("device_disabled");

  const updatedDevice = await repo.updateDevice(input.deviceId, {
    disabledAt,
    accessState: "disabled",
    warningFlagsJson: [...warningFlags],
    healthSummaryJson: {
      ...(sanitizeWorkerPayload(currentDevice.healthSummaryJson) as Record<string, unknown>),
      status: "disabled",
      accessState: "disabled",
      disabledReason: input.payload?.reason ?? null,
      disabledAt: disabledAt.toISOString(),
    },
  });

  const offboardingPlan = buildDesktopDeviceOffboarding({
    deviceId: input.deviceId,
    packageCachePaths: input.payload?.packageCachePaths,
    localRoots: input.payload?.localRoots,
  });

  auditLogger.log({
    eventType: "desktop_host_device_offboarded",
    userId: parseNumericUserId(input.actor.userId),
    metadata: {
      tenantId: input.actor.tenantId,
      deviceId: input.deviceId,
      actorRole: input.actor.role ?? null,
      disabledAt: disabledAt.toISOString(),
      reason: input.payload?.reason ?? null,
    },
  });

  return desktopDeviceDisableResponseSchema.parse({
    device: summarizeDesktopDeviceRecord(updatedDevice, {
      now: now(),
      ownerById: await resolveOwnerDirectory(repo, [updatedDevice]),
    }),
    disabledAt: disabledAt.toISOString(),
    offboardingPlan: {
      ...offboardingPlan,
      cleanupOnNextContact: input.payload?.cleanupOnNextContact ?? offboardingPlan.cleanupOnNextContact,
    },
  });
}

export function getDefaultDesktopDeviceRegistryRepository(): DesktopDeviceRegistryRepository {
  return defaultRepo;
}
