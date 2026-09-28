import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adminDisableHermesConnection,
  adminSetHermesQuota,
  buildAuthorizeJobInsert,
  disconnectHermesConnection,
  getHermesAdminOverview,
  getHermesAvailability,
  getHermesConnectStatus,
  getHermesConnection,
  HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS,
  listHermesConnections,
  probeHermesConnection,
  setHermesDefaultConnection,
  settleHermesConnectionFromControlJob,
  startHermesConnect,
  type HermesConnectionDeps,
  type HermesConnectionRepo,
} from "../hermesConnectionService";
import type { HermesProviderConnection, Worker, WorkerJob, WorkerJobEvent } from "../../../drizzle/schema";
import {
  HERMES_CONNECTION_AUTH_JOB_TYPE,
  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
  HERMES_CONNECTION_PROBE_JOB_TYPE,
} from "../../../shared/workerRuntime";
import { auditLogger } from "../auditLogger";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const TENANT_ID = "tenant-1";
const USER_ID = 1;
const OTHER_USER_ID = 2;

function buildConnectionRow(overrides: Partial<HermesProviderConnection> = {}): HermesProviderConnection {
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

function buildWorkerRow(overrides: Partial<Worker> = {}): Worker {
  return {
    id: "worker-1",
    tenantId: TENANT_ID,
    teamId: null,
    runtimeType: "desktop_zeroclaw_managed",
    workerMode: "external_runtime",
    machineId: null,
    machineName: null,
    displayName: "Hermes worker",
    status: "online",
    runtimeVersion: "1.0.0",
    runtimeMode: "external_managed",
    runtimeProfileId: null,
    policyProfileId: null,
    externalReference: "worker-app://hermes-1",
    dashboardUrl: null,
    capabilitiesJson: {
      hermesMedia: {
        advertised: true,
        doctorOk: true,
        hermesVersion: "0.18.2",
      },
    },
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

function buildWorkerJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: "job-1",
    tenantId: TENANT_ID,
    teamId: null,
    workerId: "worker-1",
    runtimeType: "desktop_zeroclaw_managed",
    workflowRunId: null,
    requestedByUserId: USER_ID,
    requestedByPersonaId: null,
    requestedBySystemComponent: null,
    jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
    status: "running",
    statusReason: null,
    priority: 0,
    resourceProfile: "cpu_light",
    capabilityRequirementsJson: {},
    inputJson: {},
    instructionsJson: {},
    outputJson: null,
    failureReason: null,
    timeoutSeconds: HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS,
    retryPolicyJson: {},
    idempotencyKey: null,
    leaseOwnerToken: null,
    leaseExpiresAt: null,
    createdAt: NOW,
    startedAt: NOW,
    finishedAt: null,
    ...overrides,
  } as WorkerJob;
}

function buildJobEvent(overrides: Partial<WorkerJobEvent> = {}): WorkerJobEvent {
  return {
    id: "event-1",
    workerJobId: "job-1",
    eventType: "hermes_device_code",
    payloadJson: {},
    createdAt: NOW,
    ...overrides,
  } as WorkerJobEvent;
}

function buildDeps(overrides: Partial<HermesConnectionRepo> = {}, depsOverrides: Partial<HermesConnectionDeps> = {}): HermesConnectionDeps {
  const repo: HermesConnectionRepo = {
    findConnections: vi.fn().mockResolvedValue([]),
    findConnectionById: vi.fn().mockResolvedValue(null),
    insertConnection: vi.fn(),
    insertConnectionWithJob: vi.fn().mockImplementation(async ({ connection, job }) => ({
      connection: { ...connection, createdAt: NOW, authorizedAt: null },
      job: { ...job, id: "job-1", createdAt: NOW },
    })),
    restartConnectionWithJob: vi.fn().mockResolvedValue(null),
    updateConnection: vi.fn(),
    clearDefaultFor: vi.fn().mockResolvedValue(undefined),
    setDefaultAtomic: vi.fn().mockImplementation(async ({ connectionId, assetType }) => ({
      id: connectionId,
      ...(assetType === "image" ? { defaultForImage: true } : { defaultForVideo: true }),
    })),
    findWorkerById: vi.fn().mockResolvedValue(null),
    findOwnedOnlineWorkers: vi.fn().mockResolvedValue([]),
    insertWorkerJob: vi.fn().mockResolvedValue(buildWorkerJob()),
    findLatestControlJob: vi.fn().mockResolvedValue(null),
    findJobEvents: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return {
    repo,
    settings: {
      getHermesWorkerSettings: vi.fn().mockResolvedValue({
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
        sharedWorkerId: "worker-1",
        webProcessWorkerEnabled: false,
      }),
    },
    flags: {
      getTenantFeatureFlags: vi.fn().mockResolvedValue({ hermesMediaWorker: true }),
    },
    now: () => NOW,
    ...depsOverrides,
  };
}

describe("listHermesConnections", () => {
  it("returns owned server_personal/private_worker rows plus tenant-wide server_shared rows, excluding others' personal rows", async () => {
    const mine = buildConnectionRow({ id: "mine", ownerUserId: USER_ID, scope: "server_personal" });
    const myPrivate = buildConnectionRow({ id: "mine-private", ownerUserId: USER_ID, scope: "private_worker" });
    const shared = buildConnectionRow({ id: "shared-1", ownerUserId: OTHER_USER_ID, scope: "server_shared" });
    const othersPersonal = buildConnectionRow({ id: "not-mine", ownerUserId: OTHER_USER_ID, scope: "server_personal" });

    const deps = buildDeps({
      findConnections: vi.fn().mockResolvedValue([mine, myPrivate, shared, othersPersonal]),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
    });

    const result = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID }, deps);

    expect(result.map((r) => r.id).sort()).toEqual(["mine", "mine-private", "shared-1"].sort());
  });

  it("never surfaces token-like fields", async () => {
    const row = buildConnectionRow();
    const deps = buildDeps({
      findConnections: vi.fn().mockResolvedValue([row]),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
    });
    const result = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID }, deps);
    expect(JSON.stringify(result)).not.toMatch(/token|secret|password|refresh|auth_json/i);
  });

  it("filters out connections whose manifest has no enabled operation for the requested assetType, but keeps unprobed rows", async () => {
    const imageOnly = buildConnectionRow({
      id: "image-only",
      capabilitiesJson: {
        hermesVersion: "1.0",
        probedAt: NOW.toISOString(),
        operations: { "image.generate": { enabled: true } },
        models: { image: ["grok-image"], video: [] },
      },
    });
    const videoOnly = buildConnectionRow({
      id: "video-only",
      capabilitiesJson: {
        hermesVersion: "1.0",
        probedAt: NOW.toISOString(),
        operations: { "video.generate": { enabled: true } },
        models: { image: [], video: ["grok-video"] },
      },
    });
    const unprobed = buildConnectionRow({ id: "unprobed", capabilitiesJson: null });

    const deps = buildDeps({
      findConnections: vi.fn().mockResolvedValue([imageOnly, videoOnly, unprobed]),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
    });

    const imageResult = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID, assetType: "image" }, deps);
    expect(imageResult.map((r) => r.id).sort()).toEqual(["image-only", "unprobed"].sort());

    const unprobedRow = imageResult.find((r) => r.id === "unprobed")!;
    expect(unprobedRow.capabilitySummary.probedAt).toBeNull();
    expect(unprobedRow.capabilitySummary.imageEnabled).toBe(false);

    const videoResult = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID, assetType: "video" }, deps);
    expect(videoResult.map((r) => r.id).sort()).toEqual(["unprobed", "video-only"].sort());
  });

  it("derives assignedWorkerOnline from the injected worker lookup", async () => {
    const row = buildConnectionRow({ assignedWorkerId: "worker-1" });
    const onlineDeps = buildDeps({
      findConnections: vi.fn().mockResolvedValue([row]),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "online", lastSeenAt: NOW })),
    });
    const onlineResult = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID }, onlineDeps);
    expect(onlineResult[0].assignedWorkerOnline).toBe(true);

    const offlineDeps = buildDeps({
      findConnections: vi.fn().mockResolvedValue([row]),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })),
    });
    const offlineResult = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID }, offlineDeps);
    expect(offlineResult[0].assignedWorkerOnline).toBe(false);
  });
});

