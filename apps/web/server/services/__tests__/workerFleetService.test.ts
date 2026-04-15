import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkerAccessPermissionScopesForPreset } from "../../../shared/workerAccessKeys";

const {
  mockAuditReadEntries,
  mockAuditLog,
  mockGetDelegatedWorkerManifestBySessionId,
} = vi.hoisted(() => ({
  mockAuditReadEntries: vi.fn(),
  mockAuditLog: vi.fn(),
  mockGetDelegatedWorkerManifestBySessionId: vi.fn(),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
    readEntries: mockAuditReadEntries,
    init: vi.fn(),
  },
}));

vi.mock("../workerDelegationService", () => ({
  getDelegatedWorkerManifestBySessionId: mockGetDelegatedWorkerManifestBySessionId,
}));

describe("workerFleetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditReadEntries.mockResolvedValue([]);
    mockGetDelegatedWorkerManifestBySessionId.mockResolvedValue(null);
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
          runtimeLabel: "OpenClaw Gateway",
          runtimeFamily: "OpenClaw",
          compatibilityState: "unknown",
          registrationSupport: "stable",
          dispatchSupport: "stable",
          healthState: "stale",
          boundProfileCount: 2,
          activeJobCount: 3,
          diagnosticsAvailable: true,
          remoteEndpointPolicy: null,
          channelDisplayLabel: "Channel state unavailable",
          memorySyncDisplayLabel: "Memory sync unavailable",
        }),
      ]);
    });

  it("labels Hermes workers with truthful family and rollout posture", async () => {
    const { listWorkerFleet } = await import("../workerFleetService");

    const result = await listWorkerFleet("tenant-1", {
      repo: {
        listWorkersByTenant: vi.fn().mockResolvedValue([
          {
            id: "worker-hermes-1",
            displayName: "Hermes Profile Default",
            runtimeType: "hermes_agent_gateway",
            runtimeVersion: "0.3.0",
            status: "online",
            teamId: null,
            externalReference: "hermes://profiles/default",
            lastSeenAt: new Date(),
            warningFlagsJson: [],
            healthSummaryJson: {
              controlPlane: {
                remoteEndpointPolicy: "audited_exception_granted",
              },
              details: { ok: true },
            },
            capabilitiesJson: {
              runtimeMetadata: {
                hermesVersion: "0.3.0",
                profileName: "default",
                profileLabel: "Default Personal Assistant",
                profilePurpose: "Handle personal follow-up and coordination",
                apiServerEnabled: true,
                apiServerBaseUrl: "http://127.0.0.1:9001",
                terminalBackend: "local",
                gatewayPlatforms: ["telegram"],
                supportsDelegatedHttp: true,
                supportsDelegatedMcp: false,
                supportsBoundConnector: true,
                supportsCallbacks: true,
                workerAccessPolicy: {
                  permissionPreset: "operator_basic",
                  permissionScopes: getWorkerAccessPermissionScopesForPreset("operator_basic"),
                  quotaHourly: 25,
                  quotaDaily: 250,
                  quotaWeekly: 1_000,
                  quotaMonthly: 2_500,
                },
                hostPlatform: "linux",
                hostExecutionMode: "native",
              },
            },
            dashboardUrl: "http://127.0.0.1:9001",
          },
        ]),
        listBindingCounts: vi.fn().mockResolvedValue([{ workerId: "worker-hermes-1", boundProfileCount: 1 }]),
        listActiveJobCounts: vi.fn().mockResolvedValue([{ workerId: "worker-hermes-1", activeJobCount: 0 }]),
      } as any,
    });

    expect(result).toEqual([
      expect.objectContaining({
        runtimeType: "hermes_agent_gateway",
        runtimeLabel: "Hermes Agent Gateway",
        runtimeFamily: "Hermes",
        registrationSupport: "feature_gated",
        dispatchSupport: "limited",
        remoteEndpointPolicy: "audited_exception_granted",
        personaDisplayLabel: "Default Personal Assistant",
        personaDisplayPurpose: "Handle personal follow-up and coordination",
        channelDisplayLabel: "Connected",
        memorySyncDisplayLabel: "Memory sync off",
        workerAccessPolicyPreset: "operator_basic",
        workerAccessPolicyScopeCount: 14,
        workerAccessPolicyQuotaDisplayLabel: "H25 / D250 / W1000 / M2500",
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
            controlPlane: {
              remoteEndpointPolicy: "loopback_only",
            },
            summary: {
              Authorization: "Bearer legacy-secret",
            },
            details: {
              nested: {
                refresh_token: "legacy-refresh-token",
              },
            },
          },
            capabilitiesJson: {
              runtimeMetadata: {
                hermesVersion: "0.3.0",
                profileName: "default",
                profileLabel: "Default Personal Assistant",
                profilePurpose: "Handle personal follow-up and coordination",
                apiServerEnabled: true,
                apiServerBaseUrl: "http://127.0.0.1:9001",
                terminalBackend: "local",
                gatewayPlatforms: ["telegram"],
                supportsDelegatedHttp: true,
                supportsDelegatedMcp: false,
                supportsBoundConnector: true,
                supportsCallbacks: true,
                workerAccessPolicy: {
                  permissionPreset: "readonly",
                  permissionScopes: getWorkerAccessPermissionScopesForPreset("readonly"),
                  quotaHourly: 10,
                  quotaDaily: 100,
                  quotaWeekly: null,
                  quotaMonthly: null,
                },
                hostPlatform: "linux",
                hostExecutionMode: "native",
              },
            },
        }),
      } as any,
    });

    expect(result).toEqual(expect.objectContaining({
      workerId: "worker-1",
      runtimeLabel: "OpenClaw Gateway",
        runtimeFamily: "OpenClaw",
        compatibilityState: "unknown",
        remoteEndpointPolicy: null,
        personaDisplayLabel: "Generic Hermes",
        personaDisplayPurpose: "Default Hermes behavior",
        channelDisplayLabel: "Channel state unavailable",
        memorySyncDisplayLabel: "Memory sync unavailable",
        workerAccessPolicyPreset: "readonly",
        workerAccessPolicyScopeCount: 9,
        workerAccessPolicyQuotaDisplayLabel: "H10 / D100",
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

  it("builds worker MCP insights from the latest delegated manifest and audit activity", async () => {
    mockGetDelegatedWorkerManifestBySessionId.mockResolvedValue({
      sessionId: "delegated-session-1",
      workerId: "worker-1",
      tenantId: "tenant-1",
      actingUserId: 7,
      ownerUserId: 7,
      runtimeType: "openclaw_gateway",
      workerJobId: "job-1",
      scopeProfile: "worker_gateway_hybrid_executor",
      grantedScopes: ["mcp:read", "mcp:write"],
      routeFamilies: ["mcp", "llm", "library", "rag"],
      allowedMcpNamespaces: ["gateway", "knowledge"],
      allowedModelAliases: ["gpt-5.4-mini"],
      allowedProviderProfiles: [],
      knowledgeAccess: {
        libraryRead: false,
        librarySearch: true,
        libraryUpload: false,
        ragSearch: true,
        ragIngest: false,
      },
      grantSummary: {
        skills: [],
        agencies: [],
        libraryItemIds: [],
        mcpNamespaces: ["gateway", "knowledge"],
      },
      uploadPolicy: {
        enabled: false,
        allowedItemTypes: [],
        maxFileBytes: null,
      },
      callbackTargets: {
        roomUpdate: false,
        workflowUpdate: false,
        userNotification: false,
      },
      expiresAt: "2026-04-08T12:00:00.000Z",
      availability: {
        http: "ready",
        mcp: "ready",
        knowledge: "ready",
      },
      mcp: {
        enabled: true,
        availableFamilies: ["gateway", "knowledge"],
        families: [
          { family: "gateway", enabled: true, availableToolCount: 2, reason: null },
        ],
        availableTools: [
          {
            name: "smartspec.gateway.chat.create",
            family: "gateway",
            namespace: "gateway",
            toolGroup: "gateway_generation",
            availability: "ready",
            reason: null,
          },
        ],
        experimentalTools: [],
        disabledTools: [
          {
            name: "smartspec.media.generate_image",
            family: "media",
            namespace: "media",
            toolGroup: "media_generation",
            availability: "experimental",
            reason: "approval_required_by_operator_policy",
          },
        ],
        familyFlags: {
          browserEnabled: false,
          workspaceEnabled: false,
          driveEnabled: false,
          orchestratorEnabled: false,
        },
        operatorPolicy: {
          enabled: true,
          disabledFamilies: [],
          disabledToolGroups: [],
          approvalRequiredToolGroups: ["media_generation"],
        },
      },
      discovery: {
        openApiUrl: "/v1/openapi.json",
        docsUrl: "/v1/docs",
        catalogUrl: "/v1/mcp/catalog",
        manifestPath: "/api/worker-jobs/job-1/delegated-manifest",
        recommendedAuthMode: "bearer",
        routeHints: [],
      },
    });
    mockAuditReadEntries
      .mockResolvedValueOnce([
        {
          traceId: "trace-1",
          timestamp: new Date().toISOString(),
          eventType: "mcp_tool_call",
          userId: 7,
          metadata: {
            tenantId: "tenant-1",
            workerId: "worker-1",
            event: "execute_success",
            toolName: "smartspec.gateway.chat.create",
          },
        },
        {
          traceId: "trace-2",
          timestamp: new Date().toISOString(),
          eventType: "mcp_tool_call",
          userId: 7,
          metadata: {
            tenantId: "tenant-1",
            workerId: "worker-1",
            event: "approval_required",
            toolName: "smartspec.media.generate_image",
            reason: "approval_required_by_operator_policy",
          },
        },
      ])
      .mockResolvedValue([]);

    const { getWorkerMcpInsights } = await import("../workerFleetService");

    const result = await getWorkerMcpInsights("tenant-1", "worker-1", { hours: 24 }, {
      repo: {
        getWorkerById: vi.fn().mockResolvedValue({
          id: "worker-1",
          displayName: "Gateway Alpha",
          runtimeType: "openclaw_gateway",
        }),
        getLatestDelegatedSessionForWorker: vi.fn().mockResolvedValue({
          id: "delegated-session-1",
          workerJobId: "job-1",
          scopeProfile: "worker_gateway_hybrid_executor",
          createdAt: new Date("2026-04-08T10:00:00.000Z"),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          revokedAt: null,
          manifestJson: {
            workerJobId: "job-1",
            scopeProfile: "worker_gateway_hybrid_executor",
            expiresAt: "2026-04-08T12:00:00.000Z",
            availability: {
              http: "ready",
              mcp: "ready",
              knowledge: "ready",
            },
            mcp: {
              enabled: true,
              availableFamilies: ["gateway"],
              families: [],
              availableTools: [],
              experimentalTools: [],
              disabledTools: [],
              familyFlags: {
                browserEnabled: false,
                workspaceEnabled: false,
                driveEnabled: false,
                orchestratorEnabled: false,
              },
              operatorPolicy: {
                enabled: true,
                disabledFamilies: [],
                disabledToolGroups: [],
                approvalRequiredToolGroups: [],
              },
            },
            discovery: {
              openApiUrl: "/v1/openapi.json",
              docsUrl: "/v1/docs",
              catalogUrl: "/v1/mcp/catalog",
              manifestPath: "/api/worker-jobs/job-1/delegated-manifest",
              recommendedAuthMode: "bearer",
              routeHints: [],
            },
          },
        }),
      } as any,
    });

    expect(result.manifestStatus).toBe("ready");
    expect(result.manifest?.mcp.operatorPolicy.approvalRequiredToolGroups).toEqual(["media_generation"]);
    expect(result.activeDelegatedSession?.activeMode).toEqual(expect.objectContaining({
      taskMode: "monitoring_triage",
      scopeProfile: "worker_gateway_hybrid_executor",
      displayLabel: "Monitoring triage",
    }));
    expect(result.totals.successCount).toBe(1);
    expect(result.totals.approvalRequiredCount).toBe(1);
    expect(result.toolMetrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        toolName: "smartspec.gateway.chat.create",
        successCount: 1,
      }),
      expect.objectContaining({
        toolName: "smartspec.media.generate_image",
        approvalRequiredCount: 1,
      }),
    ]));
    expect(result.denialReasons).toEqual([
      { reason: "approval_required_by_operator_policy", count: 1 },
    ]);
  });

  it("builds tenant MCP overview and keeps it tenant-scoped", async () => {
    mockAuditReadEntries.mockResolvedValueOnce([
      {
        traceId: "trace-1",
        timestamp: new Date().toISOString(),
        eventType: "mcp_tool_call",
        userId: 7,
        metadata: {
          tenantId: "tenant-1",
          workerId: "worker-1",
          event: "execute_success",
          toolName: "smartspec.gateway.chat.create",
        },
      },
      {
        traceId: "trace-2",
        timestamp: new Date().toISOString(),
        eventType: "mcp_tool_call",
        userId: 7,
        metadata: {
          tenantId: "tenant-1",
          workerId: "worker-2",
          event: "budget_denied",
          toolName: "smartspec.media.generate_image",
          reason: "worker_budget_exhausted",
        },
      },
      {
        traceId: "trace-3",
        timestamp: new Date().toISOString(),
        eventType: "mcp_tool_call",
        userId: 7,
        metadata: {
          tenantId: "tenant-2",
          workerId: "worker-9",
          event: "execute_success",
          toolName: "smartspec.gateway.chat.create",
        },
      },
    ]);

    const { getTenantWorkerMcpOverview } = await import("../workerFleetService");

    const repo = {
      listWorkersByTenant: vi.fn().mockResolvedValue([
        {
          id: "worker-1",
          displayName: "Gateway Alpha",
          runtimeType: "openclaw_gateway",
          status: "online",
          lastSeenAt: new Date("2026-04-08T09:30:00.000Z"),
        },
        {
          id: "worker-2",
          displayName: "Gateway Beta",
          runtimeType: "openclaw_gateway",
          status: "online",
          lastSeenAt: new Date("2026-04-08T09:45:00.000Z"),
        },
      ]),
      getLatestDelegatedSessionForWorker: vi
        .fn()
        .mockImplementation(async (_tenantId: string, workerId: string) => {
          if (workerId === "worker-1") {
            return {
              id: "delegated-session-1",
              workerId: "worker-1",
              workerJobId: "job-1",
              scopeProfile: "worker_gateway_hybrid_executor",
              createdAt: new Date("2026-04-08T10:00:00.000Z"),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
              revokedAt: null,
              manifestJson: {
                sessionId: "delegated-session-1",
                workerId: "worker-1",
                tenantId: "tenant-1",
                actingUserId: 7,
                ownerUserId: 7,
                runtimeType: "openclaw_gateway",
                workerJobId: "job-1",
                scopeProfile: "worker_gateway_hybrid_executor",
                grantedScopes: ["mcp:read", "mcp:write"],
                routeFamilies: ["mcp", "llm", "library", "rag"],
                allowedMcpNamespaces: ["gateway"],
                allowedModelAliases: ["gpt-5.4-mini"],
                allowedProviderProfiles: [],
                knowledgeAccess: {
                  libraryRead: false,
                  librarySearch: true,
                  libraryUpload: false,
                  ragSearch: true,
                  ragIngest: false,
                },
                grantSummary: {
                  skills: [],
                  agencies: [],
                  libraryItemIds: [],
                  mcpNamespaces: ["gateway"],
                },
                uploadPolicy: {
                  enabled: false,
                  allowedItemTypes: [],
                  maxFileBytes: null,
                },
                callbackTargets: {
                  roomUpdate: false,
                  workflowUpdate: false,
                  userNotification: false,
                },
                expiresAt: "2026-04-08T12:00:00.000Z",
                availability: {
                  http: "ready",
                  mcp: "ready",
                  knowledge: "ready",
                },
                mcp: {
                  enabled: true,
                  availableFamilies: ["gateway"],
                  families: [],
                  availableTools: [],
                  experimentalTools: [],
                  disabledTools: [],
                  familyFlags: {
                    browserEnabled: false,
                    workspaceEnabled: false,
                    driveEnabled: false,
                    orchestratorEnabled: false,
                  },
                  operatorPolicy: {
                    enabled: true,
                    disabledFamilies: [],
                    disabledToolGroups: [],
                    approvalRequiredToolGroups: [],
                  },
                },
                discovery: {
                  openApiUrl: "/v1/openapi.json",
                  docsUrl: "/v1/docs",
                  catalogUrl: "/v1/mcp/catalog",
                  manifestPath: "/api/worker-jobs/job-1/delegated-manifest",
                  recommendedAuthMode: "bearer",
                  routeHints: [],
                },
              },
            };
          }
          return {
            id: "delegated-session-2",
            workerId: "worker-2",
            workerJobId: "job-2",
            scopeProfile: "worker_gateway_hybrid_executor",
            createdAt: new Date("2026-04-08T07:00:00.000Z"),
            expiresAt: new Date(Date.now() - 60 * 60 * 1000),
            revokedAt: null,
            manifestJson: {
              sessionId: "delegated-session-2",
              workerId: "worker-2",
              tenantId: "tenant-1",
              actingUserId: 7,
              ownerUserId: 7,
              runtimeType: "openclaw_gateway",
              workerJobId: "job-2",
              scopeProfile: "worker_gateway_hybrid_executor",
              grantedScopes: ["mcp:read", "mcp:write"],
              routeFamilies: ["mcp", "media"],
              allowedMcpNamespaces: ["media"],
              allowedModelAliases: ["gpt-5.4-mini"],
              allowedProviderProfiles: [],
              knowledgeAccess: {
                libraryRead: false,
                librarySearch: false,
                libraryUpload: false,
                ragSearch: false,
                ragIngest: false,
              },
              grantSummary: {
                skills: [],
                agencies: [],
                libraryItemIds: [],
                mcpNamespaces: ["media"],
              },
              uploadPolicy: {
                enabled: false,
                allowedItemTypes: [],
                maxFileBytes: null,
              },
              callbackTargets: {
                roomUpdate: false,
                workflowUpdate: false,
                userNotification: false,
              },
              expiresAt: "2026-04-08T08:00:00.000Z",
              availability: {
                http: "ready",
                mcp: "ready",
                knowledge: "ready",
              },
              mcp: {
                enabled: true,
                availableFamilies: ["media"],
                families: [],
                availableTools: [],
                experimentalTools: [],
                disabledTools: [],
                familyFlags: {
                  browserEnabled: false,
                  workspaceEnabled: false,
                  driveEnabled: false,
                  orchestratorEnabled: false,
                },
                operatorPolicy: {
                  enabled: true,
                  disabledFamilies: [],
                  disabledToolGroups: [],
                  approvalRequiredToolGroups: [],
                },
              },
              discovery: {
                openApiUrl: "/v1/openapi.json",
                docsUrl: "/v1/docs",
                catalogUrl: "/v1/mcp/catalog",
                manifestPath: "/api/worker-jobs/job-2/delegated-manifest",
                recommendedAuthMode: "bearer",
                routeHints: [],
              },
            },
          };
        }),
    };

    const result = await getTenantWorkerMcpOverview("tenant-1", { hours: 24 }, {
      repo: repo as any,
    });

    expect(result.totalWorkers).toBe(2);
    expect(result.workersWithRecentMcpCalls).toBe(2);
    expect(result.workersWithActiveDelegatedSessions).toBe(1);
    expect(result.manifestStatusCounts).toEqual({
      ready: 1,
      stale: 1,
      unavailable: 0,
    });
    expect(result.totals.successCount).toBe(1);
    expect(result.totals.budgetDeniedCount).toBe(1);
    expect(result.denialReasons).toEqual([
      { reason: "worker_budget_exhausted", count: 1 },
    ]);
    expect(result.workerMetrics.slice(0, 2)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workerId: "worker-1",
        displayName: "Gateway Alpha",
        manifestStatus: "ready",
        toolCalls: 1,
      }),
      expect.objectContaining({
        workerId: "worker-2",
        displayName: "Gateway Beta",
        manifestStatus: "stale",
        blockedCount: 1,
      }),
    ]));
    expect(result.recentEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workerId: "worker-1",
        workerDisplayName: "Gateway Alpha",
      }),
      expect.objectContaining({
        workerId: "worker-2",
        workerDisplayName: "Gateway Beta",
      }),
    ]));
  });
});
