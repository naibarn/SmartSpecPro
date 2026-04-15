import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { FEATURE_FLAG_DEFAULTS } from "../../shared/featureFlags";
import {
  createDesktopHostRouter,
  registerDesktopHostRoutes,
} from "./desktopHost";

describe("desktopHost routes", () => {
  it("returns a policy snapshot", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api/desktop-host",
      createDesktopHostRouter({
        resolvePolicy: async ({ tenantId, deviceId }) => ({
          tenantId,
          deviceId,
          policyVersion: "policy-v1",
          fetchedAt: "2026-04-08T10:00:00.000Z",
          expiresAt: "2026-04-08T11:00:00.000Z",
          trustFreshnessTtlSeconds: 3600,
        }),
        resolvePackageEnvelope: async () => null,
        resolveRevocationFeed: async () => ({
          generatedAt: "2026-04-08T10:00:00.000Z",
          revokedPackageIds: [],
          revokedSignerIds: [],
        }),
        resolveTrustedSigners: async () => [
          {
            signerId: "org-signer-1",
            keyVersion: "2026-04",
            status: "trusted",
          },
        ],
      }),
    );

    const response = await request(app).get(
      "/api/desktop-host/policy/tenant-1/device-1",
    );

    expect(response.status).toBe(200);
    expect(response.body.tenantId).toBe("tenant-1");
    expect(response.body.deviceId).toBe("device-1");
    expect(response.body.featureFlags.desktopHostEnabled).toBe(false);
  });

  it("returns package metadata when available", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api/desktop-host",
      createDesktopHostRouter({
        resolvePolicy: async () => ({
          tenantId: "tenant-1",
          deviceId: "device-1",
          policyVersion: "policy-v1",
          fetchedAt: "2026-04-08T10:00:00.000Z",
          expiresAt: "2026-04-08T11:00:00.000Z",
          trustFreshnessTtlSeconds: 3600,
        }),
        resolvePackageEnvelope: async () => ({
          manifest: {
            packageId: "storyboard-writer",
            version: "1.0.0",
            packageType: "skill_package",
            runtimeDestination: "pi",
            trustClass: "org_verified",
            capabilityManifestDigest: "a".repeat(64),
            payloadDigest: "b".repeat(64),
            compatibilityRange: {
              minDesktopHostProtocolVersion: "2026-04-08",
              maxDesktopHostProtocolVersion: null,
              supportedRuntimeDestinations: ["pi"],
            },
            payload: {
              entryKind: "skill_bundle",
              relativeBundlePath: "skills/storyboard-writer",
              manifestPath: "skills/storyboard-writer/SKILL.md",
            },
          },
          signer: {
            signerId: "org-signer-1",
            keyVersion: "2026-04",
          },
          signature: "c".repeat(64),
          signedAt: "2026-04-08T10:00:00.000Z",
        }),
        resolveRevocationFeed: async () => ({
          generatedAt: "2026-04-08T10:00:00.000Z",
          revokedPackageIds: [],
          revokedSignerIds: [],
        }),
        resolveTrustedSigners: async () => [
          {
            signerId: "org-signer-1",
            keyVersion: "2026-04",
            status: "trusted",
          },
        ],
      }),
    );

    const response = await request(app).get(
      "/api/desktop-host/packages/tenant-1/storyboard-writer",
    );

    expect(response.status).toBe(200);
    expect(response.body.manifest.packageId).toBe("storyboard-writer");
  });

  it("returns revocation feed snapshots", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api/desktop-host",
      createDesktopHostRouter({
        resolvePolicy: async () => ({
          tenantId: "tenant-1",
          deviceId: "device-1",
          policyVersion: "policy-v1",
          fetchedAt: "2026-04-08T10:00:00.000Z",
          expiresAt: "2026-04-08T11:00:00.000Z",
          trustFreshnessTtlSeconds: 3600,
        }),
        resolvePackageEnvelope: async () => null,
        resolveRevocationFeed: async () => ({
          generatedAt: "2026-04-08T10:00:00.000Z",
          revokedPackageIds: ["storyboard-writer"],
          revokedSignerIds: [],
        }),
      }),
    );

    const response = await request(app).get(
      "/api/desktop-host/revocations/tenant-1",
    );

    expect(response.status).toBe(200);
    expect(response.body.revokedPackageIds).toEqual(["storyboard-writer"]);
  });

  it("builds local root policy, workspace profiles, and offboarding plans", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api/desktop-host",
      createDesktopHostRouter({
        resolvePolicy: async () => ({
          tenantId: "tenant-1",
          deviceId: "device-1",
          policyVersion: "policy-v1",
          fetchedAt: "2026-04-08T10:00:00.000Z",
          expiresAt: "2026-04-08T11:00:00.000Z",
          trustFreshnessTtlSeconds: 3600,
        }),
        resolvePackageEnvelope: async () => null,
        resolveRevocationFeed: async () => ({
          generatedAt: "2026-04-08T10:00:00.000Z",
          revokedPackageIds: [],
          revokedSignerIds: [],
        }),
        resolveTrustedSigners: async () => [
          {
            signerId: "org-signer-1",
            keyVersion: "2026-04",
            status: "trusted",
          },
        ],
      }),
    );

    const rootPolicyResponse = await request(app)
      .post("/api/desktop-host/local-files/root-policy")
      .send({
        rootId: "quotes",
        name: "Quotes",
        absolutePath: "/Users/demo/Documents/Quotes",
      });
    const workspaceProfileResponse = await request(app)
      .post("/api/desktop-host/workspace-profile")
      .send({
        profileName: "pi_sidecar_managed",
        projectWorkspacePath: "/workspace/project",
        localRoots: [rootPolicyResponse.body],
      });
    const offboardingResponse = await request(app)
      .post("/api/desktop-host/offboarding-plan")
      .send({
        deviceId: "device-1",
        packageCachePaths: ["/cache/packages"],
        localRoots: [rootPolicyResponse.body],
      });
    const rolloutResponse = await request(app)
      .post("/api/desktop-host/rollout/evaluate")
      .send({
        phase: "enterprise_managed_default",
        gates: [
          {
            gate: "device_binding_ready",
            satisfied: true,
            reason: "proof_of_possession_device_binding_live",
          },
          {
            gate: "signed_packages_enforced",
            satisfied: true,
            reason: "signed_package_verification_required",
          },
          {
            gate: "signed_updates_enforced",
            satisfied: false,
            reason: "signed_update_verification_bypassable",
          },
          {
            gate: "managed_file_roots_default",
            satisfied: true,
            reason: "managed_file_roots_are_default",
          },
          {
            gate: "pi_gateway_only",
            satisfied: true,
            reason: "pi_gateway_injection_enforced",
          },
          {
            gate: "agency_gateway_only",
            satisfied: true,
            reason: "agency_gateway_injection_enforced",
          },
          {
            gate: "offboarding_cleanup_ready",
            satisfied: true,
            reason: "offboarding_cleanup_and_purge_live",
          },
        ],
      });
    const updateResponse = await request(app)
      .post("/api/desktop-host/security/update-verify")
      .send({
        descriptor: {
          currentVersion: "1.0.0",
          bundleVersion: "1.1.0",
          signerId: "org-signer-1",
          signatureSha256: "a".repeat(64),
        },
      });

    expect(rootPolicyResponse.status).toBe(200);
    expect(rootPolicyResponse.body.deniedByDefault).toBe(false);
    expect(workspaceProfileResponse.status).toBe(200);
    expect(workspaceProfileResponse.body.networkClass).toBe("gateway_only");
    expect(offboardingResponse.status).toBe(200);
    expect(offboardingResponse.body.purgeDerivedStores).toBe(true);
    expect(rolloutResponse.status).toBe(200);
    expect(rolloutResponse.body.allowed).toBe(false);
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.accepted).toBe(true);
  });

  it("registers authenticated desktop host routes with tenant scoping", async () => {
    const app = express();
    app.use(express.json());
    registerDesktopHostRoutes(app, {
      authenticateRequest: async () => ({
        id: 1,
        currentTenantId: "tenant-1",
        role: "admin",
      }),
      getTenantFeatureFlags: async () => ({
        ...FEATURE_FLAG_DEFAULTS,
        desktopHostEnabled: true,
        desktopPackageSync: true,
        desktopAgencyRuntime: true,
        desktopWorkerProjection: true,
      }),
      getSkillByIdAsync: async () => undefined,
      registerDesktopDevice: async ({ payload }) => ({
        created: true,
        device: {
          id: payload.deviceId,
          tenantId: payload.tenantId,
          workerProjectionEnabled: payload.workerProjectionEnabled,
          projectedWorkerRuntimeType: payload.projectedWorkerRuntimeType,
        },
        workerProjection: {
          requested: payload.workerProjectionEnabled,
          enabled: true,
          runtimeType: payload.projectedWorkerRuntimeType,
          externalReference: payload.deviceId,
          registrationToken: "desktop-worker-registration-token",
          reason: null,
        },
      }),
      recordDesktopDeviceHeartbeat: async ({ deviceId }) => ({
        device: {
          id: deviceId,
          tenantId: "tenant-1",
          healthStatus: "online",
          workerProjectionEnabled: true,
          projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
        },
        workerProjection: {
          requested: true,
          enabled: true,
          runtimeType: "desktop_zeroclaw_managed",
          externalReference: deviceId,
          registrationToken: "desktop-worker-registration-token-refresh",
          reason: null,
        },
      }),
      getDesktopDeviceByIdForTenant: async ({ deviceId }) => ({
        id: deviceId,
        tenantId: "tenant-1",
        userId: 1,
        displayName: "Ops Desktop",
        machineName: "ops-desktop",
        healthStatus: "online",
        workerProjectionEnabled: true,
        projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
        platform: {
          os: "windows",
          osVersion: "11",
          arch: "x64",
          appVersion: "0.1.0",
        },
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
        localRootsJson: [
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
        packageCachePathsJson: ["C:/SmartSpec/packages"],
        packageSyncStateJson: {
          syncStatus: "ready",
          lastSyncAt: "2026-04-09T09:59:00.000Z",
          lastError: null,
          syncedPackageIds: ["storyboard-writer"],
          packageCount: 1,
          lastRevocationCheckAt: "2026-04-09T09:59:30.000Z",
        },
        pendingActionsJson: [],
        currentWorkspaceProfileJson: {
          profileName: "pi_sidecar_managed",
          networkClass: "gateway_only",
          cpuLimit: 4,
          memoryMb: 4096,
          mounts: [],
          outputDirectoryName: "outputs",
          connectorSidecarAllowed: false,
          writebackMode: "managed_output_only",
        },
        lastRunSummaryJson: {
          reportedAt: "2026-04-09T09:58:00.000Z",
          selection: {
            selectedRuntime: "pi",
            reason: "local_file_heavy",
            labels: {
              surface: "desktop",
              runtime: "pi",
              locality: "hybrid",
              workspace: "local_workspace",
              trustClass: "built_in_verified",
            },
            sidecarBoundaryRequired: true,
            transport: {
              preferredTransport: "http",
              mcpFallbackAllowed: true,
            },
          },
        },
        warningFlagsJson: [],
        enrolledAt: new Date("2026-04-09T09:00:00.000Z"),
        lastSeenAt: new Date("2026-04-09T10:00:00.000Z"),
        disabledAt: null,
      }),
      listDesktopDevicesForActor: async () => ({
        generatedAt: "2026-04-09T10:00:00.000Z",
        devices: [
          {
            deviceId: "device-1",
            displayName: "Ops Desktop",
            machineName: "ops-desktop",
            healthStatus: "online",
            platform: {
              os: "windows",
              osVersion: "11",
              arch: "x64",
              appVersion: "0.1.0",
            },
            enrolledAt: "2026-04-09T09:00:00.000Z",
            lastSeenAt: "2026-04-09T10:00:00.000Z",
            workerProjectionEnabled: true,
            projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
            warningFlags: [],
            capabilities: {
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
          },
        ],
      }),
      listTenantDesktopDevicesForActor: async () => ({
        generatedAt: "2026-04-09T10:00:00.000Z",
        devices: [
          {
            deviceId: "device-1",
            displayName: "Ops Desktop",
            machineName: "ops-desktop",
            healthStatus: "online",
            platform: {
              os: "windows",
              osVersion: "11",
              arch: "x64",
              appVersion: "0.1.0",
            },
            enrolledAt: "2026-04-09T09:00:00.000Z",
            lastSeenAt: "2026-04-09T10:00:00.000Z",
            workerProjectionEnabled: true,
            projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
            warningFlags: [],
            capabilities: {
              deviceIdentity: {
                keyAlgorithm: "ed25519",
                keyVersion: 2,
                publicKeyDigestSha256: "a".repeat(64),
                attestationMode: "software_pkcs8",
                secretStorage: "file_store",
                proofKind: "ed25519_signature",
              },
            },
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
              lastSyncAt: "2026-04-09T09:59:00.000Z",
              lastError: null,
              syncedPackageIds: ["storyboard-writer"],
              packageCount: 1,
              lastRevocationCheckAt: "2026-04-09T09:59:30.000Z",
            },
            pendingActions: [],
            currentWorkspaceProfile: {
              profileName: "pi_sidecar_managed",
              networkClass: "gateway_only",
              cpuLimit: 4,
              memoryMb: 4096,
              mounts: [],
              outputDirectoryName: "outputs",
              connectorSidecarAllowed: false,
              writebackMode: "managed_output_only",
            },
            lastRunSummary: {
              reportedAt: "2026-04-09T09:58:00.000Z",
              selection: {
                selectedRuntime: "pi",
                reason: "local_file_heavy",
                labels: {
                  surface: "desktop",
                  runtime: "pi",
                  locality: "hybrid",
                  workspace: "local_workspace",
                  trustClass: "built_in_verified",
                },
                sidecarBoundaryRequired: true,
                transport: {
                  preferredTransport: "http",
                  mcpFallbackAllowed: true,
                },
              },
            },
            policyVersion: "desktop-host-policy-2026-04-08",
            policyExpiresAt: "2026-04-09T11:00:00.000Z",
          },
        ],
      }),
      updateDesktopDevicePolicyOverrides: async ({ deviceId, overrides }) => ({
        deviceId,
        displayName: "Ops Desktop",
        machineName: "ops-desktop",
        healthStatus: "online",
        accessState: "active",
        platform: {
          os: "windows",
          osVersion: "11",
          arch: "x64",
          appVersion: "0.1.0",
        },
        enrolledAt: "2026-04-09T09:00:00.000Z",
        lastSeenAt: "2026-04-09T10:00:00.000Z",
        workerProjectionEnabled: true,
        projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
        warningFlags: [],
        capabilities: {},
        owner: {
          userId: "1",
          name: "Ops Admin",
          email: "ops@example.com",
        },
        presence: {
          status: "online",
          staleAfterSeconds: 300,
          lastSeenAgeSeconds: 30,
          reportedAt: "2026-04-09T10:00:00.000Z",
        },
        localRoots: [],
        packageCachePaths: [],
        packageSyncState: {
          syncStatus: "ready",
          lastSyncAt: null,
          lastError: null,
          syncedPackageIds: [],
          packageCount: 0,
          lastRevocationCheckAt: null,
        },
        pendingActions: [],
        currentWorkspaceProfile: null,
        lastRunSummary: null,
        policyVersion: "desktop-host-policy-2026-04-08",
        policyExpiresAt: "2026-04-09T11:00:00.000Z",
        policyOverrides: {
          allowAdvancedLocalMode: overrides.allowAdvancedLocalMode ?? null,
          allowPackageSync: overrides.allowPackageSync ?? null,
          allowAgencyRuntime: overrides.allowAgencyRuntime ?? null,
          allowWorkerProjection: overrides.allowWorkerProjection ?? null,
          maxLocalRoots: overrides.maxLocalRoots ?? null,
          outputWritebackMode: overrides.outputWritebackMode ?? null,
        },
      }),
      queueDesktopDeviceAction: async ({ deviceId, actionType }) => ({
        device: {
          deviceId,
          displayName: "Ops Desktop",
          machineName: "ops-desktop",
          healthStatus: actionType === "quarantine_device" ? "unhealthy" : "online",
          accessState: actionType === "quarantine_device" ? "quarantined" : "active",
          platform: {
            os: "windows",
            osVersion: "11",
            arch: "x64",
            appVersion: "0.1.0",
          },
          enrolledAt: "2026-04-09T09:00:00.000Z",
          lastSeenAt: "2026-04-09T10:00:00.000Z",
          workerProjectionEnabled: true,
          projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
          warningFlags: actionType === "quarantine_device" ? ["device_quarantined"] : [],
          capabilities: {},
          owner: {
            userId: "1",
            name: "Ops Admin",
            email: "ops@example.com",
          },
          presence: {
            status: "online",
            staleAfterSeconds: 300,
            lastSeenAgeSeconds: 30,
            reportedAt: "2026-04-09T10:00:00.000Z",
          },
          localRoots: [],
          packageCachePaths: [],
          packageSyncState: {
            syncStatus: "ready",
            lastSyncAt: null,
            lastError: null,
            syncedPackageIds: [],
            packageCount: 0,
            lastRevocationCheckAt: null,
          },
          pendingActions: [],
          currentWorkspaceProfile: null,
          lastRunSummary: null,
          policyVersion: "desktop-host-policy-2026-04-08",
          policyExpiresAt: "2026-04-09T11:00:00.000Z",
          policyOverrides: {},
        },
        action: {
          actionId: "device-action-1",
          actionType,
          status: "queued",
          rootId: null,
          requestedAt: "2026-04-09T10:00:00.000Z",
          note: null,
        },
      }),
      queueDesktopRootAction: async ({ deviceId, rootId, actionType }) => ({
        device: {
          deviceId,
          displayName: "Ops Desktop",
          machineName: "ops-desktop",
          healthStatus: "online",
          platform: {
            os: "windows",
            osVersion: "11",
            arch: "x64",
            appVersion: "0.1.0",
          },
          enrolledAt: "2026-04-09T09:00:00.000Z",
          lastSeenAt: "2026-04-09T10:00:00.000Z",
          workerProjectionEnabled: true,
          projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
          warningFlags: [],
          capabilities: {},
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
            lastSyncAt: "2026-04-09T09:59:00.000Z",
            lastError: null,
            syncedPackageIds: ["storyboard-writer"],
            packageCount: 1,
            lastRevocationCheckAt: "2026-04-09T09:59:30.000Z",
          },
          pendingActions: [
            {
              actionId: "action-1",
              actionType,
              status: "queued",
              rootId,
              requestedAt: "2026-04-09T10:00:00.000Z",
              note: null,
            },
          ],
          currentWorkspaceProfile: null,
          lastRunSummary: null,
          policyVersion: null,
          policyExpiresAt: null,
        },
        action: {
          actionId: "action-1",
          actionType,
          status: "queued",
          rootId,
          requestedAt: "2026-04-09T10:00:00.000Z",
          note: null,
        },
      }),
      getAvailableSkillsAsync: async () => [
        {
          id: "storyboard-writer",
          name: "Storyboard Writer",
          description: "Create visual storyboards from briefs.",
          icon: "sparkles",
          type: "chat-assistant",
          triggers: [],
          requiresExplicit: false,
          creditMultiplier: 1,
          enabledByDefault: true,
          priority: 50,
          skillFilePath: "/repo/apps/web/skills/storyboard-writer/SKILL.md",
          version: "2.4.0",
        } as any,
      ],
      now: () => new Date("2026-04-09T10:00:00.000Z"),
    });

    const okResponse = await request(app).get(
      "/api/desktop-host/policy/tenant-1/device-1",
    );
    const registerResponse = await request(app)
      .post("/api/desktop-host/devices/register")
      .send({
        compatibility: {
          protocolVersion: "2026-04-08",
          runtimeVersion: "0.1.0",
        },
        tenantId: "tenant-1",
        userId: 1,
        deviceId: "device-1",
        displayName: "Ops Desktop",
        machineName: "ops-desktop",
        platform: {
          os: "windows",
          osVersion: "11",
          arch: "x64",
          appVersion: "0.1.0",
        },
        workerProjectionEnabled: true,
        projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
        capabilitiesJson: {},
        healthSummaryJson: {},
        warningFlagsJson: [],
      });
    const heartbeatResponse = await request(app)
      .post("/api/desktop-host/devices/device-1/heartbeat")
      .send({
        compatibility: {
          protocolVersion: "2026-04-08",
          runtimeVersion: "0.1.1",
        },
        capabilitiesJson: {},
        healthSummaryJson: {
          status: "online",
        },
        warningFlagsJson: [],
        policyCursor: "policy-v2",
      });
    const devicesResponse = await request(app).get(
      "/api/desktop-host/devices",
    );
    const tenantDevicesResponse = await request(app).get(
      "/api/desktop-host/devices?scope=tenant",
    );
    const deviceStateResponse = await request(app).get(
      "/api/desktop-host/devices/device-1/state",
    );
    const policyOverrideResponse = await request(app)
      .post("/api/desktop-host/devices/device-1/policy-overrides")
      .send({
        overrides: {
          allowAdvancedLocalMode: false,
          maxLocalRoots: 2,
          outputWritebackMode: "managed_output_only",
        },
      });
    const deviceActionResponse = await request(app)
      .post("/api/desktop-host/devices/device-1/actions")
      .send({
        actionType: "quarantine_device",
      });
    const rootActionResponse = await request(app)
      .post("/api/desktop-host/devices/device-1/roots/quotes/actions")
      .send({
        actionType: "reindex_root",
      });
    const catalogResponse = await request(app).get(
      "/api/desktop-host/packages/catalog",
    );
    const mismatchResponse = await request(app).get(
      "/api/desktop-host/policy/tenant-2/device-1",
    );

    expect(okResponse.status).toBe(200);
    expect(okResponse.body.featureFlags.desktopHostEnabled).toBe(true);
    expect(okResponse.body.rolloutGates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gate: "device_binding_ready",
          satisfied: true,
        }),
      ]),
    );
    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.device.id).toBe("device-1");
    expect(registerResponse.body.workerProjection.registrationToken).toBe(
      "desktop-worker-registration-token",
    );
    expect(registerResponse.body.policySnapshot.workerProjectionRuntimeType).toBe(
      "desktop_zeroclaw_managed",
    );
    expect(heartbeatResponse.status).toBe(200);
    expect(heartbeatResponse.body.device.id).toBe("device-1");
    expect(heartbeatResponse.body.workerProjection.registrationToken).toBe(
      "desktop-worker-registration-token-refresh",
    );
    expect(devicesResponse.status).toBe(200);
    expect(devicesResponse.body.devices[0]?.capabilities.deviceIdentity.keyAlgorithm).toBe(
      "ed25519",
    );
    expect(devicesResponse.body.devices[0]?.capabilities.localFileService.isolationMode).toBe(
      "python_subprocess_bounded",
    );
    expect(tenantDevicesResponse.status).toBe(200);
    expect(tenantDevicesResponse.body.devices[0]?.packageSyncState.syncStatus).toBe("ready");
    expect(deviceStateResponse.status).toBe(200);
    expect(deviceStateResponse.body.policySnapshot.localRoots[0]?.absolutePath).toBe(
      "C:/Users/demo/Documents/Quotes",
    );
    expect(policyOverrideResponse.status).toBe(200);
    expect(policyOverrideResponse.body.device.policyOverrides.allowAdvancedLocalMode).toBe(false);
    expect(deviceActionResponse.status).toBe(200);
    expect(deviceActionResponse.body.action.actionType).toBe("quarantine_device");
    expect(rootActionResponse.status).toBe(200);
    expect(rootActionResponse.body.action.actionType).toBe("reindex_root");
    expect(catalogResponse.status).toBe(200);
    expect(catalogResponse.body.packages[0]?.version).toBe("2.4.0");
    expect(mismatchResponse.status).toBe(403);
    expect(mismatchResponse.body.error).toBe("desktop_host_tenant_mismatch");
  });

  it("creates and verifies asymmetric enrollment proofs through authenticated routes", async () => {
    const app = express();
    app.use(express.json());
    registerDesktopHostRoutes(app, {
      authenticateRequest: async () => ({
        id: "user-1",
        currentTenantId: "tenant-1",
      }),
      getTenantFeatureFlags: async () => ({
        ...FEATURE_FLAG_DEFAULTS,
        desktopHostEnabled: true,
      }),
      now: () => new Date("2026-04-09T10:00:00.000Z"),
    });

    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    const challengeResponse = await request(app)
      .post("/api/desktop-host/security/enrollment/challenge")
      .send({
        deviceId: "device-1",
        devicePublicKeyPem: publicKeyPem,
        purpose: "refresh",
        deviceKeyVersion: 2,
        ttlSeconds: 300,
      });

    expect(challengeResponse.status).toBe(201);

    const signatureBase64 = crypto
      .sign(
        null,
        Buffer.from(
          [
            challengeResponse.body.challengeId,
            challengeResponse.body.tenantId,
            challengeResponse.body.deviceId,
            challengeResponse.body.purpose,
            String(challengeResponse.body.deviceKeyVersion),
            challengeResponse.body.nonce,
            challengeResponse.body.devicePublicKeyDigest,
            String(challengeResponse.body.issuedAtEpochMs),
            String(challengeResponse.body.expiresAtEpochMs),
            challengeResponse.body.challengeSha256,
          ].join(":"),
        ),
        privateKey,
      )
      .toString("base64");

    const verifyResponse = await request(app)
      .post("/api/desktop-host/security/enrollment/verify")
      .send({
        proofKind: "ed25519_signature",
        challenge: challengeResponse.body,
        devicePublicKeyPem: publicKeyPem,
        runtimeScope: "desktop_runtime",
        signatureBase64,
      });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.verified).toBe(true);
    expect(verifyResponse.body.runtimeBinding.bindingSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed for enrollment routes when Desktop Host is disabled", async () => {
    const app = express();
    app.use(express.json());
    registerDesktopHostRoutes(app, {
      authenticateRequest: async () => ({
        id: "user-1",
        currentTenantId: "tenant-1",
      }),
      getTenantFeatureFlags: async () => ({
        ...FEATURE_FLAG_DEFAULTS,
        desktopHostEnabled: false,
      }),
    });

    const response = await request(app)
      .post("/api/desktop-host/security/enrollment/challenge")
      .send({
        deviceId: "device-1",
        devicePublicKeyPem: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----",
        purpose: "bootstrap",
        deviceKeyVersion: 1,
        ttlSeconds: 300,
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("feature_disabled");
  });

  it("disables devices and closes the policy gate after policy refresh", async () => {
    const app = express();
    app.use(express.json());
    registerDesktopHostRoutes(app, {
      authenticateRequest: async () => ({
        id: 7,
        role: "admin",
        currentTenantId: "tenant-1",
      }),
      getTenantFeatureFlags: async () => ({
        ...FEATURE_FLAG_DEFAULTS,
        desktopHostEnabled: true,
        desktopPackageSync: true,
      }),
      disableDesktopDevice: async ({ deviceId }) => ({
        device: {
          deviceId,
          displayName: "Ops Desktop",
          machineName: "ops-desktop",
          healthStatus: "disabled",
          platform: {
            os: "windows",
            osVersion: "11",
            arch: "x64",
            appVersion: "0.1.0",
          },
          enrolledAt: "2026-04-09T09:00:00.000Z",
          lastSeenAt: "2026-04-09T10:00:00.000Z",
          workerProjectionEnabled: true,
          projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
          warningFlags: ["device_disabled"],
          capabilities: {
            deviceIdentity: {
              keyAlgorithm: "ed25519",
              keyVersion: 2,
              publicKeyDigestSha256: "a".repeat(64),
              attestationMode: "software_pkcs8",
              secretStorage: "file_store",
              proofKind: "ed25519_signature",
            },
            localFileService: null,
          },
        },
        disabledAt: "2026-04-09T12:00:00.000Z",
        offboardingPlan: {
          deviceId,
          revokeTokensImmediately: true,
          blockNewRuns: true,
          invalidatePackageCache: true,
          purgeDerivedStores: true,
          cleanupOnNextContact: true,
          packageCachePaths: ["/cache/packages"],
          localRootIds: ["quotes"],
        },
      }),
      getDesktopDeviceByIdForTenant: async ({ deviceId }) => ({
        id: deviceId,
        tenantId: "tenant-1",
        userId: 1,
        displayName: "Ops Desktop",
        machineName: "ops-desktop",
        healthStatus: "disabled",
        workerProjectionEnabled: true,
        projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
        platform: {
          os: "windows",
          osVersion: "11",
          arch: "x64",
          appVersion: "0.1.0",
        },
        capabilitiesJson: {},
        localRootsJson: [
          {
            rootId: "quotes",
            name: "Quotes",
            absolutePath: "/Users/demo/Documents/Quotes",
            writebackMode: "managed_output_only",
            indexingEnabled: true,
            previewEnabled: true,
            vectorIndexEnabled: false,
            deniedByDefault: false,
            denialReason: null,
          },
        ],
        packageCachePathsJson: ["/cache/packages"],
        packageSyncStateJson: {
          syncStatus: "ready",
          lastSyncAt: "2026-04-09T11:55:00.000Z",
          lastError: null,
          syncedPackageIds: ["storyboard-writer"],
          packageCount: 1,
          lastRevocationCheckAt: "2026-04-09T11:56:00.000Z",
        },
        pendingActionsJson: [],
        currentWorkspaceProfileJson: {},
        lastRunSummaryJson: {},
        warningFlagsJson: ["device_disabled"],
        enrolledAt: new Date("2026-04-09T09:00:00.000Z"),
        lastSeenAt: new Date("2026-04-09T12:00:00.000Z"),
        disabledAt: new Date("2026-04-09T12:00:00.000Z"),
      }),
      now: () => new Date("2026-04-09T12:05:00.000Z"),
    });

    const disableResponse = await request(app)
      .post("/api/desktop-host/devices/device-1/disable")
      .send({
        reason: "device_compromised",
        cleanupOnNextContact: true,
        packageCachePaths: ["/cache/packages"],
        localRoots: [
          {
            rootId: "quotes",
            name: "Quotes",
            absolutePath: "/Users/demo/Documents/Quotes",
            writebackMode: "managed_output_only",
            indexingEnabled: true,
            previewEnabled: true,
            vectorIndexEnabled: false,
            deniedByDefault: false,
            denialReason: null,
          },
        ],
      });
    const policyResponse = await request(app).get(
      "/api/desktop-host/policy/tenant-1/device-1",
    );

    expect(disableResponse.status).toBe(200);
    expect(disableResponse.body.device.healthStatus).toBe("disabled");
    expect(disableResponse.body.offboardingPlan.localRootIds).toEqual(["quotes"]);
    expect(policyResponse.status).toBe(200);
    expect(policyResponse.body.rolloutGates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gate: "device_binding_ready",
          satisfied: false,
        }),
      ]),
    );
  });
});