describe("startHermesConnect", () => {
  const baseParams = {
    tenantId: TENANT_ID,
    userId: USER_ID,
    isAdmin: false,
    scope: "server_personal" as const,
    consentAcknowledged: true,
  };

  it("rejects with typed HERMES_DISABLED when the master flag is off", async () => {
    const deps = buildDeps();
    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: false, sharedPoolEnabled: true, serverPersonalEnabled: true, privateEnabled: true, videoEnabled: true, sharedWorkerId: "worker-1" });
    await expect(startHermesConnect(baseParams, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_DISABLED]") });
  });

  it("rejects with typed HERMES_DISABLED when the server_shared scope flag is off", async () => {
    const deps = buildDeps();
    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: true, sharedPoolEnabled: false, serverPersonalEnabled: true, privateEnabled: true, videoEnabled: true, sharedWorkerId: "worker-1" });
    await expect(startHermesConnect({ ...baseParams, scope: "server_shared", isAdmin: true }, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_DISABLED]") });
  });

  it("rejects with typed HERMES_DISABLED when the server_personal scope flag is off", async () => {
    const deps = buildDeps();
    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: true, sharedPoolEnabled: true, serverPersonalEnabled: false, privateEnabled: true, videoEnabled: true, sharedWorkerId: "worker-1" });
    await expect(startHermesConnect(baseParams, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_DISABLED]") });
  });

  it("rejects with typed HERMES_DISABLED when the private_worker scope flag is off", async () => {
    const deps = buildDeps();
    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: true, sharedPoolEnabled: true, serverPersonalEnabled: true, privateEnabled: false, videoEnabled: true, sharedWorkerId: "worker-1" });
    await expect(startHermesConnect({ ...baseParams, scope: "private_worker" }, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_DISABLED]") });
  });

  it("rejects with typed HERMES_DISABLED when the tenant flag hermesMediaWorker is false", async () => {
    const deps = buildDeps();
    (deps.flags!.getTenantFeatureFlags as any).mockResolvedValue({ hermesMediaWorker: false });
    await expect(startHermesConnect(baseParams, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_DISABLED]") });
  });

  it("rejects when consentAcknowledged is false — no row created, no job enqueued", async () => {
    const deps = buildDeps({ findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()) });
    await expect(startHermesConnect({ ...baseParams, consentAcknowledged: false }, deps)).rejects.toThrow();
    expect(deps.repo!.insertConnectionWithJob).not.toHaveBeenCalled();
  });

  it("rejects scope: server_shared for a non-admin caller", async () => {
    const deps = buildDeps();
    await expect(startHermesConnect({ ...baseParams, scope: "server_shared", isAdmin: false }, deps))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("private_worker: rejects when workerId is not owned by the caller", async () => {
    const deps = buildDeps({
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ registeredByUserId: OTHER_USER_ID })),
    });
    await expect(startHermesConnect({ ...baseParams, scope: "private_worker", workerId: "worker-1" }, deps))
      .rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
  });

  it("private_worker: rejects when the worker is offline", async () => {
    const deps = buildDeps({
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })),
    });
    await expect(startHermesConnect({ ...baseParams, scope: "private_worker", workerId: "worker-1" }, deps))
      .rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
  });

  it("private_worker: rejects an online worker that is not advertising a ready Hermes runtime", async () => {
    const deps = buildDeps({
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({
        capabilitiesJson: {
          hermesMedia: {
            advertised: false,
            doctorOk: true,
            reason: "below_worker_app_version:0.1.133",
          },
        },
      })),
    });

    await expect(startHermesConnect({
      ...baseParams,
      scope: "private_worker",
      workerId: "worker-1",
    }, deps)).rejects.toMatchObject({
      message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]"),
    });
    expect(deps.repo!.insertConnectionWithJob).not.toHaveBeenCalled();
  });

  it("private_worker: auto-selects the worker when the caller owns exactly one online eligible worker", async () => {
    const worker = buildWorkerRow({ id: "worker-auto" });
    const deps = buildDeps({
      findOwnedOnlineWorkers: vi.fn().mockResolvedValue([worker]),
    });
    const result = await startHermesConnect({ ...baseParams, scope: "private_worker" }, deps);
    expect(result.connectionId).toBeTruthy();
    expect(deps.repo!.insertConnectionWithJob).toHaveBeenCalledWith(expect.objectContaining({
      job: expect.objectContaining({ workerId: "worker-auto" }),
    }));
  });

  it("private_worker: fails typed when the caller owns zero or multiple eligible workers", async () => {
    const deps = buildDeps({ findOwnedOnlineWorkers: vi.fn().mockResolvedValue([]) });
    await expect(startHermesConnect({ ...baseParams, scope: "private_worker" }, deps))
      .rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
  });

  it("server scopes: resolves the shared unit from hermes_shared_worker_id and fails typed when absent, never guessing from runtimeType", async () => {
    const deps = buildDeps();
    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({
      enabled: true, sharedPoolEnabled: true, serverPersonalEnabled: true, privateEnabled: true, videoEnabled: true, sharedWorkerId: null,
    });
    await expect(startHermesConnect(baseParams, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
    expect(deps.settings!.getHermesWorkerSettings).toHaveBeenCalled();
    // findWorkerById must never be called with a runtimeType filter key
    for (const call of (deps.repo!.findWorkerById as any).mock.calls) {
      expect(call[0]).not.toHaveProperty("runtimeType");
    }
  });

  it("server scopes: fails typed when the resolved shared worker is offline", async () => {
    const deps = buildDeps({ findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })) });
    await expect(startHermesConnect(baseParams, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
  });

  it("happy path: atomically inserts exactly one pending row (conn_<id> profileReference, consent metadata) with exactly one authorize job in the SAME insertConnectionWithJob call", async () => {
    const worker = buildWorkerRow();
    let capturedArgs: any = null;
    const deps = buildDeps({
      findWorkerById: vi.fn().mockResolvedValue(worker),
      insertConnectionWithJob: vi.fn().mockImplementation(async (args) => {
        capturedArgs = args;
        return {
          connection: { ...args.connection, createdAt: NOW, authorizedAt: null },
          job: { ...args.job, id: "job-1", createdAt: NOW },
        };
      }),
    });

    const result = await startHermesConnect(baseParams, deps);

    expect(deps.repo!.insertConnectionWithJob).toHaveBeenCalledTimes(1);
    expect(capturedArgs.connection.status).toBe("pending");
    expect(capturedArgs.connection.profileReference).toBe(`conn_${result.connectionId}`);
    expect(capturedArgs.connection.metadataJson).toMatchObject({
      consentAcknowledgedAt: NOW.toISOString(),
      consentUserId: USER_ID,
    });

    expect(capturedArgs.job).toMatchObject({
      jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
      workerId: worker.id,
      resourceProfile: "cpu_light",
      inputJson: {
        connectionId: result.connectionId,
        profileReference: `conn_${result.connectionId}`,
        timeoutSeconds: HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS,
      },
      requestedByUserId: USER_ID,
    });
  });

  it("reuses the existing non-terminal pending connection instead of creating duplicates", async () => {
    const existing = buildConnectionRow({
      id: "conn-pending-existing",
      status: "pending",
      scope: "server_personal",
      authorizedAt: null,
    });
    const deps = buildDeps({
      findConnections: vi.fn().mockResolvedValue([existing]),
      findLatestControlJob: vi.fn().mockResolvedValue(buildWorkerJob({
        status: "running",
        capabilityRequirementsJson: { connectionId: existing.id },
      })),
    });

    const result = await startHermesConnect(baseParams, deps);

    expect(result).toEqual({ connectionId: existing.id });
    expect(deps.repo!.insertConnectionWithJob).not.toHaveBeenCalled();
    expect(deps.repo!.findWorkerById).not.toHaveBeenCalled();
  });

  it("reuses an already-authorized connection instead of starting another OAuth flow", async () => {
    const existing = buildConnectionRow({
      id: "conn-authorized-existing",
      status: "authorized",
      scope: "server_personal",
      ownerUserId: USER_ID,
      assignedWorkerId: "worker-1",
      authorizedAt: NOW,
    });
    const deps = buildDeps({
      findConnections: vi.fn().mockResolvedValue([existing]),
    });

    const result = await startHermesConnect(baseParams, deps);

    expect(result).toEqual({ connectionId: existing.id });
    expect(deps.repo!.insertConnectionWithJob).not.toHaveBeenCalled();
    expect(deps.repo!.findWorkerById).not.toHaveBeenCalled();
  });

  it("restarts a reauth-required connection in place instead of returning it or creating a duplicate", async () => {
    const existing = buildConnectionRow({
      id: "conn-needs-reauth",
      status: "reauth_required",
      scope: "server_personal",
      ownerUserId: USER_ID,
      assignedWorkerId: "worker-1",
      authorizedAt: NOW,
      metadataJson: { lastError: "HERMES_REAUTH_REQUIRED", preserved: true },
    });
    const worker = buildWorkerRow();
    const deps = buildDeps({
      findConnections: vi.fn().mockResolvedValue([existing]),
      findWorkerById: vi.fn().mockResolvedValue(worker),
      restartConnectionWithJob: vi.fn().mockImplementation(async (args) => ({
        connection: { ...existing, ...args.connectionValues },
        job: { ...args.job, id: "job-reauth", createdAt: NOW },
      })),
    });

    const result = await startHermesConnect(baseParams, deps);

    expect(result).toEqual({ connectionId: existing.id });
    expect(deps.repo!.restartConnectionWithJob).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID,
      connectionId: existing.id,
      expectedStatuses: ["reauth_required", "error"],
      connectionValues: expect.objectContaining({
        status: "pending",
        assignedWorkerId: worker.id,
        entitlementStatus: null,
        metadataJson: expect.objectContaining({ preserved: true, consentUserId: USER_ID }),
      }),
      job: expect.objectContaining({
        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
        workerId: worker.id,
      }),
    }));
    const reconnectArgs = (deps.repo!.restartConnectionWithJob as any).mock.calls[0][0];
    expect(reconnectArgs.connectionValues.metadataJson).not.toHaveProperty("lastError");
    expect(deps.repo!.insertConnectionWithJob).not.toHaveBeenCalled();
  });

  it("does not reuse an authorized connection assigned to a different explicitly selected private worker", async () => {
    const existing = buildConnectionRow({
      id: "conn-other-worker",
      status: "authorized",
      scope: "private_worker",
      ownerUserId: USER_ID,
      assignedWorkerId: "worker-other",
      authorizedAt: NOW,
    });
    const selectedWorker = buildWorkerRow({ id: "worker-selected" });
    const deps = buildDeps({
      findConnections: vi.fn().mockResolvedValue([existing]),
      findWorkerById: vi.fn().mockResolvedValue(selectedWorker),
    });

    const result = await startHermesConnect({
      ...baseParams,
      scope: "private_worker",
      workerId: selectedWorker.id,
    }, deps);

    expect(result.connectionId).not.toBe(existing.id);
    expect(deps.repo!.insertConnectionWithJob).toHaveBeenCalledTimes(1);
  });
});

