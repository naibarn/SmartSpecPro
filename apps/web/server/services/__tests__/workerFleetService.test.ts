import { beforeEach, describe, expect, it, vi } from "vitest";

describe("workerFleetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives worker fleet summaries with stale health and counters", async () => {
    const { listWorkerFleet } = await import("../workerFleetService");

    const result = await listWorkerFleet("tenant-1", {
      repo: {
        listWorkersByTenant: vi.fn().mockResolvedValue([
          {
            id: "worker-1",
            displayName: "Gateway Alpha",
            runtimeType: "openclaw_gateway",
            runtimeVersion: "1.2.3",
            status: "online",
            teamId: "team-1",
            externalReference: "openclaw://alpha",
            lastSeenAt: new Date(Date.now() - 15 * 60 * 1000),
            warningFlagsJson: ["disk-low"],
            healthSummaryJson: { details: { ok: true } },
            dashboardUrl: "https://gateway.example.test",
          },
        ]),
        listBindingCounts: vi.fn().mockResolvedValue([{ workerId: "worker-1", boundProfileCount: 2 }]),
        listActiveJobCounts: vi.fn().mockResolvedValue([{ workerId: "worker-1", activeJobCount: 3 }]),
      } as any,
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "worker-1",
        healthState: "stale",
        boundProfileCount: 2,
        activeJobCount: 3,
        diagnosticsAvailable: true,
      }),
    ]);
  });

  it("sanitizes legacy diagnostics payloads when reading snapshots", async () => {
    const { getWorkerDiagnosticsSnapshot } = await import("../workerFleetService");

    const result = await getWorkerDiagnosticsSnapshot("tenant-1", "worker-1", {
      repo: {
        getWorkerById: vi.fn().mockResolvedValue({
          id: "worker-1",
          displayName: "Gateway Alpha",
          runtimeType: "openclaw_gateway",
          status: "online",
          dashboardUrl: "https://gateway.example.test",
          warningFlagsJson: [" disk-low "],
          healthSummaryJson: {
            capturedAt: "2026-04-06T10:00:00.000Z",
            summary: {
              Authorization: "Bearer legacy-secret",
            },
            details: {
              nested: {
                refresh_token: "legacy-refresh-token",
              },
            },
          },
        }),
      } as any,
    });

    expect(result).toEqual(expect.objectContaining({
      workerId: "worker-1",
      summaryJson: {
        Authorization: "[REDACTED]",
      },
      detailsJson: {
        nested: {
          refresh_token: "[REDACTED]",
        },
      },
      warningFlagsJson: ["disk-low"],
    }));
  });

  it("marks revoked workers disabled and blocks resume without re-registration", async () => {
    const { updateWorkerFleetState } = await import("../workerFleetService");

    const baseWorker = {
      id: "worker-1",
      tenantId: "tenant-1",
      runtimeType: "openclaw_gateway",
      status: "online",
      healthSummaryJson: {},
    };
    const repo = {
      getWorkerById: vi.fn().mockResolvedValue(baseWorker),
      updateWorker: vi.fn().mockResolvedValue({
        ...baseWorker,
        status: "disabled",
        healthSummaryJson: {
          controlPlane: {
            revokedAt: "2026-04-06T00:00:00.000Z",
          },
        },
      }),
    };

    const revoked = await updateWorkerFleetState({
      tenantId: "tenant-1",
      workerId: "worker-1",
      action: "revoke",
      actorUserId: 7,
    }, { repo: repo as any });

    expect(revoked.status).toBe("disabled");
    expect(repo.updateWorker).toHaveBeenCalledWith(
      "worker-1",
      expect.objectContaining({
        status: "disabled",
        healthSummaryJson: expect.objectContaining({
          controlPlane: expect.objectContaining({
            revokedAt: expect.any(String),
            revokedByUserId: 7,
          }),
        }),
      }),
    );

    repo.getWorkerById.mockResolvedValueOnce({
      ...baseWorker,
      status: "disabled",
      healthSummaryJson: {
        controlPlane: {
          revokedAt: "2026-04-06T00:00:00.000Z",
        },
      },
    });

    await expect(updateWorkerFleetState({
      tenantId: "tenant-1",
      workerId: "worker-1",
      action: "resume",
      actorUserId: 7,
    }, { repo: repo as any })).rejects.toThrow("re-registered");
  });

  it("runs retention cleanup through the repository contract", async () => {
    const { cleanupWorkerFleetRetention } = await import("../workerFleetService");

    const repo = {
      cleanupHeartbeatsBefore: vi.fn().mockResolvedValue(4),
      cleanupJobEventsBefore: vi.fn().mockResolvedValue(3),
      cleanupUnpublishedArtifactsBefore: vi.fn().mockResolvedValue(2),
      expireStaleJobsBefore: vi.fn().mockResolvedValue(1),
    };

    const result = await cleanupWorkerFleetRetention({
      tenantId: "tenant-1",
      heartbeatRetentionDays: 10,
      jobEventRetentionDays: 5,
      unpublishedArtifactRetentionDays: 2,
      staleLeaseGraceHours: 6,
    }, {
      repo: repo as any,
    });

    expect(repo.cleanupHeartbeatsBefore).toHaveBeenCalledWith("tenant-1", expect.any(Date));
    expect(repo.cleanupJobEventsBefore).toHaveBeenCalledWith("tenant-1", expect.any(Date));
    expect(repo.cleanupUnpublishedArtifactsBefore).toHaveBeenCalledWith("tenant-1", expect.any(Date));
    expect(repo.expireStaleJobsBefore).toHaveBeenCalledWith("tenant-1", expect.any(Date));
    expect(result).toEqual({
      deletedHeartbeats: 4,
      deletedJobEvents: 3,
      deletedUnpublishedArtifacts: 2,
      expiredJobs: 1,
    });
  });

  it("redacts legacy worker diagnostics and artifact metadata idempotently", async () => {
    const { redactLegacyWorkerData } = await import("../workerFleetService");

    const repo = {
      listWorkersByTenant: vi.fn().mockResolvedValue([
        {
          id: "worker-1",
          dashboardUrl: "https://gateway.example.test",
          capabilitiesJson: { healthy: true },
          hardwareJson: { gpu: "ok" },
          healthSummaryJson: {
            summary: {
              Authorization: "Bearer stale-secret",
            },
          },
          warningFlagsJson: [" disk-low "],
        },
        {
          id: "worker-2",
          dashboardUrl: null,
          capabilitiesJson: { healthy: true },
          hardwareJson: { gpu: "ok" },
          healthSummaryJson: {
            summary: {
              Authorization: "[REDACTED]",
            },
          },
          warningFlagsJson: ["disk-low"],
        },
      ]),
      listArtifactsByTenant: vi.fn().mockResolvedValue([
        {
          id: "artifact-1",
          metadataJson: {
            fileName: "report.pdf",
            refresh_token: "stale-refresh-token",
          },
        },
        {
          id: "artifact-2",
          metadataJson: {
            fileName: "clean.pdf",
            refresh_token: "[REDACTED]",
          },
        },
      ]),
      updateWorker: vi.fn().mockResolvedValue({}),
      updateArtifact: vi.fn().mockResolvedValue({}),
    };

    const result = await redactLegacyWorkerData({
      tenantId: "tenant-1",
      actorUserId: 7,
    }, { repo: repo as any });

    expect(repo.listWorkersByTenant).toHaveBeenCalledWith("tenant-1");
    expect(repo.listArtifactsByTenant).toHaveBeenCalledWith("tenant-1");
    expect(repo.updateWorker).toHaveBeenCalledTimes(1);
    expect(repo.updateWorker).toHaveBeenCalledWith("worker-1", expect.objectContaining({
      healthSummaryJson: {
        summary: {
          Authorization: "[REDACTED]",
        },
      },
      warningFlagsJson: ["disk-low"],
    }));
    expect(repo.updateArtifact).toHaveBeenCalledTimes(1);
    expect(repo.updateArtifact).toHaveBeenCalledWith("artifact-1", {
      metadataJson: {
        fileName: "report.pdf",
        refresh_token: "[REDACTED]",
      },
    });
    expect(result).toEqual({
      tenantId: "tenant-1",
      scannedWorkers: 2,
      updatedWorkers: 1,
      scannedArtifacts: 2,
      updatedArtifacts: 1,
    });
  });
});
