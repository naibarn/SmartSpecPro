import { describe, expect, it, vi } from "vitest";

import {
  defaultHermesSchedulerRepo,
  queueHermesMediaJob,
  type HermesSchedulerRepository,
  type QueueHermesMediaJobDeps,
  type QueueHermesMediaJobInput,
} from "../hermesMediaScheduler";
import type { HermesAdmissionResult } from "../hermesMediaAdmission";
import type { HermesWorkerSettings } from "../hermesWorkerSettings";
import type { HermesProviderConnection, Worker } from "../../../drizzle/schema";
import {
  HERMES_MEDIA_CAPABILITY_FAMILIES,
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
} from "../../../shared/workerRuntime";
import { FEATURE_FLAG_DEFAULTS, type TenantFeatureFlags } from "../../../shared/featureFlags";

const TENANT_ID = "tenant-1";
const USER_ID = 1;
const OTHER_USER_ID = 2;
const NOW = new Date("2026-06-01T12:00:00.000Z");

const DEFAULT_SETTINGS: HermesWorkerSettings = {
  enabled: true,
  sharedPoolEnabled: true,
  serverPersonalEnabled: true,
  privateEnabled: true,
  videoEnabled: true,
  sharedPoolFeeCredits: 0,
  maxRunningPerConnection: 1,
  maxConcurrentPerSharedWorker: 2,
  maxQueuedPerUser: 8,
  maxQueuedPerTenantSharedPool: 20,
  submitWindowPerUser: 10,
  submitWindowPerTenant: 60,
  minHermesVersion: "",
  sharedWorkerId: "shared-worker-1",
  webProcessWorkerEnabled: false,
};

function buildFlags(overrides: Partial<TenantFeatureFlags> = {}): TenantFeatureFlags {
  return { ...FEATURE_FLAG_DEFAULTS, hermesMediaWorker: true, ...overrides };
}

function buildConnection(overrides: Partial<HermesProviderConnection> = {}): HermesProviderConnection {
  return {
    id: "conn-1",
    tenantId: TENANT_ID,
    ownerUserId: USER_ID,
    scope: "server_personal",
    providerType: "xai_grok",
    adapterType: "hermes_cli",
    authenticationType: "oauth_device_code",
    status: "authorized",
    assignedWorkerId: "worker-1",
    profileReference: "conn_conn-1",
    accountLabel: null,
    accountHint: "grok-user",
    entitlementStatus: null,
    capabilitiesJson: null,
    defaultForImage: false,
    defaultForVideo: false,
    dailyJobQuota: null,
    metadataJson: {},
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    authorizedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastProbeAt: null,
    disconnectedAt: null,
    ...overrides,
  } as HermesProviderConnection;
}

function buildWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    id: "worker-1",
    tenantId: TENANT_ID,
    teamId: null,
    runtimeType: "hermes_agent_gateway",
    workerMode: "external_runtime",
    machineId: null,
    machineName: null,
    displayName: "Hermes shared worker",
    status: "online",
    runtimeVersion: "1.0.0",
    runtimeMode: "external_managed",
    runtimeProfileId: null,
    policyProfileId: null,
    externalReference: "hermes://shared-1",
    dashboardUrl: null,
    capabilitiesJson: {},
    hardwareJson: {},
    healthSummaryJson: {},
    warningFlagsJson: [],
    fileScopeMode: "workspace_scoped",
    lastSeenAt: NOW,
    registeredByUserId: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Worker;
}

function buildInput(overrides: Partial<QueueHermesMediaJobInput> = {}): QueueHermesMediaJobInput {
  return {
    contractVersion: 1,
    operation: "image.generate",
    connectionId: "conn-1",
    prompt: "a cat wearing sunglasses",
    settings: { model: "grok-image-1" },
    references: [],
    traceId: "trace-1",
    tenantId: TENANT_ID,
    requestedByUserId: USER_ID,
    ...overrides,
  };
}

