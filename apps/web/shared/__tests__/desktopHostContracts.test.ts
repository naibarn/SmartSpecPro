import { describe, expect, it } from "vitest";

import {
  DESKTOP_HOST_PROTOCOL_VERSION,
  DESKTOP_HOST_WORKER_PROJECTION_RUNTIME_TYPE,
  desktopCapabilitySnapshotSchema,
  desktopDeviceDisableRequestSchema,
  desktopHostDeviceStatusResponseSchema,
  desktopDeviceHeartbeatPayloadSchema,
  desktopDeviceIdentitySchema,
  desktopDeviceRegistrationPayloadSchema,
  desktopEnrollmentChallengeRequestSchema,
  desktopEnrollmentVerifyRequestSchema,
  desktopHostPolicySnapshotSchema,
  desktopHostSupersessionMatrix,
  desktopPackageStateValues,
  desktopPackageTrustClassValues,
  resolveDesktopWorkerProjectionRuntimeType,
  runLocalityLabelValues,
  runRuntimeLabelValues,
  runSurfaceLabelValues,
} from "../desktopHost";
import { workerRuntimeTypeValues } from "../workerRuntime";

describe("desktopHost shared contracts", () => {
  it("keeps desktop worker projection aligned with the worker runtime vocabulary", () => {
    expect(workerRuntimeTypeValues).toContain(
      DESKTOP_HOST_WORKER_PROJECTION_RUNTIME_TYPE,
    );
    expect(resolveDesktopWorkerProjectionRuntimeType(true)).toBe(
      DESKTOP_HOST_WORKER_PROJECTION_RUNTIME_TYPE,
    );
    expect(resolveDesktopWorkerProjectionRuntimeType(false)).toBeNull();
  });

  it("defines the desktop package trust and state vocabulary", () => {
    expect(desktopPackageTrustClassValues).toEqual([
      "built_in_verified",
      "org_verified",
      "local_unverified",
      "project_local",
    ]);
    expect(desktopPackageStateValues).toEqual(
      expect.arrayContaining([
        "trusted",
        "restricted",
        "quarantined",
        "blocked",
        "revoked",
        "requires_review",
      ]),
    );
  });

  it("defines the run surface, runtime, and locality labels", () => {
    expect(runSurfaceLabelValues).toEqual(["web", "desktop"]);
    expect(runRuntimeLabelValues).toEqual(
      expect.arrayContaining([
        "platform_skill",
        "pi",
        "agency_swarm",
        "cloud_agent",
        "openclaw_gateway",
      ]),
    );
    expect(runLocalityLabelValues).toEqual([
      "local",
      "hybrid",
      "server",
      "external",
    ]);
  });

  it("parses a desktop device registration payload", () => {
    const parsed = desktopDeviceRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        runtimeVersion: "1.0.0",
      },
      tenantId: "tenant-123",
      userId: "user-456",
      deviceId: "device-789",
      displayName: "Design MacBook Pro",
      machineName: "design-mbp",
      platform: {
        os: "macos",
        osVersion: "14.5",
        arch: "arm64",
        appVersion: "0.1.0",
      },
      workerProjectionEnabled: true,
      projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
      capabilitiesJson: {
        piRuntime: true,
        agencySwarmRuntime: false,
      },
      healthSummaryJson: {},
      warningFlagsJson: [],
    });

    expect(parsed.compatibility.protocolVersion).toBe(
      DESKTOP_HOST_PROTOCOL_VERSION,
    );
    expect(parsed.projectedWorkerRuntimeType).toBe(
      "desktop_zeroclaw_managed",
    );
  });

  it("parses desktop device heartbeat payloads with compatibility and policy cursor", () => {
    const parsed = desktopDeviceHeartbeatPayloadSchema.parse({
      compatibility: {
        protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        runtimeVersion: "0.1.1",
      },
      capabilitiesJson: {
        videoAssembly: true,
      },
      healthSummaryJson: {
        status: "online",
      },
      warningFlagsJson: [],
      policyCursor: "policy-v2",
    });

    expect(parsed.compatibility.runtimeVersion).toBe("0.1.1");
    expect(parsed.policyCursor).toBe("policy-v2");
  });

  it("parses enrollment challenge and verification payloads", () => {
    const challengeRequest = desktopEnrollmentChallengeRequestSchema.parse({
      deviceId: "device-1",
      devicePublicKeyPem: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----",
      purpose: "bootstrap",
      deviceKeyVersion: 1,
      ttlSeconds: 300,
    });
    const verifyRequest = desktopEnrollmentVerifyRequestSchema.parse({
      proofKind: "ed25519_signature",
      challenge: {
        challengeId: "challenge-1",
        tenantId: "tenant-1",
        deviceId: "device-1",
        purpose: "bootstrap",
        deviceKeyVersion: 1,
        nonce: "nonce-1",
        devicePublicKeyDigest: "a".repeat(64),
        issuedAt: "2026-04-08T10:00:00.000Z",
        issuedAtEpochMs: 1_800_000_000_000,
        expiresAt: "2026-04-08T10:05:00.000Z",
        expiresAtEpochMs: 1_800_000_300_000,
        challengeSha256: "b".repeat(64),
      },
      devicePublicKeyPem: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----",
      runtimeScope: "desktop_runtime",
      signatureBase64: "c2lnbg==",
    });

    expect(challengeRequest.ttlSeconds).toBe(300);
    expect(verifyRequest.proofKind).toBe("ed25519_signature");
  });

  it("parses device identity metadata", () => {
    const parsed = desktopDeviceIdentitySchema.parse({
      deviceId: "device-1",
      keyAlgorithm: "ed25519",
      keyVersion: 2,
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----",
      publicKeyDigestSha256: "a".repeat(64),
      secretId: "desktop-device-1-signing-key-v2",
      attestationMode: "software_pkcs8",
      secretStorage: "file_store",
      createdAt: "2026-04-09T10:00:00.000Z",
      rotatedAt: null,
    });

    expect(parsed.keyAlgorithm).toBe("ed25519");
    expect(parsed.attestationMode).toBe("software_pkcs8");
    expect(parsed.storageProtection).toBe("best_effort");
    expect(parsed.storageProvider).toBe("filesystem");
    expect(parsed.osAttested).toBe(false);
    expect(parsed.hardwareBacked).toBe(false);
    expect(parsed.attestationProvider).toBe("derived_runtime");
    expect(parsed.attestationEvidenceSha256).toBeNull();
    expect(parsed.attestationClaims).toEqual([]);
  });

  it("parses desktop device posture and parser capability summaries", () => {
    const parsed = desktopHostDeviceStatusResponseSchema.parse({
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
            deviceAttestationSupport: {
              providerHint: "tenant_broker",
              evidenceSource: "env_json",
              defaultMode: "hardware_attested",
              supportedModes: ["software_pkcs8", "hardware_attested"],
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
              macroInspectionSupported: true,
              embeddedMediaInspectionSupported: true,
              layoutAnalysisMode: "basic_structural",
              fullRenderingSupported: false,
              activeContentExecutionAllowed: false,
            },
          },
        },
      ],
    });

    expect(parsed.devices[0]?.capabilities.deviceIdentity?.proofKind).toBe(
      "ed25519_signature",
    );
    expect(parsed.devices[0]?.capabilities.deviceIdentity?.storageProtection).toBe(
      "best_effort",
    );
    expect(parsed.devices[0]?.capabilities.deviceIdentity?.attestationProvider).toBe(
      "derived_runtime",
    );
    expect(parsed.devices[0]?.capabilities.deviceAttestationSupport?.providerHint).toBe(
      "tenant_broker",
    );
    expect(parsed.devices[0]?.capabilities.deviceAttestationSupport?.defaultMode).toBe(
      "hardware_attested",
    );
    expect(parsed.devices[0]?.capabilities.localFileService?.supportedFormats).toContain("pdf");
    expect(parsed.devices[0]?.capabilities.localFileService?.pdfExtractor).toBe(
      "internal_heuristic",
    );
    expect(parsed.devices[0]?.capabilities.localFileService?.renderBackend).toBe("none");
    expect(parsed.devices[0]?.capabilities.localFileService?.complexDocumentSupport).toBe(
      "text_extraction_only",
    );
    expect(parsed.devices[0]?.capabilities.localFileService?.multiPageRenderingSupported).toBe(
      false,
    );
    expect(parsed.devices[0]?.capabilities.localFileService?.macroInspectionSupported).toBe(
      true,
    );
    expect(parsed.devices[0]?.capabilities.localFileService?.layoutAnalysisMode).toBe(
      "basic_structural",
    );
  });

  it("applies defaults for attestation-support and parser capability snapshots", () => {
    const parsed = desktopCapabilitySnapshotSchema.parse({
      deviceAttestationSupport: {},
      localFileService: {},
    });

    expect(parsed.deviceAttestationSupport?.enabled).toBe(true);
    expect(parsed.deviceAttestationSupport?.evidenceSource).toBe("derived_runtime");
    expect(parsed.deviceAttestationSupport?.defaultMode).toBe("software_pkcs8");
    expect(parsed.deviceAttestationSupport?.providerHint).toBe("derived_runtime");
    expect(parsed.localFileService?.macroInspectionSupported).toBe(false);
    expect(parsed.localFileService?.embeddedMediaInspectionSupported).toBe(false);
    expect(parsed.localFileService?.layoutAnalysisMode).toBe("none");
    expect(parsed.localFileService?.ocrLayoutMode).toBe("plain_text");
  });

  it("parses device disable requests with cleanup policy", () => {
    const parsed = desktopDeviceDisableRequestSchema.parse({
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

    expect(parsed.reason).toBe("device_compromised");
    expect(parsed.localRoots[0]?.rootId).toBe("quotes");
  });

  it("rejects malformed policy snapshots", () => {
    expect(() =>
      desktopHostPolicySnapshotSchema.parse({
        policyVersion: "2026-04-08",
        tenantId: "tenant-123",
        deviceId: "device-789",
        fetchedAt: "2026-04-08T10:00:00.000Z",
        expiresAt: "2026-04-08T11:00:00.000Z",
        trustFreshnessTtlSeconds: 3600,
        featureFlags: {
          desktopHostEnabled: "yes",
        },
      }),
    ).toThrow();
  });

  it("marks legacy desktop proxy assumptions as compatibility-only", () => {
    expect(desktopHostSupersessionMatrix["004-desktop-app"].status).toBe(
      "compatibility_only",
    );
    expect(desktopHostSupersessionMatrix["070-local-client-llm-mode"].status).toBe(
      "active_alignment",
    );
  });
});
