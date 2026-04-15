import { describe, expect, it } from "vitest";

import { FEATURE_FLAG_DEFAULTS } from "../../../shared/featureFlags";
import type {
  DesktopDeviceHeartbeatPayload,
  DesktopDeviceRegistrationPayload,
} from "../../../shared/desktopHost";
import {
  DesktopDeviceRegistryError,
  disableDesktopDevice,
  listDesktopDevicesForActor,
  listTenantDesktopDevicesForActor,
  queueDesktopDeviceAction,
  queueDesktopRootAction,
  recordDesktopDeviceHeartbeat,
  registerDesktopDevice,
  updateDesktopDevicePolicyOverrides,
  type DesktopDeviceRegistryRepository,
} from "../desktopDeviceRegistryService";

function createRepo(): DesktopDeviceRegistryRepository {
  const devices = new Map<string, Record<string, unknown>>();
  const directory = new Map<number, { id: number; name: string | null; email: string | null }>([
    [42, { id: 42, name: "Ops Admin", email: "ops@example.com" }],
    [7, { id: 7, name: "Tenant Admin", email: "tenant-admin@example.com" }],
  ]);

  return {
    async createDevice(values) {
      const device = {
        createdAt: new Date(),
        updatedAt: new Date(),
        enrolledAt: new Date(),
        ...values,
      };
      devices.set(String(device.id), device);
      return device;
    },
    async findDeviceById(deviceId) {
      return (devices.get(deviceId) as Record<string, unknown> | undefined) ?? null;
    },
    async listDevicesByTenantUser(tenantId, userId) {
      return [...devices.values()].filter((device) =>
        device.tenantId === tenantId && device.userId === userId
      );
    },
    async listDevicesByTenant(tenantId) {
      return [...devices.values()].filter((device) => device.tenantId === tenantId);
    },
    async updateDevice(deviceId, values) {
      const existing = devices.get(deviceId);
      if (!existing) {
        throw new Error(`missing device ${deviceId}`);
      }
      const next = {
        ...existing,
        ...values,
        updatedAt: new Date(),
      };
      devices.set(deviceId, next);
      return next;
    },
    async listUsersByIds(userIds) {
      return userIds
        .map((userId) => directory.get(userId))
        .filter((row): row is { id: number; name: string | null; email: string | null } => Boolean(row));
    },
  };
}

function buildRegistrationPayload(
  overrides: Partial<DesktopDeviceRegistrationPayload> = {},
): DesktopDeviceRegistrationPayload {
  return {
    compatibility: {
      protocolVersion: "2026-04-08",
      runtimeVersion: "0.1.0",
    },
    tenantId: "tenant-1",
    userId: "user-1",
    deviceId: "device-1",
    displayName: "Design Workstation",
    machineName: "design-ws",
    platform: {
      os: "windows",
      osVersion: "11",
      arch: "x64",
      appVersion: "0.1.0",
    },
    workerProjectionEnabled: true,
    projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
    capabilitiesJson: {
      videoAssembly: true,
    },
    healthSummaryJson: {
      status: "online",
    },
    warningFlagsJson: [],
    ...overrides,
  };
}

function buildHeartbeatPayload(
  overrides: Partial<DesktopDeviceHeartbeatPayload> = {},
): DesktopDeviceHeartbeatPayload {
  return {
    compatibility: {
      protocolVersion: "2026-04-08",
      runtimeVersion: "0.1.1",
    },
    capabilitiesJson: {
      videoAssembly: true,
    },
    healthSummaryJson: {
      status: "online",
      doctor: "ok",
    },
    warningFlagsJson: [],
    policyCursor: "policy-v2",
    ...overrides,
  };
}