function buildRepo(overrides: Partial<HermesSchedulerRepository> = {}): HermesSchedulerRepository {
  return {
    findConnectionById: vi.fn().mockResolvedValue(buildConnection()),
    listEligibleSharedConnections: vi.fn().mockResolvedValue([]),
    countQueuedForConnection: vi.fn().mockResolvedValue(0),
    countRunningForConnection: vi.fn().mockResolvedValue(0),
    isWorkerOnline: vi.fn().mockResolvedValue(true),
    findJobByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findWorkerById: vi.fn().mockResolvedValue(buildWorker()),
    insertJob: vi.fn().mockImplementation(async (values: Record<string, unknown>) => ({ id: "job-1", ...values })),
    // Default fake seam: pass-through (no serialization needed for most
    // tests) — the concurrency describe block below overrides this with a
    // real serializing mutex to exercise code review FIX 1.
    withAdmissionLock: vi.fn().mockImplementation((_keys: string[], fn: () => Promise<unknown>) => fn()),
    ...overrides,
  };
}

const IMAGE_MANIFEST = {
  hermesVersion: "1.0.0",
  probedAt: "2026-01-01T00:00:00.000Z",
  operations: { "image.generate": { enabled: true } },
  models: { image: ["grok-image-1"], video: [] },
};

const VIDEO_MANIFEST = {
  hermesVersion: "1.0.0",
  probedAt: "2026-01-01T00:00:00.000Z",
  operations: { "video.generate": { enabled: true } },
  models: { image: [], video: ["grok-video-1"] },
};

