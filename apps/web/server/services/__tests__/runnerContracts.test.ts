import { describe, expect, it } from "vitest";

import {
  acceptRunnerEvent,
  assertOfferClaim,
  buildWorkOffer,
  isWorkspacePathAllowed,
  validateRunnerProtocolEnvelope,
  validateRunnerCapabilitySnapshot,
  validateRunnerIdentity,
  type RunnerCapabilitySnapshot,
  type RunnerIdentity,
} from "../runnerContracts";

const runner: RunnerIdentity = {
  runnerId: "runner-1",
  tenantId: "tenant-1",
  deviceId: "device-1",
  runtime: "desktop",
  trustState: "trusted",
  registeredAt: "2026-09-17T00:00:00Z",
};
const snapshot: RunnerCapabilitySnapshot = {
  runnerId: "runner-1",
  revision: "r1",
  observedAt: "2026-09-17T00:00:00Z",
  expiresAt: "2026-09-17T00:10:00Z",
  capabilities: ["code.edit"],
  workspaceIds: ["workspace-1"],
  resourceClass: "medium",
};

describe("Feature 197 Runner contracts", () => {
  it("offers only trusted, fresh, same-tenant capability snapshots", () => {
    const offer = buildWorkOffer({
      jobId: "job-1",
      tenantId: "tenant-1",
      requiredCapabilities: ["code.edit"],
      runner,
      snapshot,
      now: new Date("2026-09-17T00:01:00Z"),
    });
    expect(offer).toMatchObject({
      jobId: "job-1",
      runnerId: "runner-1",
      capabilitySnapshotRevision: "r1",
    });
    expect(
      buildWorkOffer({
        jobId: "job-1",
        tenantId: "tenant-2",
        requiredCapabilities: ["code.edit"],
        runner,
        snapshot,
      })
    ).toBeNull();
  });

  it("separates offer claims from the canonical lease fence", () => {
    const offer = buildWorkOffer({
      jobId: "job-2",
      tenantId: "tenant-1",
      requiredCapabilities: ["code.edit"],
      runner,
      snapshot,
      now: new Date("2026-09-17T00:01:00Z"),
    })!;
    expect(() =>
      assertOfferClaim({
        offer,
        tenantId: "tenant-1",
        runnerId: "runner-1",
        snapshotRevision: "stale",
        lease: {
          jobId: "job-2",
          attemptId: "a1",
          leaseToken: "token",
          fencingVersion: 1,
          expiresAt: offer.expiresAt,
        },
      })
    ).toThrowError(expect.objectContaining({ code: "RUNNER_OFFER_STALE" }));
  });

  it("deduplicates control events and confines workspace paths", () => {
    expect(
      acceptRunnerEvent(3, {
        eventId: "e",
        commandId: "c",
        jobId: "j",
        sequence: 3,
        observed: "applied",
      })
    ).toBe("duplicate");
    expect(
      acceptRunnerEvent(3, {
        eventId: "e",
        commandId: "c",
        jobId: "j",
        sequence: 5,
        observed: "applied",
      })
    ).toBe("out_of_order");
    expect(
      acceptRunnerEvent(3, {
        eventId: "e",
        commandId: "c",
        jobId: "j",
        sequence: 4,
        observed: "applied",
      })
    ).toBe("accepted");
    expect(
      isWorkspacePathAllowed(
        "/workspace/project",
        "/workspace/project/src/index.ts"
      )
    ).toBe(true);
    expect(
      isWorkspacePathAllowed(
        "/workspace/project",
        "/workspace/project/../secrets.env"
      )
    ).toBe(false);
  });

  it("rejects malformed runtime identity, snapshots, and paths safely", () => {
    expect(() =>
      validateRunnerIdentity({ runnerId: 123 } as unknown as RunnerIdentity)
    ).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(() =>
      validateRunnerCapabilitySnapshot({
        ...snapshot,
        capabilities: ["code.edit", "code.edit"],
      })
    ).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(
      buildWorkOffer({
        jobId: "job-1",
        tenantId: "tenant-1",
        requiredCapabilities: 123 as unknown as string[],
        runner,
        snapshot,
      })
    ).toBeNull();
    expect(
      isWorkspacePathAllowed("/workspace/project", 123 as unknown as string)
    ).toBe(false);
  });

  it("normalizes a redacted tool and derived capability inventory in one snapshot", () => {
    const normalized = validateRunnerCapabilitySnapshot({
      ...snapshot,
      toolInventory: [
        {
          toolId: "codex-cli",
          kind: "agent_cli",
          displayName: "Codex CLI",
          version: "1.2.3",
          adapterId: "codex-cli",
          adapterVersion: "sah-adapter-v1",
          discoverySource: "path",
          installState: "installed",
          configurationState: "configured",
          authState: "authenticated",
          healthState: "healthy",
          availabilityState: "available",
          trustState: "ready",
          fingerprint: "sha256:tool-fingerprint",
          observedAt: "2026-09-17T00:00:00Z",
          expiresAt: "2026-09-17T00:10:00Z",
          reasonCodes: [],
        },
      ],
      capabilityInventory: [
        {
          capabilityId: "code.edit",
          contractVersion: "sah-cap-v1",
          implementationId: "codex-cli",
          controlProfile: "agent_process",
          resourceProfile: "medium",
          maxConcurrency: 1,
          availabilityState: "available",
          policyDecision: "allowed",
          confidence: 1,
          observedAt: "2026-09-17T00:00:00Z",
          expiresAt: "2026-09-17T00:10:00Z",
          reasonCodes: [],
        },
      ],
    });

    expect(normalized.toolInventory?.[0]).toMatchObject({
      toolId: "codex-cli",
      trustState: "ready",
      availabilityState: "available",
    });
    expect(normalized.capabilityInventory?.[0]).toMatchObject({
      capabilityId: "code.edit",
      policyDecision: "allowed",
    });
  });

  it("preserves a redacted platform target for Task Control projection", () => {
    const normalized = validateRunnerCapabilitySnapshot({
      ...snapshot,
      platform: {
        os: "macos",
        architecture: "aarch64",
        target: "aarch64-apple-darwin",
      },
    });
    expect(normalized.platform).toEqual({
      os: "macos",
      architecture: "aarch64",
      target: "aarch64-apple-darwin",
    });
  });

  it("normalizes computer-use capability provenance and rejects unverified readiness", () => {
    const computerUse = {
      browser: {
        availabilityState: "available" as const,
        authState: "authenticated" as const,
        probeState: "ready" as const,
        reasonCodes: [],
        manifest: {
          runnerId: "runner-1",
          runtimeVersion: "0.1.0",
          adapterVersion: "browser.v1",
          browserEngine: "chromium",
          browserVersion: "120.0.0",
          authorizationEvidenceRef: "runner-auth:sha256:test",
          probeEvidenceRef: "browser-probe:sha256:test",
          supports: {
            structuredObservation: true,
            semanticClick: true,
            semanticType: true,
            screenshot: true,
            visualFallback: true,
            cancellation: true,
            evidence: true,
          },
          authState: "authenticated" as const,
          probeState: "ready" as const,
          observedAt: "2026-09-17T00:00:00Z",
          expiresAt: "2026-09-17T00:10:00Z",
        },
      },
      desktop: {
        availabilityState: "unavailable" as const,
        authState: "unavailable" as const,
        probeState: "unavailable" as const,
        reasonCodes: ["desktop_adapter_not_configured"],
      },
    };
    const normalized = validateRunnerCapabilitySnapshot({
      ...snapshot,
      computerUse,
    });
    expect(normalized.computerUse?.browser).toMatchObject({
      availabilityState: "available",
      manifest: { runnerId: "runner-1", browserEngine: "chromium" },
    });
    expect(() =>
      validateRunnerCapabilitySnapshot({
        ...snapshot,
        computerUse: {
          ...computerUse,
          browser: { ...computerUse.browser, manifest: undefined },
        },
      })
    ).toThrowError(expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" }));
  });

  it("rejects duplicate inventory IDs and unsafe readiness claims", () => {
    const tool = {
      toolId: "codex-cli",
      kind: "agent_cli" as const,
      displayName: "Codex CLI",
      version: null,
      adapterId: null,
      adapterVersion: null,
      discoverySource: "path",
      installState: "installed" as const,
      configurationState: "unknown" as const,
      authState: "unknown" as const,
      healthState: "unknown" as const,
      availabilityState: "unavailable" as const,
      trustState: "discovered" as const,
      fingerprint: "sha256:unknown",
      observedAt: "2026-09-17T00:00:00Z",
      expiresAt: "2026-09-17T00:10:00Z",
      reasonCodes: ["adapter_missing"],
    };
    expect(() =>
      validateRunnerCapabilitySnapshot({
        ...snapshot,
        toolInventory: [tool, tool],
      })
    ).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );

    expect(() =>
      validateRunnerCapabilitySnapshot({
        ...snapshot,
        toolInventory: [
          {
            ...tool,
            availabilityState: "available",
            trustState: "ready",
            adapterId: null,
          },
        ],
      })
    ).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
  });

  it("validates local and shared protocol profiles without leaking secrets", () => {
    expect(
      validateRunnerProtocolEnvelope({
        protocolVersion: "sah-runner-v1",
        profile: "local_device",
        nodeKind: "local_device",
        runnerId: "runner-1",
        nodeId: "device-1",
        jobId: null,
        attemptId: null,
        leaseId: null,
        fencingVersion: null,
        correlationId: "corr-1",
        sequence: 0,
        idempotencyKey: "event-1",
        ackState: null,
        payload: { state: "ready" },
      })
    ).toMatchObject({ profile: "local_device", sequence: 0 });
    expect(() =>
      validateRunnerProtocolEnvelope({
        protocolVersion: "sah-runner-v1",
        profile: "shared_container",
        nodeKind: "managed_container",
        runnerId: "runner-1",
        nodeId: "node-1",
        jobId: null,
        attemptId: null,
        leaseId: null,
        fencingVersion: 1,
        correlationId: "corr-1",
        sequence: 1,
        idempotencyKey: "event-2",
        payload: { state: "ready" },
      })
    ).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(() =>
      validateRunnerProtocolEnvelope({
        protocolVersion: "sah-runner-v1",
        profile: "local_device",
        nodeKind: "local_device",
        runnerId: "runner-1",
        nodeId: "device-1",
        jobId: null,
        attemptId: null,
        leaseId: null,
        fencingVersion: null,
        correlationId: "corr-1",
        sequence: 1,
        idempotencyKey: "event-3",
        payload: { accessToken: "must-not-cross" },
      })
    ).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
  });

  it("accepts bounded semantic observation receipts at the canonical wire depth", () => {
    expect(() =>
      validateRunnerProtocolEnvelope({
        protocolVersion: "sah-runner-v1",
        profile: "local_device",
        nodeKind: "local_device",
        runnerId: "runner-1",
        nodeId: "device-1",
        jobId: "job-1",
        attemptId: "attempt-1",
        leaseId: "lease-1",
        fencingVersion: 1,
        correlationId: "corr-1",
        sequence: 1,
        idempotencyKey: "receipt-1",
        payload: {
          receipt: {
            payload: {
              observation: {
                elements: [{ supportedActionFamilies: ["click"] }],
              },
            },
          },
        },
      })
    ).not.toThrow();
  });

  it("rejects runner payloads beyond the bounded depth budget", () => {
    let payload: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 9; index += 1) {
      payload = { child: payload };
    }

    expect(() =>
      validateRunnerProtocolEnvelope({
        protocolVersion: "sah-runner-v1",
        profile: "local_device",
        nodeKind: "local_device",
        runnerId: "runner-1",
        nodeId: "device-1",
        jobId: null,
        attemptId: null,
        leaseId: null,
        fencingVersion: null,
        correlationId: "corr-1",
        sequence: 1,
        idempotencyKey: "payload-depth-1",
        payload,
      })
    ).toThrowError(expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" }));
  });
});
