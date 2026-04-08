import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET ??= "worker-runtime-route-test-secret-0123456789";

const { mockGetTenantFeatureFlags, mockIsJtiRevoked } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
  mockIsJtiRevoked: vi.fn(),
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../_core/revocation", () => ({
  isJtiRevoked: mockIsJtiRevoked,
}));

describe("workerRuntime routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlags.mockResolvedValue({ openClawExternalRuntime: true });
    mockIsJtiRevoked.mockResolvedValue(false);
  });

  async function makeApp(overrides: Partial<{
    workerCallbacks: Record<string, any>;
    workerDelegation: Record<string, any>;
    workerRegistry: Record<string, any>;
    workerPolicy: Record<string, any>;
  }> = {}) {
    const { registerWorkerRuntimeRoutes } = await import("../workerRuntime");

    const app = express();
    app.use(express.json());
    registerWorkerRuntimeRoutes(app, {
      workerCallbacks: {
        publishWorkerCallback: vi.fn().mockResolvedValue({
          accepted: true,
          replayed: false,
          channel: "room_update",
          publishedArtifactCount: 1,
        }),
        ...(overrides.workerCallbacks ?? {}),
      },
      workerDelegation: {
        createDelegatedWorkerSession: vi.fn().mockResolvedValue({
          sessionId: "session-1",
          token: "delegate-token",
          audience: "smartspec-worker-gateway",
          tokenUse: "worker_gateway_delegate",
          scopeProfile: "worker_gateway_hybrid_executor",
          grantedScopes: ["llm:chat"],
          expiresAt: "2026-04-07T12:00:00.000Z",
          manifest: {
            sessionId: "session-1",
            workerId: "worker-1",
            workerJobId: "job-1",
            tenantId: "tenant-1",
            actingUserId: 7,
            ownerUserId: 7,
            runtimeType: "openclaw_gateway",
            scopeProfile: "worker_gateway_hybrid_executor",
            grantedScopes: ["llm:chat"],
            routeFamilies: ["llm"],
            allowedMcpNamespaces: [],
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
              mcpNamespaces: [],
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
            availability: {
              http: "ready",
              mcp: "unavailable",
              knowledge: "unavailable",
            },
            mcp: {
              enabled: false,
              availableFamilies: [],
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
            expiresAt: "2026-04-07T12:00:00.000Z",
          },
        }),
        getDelegatedWorkerManifest: vi.fn().mockResolvedValue({
          sessionId: "session-1",
          workerId: "worker-1",
          workerJobId: "job-1",
          tenantId: "tenant-1",
          actingUserId: 7,
          ownerUserId: 7,
          runtimeType: "openclaw_gateway",
          scopeProfile: "worker_gateway_hybrid_executor",
          grantedScopes: ["llm:chat", "rag:ingest"],
          routeFamilies: ["llm", "rag"],
          allowedMcpNamespaces: [],
          allowedModelAliases: ["gpt-5.4-mini"],
          allowedProviderProfiles: [],
          knowledgeAccess: {
            libraryRead: true,
            librarySearch: true,
            libraryUpload: true,
            ragSearch: true,
            ragIngest: true,
          },
          grantSummary: {
            skills: [],
            agencies: [],
            libraryItemIds: [],
            mcpNamespaces: [],
          },
          uploadPolicy: {
            enabled: true,
            allowedItemTypes: ["document"],
            maxFileBytes: 52428800,
          },
          callbackTargets: {
            roomUpdate: true,
            workflowUpdate: true,
            userNotification: true,
          },
          availability: {
            http: "ready",
            mcp: "unavailable",
            knowledge: "ready",
          },
          mcp: {
            enabled: false,
            availableFamilies: [],
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
            routeHints: [
              {
                family: "rag",
                method: "POST",
                path: "/v1/knowledge/rag/ingest",
                availability: "ready",
                purpose: "Upload or re-index owner files for RAG ingestion",
              },
            ],
          },
          expiresAt: "2026-04-07T12:00:00.000Z",
        }),
        ...(overrides.workerDelegation ?? {}),
      },
      workerRegistry: {
        registerWorker: vi.fn().mockResolvedValue({
          created: true,
          worker: { id: "worker-1", tenantId: "tenant-1", runtimeType: "openclaw_gateway", status: "online" },
          tokens: {
            executionToken: "execution-token",
            uploadToken: "upload-token",
          },
        }),
        recordWorkerHeartbeat: vi.fn().mockResolvedValue({ status: "online" }),
        claimWorkerJob: vi.fn().mockResolvedValue({ job: null }),
        recordWorkerJobEvent: vi.fn().mockResolvedValue({ accepted: true }),
        initWorkerArtifactUpload: vi.fn().mockResolvedValue({
          storageRef: "worker-artifacts/tenant-1/job-1/output.txt",
          method: "presigned",
          uploadUrl: "https://upload.example.test",
        }),
        completeWorkerArtifact: vi.fn().mockResolvedValue({
          created: true,
          artifact: { id: "artifact-1" },
        }),
        recordWorkerDiagnostics: vi.fn().mockResolvedValue({ accepted: true }),
        ...(overrides.workerRegistry ?? {}),
      },
      workerPolicy: {
        getWorkerPolicySnapshot: vi.fn().mockResolvedValue({
          workerId: "worker-1",
          runtimeType: "openclaw_gateway",
          policy: {},
          runtimeProfile: null,
        }),
        ...(overrides.workerPolicy ?? {}),
      },
    });

    return app;
  }

  it("rejects registration without a bootstrap credential", async () => {
    const app = await makeApp();

    const res = await request(app)
      .post("/api/workers/register")
      .send({
        compatibility: { protocolVersion: "2026-04-06", runtimeVersion: "1.2.3" },
        runtimeType: "openclaw_gateway",
        displayName: "OpenClaw Main",
        externalReference: "openclaw://main",
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("worker_auth_invalid");
  });

  it("rejects generic interactive bearer tokens on registration", async () => {
    const { signBearerToken } = await import("../../_core/tokens");
    const app = await makeApp();

    const token = signBearerToken({
      sub: "user-7",
      type: "access",
      scopes: ["llm:chat"],
      jti: "generic-bearer",
    } as any, "15m");

    const res = await request(app)
      .post("/api/workers/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compatibility: { protocolVersion: "2026-04-06", runtimeVersion: "1.2.3" },
        runtimeType: "openclaw_gateway",
        displayName: "OpenClaw Main",
        externalReference: "openclaw://main",
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("worker_auth_invalid");
  });

  it("registers a worker with a valid bootstrap token and returns worker-bound tokens", async () => {
    const { createWorkerRegistrationToken } = await import("../../services/workerAuthService");
    const app = await makeApp();

    const token = createWorkerRegistrationToken({
      tenantId: "tenant-1",
      runtimeType: "openclaw_gateway",
      teamId: "team-1",
      registeredByUserId: 7,
    });

    const res = await request(app)
      .post("/api/workers/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compatibility: { protocolVersion: "2026-04-06", runtimeVersion: "1.2.3" },
        runtimeType: "openclaw_gateway",
        teamId: "team-1",
        displayName: "OpenClaw Main",
        externalReference: "openclaw://main",
      });

    expect(res.status).toBe(201);
    expect(res.body.worker.id).toBe("worker-1");
    expect(res.body.tokens.executionToken).toBeTruthy();
    expect(res.body.tokens.uploadToken).toBeTruthy();
  });

  it("fails closed when the worker feature flag is disabled", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ openClawExternalRuntime: false });

    const { createWorkerRegistrationToken } = await import("../../services/workerAuthService");
    const app = await makeApp();

    const token = createWorkerRegistrationToken({
      tenantId: "tenant-disabled",
      runtimeType: "openclaw_gateway",
    });

    const res = await request(app)
      .post("/api/workers/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compatibility: { protocolVersion: "2026-04-06", runtimeVersion: "1.2.3" },
        runtimeType: "openclaw_gateway",
        displayName: "OpenClaw Main",
        externalReference: "openclaw://main",
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("feature_disabled");
  });

  it("rejects worker policy fetch when the token worker binding does not match the route worker", async () => {
    const { issueWorkerAccessTokens } = await import("../../services/workerAuthService");
    const app = await makeApp();

    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
    });

    const res = await request(app)
      .get("/api/workers/worker-2/policy")
      .set("Authorization", `Bearer ${tokens.executionToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("worker_scope_mismatch");
  });

  it("returns delegated manifests with discovery guidance for the worker runtime", async () => {
    const { issueWorkerAccessTokens } = await import("../../services/workerAuthService");
    const app = await makeApp();

    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
    });

    const res = await request(app)
      .get("/api/worker-jobs/job-1/delegated-manifest")
      .set("Authorization", `Bearer ${tokens.executionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.manifest.discovery.openApiUrl).toBe("/v1/openapi.json");
    expect(res.body.manifest.discovery.routeHints).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/v1/knowledge/rag/ingest" }),
    ]));
    expect(res.body.manifest.mcp).toEqual(expect.objectContaining({
      enabled: false,
      operatorPolicy: expect.objectContaining({
        enabled: true,
        disabledFamilies: [],
        disabledToolGroups: [],
        approvalRequiredToolGroups: [],
      }),
    }));
  });

  it("publishes worker room updates with idempotency keys through the callback service", async () => {
    const { issueWorkerAccessTokens } = await import("../../services/workerAuthService");
    const publishWorkerCallback = vi.fn().mockResolvedValue({
      accepted: true,
      replayed: false,
      channel: "room_update",
      publishedArtifactCount: 2,
      roomMessageId: "msg-1",
    });
    const app = await makeApp({
      workerCallbacks: { publishWorkerCallback },
    });

    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
    });

    const res = await request(app)
      .post("/api/worker-jobs/job-1/publish-room-update")
      .set("Authorization", `Bearer ${tokens.executionToken}`)
      .set("Idempotency-Key", "callback-1")
      .send({
        summary: "Presentation deck published",
        publishArtifacts: true,
        links: [{ label: "Deck", url: "/library?itemId=88" }],
      });

    expect(res.status).toBe(200);
    expect(publishWorkerCallback).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      jobId: "job-1",
      channel: "room_update",
      idempotencyKey: "callback-1",
      payload: {
        summary: "Presentation deck published",
        publishArtifacts: true,
        links: [{ label: "Deck", url: "/library?itemId=88" }],
        metadataJson: {},
      },
    });
  });
});
