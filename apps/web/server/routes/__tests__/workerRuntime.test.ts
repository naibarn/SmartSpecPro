import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import request from "supertest";
import AdmZip from "adm-zip";

process.env.JWT_SECRET ??= "worker-runtime-route-test-secret-0123456789";
process.env.REDIS_URL ??= "redis://localhost:6379";

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

const {
  mockConnectedDeviceRevoked,
  mockUpsertConnectedDevice,
  mockUpdateConnectedDeviceTokenMetadata,
  mockConnectedWorkerEffectiveScopes,
} = vi.hoisted(() => ({
  mockConnectedDeviceRevoked: vi.fn(),
  mockUpsertConnectedDevice: vi.fn(),
  mockUpdateConnectedDeviceTokenMetadata: vi.fn(),
  mockConnectedWorkerEffectiveScopes: vi.fn(),
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

vi.mock("../../services/connectedDeviceService", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/connectedDeviceService")
  >("../../services/connectedDeviceService");
  return {
    ...actual,
    getConnectedWorkerEffectiveScopes: mockConnectedWorkerEffectiveScopes,
    isConnectedDeviceRevoked: mockConnectedDeviceRevoked,
    upsertConnectedDevice: mockUpsertConnectedDevice,
    updateConnectedDeviceTokenMetadata: mockUpdateConnectedDeviceTokenMetadata,
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
    mockConnectedDeviceRevoked.mockResolvedValue(false);
    mockUpsertConnectedDevice.mockResolvedValue(null);
    mockUpdateConnectedDeviceTokenMetadata.mockResolvedValue(true);
    mockConnectedWorkerEffectiveScopes.mockResolvedValue(null);
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

  function writeRuntimeZip(
    filePath: string,
    runtimeId = "hyperframes-wsl2",
    signature = "fixture-signature",
  ) {
    const zip = new AdmZip();
    const common = [
      "runtime-pack/manifest.json",
      "runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js",
      "runtime-pack/hyperframes/node_modules/@hyperframes/producer/package.json",
      "runtime-pack/hyperframes-sidecar/render.mjs",
      "runtime-pack/SHA256SUMS",
      "runtime-pack/SHA256SUMS.sig",
      runtimeId === "hyperframes-windows-x64"
        ? "runtime-pack/whisper/whisper-cli.exe"
        : "runtime-pack/whisper/whisper-cli",
      "runtime-pack/whisper/.cache/hyperframes/whisper/models/ggml-large-v3.bin",
      runtimeId === "hyperframes-macos-arm64" ? "sidecars/hyperframes-render" : "sidecars/hyperframes-render.exe",
    ];
    const platformFiles = runtimeId === "hyperframes-wsl2"
      ? [
          "runtime-pack/node/bin/node",
          "runtime-pack/bin/ffmpeg",
          "runtime-pack/bin/ffprobe",
          "runtime-pack/browser-libs/libnspr4.so",
          "runtime-pack/browser-libs/libnss3.so",
          "runtime-pack/browser-libs/libnssutil3.so",
          "runtime-pack/browser-libs/libsmime3.so",
          "runtime-pack/hyperframes/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node",
          "runtime-pack/hyperframes/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.17.3",
        ]
      : runtimeId === "hyperframes-macos-arm64"
        ? [
            "runtime-pack/node/bin/node",
            "runtime-pack/bin/ffmpeg",
            "runtime-pack/bin/ffprobe",
            "runtime-pack/browser/chrome",
            "runtime-pack/hyperframes/node_modules/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64.node",
            "runtime-pack/hyperframes/node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips-cpp.1.dylib",
            "runtime-pack/remotion-sidecar/render.mjs",
            "runtime-pack/remotion-sidecar/node_modules/@smartspec/remotion-render/dist/index.js",
          ]
      : ["runtime-pack/node/node.exe", "runtime-pack/bin/ffmpeg.exe", "runtime-pack/bin/ffprobe.exe"];
    for (const entry of [...common, ...platformFiles]) {
      zip.addFile(
        entry,
        entry === "runtime-pack/SHA256SUMS.sig"
          ? Buffer.from(signature)
          : Buffer.from(`fixture:${entry}`),
      );
    }
    zip.writeZip(filePath);
  }

  function writeSignedRemotionExecutorZip(filePath: string, runtimeId = "remotion-executor-macos-x64") {
    const zip = new AdmZip();
    const paths = [
      "runtime-pack/remotion-sidecar/render.mjs",
      "runtime-pack/executor/dist/cli.js",
      "runtime-pack/executor/package.json",
      "runtime-pack/node/bin/node",
      "runtime-pack/browser/Chromium.app/Contents/MacOS/Chromium",
      "runtime-pack/bin/ffmpeg",
      "runtime-pack/bin/ffprobe",
      "runtime-pack/fonts/NotoSansThai.ttf",
    ];
    for (const entry of paths) zip.addFile(entry, Buffer.from(`fixture:${entry}`));
    zip.writeZip(filePath);

    const archiveSha256 = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    const keyPair = crypto.generateKeyPairSync("ed25519");
    const archiveSignature = crypto.sign(null, Buffer.from(archiveSha256), keyPair.privateKey).toString("base64");
    const manifest = {
      schemaVersion: "2026-08-16.1",
      runtimeId,
      runtimePackId: runtimeId,
      version: "0.1.0",
      runtimeKind: "standalone_remotion_executor",
      runtimePlatform: "macos",
      platform: "macos",
      architecture: "x64",
      executionEnvironment: "native",
      allowed: true,
      nodePath: "node/bin/node",
      browserPath: "browser/Chromium.app/Contents/MacOS/Chromium",
      ffmpegPath: "bin/ffmpeg",
      ffprobePath: "bin/ffprobe",
      fontsPath: "fonts",
      sidecarPath: "remotion-sidecar/render.mjs",
      signingAlgorithm: "ed25519",
      archiveSha256,
      archiveSizeBytes: fs.statSync(filePath).size,
      archiveSignature,
      archiveEntries: zip.getEntries().map((entry) => entry.entryName),
    };
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify(manifest));
    return keyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  function officialRuntimeManifest(runtimeId = "hyperframes-wsl2") {
    return {
      runtimeId,
      version: "2026.06.25.1",
      hyperframesVersion: "hyperframes@0.7.5; @hyperframes/producer@0.7.5",
      browserVersion: runtimeId === "hyperframes-wsl2" ? "Chrome for Testing linux64" : "Chrome for Testing win64",
      ffmpegVersion: runtimeId === "hyperframes-wsl2" ? "linux ffmpeg static" : "gyan.dev win64",
      ffprobeVersion: runtimeId === "hyperframes-wsl2" ? "linux ffprobe static" : "gyan.dev win64",
      thaiFontFamily: "Noto Sans Thai",
      sidecarPath: runtimeId === "hyperframes-macos-arm64" ? "hyperframes-render" : "hyperframes-render.exe",
      sidecarSha256: "abc",
      checksumFile: "SHA256SUMS",
      signatureFile: "SHA256SUMS.sig",
      transcription: {
        engine: "whisper.cpp",
        version: "1.9.3",
        binaryPath: runtimeId === "hyperframes-windows-x64" ? "whisper/whisper-cli.exe" : "whisper/whisper-cli",
        binarySha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        model: "large-v3",
        modelPath: "whisper/.cache/hyperframes/whisper/models/ggml-large-v3.bin",
        modelSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        modelUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
      },
      licenseNotices: ["THIRD_PARTY_NOTICES.txt"],
      runtimePlatform: runtimeId === "hyperframes-wsl2" ? "wsl2-linux-x64" : runtimeId === "hyperframes-macos-arm64" ? "macos-arm64" : "windows-x64",
      architecture: runtimeId === "hyperframes-macos-arm64" ? "arm64" : "x64",
      rendererKind: "hyperframes_cli_official",
      sidecarLauncher: "smart-ai-hub-hyperframes-node-launcher",
      sidecarScriptPath: "hyperframes-sidecar/render.mjs",
      supportedContractVersions: ["2026-06-22"],
      runtimeProfileHash: "profile-hash",
      allowed: true,
      denyReason: null,
      rollbackToVersion: null,
    };
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
        permissionPreset: "vertical_drama_media_operator",
        permissionScopes: expect.arrayContaining([
          "series:read",
          "series:bind",
          "series:scan",
          "series:media:process",
          "series:media:publish",
        ]),
      }),
      payload: expect.objectContaining({
        deviceBinding: {
          deviceId: "wdev_desktop_1",
          machineFingerprint: "machine_desktop_1",
          publicKey: "-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----",
        },
      }),
    }));

    const tokenRes = await request(app)
      .post("/api/workers/connect/token")
      .send({ device_code: startRes.body.deviceCode });
    expect(tokenRes.status).toBe(200);
    const { verifyBearerToken } = await import("../../_core/tokens");
    const executionClaims = await verifyBearerToken(tokenRes.body.tokens.executionToken);
    expect(executionClaims.scopes).toEqual(expect.arrayContaining([
      "series:read",
      "series:bind",
      "series:scan",
      "series:media:process",
      "series:media:publish",
    ]));
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
    // Connected-device inventory is persisted during approval; tenant
    // resolution itself still comes from the URL-resolved request context.
    expect(mockUpsertConnectedDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-from-url",
        authKind: "worker_executor",
      }),
    );
  });

  it("reports runtime pack as not published until an official pack exists", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-empty-"));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("runtime_pack_not_published");
    expect(res.body.error.message).toContain("Official HyperFrames runtime pack has not been published yet");
  });

  it("does not serve diagnostic smoke runtime packs as render-ready", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-smoke-"));
    const fileName = "smart-ai-hub-worker-runtime-hyperframes-windows-x64-2026.06.24.3.zip";
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, "runtime-zip-fixture");
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify({
      runtimeId: "hyperframes-windows-x64",
      version: "2026.06.24.3",
      hyperframesVersion: "smart-ai-hub-ffmpeg-render-sidecar-2026.06.24",
      browserVersion: "chromium-1",
      ffmpegVersion: "7.1",
      ffprobeVersion: "7.1",
      thaiFontFamily: "Noto Sans Thai",
      sidecarPath: "hyperframes-render.exe",
      sidecarSha256: "sha256",
      checksumFile: "SHA256SUMS",
      signatureFile: "SHA256SUMS.sig",
      licenseNotices: ["THIRD_PARTY_NOTICES.txt"],
      supportedContractVersions: ["2026-06-22"],
      runtimeProfileHash: "profile",
      allowed: true,
      denyReason: null,
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const manifestRes = await request(app).get("/api/workers/runtime-pack/manifest");
    expect(manifestRes.status).toBe(404);
    expect(manifestRes.body.error.message).toContain("Mock, fallback, diagnostic smoke");

    const downloadRes = await request(app).get(`/api/workers/runtime-pack/download/${fileName}`);
    expect(downloadRes.status).toBe(404);
  });

  it("serves allowed runtime pack manifest with archive hash and download url", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-ready-"));
    const fileName = "smart-ai-hub-worker-runtime-hyperframes-wsl2-2026.06.25.1.zip";
    const filePath = path.join(tempDir, fileName);
    writeRuntimeZip(filePath, "hyperframes-wsl2");
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify(officialRuntimeManifest("hyperframes-wsl2")));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      runtimeId: "hyperframes-wsl2",
      version: "2026.06.25.1",
      archiveFileName: fileName,
      archiveSizeBytes: fs.statSync(filePath).size,
      archiveUrl: `/api/workers/runtime-pack/download/${fileName}`,
      allowed: true,
    });
    expect(res.body.archiveSha256).toMatch(/^[a-f0-9]{64}$/);

    const downloadRes = await request(app).get(`/api/workers/runtime-pack/download/${fileName}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers["content-type"]).toContain("application/zip");
    expect(Number(downloadRes.headers["content-length"])).toBe(fs.statSync(filePath).size);
  });

  it("does not admit a runtime pack whose signature is still a release placeholder", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-placeholder-signature-"));
    const fileName = "smart-ai-hub-worker-runtime-hyperframes-wsl2-2026.06.25.3.zip";
    const filePath = path.join(tempDir, fileName);
    writeRuntimeZip(filePath, "hyperframes-wsl2", "placeholder-signature-required-before-release\n");
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify({
      ...officialRuntimeManifest("hyperframes-wsl2"),
      version: "2026.06.25.3",
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("runtime_pack_not_published");
  });

  it("does not admit an otherwise official runtime pack without transcription metadata", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-no-transcription-"));
    const fileName = "smart-ai-hub-worker-runtime-hyperframes-wsl2-2026.06.25.4.zip";
    const filePath = path.join(tempDir, fileName);
    writeRuntimeZip(filePath, "hyperframes-wsl2");
    const manifest = officialRuntimeManifest("hyperframes-wsl2");
    delete (manifest as Record<string, unknown>).transcription;
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify({
      ...manifest,
      version: "2026.06.25.4",
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("runtime_pack_not_published");
  });

  it("does not admit a manifest that claims transcription when the archive omits Whisper", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-missing-whisper-"));
    const fileName = "smart-ai-hub-worker-runtime-hyperframes-wsl2-2026.06.25.5.zip";
    const filePath = path.join(tempDir, fileName);
    writeRuntimeZip(filePath, "hyperframes-wsl2");
    const zip = new AdmZip(filePath);
    zip.deleteFile("runtime-pack/whisper/whisper-cli");
    zip.writeZip(filePath);
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify({
      ...officialRuntimeManifest("hyperframes-wsl2"),
      version: "2026.06.25.5",
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("runtime_pack_not_published");
  });

  it("serves only a structurally complete native macOS arm64 HyperFrames pack", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-macos-ready-"));
    const fileName = "smart-ai-hub-worker-runtime-hyperframes-macos-arm64-2026.08.18.1.zip";
    const filePath = path.join(tempDir, fileName);
    writeRuntimeZip(filePath, "hyperframes-macos-arm64");
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify(officialRuntimeManifest("hyperframes-macos-arm64")));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest?runtimeId=hyperframes-macos-arm64");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      runtimeId: "hyperframes-macos-arm64",
      runtimePlatform: "macos-arm64",
      architecture: "arm64",
      sidecarPath: "hyperframes-render",
      archiveFileName: fileName,
      allowed: true,
    });
  });

  it("serves the hermes runtime manifest and download for a built, allowed pack", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-hermes-"));
    const fileName = "smart-ai-hub-hermes-runtime-hermes-windows-x64-0.1.0.zip";
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, "hermes-pack-zip-fixture");
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify({
      runtimeId: "hermes-windows-x64",
      version: "0.1.0",
      hermesVersion: "0.18.2",
      pythonRelativePath: "python/Scripts/python.exe",
      hermesRelativePath: "python/Scripts/hermes.exe",
      checksumFile: "SHA256SUMS",
      signatureFile: "SHA256SUMS.sig",
      allowed: true,
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest?runtimeId=hermes-windows-x64");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      runtimeId: "hermes-windows-x64",
      version: "0.1.0",
      allowed: true,
      archiveFileName: fileName,
    });
    expect(res.body.archiveSha256).toMatch(/^[a-f0-9]{64}$/);

    const downloadRes = await request(app).get(`/api/workers/runtime-pack/download/${fileName}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers["content-type"]).toContain("application/zip");
  });

  it("registers the macOS hermes id with Apple Silicon guidance when not yet built", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-hermes-macos-"));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest?runtimeId=hermes-macos-arm64");
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.runtimeId).toBe("hermes-macos-arm64");
    expect(res.body.platform).toBe("macos");
    expect(res.body.architecture).toBe("arm64");
    expect(res.body.supportedMacModels).toEqual(expect.arrayContaining([
      "Apple Silicon Mac with M1",
      "Apple Silicon Mac with M2",
      "Apple Silicon Mac with M3",
      "Apple Silicon Mac with M4",
    ]));
    expect(res.body.unsupportedMacArchitectures).toEqual(["x86_64 (Intel)"]);
  });

  it("serves a built Apple Silicon Hermes pack independently from Windows", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-hermes-macos-ready-"));
    const fileName = "smart-ai-hub-hermes-runtime-hermes-macos-arm64-0.1.130.zip";
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, "hermes-macos-arm64-pack-fixture");
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify({
      runtimeId: "hermes-macos-arm64",
      version: "0.1.130",
      hermesVersion: "0.18.2",
      pythonRelativePath: "python/bin/python3",
      hermesRelativePath: "python/bin/hermes",
      checksumFile: "SHA256SUMS",
      signatureFile: "SHA256SUMS.sig",
      allowed: true,
      platform: "macos",
      architecture: "arm64",
      supportedMacModels: ["Apple Silicon Mac with M1"],
      unsupportedMacArchitectures: ["x86_64 (Intel)"],
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest?runtimeId=hermes-macos-arm64");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      runtimeId: "hermes-macos-arm64",
      version: "0.1.130",
      allowed: true,
      platform: "macos",
      architecture: "arm64",
      archiveFileName: fileName,
    });
    expect(res.body.archiveSha256).toMatch(/^[a-f0-9]{64}$/);

    const downloadRes = await request(app).get(`/api/workers/runtime-pack/download/${fileName}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers["content-type"]).toContain("application/zip");
  });

  it("serves a signed standalone Remotion executor pack per macOS architecture", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-remotion-executor-"));
    const fileName = "smart-ai-hub-remotion-executor-remotion-executor-macos-x64-0.1.0.zip";
    const filePath = path.join(tempDir, fileName);
    const publicKey = writeSignedRemotionExecutorZip(filePath);
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir], publicKey } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest?runtimeId=remotion-executor-macos-x64");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      runtimeId: "remotion-executor-macos-x64",
      runtimeKind: "standalone_remotion_executor",
      runtimePlatform: "macos",
      architecture: "x64",
      allowed: true,
      archiveFileName: fileName,
      archiveUrl: `/api/workers/runtime-pack/download/${fileName}`,
    });

    const downloadRes = await request(app).get(`/api/workers/runtime-pack/download/${fileName}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers["content-type"]).toContain("application/zip");
  });

  it("accepts a signed executor pack when the public key uses escaped newlines", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-remotion-executor-escaped-key-"));
    const fileName = "smart-ai-hub-remotion-executor-remotion-executor-macos-x64-0.1.0.zip";
    const filePath = path.join(tempDir, fileName);
    const publicKey = writeSignedRemotionExecutorZip(filePath);
    const app = await makeApp({
      runtimePacks: { releaseDirs: [tempDir], publicKey: publicKey.replaceAll("\n", "\\n") },
    });

    const res = await request(app).get("/api/workers/runtime-pack/manifest?runtimeId=remotion-executor-macos-x64");
    expect(res.status).toBe(200);
    expect(res.body.archiveFileName).toBe(fileName);
  });

  it("does not publish an executor archive without a trusted signature", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-remotion-unsigned-"));
    const fileName = "smart-ai-hub-remotion-executor-remotion-executor-macos-x64-0.1.0.zip";
    const filePath = path.join(tempDir, fileName);
    writeSignedRemotionExecutorZip(filePath);
    const manifestPath = `${filePath}.manifest.json`;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.archiveSignature = "not-trusted";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest?runtimeId=remotion-executor-macos-x64");
    expect(res.status).toBe(404);
  });

  it("rejects a download of an unbuilt/denied hermes pack", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-hermes-denied-"));
    const fileName = "smart-ai-hub-hermes-runtime-hermes-windows-x64-0.0.9.zip";
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, "hermes-pack-zip-fixture");
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify({
      runtimeId: "hermes-windows-x64",
      version: "0.0.9",
      hermesVersion: "0.18.2",
      pythonRelativePath: "python/Scripts/python.exe",
      hermesRelativePath: "python/Scripts/hermes.exe",
      checksumFile: "SHA256SUMS",
      signatureFile: "SHA256SUMS.sig",
      allowed: false,
      denyReason: "rollback",
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const downloadRes = await request(app).get(`/api/workers/runtime-pack/download/${fileName}`);
    expect(downloadRes.status).toBe(409);
  });

  it("surfaces the hermes update-required warning from recordWorkerHeartbeat in the heartbeat response", async () => {
    const { issueWorkerAccessTokens } = await import("../../services/workerAuthService");
    const recordWorkerHeartbeat = vi.fn().mockResolvedValue({
      id: "worker-1",
      status: "online",
      lastSeenAt: new Date("2026-07-17T00:00:00.000Z"),
      warningFlagsJson: ["Hermes runtime version 0.17.0 is below the required minimum 0.18.2."],
    });
    const app = await makeApp({ workerRegistry: { recordWorkerHeartbeat } });

    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
    });

    const res = await request(app)
      .post("/api/workers/worker-1/heartbeat")
      .set("Authorization", `Bearer ${tokens.executionToken}`)
      .send({
        compatibility: { protocolVersion: "2026-04-06", runtimeVersion: "1.2.3" },
        runtimeType: "openclaw_gateway",
        status: "online",
        currentJobCount: 0,
        queueDepth: 0,
      });

    expect(res.status).toBe(200);
    expect(res.body.warningFlagsJson).toEqual([
      "Hermes runtime version 0.17.0 is below the required minimum 0.18.2.",
    ]);
  });

  it("defaults warningFlagsJson to an empty array when the worker record has none", async () => {
    const { issueWorkerAccessTokens } = await import("../../services/workerAuthService");
    const recordWorkerHeartbeat = vi.fn().mockResolvedValue({
      id: "worker-1",
      status: "online",
      lastSeenAt: new Date("2026-07-17T00:00:00.000Z"),
    });
    const app = await makeApp({ workerRegistry: { recordWorkerHeartbeat } });

    const tokens = issueWorkerAccessTokens({
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "openclaw_gateway",
    });

    const res = await request(app)
      .post("/api/workers/worker-1/heartbeat")
      .set("Authorization", `Bearer ${tokens.executionToken}`)
      .send({
        compatibility: { protocolVersion: "2026-04-06", runtimeVersion: "1.2.3" },
        runtimeType: "openclaw_gateway",
        status: "online",
        currentJobCount: 0,
        queueDepth: 0,
      });

    expect(res.status).toBe(200);
    expect(res.body.warningFlagsJson).toEqual([]);
  });

  it("blocks WSL2 runtime packs that miss Linux sharp native dependencies", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-missing-sharp-"));
    const fileName = "smart-ai-hub-worker-runtime-hyperframes-wsl2-2026.06.25.2.zip";
    const filePath = path.join(tempDir, fileName);
    const zip = new AdmZip();
    for (const entry of [
      "runtime-pack/manifest.json",
      "runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js",
      "runtime-pack/hyperframes/node_modules/@hyperframes/producer/package.json",
      "runtime-pack/hyperframes-sidecar/render.mjs",
      "runtime-pack/SHA256SUMS",
      "runtime-pack/SHA256SUMS.sig",
      "sidecars/hyperframes-render.exe",
      "runtime-pack/node/bin/node",
      "runtime-pack/bin/ffmpeg",
      "runtime-pack/bin/ffprobe",
    ]) {
      zip.addFile(entry, Buffer.from(`fixture:${entry}`));
    }
    zip.writeZip(filePath);
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify({
      ...officialRuntimeManifest("hyperframes-wsl2"),
      version: "2026.06.25.2",
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("runtime_pack_not_published");
  });

  it("blocks allowed manifests when the archive misses the runtime-pack sidecar script path", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-bad-path-"));
    const fileName = "smart-ai-hub-worker-runtime-hyperframes-wsl2-2026.06.25.2.zip";
    const filePath = path.join(tempDir, fileName);
    const zip = new AdmZip();
    zip.addFile("runtime-pack/manifest.json", Buffer.from("{}"));
    zip.addFile("hyperframes-sidecar/render.mjs", Buffer.from("wrong root path"));
    zip.addFile("runtime-pack/node/bin/node", Buffer.from("node"));
    zip.addFile("runtime-pack/bin/ffmpeg", Buffer.from("ffmpeg"));
    zip.addFile("runtime-pack/bin/ffprobe", Buffer.from("ffprobe"));
    zip.addFile("runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js", Buffer.from("cli"));
    zip.addFile("runtime-pack/hyperframes/node_modules/@hyperframes/producer/package.json", Buffer.from("{}"));
    zip.addFile("runtime-pack/SHA256SUMS", Buffer.from("sums"));
    zip.addFile("runtime-pack/SHA256SUMS.sig", Buffer.from("sig"));
    zip.addFile("sidecars/hyperframes-render.exe", Buffer.from("launcher"));
    zip.writeZip(filePath);
    fs.writeFileSync(`${filePath}.manifest.json`, JSON.stringify({
      ...officialRuntimeManifest("hyperframes-wsl2"),
      version: "2026.06.25.2",
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("runtime_pack_not_published");
  });

  it("skips a newer malformed archive and serves the latest structurally valid pack", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-runtime-valid-fallback-"));
    const validName = "smart-ai-hub-worker-runtime-hyperframes-windows-x64-2026.06.24.5.zip";
    const invalidName = "smart-ai-hub-worker-runtime-hyperframes-windows-x64-2026.06.24.6.zip";
    const validPath = path.join(tempDir, validName);
    const invalidPath = path.join(tempDir, invalidName);
    writeRuntimeZip(validPath, "hyperframes-windows-x64");
    fs.writeFileSync(`${validPath}.manifest.json`, JSON.stringify({
      ...officialRuntimeManifest("hyperframes-windows-x64"),
      version: "2026.06.24.5",
    }));

    const badZip = new AdmZip();
    badZip.addFile("runtime-pack/manifest.json", Buffer.from("{}"));
    badZip.addFile("hyperframes-sidecar/render.mjs", Buffer.from("wrong root path"));
    badZip.addFile("runtime-pack/node/node.exe", Buffer.from("node"));
    badZip.addFile("runtime-pack/bin/ffmpeg.exe", Buffer.from("ffmpeg"));
    badZip.addFile("runtime-pack/bin/ffprobe.exe", Buffer.from("ffprobe"));
    badZip.addFile("runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js", Buffer.from("cli"));
    badZip.addFile("runtime-pack/hyperframes/node_modules/@hyperframes/producer/package.json", Buffer.from("{}"));
    badZip.addFile("runtime-pack/SHA256SUMS", Buffer.from("sums"));
    badZip.addFile("runtime-pack/SHA256SUMS.sig", Buffer.from("sig"));
    badZip.addFile("sidecars/hyperframes-render.exe", Buffer.from("launcher"));
    badZip.writeZip(invalidPath);
    fs.writeFileSync(`${invalidPath}.manifest.json`, JSON.stringify({
      ...officialRuntimeManifest("hyperframes-windows-x64"),
      version: "2026.06.24.6",
    }));
    const app = await makeApp({ runtimePacks: { releaseDirs: [tempDir] } });

    const res = await request(app).get("/api/workers/runtime-pack/manifest?runtimeId=hyperframes-windows-x64");

    expect(res.status).toBe(200);
    expect(res.body.version).toBe("2026.06.24.5");
    expect(res.body.archiveFileName).toBe(validName);
  });
});