describe("buildAuthorizeJobInsert", () => {
  it("carries requiredClaimCapability + capabilityFamilies + connectionId + preferredWorkerId in capabilityRequirementsJson", () => {
    const insert = buildAuthorizeJobInsert({
      tenantId: TENANT_ID,
      connectionId: "conn-1",
      workerId: "worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      requestedByUserId: USER_ID,
      profileReference: "conn_conn-1",
    });
    expect(insert.capabilityRequirementsJson).toMatchObject({
      requiredClaimCapability: "hermes_media",
      capabilityFamilies: ["hermes-media-generation"],
      connectionId: "conn-1",
      preferredWorkerId: "worker-1",
    });
    expect(insert.timeoutSeconds).toBe(HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS);
  });
});

describe("getHermesConnectStatus", () => {
  it("surfaces verificationUrl/userCode/expiresAt from the hermes_device_code event", async () => {
    const row = buildConnectionRow({ status: "pending" });
    const job = buildWorkerJob({ status: "running" });
    const event = buildJobEvent({
      payloadJson: { verificationUrl: "https://x.ai/device", userCode: "ABCD-1234", expiresAt: "2026-06-01T13:00:00.000Z" },
    });
    const deps = buildDeps({
      findConnectionById: vi.fn().mockResolvedValue(row),
      findLatestControlJob: vi.fn().mockResolvedValue(job),
      findJobEvents: vi.fn().mockResolvedValue([event]),
    });

    const result = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
    expect(result).toMatchObject({
      verificationUrl: "https://x.ai/device",
      userCode: "ABCD-1234",
      expiresAt: "2026-06-01T13:00:00.000Z",
    });
  });

  it("turns a legacy raw-only device event into a recoverable error without returning raw OAuth text", async () => {
    const row = buildConnectionRow({ status: "pending" });
    const job = buildWorkerJob({ status: "running" });
    const event = buildJobEvent({
      payloadJson: {
        raw: "To continue:\n1. Open: https://accounts.x.ai/device?user_code=SECRET-CODE",
      },
    });
    const deps = buildDeps({
      findConnectionById: vi.fn().mockResolvedValue(row),
      findLatestControlJob: vi.fn().mockResolvedValue(job),
      findJobEvents: vi.fn().mockResolvedValue([event]),
    });

    const result = await getHermesConnectStatus({
      tenantId: TENANT_ID,
      userId: USER_ID,
      isAdmin: false,
      connectionId: row.id,
    }, deps);

    expect(result).toMatchObject({
      status: "pending",
      verificationUrl: undefined,
      userCode: undefined,
      expiresAt: undefined,
      errorCode: "HERMES_PROCESS_FAILED",
    });
    expect(JSON.stringify(result)).not.toContain("SECRET-CODE");
    expect(JSON.stringify(result)).not.toContain("raw");
  });

  it("maps auth-job failure reasons to typed error codes", async () => {
    const row = buildConnectionRow({ status: "pending" });
    const job = buildWorkerJob({ status: "failed", failureReason: "oauth session expired" });
    let state = { ...row };
    const deps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      findLatestControlJob: vi.fn().mockResolvedValue(job),
      findJobEvents: vi.fn().mockResolvedValue([]),
      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });

    const result = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("HERMES_OAUTH_SESSION_EXPIRED");
  });

  it("maps denied and timeout failure reasons to typed error codes", async () => {
    const deniedRow = buildConnectionRow({ id: "conn-denied", status: "pending" });
    let deniedState = { ...deniedRow };
    const deniedDeps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => deniedState),
      findLatestControlJob: vi.fn().mockResolvedValue(buildWorkerJob({ status: "failed", failureReason: "user denied consent" })),
      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
        deniedState = { ...deniedState, ...values };
        return deniedState;
      }),
    });
    const deniedResult = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: deniedRow.id }, deniedDeps);
    expect(deniedResult.errorCode).toBe("HERMES_OAUTH_DENIED");

    const timeoutRow = buildConnectionRow({ id: "conn-timeout", status: "pending" });
    let timeoutState = { ...timeoutRow };
    const timeoutDeps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => timeoutState),
      findLatestControlJob: vi.fn().mockResolvedValue(buildWorkerJob({ status: "expired" })),
      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
        timeoutState = { ...timeoutState, ...values };
        return timeoutState;
      }),
    });
    const timeoutResult = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: timeoutRow.id }, timeoutDeps);
    expect(timeoutResult.errorCode).toBe("HERMES_TIMEOUT");
  });

  it("lazily settles a terminal-success job (authorized, accountHint, capabilitiesJson, authorizedAt) idempotently", async () => {
    const row = buildConnectionRow({ status: "pending" });
    let state = { ...row };
    const job = buildWorkerJob({
      status: "completed",
      outputJson: { accountHint: "grok-fan", capabilities: { hermesVersion: "1.0", probedAt: NOW.toISOString(), operations: {}, models: { image: [], video: [] } } },
    });
    const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
      state = { ...state, ...values };
      return state;
    });
    const deps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      findLatestControlJob: vi.fn().mockResolvedValue(job),
      updateConnection,
    });

    const first = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
    expect(first.status).toBe("authorized");
    expect(state.accountHint).toBe("grok-fan");
    expect(state.authorizedAt).toEqual(NOW);
    expect(updateConnection).toHaveBeenCalledTimes(1);

    const second = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
    expect(second.status).toBe("authorized");
    expect(updateConnection).toHaveBeenCalledTimes(1); // idempotent — no re-update
  });

  it("lazily settles a terminal-failure job to status: error with the typed reason in metadataJson", async () => {
    const row = buildConnectionRow({ status: "pending" });
    let state = { ...row };
    const deps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      findLatestControlJob: vi.fn().mockResolvedValue(buildWorkerJob({ status: "failed", failureReason: "oauth session expired" })),
      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });

    await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
    expect(state.status).toBe("error");
    expect((state.metadataJson as any).lastError).toBe("HERMES_OAUTH_SESSION_EXPIRED");
  });

  it("enforces ownership: a caller who is neither owner nor (for server_shared) admin gets NOT_FOUND-style rejection", async () => {
    const sharedRow = buildConnectionRow({ scope: "server_shared", ownerUserId: OTHER_USER_ID });
    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(sharedRow) });
    await expect(getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: sharedRow.id }, deps))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    const personalRow = buildConnectionRow({ scope: "server_personal", ownerUserId: OTHER_USER_ID });
    const deps2 = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(personalRow) });
    await expect(getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: personalRow.id }, deps2))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("setHermesDefaultConnection", () => {
  it("delegates to the atomic clear-then-set composite repo method (video untouched)", async () => {
    const row = buildConnectionRow({ id: "conn-b", status: "authorized", ownerUserId: USER_ID });
    const deps = buildDeps({
      findConnectionById: vi.fn().mockResolvedValue(row),
    });

    await setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: row.id, assetType: "image" }, deps);

    expect(deps.repo!.setDefaultAtomic).toHaveBeenCalledTimes(1);
    expect(deps.repo!.setDefaultAtomic).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      userId: USER_ID,
      connectionId: row.id,
      assetType: "image",
    });
    // video's assetType key must never appear in this call
    const call = (deps.repo!.setDefaultAtomic as any).mock.calls[0][0];
    expect(call.assetType).toBe("image");
  });

  it("rejects for connections not visible to the caller", async () => {
    const row = buildConnectionRow({ scope: "server_personal", ownerUserId: OTHER_USER_ID });
    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(row) });
    await expect(setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: row.id, assetType: "image" }, deps))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(deps.repo!.setDefaultAtomic).not.toHaveBeenCalled();
  });

  it("rejects a non-owner setting the default on a server_shared row, even though server_shared is tenant-wide READABLE (defaults are strictly per-owner)", async () => {
    const sharedRow = buildConnectionRow({
      scope: "server_shared",
      status: "authorized",
      ownerUserId: OTHER_USER_ID, // e.g. the admin who created the shared connection
    });
    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(sharedRow) });
    await expect(setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: sharedRow.id, assetType: "image" }, deps))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(deps.repo!.setDefaultAtomic).not.toHaveBeenCalled();
  });

  it("allows the owning admin to set a default on their own server_shared row", async () => {
    const sharedRow = buildConnectionRow({
      scope: "server_shared",
      status: "authorized",
      ownerUserId: USER_ID,
    });
    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(sharedRow) });
    await setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: sharedRow.id, assetType: "video" }, deps);
    expect(deps.repo!.setDefaultAtomic).toHaveBeenCalledWith(expect.objectContaining({ assetType: "video" }));
  });

  it("rejects non-default-eligible statuses (pending, disconnected)", async () => {
    const pendingRow = buildConnectionRow({ status: "pending" });
    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(pendingRow) });
    await expect(setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: pendingRow.id, assetType: "image" }, deps))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const disconnectedRow = buildConnectionRow({ status: "disconnected" });
    const deps2 = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(disconnectedRow) });
    await expect(setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: disconnectedRow.id, assetType: "image" }, deps2))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("disconnectHermesConnection", () => {
  it("enqueues exactly one disconnect job pinned to assignedWorkerId, records disconnectRequestedAt, and does not set status: disconnected immediately", async () => {
    const row = buildConnectionRow();
    let state = { ...row };
    const deps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });

    await disconnectHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);

    expect(deps.repo!.insertWorkerJob).toHaveBeenCalledTimes(1);
    expect(deps.repo!.insertWorkerJob).toHaveBeenCalledWith(expect.objectContaining({
      jobType: "hermes_connection_disconnect",
      workerId: row.assignedWorkerId,
    }));
    expect(state.status).not.toBe("disconnected");
    expect((state.metadataJson as any).disconnectRequestedAt).toBe(NOW.toISOString());
  });

  it("requires admin for server_shared disconnect", async () => {
    const row = buildConnectionRow({ scope: "server_shared", ownerUserId: USER_ID });
    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(row) });
    await expect(disconnectHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("probeHermesConnection", () => {
  it("enqueues one probe job pinned to the assigned worker", async () => {
    const row = buildConnectionRow();
    const deps = buildDeps({
      findConnectionById: vi.fn().mockResolvedValue(row),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
    });
    await probeHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
    expect(deps.repo!.insertWorkerJob).toHaveBeenCalledWith(expect.objectContaining({
      jobType: "hermes_connection_probe",
      workerId: row.assignedWorkerId,
    }));
  });

  it("rejects when the worker is offline", async () => {
    const row = buildConnectionRow();
    const deps = buildDeps({
      findConnectionById: vi.fn().mockResolvedValue(row),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })),
    });
    await expect(probeHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps))
      .rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
  });

  it("requires admin for server_shared probe (consistent with disconnect's admin-only convention)", async () => {
    const row = buildConnectionRow({ scope: "server_shared", ownerUserId: USER_ID });
    const deps = buildDeps({
      findConnectionById: vi.fn().mockResolvedValue(row),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
    });
    await expect(probeHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deps.repo!.insertWorkerJob).not.toHaveBeenCalled();
  });
});