describe("desktopDeviceRegistryService", () => {
  it("registers a desktop device and issues projection registration tokens when enabled", async () => {
    const repo = createRepo();

    const result = await registerDesktopDevice(
      {
        actor: {
          tenantId: "tenant-1",
          userId: "user-1",
        },
        payload: buildRegistrationPayload(),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
          desktopWorkerProjection: true,
          desktopZeroClawWorker: true,
        }),
      },
    );

    expect(result.created).toBe(true);
    expect(result.device.id).toBe("device-1");
    expect(result.device.workerProjectionEnabled).toBe(true);
    expect(result.workerProjection.enabled).toBe(true);
    expect(result.workerProjection.externalReference).toBe("device-1");
    expect(result.workerProjection.registrationToken).toEqual(expect.any(String));
  });

  it("fails closed when projection is requested but runtime rollout is disabled", async () => {
    const repo = createRepo();

    const result = await registerDesktopDevice(
      {
        actor: {
          tenantId: "tenant-1",
          userId: "user-1",
        },
        payload: buildRegistrationPayload(),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
          desktopWorkerProjection: true,
          desktopZeroClawWorker: false,
        }),
      },
    );

    expect(result.workerProjection.enabled).toBe(false);
    expect(result.workerProjection.registrationToken).toBeNull();
    expect(result.workerProjection.reason).toBe(
      "desktop_zeroclaw_worker_feature_disabled",
    );
  });

  it("records device heartbeats and refreshes projection tokens for registered devices", async () => {
    const repo = createRepo();
    await registerDesktopDevice(
      {
        actor: {
          tenantId: "tenant-1",
          userId: "user-1",
        },
        payload: buildRegistrationPayload(),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
          desktopWorkerProjection: true,
          desktopZeroClawWorker: true,
        }),
      },
    );

    const result = await recordDesktopDeviceHeartbeat(
      {
        actor: {
          tenantId: "tenant-1",
          userId: "user-1",
        },
        deviceId: "device-1",
        payload: buildHeartbeatPayload({
          warningFlagsJson: ["doctor_warning"],
          healthSummaryJson: {
            status: "unhealthy",
          },
        }),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
          desktopWorkerProjection: true,
          desktopZeroClawWorker: true,
        }),
      },
    );

    expect(result.device.healthStatus).toBe("unhealthy");
    expect(result.device.policyCursor).toBe("policy-v2");
    expect(result.workerProjection.enabled).toBe(true);
    expect(result.workerProjection.registrationToken).toEqual(expect.any(String));
  });

  it("rejects tenant or user mismatches during registration", async () => {
    const repo = createRepo();

    await expect(registerDesktopDevice(
      {
        actor: {
          tenantId: "tenant-2",
          userId: "user-1",
        },
        payload: buildRegistrationPayload(),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
        }),
      },
    )).rejects.toMatchObject<Partial<DesktopDeviceRegistryError>>({
      code: "desktop_host_tenant_mismatch",
      statusCode: 403,
    });

    await expect(registerDesktopDevice(
      {
        actor: {
          tenantId: "tenant-1",
          userId: "user-2",
        },
        payload: buildRegistrationPayload(),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
        }),
      },
    )).rejects.toMatchObject<Partial<DesktopDeviceRegistryError>>({
      code: "desktop_host_user_mismatch",
      statusCode: 403,
    });
  });

  it("summarizes enrolled devices with reported identity and parser capabilities", async () => {
    const repo = createRepo();

    await registerDesktopDevice(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 42,
        },
        payload: buildRegistrationPayload({
          userId: 42,
          capabilitiesJson: {
            deviceIdentity: {
              keyAlgorithm: "ed25519",
              keyVersion: 2,
              publicKeyDigestSha256: "a".repeat(64),
              attestationMode: "software_pkcs8",
              secretStorage: "file_store",
              proofKind: "ed25519_signature",
            },
            localFileService: {
              enabled: true,
              isolationMode: "python_subprocess_bounded",
              supportedFormats: ["pdf", "docx", "pptx", "xlsx", "png"],
              maxInputBytes: 8_388_608,
              timeoutMs: 8_000,
              ocrEnabled: false,
              pdfExtractor: "internal_heuristic",
              ocrProvider: "none",
              fullRenderingSupported: false,
              activeContentExecutionAllowed: false,
            },
          },
        }),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
        }),
      },
    );

    const result = await listDesktopDevicesForActor(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 42,
        },
      },
      {
        repo,
        now: () => new Date("2026-04-09T11:00:00.000Z"),
      },
    );

    expect(result.generatedAt).toBe("2026-04-09T11:00:00.000Z");
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]?.capabilities.deviceIdentity).toMatchObject({
      keyAlgorithm: "ed25519",
      attestationMode: "software_pkcs8",
      proofKind: "ed25519_signature",
    });
    expect(result.devices[0]?.capabilities.localFileService).toMatchObject({
      enabled: true,
      isolationMode: "python_subprocess_bounded",
      ocrEnabled: false,
      pdfExtractor: "internal_heuristic",
      ocrProvider: "none",
      fullRenderingSupported: false,
    });
  });

  it("disables a device, returns an offboarding plan, and blocks future heartbeats", async () => {
    const repo = createRepo();

    await registerDesktopDevice(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 42,
          role: "admin",
        },
        payload: buildRegistrationPayload({
          userId: 42,
        }),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
        }),
      },
    );

    const disabled = await disableDesktopDevice(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 7,
          role: "admin",
        },
        deviceId: "device-1",
        payload: {
          reason: "device_compromised",
          cleanupOnNextContact: true,
          packageCachePaths: ["/cache/packages"],
          localRoots: [],
        },
      },
      {
        repo,
        now: () => new Date("2026-04-09T12:00:00.000Z"),
      },
    );

    expect(disabled.device.healthStatus).toBe("disabled");
    expect(disabled.offboardingPlan.cleanupOnNextContact).toBe(true);
    expect(disabled.offboardingPlan.packageCachePaths).toEqual(["/cache/packages"]);

    await expect(recordDesktopDeviceHeartbeat(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 42,
        },
        deviceId: "device-1",
        payload: buildHeartbeatPayload(),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
        }),
      },
    )).rejects.toMatchObject<Partial<DesktopDeviceRegistryError>>({
      code: "desktop_device_disabled",
      statusCode: 403,
    });
  });

  it("allows tenant admins to list all tenant devices and queue managed root actions", async () => {
    const repo = createRepo();

    await registerDesktopDevice(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 42,
          role: "admin",
        },
        payload: buildRegistrationPayload({
          userId: 42,
          localRoots: [
            {
              rootId: "quotes",
              name: "Quotes",
              absolutePath: "C:/Users/demo/Documents/Quotes",
              writebackMode: "managed_output_only",
              indexingEnabled: true,
              previewEnabled: true,
              vectorIndexEnabled: false,
              deniedByDefault: false,
              denialReason: null,
            },
          ],
          packageCachePaths: ["C:/SmartSpec/packages"],
          packageSyncState: {
            syncStatus: "ready",
            lastSyncAt: "2026-04-09T09:55:00.000Z",
            lastError: null,
            syncedPackageIds: ["storyboard-writer"],
            packageCount: 1,
            lastRevocationCheckAt: "2026-04-09T09:56:00.000Z",
          },
        }),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
        }),
      },
    );

    const tenantStatus = await listTenantDesktopDevicesForActor(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 7,
          role: "admin",
        },
      },
      {
        repo,
        now: () => new Date("2026-04-09T12:00:00.000Z"),
      },
    );

    const actionResult = await queueDesktopRootAction(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 7,
          role: "admin",
        },
        deviceId: "device-1",
        rootId: "quotes",
        actionType: "reindex_root",
        note: "admin_reindex_after_policy_update",
      },
      {
        repo,
        now: () => new Date("2026-04-09T12:05:00.000Z"),
      },
    );

    expect(tenantStatus.devices).toHaveLength(1);
    expect(tenantStatus.devices[0]?.owner.email).toBe("ops@example.com");
    expect(tenantStatus.devices[0]?.packageSyncState.syncStatus).toBe("ready");
    expect(actionResult.action.actionType).toBe("reindex_root");
    expect(actionResult.device.pendingActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionType: "reindex_root",
          rootId: "quotes",
        }),
      ]),
    );
  });

  it("persists per-device policy overrides for tenant admins", async () => {
    const repo = createRepo();

    await registerDesktopDevice(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 42,
          role: "admin",
        },
        payload: buildRegistrationPayload({
          userId: 42,
        }),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
        }),
      },
    );

    const updatedDevice = await updateDesktopDevicePolicyOverrides(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 7,
          role: "admin",
        },
        deviceId: "device-1",
        overrides: {
          allowAdvancedLocalMode: false,
          allowPackageSync: true,
          maxLocalRoots: 2,
          outputWritebackMode: "managed_output_only",
        },
        note: "tenant_lockdown",
      },
      {
        repo,
        now: () => new Date("2026-04-09T12:10:00.000Z"),
      },
    );

    expect(updatedDevice.owner.name).toBe("Ops Admin");
    expect(updatedDevice.policyOverrides).toMatchObject({
      allowAdvancedLocalMode: false,
      allowPackageSync: true,
      maxLocalRoots: 2,
      outputWritebackMode: "managed_output_only",
    });
  });

  it("queues quarantine and re-auth actions while updating access state", async () => {
    const repo = createRepo();

    await registerDesktopDevice(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 42,
          role: "admin",
        },
        payload: buildRegistrationPayload({
          userId: 42,
        }),
      },
      {
        repo,
        getFeatureFlags: async () => ({
          ...FEATURE_FLAG_DEFAULTS,
          desktopHostEnabled: true,
        }),
      },
    );

    const quarantined = await queueDesktopDeviceAction(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 7,
          role: "admin",
        },
        deviceId: "device-1",
        actionType: "quarantine_device",
        note: "suspicious_activity",
      },
      {
        repo,
        now: () => new Date("2026-04-09T12:15:00.000Z"),
      },
    );

    expect(quarantined.device.accessState).toBe("quarantined");
    expect(quarantined.action.actionType).toBe("quarantine_device");

    const resumed = await queueDesktopDeviceAction(
      {
        actor: {
          tenantId: "tenant-1",
          userId: 7,
          role: "admin",
        },
        deviceId: "device-1",
        actionType: "resume_device_access",
      },
      {
        repo,
        now: () => new Date("2026-04-09T12:16:00.000Z"),
      },
    );

    expect(resumed.device.accessState).toBe("active");
    expect(resumed.action.actionType).toBe("resume_device_access");
  });
});
