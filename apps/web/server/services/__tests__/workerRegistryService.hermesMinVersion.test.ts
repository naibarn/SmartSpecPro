import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  WorkerHeartbeatPayload,
  WorkerRegistrationPayload,
} from "../../../shared/workerRuntime";

const { mockGetDb, mockGetHermesWorkerSettings } = vi.hoisted(() => {
  process.env.JWT_SECRET = "test-jwt-secret-for-worker-registry-service-hermes-min-version";

  return {
    mockGetDb: vi.fn(),
    mockGetHermesWorkerSettings: vi.fn(),
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../hermesWorkerSettings", () => ({
  getHermesWorkerSettings: mockGetHermesWorkerSettings,
}));

function hermesWorkerSettings(minHermesVersion: string) {
  return {
    enabled: true,
    sharedPoolEnabled: false,
    serverPersonalEnabled: false,
    privateEnabled: true,
    videoEnabled: true,
    sharedPoolFeeCredits: 0,
    maxRunningPerConnection: 1,
    maxConcurrentPerSharedWorker: 2,
    maxQueuedPerUser: 8,
    maxQueuedPerTenantSharedPool: 20,
    submitWindowPerUser: 10,
    submitWindowPerTenant: 60,
    minHermesVersion,
    sharedWorkerId: null,
    webProcessWorkerEnabled: false,
  };
}

describe("enforceHermesMinVersion (pure helper)", () => {
  it("forces advertised:false and names the minimum when below it", async () => {
    const { enforceHermesMinVersion } = await import("../workerRegistryService");

    const result = enforceHermesMinVersion(
      { hermesMedia: { capability: "hermes-media-generation", advertised: true, hermesVersion: "0.17.0" } },
      "0.18.2",
    );

    expect(result.belowMinimum).toBe(true);
    expect(result.capabilitiesJson.hermesMedia).toMatchObject({
      advertised: false,
      reason: expect.stringContaining("0.18.2"),
    });
    expect(result.warning).toEqual(expect.stringContaining("0.18.2"));
  });

  it("preserves capabilities as sent when at or above the minimum", async () => {
    const { enforceHermesMinVersion } = await import("../workerRegistryService");

    const atMinimum = enforceHermesMinVersion(
      { hermesMedia: { capability: "hermes-media-generation", advertised: true, hermesVersion: "0.18.2" } },
      "0.18.2",
    );
    const aboveMinimum = enforceHermesMinVersion(
      { hermesMedia: { capability: "hermes-media-generation", advertised: true, hermesVersion: "0.19.0" } },
      "0.18.2",
    );

    expect(atMinimum.belowMinimum).toBe(false);
    expect(atMinimum.capabilitiesJson.hermesMedia).toMatchObject({ advertised: true });
    expect(aboveMinimum.belowMinimum).toBe(false);
    expect(aboveMinimum.capabilitiesJson.hermesMedia).toMatchObject({ advertised: true });
  });

  it("is a no-op (no crash, no synthesized capability) when hermesMedia is absent", async () => {
    const { enforceHermesMinVersion } = await import("../workerRegistryService");

    const withoutBlock = enforceHermesMinVersion({ hyperframes: { advertised: true } }, "0.18.2");
    expect(withoutBlock.belowMinimum).toBe(false);
    expect(withoutBlock.capabilitiesJson.hermesMedia).toBeUndefined();

    const nullish = enforceHermesMinVersion(null, "0.18.2");
    expect(nullish.belowMinimum).toBe(false);
    expect(nullish.capabilitiesJson).toEqual({});

    const undefinedInput = enforceHermesMinVersion(undefined, "0.18.2");
    expect(undefinedInput.belowMinimum).toBe(false);
  });

  it("does not enforce when minVersion is blank (no floor)", async () => {
    const { enforceHermesMinVersion } = await import("../workerRegistryService");

    const result = enforceHermesMinVersion(
      { hermesMedia: { capability: "hermes-media-generation", advertised: true, hermesVersion: "0.0.1" } },
      "",
    );

    expect(result.belowMinimum).toBe(false);
    expect(result.capabilitiesJson.hermesMedia).toMatchObject({ advertised: true });
  });

  it("compares numeric segments, not lexicographically (0.18.2 vs 0.18.10)", async () => {
    const { enforceHermesMinVersion } = await import("../workerRegistryService");

    // 0.18.10 lexicographically sorts BEFORE 0.18.2 ("1" < "2"), but numerically
    // 0.18.10 > 0.18.2 — must NOT be flagged as below the minimum.
    const result = enforceHermesMinVersion(
      { hermesMedia: { capability: "hermes-media-generation", advertised: true, hermesVersion: "0.18.10" } },
      "0.18.2",
    );

    expect(result.belowMinimum).toBe(false);
    expect(result.capabilitiesJson.hermesMedia).toMatchObject({ advertised: true });
  });
});