describe("admin ops", () => {
  it("adminSetHermesQuota updates dailyJobQuota on server_shared rows only", async () => {
    const sharedRow = buildConnectionRow({ scope: "server_shared" });
    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(sharedRow) });
    await adminSetHermesQuota({ tenantId: TENANT_ID, connectionId: sharedRow.id, dailyJobQuota: 25 }, deps);
    expect(deps.repo!.updateConnection).toHaveBeenCalledWith(expect.objectContaining({ values: { dailyJobQuota: 25 } }));

    const personalRow = buildConnectionRow({ scope: "server_personal" });
    const deps2 = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(personalRow) });
    await expect(adminSetHermesQuota({ tenantId: TENANT_ID, connectionId: personalRow.id, dailyJobQuota: 25 }, deps2))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("adminDisableHermesConnection marks the row disconnected and enqueues profile cleanup when the worker is online", async () => {
    const row = buildConnectionRow();
    const deps = buildDeps({
      findConnectionById: vi.fn().mockResolvedValue(row),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "online" })),
    });
    await adminDisableHermesConnection({ tenantId: TENANT_ID, connectionId: row.id }, deps);
    expect(deps.repo!.updateConnection).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ status: "disconnected" }) }));
    expect(deps.repo!.insertWorkerJob).toHaveBeenCalledWith(expect.objectContaining({ jobType: "hermes_connection_disconnect" }));
  });

  it("adminDisableHermesConnection skips profile cleanup enqueue when the worker is offline", async () => {
    const row = buildConnectionRow();
    const deps = buildDeps({
      findConnectionById: vi.fn().mockResolvedValue(row),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })),
    });
    await adminDisableHermesConnection({ tenantId: TENANT_ID, connectionId: row.id }, deps);
    expect(deps.repo!.insertWorkerJob).not.toHaveBeenCalled();
  });
});