function buildDeps(
  overrides: Partial<{
    repo: Partial<HermesSchedulerRepository>;
    settings: HermesWorkerSettings;
    flags: TenantFeatureFlags;
    admissionResult: HermesAdmissionResult;
    reserveFee: QueueHermesMediaJobDeps["reserveFee"];
  }> = {},
): QueueHermesMediaJobDeps {
  const repo = buildRepo(overrides.repo ?? {});
  const settings = overrides.settings ?? DEFAULT_SETTINGS;
  const flags = overrides.flags ?? buildFlags();
  const admissionResult = overrides.admissionResult ?? ({ ok: true } as HermesAdmissionResult);

  return {
    repo,
    getSettings: vi.fn().mockResolvedValue(settings),
    getFlags: vi.fn().mockResolvedValue(flags),
    admission: vi.fn().mockResolvedValue(admissionResult),
    reserveFee: overrides.reserveFee
      ?? vi.fn().mockResolvedValue({ reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" }),
    now: () => NOW,
  };
}

describe("queueHermesMediaJob — flags fail-closed", () => {
  it("rejects with HERMES_DISABLED and never inserts when the global kill switch is off", async () => {
    const deps = buildDeps({ settings: { ...DEFAULT_SETTINGS, enabled: false } });
    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(/HERMES_DISABLED/);
    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
  });

  it("rejects with HERMES_DISABLED when the tenant flag is off", async () => {
    const deps = buildDeps({ flags: buildFlags({ hermesMediaWorker: false }) });
    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(/HERMES_DISABLED/);
    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
  });

  it("rejects with HERMES_DISABLED when the per-scope flag is off", async () => {
    const deps = buildDeps({ settings: { ...DEFAULT_SETTINGS, serverPersonalEnabled: false } });
    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(/HERMES_DISABLED/);
    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
  });

  it("rejects video operations with HERMES_DISABLED when the video flag is off", async () => {
    const deps = buildDeps({ settings: { ...DEFAULT_SETTINGS, videoEnabled: false } });
    const input = buildInput({ operation: "video.generate", settings: { model: "grok-video-1" } });
    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_DISABLED/);
    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
  });
});

describe("queueHermesMediaJob — connection authorization", () => {
  it.each([
    ["pending", "HERMES_CONNECTION_REQUIRED"],
    ["reauth_required", "HERMES_REAUTH_REQUIRED"],
    ["entitlement_restricted", "HERMES_ENTITLEMENT_RESTRICTED"],
    ["disconnected", "HERMES_CONNECTION_REQUIRED"],
  ] as const)("rejects a %s connection with %s", async (status, code) => {
    const deps = buildDeps({
      repo: { findConnectionById: vi.fn().mockResolvedValue(buildConnection({ status })) },
    });
    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(new RegExp(code));
  });

  it("never resolves another user's server_personal connection (tenant/owner mismatch)", async () => {
    const deps = buildDeps({
      repo: {
        findConnectionById: vi.fn().mockResolvedValue(buildConnection({ ownerUserId: OTHER_USER_ID })),
      },
    });
    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(/HERMES_CONNECTION_REQUIRED/);
  });
});

describe("queueHermesMediaJob — single-pass connection resolution", () => {
  it("propagates a typed admission error for an explicitly configured connection without falling back to the shared pool", async () => {
    const listEligibleSharedConnections = vi.fn().mockResolvedValue([buildConnection({ id: "conn-shared", scope: "server_shared" })]);
    const deps = buildDeps({
      repo: { listEligibleSharedConnections },
      admissionResult: { ok: false, code: "HERMES_CONNECTION_BUSY" },
    });

    await expect(queueHermesMediaJob(buildInput({ connectionId: "conn-1" }), deps)).rejects.toThrow(/HERMES_CONNECTION_BUSY/);
    expect(listEligibleSharedConnections).not.toHaveBeenCalled();
  });
});

describe("queueHermesMediaJob — shared-pool auto-pick", () => {
  it("picks the eligible server_shared connection with the lowest queue depth", async () => {
    const poolA = buildConnection({ id: "conn-pool-a", scope: "server_shared", dailyJobQuota: null, capabilitiesJson: IMAGE_MANIFEST });
    const poolB = buildConnection({ id: "conn-pool-b", scope: "server_shared", dailyJobQuota: null, capabilitiesJson: IMAGE_MANIFEST });
    const countQueuedForConnection = vi.fn().mockImplementation(async ({ connectionId }: { connectionId: string }) =>
      connectionId === "conn-pool-a" ? 3 : 1,
    );
    const deps = buildDeps({
      repo: {
        listEligibleSharedConnections: vi.fn().mockResolvedValue([poolA, poolB]),
        countQueuedForConnection,
        findConnectionById: vi.fn().mockResolvedValue(null), // must not be used
      },
    });

    const input = buildInput({ connectionId: undefined });
    const result = await queueHermesMediaJob(input, deps);
    expect(result.created).toBe(true);
    expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityRequirementsJson: expect.objectContaining({ connectionId: "conn-pool-b" }),
      }),
    );
  });

  it("code review FIX 3: never auto-picks an image-only connection for a video request", async () => {
    const imageOnly = buildConnection({
      id: "conn-image-only",
      scope: "server_shared",
      dailyJobQuota: null,
      capabilitiesJson: IMAGE_MANIFEST,
    });
    const videoCapable = buildConnection({
      id: "conn-video-capable",
      scope: "server_shared",
      dailyJobQuota: null,
      capabilitiesJson: VIDEO_MANIFEST,
    });
    const deps = buildDeps({
      repo: {
        listEligibleSharedConnections: vi.fn().mockResolvedValue([imageOnly, videoCapable]),
        findConnectionById: vi.fn().mockResolvedValue(null), // must not be used
      },
      settings: { ...DEFAULT_SETTINGS, videoEnabled: true },
    });

    const input = buildInput({
      connectionId: undefined,
      operation: "video.generate",
      settings: { model: "grok-video-1" },
    });
    const result = await queueHermesMediaJob(input, deps);
    expect(result.created).toBe(true);
    expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityRequirementsJson: expect.objectContaining({ connectionId: "conn-video-capable" }),
      }),
    );
  });

  it("code review FIX 3: skips a busy (running>0) connection in favor of an idle one, even when the busy one has a shallower queue", async () => {
    const busyConnection = buildConnection({
      id: "conn-busy",
      scope: "server_shared",
      dailyJobQuota: null,
      capabilitiesJson: IMAGE_MANIFEST,
    });
    const idleConnection = buildConnection({
      id: "conn-idle",
      scope: "server_shared",
      dailyJobQuota: null,
      capabilitiesJson: IMAGE_MANIFEST,
    });

    const countRunningForConnection = vi.fn().mockImplementation(async ({ connectionId }: { connectionId: string }) =>
      connectionId === "conn-busy" ? 1 : 0,
    );
    // The busy connection has the SHALLOWER queue — proves running>0 is
    // checked BEFORE ranking by queue depth, not as a tiebreaker after.
    const countQueuedForConnection = vi.fn().mockImplementation(async ({ connectionId }: { connectionId: string }) =>
      connectionId === "conn-busy" ? 0 : 5,
    );

    const deps = buildDeps({
      repo: {
        listEligibleSharedConnections: vi.fn().mockResolvedValue([busyConnection, idleConnection]),
        countRunningForConnection,
        countQueuedForConnection,
        findConnectionById: vi.fn().mockResolvedValue(null), // must not be used
      },
    });

    const input = buildInput({ connectionId: undefined });
    const result = await queueHermesMediaJob(input, deps);
    expect(result.created).toBe(true);
    expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityRequirementsJson: expect.objectContaining({ connectionId: "conn-idle" }),
      }),
    );
  });
});

