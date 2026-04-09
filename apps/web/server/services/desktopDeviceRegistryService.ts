import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import {
  desktopDeviceRunSummarySchema,
  desktopDeviceDisableResponseSchema,
  desktopCapabilitySnapshotSchema,
  desktopLocalRootSchema,
  desktopManagedActionSchema,
  desktopPackageSyncStateSchema,
  desktopRegisteredDeviceSummarySchema,
  resolveDesktopWorkerProjectionRuntimeType,
  type DesktopCapabilitySnapshot,
  type DesktopDeviceDisableRequest,
  type DesktopDeviceDisableResponse,
  type DesktopDeviceHeartbeatPayload,
  type DesktopDeviceHealthStatus,
  type DesktopDeviceRegistrationPayload,
  type DesktopHostDeviceStatusResponse,
  type DesktopLocalRoot,
  type DesktopManagedAction,
  type DesktopPackageSyncState,
  type DesktopRegisteredDeviceSummary,
  type DesktopDeviceRunSummary,
  type DesktopWorkspaceProfile,
  desktopWorkspaceProfileSchema,
} from "../../shared/desktopHost";
import type { TenantFeatureFlags } from "../../shared/featureFlags";
import { desktopDevices } from "../../drizzle/schema";
import { getDb } from "../db";
import { auditLogger } from "./auditLogger";
import { buildDesktopDeviceOffboarding } from "./deviceEnrollmentService";
import { createWorkerRegistrationToken } from "./workerAuthService";
import { sanitizeWorkerPayload, sanitizeWorkerWarningFlags } from "./workerPayloadSanitizer";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";

type DesktopDeviceRecord = Record<string, any>;

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

export function summarizeDesktopDeviceRecord(
  device: DesktopDeviceRecord,
): DesktopRegisteredDeviceSummary {
  return desktopRegisteredDeviceSummarySchema.parse({
    deviceId: String(device.id),
    displayName: String(device.displayName ?? device.id),
    machineName: typeof device.machineName === "string" ? device.machineName : null,
    healthStatus: inferHealthStatus({
      disabledAt: device.disabledAt,
      healthSummaryJson: device.healthSummaryJson,
      warningFlagsJson: device.warningFlagsJson,
    }),
    platform: sanitizeWorkerPayload(device.platform) as Record<string, unknown>,
    enrolledAt: toIsoStringOrNull(device.enrolledAt),
    lastSeenAt: toIsoStringOrNull(device.lastSeenAt),
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
  return {
    generatedAt: now().toISOString(),
    devices: devices.map(summarizeDesktopDeviceRecord),
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
  return {
    generatedAt: now().toISOString(),
    devices: devices.map(summarizeDesktopDeviceRecord),
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
    device: summarizeDesktopDeviceRecord(updatedDevice),
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
    warningFlagsJson: [...warningFlags],
    healthSummaryJson: {
      ...(sanitizeWorkerPayload(currentDevice.healthSummaryJson) as Record<string, unknown>),
      status: "disabled",
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
    device: summarizeDesktopDeviceRecord(updatedDevice),
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