describe("settleHermesConnectionFromControlJob", () => {
  it("is a no-op for a connection that no longer exists", async () => {
    const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockResolvedValue(null) } };
    await expect(settleHermesConnectionFromControlJob({ connectionId: "missing", job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed" } }, deps)).resolves.toBeUndefined();
  });

  describe("post-authorize auto-probe (regression 2026-08-03)", () => {
    function buildAuthorizeSettlementDeps(repoOverrides: Partial<HermesConnectionRepo> = {}) {
      const row = buildConnectionRow({ status: "pending", assignedWorkerId: "worker-1" });
      let state = { ...row };
      const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      });
      const insertWorkerJob = vi.fn().mockResolvedValue(buildWorkerJob());
      const deps = {
        repo: {
          ...buildDeps().repo!,
          findConnectionById: vi.fn().mockImplementation(async () => state),
          findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "online", lastSeenAt: NOW })),
          updateConnection,
          insertWorkerJob,
          ...repoOverrides,
        },
        // Pin the clock to the fixture's `lastSeenAt`, otherwise the
        // worker-online staleness window rejects the fixed-date fake worker.
        now: () => NOW,
      };
      return { row, deps, insertWorkerJob, getState: () => state };
    }

    it("enqueues a capability probe after a successful authorize (authorize itself returns NO manifest, so capabilitiesJson would stay NULL and the connection would render as unsupported/hidden)", async () => {
      const { row, deps, insertWorkerJob, getState } = buildAuthorizeSettlementDeps();

      await settleHermesConnectionFromControlJob(
        {
          connectionId: row.id,
          job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed" },
        },
        deps,
      );

      expect(getState().status).toBe("authorized");
      expect(insertWorkerJob).toHaveBeenCalledTimes(1);
      expect(insertWorkerJob.mock.calls[0][0]).toMatchObject({
        jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
        tenantId: row.tenantId,
        workerId: "worker-1",
      });
    });

    it("skips the auto-probe when the assigned worker is offline — the connection still settles as authorized", async () => {
      const { row, deps, insertWorkerJob, getState } = buildAuthorizeSettlementDeps({
        findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })),
      });

      await settleHermesConnectionFromControlJob(
        { connectionId: row.id, job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed" } },
        deps,
      );

      expect(getState().status).toBe("authorized");
      expect(insertWorkerJob).not.toHaveBeenCalled();
    });

    it("a probe-enqueue failure never un-authorizes the connection", async () => {
      const { row, deps, getState } = buildAuthorizeSettlementDeps({
        insertWorkerJob: vi.fn().mockRejectedValue(new Error("db down")),
      });

      await expect(
        settleHermesConnectionFromControlJob(
          { connectionId: row.id, job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed" } },
          deps,
        ),
      ).resolves.toBeUndefined();
      expect(getState().status).toBe("authorized");
    });

    it("does NOT enqueue a probe for a FAILED authorize", async () => {
      const { row, deps, insertWorkerJob } = buildAuthorizeSettlementDeps();

      await settleHermesConnectionFromControlJob(
        {
          connectionId: row.id,
          job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "failed", failureReason: "oauth_denied" },
        },
        deps,
      );

      expect(insertWorkerJob).not.toHaveBeenCalled();
    });
  });

  describe("probe failure classification", () => {
    it("auth-invalidation-classified failure -> status: reauth_required + HERMES_REAUTH_REQUIRED in metadataJson.lastError", async () => {
      const row = buildConnectionRow({ status: "authorized" });
      let state = { ...row };
      const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      });
      const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockImplementation(async () => state), updateConnection } };

      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "oauth session revoked — reauth required" },
      }, deps);

      expect(state.status).toBe("reauth_required");
      expect((state.metadataJson as any).lastError).toBe("HERMES_REAUTH_REQUIRED");
    });

    it("entitlement-403-classified failure -> status: entitlement_restricted (mirrors the success-output path)", async () => {
      const row = buildConnectionRow({ status: "authorized" });
      let state = { ...row };
      const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      });
      const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockImplementation(async () => state), updateConnection } };

      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "xAI API returned 403 entitlement forbidden" },
      }, deps);

      expect(state.status).toBe("entitlement_restricted");
      expect(state.entitlementStatus).toBe("restricted");
      expect((state.metadataJson as any).lastError).toBe("HERMES_ENTITLEMENT_RESTRICTED");
    });

    it("other probe failures -> records lastError but leaves status untouched", async () => {
      const row = buildConnectionRow({ status: "authorized" });
      let state = { ...row };
      const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      });
      const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockImplementation(async () => state), updateConnection } };

      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "unexpected process crash" },
      }, deps);

      expect(state.status).toBe("authorized"); // unchanged
      expect((state.metadataJson as any).lastError).toBe("HERMES_PROCESS_FAILED");
    });

    it("probe job timeout (status: expired) -> other outcome with HERMES_TIMEOUT, status untouched", async () => {
      const row = buildConnectionRow({ status: "authorized" });
      let state = { ...row };
      const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      });
      const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockImplementation(async () => state), updateConnection } };

      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "expired" },
      }, deps);

      expect(state.status).toBe("authorized");
      expect((state.metadataJson as any).lastError).toBe("HERMES_TIMEOUT");
    });

    it("is idempotent: a disconnected row is left untouched by a stale probe-failure settlement", async () => {
      const row = buildConnectionRow({ status: "disconnected" });
      const updateConnection = vi.fn();
      const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockResolvedValue(row), updateConnection } };

      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "reauth required" },
      }, deps);

      expect(updateConnection).not.toHaveBeenCalled();
    });
  });

  // Section-04 carry-forward item A: constants-first classification.
  describe("constants-first failure-reason classification (section-04 carry-forward item A)", () => {
    it("auth job: exact 'oauth_session_expired' reason -> HERMES_OAUTH_SESSION_EXPIRED (constants path)", async () => {
      const row = buildConnectionRow({ status: "pending" });
      let state = { ...row };
      const deps = {
        repo: {
          ...buildDeps().repo!,
          findConnectionById: vi.fn().mockImplementation(async () => state),
          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
            state = { ...state, ...values };
            return state;
          }),
        },
      };
      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "failed", failureReason: "oauth_session_expired" },
      }, deps);
      expect((state.metadataJson as any).lastError).toBe("HERMES_OAUTH_SESSION_EXPIRED");
    });

    it("auth job: exact 'oauth_denied' reason -> HERMES_OAUTH_DENIED (constants path)", async () => {
      const row = buildConnectionRow({ status: "pending" });
      let state = { ...row };
      const deps = {
        repo: {
          ...buildDeps().repo!,
          findConnectionById: vi.fn().mockImplementation(async () => state),
          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
            state = { ...state, ...values };
            return state;
          }),
        },
      };
      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "failed", failureReason: "oauth_denied" },
      }, deps);
      expect((state.metadataJson as any).lastError).toBe("HERMES_OAUTH_DENIED");
    });

    it("auth job: legacy substring phrasing still works (fallback path unaffected)", async () => {
      const row = buildConnectionRow({ status: "pending" });
      let state = { ...row };
      const deps = {
        repo: {
          ...buildDeps().repo!,
          findConnectionById: vi.fn().mockImplementation(async () => state),
          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
            state = { ...state, ...values };
            return state;
          }),
        },
      };
      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "failed", failureReason: "oauth session expired" },
      }, deps);
      expect((state.metadataJson as any).lastError).toBe("HERMES_OAUTH_SESSION_EXPIRED");
    });

    it("probe job: exact 'entitlement_restricted' reason -> entitlement_restricted (constants path)", async () => {
      const row = buildConnectionRow({ status: "authorized" });
      let state = { ...row };
      const deps = {
        repo: {
          ...buildDeps().repo!,
          findConnectionById: vi.fn().mockImplementation(async () => state),
          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
            state = { ...state, ...values };
            return state;
          }),
        },
      };
      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "entitlement_restricted" },
      }, deps);
      expect(state.status).toBe("entitlement_restricted");
      expect((state.metadataJson as any).lastError).toBe("HERMES_ENTITLEMENT_RESTRICTED");
    });

    it("probe job: exact 'reauth_required' reason -> reauth_required (constants path)", async () => {
      const row = buildConnectionRow({ status: "authorized" });
      let state = { ...row };
      const deps = {
        repo: {
          ...buildDeps().repo!,
          findConnectionById: vi.fn().mockImplementation(async () => state),
          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
            state = { ...state, ...values };
            return state;
          }),
        },
      };
      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "reauth_required" },
      }, deps);
      expect(state.status).toBe("reauth_required");
      expect((state.metadataJson as any).lastError).toBe("HERMES_REAUTH_REQUIRED");
    });

    it("probe job: exact 'process_failed' reason -> other outcome, status untouched (constants path)", async () => {
      const row = buildConnectionRow({ status: "authorized" });
      let state = { ...row };
      const deps = {
        repo: {
          ...buildDeps().repo!,
          findConnectionById: vi.fn().mockImplementation(async () => state),
          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
            state = { ...state, ...values };
            return state;
          }),
        },
      };
      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "process_failed" },
      }, deps);
      expect(state.status).toBe("authorized");
      expect((state.metadataJson as any).lastError).toBe("HERMES_PROCESS_FAILED");
    });
  });

  // Section-04 carry-forward item B: tenant defense-in-depth.
  describe("tenant defense-in-depth (section-04 carry-forward item B)", () => {
    it("refuses to settle when the supplied job.tenantId does not match the connection row's tenantId", async () => {
      const row = buildConnectionRow({ status: "pending", tenantId: "tenant-owner" });
      const updateConnection = vi.fn();
      const deps = {
        repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockResolvedValue(row), updateConnection },
      };

      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { tenantId: "tenant-attacker", jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed" },
      }, deps);

      expect(updateConnection).not.toHaveBeenCalled();
    });

    it("settles normally when job.tenantId matches the connection row's tenantId", async () => {
      const row = buildConnectionRow({ status: "pending", tenantId: "tenant-owner" });
      let state = { ...row };
      const deps = {
        repo: {
          ...buildDeps().repo!,
          findConnectionById: vi.fn().mockImplementation(async () => state),
          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
            state = { ...state, ...values };
            return state;
          }),
        },
      };

      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { tenantId: "tenant-owner", jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed", outputJson: { accountHint: "grok-fan" } },
      }, deps);

      expect(state.status).toBe("authorized");
    });

    it("settles normally when job.tenantId is omitted (backward-compatible — existing call sites unaffected)", async () => {
      const row = buildConnectionRow({ status: "pending", tenantId: "tenant-owner" });
      let state = { ...row };
      const deps = {
        repo: {
          ...buildDeps().repo!,
          findConnectionById: vi.fn().mockImplementation(async () => state),
          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
            state = { ...state, ...values };
            return state;
          }),
        },
      };

      await settleHermesConnectionFromControlJob({
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed", outputJson: { accountHint: "grok-fan" } },
      }, deps);

      expect(state.status).toBe("authorized");
    });
  });
});