describe("queueHermesMediaJob — worker online gate", () => {
  it("rejects with HERMES_WORKER_UNAVAILABLE when the assigned worker is offline", async () => {
    const deps = buildDeps({ repo: { isWorkerOnline: vi.fn().mockResolvedValue(false) } });
    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(/HERMES_WORKER_UNAVAILABLE/);
  });
});

describe("queueHermesMediaJob — fee (interview decision 1)", () => {
  it("reserves a fee only for server_shared scope with a configured fee, and writes workerBilling only then", async () => {
    const scopes = ["server_shared", "server_personal", "private_worker"] as const;
    for (const scope of scopes) {
      const reserveFee = vi.fn().mockResolvedValue({ reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" });
      const deps = buildDeps({
        repo: { findConnectionById: vi.fn().mockResolvedValue(buildConnection({ scope })) },
        settings: { ...DEFAULT_SETTINGS, sharedPoolFeeCredits: 5 },
        reserveFee,
      });

      await queueHermesMediaJob(buildInput(), deps);

      if (scope === "server_shared") {
        expect(reserveFee).toHaveBeenCalledTimes(1);
        expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
          expect.objectContaining({
            instructionsJson: expect.objectContaining({ workerBilling: expect.objectContaining({ reservationId: "res-1" }) }),
          }),
        );
      } else {
        expect(reserveFee).not.toHaveBeenCalled();
        const insertJobMock = (deps.repo as HermesSchedulerRepository).insertJob as ReturnType<typeof vi.fn>;
        const callArgs = insertJobMock.mock.calls[0][0] as Record<string, any>;
        expect(callArgs.instructionsJson.workerBilling).toBeUndefined();
      }
    }
  });

  it("reserves nothing for a fee=0 shared-pool submit", async () => {
    const reserveFee = vi.fn();
    const deps = buildDeps({
      repo: { findConnectionById: vi.fn().mockResolvedValue(buildConnection({ scope: "server_shared" })) },
      settings: { ...DEFAULT_SETTINGS, sharedPoolFeeCredits: 0 },
      reserveFee,
    });

    await queueHermesMediaJob(buildInput(), deps);
    expect(reserveFee).not.toHaveBeenCalled();
  });
});

describe("queueHermesMediaJob — insertJob args", () => {
  it("sets runtimeType from the assigned worker's registered type, never derived from the feature", async () => {
    const privateDeps = buildDeps({
      repo: {
        findConnectionById: vi.fn().mockResolvedValue(buildConnection({ scope: "private_worker" })),
        findWorkerById: vi.fn().mockResolvedValue(buildWorker({ runtimeType: "desktop_zeroclaw_managed" })),
      },
    });
    await queueHermesMediaJob(buildInput(), privateDeps);
    expect((privateDeps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeType: "desktop_zeroclaw_managed", workerId: "worker-1" }),
    );

    const sharedDeps = buildDeps({
      repo: {
        findConnectionById: vi.fn().mockResolvedValue(buildConnection({ scope: "server_shared" })),
        findWorkerById: vi.fn().mockResolvedValue(buildWorker({ runtimeType: "hermes_agent_gateway" })),
      },
    });
    await queueHermesMediaJob(buildInput(), sharedDeps);
    expect((sharedDeps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeType: "hermes_agent_gateway", workerId: null }),
    );
  });

  it("sets capabilityRequirementsJson to the exact non-overridable shape", async () => {
    const deps = buildDeps();
    await queueHermesMediaJob(buildInput(), deps);
    expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityRequirementsJson: {
          capabilityFamilies: [...HERMES_MEDIA_CAPABILITY_FAMILIES],
          requiredClaimCapability: HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
          connectionId: "conn-1",
          preferredWorkerId: null,
        },
      }),
    );
  });

  it("uses image resourceProfile/timeout/jobType for image operations and video for video operations", async () => {
    const imageDeps = buildDeps();
    await queueHermesMediaJob(buildInput({ operation: "image.generate" }), imageDeps);
    expect((imageDeps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
        resourceProfile: "network_heavy",
        timeoutSeconds: 600,
      }),
    );

    const videoDeps = buildDeps();
    await queueHermesMediaJob(
      buildInput({ operation: "video.generate", settings: { model: "grok-video-1" } }),
      videoDeps,
    );
    expect((videoDeps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: HERMES_MEDIA_VIDEO_JOB_TYPE,
        resourceProfile: "long_running",
        timeoutSeconds: 1800,
      }),
    );
  });

  it("sets retryPolicyJson, statusReason, and status queued", async () => {
    const deps = buildDeps();
    await queueHermesMediaJob(buildInput(), deps);
    expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        retryPolicyJson: { maxAttempts: 2, backoffSeconds: 30 },
        statusReason: "hermes_media_scheduler",
        status: "queued",
        requestedBySystemComponent: "hermes_media_scheduler",
      }),
    );
  });

  it("stores inputJson as the parsed contract with references containing no URL-shaped fields", async () => {
    const deps = buildDeps();
    const input = buildInput({
      operation: "image.edit",
      references: [
        { assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) },
      ],
    });
    await queueHermesMediaJob(input, deps);
    const insertJobMock = (deps.repo as HermesSchedulerRepository).insertJob as ReturnType<typeof vi.fn>;
    const callArgs = insertJobMock.mock.calls[0][0] as Record<string, any>;
    const serialized = JSON.stringify(callArgs.inputJson);
    expect(/url/i.test(serialized)).toBe(false);
    expect(callArgs.inputJson.references).toEqual([
      { assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) },
    ]);
  });
});