describe("enforceHermesDesktopControlVersion (pure helper)", () => {
  it("demotes desktop Hermes advertising below Worker App 0.1.140", async () => {
    const {
      enforceHermesDesktopControlVersion,
      HERMES_DESKTOP_CONTROL_MIN_WORKER_APP_VERSION,
    } = await import("../workerRegistryService");

    const result = enforceHermesDesktopControlVersion(
      { hermesMedia: { advertised: true, hermesVersion: "0.18.2" } },
      "desktop_zeroclaw_managed",
      "0.1.136",
    );

    expect(HERMES_DESKTOP_CONTROL_MIN_WORKER_APP_VERSION).toBe("0.1.140");
    expect(result.belowMinimum).toBe(true);
    expect(result.capabilitiesJson.hermesMedia).toMatchObject({
      advertised: false,
      reason: "below_worker_app_version:0.1.140",
    });
    expect(result.warning).toContain("0.1.140");
  });

  it("preserves Worker App 0.1.140 and central Hermes workers", async () => {
    const { enforceHermesDesktopControlVersion } = await import("../workerRegistryService");
    const capabilities = { hermesMedia: { advertised: true, hermesVersion: "0.18.2" } };

    expect(enforceHermesDesktopControlVersion(
      capabilities,
      "desktop_zeroclaw_managed",
      "0.1.140",
    ).capabilitiesJson.hermesMedia).toMatchObject({ advertised: true });
    expect(enforceHermesDesktopControlVersion(
      capabilities,
      "hermes_agent_gateway",
      "0.1.0",
    ).capabilitiesJson.hermesMedia).toMatchObject({ advertised: true });
  });
});