describe("getHermesConnection", () => {
  it("returns the connection with capabilities and never leaks token-like fields", async () => {
    const row = buildConnectionRow();
    const deps = buildDeps({
      findConnectionById: vi.fn().mockResolvedValue(row),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
    });
    const result = await getHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: row.id }, deps);
    expect(result.id).toBe(row.id);
    expect(JSON.stringify(result)).not.toMatch(/token|secret|password|refresh|auth_json/i);
  });
});

describe("getHermesAvailability", () => {
  it("returns enabled: false with flags at defaults", async () => {
    const deps = buildDeps();
    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: false, sharedPoolEnabled: false, serverPersonalEnabled: false, privateEnabled: false, videoEnabled: false, sharedWorkerId: null });
    (deps.flags!.getTenantFeatureFlags as any).mockResolvedValue({ hermesMediaWorker: false });
    const result = await getHermesAvailability({ tenantId: TENANT_ID }, deps);
    expect(result.enabled).toBe(false);
    expect(result.platformEnabled).toBe(false);
    expect(result.tenantEnabled).toBe(false);
    expect(result.scopes).toEqual({ serverShared: false, serverPersonal: false, privateWorker: false });
    expect(result.serverWorker).toMatchObject({
      configured: false,
      online: false,
      ready: false,
      reason: "not_configured",
    });
  });

  it("returns videoEnabled: false when master is on but video is off", async () => {
    const deps = buildDeps({ findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()) });
    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: true, sharedPoolEnabled: true, serverPersonalEnabled: true, privateEnabled: true, videoEnabled: false, sharedWorkerId: "worker-1" });
    const result = await getHermesAvailability({ tenantId: TENANT_ID }, deps);
    expect(result.enabled).toBe(true);
    expect(result.platformEnabled).toBe(true);
    expect(result.tenantEnabled).toBe(true);
    expect(result.videoEnabled).toBe(false);
  });

  it("mirrors the three scope flags AND the tenant/master flags", async () => {
    const deps = buildDeps({ findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()) });
    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: true, sharedPoolEnabled: true, serverPersonalEnabled: false, privateEnabled: true, videoEnabled: true, sharedWorkerId: "worker-1" });
    const result = await getHermesAvailability({ tenantId: TENANT_ID }, deps);
    expect(result.scopes).toEqual({ serverShared: true, serverPersonal: false, privateWorker: true });
    expect(result.serverWorker).toMatchObject({
      configured: true,
      online: true,
      ready: true,
      status: "online",
      hermesVersion: "0.18.2",
    });
  });

  it("fails both server scopes closed when the configured shared worker is offline", async () => {
    const deps = buildDeps({
      findWorkerById: vi.fn().mockResolvedValue(
        buildWorkerRow({ status: "offline" }),
      ),
    });

    const result = await getHermesAvailability({ tenantId: TENANT_ID }, deps);

    expect(result.scopes).toEqual({
      serverShared: false,
      serverPersonal: false,
      privateWorker: true,
    });
    expect(result.serverWorker).toMatchObject({
      configured: true,
      online: false,
      ready: false,
      reason: "offline",
    });
  });

  it("fails both server scopes closed when the worker doctor capability is unavailable", async () => {
    const deps = buildDeps({
      findWorkerById: vi.fn().mockResolvedValue(
        buildWorkerRow({
          capabilitiesJson: {
            hermesMedia: {
              advertised: false,
              doctorOk: false,
              hermesVersion: "0.18.2",
              reason: "doctor failed",
            },
          },
        }),
      ),
    });

    const result = await getHermesAvailability({ tenantId: TENANT_ID }, deps);

    expect(result.scopes.serverShared).toBe(false);
    expect(result.scopes.serverPersonal).toBe(false);
    expect(result.serverWorker).toMatchObject({
      online: true,
      ready: false,
      reason: "capability_unavailable",
      detail: "doctor failed",
    });
  });
});