describe("queueHermesMediaJob — contract validation", () => {
  it("rejects a reference count that exceeds the operation's static bounds with HERMES_REFERENCE_LIMIT_EXCEEDED", async () => {
    const deps = buildDeps();
    const input = buildInput({
      operation: "image.generate", // bounds 0..0
      references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) }],
    });
    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_REFERENCE_LIMIT_EXCEEDED/);
    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
  });

  it("rejects non-continuous reference indices with HERMES_REFERENCE_MAPPING_CONFLICT", async () => {
    const deps = buildDeps();
    const input = buildInput({
      operation: "image.edit",
      references: [
        { assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) },
        { assetId: "asset-2", index: 3, role: "subject", label: "Image-2", sha256: "b".repeat(64) },
      ],
    });
    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_REFERENCE_MAPPING_CONFLICT/);
    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
  });

  it("runs contract validation before admission and fee", async () => {
    const admission = vi.fn();
    const reserveFee = vi.fn();
    const deps = buildDeps({ settings: { ...DEFAULT_SETTINGS, sharedPoolFeeCredits: 5 }, reserveFee });
    deps.admission = admission;
    const input = buildInput({
      operation: "image.generate",
      references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) }],
    });
    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_REFERENCE_LIMIT_EXCEEDED/);
    expect(admission).not.toHaveBeenCalled();
    expect(reserveFee).not.toHaveBeenCalled();
  });
});