describe("registerWorker — hermes_worker_min_version enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("demotes hermesMedia.advertised on registration when below the minimum (desktop_zeroclaw_managed)", async () => {
    mockGetHermesWorkerSettings.mockResolvedValue(hermesWorkerSettings("0.18.2"));
    const { registerWorker } = await import("../workerRegistryService");

    const createdWorker = {
      id: "worker-desktop-1",
      tenantId: "tenant-1",
      teamId: null,
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "per_user",
      machineId: null,
      machineName: null,
      displayName: "Worker App",
      status: "online",
      runtimeVersion: "0.1.140",
      runtimeMode: "native_constrained",
      runtimeProfileId: null,
      policyProfileId: null,
      externalReference: "worker-app://desktop-1",
      dashboardUrl: null,
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      fileScopeMode: "workspace_scoped",
      lastSeenAt: new Date("2026-07-17T00:00:00.000Z"),
      registeredByUserId: 7,
      createdAt: new Date("2026-07-17T00:00:00.000Z"),
      updatedAt: new Date("2026-07-17T00:00:00.000Z"),
    };

    const repo = {
      findRuntimeProfileByName: vi.fn().mockResolvedValue(null),
      findWorkerPolicyByName: vi.fn().mockResolvedValue(null),
      findWorkerByExternalReference: vi.fn().mockResolvedValue(null),
      createWorker: vi.fn().mockResolvedValue(createdWorker),
      updateWorker: vi.fn().mockResolvedValue(createdWorker),
    };

    const payload: WorkerRegistrationPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "0.1.140",
      },
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "per_user",
      displayName: "Worker App",
      externalReference: "worker-app://desktop-1",
      runtimeMode: "native_constrained",
      teamId: null,
      machineId: null,
      machineName: null,
      dashboardUrl: null,
      capabilitiesJson: {
        hermesMedia: {
          capability: "hermes-media-generation",
          advertised: true,
          reason: "doctor_passed",
          hermesVersion: "0.17.0",
        },
      },
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      runtimeMetadataJson: {},
      fileScopeMode: "workspace_scoped",
      runtimeProfileName: null,
      policyProfileName: null,
    };

    await registerWorker({
      auth: {
        tenantId: "tenant-1",
        teamId: null,
        runtimeType: "desktop_zeroclaw_managed",
        registeredByUserId: 7,
        audience: "smartspec-worker-registration",
        scopes: ["workers:register"],
      } as any,
      payload,
    }, { repo } as any);

    expect(repo.createWorker).toHaveBeenCalledWith(expect.objectContaining({
      capabilitiesJson: expect.objectContaining({
        hermesMedia: expect.objectContaining({
          advertised: false,
          reason: expect.stringContaining("0.18.2"),
        }),
      }),
      warningFlagsJson: expect.arrayContaining([expect.stringContaining("0.18.2")]),
    }));
  });

  it("demotes hermesMedia.advertised on registration when below the minimum (hermes_agent_gateway — shared unit is not exempt)", async () => {
    mockGetHermesWorkerSettings.mockResolvedValue(hermesWorkerSettings("0.18.2"));
    const { registerWorker } = await import("../workerRegistryService");

    const createdWorker = {
      id: "worker-hermes-shared-1",
      tenantId: "tenant-1",
      teamId: null,
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      machineId: null,
      machineName: null,
      displayName: "Hermes Shared Worker",
      status: "online",
      runtimeVersion: "0.3.0",
      runtimeMode: "external_managed",
      runtimeProfileId: null,
      policyProfileId: null,
      externalReference: "hermes://profiles/default",
      dashboardUrl: "http://127.0.0.1:9001",
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      fileScopeMode: "workspace_scoped",
      lastSeenAt: new Date("2026-07-17T00:00:00.000Z"),
      registeredByUserId: 7,
      createdAt: new Date("2026-07-17T00:00:00.000Z"),
      updatedAt: new Date("2026-07-17T00:00:00.000Z"),
    };

    const repo = {
      findRuntimeProfileByName: vi.fn().mockResolvedValue(null),
      findWorkerPolicyByName: vi.fn().mockResolvedValue(null),
      findWorkerByExternalReference: vi.fn().mockResolvedValue(null),
      createWorker: vi.fn().mockResolvedValue(createdWorker),
      updateWorker: vi.fn().mockResolvedValue(createdWorker),
    };

    const payload: WorkerRegistrationPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "0.3.0",
      },
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      displayName: "Hermes Shared Worker",
      externalReference: "hermes://profiles/default",
      runtimeMode: "external_managed",
      teamId: null,
      machineId: null,
      machineName: null,
      dashboardUrl: "http://127.0.0.1:9001",
      capabilitiesJson: {
        hermesMedia: {
          capability: "hermes-media-generation",
          advertised: true,
          reason: "doctor_passed",
          hermesVersion: "0.10.0",
        },
      },
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      runtimeMetadataJson: {
        hermesVersion: "0.3.0",
        profileName: "default",
        apiServerEnabled: true,
        apiServerBaseUrl: "http://127.0.0.1:9001",
        terminalBackend: "local",
        gatewayPlatforms: ["telegram", "discord"],
        supportsDelegatedHttp: true,
        supportsDelegatedMcp: false,
        supportsBoundConnector: true,
        supportsCallbacks: true,
        hostPlatform: "linux",
        hostExecutionMode: "native",
      },
      fileScopeMode: "workspace_scoped",
      runtimeProfileName: null,
      policyProfileName: null,
    };

    await registerWorker({
      auth: {
        tenantId: "tenant-1",
        teamId: null,
        runtimeType: "hermes_agent_gateway",
        registeredByUserId: 7,
        audience: "smartspec-worker-registration",
        scopes: ["workers:register"],
      } as any,
      payload,
    }, { repo } as any);

    expect(repo.createWorker).toHaveBeenCalledWith(expect.objectContaining({
      capabilitiesJson: expect.objectContaining({
        hermesMedia: expect.objectContaining({ advertised: false }),
      }),
    }));
  });

  it("preserves hermesMedia.advertised as sent when at/above the minimum", async () => {
    mockGetHermesWorkerSettings.mockResolvedValue(hermesWorkerSettings("0.18.2"));
    const { registerWorker } = await import("../workerRegistryService");

    const createdWorker = {
      id: "worker-desktop-2",
      tenantId: "tenant-1",
      teamId: null,
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "per_user",
      machineId: null,
      machineName: null,
      displayName: "Worker App",
      status: "online",
      runtimeVersion: "0.1.140",
      runtimeMode: "native_constrained",
      runtimeProfileId: null,
      policyProfileId: null,
      externalReference: "worker-app://desktop-2",
      dashboardUrl: null,
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      fileScopeMode: "workspace_scoped",
      lastSeenAt: new Date("2026-07-17T00:00:00.000Z"),
      registeredByUserId: 7,
      createdAt: new Date("2026-07-17T00:00:00.000Z"),
      updatedAt: new Date("2026-07-17T00:00:00.000Z"),
    };

    const repo = {
      findRuntimeProfileByName: vi.fn().mockResolvedValue(null),
      findWorkerPolicyByName: vi.fn().mockResolvedValue(null),
      findWorkerByExternalReference: vi.fn().mockResolvedValue(null),
      createWorker: vi.fn().mockResolvedValue(createdWorker),
      updateWorker: vi.fn().mockResolvedValue(createdWorker),
    };

    const payload: WorkerRegistrationPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "0.1.140",
      },
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "per_user",
      displayName: "Worker App",
      externalReference: "worker-app://desktop-2",
      runtimeMode: "native_constrained",
      teamId: null,
      machineId: null,
      machineName: null,
      dashboardUrl: null,
      capabilitiesJson: {
        hermesMedia: {
          capability: "hermes-media-generation",
          advertised: true,
          reason: "doctor_passed",
          hermesVersion: "0.18.10",
        },
      },
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      runtimeMetadataJson: {},
      fileScopeMode: "workspace_scoped",
      runtimeProfileName: null,
      policyProfileName: null,
    };

    await registerWorker({
      auth: {
        tenantId: "tenant-1",
        teamId: null,
        runtimeType: "desktop_zeroclaw_managed",
        registeredByUserId: 7,
        audience: "smartspec-worker-registration",
        scopes: ["workers:register"],
      } as any,
      payload,
    }, { repo } as any);

    expect(repo.createWorker).toHaveBeenCalledWith(expect.objectContaining({
      capabilitiesJson: expect.objectContaining({
        hermesMedia: expect.objectContaining({ advertised: true, hermesVersion: "0.18.10" }),
      }),
    }));
  });
});