describe("getHermesAdminOverview", () => {
  it("groups connections per scope with usedToday/queueDepth and a typed settings snapshot", async () => {
    const sharedConn = buildConnectionRow({ id: "conn-shared", scope: "server_shared", dailyJobQuota: 10 });
    const personalConn = buildConnectionRow({ id: "conn-personal", scope: "server_personal", ownerUserId: OTHER_USER_ID });
    const deps = buildDeps({
      findConnections: vi.fn().mockResolvedValue([sharedConn, personalConn]),
      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
    }) as any;
    deps.getUsedToday = vi.fn().mockImplementation(async (connectionId: string) => (connectionId === "conn-shared" ? 4 : 0));
    deps.getQueueDepth = vi.fn().mockImplementation(async (connectionId: string) => (connectionId === "conn-shared" ? 2 : 0));

    const result = await getHermesAdminOverview({ tenantId: TENANT_ID }, deps);

    const sharedGroup = result.scopes.find((group) => group.scope === "server_shared");
    expect(sharedGroup?.connections).toHaveLength(1);
    expect(sharedGroup?.connections[0]).toMatchObject({ id: "conn-shared", usedToday: 4, queueDepth: 2, dailyJobQuota: 10 });

    const personalGroup = result.scopes.find((group) => group.scope === "server_personal");
    expect(personalGroup?.connections).toHaveLength(1);
    expect(personalGroup?.connections[0]).toMatchObject({ id: "conn-personal", usedToday: 0, queueDepth: 0 });

    const privateGroup = result.scopes.find((group) => group.scope === "private_worker");
    expect(privateGroup?.connections).toEqual([]);

    expect(result.settings).toMatchObject({
      hermesWorkerEnabled: true,
      sharedPoolEnabled: true,
      serverPersonalEnabled: true,
      privateEnabled: true,
      videoEnabled: true,
      sharedPoolFeeCredits: 0,
      minHermesVersion: "",
    });
  });

  it("never includes raw system_settings rows — only the typed snapshot fields", async () => {
    const deps = buildDeps({ findConnections: vi.fn().mockResolvedValue([]) }) as any;
    const result = await getHermesAdminOverview({ tenantId: TENANT_ID }, deps);
    expect(Object.keys(result.settings).sort()).toEqual(
      [
        "hermesWorkerEnabled",
        "sharedPoolEnabled",
        "serverPersonalEnabled",
        "privateEnabled",
        "videoEnabled",
        "sharedPoolFeeCredits",
        "minHermesVersion",
      ].sort(),
    );
  });
});

