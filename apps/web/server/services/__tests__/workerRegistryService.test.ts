import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  WorkerArtifactCompletePayload,
  WorkerHeartbeatPayload,
  WorkerJobEventPayload,
  WorkerRegistrationPayload,
} from "../../../shared/workerRuntime";

describe("workerRegistryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps registration idempotent for the same runtime identity", async () => {
    const {
      registerWorker,
    } = await import("../workerRegistryService");

    const existingWorker = {
      id: "worker-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      runtimeType: "openclaw_gateway",
      workerMode: "external_runtime",
      machineId: null,
      machineName: null,
      displayName: "OpenClaw Main",
      status: "online",
      runtimeVersion: "1.2.3",
      runtimeMode: "external_managed",
      runtimeProfileId: null,
      policyProfileId: null,
      externalReference: "openclaw://main",
      dashboardUrl: null,
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      fileScopeMode: "workspace_scoped",
      lastSeenAt: new Date("2026-04-06T00:00:00.000Z"),
      registeredByUserId: 7,
      createdAt: new Date("2026-04-06T00:00:00.000Z"),
      updatedAt: new Date("2026-04-06T00:00:00.000Z"),
    };

    const repo = {
      findRuntimeProfileByName: vi.fn().mockResolvedValue(null),
      findWorkerPolicyByName: vi.fn().mockResolvedValue(null),
      findWorkerByExternalReference: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingWorker),
      createWorker: vi.fn().mockResolvedValue(existingWorker),
      updateWorker: vi.fn().mockResolvedValue(existingWorker),
    };

    const payload: WorkerRegistrationPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "1.2.3",
      },
      runtimeType: "openclaw_gateway",
      workerMode: "external_runtime",
      displayName: "OpenClaw Main",
      externalReference: "openclaw://main",
      runtimeMode: "external_managed",
      teamId: "team-1",
      machineId: null,
      machineName: null,
      dashboardUrl: null,
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      runtimeMetadataJson: {},
      fileScopeMode: "workspace_scoped",
      runtimeProfileName: null,
      policyProfileName: null,
    };

    const auth = {
      tenantId: "tenant-1",
      teamId: "team-1",
      runtimeType: "openclaw_gateway",
      registeredByUserId: 7,
      audience: "smartspec-worker-registration",
      externalReference: "openclaw://main",
      scopes: ["workers:register"],
    } as any;

    const created = await registerWorker({ auth, payload }, { repo } as any);
    const repeated = await registerWorker({ auth, payload }, { repo } as any);

    expect(created.created).toBe(true);
    expect(repeated.created).toBe(false);
    expect(repeated.worker.id).toBe("worker-1");
    expect(repo.createWorker).toHaveBeenCalledTimes(1);
  });

  it("rejects incompatible protocol versions before mutating state", async () => {
    const { registerWorker } = await import("../workerRegistryService");

    const payload: WorkerRegistrationPayload = {
      compatibility: {
        protocolVersion: "2026-04-05",
        runtimeVersion: "1.2.3",
      },
      runtimeType: "openclaw_gateway",
      workerMode: "external_runtime",
      displayName: "OpenClaw Main",
      externalReference: "openclaw://main",
      runtimeMode: "external_managed",
      teamId: null,
      machineId: null,
      machineName: null,
      dashboardUrl: null,
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      runtimeMetadataJson: {},
      fileScopeMode: "workspace_scoped",
      runtimeProfileName: null,
      policyProfileName: null,
    };

    await expect(registerWorker({
      auth: {
        tenantId: "tenant-1",
        teamId: null,
        runtimeType: "openclaw_gateway",
        registeredByUserId: 7,
        audience: "smartspec-worker-registration",
        scopes: ["workers:register"],
      } as any,
      payload,
    }, {
      repo: {
        findRuntimeProfileByName: vi.fn(),
        findWorkerPolicyByName: vi.fn(),
        findWorkerByExternalReference: vi.fn(),
        createWorker: vi.fn(),
        updateWorker: vi.fn(),
      },
    } as any)).rejects.toMatchObject({
      code: "protocol_incompatible",
      statusCode: 409,
    });
  });

  it("rejects runtime-profile incompatibility separately from transport compatibility", async () => {
    const { registerWorker } = await import("../workerRegistryService");

    const payload: WorkerRegistrationPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "1.2.3",
        runtimeProfileSchemaVersion: "2030-01-01",
      },
      runtimeType: "openclaw_gateway",
      workerMode: "external_runtime",
      displayName: "OpenClaw Main",
      externalReference: "openclaw://main",
      runtimeMode: "external_managed",
      teamId: null,
      machineId: null,
      machineName: null,
      dashboardUrl: null,
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      runtimeMetadataJson: {},
      fileScopeMode: "workspace_scoped",
      runtimeProfileName: null,
      policyProfileName: null,
    };

    await expect(registerWorker({
      auth: {
        tenantId: "tenant-1",
        teamId: null,
        runtimeType: "openclaw_gateway",
        registeredByUserId: 7,
        audience: "smartspec-worker-registration",
        scopes: ["workers:register"],
      } as any,
      payload,
    }, {
      repo: {
        findRuntimeProfileByName: vi.fn(),
        findWorkerPolicyByName: vi.fn(),
        findWorkerByExternalReference: vi.fn(),
        createWorker: vi.fn(),
        updateWorker: vi.fn(),
      },
    } as any)).rejects.toMatchObject({
      code: "protocol_incompatible",
      statusCode: 409,
    });
  });

  it("stores compatibility state and runtime metadata for desktop workers", async () => {
    const { registerWorker } = await import("../workerRegistryService");

    const createdWorker = {
      id: "worker-desktop-1",
      tenantId: "tenant-1",
      teamId: "team-video",
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "shared_department",
      machineId: "machine-01",
      machineName: "render-host-01",
      displayName: "Render Host 01",
      status: "online",
      runtimeVersion: "2.0.0",
      runtimeMode: "wsl2_managed",
      runtimeProfileId: null,
      policyProfileId: null,
      externalReference: "desktop://render-host-01",
      dashboardUrl: "http://127.0.0.1:4318",
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      fileScopeMode: "team_drive",
      lastSeenAt: new Date("2026-04-06T00:00:00.000Z"),
      registeredByUserId: 7,
      createdAt: new Date("2026-04-06T00:00:00.000Z"),
      updatedAt: new Date("2026-04-06T00:00:00.000Z"),
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
        runtimeVersion: "2.0.0",
      },
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "shared_department",
      displayName: "Render Host 01",
      externalReference: "desktop://render-host-01",
      runtimeMode: "wsl2_managed",
      teamId: "team-video",
      machineId: "machine-01",
      machineName: "render-host-01",
      dashboardUrl: "http://127.0.0.1:4318",
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      runtimeMetadataJson: {
        desktopVersion: "0.77.0",
        runtimeProfile: "wsl2_managed",
        workspaceRootsSummary: [{ root: "\\\\media\\team", accessMode: "team_drive" }],
        gpuSnapshot: { vendor: "nvidia" },
        toolchainSummary: { ffmpeg: "7.0" },
        doctorSummary: { status: "ok" },
        serviceMode: "managed_startup",
        executionIdentity: {
          mode: "service_identity",
          approvalMode: "team_approved",
          budgetAttributionMode: "team_budget",
          tokenRotationTriggers: ["manual_reissue", "policy_change", "revocation"],
        },
      },
      fileScopeMode: "team_drive",
      runtimeProfileName: null,
      policyProfileName: null,
    };

    await registerWorker({
      auth: {
        tenantId: "tenant-1",
        teamId: "team-video",
        runtimeType: "desktop_zeroclaw_managed",
        registeredByUserId: 7,
        audience: "smartspec-worker-registration",
        scopes: ["workers:register"],
      } as any,
      payload,
    }, { repo } as any);

    expect(repo.createWorker).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      capabilitiesJson: expect.objectContaining({
        runtimeMetadata: expect.objectContaining({
          desktopVersion: "0.77.0",
          serviceMode: "managed_startup",
        }),
      }),
      healthSummaryJson: expect.objectContaining({
        controlPlane: expect.objectContaining({
          compatibility: expect.objectContaining({
            runtimeType: "desktop_zeroclaw_managed",
            transport: expect.objectContaining({
              compatible: true,
            }),
            runtimeProfile: expect.objectContaining({
              compatible: true,
            }),
          }),
        }),
      }),
    }));
  });

  it("stores compatibility state and Hermes bridge runtime metadata", async () => {
    const { registerWorker } = await import("../workerRegistryService");

    const createdWorker = {
      id: "worker-hermes-1",
      tenantId: "tenant-1",
      teamId: null,
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      machineId: null,
      machineName: null,
      displayName: "Hermes Personal Agent",
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
      lastSeenAt: new Date("2026-04-11T00:00:00.000Z"),
      registeredByUserId: 7,
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
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
      displayName: "Hermes Personal Agent",
      externalReference: "hermes://profiles/default",
      runtimeMode: "external_managed",
      teamId: null,
      machineId: null,
      machineName: null,
      dashboardUrl: "http://127.0.0.1:9001",
      capabilitiesJson: {},
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
      runtimeType: "hermes_agent_gateway",
      capabilitiesJson: expect.objectContaining({
        runtimeMetadata: expect.objectContaining({
          hermesVersion: "0.3.0",
          profileName: "default",
          apiServerBaseUrl: "http://127.0.0.1:9001",
          supportsBoundConnector: true,
        }),
      }),
      healthSummaryJson: expect.objectContaining({
        controlPlane: expect.objectContaining({
          runtimeFamily: "Hermes",
          featureFlag: "hermesAgentRuntime",
          remoteEndpointPolicy: "loopback_only",
          compatibility: expect.objectContaining({
            runtimeType: "hermes_agent_gateway",
            transport: expect.objectContaining({
              compatible: true,
            }),
          }),
        }),
      }),
    }));
  });

  it("stores an audited remote-endpoint exception for Hermes bridge registrations", async () => {
    const { registerWorker } = await import("../workerRegistryService");

    const createdWorker = {
      id: "worker-hermes-remote-1",
      tenantId: "tenant-1",
      teamId: null,
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      machineId: null,
      machineName: null,
      displayName: "Hermes Personal Agent",
      status: "online",
      runtimeVersion: "0.3.0",
      runtimeMode: "external_managed",
      runtimeProfileId: null,
      policyProfileId: null,
      externalReference: "hermes://profiles/default",
      dashboardUrl: "https://hermes.example.com",
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      fileScopeMode: "workspace_scoped",
      lastSeenAt: new Date("2026-04-11T00:00:00.000Z"),
      registeredByUserId: 7,
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
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
      displayName: "Hermes Personal Agent",
      externalReference: "hermes://profiles/default",
      runtimeMode: "external_managed",
      teamId: null,
      machineId: null,
      machineName: null,
      dashboardUrl: "https://hermes.example.com",
      capabilitiesJson: {},
      hardwareJson: {},
      healthSummaryJson: {},
      warningFlagsJson: [],
      runtimeMetadataJson: {
        hermesVersion: "0.3.0",
        profileName: "default",
        profileLabel: "Default Personal Assistant",
        profilePurpose: "Handle personal follow-up and coordination",
        apiServerEnabled: true,
        apiServerBaseUrl: "https://hermes.example.com",
        remoteEndpointPolicyExceptionId: "hermes-remote-allow-001",
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
        permissionPreset: "custom",
        permissionScopes: ["workers:register", "llm:chat", "workos:write"],
        quotaHourly: 9,
        quotaDaily: 90,
        quotaWeekly: 450,
        quotaMonthly: 900,
      } as any,
      payload,
    }, { repo } as any);

    expect(repo.createWorker).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "hermes_agent_gateway",
      capabilitiesJson: expect.objectContaining({
        delegatedSpendCaps: expect.objectContaining({
          hourlyCredits: 9,
          dailyCredits: 90,
          weeklyCredits: 450,
          monthlyCredits: 900,
        }),
        runtimeMetadata: expect.objectContaining({
          apiServerBaseUrl: "https://hermes.example.com",
          remoteEndpointPolicyExceptionId: "hermes-remote-allow-001",
          profileLabel: "Default Personal Assistant",
          profilePurpose: "Handle personal follow-up and coordination",
          workerAccessPolicy: expect.objectContaining({
            permissionPreset: "custom",
            permissionScopes: ["workers:register", "llm:chat", "workos:write"],
            quotaHourly: 9,
            quotaDaily: 90,
            quotaWeekly: 450,
            quotaMonthly: 900,
          }),
        }),
      }),
      healthSummaryJson: expect.objectContaining({
        controlPlane: expect.objectContaining({
          runtimeFamily: "Hermes",
          featureFlag: "hermesAgentRuntime",
          remoteEndpointPolicy: "audited_exception_granted",
        }),
      }),
    }));
  });

  it("updates worker status and lastSeenAt on heartbeat", async () => {
    const { recordWorkerHeartbeat } = await import("../workerRegistryService");

    const worker = {
      id: "worker-1",
      tenantId: "tenant-1",
      runtimeType: "openclaw_gateway",
      status: "offline",
    };

    const repo = {
      getWorkerById: vi.fn().mockResolvedValue(worker),
      updateWorker: vi.fn().mockResolvedValue({
        ...worker,
        status: "online",
        lastSeenAt: new Date("2026-04-06T12:00:00.000Z"),
      }),
      insertHeartbeat: vi.fn().mockResolvedValue(undefined),
    };

    const payload: WorkerHeartbeatPayload = {
      compatibility: {
        protocolVersion: "2026-04-06",
        runtimeVersion: "1.2.3",
      },
      runtimeType: "openclaw_gateway",
      status: "online",
      currentJobCount: 1,
      queueDepth: 0,
      freeDiskBytes: 1024,
      metricsJson: { gpu: "ok" },
      warningsJson: [],
      runtimeMetadataJson: {},
    };

    const result = await recordWorkerHeartbeat({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      } as any,
      workerId: "worker-1",
      payload,
    }, { repo } as any);

    expect(result.status).toBe("online");
    expect(repo.updateWorker).toHaveBeenCalled();
    expect(repo.insertHeartbeat).toHaveBeenCalled();
  });

  it("backfills compatibility state for legacy workers on heartbeat without re-registration", async () => {
    const { recordWorkerHeartbeat } = await import("../workerRegistryService");

    const worker = {
      id: "worker-legacy-openclaw",
      tenantId: "tenant-1",
      runtimeType: "openclaw_gateway",
      status: "offline",
      healthSummaryJson: {},
    };

    const repo = {
      getWorkerById: vi.fn().mockResolvedValue(worker),
      updateWorker: vi.fn().mockResolvedValue({
        ...worker,
        status: "online",
        lastSeenAt: new Date("2026-04-06T12:00:00.000Z"),
      }),
      insertHeartbeat: vi.fn().mockResolvedValue(undefined),
    };

    await recordWorkerHeartbeat({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-legacy-openclaw",
        runtimeType: "openclaw_gateway",
      } as any,
      workerId: "worker-legacy-openclaw",
      payload: {
        compatibility: {
          protocolVersion: "2026-04-06",
          runtimeVersion: "1.2.3",
        },
        runtimeType: "openclaw_gateway",
        status: "online",
        currentJobCount: 0,
        queueDepth: 0,
        freeDiskBytes: 1024,
        metricsJson: {},
        warningsJson: [],
      },
    }, { repo } as any);

    expect(repo.updateWorker).toHaveBeenCalledWith(
      "worker-legacy-openclaw",
      expect.objectContaining({
        healthSummaryJson: expect.objectContaining({
          controlPlane: expect.objectContaining({
            compatibility: expect.objectContaining({
              runtimeType: "openclaw_gateway",
              transport: expect.objectContaining({ compatible: true }),
            }),
          }),
        }),
      }),
    );
  });

  it("rejects revoked worker tokens before mutating heartbeat state", async () => {
    const { recordWorkerHeartbeat } = await import("../workerRegistryService");

    const repo = {
      getWorkerById: vi.fn().mockResolvedValue({
        id: "worker-1",
        tenantId: "tenant-1",
        runtimeType: "openclaw_gateway",
        status: "online",
        healthSummaryJson: {
          controlPlane: {
            revokedAt: "2026-04-06T00:00:00.000Z",
          },
        },
      }),
      updateWorker: vi.fn(),
      insertHeartbeat: vi.fn(),
    };

    await expect(recordWorkerHeartbeat({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      } as any,
      workerId: "worker-1",
      payload: {
        compatibility: {
          protocolVersion: "2026-04-06",
          runtimeVersion: "1.2.3",
        },
        runtimeType: "openclaw_gateway",
        status: "online",
        currentJobCount: 0,
        queueDepth: 0,
        freeDiskBytes: 1024,
        metricsJson: {},
        warningsJson: [],
      },
    }, { repo } as any)).rejects.toMatchObject({
      code: "worker_auth_invalid",
      statusCode: 401,
    });

    expect(repo.updateWorker).not.toHaveBeenCalled();
  });

  it("enforces lease exclusivity during claim", async () => {
    const { claimWorkerJob } = await import("../workerRegistryService");

    const job = {
      id: "job-1",
      tenantId: "tenant-1",
      teamId: null,
      workerId: null,
      runtimeType: "openclaw_gateway",
      status: "queued",
      priority: 10,
      capabilityRequirementsJson: {},
      inputJson: {},
      instructionsJson: {},
      outputJson: null,
      failureReason: null,
      timeoutSeconds: 300,
      retryPolicyJson: {},
      idempotencyKey: null,
      leaseOwnerToken: null,
      leaseExpiresAt: null,
      createdAt: new Date("2026-04-06T00:00:00.000Z"),
      startedAt: null,
      finishedAt: null,
    };

    const repo = {
      getWorkerById: vi.fn().mockResolvedValue({
        id: "worker-1",
        tenantId: "tenant-1",
        teamId: null,
        runtimeType: "openclaw_gateway",
        status: "online",
        capabilitiesJson: {},
      }),
      listClaimableJobs: vi.fn().mockResolvedValue([job]),
      tryClaimJob: vi.fn()
        .mockResolvedValueOnce({
          ...job,
          workerId: "worker-1",
          status: "claimed",
          leaseOwnerToken: "lease-1",
          leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
        })
        .mockResolvedValueOnce(null),
    };

    const first = await claimWorkerJob({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      } as any,
      workerId: "worker-1",
      payload: { maxJobs: 1, capabilityHints: [] },
    }, { repo } as any);

    const second = await claimWorkerJob({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      } as any,
      workerId: "worker-1",
      payload: { maxJobs: 1, capabilityHints: [] },
    }, { repo } as any);

    expect(first.job?.id).toBe("job-1");
    expect(first.job?.leaseOwnerToken).toBe("lease-1");
    expect(second.job).toBeNull();
  });

  it("rejects replayed or illegal out-of-order worker job events", async () => {
    const { recordWorkerJobEvent } = await import("../workerRegistryService");

    const baseJob = {
      id: "job-1",
      tenantId: "tenant-1",
      teamId: null,
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      status: "claimed",
      priority: 10,
      capabilityRequirementsJson: {},
      inputJson: {},
      instructionsJson: {},
      outputJson: null,
      failureReason: null,
      timeoutSeconds: 300,
      retryPolicyJson: {},
      idempotencyKey: null,
      leaseOwnerToken: "lease-1",
      leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
      createdAt: new Date("2026-04-06T00:00:00.000Z"),
      startedAt: null,
      finishedAt: null,
    };

    const events = [
      {
        id: "evt-1",
        workerJobId: "job-1",
        eventType: "job.running",
        payloadJson: { sequenceNumber: 1 },
        createdAt: new Date("2026-04-06T00:01:00.000Z"),
      },
    ];

    const repo = {
      getJobById: vi.fn().mockResolvedValue(baseJob),
      listJobEvents: vi.fn().mockResolvedValue(events),
      insertJobEvent: vi.fn(),
      updateJob: vi.fn(),
    };

    const replayPayload: WorkerJobEventPayload = {
      eventType: "job.running",
      payloadJson: {},
      sequenceNumber: 1,
    };

    const replay = await recordWorkerJobEvent({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      } as any,
      jobId: "job-1",
      payload: { ...replayPayload, leaseOwnerToken: "lease-1" } as any,
    }, { repo } as any);

    expect(replay.accepted).toBe(false);
    expect(repo.insertJobEvent).not.toHaveBeenCalled();

    const illegalPayload: WorkerJobEventPayload = {
      eventType: "job.completed",
      payloadJson: {},
      sequenceNumber: 2,
    };

    await expect(recordWorkerJobEvent({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      } as any,
      jobId: "job-1",
      payload: { ...illegalPayload, leaseOwnerToken: "lease-1" } as any,
    }, { repo } as any)).rejects.toMatchObject({
      code: "worker_state_invalid",
      statusCode: 409,
    });
  });

  it("enforces the canonical video_assembly progress taxonomy", async () => {
    const { recordWorkerJobEvent } = await import("../workerRegistryService");

    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: "job-video-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "video_assembly",
        status: "running",
        leaseOwnerToken: "lease-1",
        leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
      }),
      listJobEvents: vi.fn().mockResolvedValue([]),
      insertJobEvent: vi.fn(),
      updateJob: vi.fn(),
    };

    await expect(recordWorkerJobEvent({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
      } as any,
      jobId: "job-video-1",
      payload: {
        eventType: "job.progress",
        payloadJson: {
          stage: "invent_new_stage",
        },
        sequenceNumber: 1,
        leaseOwnerToken: "lease-1",
      },
    }, { repo } as any)).rejects.toMatchObject({
      code: "invalid_request",
      statusCode: 400,
    });
  });

  it("enforces structured browser automation payloads for openclaw jobs", async () => {
    const { recordWorkerJobEvent } = await import("../workerRegistryService");

    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: "job-browser-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
        jobType: "browser_automation_task",
        status: "running",
        leaseOwnerToken: "lease-1",
        leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
      }),
      listJobEvents: vi.fn().mockResolvedValue([]),
      insertJobEvent: vi.fn(),
      updateJob: vi.fn(),
    };

    await expect(recordWorkerJobEvent({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      } as any,
      jobId: "job-browser-1",
      payload: {
        eventType: "job.progress",
        payloadJson: {
          sessionId: "lbs_demo_123",
          publishedArtifacts: ["invalid-shape"],
        },
        sequenceNumber: 1,
        leaseOwnerToken: "lease-1",
      },
    }, { repo } as any)).rejects.toMatchObject({
      code: "invalid_request",
      statusCode: 400,
    });
  });

  it("enforces the canonical local_folder_ingest progress taxonomy", async () => {
    const { recordWorkerJobEvent } = await import("../workerRegistryService");

    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: "job-ingest-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "local_folder_ingest",
        status: "running",
        leaseOwnerToken: "lease-1",
        leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
      }),
      listJobEvents: vi.fn().mockResolvedValue([]),
      insertJobEvent: vi.fn(),
      updateJob: vi.fn(),
    };

    await expect(recordWorkerJobEvent({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
      } as any,
      jobId: "job-ingest-1",
      payload: {
        eventType: "job.progress",
        payloadJson: {
          stage: "invent_new_stage",
        },
        sequenceNumber: 1,
        leaseOwnerToken: "lease-1",
      },
    }, { repo } as any)).rejects.toMatchObject({
      code: "invalid_request",
      statusCode: 400,
    });
  });

  it("enforces the canonical comfy_image_generation failure taxonomy", async () => {
    const { recordWorkerJobEvent } = await import("../workerRegistryService");

    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: "job-comfy-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "comfy_image_generation",
        status: "running",
        leaseOwnerToken: "lease-1",
        leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
      }),
      listJobEvents: vi.fn().mockResolvedValue([]),
      insertJobEvent: vi.fn(),
      updateJob: vi.fn(),
    };

    await expect(recordWorkerJobEvent({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
      } as any,
      jobId: "job-comfy-1",
      payload: {
        eventType: "job.failed",
        payloadJson: {
          failureCode: "invent_new_failure",
        },
        sequenceNumber: 1,
        leaseOwnerToken: "lease-1",
      },
    }, { repo } as any)).rejects.toMatchObject({
      code: "invalid_request",
      statusCode: 400,
    });
  });

  it("enforces the canonical comfy_workflow_run progress taxonomy", async () => {
    const { recordWorkerJobEvent } = await import("../workerRegistryService");

    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: "job-comfy-workflow-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "comfy_workflow_run",
        status: "running",
        leaseOwnerToken: "lease-1",
        leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
      }),
      listJobEvents: vi.fn().mockResolvedValue([]),
      insertJobEvent: vi.fn(),
      updateJob: vi.fn(),
    };

    await expect(recordWorkerJobEvent({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "desktop_zeroclaw_managed",
      } as any,
      jobId: "job-comfy-workflow-1",
      payload: {
        eventType: "job.progress",
        payloadJson: {
          stage: "invent_new_stage",
        },
        sequenceNumber: 1,
        leaseOwnerToken: "lease-1",
      },
    }, { repo } as any)).rejects.toMatchObject({
      code: "invalid_request",
      statusCode: 400,
    });
  });

  it("makes artifact completion idempotent for the same storage ref and checksum", async () => {
    const { completeWorkerArtifact } = await import("../workerRegistryService");

    const baseJob = {
      id: "job-1",
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      status: "uploading",
      leaseOwnerToken: "lease-1",
      leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
    };

    const artifact = {
      id: "artifact-1",
      workerJobId: "job-1",
      artifactType: "log",
      storageRef: "worker-artifacts/tenant-1/job-1/log.txt",
      metadataJson: { checksumSha256: "abc123" },
      publishedItemId: null,
      createdAt: new Date("2026-04-06T00:03:00.000Z"),
    };

    const repo = {
      getJobById: vi.fn().mockResolvedValue(baseJob),
      findArtifact: vi.fn().mockResolvedValue(artifact),
      insertArtifact: vi.fn(),
      updateJob: vi.fn(),
    };

    const payload: WorkerArtifactCompletePayload = {
      artifactType: "log",
      storageRef: "worker-artifacts/tenant-1/job-1/log.txt",
      checksumSha256: "abc123",
      sizeBytes: 128,
      contentType: "text/plain",
      metadataJson: {},
    };

    const result = await completeWorkerArtifact({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      } as any,
      jobId: "job-1",
      payload: { ...payload, leaseOwnerToken: "lease-1" } as any,
    }, { repo } as any);

    expect(result.created).toBe(false);
    expect(result.artifact.id).toBe("artifact-1");
    expect(repo.insertArtifact).not.toHaveBeenCalled();
  });

  it("sanitizes artifact metadata before persistence", async () => {
    const { completeWorkerArtifact } = await import("../workerRegistryService");

    const baseJob = {
      id: "job-1",
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      status: "uploading",
      outputJson: {},
      leaseOwnerToken: "lease-1",
      leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
    };

    const repo = {
      getJobById: vi.fn().mockResolvedValue(baseJob),
      findArtifact: vi.fn().mockResolvedValue(null),
      insertArtifact: vi.fn().mockResolvedValue({
        id: "artifact-2",
        workerJobId: "job-1",
        artifactType: "final_report",
        storageRef: "worker-artifacts/tenant-1/job-1/report.pdf",
        metadataJson: {},
        publishedItemId: null,
      }),
      updateJob: vi.fn().mockResolvedValue(undefined),
    };

    await completeWorkerArtifact({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      } as any,
      jobId: "job-1",
      payload: {
        artifactType: "final_report",
        storageRef: "worker-artifacts/tenant-1/job-1/report.pdf",
        checksumSha256: "a".repeat(64),
        sizeBytes: 2048,
        contentType: "application/pdf",
        metadataJson: {
          fileName: "report.pdf",
          Authorization: "Bearer super-secret-token",
          nested: {
            "API-Key": "top-secret",
          },
        },
        leaseOwnerToken: "lease-1",
      },
    }, { repo } as any);

    expect(repo.insertArtifact).toHaveBeenCalledWith(expect.objectContaining({
      metadataJson: expect.objectContaining({
        fileName: "report.pdf",
        Authorization: "[REDACTED]",
        nested: {
          "API-Key": "[REDACTED]",
        },
        checksumSha256: "a".repeat(64),
        contentType: "application/pdf",
        sizeBytes: 2048,
      }),
    }));
  });

  it("redacts secrets from diagnostics before persistence", async () => {
    const { recordWorkerDiagnostics } = await import("../workerRegistryService");

    const repo = {
      getWorkerById: vi.fn().mockResolvedValue({
        id: "worker-1",
        tenantId: "tenant-1",
        runtimeType: "openclaw_gateway",
        healthSummaryJson: {
          controlPlane: {
            lastActionAt: "2026-04-06T00:00:00.000Z",
          },
        },
        warningFlagsJson: [],
        registeredByUserId: 7,
      }),
      updateWorkerDiagnostics: vi.fn().mockResolvedValue({
        id: "worker-1",
        status: "online",
      }),
    };

    await recordWorkerDiagnostics({
      auth: {
        tenantId: "tenant-1",
        workerId: "worker-1",
        runtimeType: "openclaw_gateway",
      } as any,
      workerId: "worker-1",
      payload: {
        summaryJson: { ok: true },
        detailsJson: {
          Authorization: "Bearer super-secret-token",
          nested: {
            "API-Key": "hidden-value",
          },
        },
        warningFlagsJson: [" disk-low "],
      },
    }, { repo } as any);

    expect(repo.updateWorkerDiagnostics).toHaveBeenCalledWith(
      "worker-1",
      expect.objectContaining({
        healthSummaryJson: expect.objectContaining({
          details: {
            Authorization: "[REDACTED]",
            nested: {
              "API-Key": "[REDACTED]",
            },
          },
          controlPlane: {
            lastActionAt: "2026-04-06T00:00:00.000Z",
          },
        }),
        warningFlagsJson: ["disk-low"],
      }),
    );
  });
});
