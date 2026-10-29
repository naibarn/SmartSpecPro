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

  it("preserves only strict sanitized additive workspace facts", () => {
    const normalized = validateRunnerCapabilitySnapshot({
      ...snapshot,
      workspaceIds: ["workspace-1", "workspace-2"],
      workspaces: [
        { workspaceId: "workspace-1", projectId: "smartspecpro", repositoryId: "smartspecpro", displayName: "Primary workspace", gitHead: "a".repeat(40), gitBranch: "feature/spec-224", dirty: false, dirtyPaths: [], contentFingerprint: "b".repeat(64), taskId: "task-42", convergenceState: "USER_WORKSPACE_CONVERGED", convergenceCanonicalSha: "c".repeat(40) },
        { workspaceId: "workspace-2" },
      ],
    });
    expect(normalized.workspaces).toEqual([
      { workspaceId: "workspace-1", projectId: "smartspecpro", repositoryId: "smartspecpro", displayName: "Primary workspace", gitHead: "a".repeat(40), gitBranch: "feature/spec-224", dirty: false, dirtyPaths: [], contentFingerprint: "b".repeat(64), taskId: "task-42", convergenceState: "USER_WORKSPACE_CONVERGED", convergenceCanonicalSha: "c".repeat(40) },
      { workspaceId: "workspace-2", projectId: null, repositoryId: null, displayName: null, gitHead: null, gitBranch: null, dirty: null, dirtyPaths: null, contentFingerprint: null, taskId: null, convergenceState: "NOT_REPORTED", convergenceCanonicalSha: null },
    ]);
    expect(() => validateRunnerCapabilitySnapshot({
      ...snapshot,
      workspaces: [{ workspaceId: "workspace-1", repositoryRef: "repo:must-not-pass" }],
    } as unknown as RunnerCapabilitySnapshot)).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(() => validateRunnerCapabilitySnapshot({
      ...snapshot,
      workspaces: [{ workspaceId: "workspace-1", projectId: "../tenant-escape" }],
    } as unknown as RunnerCapabilitySnapshot)).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(() => validateRunnerCapabilitySnapshot({
      ...snapshot,
      workspaces: [{ workspaceId: "workspace-1", repositoryId: "https://token@github.com/org/repository" }],
    } as unknown as RunnerCapabilitySnapshot)).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(() => validateRunnerCapabilitySnapshot({
      ...snapshot,
      workspaces: [{ workspaceId: "workspace-1", gitHead: "not-a-commit", gitBranch: "../unsafe", dirty: "yes" }],
    } as unknown as RunnerCapabilitySnapshot)).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(() => validateRunnerCapabilitySnapshot({
      ...snapshot,
      workspaces: [{ workspaceId: "workspace-1", convergenceState: "CONVERGED_BY_NAME" }],
    } as unknown as RunnerCapabilitySnapshot)).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(() => validateRunnerCapabilitySnapshot({
      ...snapshot,
      workspaces: [{ workspaceId: "workspace-1", convergenceCanonicalSha: "not-a-commit" }],
    } as unknown as RunnerCapabilitySnapshot)).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(() => validateRunnerCapabilitySnapshot({
      ...snapshot,
      workspaces: [{ workspaceId: "workspace-1", convergenceState: "USER_WORKSPACE_CONVERGED" }],
    } as unknown as RunnerCapabilitySnapshot)).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
  });

  it("projects authorized project and run workspace identities without local paths", () => {
    const normalized = validateRunnerCapabilitySnapshot({
      ...snapshot,
      workspaceIds: ["workspace-project-a"],
      workspaces: [{
        workspaceId: "workspace-project-a",
        projectId: "00000000-0000-4000-8000-000000000001",
        repositoryId: "github.com/acme/project-a",
        rootId: "root-projects-abcdef123456",
        kind: "project",
        displayName: "Project A",
      }],
      runWorkspaces: [{
        workspaceId: "run-0123456789abcdef0123456789abcdef",
        runId: "job-123",
        attemptId: 2,
        sourceWorkspaceId: "workspace-project-a",
        projectId: "00000000-0000-4000-8000-000000000001",
        lifecycle: "ACTIVE",
      }],
    });

    expect(normalized.workspaces?.[0]).toMatchObject({
      workspaceId: "workspace-project-a",
      projectId: "00000000-0000-4000-8000-000000000001",
      rootId: "root-projects-abcdef123456",
      kind: "project",
    });
    expect(normalized.runWorkspaces?.[0]).toMatchObject({
      runId: "job-123",
      attemptId: 2,
      sourceWorkspaceId: "workspace-project-a",
      lifecycle: "ACTIVE",
    });
    expect(JSON.stringify(normalized)).not.toContain("localPath");

    for (const runWorkspace of [
      { workspaceId: "run-1", runId: "job-1", attemptId: 0, sourceWorkspaceId: "workspace-project-a", lifecycle: "ACTIVE" },
      { workspaceId: "run-1", runId: "../outside", attemptId: 1, sourceWorkspaceId: "workspace-project-a", lifecycle: "ACTIVE" },
      { workspaceId: "run-1", runId: "job-1", attemptId: 1, sourceWorkspaceId: "workspace-project-a", projectId: "../../tenant", lifecycle: "ACTIVE" },
      { workspaceId: "run-1", runId: "job-1", attemptId: 1, sourceWorkspaceId: "workspace-project-a", lifecycle: "UNKNOWN" },
    ]) {
      expect(() => validateRunnerCapabilitySnapshot({
        ...snapshot,
        runWorkspaces: [runWorkspace],
      } as unknown as RunnerCapabilitySnapshot)).toThrowError(
        expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
      );
    }
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
          versionProbeState: "passed",
          taskProbeState: "passed",
          taskProbeObservedAtMs: 1_789_603_200_000,
          taskProbeExpiresAtMs: 1_789_603_800_000,
          taskProbeEvidenceRef: "runner-task-probe:sha256:TEST_ONLY_REFERENCE",
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

  it("maps ready Codex wire capability to external-task availability, not authority", () => {
    const rawCodexSnapshot = {
      ...snapshot,
      capabilities: ["tool.execute.codex"],
      toolInventory: [{
        toolId: "codex",
        kind: "agent_cli",
        displayName: "Codex CLI",
        version: "1.2.3",
        adapterId: "codex.v1",
        adapterVersion: "sah-adapter-v1",
        discoverySource: "path",
        installState: "installed",
        configurationState: "configured",
        authState: "authenticated",
        healthState: "healthy",
        availabilityState: "available",
        trustState: "ready",
        fingerprint: "sha256:tool-fingerprint",
        versionProbeState: "passed",
        taskProbeState: "passed",
        taskProbeObservedAtMs: Date.parse("2026-09-17T00:00:00Z"),
        taskProbeExpiresAtMs: Date.parse("2026-09-17T00:30:00Z"),
        taskProbeEvidenceRef: "runner-task-probe:sha256:TEST_ONLY_REFERENCE",
        authorizationEvidenceRef: "TEST_ONLY_REDACTED_REFERENCE",
        modelCatalog: {
          state: "discovered",
          adapterId: "codex.v1",
          adapterVersion: "codex.v1",
          cliVersion: "codex-cli 0.165.0",
          accountProviderFingerprint: "codex-account:sha256:0123456789abcdef",
          accountScopeState: "account_scoped_catalog_unverified",
          source: "codex_app_server_model_list",
          revision: "catalog:sha256:abcdef0123456789",
          verificationState: "unverified_catalog_only",
          observedAt: "2026-09-17T00:00:00Z",
          expiresAt: "2026-09-17T00:10:00Z",
          models: [{
            id: "model-z",
            displayName: "Model Z",
            capabilities: ["text"],
            reasoningEfforts: ["low", "high"],
            defaultReasoningEffort: "high",
            isDefault: true,
          }],
        },
        observedAt: "2026-09-17T00:00:00Z",
        expiresAt: "2026-09-17T00:10:00Z",
        reasonCodes: [],
      }],
    };
    const normalized = validateRunnerCapabilitySnapshot(rawCodexSnapshot);
    expect(normalized.capabilities).toContain("agent.external_task");
    expect(normalized.toolInventory?.[0].modelCatalog).toMatchObject({
      state: "discovered",
      verificationState: "unverified_catalog_only",
      models: [{ id: "model-z", reasoningEfforts: ["low", "high"] }],
    });
    expect(normalized).not.toHaveProperty("grantId");
    const withoutToolCapability = validateRunnerCapabilitySnapshot({ ...rawCodexSnapshot, capabilities: [] });
    expect(withoutToolCapability.capabilities).not.toContain("agent.external_task");
    const untrustedCodex = validateRunnerCapabilitySnapshot({
      ...rawCodexSnapshot,
      toolInventory: [{ ...rawCodexSnapshot.toolInventory[0], trustState: "degraded" }],
    });
    expect(untrustedCodex.capabilities).not.toContain("agent.external_task");
  });

  it("maps a verified Copilot Runner tool to external-task availability", () => {
    const normalized = validateRunnerCapabilitySnapshot({
      ...snapshot,
      capabilities: ["tool.execute.copilot"],
      toolInventory: [{
        toolId: "copilot", kind: "agent_cli", displayName: "Microsoft Copilot", version: "1.0.28",
        adapterId: "microsoft-copilot.v1", adapterVersion: "microsoft-copilot.v1", discoverySource: "runner_probe",
        installState: "installed", configurationState: "configured", authState: "authenticated", healthState: "healthy",
        availabilityState: "available", trustState: "ready", fingerprint: "copilot-fingerprint",
        versionProbeState: "passed", taskProbeState: "passed", taskProbeObservedAtMs: Date.parse("2026-09-17T00:00:00Z"),
        taskProbeExpiresAtMs: Date.parse("2026-09-17T00:30:00Z"), taskProbeEvidenceRef: "copilot-probe:TEST_ONLY",
        authorizationEvidenceRef: "copilot-auth:TEST_ONLY",
        modelCatalog: { state: "discovered", adapterId: "microsoft-copilot.v1", adapterVersion: "microsoft-copilot.v1",
          cliVersion: "Copilot CLI 1.0.28", accountProviderFingerprint: "copilot-account:sha256:test",
          accountScopeState: "runner_user_profile", source: "github_copilot_sdk_models_list", revision: "catalog-copilot",
          verificationState: "account_catalog_unverified_entitlement", observedAt: "2026-09-17T00:00:00Z",
          expiresAt: "2026-09-17T00:10:00Z", models: [{ id: "dynamic-model", displayName: "Dynamic", capabilities: ["text"], reasoningEfforts: [], isDefault: false }] },
        observedAt: "2026-09-17T00:00:00Z", expiresAt: "2026-09-17T00:10:00Z", reasonCodes: [],
      }],
    });
    expect(normalized.capabilities).toContain("agent.external_task");
    expect(normalized.toolInventory?.[0].modelCatalog?.adapterId).toBe("microsoft-copilot.v1");
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
    expect(validateRunnerProtocolEnvelope({
      protocolVersion: "sah-runner-v1",
      profile: "local_device",
      nodeKind: "local_device",
      runnerId: "runner-1",
      nodeId: "runner-1",
      jobId: null,
      attemptId: null,
      leaseId: null,
      fencingVersion: null,
      correlationId: "corr-inventory",
      sequence: 1,
      idempotencyKey: "inventory-1",
      payload: {
        type: "runner.session.inventory",
        runnerSessionId: "runner-session-1",
        records: [{ sessionId: "session-1", processIdentity: { pid: 42 } }],
      },
    }).payload.type).toBe("runner.session.inventory");
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

  it("accepts bounded dirtyPaths snapshots above the generic list limit", () => {
    const envelope = (dirtyPaths: string[]) => ({
      protocolVersion: "sah-runner-v1",
      profile: "local_device",
      nodeKind: "local_device",
      runnerId: "runner-1",
      nodeId: "device-1",
      jobId: null,
      attemptId: null,
      leaseId: null,
      fencingVersion: null,
      correlationId: "corr-dirty-paths",
      sequence: 1,
      idempotencyKey: "dirty-paths-1",
      payload: { type: "runner.capabilities.update", snapshot: { workspaces: [{ dirtyPaths }] } },
    });
    const paths = Array.from({ length: 800 }, (_, index) => `apps/web/${index}-${"x".repeat(160)}`);

    expect(() => validateRunnerProtocolEnvelope(envelope(paths))).not.toThrow();
    expect(() => validateRunnerProtocolEnvelope(envelope([
      ...paths,
      ...Array.from({ length: 800 }, (_, index) => `apps/web/extra-${index}-${"y".repeat(160)}`),
    ]))).toThrowError(expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" }));
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