describe("Feature 135 section 12 — connection lifecycle audit events", () => {
  const baseParams = {
    tenantId: TENANT_ID,
    userId: USER_ID,
    isAdmin: false,
    scope: "server_personal" as const,
    consentAcknowledged: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("startHermesConnect emits hermes_connection_connect_started on success", async () => {
    const spy = vi.spyOn(auditLogger, "log").mockImplementation(() => {});
    const deps = buildDeps({ findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()) });

    await startHermesConnect(baseParams, deps);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "hermes_connection_connect_started",
        userId: USER_ID,
        metadata: expect.objectContaining({ tenantId: TENANT_ID, scope: "server_personal" }),
      }),
    );
  });

  it("settleHermesConnectionFromControlJob(authorize, success) emits hermes_connection_authorized", async () => {
    const spy = vi.spyOn(auditLogger, "log").mockImplementation(() => {});
    const row = buildConnectionRow({ status: "pending" });
    let state = row;
    const deps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });

    await settleHermesConnectionFromControlJob(
      { connectionId: row.id, job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed", outputJson: {} } },
      deps,
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_authorized" }));
  });

  it("settleHermesConnectionFromControlJob(probe, entitlementRestricted) emits hermes_connection_entitlement_restricted", async () => {
    const spy = vi.spyOn(auditLogger, "log").mockImplementation(() => {});
    const row = buildConnectionRow({ status: "authorized" });
    let state = row;
    const deps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });

    await settleHermesConnectionFromControlJob(
      {
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "completed", outputJson: { entitlementRestricted: true } },
      },
      deps,
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_entitlement_restricted" }));
  });

  it("settleHermesConnectionFromControlJob(disconnect, success) emits hermes_connection_disconnected", async () => {
    const spy = vi.spyOn(auditLogger, "log").mockImplementation(() => {});
    const row = buildConnectionRow({ status: "authorized" });
    let state = row;
    const deps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });

    await settleHermesConnectionFromControlJob(
      { connectionId: row.id, job: { jobType: HERMES_CONNECTION_DISCONNECT_JOB_TYPE, status: "completed" } },
      deps,
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_disconnected" }));
  });

  it("code review FIX 4: settleHermesConnectionFromControlJob(authorize, failure) emits hermes_connection_reauth_required", async () => {
    const spy = vi.spyOn(auditLogger, "log").mockImplementation(() => {});
    const row = buildConnectionRow({ status: "pending" });
    let state = row;
    const deps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });

    await settleHermesConnectionFromControlJob(
      {
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "failed", failureReason: "oauth_denied" },
      },
      deps,
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_reauth_required" }));
  });

  it("code review FIX 4: settleHermesConnectionFromControlJob(probe, failure classified reauth_required) emits hermes_connection_reauth_required", async () => {
    const spy = vi.spyOn(auditLogger, "log").mockImplementation(() => {});
    const row = buildConnectionRow({ status: "authorized" });
    let state = row;
    const deps = buildDeps({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });

    await settleHermesConnectionFromControlJob(
      {
        connectionId: row.id,
        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "reauth_required" },
      },
      deps,
    );

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_reauth_required" }));
  });

  it("adminDisableHermesConnection emits hermes_connection_revoked", async () => {
    const spy = vi.spyOn(auditLogger, "log").mockImplementation(() => {});
    const row = buildConnectionRow({ status: "authorized", assignedWorkerId: null });
    const deps = buildDeps({
      findConnectionById: vi.fn().mockResolvedValue(row),
      updateConnection: vi.fn().mockResolvedValue({ ...row, status: "disconnected" }),
    });

    await adminDisableHermesConnection({ tenantId: TENANT_ID, connectionId: row.id }, deps);

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_revoked" }));
  });

  it("no connection-lifecycle emission ever includes a device userCode/verificationUrl", async () => {
    const spy = vi.spyOn(auditLogger, "log").mockImplementation(() => {});
    const deps = buildDeps({ findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()) });
    await startHermesConnect(baseParams, deps);

    for (const call of spy.mock.calls) {
      const metadata = (call[0] as { metadata?: Record<string, unknown> }).metadata ?? {};
      expect(JSON.stringify(metadata)).not.toMatch(/userCode|verificationUrl/i);
    }
  });
});