describe("recordWorkerHeartbeat — hermes_worker_min_version enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("demotes a worker on heartbeat after the admin raises the minimum past its registered version", async () => {
    // Registered when the floor was low (or unset); the admin has since
    // raised hermes_worker_min_version — the very next heartbeat must
    // demote `advertised` without needing a fresh registration.
    mockGetHermesWorkerSettings.mockResolvedValue(hermesWorkerSettings("0.19.0"));
    const { recordWorkerHeartbeat } = await import("../workerRegistryService");

    const worker = {
      id: "worker-app-2",
      tenantId: "tenant-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
      capabilitiesJson: {
        hermesMedia: {
          capability: "hermes-media-generation",
          advertised: true,
          reason: "doctor_passed",
          hermesVersion: "0.18.2",
        },
      },
      healthSummaryJson: {},
      teamId: null,
    };

    const repo = {
      getWorkerById: vi.fn().mockResolvedValue(worker),
      updateWorker: vi.fn().mockImplementation(async (_workerId: string, values: any) => ({
        ...worker,
        ...values,
      })),
      insertHeartbeat: vi.fn().mockResolvedValue(undefined),
    };

    const payload: WorkerHeartbeatPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "0.1.140",
      },
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
      currentJobCount: 0,
      queueDepth: 0,
      metricsJson: {},
      warningsJson: [],
      runtimeMetadataJson: {},
    };

    const result = await recordWorkerHeartbeat({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-app-2",
        runtimeType: "desktop_zeroclaw_managed",
        scopes: ["workers:heartbeat"],
      } as any,
      payload,
      workerId: "worker-app-2",
    }, { repo } as any);

    expect(repo.updateWorker).toHaveBeenCalledWith(
      "worker-app-2",
      expect.objectContaining({
        capabilitiesJson: expect.objectContaining({
          hermesMedia: expect.objectContaining({
            advertised: false,
            reason: expect.stringContaining("0.19.0"),
          }),
        }),
      }),
    );
    // The heartbeat response the app renders as "update required" is
    // surfaced via warningFlagsJson on the persisted/returned record —
    // section-12 wires this into the HTTP heartbeat response payload.
    expect(result.warningFlagsJson).toEqual(
      expect.arrayContaining([expect.stringContaining("0.19.0")]),
    );
  });

  it("applies regardless of runtimeType (hermes_agent_gateway is not exempt)", async () => {
    mockGetHermesWorkerSettings.mockResolvedValue(hermesWorkerSettings("0.19.0"));
    const { recordWorkerHeartbeat } = await import("../workerRegistryService");

    const worker = {
      id: "worker-hermes-shared-2",
      tenantId: "tenant-1",
      runtimeType: "hermes_agent_gateway",
      status: "online",
      capabilitiesJson: {
        hermesMedia: {
          capability: "hermes-media-generation",
          advertised: true,
          reason: "doctor_passed",
          hermesVersion: "0.18.2",
        },
      },
      healthSummaryJson: {},
      teamId: null,
    };

    const repo = {
      getWorkerById: vi.fn().mockResolvedValue(worker),
      updateWorker: vi.fn().mockImplementation(async (_workerId: string, values: any) => ({
        ...worker,
        ...values,
      })),
      insertHeartbeat: vi.fn().mockResolvedValue(undefined),
    };

    const payload: WorkerHeartbeatPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "0.3.0",
      },
      runtimeType: "hermes_agent_gateway",
      status: "online",
      currentJobCount: 0,
      queueDepth: 0,
      metricsJson: {},
      warningsJson: [],
      runtimeMetadataJson: {},
    };

    await recordWorkerHeartbeat({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-hermes-shared-2",
        runtimeType: "hermes_agent_gateway",
        scopes: ["workers:heartbeat"],
      } as any,
      payload,
      workerId: "worker-hermes-shared-2",
    }, { repo } as any);

    expect(repo.updateWorker).toHaveBeenCalledWith(
      "worker-hermes-shared-2",
      expect.objectContaining({
        capabilitiesJson: expect.objectContaining({
          hermesMedia: expect.objectContaining({ advertised: false }),
        }),
      }),
    );
  });

  it("leaves a missing/absent hermesMedia block untouched on heartbeat (no crash, no synthesized capability)", async () => {
    mockGetHermesWorkerSettings.mockResolvedValue(hermesWorkerSettings("0.18.2"));
    const { recordWorkerHeartbeat } = await import("../workerRegistryService");

    const worker = {
      id: "worker-plain-1",
      tenantId: "tenant-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
      capabilitiesJson: { hyperframes: { advertised: true } },
      healthSummaryJson: {},
      teamId: null,
    };

    const repo = {
      getWorkerById: vi.fn().mockResolvedValue(worker),
      updateWorker: vi.fn().mockImplementation(async (_workerId: string, values: any) => ({
        ...worker,
        ...values,
      })),
      insertHeartbeat: vi.fn().mockResolvedValue(undefined),
    };

    const payload: WorkerHeartbeatPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "0.1.140",
      },
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
      currentJobCount: 0,
      queueDepth: 0,
      metricsJson: {},
      warningsJson: [],
      runtimeMetadataJson: {},
    };

    const result = await recordWorkerHeartbeat({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-plain-1",
        runtimeType: "desktop_zeroclaw_managed",
        scopes: ["workers:heartbeat"],
      } as any,
      payload,
      workerId: "worker-plain-1",
    }, { repo } as any);

    expect(result.capabilitiesJson.hermesMedia).toBeUndefined();
    expect(result.capabilitiesJson.hyperframes).toEqual(expect.objectContaining({ advertised: true }));
  });

  it("FIX A — a fresh hermesMedia block in the heartbeat's runtimeMetadataJson overrides the stale registration-time value", async () => {
    mockGetHermesWorkerSettings.mockResolvedValue(hermesWorkerSettings("0.18.2"));
    const { recordWorkerHeartbeat } = await import("../workerRegistryService");

    // Registered without hermes installed at all (or long before this
    // heartbeat) — the Worker App has since installed/upgraded Hermes and
    // its per-tick doctor probe now reports readiness.
    const worker = {
      id: "worker-app-3",
      tenantId: "tenant-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
      capabilitiesJson: {
        hermesMedia: {
          capability: "hermes-media-generation",
          advertised: false,
          reason: "doctor_not_ready",
          hermesVersion: null,
        },
      },
      healthSummaryJson: {},
      teamId: null,
    };

    const repo = {
      getWorkerById: vi.fn().mockResolvedValue(worker),
      updateWorker: vi.fn().mockImplementation(async (_workerId: string, values: any) => ({
        ...worker,
        ...values,
      })),
      insertHeartbeat: vi.fn().mockResolvedValue(undefined),
    };

    const payload: WorkerHeartbeatPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "0.1.140",
      },
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
      currentJobCount: 0,
      queueDepth: 0,
      metricsJson: {},
      warningsJson: [],
      runtimeMetadataJson: {
        hermesMedia: {
          capability: "hermes-media-generation",
          advertised: true,
          reason: "doctor_passed",
          hermesVersion: "0.18.10",
        },
      },
    };

    const result = await recordWorkerHeartbeat({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-app-3",
        runtimeType: "desktop_zeroclaw_managed",
        scopes: ["workers:heartbeat"],
      } as any,
      payload,
      workerId: "worker-app-3",
    }, { repo } as any);

    expect(result.capabilitiesJson.hermesMedia).toMatchObject({
      advertised: true,
      hermesVersion: "0.18.10",
    });
  });

  it("FIX A — leaves the persisted hermesMedia untouched when the heartbeat carries no fresh probe (active-heartbeat calls)", async () => {
    mockGetHermesWorkerSettings.mockResolvedValue(hermesWorkerSettings("0.18.2"));
    const { recordWorkerHeartbeat } = await import("../workerRegistryService");

    const worker = {
      id: "worker-app-4",
      tenantId: "tenant-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
      capabilitiesJson: {
        hermesMedia: {
          capability: "hermes-media-generation",
          advertised: true,
          reason: "doctor_passed",
          hermesVersion: "0.18.10",
        },
      },
      healthSummaryJson: {},
      teamId: null,
    };

    const repo = {
      getWorkerById: vi.fn().mockResolvedValue(worker),
      updateWorker: vi.fn().mockImplementation(async (_workerId: string, values: any) => ({
        ...worker,
        ...values,
      })),
      insertHeartbeat: vi.fn().mockResolvedValue(undefined),
    };

    // Mirrors the Worker App's "active heartbeat" calls fired during an
    // in-flight HyperFrames render — no hermesMedia probe in this payload.
    const payload: WorkerHeartbeatPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "0.1.140",
      },
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
      currentJobCount: 1,
      queueDepth: 0,
      metricsJson: {},
      warningsJson: [],
      runtimeMetadataJson: { doctorStatus: "ready" },
    };

    const result = await recordWorkerHeartbeat({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-app-4",
        runtimeType: "desktop_zeroclaw_managed",
        scopes: ["workers:heartbeat"],
      } as any,
      payload,
      workerId: "worker-app-4",
    }, { repo } as any);

    expect(result.capabilitiesJson.hermesMedia).toMatchObject({
      advertised: true,
      hermesVersion: "0.18.10",
    });
  });
});
