import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import request from "supertest";

process.env.JWT_SECRET ??= "worker-runtime-route-test-secret-0123456789";

const { mockGetTenantFeatureFlags, mockIsJtiRevoked, mockRevokeJti } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
  mockIsJtiRevoked: vi.fn(),
  mockRevokeJti: vi.fn(),
}));

const { mockAuthorizeRequest, mockGetUserById, mockGetDb } = vi.hoisted(() => ({
  mockAuthorizeRequest: vi.fn(),
  mockGetUserById: vi.fn(),
  mockGetDb: vi.fn(),
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../_core/revocation", () => ({
  isJtiRevoked: mockIsJtiRevoked,
  revokeJti: mockRevokeJti,
}));

vi.mock("../../_core/authz", async () => {
  const actual = await vi.importActual<typeof import("../../_core/authz")>("../../_core/authz");
  return {
    ...actual,
    authorizeRequest: mockAuthorizeRequest,
  };
});

vi.mock("../../db", async () => {
  const actual = await vi.importActual<typeof import("../../db")>("../../db");
  return {
    ...actual,
    getUserById: mockGetUserById,
    getDb: mockGetDb,
  };
});

describe("workerRuntime routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });
    mockIsJtiRevoked.mockResolvedValue(false);
    mockRevokeJti.mockResolvedValue(undefined);
    mockAuthorizeRequest.mockResolvedValue({ ok: false, error: "Unauthorized" });
    mockGetUserById.mockResolvedValue(undefined);
    mockGetDb.mockReset();
  });

  async function makeApp(overrides: Partial<{
    runtimePacks: Record<string, any>;
    workerCallbacks: Record<string, any>;
    workerDelegation: Record<string, any>;
    workerRegistry: Record<string, any>;
    workerPolicy: Record<string, any>;
    tenantContext: { tenantId: string; tenant?: { id: string } };
  }> = {}) {
    const { registerWorkerRuntimeRoutes } = await import("../workerRuntime");

    const app = express();
    app.use(express.json());
    if (overrides.tenantContext) {
      app.use((req, _res, next) => {
        (req as any).tenantId = overrides.tenantContext?.tenantId;
        (req as any).tenant = overrides.tenantContext?.tenant ?? { id: overrides.tenantContext?.tenantId };
        next();
      });
    }
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
      runtimePacks: overrides.runtimePacks,
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

  function workerConnectStartPayload() {
    return {
      payload: {
        compatibility: {
          protocolVersion: "2026-04-06",
          runtimeVersion: "0.1.3",
          runtimeFamilySchemaVersion: "2026-04-08",
          runtimeProfileSchemaVersion: "2026-04-08",
        },
        runtimeType: "desktop_zeroclaw_managed",
        workerMode: "per_user",
        runtimeMode: "native_constrained",
        displayName: "My render worker",
        externalReference: "worker-app://desktop-1",
        machineId: "desktop-1",
        machineName: "DESKTOP-1",
        dashboardUrl: "https://smartaihub.app/render-jobs",
        maxConcurrentJobs: 1,
        capabilitiesJson: {},
        healthSummaryJson: {},
        hardwareJson: {},
        deviceBinding: {
          deviceId: "wdev_desktop_1",
          machineFingerprint: "machine_desktop_1",
          publicKey: "-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----",
        },
        runtimeMetadataJson: {
          desktopVersion: "0.1.3",
          runtimeProfile: "native_constrained",
          workspaceRootsSummary: [],
          gpuSnapshot: {},
          toolchainSummary: {},
          doctorSummary: {},
          serviceMode: "foreground",
          executionIdentity: {
            mode: "user_bound",
            approvalMode: "owner_approved",
            budgetAttributionMode: "owner_budget",
            tokenRotationTriggers: ["manual_reissue"],
          },
        },
        fileScopeMode: "workspace_scoped",
      },
    };
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

  it("rejects marketplace extension tokens on worker routes", async () => {
    const { signBearerToken } = await import("../../_core/tokens");
    const app = await makeApp();

    const token = signBearerToken({
      sub: "extension-connection-1",
      type: "marketplace_extension",
      aud: "marketplace-capture-extension",
      tokenUse: "marketplace_extension",
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      scopes: ["workers:heartbeat", "marketplace:capture"],
      jti: "marketplace-extension-worker-route",
    } as any, "15m");

    const res = await request(app)
      .post("/api/workers/worker-1/heartbeat")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compatibility: { protocolVersion: "2026-04-06", runtimeVersion: "1.2.3" },
        runtimeType: "openclaw_gateway",
        status: "online",
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

  it("rejects a device-bound worker token replayed from another machine", async () => {
    const {
      issueWorkerAccessTokens,
      signWorkerDeviceProofForTest,
      resetWorkerDeviceBindingStateForTest,
    } = await import("../../services/workerAuthService");
    resetWorkerDeviceBindingStateForTest();
    const app = await makeApp();

    const originalKey = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const otherKey = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const originalPublicKey = await crypto.subtle.exportKey("spki", originalKey.publicKey);
    const otherPublicKey = await crypto.subtle.exportKey("spki", otherKey.publicKey);
    const originalPublicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(originalPublicKey).toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
    const otherPublicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(otherPublicKey).toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
      deviceBinding: {
        deviceId: "worker-app-install-1",
        machineFingerprint: "machine-a",
        publicKey: originalPublicKeyPem,
      },
    });
    const proof = await signWorkerDeviceProofForTest({
      token: tokens.executionToken,
      method: "POST",
      path: "/api/workers/worker-1/heartbeat",
      nonce: "route-replay-1",
      privateKey: otherKey.privateKey,
      publicKey: otherPublicKeyPem,
    });

    const res = await request(app)
      .post("/api/workers/worker-1/heartbeat")
      .set("Authorization", `Bearer ${tokens.executionToken}`)
      .set("X-Worker-Device-Id", proof.deviceId)
      .set("X-Worker-Device-Public-Key", proof.publicKey.replace(/\n/g, "\\n"))
      .set("X-Worker-Device-Nonce", proof.nonce)
      .set("X-Worker-Device-Timestamp", proof.timestamp)
      .set("X-Worker-Device-Signature", proof.signature)
      .send({
        compatibility: { protocolVersion: "2026-04-06", runtimeVersion: "1.2.3" },
        runtimeType: "openclaw_gateway",
        status: "online",
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("worker_device_mismatch");
  });

  it("registers desktop workers when the desktop runtime rollout is enabled", async () => {
    const { createWorkerRegistrationToken } = await import("../../services/workerAuthService");
    const registerWorker = vi.fn().mockResolvedValue({
      created: true,
      worker: {
        id: "desktop-worker-1",
        tenantId: "tenant-1",
        runtimeType: "desktop_zeroclaw_managed",
        status: "online",
      },
      tokens: {
        executionToken: "execution-token",
        uploadToken: "upload-token",
        refreshToken: "refresh-token",
      },
    });
    const app = await makeApp({
      workerRegistry: { registerWorker },
    });

    const token = createWorkerRegistrationToken({
      tenantId: "tenant-1",
      runtimeType: "desktop_zeroclaw_managed",
      teamId: "team-video",
      registeredByUserId: 7,
    });

    const res = await request(app)
      .post("/api/workers/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compatibility: { protocolVersion: "2026-04-06", runtimeVersion: "2.0.0" },
        runtimeType: "desktop_zeroclaw_managed",
        workerMode: "shared_department",
        runtimeMode: "wsl2_managed",
        teamId: "team-video",
        displayName: "Render Host 01",
        externalReference: "desktop://render-host-01",
        machineId: "machine-01",
        machineName: "render-host-01",
        runtimeMetadataJson: {
          desktopVersion: "0.77.0",
          runtimeProfile: "wsl2_managed",
          workspaceRootsSummary: [{ root: "C:\\Media", accessMode: "workspace_scoped" }],
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
      });

    expect(res.status).toBe(201);
    expect(registerWorker).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        runtimeType: "desktop_zeroclaw_managed",
        runtimeMetadataJson: expect.objectContaining({
          desktopVersion: "0.77.0",
        }),
      }),
    }));
  });

  it("fails closed for desktop worker registration when the runtime family flag is disabled", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: false,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });

    const { createWorkerRegistrationToken } = await import("../../services/workerAuthService");
    const app = await makeApp();

    const token = createWorkerRegistrationToken({
      tenantId: "tenant-disabled",
      runtimeType: "desktop_zeroclaw_managed",
    });

    const res = await request(app)
      .post("/api/workers/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compatibility: { protocolVersion: "2026-04-06", runtimeVersion: "2.0.0" },
        runtimeType: "desktop_zeroclaw_managed",
        workerMode: "shared_department",
        runtimeMode: "native_constrained",
        displayName: "Desktop Runtime",
        externalReference: "desktop://machine-01",
        machineId: "machine-01",
        machineName: "machine-01",
        runtimeMetadataJson: {
          desktopVersion: "0.77.0",
          runtimeProfile: "native_constrained",
          workspaceRootsSummary: [],
          gpuSnapshot: {},
          toolchainSummary: {},
          doctorSummary: {},
          serviceMode: "managed_startup",
          executionIdentity: {
            mode: "service_identity",
            approvalMode: "team_approved",
            budgetAttributionMode: "team_budget",
            tokenRotationTriggers: ["manual_reissue"],
          },
        },
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("feature_disabled");
  });

  it("fails closed when the worker feature flag is disabled", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: false,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });

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
        metadataJson: {
          connectorFamilies: [],
          publishedArtifacts: [],
        },
      },
    });
  });

  it("rejects malformed typed callback metadata at the route boundary", async () => {
    const { issueWorkerAccessTokens } = await import("../../services/workerAuthService");
    const publishWorkerCallback = vi.fn();
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
      .set("Idempotency-Key", "callback-invalid")
      .send({
        summary: "Browser progress update",
        metadataJson: {
          lane: "browser",
          sessionId: "lbs_demo_123",
          publishedArtifacts: ["invalid-shape"],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
    expect(publishWorkerCallback).not.toHaveBeenCalled();
  });

  it("approves worker connect sessions by falling back to the user's database tenant", async () => {
    const registerWorker = vi.fn().mockResolvedValue({
      created: true,
      worker: {
        id: "desktop-worker-1",
        displayName: "My render worker",
        runtimeType: "desktop_zeroclaw_managed",
        machineName: "DESKTOP-1",
      },
      tokens: {
        executionToken: "execution-token",
        uploadToken: "upload-token",
      },
    });
    const app = await makeApp({
      workerRegistry: { registerWorker },
    });

    const startRes = await request(app)
      .post("/api/workers/connect/start")
      .send(workerConnectStartPayload());

    expect(startRes.status).toBe(201);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      userId: 7,
      user: { id: 7, role: "admin", currentTenantId: null },
      sub: "7",
      scopes: ["llm:chat"],
    });
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: "tenant-1" }],
          }),
        }),
      }),
    });

    const approveRes = await request(app)
      .post("/api/workers/connect/approve")
      .send({ user_code: startRes.body.userCode, tenantId: "tenant-1" });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.session.status).toBe("approved");
    expect(registerWorker).toHaveBeenCalledWith(expect.objectContaining({
      auth: expect.objectContaining({
        tenantId: "tenant-1",
      }),
      payload: expect.objectContaining({
        deviceBinding: {
          deviceId: "wdev_desktop_1",
          machineFingerprint: "machine_desktop_1",
          publicKey: "-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----",
        },
      }),
    }));
  });

  it("approves worker connect sessions from the URL-resolved request tenant", async () => {
    const registerWorker = vi.fn().mockResolvedValue({
      created: true,
      worker: {
        id: "desktop-worker-1",
        displayName: "My render worker",
        runtimeType: "desktop_zeroclaw_managed",
        machineName: "DESKTOP-1",
      },
      tokens: {
        executionToken: "execution-token",
        uploadToken: "upload-token",
      },
    });
    const app = await makeApp({
      tenantContext: { tenantId: "tenant-from-url" },
      workerRegistry: { registerWorker },
    });

    const startRes = await request(app)
      .post("/api/workers/connect/start")
      .send(workerConnectStartPayload());

    expect(startRes.status).toBe(201);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      userId: 7,
      user: { id: 7, role: "user", currentTenantId: null },
      sub: "7",
      scopes: ["llm:chat"],
    });

    const approveRes = await request(app)
      .post("/api/workers/connect/approve")
      .send({ user_code: startRes.body.userCode });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.session.status).toBe("approved");
    expect(registerWorker).toHaveBeenCalledWith(expect.objectContaining({
      auth: expect.objectContaining({
        tenantId: "tenant-from-url",
      }),
    }));
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it("reports runtime pack as not published until an official pack exists", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-empty-"));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("runtime_pack_not_published");
    expect(res.body.error.message).toContain("Official HyperFrames runtime pack has not been published yet");
  });

  it("serves allowed runtime pack manifest with archive hash and download url", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-ready-"));
    const fileName = "smart-ai-hub-worker-runtime-hyperframes-windows-x64-2026.06.23.1.zip";
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, "runtime-zip-fixture");
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify({
      runtimeId: "hyperframes-windows-x64",
      version: "2026.06.23.1",
      hyperframesVersion: "1.0.0",
      browserVersion: "chromium-1",
      ffmpegVersion: "7.1",
      ffprobeVersion: "7.1",
      thaiFontFamily: "Noto Sans Thai",
      sidecarPath: "hyperframes-render.exe",
      sidecarSha256: "abc",
      checksumFile: "SHA256SUMS",
      signatureFile: "SHA256SUMS.sig",
      licenseNotices: ["THIRD_PARTY_NOTICES.txt"],
      supportedContractVersions: ["2026-06-22"],
      runtimeProfileHash: "profile-hash",
      allowed: true,
      denyReason: null,
      rollbackToVersion: null,
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      runtimeId: "hyperframes-windows-x64",
      version: "2026.06.23.1",
      archiveFileName: fileName,
      archiveSizeBytes: Buffer.byteLength("runtime-zip-fixture"),
      archiveUrl: `/api/workers/runtime-pack/download/${fileName}`,
      allowed: true,
    });
    expect(res.body.archiveSha256).toMatch(/^[a-f0-9]{64}$/);

    const downloadRes = await request(app).get(`/api/workers/runtime-pack/download/${fileName}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers["content-type"]).toContain("application/zip");
    expect(downloadRes.text).toBe("runtime-zip-fixture");
  });
});
