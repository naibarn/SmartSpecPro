import { beforeEach, describe, expect, it } from "vitest";

import {
  createDelegatedWorkerSession,
  getDelegatedWorkerManifest,
} from "../workerDelegationService";
import type { WorkerDelegationRepository } from "../workerDelegationService";
import { getWorkerAccessPermissionScopesForPreset } from "../../../shared/workerAccessKeys";

process.env.JWT_SECRET ??= "worker-delegation-service-test-secret-0123456789";

type SessionRecord = Record<string, any>;
type GrantRecord = Record<string, any>;

describe("workerDelegationService", () => {
  let sessions: SessionRecord[];
  let grants: GrantRecord[];
  let repo: WorkerDelegationRepository;

  beforeEach(() => {
    sessions = [];
    grants = [];

    repo = {
      async getWorkerById(_tenantId, workerId) {
        if (workerId !== "worker-1") return null;
        return {
          id: "worker-1",
          tenantId: "tenant-1",
          registeredByUserId: 7,
          runtimeType: "openclaw_gateway",
        };
      },
      async getWorkerJobById(_tenantId, jobId) {
        if (jobId !== "job-1") return null;
        return {
          id: "job-1",
          tenantId: "tenant-1",
          workerId: "worker-1",
          teamId: null,
          requestedByUserId: 7,
          status: "running",
          leaseOwnerToken: "lease-1",
          leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          inputJson: {},
          workflowRunId: null,
        };
      },
      async revokeActiveSessionsForJob(workerJobId, workerId) {
        for (const session of sessions) {
          if (session.workerJobId === workerJobId && session.workerId === workerId && !session.revokedAt) {
            session.revokedAt = new Date();
          }
        }
      },
      async insertDelegatedSession(values) {
        const session = { ...values };
        sessions.push(session);
        return session;
      },
      async insertWorkerJobGrants(values) {
        for (const grant of values) {
          grants.push({ ...grant });
        }
      },
      async getDelegatedSessionById(sessionId) {
        return sessions.find((session) => session.id === sessionId) ?? null;
      },
      async listActiveGrantsForSession(sessionId) {
        return grants.filter((grant) => grant.delegatedSessionId === sessionId);
      },
      async getLatestActiveSessionForJob(workerJobId, workerId) {
        return [...sessions]
          .reverse()
          .find((session) =>
            session.workerJobId === workerJobId
            && session.workerId === workerId
            && !session.revokedAt,
          ) ?? null;
      },
    };
  });

  it("builds delegated manifests with discovery hints for available HTTP routes", async () => {
    const auth = {
      audience: "smartspec-worker-control-plane",
      runtimeType: "openclaw_gateway" as const,
      scopes: ["workers:claim"] as const,
      subject: "worker:worker-1",
      teamId: null,
      tenantId: "tenant-1",
      tokenUse: "worker_execution" as const,
      workerId: "worker-1",
    };

    const created = await createDelegatedWorkerSession({
      auth,
      jobId: "job-1",
      payload: {
        leaseOwnerToken: "lease-1",
        scopeProfile: "worker_gateway_hybrid_executor",
        grants: {
          skills: [],
          agencies: [],
          libraryItemIds: [],
          mcpNamespaces: ["gateway", "knowledge", "skills"],
          knowledge: {
            librarySearch: true,
            libraryUpload: true,
            ragSearch: true,
            ragIngest: true,
          },
        },
      },
    }, {
      repo,
      getFeatureFlags: async () => ({
        openClawExternalRuntime: true,
        desktopZeroClawWorker: false,
        nemoClawSecureWorkerPool: false,
        hiClawClusterRuntime: false,
      }),
    });

    expect(created.manifest.discovery.openApiUrl).toBe("/v1/openapi.json");
    expect(created.manifest.discovery.routeHints).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/v1/chat/completions" }),
      expect.objectContaining({ path: "/v1/knowledge/rag/ingest" }),
      expect.objectContaining({ path: "/api/worker-jobs/job-1/publish-user-notification" }),
    ]));
    expect(created.manifest.knowledgeAccess.ragIngest).toBe(true);
    expect(created.manifest.availability.knowledge).toBe("ready");
    expect(created.manifest.mcp.enabled).toBe(true);
    expect(created.manifest.mcp.availableFamilies).toEqual(expect.arrayContaining(["gateway", "knowledge", "skills"]));
    expect(created.activeMode).toEqual({
      taskMode: "monitoring_triage",
      scopeProfile: "worker_gateway_hybrid_executor",
      displayLabel: "Monitoring triage",
    });
    expect(created.manifest.activeMode).toEqual(created.activeMode);
    expect(created.manifest.mcp.availableTools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "smartspec.gateway.chat.create", toolGroup: "gateway_generation" }),
      expect.objectContaining({ name: "smartspec.knowledge.rag.search", toolGroup: "knowledge_read" }),
    ]));

    const manifest = await getDelegatedWorkerManifest({
      auth,
      jobId: "job-1",
    }, {
      repo,
    });

    expect(manifest.discovery.docsUrl).toBe("/v1/docs");
    expect(manifest.discovery.manifestPath).toBe("/api/worker-jobs/job-1/delegated-manifest");
    expect(manifest.discovery.routeHints).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/v1/knowledge/library/upload" }),
      expect.objectContaining({ path: "/v1/knowledge/rag/search" }),
      expect.objectContaining({ path: "/v1/knowledge/rag/ingest" }),
    ]));
    expect(manifest.mcp.operatorPolicy.enabled).toBe(true);
    expect(manifest.mcp.operatorPolicy.disabledFamilies).toEqual([]);
  });

  it("marks delegated MCP unavailable when the operator disables delegated MCP globally", async () => {
    const previous = process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED;
    process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED = "false";

    try {
      const auth = {
        audience: "smartspec-worker-control-plane",
        runtimeType: "openclaw_gateway" as const,
        scopes: ["workers:claim"] as const,
        subject: "worker:worker-1",
        teamId: null,
        tenantId: "tenant-1",
        tokenUse: "worker_execution" as const,
        workerId: "worker-1",
      };

      const created = await createDelegatedWorkerSession({
        auth,
        jobId: "job-1",
        payload: {
          leaseOwnerToken: "lease-1",
          scopeProfile: "worker_gateway_hybrid_executor",
          grants: {
            skills: [],
            agencies: [],
            libraryItemIds: [],
            mcpNamespaces: ["gateway", "knowledge"],
            knowledge: {},
          },
        },
      }, {
        repo,
        getFeatureFlags: async () => ({
          openClawExternalRuntime: true,
          desktopZeroClawWorker: false,
          nemoClawSecureWorkerPool: false,
          hiClawClusterRuntime: false,
        }),
      });

      expect(created.manifest.availability.mcp).toBe("unavailable");
      expect(created.manifest.mcp.enabled).toBe(false);
      expect(created.manifest.mcp.operatorPolicy.enabled).toBe(false);
    } finally {
      process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED = previous;
    }
  });

  it("builds Hermes delegated manifests from explicit bridge capability flags", async () => {
    repo = {
      ...repo,
      async getWorkerById(_tenantId, workerId) {
        if (workerId !== "worker-1") return null;
        return {
          id: "worker-1",
          tenantId: "tenant-1",
          registeredByUserId: 7,
          runtimeType: "hermes_agent_gateway",
          capabilitiesJson: {
            runtimeMetadata: {
              apiServerEnabled: true,
              apiServerBaseUrl: "http://127.0.0.1:9001",
              supportsDelegatedHttp: true,
              supportsDelegatedMcp: false,
              supportsCallbacks: true,
            },
          },
        };
      },
      async getWorkerJobById(_tenantId, jobId) {
        if (jobId !== "job-1") return null;
        return {
          id: "job-1",
          tenantId: "tenant-1",
          workerId: "worker-1",
          teamId: null,
          requestedByUserId: 7,
          status: "running",
          leaseOwnerToken: "lease-1",
          leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          inputJson: { roomId: "room-1" },
          workflowRunId: "run-1",
        };
      },
    };

    const auth = {
      audience: "smartspec-worker-control-plane",
      runtimeType: "hermes_agent_gateway" as const,
      scopes: ["workers:claim"] as const,
      subject: "worker:worker-1",
      teamId: null,
      tenantId: "tenant-1",
      tokenUse: "worker_execution" as const,
      workerId: "worker-1",
    };

    const created = await createDelegatedWorkerSession({
      auth,
      jobId: "job-1",
      payload: {
        leaseOwnerToken: "lease-1",
        scopeProfile: "worker_gateway_hybrid_executor",
        grants: {
          skills: [],
          agencies: [],
          libraryItemIds: [],
          mcpNamespaces: ["gateway", "knowledge"],
          knowledge: {
            librarySearch: true,
            libraryUpload: false,
            ragSearch: true,
            ragIngest: false,
          },
        },
      },
    }, {
      repo,
      getFeatureFlags: async () => ({
        openClawExternalRuntime: false,
        desktopZeroClawWorker: false,
        nemoClawSecureWorkerPool: false,
        hiClawClusterRuntime: false,
        hermesAgentRuntime: true,
      }),
    });

    expect(created.manifest.runtimeType).toBe("hermes_agent_gateway");
    expect(created.manifest.availability.http).toBe("ready");
    expect(created.manifest.availability.mcp).toBe("unavailable");
    expect(created.manifest.mcp.enabled).toBe(false);
    expect(created.activeMode).toEqual({
      taskMode: "monitoring_triage",
      scopeProfile: "worker_gateway_hybrid_executor",
      displayLabel: "Monitoring triage",
    });
    expect(created.manifest.discovery.routeHints).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/v1/chat/completions" }),
      expect.objectContaining({ path: "/api/worker-jobs/job-1/publish-room-update" }),
    ]));
    expect(created.manifest.discovery.routeHints).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/v1/mcp" }),
    ]));
  });

  it("rejects Hermes delegated sessions when the bridge API server is missing or unsafe", async () => {
    repo = {
      ...repo,
      async getWorkerById(_tenantId, workerId) {
        if (workerId !== "worker-1") return null;
        return {
          id: "worker-1",
          tenantId: "tenant-1",
          registeredByUserId: 7,
          runtimeType: "hermes_agent_gateway",
          capabilitiesJson: {
            runtimeMetadata: {
              apiServerEnabled: true,
              apiServerBaseUrl: "https://hermes.example.com",
              supportsDelegatedHttp: true,
              supportsDelegatedMcp: true,
              supportsCallbacks: true,
            },
          },
        };
      },
    };

    const auth = {
      audience: "smartspec-worker-control-plane",
      runtimeType: "hermes_agent_gateway" as const,
      scopes: ["workers:claim"] as const,
      subject: "worker:worker-1",
      teamId: null,
      tenantId: "tenant-1",
      tokenUse: "worker_execution" as const,
      workerId: "worker-1",
    };

    await expect(createDelegatedWorkerSession({
      auth,
      jobId: "job-1",
      payload: {
        leaseOwnerToken: "lease-1",
        scopeProfile: "worker_gateway_hybrid_executor",
        grants: {
          skills: [],
          agencies: [],
          libraryItemIds: [],
          mcpNamespaces: [],
          knowledge: {},
        },
      },
    }, {
      repo,
      getFeatureFlags: async () => ({
        openClawExternalRuntime: false,
        desktopZeroClawWorker: false,
        nemoClawSecureWorkerPool: false,
        hiClawClusterRuntime: false,
        hermesAgentRuntime: true,
      }),
    })).rejects.toMatchObject({
      code: "runtime_capability_unavailable",
      statusCode: 409,
    });
  });

  it("allows Hermes delegated sessions to use a remote API server when an audited policy exception is present", async () => {
    repo = {
      ...repo,
      async getWorkerById(_tenantId, workerId) {
        if (workerId !== "worker-1") return null;
        return {
          id: "worker-1",
          tenantId: "tenant-1",
          registeredByUserId: 7,
          runtimeType: "hermes_agent_gateway",
          capabilitiesJson: {
            runtimeMetadata: {
              apiServerEnabled: true,
              apiServerBaseUrl: "https://hermes.example.com",
              remoteEndpointPolicyExceptionId: "hermes-remote-allow-001",
              supportsDelegatedHttp: true,
              supportsDelegatedMcp: true,
              supportsCallbacks: true,
            },
          },
        };
      },
    };

    const auth = {
      audience: "smartspec-worker-control-plane",
      runtimeType: "hermes_agent_gateway" as const,
      scopes: ["workers:claim"] as const,
      subject: "worker:worker-1",
      teamId: null,
      tenantId: "tenant-1",
      tokenUse: "worker_execution" as const,
      workerId: "worker-1",
    };

    const created = await createDelegatedWorkerSession({
      auth,
      jobId: "job-1",
      payload: {
        leaseOwnerToken: "lease-1",
        scopeProfile: "worker_gateway_hybrid_executor",
        grants: {
          skills: [],
          agencies: [],
          libraryItemIds: [],
          mcpNamespaces: ["gateway"],
          knowledge: {},
        },
      },
    }, {
      repo,
      getFeatureFlags: async () => ({
        openClawExternalRuntime: false,
        desktopZeroClawWorker: false,
        nemoClawSecureWorkerPool: false,
        hiClawClusterRuntime: false,
        hermesAgentRuntime: true,
      }),
    });

    expect(created.manifest.availability.http).toBe("ready");
    expect(created.manifest.discovery.routeHints).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/v1/chat/completions" }),
    ]));
  });

  it("rejects delegated sessions when the worker access policy does not cover the requested scopes", async () => {
    repo = {
      ...repo,
      async getWorkerById(_tenantId, workerId) {
        if (workerId !== "worker-1") return null;
        return {
          id: "worker-1",
          tenantId: "tenant-1",
          registeredByUserId: 7,
          runtimeType: "hermes_agent_gateway",
          capabilitiesJson: {
            runtimeMetadata: {
              apiServerEnabled: true,
              apiServerBaseUrl: "https://hermes.example.com",
              remoteEndpointPolicyExceptionId: "hermes-remote-allow-001",
              supportsDelegatedHttp: true,
              supportsDelegatedMcp: true,
              supportsCallbacks: true,
              workerAccessPolicy: {
                permissionPreset: "readonly",
                permissionScopes: getWorkerAccessPermissionScopesForPreset("readonly"),
                quotaHourly: 10,
                quotaDaily: 100,
                quotaWeekly: null,
                quotaMonthly: null,
              },
            },
          },
        };
      },
    };

    const auth = {
      audience: "smartspec-worker-control-plane",
      runtimeType: "hermes_agent_gateway" as const,
      scopes: ["workers:claim"] as const,
      subject: "worker:worker-1",
      teamId: null,
      tenantId: "tenant-1",
      tokenUse: "worker_execution" as const,
      workerId: "worker-1",
    };

    await expect(createDelegatedWorkerSession({
      auth,
      jobId: "job-1",
      payload: {
        leaseOwnerToken: "lease-1",
        scopeProfile: "worker_gateway_hybrid_executor",
        grants: {
          skills: ["skill-1"],
          agencies: [],
          libraryItemIds: [],
          mcpNamespaces: ["gateway"],
          knowledge: {
            ragIngest: true,
          },
        },
      },
    }, {
      repo,
      getFeatureFlags: async () => ({
        openClawExternalRuntime: false,
        desktopZeroClawWorker: false,
        nemoClawSecureWorkerPool: false,
        hiClawClusterRuntime: false,
        hermesAgentRuntime: true,
      }),
    })).rejects.toMatchObject({
      code: "worker_access_policy_denied",
      statusCode: 403,
    });
  });

  it("rejects audited remote Hermes sessions when the endpoint downgrades to http", async () => {
    repo = {
      ...repo,
      async getWorkerById(_tenantId, workerId) {
        if (workerId !== "worker-1") return null;
        return {
          id: "worker-1",
          tenantId: "tenant-1",
          registeredByUserId: 7,
          runtimeType: "hermes_agent_gateway",
          capabilitiesJson: {
            runtimeMetadata: {
              apiServerEnabled: true,
              apiServerBaseUrl: "http://hermes.example.com",
              remoteEndpointPolicyExceptionId: "hermes-remote-allow-001",
              supportsDelegatedHttp: true,
              supportsDelegatedMcp: true,
              supportsCallbacks: true,
            },
          },
        };
      },
    };

    const auth = {
      audience: "smartspec-worker-control-plane",
      runtimeType: "hermes_agent_gateway" as const,
      scopes: ["workers:claim"] as const,
      subject: "worker:worker-1",
      teamId: null,
      tenantId: "tenant-1",
      tokenUse: "worker_execution" as const,
      workerId: "worker-1",
    };

    await expect(createDelegatedWorkerSession({
      auth,
      jobId: "job-1",
      payload: {
        leaseOwnerToken: "lease-1",
        scopeProfile: "worker_gateway_hybrid_executor",
        grants: {
          skills: [],
          agencies: [],
          libraryItemIds: [],
          mcpNamespaces: [],
          knowledge: {},
        },
      },
    }, {
      repo,
      getFeatureFlags: async () => ({
        openClawExternalRuntime: false,
        desktopZeroClawWorker: false,
        nemoClawSecureWorkerPool: false,
        hiClawClusterRuntime: false,
        hermesAgentRuntime: true,
      }),
    })).rejects.toMatchObject({
      code: "runtime_capability_unavailable",
      statusCode: 409,
    });
  });
});
