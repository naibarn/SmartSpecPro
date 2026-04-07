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