describe("queueHermesMediaJob — operation-unsupported gate", () => {
  it("rejects HERMES_OPERATION_UNSUPPORTED when the connection's manifest does not advertise the operation, before admission", async () => {
    const admission = vi.fn();
    const connection = buildConnection({
      capabilitiesJson: {
        hermesVersion: "1.0.0",
        probedAt: "2026-01-01T00:00:00.000Z",
        operations: { "video.reference_to_video": { enabled: false, reason: "not advertised by manifest" } },
        models: { image: [], video: ["grok-video-1"] },
      },
    });
    const deps = buildDeps({ repo: { findConnectionById: vi.fn().mockResolvedValue(connection) } });
    deps.admission = admission;

    const input = buildInput({
      operation: "video.reference_to_video",
      settings: { model: "grok-video-1" },
      references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) }],
    });

    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_OPERATION_UNSUPPORTED/);
    expect(admission).not.toHaveBeenCalled();
    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
  });

  it("never silently degrades — the same gate applies to any operation the effective capability disables", async () => {
    const connection = buildConnection({
      capabilitiesJson: {
        hermesVersion: "1.0.0",
        probedAt: "2026-01-01T00:00:00.000Z",
        operations: { "image.edit": { enabled: false } },
        models: { image: ["grok-image-1"], video: [] },
      },
    });
    const deps = buildDeps({ repo: { findConnectionById: vi.fn().mockResolvedValue(connection) } });

    const input = buildInput({
      operation: "image.edit",
      references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) }],
    });

    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_OPERATION_UNSUPPORTED/);
  });
});

describe("queueHermesMediaJob — idempotency (non-terminal only)", () => {
  it("returns the existing job with created: false while the first job is queued, with no second fee reserve", async () => {
    const existingJob = { id: "existing-job", status: "queued", tenantId: TENANT_ID };
    const reserveFee = vi.fn().mockResolvedValue({ reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" });
    const deps = buildDeps({
      repo: { findJobByIdempotencyKey: vi.fn().mockResolvedValue(existingJob) },
      settings: { ...DEFAULT_SETTINGS, sharedPoolFeeCredits: 5 },
      reserveFee,
    });

    const result = await queueHermesMediaJob(buildInput({ connectionId: "conn-1" }), deps);
    expect(result).toEqual({ created: false, taskId: "hermes_existing-job", job: existingJob });
    expect(reserveFee).not.toHaveBeenCalled();
    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
  });

  it("creates a fresh job with an attempt-suffixed key when the prior match is terminal", async () => {
    const terminalJob = { id: "terminal-job", status: "failed", tenantId: TENANT_ID };
    const findJobByIdempotencyKey = vi.fn().mockImplementation(async (_tenantId: string, key: string) =>
      key.endsWith(":a2") ? null : terminalJob,
    );
    const deps = buildDeps({ repo: { findJobByIdempotencyKey } });

    const result = await queueHermesMediaJob(buildInput(), deps);
    expect(result.created).toBe(true);
    const insertJobMock = (deps.repo as HermesSchedulerRepository).insertJob as ReturnType<typeof vi.fn>;
    const callArgs = insertJobMock.mock.calls[0][0] as Record<string, any>;
    expect(callArgs.idempotencyKey.endsWith(":a2")).toBe(true);
  });
});

describe("queueHermesMediaJob — ordering (code review FIX 4)", () => {
  it("checks idempotency BEFORE admission — a duplicate non-terminal submit never consumes admission budget", async () => {
    const existingJob = { id: "existing-job", status: "running", tenantId: TENANT_ID };
    const admission = vi.fn();
    const deps = buildDeps({ repo: { findJobByIdempotencyKey: vi.fn().mockResolvedValue(existingJob) } });
    deps.admission = admission;

    const result = await queueHermesMediaJob(buildInput(), deps);
    expect(result).toEqual({ created: false, taskId: "hermes_existing-job", job: existingJob });
    expect(admission).not.toHaveBeenCalled();
    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
  });
});

describe("queueHermesMediaJob — concurrency (code review FIX 1, BLOCKER)", () => {
  it("serializes concurrent submissions through the withAdmissionLock seam and admits EXACTLY the cap (12 submits, cap 8 -> 8 created)", async () => {
    const CAP = 8;
    const TOTAL = 12;

    // Fake mutex: each call is queued to run only after the previous one
    // settles (success OR failure) — this mirrors what the real Postgres
    // advisory-transaction-lock implementation guarantees in production
    // (mutual exclusion across concurrent callers for the whole check+insert
    // critical section), without needing a real DB in this unit test.
    let chain: Promise<unknown> = Promise.resolve();
    const withAdmissionLock = vi
      .fn()
      .mockImplementation(async (_keys: string[], fn: () => Promise<unknown>) => {
        const run = chain.then(() => fn());
        chain = run.catch(() => undefined);
        return run;
      });

    // Racy counting "admission": reads the current count, awaits (simulating
    // a real async DB round-trip gap between read and write), THEN writes.
    // Without the serializing seam above, 12 concurrent calls would mostly
    // all read count=0 before any of them writes, admitting far more than
    // the cap. Wrapped inside the fake seam, each call's read+await+write
    // fully completes before the next one starts.
    let admittedCount = 0;
    const admission = vi.fn().mockImplementation(async (): Promise<HermesAdmissionResult> => {
      const currentCount = admittedCount;
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (currentCount >= CAP) {
        return { ok: false, code: "HERMES_QUEUE_FULL" };
      }
      admittedCount = currentCount + 1;
      return { ok: true };
    });

    let insertedCount = 0;
    const insertJob = vi.fn().mockImplementation(async (values: Record<string, unknown>) => {
      insertedCount += 1;
      return { id: `job-${insertedCount}`, ...values };
    });

    const deps = buildDeps({ repo: { withAdmissionLock, insertJob } });
    deps.admission = admission;

    const results = await Promise.allSettled(
      Array.from({ length: TOTAL }, () => queueHermesMediaJob(buildInput(), deps)),
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(CAP);
    expect(rejected).toHaveLength(TOTAL - CAP);
    for (const result of rejected) {
      const reason = (result as PromiseRejectedResult).reason;
      expect(String(reason?.message ?? reason)).toMatch(/HERMES_QUEUE_FULL/);
    }
    expect(insertJob).toHaveBeenCalledTimes(CAP);
    expect(withAdmissionLock).toHaveBeenCalledTimes(TOTAL);
  });
});

describe("queueHermesMediaJob — return shape", () => {
  it("returns taskId === 'hermes_' + job.id", async () => {
    const deps = buildDeps({ repo: { insertJob: vi.fn().mockResolvedValue({ id: "job-42" }) } });
    const result = await queueHermesMediaJob(buildInput(), deps);
    expect(result.taskId).toBe("hermes_job-42");
    expect(result.created).toBe(true);
  });
});

describe("defaultHermesSchedulerRepo", () => {
  it("is exported and exposes the documented methods", () => {
    expect(typeof defaultHermesSchedulerRepo.findConnectionById).toBe("function");
    expect(typeof defaultHermesSchedulerRepo.listEligibleSharedConnections).toBe("function");
    expect(typeof defaultHermesSchedulerRepo.countQueuedForConnection).toBe("function");
    expect(typeof defaultHermesSchedulerRepo.countRunningForConnection).toBe("function");
    expect(typeof defaultHermesSchedulerRepo.isWorkerOnline).toBe("function");
    expect(typeof defaultHermesSchedulerRepo.findJobByIdempotencyKey).toBe("function");
    expect(typeof defaultHermesSchedulerRepo.findWorkerById).toBe("function");
    expect(typeof defaultHermesSchedulerRepo.insertJob).toBe("function");
    expect(typeof defaultHermesSchedulerRepo.withAdmissionLock).toBe("function");
  });
});
